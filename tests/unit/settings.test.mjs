import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaults, migrate, validate, loadSettings, saveSettings, exportSettings, importSettings,
  SCHEMA_VERSION, STORAGE_KEY,
} from '../../js/settings.js';
import { createStorage } from '../../js/util/storage.js';
import { addPreset, matchReason, PRESETS } from '../../js/watchlist.js';

function memoryBackend() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

test('defaults are valid and current', () => {
  const d = defaults();
  assert.equal(d.version, SCHEMA_VERSION);
  assert.deepEqual(validate(d), d);
  assert.equal(d.airport.icao, 'KIWA');
  assert.equal(d.airport.elevation, 1384);
  assert.equal(d.radiusNm, 15);
  assert.equal(d.pollSec, 5);
  assert.equal(d.watchlist.allMilitary, true);
});

test('garbage input migrates to defaults', () => {
  assert.deepEqual(migrate(null), defaults());
  assert.deepEqual(migrate('nope'), defaults());
  assert.deepEqual(migrate([]), defaults());
});

test('v0 → current', () => {
  const s = migrate({ icao: 'KPHX', radius: 30, metric: true });
  assert.equal(s.version, SCHEMA_VERSION);
  assert.equal(s.radiusNm, 30);
  assert.equal(s.units, 'metric');
  assert.equal(s.airport.icao, 'KIWA', 'v0 had no coordinates, so the default airport is kept');
});

test('v1 → current keeps airport, units, poll, watchlist', () => {
  const s = migrate({
    version: 1, airportIcao: 'KLUF', airportLat: 33.535, airportLon: -112.383, airportElev: 1085,
    radius: 25, ceiling: 10000, metric: false, pollMs: 3000, watchTypes: ['f35', 'F16'], militaryWatch: false, style: 'satellite',
  });
  assert.equal(s.airport.icao, 'KLUF');
  assert.equal(s.airport.elevation, 1085);
  assert.equal(s.radiusNm, 25);
  assert.equal(s.ceilingAgl, 10000);
  assert.equal(s.pollSec, 3);
  assert.equal(s.mapStyle, 'satellite');
  assert.deepEqual(s.watchlist.types, ['F35', 'F16']);
  assert.equal(s.watchlist.allMilitary, false);
});

test('validation clamps ranges and rejects bad enums', () => {
  const s = validate({ ...defaults(), radiusNm: 500, pollSec: 0.5, units: 'furlongs', ceilingAgl: 'x', proxyUrl: 'javascript:alert(1)' });
  assert.equal(s.radiusNm, 50);
  assert.equal(s.pollSec, 2);
  assert.equal(s.units, 'imperial');
  assert.equal(s.ceilingAgl, 8000);
  assert.equal(s.proxyUrl, '');
  assert.equal(validate({ ...defaults(), proxyUrl: 'https://x.workers.dev' }).proxyUrl, 'https://x.workers.dev');
  assert.equal(validate({ ...defaults(), proxyUrl: 'http://localhost:8787' }).proxyUrl, 'http://localhost:8787');
});

test('save/load round-trip through storage', () => {
  const store = createStorage(memoryBackend());
  const s = { ...defaults(), radiusNm: 22, theme: 'light' };
  saveSettings(s, store);
  assert.equal(loadSettings(store).radiusNm, 22);
  assert.equal(store.getJSON(STORAGE_KEY).version, SCHEMA_VERSION);
});

test('storage falls back to memory when the backend throws', () => {
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('x'); } };
  const store = createStorage(broken);
  store.setJSON('k', { a: 1 });
  assert.deepEqual(store.getJSON('k'), { a: 1 });
  const none = createStorage(null);
  assert.equal(none.persistent, false);
  none.set('a', 'b');
  assert.equal(none.get('a'), 'b');
});

test('export/import round-trips', () => {
  const s = { ...defaults(), radiusNm: 40, watchlist: { ...defaults().watchlist, types: ['C17'] }, apiKeys: { demo: 'k' } };
  const back = importSettings(exportSettings(s));
  assert.deepEqual(back, validate(s));
  assert.throws(() => importSettings('{not json'));
  assert.throws(() => importSettings('42'));
});

test('watchlist presets add without duplicates', () => {
  let w = { types: ['C17'], regs: [], callsigns: [], allMilitary: false };
  w = addPreset(w, 'mil-heavies');
  w = addPreset(w, 'mil-heavies');
  assert.equal(w.types.filter((t) => t === 'C17').length, 1);
  assert.ok(w.types.includes('K35R'));
  assert.equal(addPreset(w, 'nope'), w);
  for (const p of PRESETS) for (const t of p.types) assert.match(t, /^[A-Z0-9]{2,4}$/, `${p.id}: ${t}`);
});

test('watchlist matching reasons', () => {
  const w = { types: ['C17', 'K46'], regs: ['N123AB'], callsigns: ['RCH'], allMilitary: true };
  assert.equal(matchReason({ type: 'C17' }, w), 'type');
  assert.equal(matchReason({ type: 'B762', military: true }, w), 'type', 'KC-46 alias');
  assert.equal(matchReason({ type: 'B762', military: false }, w), null);
  assert.equal(matchReason({ type: 'C172', reg: 'N123AB' }, w), 'reg');
  assert.equal(matchReason({ type: 'C172', callsign: 'RCH431' }, w), 'callsign');
  assert.equal(matchReason({ type: 'C172', military: true }, w), 'military');
  assert.equal(matchReason({ type: 'C172', military: true }, { ...w, allMilitary: false }), null);
});
