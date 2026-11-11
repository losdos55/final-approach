#!/usr/bin/env node
// Builds fixtures/kiwa-demo.json from the real capture (fixtures/kiwa-live.json):
//  - trims to 30 nm and rounds coordinates to keep the file small
//  - appends clearly marked SYNTHETIC military tracks (`_synthetic: true`, hex
//    prefixed with "~" so they can never collide with a real airframe), because
//    the live capture contained no military traffic near KIWA.
//
//   node scripts/build-demo-fixture.mjs

import { readFile, writeFile } from 'node:fs/promises';
import { projectFlat, distanceNm } from '../js/util/geo.js';

const live = JSON.parse(await readFile('fixtures/kiwa-live.json', 'utf8'));
const KIWA = { lat: 33.3078, lon: -111.6556, elev: 1384 };
const r5 = (n) => Math.round(n * 1e5) / 1e5;

// Runway 30C threshold (OurAirports): 33.3176,-111.6660 → 12C; 30C end at 33.2976,-111.6430
const RWY30C = { lat: 33.2976, lon: -111.643 };

function synthetic(frameIdx, dtSec) {
  const t = frameIdx * dtSec;
  const out = [];

  // 1. C-17 on a 3° final for runway 30C, from 12 nm out, 140 kt.
  {
    const gs = 140;
    const startNm = 12;
    const d = Math.max(0.2, startNm - (gs * t) / 3600);
    const [lat, lon] = projectFlat(RWY30C.lat, RWY30C.lon, 135.7, d);
    out.push({
      hex: '~c17001', flight: 'RCH431  ', r: 'SYNTH-C17', t: 'C17', desc: 'Boeing C-17A Globemaster III',
      ownOp: 'Synthetic demo aircraft', dbFlags: 1, category: 'A5',
      lat: r5(lat), lon: r5(lon), alt_baro: Math.round(KIWA.elev + d * 318), gs, track: 315.7,
      baro_rate: -740, squawk: '4615', emergency: 'none', seen: 0.4, seen_pos: 0.4, _synthetic: true,
    });
  }
  // 2. KC-46A departing runway 30L, climbing out to the northwest.
  {
    const gs = 165 + Math.min(60, t * 0.6);
    const d = 0.3 + (gs * t) / 3600;
    const [lat, lon] = projectFlat(33.2973, -111.649, 315.7, d);
    out.push({
      hex: '~k46001', flight: 'BOLT21  ', r: 'SYNTH-K46', t: 'B762', desc: 'Boeing KC-46A Pegasus',
      ownOp: 'Synthetic demo aircraft', dbFlags: 1, category: 'A5',
      lat: r5(lat), lon: r5(lon), alt_baro: Math.round(KIWA.elev + 400 + t * 33), gs, track: 315.7,
      baro_rate: 2000, squawk: '4632', emergency: 'none', seen: 0.6, seen_pos: 0.6, _synthetic: true,
    });
  }
  // 3. UH-60 crossing north of the field, eastbound at 1,500 ft AGL.
  {
    const gs = 115;
    const [lat0, lon0] = projectFlat(KIWA.lat, KIWA.lon, 0, 7);
    const [lat, lon] = projectFlat(lat0, lon0, 270, 6 - (gs * t) / 3600);
    out.push({
      hex: '~h60001', flight: 'DUSTY12 ', r: 'SYNTH-H60', t: 'H60', desc: 'Sikorsky UH-60M Black Hawk',
      ownOp: 'Synthetic demo aircraft', dbFlags: 1, category: 'A7',
      lat: r5(lat), lon: r5(lon), alt_baro: KIWA.elev + 1500, gs, track: 90,
      baro_rate: 0, squawk: '1200', emergency: 'none', seen: 1.1, seen_pos: 1.1, _synthetic: true,
    });
  }
  return out;
}

const frames = live.frames.map((f, i) => {
  const ac = f.ac
    .filter((a) => typeof a.lat === 'number' && distanceNm(KIWA.lat, KIWA.lon, a.lat, a.lon) <= 30)
    .map(({ dst, dir, type, ...rest }) => ({ ...rest, lat: r5(rest.lat), lon: r5(rest.lon) }));
  return { now: f.now, ac: [...ac, ...synthetic(i, live.intervalSec)] };
});

const demo = {
  note: 'Real adsb.lol capture near KIWA plus entries marked _synthetic:true (hex starts with "~").',
  source: live.source,
  license: live.license,
  capturedAt: live.capturedAt,
  center: live.center,
  intervalSec: live.intervalSec,
  frames,
};
await writeFile('fixtures/kiwa-demo.json', JSON.stringify(demo));
console.log(`frames: ${frames.length}, aircraft/frame ≈ ${frames[0].ac.length}`);
