// Plausible routes from adsb.lol's routeset API, batched, rate limited (shared
// per-host limiter) and cached per callsign for one hour.
//
// Verification note (see PLAN.md): during development the endpoint answered
// HTTP 201 with an empty body. This module parses the historically documented
// shape defensively and turns itself off for the session after repeated empty
// answers, so the rest of the app never depends on it.

import { limiter } from './util/throttle.js';
import { cacheGet, cacheSet, cachePeek } from './util/db.js';
import { fetchJSON, viaProxy } from './providers/index.js';

const HOST = 'api.adsb.lol';
const URL_ = 'https://api.adsb.lol/api/0/routeset';
const TTL = 60 * 60 * 1000;
const BATCH = 25;
const MIN_BATCH_GAP_MS = 10000;

/** Parse one routeset entry into {origin, destination, originIata, destinationIata, plausible}. */
export function parseRoute(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const airports = Array.isArray(entry._airports) ? entry._airports : [];
  const codesIata = typeof entry._airport_codes_iata === 'string' ? entry._airport_codes_iata.split('-') : [];
  const codes = typeof entry.airport_codes === 'string' ? entry.airport_codes.split('-') : [];
  if (airports.length < 2 && codes.length < 2) return null;
  const first = airports[0] ?? {};
  const last = airports[airports.length - 1] ?? {};
  return {
    origin: String(first.icao || codes[0] || '').toUpperCase(),
    destination: String(last.icao || codes[codes.length - 1] || '').toUpperCase(),
    originIata: String(first.iata || codesIata[0] || '').toUpperCase(),
    destinationIata: String(last.iata || codesIata[codesIata.length - 1] || '').toUpperCase(),
    plausible: entry.plausible !== false && entry.plausible !== 0,
  };
}

/** "PHX → IWA" style label (IATA preferred, ICAO fallback). */
export function routeLabel(r) {
  if (!r) return '';
  const a = r.originIata || r.origin;
  const b = r.destinationIata || r.destination;
  return a && b ? `${a} → ${b}` : '';
}

export function createRouteService({ getSettings, onRoutes }) {
  const pending = new Map(); // callsign -> {lat, lng}
  const known = new Map(); // callsign -> route|null (session view of cache)
  let lastBatch = 0;
  let emptyStreak = 0;
  let disabled = false;
  let timer = null;

  function get(callsign) {
    if (!callsign) return undefined;
    if (known.has(callsign)) return known.get(callsign);
    const peek = cachePeek('routes', callsign);
    return peek === undefined ? undefined : peek;
  }

  async function request(list) {
    // adsb.lol sends no CORS headers, so route lookups only work through the proxy.
    const s = getSettings();
    if (disabled || !s.routes || !s.proxyUrl) return;
    for (const ac of list) {
      const cs = ac.callsign;
      if (!cs || cs.length < 3 || known.has(cs) || pending.has(cs)) continue;
      const cached = await cacheGet('routes', cs, TTL);
      if (cached !== undefined) { known.set(cs, cached); continue; }
      pending.set(cs, { callsign: cs, lat: ac.lat, lng: ac.lon });
    }
    schedule();
  }

  function schedule() {
    if (timer || disabled || !pending.size) return;
    const wait = Math.max(0, lastBatch + MIN_BATCH_GAP_MS - Date.now());
    timer = setTimeout(flush, wait);
  }

  async function flush() {
    timer = null;
    const s = getSettings();
    if (disabled || !s.routes || !pending.size) return;
    const planes = [...pending.values()].slice(0, BATCH);
    for (const p of planes) pending.delete(p.callsign);
    lastBatch = Date.now();
    try {
      const json = await limiter.run(HOST, () => fetchJSON(viaProxy(URL_, s.proxyUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planes }),
      }));
      const arr = Array.isArray(json) ? json : [];
      if (!arr.length) {
        emptyStreak++;
        if (emptyStreak >= 3) disabled = true;
      } else {
        emptyStreak = 0;
      }
      const found = new Map();
      for (const e of arr) {
        const cs = String(e?.callsign || '').trim().toUpperCase();
        const r = parseRoute(e);
        if (cs) found.set(cs, r);
      }
      for (const p of planes) {
        const r = found.get(p.callsign) ?? null;
        known.set(p.callsign, r);
        // Only cache definitive answers; an empty response body says nothing.
        if (arr.length) cacheSet('routes', p.callsign, r);
      }
      if (found.size) onRoutes?.();
    } catch {
      emptyStreak++;
      if (emptyStreak >= 3) disabled = true;
    }
    schedule();
  }

  return {
    get,
    request,
    get disabled() { return disabled; },
  };
}
