import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeResponse, normalizeAircraft } from '../../js/providers/normalize.js';
import { classifyType, typeName } from '../../js/data/types.js';

test('adsb.lol style ({ac, now ms}) normalises', () => {
  const now = 1794355026000;
  const r = normalizeResponse({
    now,
    ac: [
      { hex: 'A7178C', flight: 'AAL2315 ', r: 'N556UW', t: 'A321', alt_baro: 3000, gs: 197.1, track: 272.04, baro_rate: 1152, lat: 33.43, lon: -112.0, seen_pos: 2, category: 'A3', squawk: '0751', emergency: 'none' },
      { hex: 'abc', flight: 'X', alt_baro: 'ground' }, // no position → dropped
    ],
  }, 'adsblol', now);
  assert.equal(r.aircraft.length, 1);
  const a = r.aircraft[0];
  assert.equal(a.hex, 'a7178c');
  assert.equal(a.callsign, 'AAL2315');
  assert.equal(a.desc, 'Airbus A321', 'filled from type table');
  assert.equal(a.alt, 3000);
  assert.equal(a.vRate, 1152);
  assert.equal(a.military, false);
  assert.equal(a.emergency, '');
  assert.equal(a.posTime, now - 2000);
  assert.equal(a.cls, 'narrow');
});

test('adsb.fi style ({aircraft, now seconds}) normalises, keeps desc/ownOp/year', () => {
  const nowSec = 1794355026.0;
  const r = normalizeResponse({
    now: nowSec,
    aircraft: [{ hex: 'adfd83', flight: 'OR11', r: '920370', t: 'SW4', dbFlags: 1, desc: 'Fairchild C-26D Metro III', ownOp: 'US ARMY', year: '1992', alt_baro: 8300, geom_rate: 64, lat: 22.07, lon: -159.3, seen_pos: 0 }],
  }, 'adsbfi', nowSec * 1000 + 500);
  const a = r.aircraft[0];
  assert.equal(r.now, nowSec * 1000);
  assert.equal(a.military, true);
  assert.equal(a.desc, 'Fairchild C-26D Metro III');
  assert.equal(a.operator, 'US ARMY');
  assert.equal(a.year, '1992');
  assert.equal(a.vRate, 64, 'falls back to geom_rate');
});

test('ground aircraft have onGround and null altitude', () => {
  const a = normalizeAircraft({ hex: 'aa', alt_baro: 'ground', lat: 1, lon: 2 }, 0, 'x');
  assert.equal(a.onGround, true);
  assert.equal(a.alt, null);
});

test('real captured fixture normalises without loss of positioned aircraft', () => {
  const f = JSON.parse(readFileSync(new URL('../../fixtures/kiwa-demo.json', import.meta.url)));
  const frame = f.frames[0];
  const { aircraft } = normalizeResponse(frame, 'demo', Date.now());
  const positioned = frame.ac.filter((a) => typeof a.lat === 'number' && a.hex);
  assert.equal(aircraft.length, positioned.length);
  assert.ok(aircraft.some((a) => a.military), 'fixture includes military');
});

test('type classification', () => {
  assert.equal(classifyType('C17'), 'milheavy');
  assert.equal(classifyType('B762', 'A5', true), 'milheavy');
  assert.equal(classifyType('B762', 'A5', false), 'wide');
  assert.equal(classifyType('F35'), 'fighter');
  assert.equal(classifyType('H60'), 'heli');
  assert.equal(classifyType('CRJ9'), 'regional');
  assert.equal(classifyType('GLF5'), 'bizjet');
  assert.equal(classifyType('DH8D'), 'turboprop');
  assert.equal(classifyType('C172'), 'piston');
  assert.equal(classifyType('GLID'), 'light');
  assert.equal(classifyType('', 'A7'), 'heli');
  assert.equal(classifyType('', ''), 'light');
  assert.equal(typeName('b38m'), 'Boeing 737 MAX 8');
  assert.equal(typeName('ZZZZ'), null);
});
