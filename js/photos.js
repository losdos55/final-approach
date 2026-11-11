// Aircraft photos from the planespotters.net public API.
//
// Terms: show the photographer credit and link to the photo page on
// planespotters.net wherever a photo appears; never download or re-host the
// image (we display their URLs directly). Lookups are cached for 7 days
// (including "no photo") and queued at <= 1 request/second.

import { limiter } from './util/throttle.js';
import { cacheGet, cacheSet, cachePeek } from './util/db.js';
import { fetchJSON } from './providers/index.js';

const HOST = 'api.planespotters.net';
const TTL = 7 * 24 * 60 * 60 * 1000;
const NONE = { none: true };

/** Turn the API response into the small record we keep. */
export function parsePhotos(json) {
  const p = Array.isArray(json?.photos) ? json.photos[0] : null;
  if (!p || !p.thumbnail?.src) return NONE;
  return {
    thumb: p.thumbnail.src,
    large: p.thumbnail_large?.src || p.thumbnail.src,
    link: p.link || 'https://www.planespotters.net/',
    photographer: p.photographer || 'Unknown',
  };
}

export function createPhotoService({ onPhoto } = {}) {
  const queue = []; // [{hex, reg, priority}]
  const inflight = new Map(); // hex -> promise
  const waiters = new Map(); // hex -> [resolve]
  let running = false;

  /** Synchronous view of what we know: undefined (unknown), NONE, or a photo. */
  function peek(hex) {
    return cachePeek('photos', hex);
  }

  /**
   * Request a photo. priority: 0 = selected (front of queue), 1 = watchlist/bubbles, 2 = lists.
   * Resolves with the photo record or {none:true}.
   */
  function get(ac, priority = 1) {
    const hex = ac.hex;
    const known = peek(hex);
    if (known !== undefined) return Promise.resolve(known);
    if (inflight.has(hex)) {
      if (priority === 0) bump(hex);
      return inflight.get(hex);
    }
    const promise = (async () => {
      const cached = await cacheGet('photos', hex, TTL);
      if (cached !== undefined) return cached;
      return new Promise((resolve) => {
        waiters.set(hex, resolve);
        const item = { hex, reg: ac.reg, priority };
        if (priority === 0) queue.unshift(item);
        else queue.push(item);
        queue.sort((a, b) => a.priority - b.priority);
        pump();
      });
    })().finally(() => inflight.delete(hex));
    inflight.set(hex, promise);
    return promise;
  }

  function bump(hex) {
    const i = queue.findIndex((q) => q.hex === hex);
    if (i > 0) {
      const [item] = queue.splice(i, 1);
      item.priority = 0;
      queue.unshift(item);
    }
  }

  /** Drop low-priority work that's no longer relevant (e.g. list scrolled). */
  function prune(keepHexes) {
    for (let i = queue.length - 1; i >= 0; i--) {
      const q = queue[i];
      if (q.priority > 0 && !keepHexes.has(q.hex)) {
        queue.splice(i, 1);
        waiters.get(q.hex)?.(undefined);
        waiters.delete(q.hex);
      }
    }
  }

  async function lookup(item) {
    let result = NONE;
    // Hexes starting with "~" are non-ICAO (TIS-B / synthetic) and can't be looked up.
    if (!item.hex.startsWith('~')) {
      const json = await limiter.run(HOST, () => fetchJSON(`https://${HOST}/pub/photos/hex/${encodeURIComponent(item.hex)}`));
      result = parsePhotos(json);
    }
    if (result.none && item.reg && /^[A-Z0-9-]{2,10}$/.test(item.reg) && !item.reg.startsWith('SYNTH')) {
      const json = await limiter.run(HOST, () => fetchJSON(`https://${HOST}/pub/photos/reg/${encodeURIComponent(item.reg)}`));
      result = parsePhotos(json);
    }
    return result;
  }

  async function pump() {
    if (running) return;
    running = true;
    while (queue.length) {
      const item = queue.shift();
      let result;
      try {
        result = await lookup(item);
        await cacheSet('photos', item.hex, result);
      } catch (err) {
        // Don't cache transient failures; just report "nothing yet".
        result = err?.status === 404 ? NONE : undefined;
        if (result) await cacheSet('photos', item.hex, result);
        if (err?.status === 429) await new Promise((r) => setTimeout(r, 5000));
      }
      waiters.get(item.hex)?.(result);
      waiters.delete(item.hex);
      if (result) onPhoto?.(item.hex, result);
    }
    running = false;
  }

  return { get, peek, prune };
}

/** Credit line HTML (escaped) with link to the photo page. */
export function creditHTML(photo, esc) {
  if (!photo || photo.none) return '';
  return `Photo: <a href="${esc(photo.link)}" target="_blank" rel="noopener">${esc(photo.photographer)} / planespotters.net</a>`;
}
