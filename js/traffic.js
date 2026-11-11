// In-memory traffic model: one track per aircraft with its latest normalised
// report, classification, watchlist status, trail and animation state.

import { classify } from './spotting.js';
import { matchReason } from './watchlist.js';
import { targetPosition } from './map/animation.js';
import { distanceNm } from './util/geo.js';

export const FADE_AFTER_MS = 30000;
export const REMOVE_AFTER_MS = 60000;
const SNAP_NM = 3;

export function createTraffic() {
  /** @type {Map<string, any>} */
  const tracks = new Map();
  let batches = 0;

  /**
   * Apply a fresh batch from the feed.
   * @returns {{entered: object[]}} watchlist matches that newly entered the radius
   */
  function update({ aircraft, reset }, ctx) {
    const now = Date.now();
    const { airport, settings, routeFor } = ctx;
    if (reset) for (const t of tracks.values()) { t.trail = []; t.blend = null; t.render = null; }
    const entered = [];
    const seen = new Set();
    batches++;

    for (const ac of aircraft) {
      seen.add(ac.hex);
      let t = tracks.get(ac.hex);
      if (!t) {
        t = { hex: ac.hex, firstSeen: now, trail: [], render: null, blend: null, departedAt: null, watchedInRadius: false };
        tracks.set(ac.hex, t);
      }
      const prev = t.ac;
      // Ignore out-of-order / duplicate reports.
      if (prev && ac.posTime < prev.posTime - 1000) continue;

      // Animation: remember where we are drawn now so we can ease to the new truth.
      if (t.render && !reset) {
        const [tLat, tLon] = targetPosition(ac, now);
        const gap = distanceNm(t.render.lat, t.render.lon, tLat, tLon);
        t.blend = gap > SNAP_NM ? null : {
          t: now,
          dLat: t.render.lat - tLat,
          dLon: t.render.lon - tLon,
          dRot: signedDelta(ac.heading ?? 0, t.render.rot),
        };
      }
      t.ac = ac;
      t.lastUpdate = now;

      // Trail of reported positions.
      const last = t.trail[t.trail.length - 1];
      if (!last || last[0] !== ac.lon || last[1] !== ac.lat) {
        t.trail.push([ac.lon, ac.lat, ac.onGround ? -1 : (ac.alt ?? 0), ac.posTime]);
      }
      const cutoff = now - settings.trailMinutes * 60000;
      while (t.trail.length && t.trail[0][3] < cutoff) t.trail.shift();

      const route = routeFor?.(ac.callsign) ?? null;
      t.route = route;
      t.spot = classify(ac, airport, { ceilingAgl: settings.ceilingAgl }, route);
      t.inRadius = t.spot.distNm <= settings.radiusNm;

      // Departure time: ground → air transition, or first seen as outbound.
      if (prev?.onGround && !ac.onGround) t.departedAt = now;
      else if (!t.departedAt && t.spot.status === 'outbound') t.departedAt = now;
      if (ac.onGround) t.departedAt = null;

      const reason = matchReason(ac, settings.watchlist);
      t.watch = reason;
      const watchedNow = !!reason && t.inRadius;
      // The very first batch isn't "entering" — it's what was already there.
      if (watchedNow && !t.watchedInRadius && batches > 1) entered.push(t);
      t.watchedInRadius = watchedNow;
    }

    prune(now);
    return { entered, firstBatch: batches === 1 };
  }

  /** Re-run classification (airport/ceiling/watchlist changed) without new data. */
  function reclassify(ctx) {
    const { airport, settings, routeFor } = ctx;
    for (const t of tracks.values()) {
      if (!t.ac) continue;
      t.route = routeFor?.(t.ac.callsign) ?? null;
      t.spot = classify(t.ac, airport, { ceilingAgl: settings.ceilingAgl }, t.route);
      t.inRadius = t.spot.distNm <= settings.radiusNm;
      t.watch = matchReason(t.ac, settings.watchlist);
      t.watchedInRadius = !!t.watch && t.inRadius;
    }
  }

  function prune(now = Date.now()) {
    for (const [hex, t] of tracks) {
      if (now - t.ac.posTime > REMOVE_AFTER_MS) tracks.delete(hex);
    }
  }

  function clear() {
    tracks.clear();
    batches = 0;
  }

  return { tracks, update, reclassify, prune, clear };
}

/** Signed smallest rotation from a to b, degrees (-180..180]. */
export function signedDelta(a, b) {
  const d = ((((b - a) % 360) + 540) % 360) - 180;
  return d === -180 ? 180 : d;
}
