// Live position feed: provider selection with fallback, optional proxy, global
// per-host rate limiting, exponential backoff and visibility-aware polling.

import airplaneslive from './airplaneslive.js';
import adsblol from './adsblol.js';
import adsbfi from './adsbfi.js';
import { normalizeResponse } from './normalize.js';
import { limiter, Backoff } from '../util/throttle.js';

export const PROVIDERS = { airplaneslive, adsblol, adsbfi };
export const AUTO_ORDER = ['airplaneslive', 'adsblol', 'adsbfi'];
export const PROXY_HOSTS = [airplaneslive.host, adsblol.host, adsbfi.host];

const TIMEOUT_MS = 8000;

/** Route a provider URL through the user's proxy: https://proxy/api.adsb.lol/v2/... */
export function viaProxy(url, proxyUrl) {
  if (!proxyUrl) return url;
  return `${proxyUrl.replace(/\/+$/, '')}/${url.replace(/^https?:\/\//, '')}`;
}

export class FetchError extends Error {
  constructor(message, { status = 0, kind = 'http', retryAfterMs } = {}) {
    super(message);
    this.status = status;
    this.kind = kind; // 'http' | 'network' | 'timeout' | 'parse'
    this.retryAfterMs = retryAfterMs;
  }
}

/** fetch + timeout + JSON, with errors classified for the status UI. */
export async function fetchJSON(url, init = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, { ...init, signal: ctrl.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
  } catch (err) {
    clearTimeout(timer);
    if (err?.name === 'AbortError') throw new FetchError('timed out', { kind: 'timeout' });
    // A TypeError here is how browsers report both offline and CORS rejections.
    throw new FetchError('network/CORS error', { kind: 'network' });
  }
  clearTimeout(timer);
  if (!res.ok) {
    const ra = Number(res.headers.get('retry-after'));
    throw new FetchError(`HTTP ${res.status}`, {
      status: res.status,
      retryAfterMs: Number.isFinite(ra) && ra > 0 ? ra * 1000 : undefined,
    });
  }
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new FetchError('invalid JSON', { kind: 'parse', status: res.status });
  }
}

/**
 * @param {object} o
 * @param {() => object} o.getSettings
 * @param {(payload:{aircraft:object[], now:number, provider:string}) => void} o.onData
 * @param {(status:object) => void} o.onStatus
 * @param {object} [o.demo]  demo source with next() → {now, ac}
 */
export function createFeed({ getSettings, onData, onStatus, demo = null, limiterImpl = limiter }) {
  const backoff = new Backoff({ baseMs: 2000, maxMs: 120000 });
  let timer = null;
  let running = false;
  let paused = false;
  let inFlight = false;
  let lastOk = 0;

  const status = (s) => onStatus({ at: Date.now(), lastOk, ...s });

  async function pollOnce() {
    const s = getSettings();
    const { lat, lon } = s.airport;
    const nm = Math.min(250, s.radiusNm + 5); // a little margin to see traffic entering the radius

    if (demo) {
      const frame = demo.next();
      lastOk = Date.now();
      onData({ ...normalizeResponse(frame, 'demo', lastOk), provider: 'demo', reset: frame.reset });
      status({ state: 'fresh', provider: 'Demo data', message: 'Replaying recorded traffic' });
      return 0;
    }

    const order = s.provider === 'auto' ? AUTO_ORDER : [s.provider];
    const errors = [];
    for (let i = 0; i < order.length; i++) {
      const p = PROVIDERS[order[i]];
      if (!p) continue;
      if (order.length > 1 && backoff.blocked(p.id)) continue;
      if (order.length === 1 && backoff.blocked(p.id)) return backoff.remaining(p.id);
      try {
        const json = await limiterImpl.run(p.host, () => fetchJSON(viaProxy(p.url(lat, lon, nm), s.proxyUrl)));
        backoff.succeed(p.id);
        lastOk = Date.now();
        onData({ ...normalizeResponse(json, p.id, lastOk), provider: p.id });
        status({ state: 'fresh', provider: p.name, providerId: p.id, message: '' });
        return 0;
      } catch (err) {
        backoff.fail(p.id, err.retryAfterMs ?? (err.status === 429 ? 10000 : undefined));
        errors.push({ provider: p, err });
        const next = order.slice(i + 1).map((id) => PROVIDERS[id]).find((q) => q && !backoff.blocked(q.id));
        if (next) status({ state: 'delayed', provider: p.name, message: `${p.name} not responding, trying ${next.name}` });
      }
    }

    // Everything failed or is backing off.
    const corsLike = errors.length > 0 && errors.every((e) => e.err.kind === 'network');
    let message;
    if (corsLike && !s.proxyUrl) {
      message = navigator.onLine === false
        ? 'You appear to be offline'
        : 'Browser blocked the request (CORS). Add a proxy in Settings or try Demo mode.';
    } else if (errors.some((e) => e.err.status === 429)) {
      message = 'Rate limited by provider — backing off';
    } else if (errors.length) {
      const e = errors[errors.length - 1];
      message = `${e.provider.name}: ${e.err.message}. Retrying…`;
    } else {
      message = 'All providers are backing off. Retrying…';
    }
    const waits = order.map((id) => backoff.remaining(id)).filter((ms) => ms > 0);
    status({
      state: lastOk && Date.now() - lastOk < 30000 ? 'delayed' : 'error',
      provider: errors[0]?.provider.name ?? '',
      message,
      cors: corsLike && !s.proxyUrl,
    });
    return waits.length ? Math.min(...waits) : 0;
  }

  async function loop() {
    timer = null;
    if (!running || paused || inFlight) return;
    inFlight = true;
    const started = Date.now();
    let extraWait = 0;
    try {
      extraWait = await pollOnce();
    } catch (err) {
      console.warn('[feed] poll failed', err);
    } finally {
      inFlight = false;
    }
    if (!running || paused) return;
    const interval = Math.max(2, getSettings().pollSec) * 1000;
    const wait = Math.max(interval - (Date.now() - started), extraWait, 250);
    timer = setTimeout(loop, wait);
  }

  return {
    start() {
      if (running) return;
      running = true;
      paused = false;
      loop();
    },
    stop() {
      running = false;
      clearTimeout(timer);
      timer = null;
    },
    pause() {
      if (paused) return;
      paused = true;
      clearTimeout(timer);
      timer = null;
      status({ state: 'paused', message: 'Paused while in background' });
    },
    resume() {
      if (!paused) return;
      paused = false;
      if (running) loop();
    },
    /** Poll again right away (e.g. after the airport changed). */
    refresh() {
      if (!running || paused) return;
      clearTimeout(timer);
      loop();
    },
    get paused() { return paused; },
    get running() { return running; },
    backoff,
  };
}
