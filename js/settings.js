// Settings schema, defaults, migration, validation, persistence, export/import.
// Everything stays on the device (localStorage, with an in-memory fallback).

import { storage } from './util/storage.js';

export const SCHEMA_VERSION = 2;
export const STORAGE_KEY = 'final-approach.settings';

export const DEFAULT_AIRPORT = Object.freeze({
  ident: 'KIWA',
  icao: 'KIWA',
  iata: 'AZA',
  name: 'Phoenix-Mesa Gateway Airport',
  municipality: 'Mesa',
  lat: 33.3078,
  lon: -111.6556,
  elevation: 1384,
  custom: false,
});

export function defaults() {
  return {
    version: SCHEMA_VERSION,
    airport: { ...DEFAULT_AIRPORT },
    radiusNm: 15,
    ceilingAgl: 8000,
    units: 'imperial', // 'imperial' (ft/kt/nm) | 'metric'
    pollSec: 5,
    provider: 'auto', // 'auto' | 'airplaneslive' | 'adsblol' | 'adsbfi'
    proxyUrl: '',
    mapStyle: 'dark', // 'dark' | 'light' | 'satellite'
    labels: true,
    trailsAll: false,
    trailMinutes: 10,
    photoBubbles: true, // photo bubbles for watchlist matches
    chime: true,
    muted: false,
    wakeLock: false,
    theme: 'system', // 'system' | 'dark' | 'light'
    filter: 'all',
    hideGround: false,
    routes: true,
    apiKeys: {},
    watchlist: {
      types: [],
      regs: [],
      callsigns: [],
      allMilitary: true,
    },
  };
}

const clamp = (v, lo, hi, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};
const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback);
const bool = (v, fallback) => (typeof v === 'boolean' ? v : fallback);
const strList = (v) => (Array.isArray(v)
  ? [...new Set(v.filter((x) => typeof x === 'string').map((x) => x.trim().toUpperCase()).filter(Boolean))]
  : []);

/**
 * Upgrade any older settings object to the current schema. Pure function.
 * v0: unversioned prototype keys ({icao, radius, metric})
 * v1: { version:1, airportIcao, airportLat, airportLon, airportElev, radius, ceiling, metric,
 *       pollMs, watchTypes, militaryWatch, style }
 */
export function migrate(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaults();
  let s = { ...raw };
  let v = Number(s.version) || 0;

  if (v === 0) {
    s = {
      version: 1,
      airportIcao: s.icao,
      radius: s.radius,
      metric: s.metric,
    };
    v = 1;
  }
  if (v === 1) {
    const d = defaults();
    const hasCoords = Number.isFinite(Number(s.airportLat)) && Number.isFinite(Number(s.airportLon));
    s = {
      ...d,
      version: 2,
      airport: hasCoords
        ? {
          ...d.airport,
          ident: s.airportIcao || 'CUSTOM',
          icao: s.airportIcao || '',
          iata: '',
          name: s.airportIcao || 'Custom location',
          municipality: '',
          lat: Number(s.airportLat),
          lon: Number(s.airportLon),
          elevation: Number(s.airportElev) || 0,
          custom: !s.airportIcao,
        }
        : d.airport,
      radiusNm: s.radius ?? d.radiusNm,
      ceilingAgl: s.ceiling ?? d.ceilingAgl,
      units: s.metric ? 'metric' : 'imperial',
      pollSec: s.pollMs ? s.pollMs / 1000 : d.pollSec,
      mapStyle: s.style ?? d.mapStyle,
      watchlist: {
        ...d.watchlist,
        types: s.watchTypes ?? [],
        allMilitary: s.militaryWatch ?? true,
      },
    };
    v = 2;
  }
  // Future versions: add `if (v === 2) { … v = 3; }` blocks here.
  return validate(s);
}

/** Coerce every field into range; unknown keys are dropped. */
export function validate(s) {
  const d = defaults();
  const a = s.airport && typeof s.airport === 'object' ? s.airport : {};
  const lat = clamp(a.lat, -90, 90, NaN);
  const lon = clamp(a.lon, -180, 180, NaN);
  const airport = Number.isFinite(lat) && Number.isFinite(lon)
    ? {
      ident: String(a.ident || a.icao || 'CUSTOM').slice(0, 12),
      icao: String(a.icao || '').toUpperCase().slice(0, 4),
      iata: String(a.iata || '').toUpperCase().slice(0, 3),
      name: String(a.name || 'Custom location').slice(0, 120),
      municipality: String(a.municipality || '').slice(0, 80),
      lat,
      lon,
      elevation: clamp(a.elevation, -1500, 15000, 0),
      custom: !!a.custom,
    }
    : d.airport;
  const w = s.watchlist && typeof s.watchlist === 'object' ? s.watchlist : {};
  const apiKeys = {};
  if (s.apiKeys && typeof s.apiKeys === 'object') {
    for (const [k, val] of Object.entries(s.apiKeys)) {
      if (typeof val === 'string' && k.length <= 64) apiKeys[k] = val.slice(0, 512);
    }
  }
  let proxyUrl = typeof s.proxyUrl === 'string' ? s.proxyUrl.trim() : '';
  if (proxyUrl && !/^https:\/\/|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(proxyUrl + '/')) proxyUrl = '';
  return {
    version: SCHEMA_VERSION,
    airport,
    radiusNm: Math.round(clamp(s.radiusNm, 5, 50, d.radiusNm)),
    ceilingAgl: Math.round(clamp(s.ceilingAgl, 1000, 45000, d.ceilingAgl) / 500) * 500,
    units: oneOf(s.units, ['imperial', 'metric'], d.units),
    pollSec: clamp(s.pollSec, 2, 60, d.pollSec),
    provider: oneOf(s.provider, ['auto', 'airplaneslive', 'adsblol', 'adsbfi'], d.provider),
    proxyUrl,
    mapStyle: oneOf(s.mapStyle, ['dark', 'light', 'satellite'], d.mapStyle),
    labels: bool(s.labels, d.labels),
    trailsAll: bool(s.trailsAll, d.trailsAll),
    trailMinutes: Math.round(clamp(s.trailMinutes, 1, 60, d.trailMinutes)),
    photoBubbles: bool(s.photoBubbles, d.photoBubbles),
    chime: bool(s.chime, d.chime),
    muted: bool(s.muted, d.muted),
    wakeLock: bool(s.wakeLock, d.wakeLock),
    theme: oneOf(s.theme, ['system', 'dark', 'light'], d.theme),
    filter: oneOf(s.filter, ['all', 'military', 'watchlist', 'arrivals', 'departures', 'helicopters'], d.filter),
    hideGround: bool(s.hideGround, d.hideGround),
    routes: bool(s.routes, d.routes),
    apiKeys,
    watchlist: {
      types: strList(w.types),
      regs: strList(w.regs),
      callsigns: strList(w.callsigns),
      allMilitary: bool(w.allMilitary, true),
    },
  };
}

export function loadSettings(store = storage) {
  const raw = store.getJSON(STORAGE_KEY);
  return raw ? migrate(raw) : defaults();
}

export function saveSettings(s, store = storage) {
  store.setJSON(STORAGE_KEY, validate(s));
}

/** Serialise for the "Export settings" file. */
export function exportSettings(s) {
  return JSON.stringify({ app: 'final-approach', exportedAt: new Date().toISOString(), settings: validate(s) }, null, 2);
}

/** Parse an exported file (or a bare settings object). Throws on invalid JSON. */
export function importSettings(text) {
  const parsed = JSON.parse(text);
  const s = parsed && parsed.app === 'final-approach' && parsed.settings ? parsed.settings : parsed;
  if (!s || typeof s !== 'object') throw new Error('Not a settings file');
  return migrate(s);
}
