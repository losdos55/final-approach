import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, closingAngle, etaMinutes, geometry, summarize, sorters, STATUS } from '../../js/spotting.js';
import { projectFlat } from '../../js/util/geo.js';

const KIWA = { lat: 33.3078, lon: -111.6556, elevation: 1384, icao: 'KIWA' };

/** Place an aircraft `distNm` from KIWA along `bearingFromField`. */
function ac(bearingFromField, distNm, extra = {}) {
  const [lat, lon] = projectFlat(KIWA.lat, KIWA.lon, bearingFromField, distNm);
  return { hex: 'abc123', lat, lon, onGround: false, alt: 5000, gs: 150, track: 0, vRate: 0, ...extra };
}

test('closing angle is 0 when pointing at the field and 180 when pointing away', () => {
  // Aircraft 10 nm due east of the field.
  const a = ac(90, 10);
  assert.ok(closingAngle(270, a.lat, a.lon, KIWA.lat, KIWA.lon) < 1);
  assert.ok(closingAngle(90, a.lat, a.lon, KIWA.lat, KIWA.lon) > 179);
  assert.ok(Math.abs(closingAngle(0, a.lat, a.lon, KIWA.lat, KIWA.lon) - 90) < 1);
  assert.equal(closingAngle(null, a.lat, a.lon, KIWA.lat, KIWA.lon), null);
});

test('ETA = distance / ground speed', () => {
  assert.equal(etaMinutes(10, 120), 5);
  assert.equal(etaMinutes(4, 240), 1);
  assert.equal(etaMinutes(10, 20), null, 'too slow to be meaningful');
  assert.equal(etaMinutes(10, null), null);
});

test('geometry computes AGL from field elevation', () => {
  const g = geometry(ac(0, 5, { alt: 3384 }), KIWA);
  assert.equal(g.agl, 2000);
  assert.ok(Math.abs(g.distNm - 5) < 0.05);
  assert.ok(Math.abs(g.bearingFromField - 0) < 0.5 || Math.abs(g.bearingFromField - 360) < 0.5);
});

test('descending toward the field is INBOUND with an ETA', () => {
  const r = classify(ac(135, 10, { alt: 5000, vRate: -800, track: 315, gs: 150 }), KIWA);
  assert.equal(r.status, STATUS.INBOUND);
  assert.ok(Math.abs(r.eta - 4) < 0.1, `eta ${r.eta}`);
});

test('level below 3000 AGL toward the field is INBOUND', () => {
  const r = classify(ac(90, 8, { alt: 1384 + 2500, vRate: 0, track: 270 }), KIWA);
  assert.equal(r.status, STATUS.INBOUND);
});

test('level above 3000 AGL toward the field is not INBOUND', () => {
  const r = classify(ac(90, 12, { alt: 1384 + 5000, vRate: 0, track: 270 }), KIWA);
  assert.notEqual(r.status, STATUS.INBOUND);
});

test('descending but heading away is not INBOUND', () => {
  const r = classify(ac(90, 10, { alt: 5000, vRate: -800, track: 90 }), KIWA);
  assert.notEqual(r.status, STATUS.INBOUND);
});

test('above the ceiling is OVERFLIGHT even if descending toward the field', () => {
  const r = classify(ac(90, 20, { alt: 20000, vRate: -1500, track: 270 }), KIWA);
  assert.equal(r.status, STATUS.OVERFLIGHT);
});

test('ceiling option is respected', () => {
  const a = ac(90, 20, { alt: 12000, vRate: -1500, track: 270 });
  assert.equal(classify(a, KIWA, { ceilingAgl: 8000 }).status, STATUS.OVERFLIGHT);
  assert.equal(classify(a, KIWA, { ceilingAgl: 15000 }).status, STATUS.INBOUND);
});

test('climbing away is OUTBOUND', () => {
  const r = classify(ac(315, 6, { alt: 4000, vRate: 1800, track: 315 }), KIWA);
  assert.equal(r.status, STATUS.OUTBOUND);
  assert.equal(r.eta, null);
});

test('climbing within 3 nm is OUTBOUND regardless of direction (turning out)', () => {
  const r = classify(ac(315, 2, { alt: 2500, vRate: 1500, track: 200 }), KIWA);
  assert.equal(r.status, STATUS.OUTBOUND);
});

test('climbing toward the field far out is not OUTBOUND', () => {
  const r = classify(ac(90, 10, { alt: 4000, vRate: 1500, track: 270 }), KIWA);
  assert.notEqual(r.status, STATUS.OUTBOUND);
});

test('on ground within 3 nm is GROUND; further out it is AREA', () => {
  assert.equal(classify(ac(0, 1, { onGround: true, alt: null, gs: 12 }), KIWA).status, STATUS.GROUND);
  assert.equal(classify(ac(0, 8, { onGround: true, alt: null, gs: 12 }), KIWA).status, STATUS.AREA);
});

test('low and close but crosswind is PATTERN', () => {
  const r = classify(ac(0, 3.5, { alt: 1384 + 1000, vRate: 0, track: 90 }), KIWA);
  assert.equal(r.status, STATUS.PATTERN);
});

test('low but far and crossing is AREA', () => {
  const r = classify(ac(0, 12, { alt: 1384 + 4000, vRate: 0, track: 90 }), KIWA);
  assert.equal(r.status, STATUS.AREA);
});

test('unknown altitude never classifies as INBOUND/OUTBOUND', () => {
  const r = classify(ac(90, 5, { alt: null, vRate: -1000, track: 270 }), KIWA);
  assert.equal(r.status, STATUS.AREA);
});

test('route destination forces INBOUND; origin + climbing forces OUTBOUND', () => {
  const crossing = ac(0, 12, { alt: 1384 + 4000, vRate: 0, track: 90 });
  assert.equal(classify(crossing, KIWA, {}, { origin: 'KPHX', destination: 'KIWA' }).status, STATUS.INBOUND);
  const climbing = ac(0, 12, { alt: 1384 + 4000, vRate: 1200, track: 90 });
  assert.equal(classify(climbing, KIWA, {}, { origin: 'KIWA', destination: 'KLAS' }).status, STATUS.OUTBOUND);
  assert.equal(classify(crossing, KIWA, {}, { origin: 'KIWA', destination: 'KLAS' }).status, STATUS.AREA,
    'origin match requires climbing');
});

test('summary counts', () => {
  const s = summarize([
    { status: 'inbound', ac: { military: true } },
    { status: 'inbound', ac: {} },
    { status: 'outbound', ac: {} },
    { status: 'area', ac: { military: true } },
  ]);
  assert.deepEqual([s.inbound, s.outbound, s.military, s.total], [2, 1, 2, 4]);
});

test('sorters: arrivals by ETA, nearby by distance, departures newest first', () => {
  const items = [{ eta: 5, distNm: 9 }, { eta: 2, distNm: 4 }, { eta: null, distNm: 1 }];
  assert.deepEqual([...items].sort(sorters.arrivals).map((i) => i.eta), [2, 5, null]);
  assert.deepEqual([...items].sort(sorters.nearby).map((i) => i.distNm), [1, 4, 9]);
  const deps = [{ departedAt: 1000, distNm: 5 }, { departedAt: 3000, distNm: 2 }, { distNm: 1 }];
  assert.deepEqual([...deps].sort(sorters.departures).map((i) => i.distNm), [2, 5, 1]);
});
