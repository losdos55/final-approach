// Converts any readsb/tar1090-style provider response into the single internal
// aircraft model used everywhere else in the app. Nothing outside js/providers
// should read provider-specific field names.

import { classifyType, typeName } from '../data/types.js';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : '');

/**
 * @typedef {Object} Aircraft
 * @property {string} hex        lower-case ICAO 24-bit address (may start with "~" for TIS-B)
 * @property {string} callsign
 * @property {string} reg
 * @property {string} type       ICAO type designator, upper case
 * @property {string} desc       human readable type description
 * @property {string} operator
 * @property {string} year
 * @property {boolean} military
 * @property {string} category   ADS-B emitter category (A0…C7)
 * @property {string} cls        silhouette class
 * @property {number} lat
 * @property {number} lon
 * @property {boolean} onGround
 * @property {number|null} alt   best barometric altitude in ft (null if unknown; 0 if on ground is not assumed)
 * @property {number|null} altGeom
 * @property {number|null} gs    ground speed, kt
 * @property {number|null} track degrees true
 * @property {number|null} heading true heading if available, else track
 * @property {number|null} vRate vertical rate, fpm (baro preferred)
 * @property {string} squawk
 * @property {string} emergency
 * @property {number} posTime    epoch ms of the position report
 * @property {string} source
 */

/** Normalise one aircraft object. Returns null when it has no usable position. */
export function normalizeAircraft(a, nowMs, source) {
  const lat = num(a.lat) ?? num(a.lastPosition?.lat);
  const lon = num(a.lon) ?? num(a.lastPosition?.lon);
  if (lat === null || lon === null || !a.hex) return null;
  const onGround = a.alt_baro === 'ground';
  const military = (Number(a.dbFlags) & 1) === 1;
  const type = str(a.t).toUpperCase();
  const category = str(a.category).toUpperCase();
  const seenPos = num(a.seen_pos) ?? num(a.lastPosition?.seen_pos) ?? num(a.seen) ?? 0;
  const track = num(a.track) ?? num(a.true_heading) ?? num(a.mag_heading);
  return {
    hex: String(a.hex).toLowerCase(),
    callsign: str(a.flight).toUpperCase(),
    reg: str(a.r).toUpperCase(),
    type,
    desc: str(a.desc) || typeName(type) || '',
    operator: str(a.ownOp),
    year: str(String(a.year ?? '')),
    military,
    category,
    cls: classifyType(type, category, military),
    lat,
    lon,
    onGround,
    alt: onGround ? null : (num(a.alt_baro) ?? num(a.alt_geom)),
    altGeom: num(a.alt_geom),
    gs: num(a.gs),
    track,
    heading: num(a.true_heading) ?? track,
    vRate: num(a.baro_rate) ?? num(a.geom_rate),
    squawk: str(a.squawk),
    emergency: str(a.emergency) && a.emergency !== 'none' ? str(a.emergency) : '',
    posTime: nowMs - seenPos * 1000,
    source,
  };
}

/**
 * Normalise a whole response. adsb.lol uses `ac`; adsb.fi's point endpoint uses
 * `aircraft`; `now` is seconds (adsb.fi, float) or milliseconds (adsb.lol).
 */
export function normalizeResponse(json, source, receivedAt = Date.now()) {
  const list = Array.isArray(json?.ac) ? json.ac : Array.isArray(json?.aircraft) ? json.aircraft : [];
  let now = Number(json?.now);
  if (!Number.isFinite(now)) now = receivedAt;
  else if (now < 1e12) now *= 1000; // seconds → ms
  // Clamp a server clock that's far off from ours; we only use it for age.
  const skew = receivedAt - now;
  const base = Math.abs(skew) > 120000 ? receivedAt : now;
  const aircraft = [];
  for (const a of list) {
    const n = normalizeAircraft(a, base, source);
    if (n) aircraft.push(n);
  }
  return { now: base, aircraft };
}
