// Pure spotting logic: is an aircraft arriving, departing, in the pattern…?
// No DOM, no I/O — unit tested in tests/unit/spotting.test.mjs.

import { distanceNm, bearingDeg, angleDiff } from './util/geo.js';

export const STATUS = Object.freeze({
  INBOUND: 'inbound',
  OUTBOUND: 'outbound',
  GROUND: 'ground',
  PATTERN: 'pattern',
  OVERFLIGHT: 'overflight',
  AREA: 'area',
});

export const STATUS_LABEL = {
  inbound: 'INBOUND',
  outbound: 'OUTBOUND',
  ground: 'ON GROUND',
  pattern: 'PATTERN',
  overflight: 'OVERFLIGHT',
  area: 'AREA',
};

export const DEFAULTS = Object.freeze({
  ceilingAgl: 8000, // ft
  descentFpm: -250,
  climbFpm: 250,
  levelBelowAgl: 3000,
  inboundMaxClosing: 60,
  outboundMinClosing: 120,
  outboundNearNm: 3,
  groundNm: 3,
  patternNm: 5,
  patternBelowAgl: 3000,
  minEtaSpeedKt: 30,
});

/**
 * Closing angle: difference between the aircraft's track and the bearing from
 * the aircraft to the airport. 0 = pointing straight at the field, 180 = directly away.
 */
export function closingAngle(track, aircraftLat, aircraftLon, airportLat, airportLon) {
  if (typeof track !== 'number') return null;
  return angleDiff(track, bearingDeg(aircraftLat, aircraftLon, airportLat, airportLon));
}

/** Minutes to reach the field at current ground speed, or null. */
export function etaMinutes(distNm, gsKt, minSpeed = DEFAULTS.minEtaSpeedKt) {
  if (typeof distNm !== 'number' || typeof gsKt !== 'number' || gsKt < minSpeed) return null;
  return (distNm / gsKt) * 60;
}

/**
 * Geometry of an aircraft relative to an airport.
 * @returns {{distNm:number, bearingFromField:number, agl:number|null, closing:number|null}}
 */
export function geometry(ac, airport) {
  const distNm = distanceNm(airport.lat, airport.lon, ac.lat, ac.lon);
  const bearingFromField = bearingDeg(airport.lat, airport.lon, ac.lat, ac.lon);
  const agl = ac.onGround ? 0 : typeof ac.alt === 'number' ? ac.alt - (airport.elevation ?? 0) : null;
  const closing = closingAngle(ac.track, ac.lat, ac.lon, airport.lat, airport.lon);
  return { distNm, bearingFromField, agl, closing };
}

/**
 * Classify one aircraft.
 * @param {object} ac       internal aircraft model (see providers/normalize.js)
 * @param {{lat:number, lon:number, elevation:number, icao?:string}} airport
 * @param {{ceilingAgl?:number}} [opts]
 * @param {{origin?:string, destination?:string}|null} [route] plausible route (ICAO codes)
 */
export function classify(ac, airport, opts = {}, route = null) {
  const o = { ...DEFAULTS, ...opts };
  const g = geometry(ac, airport);
  const vr = typeof ac.vRate === 'number' ? ac.vRate : null;
  const under = g.agl !== null && g.agl < o.ceilingAgl;
  const descending = vr !== null && vr <= o.descentFpm;
  const climbing = vr !== null && vr >= o.climbFpm;
  const level = vr === null || (vr > o.descentFpm && vr < o.climbFpm);
  const icao = (airport.icao || '').toUpperCase();
  let status;
  let reason = '';

  if (ac.onGround && g.distNm <= o.groundNm) {
    status = STATUS.GROUND;
  } else if (!ac.onGround && icao && route?.destination === icao && under) {
    status = STATUS.INBOUND;
    reason = 'route';
  } else if (!ac.onGround && icao && route?.origin === icao && climbing && under) {
    status = STATUS.OUTBOUND;
    reason = 'route';
  } else if (under && !ac.onGround && (descending || (level && g.agl < o.levelBelowAgl)) &&
             g.closing !== null && g.closing < o.inboundMaxClosing) {
    status = STATUS.INBOUND;
  } else if (under && !ac.onGround && climbing &&
             ((g.closing !== null && g.closing > o.outboundMinClosing) || g.distNm <= o.outboundNearNm)) {
    status = STATUS.OUTBOUND;
  } else if (!ac.onGround && g.agl !== null && g.agl < o.patternBelowAgl && g.distNm <= o.patternNm) {
    status = STATUS.PATTERN;
  } else if (!ac.onGround && g.agl !== null && g.agl >= o.ceilingAgl) {
    status = STATUS.OVERFLIGHT;
  } else {
    status = STATUS.AREA;
  }

  const eta = status === STATUS.INBOUND ? etaMinutes(g.distNm, ac.gs, o.minEtaSpeedKt) : null;
  return { ...g, status, eta, reason };
}

/** Count summary for the sheet header. */
export function summarize(items) {
  const s = { inbound: 0, outbound: 0, military: 0, ground: 0, pattern: 0, total: items.length };
  for (const it of items) {
    if (it.status === STATUS.INBOUND) s.inbound++;
    else if (it.status === STATUS.OUTBOUND) s.outbound++;
    else if (it.status === STATUS.GROUND) s.ground++;
    else if (it.status === STATUS.PATTERN) s.pattern++;
    if (it.ac?.military) s.military++;
  }
  return s;
}

/** Sorters for the spotting board lists. Items are { ac, status, distNm, eta, ... }. */
export const sorters = {
  arrivals: (a, b) => (a.eta ?? 1e9) - (b.eta ?? 1e9) || a.distNm - b.distNm,
  departures: (a, b) => (a.departedAt ?? Infinity) === (b.departedAt ?? Infinity)
    ? a.distNm - b.distNm
    : (b.departedAt ?? 0) - (a.departedAt ?? 0),
  nearby: (a, b) => a.distNm - b.distNm,
};
