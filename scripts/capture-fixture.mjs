#!/usr/bin/env node
// Records real ADS-B responses near an airport for demo mode and tests.
//
//   NODE_USE_ENV_PROXY=1 node scripts/capture-fixture.mjs [--frames 24] [--interval 5] \
//       [--lat 33.3078] [--lon -111.6556] [--radius 30] [--out fixtures/kiwa-live.json]
//
// Source: adsb.lol (data licensed ODbL 1.0, attribution: "adsb.lol contributors").
// We fetch at most one request every `interval` seconds (>= 1 s), well under the
// 1 request/second provider limit.

import { writeFile } from 'node:fs/promises';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1]]);
    return acc;
  }, [])
);

const lat = Number(args.lat ?? 33.3078);
const lon = Number(args.lon ?? -111.6556);
const radius = Number(args.radius ?? 30);
const frames = Number(args.frames ?? 24);
const interval = Math.max(1, Number(args.interval ?? 5));
const out = args.out ?? 'fixtures/kiwa-live.json';

// Keep only fields the app's normalizer reads, so the fixture stays small.
const KEEP = ['hex', 'type', 'flight', 'r', 't', 'desc', 'ownOp', 'year', 'dbFlags', 'category',
  'lat', 'lon', 'alt_baro', 'alt_geom', 'gs', 'track', 'true_heading', 'mag_heading',
  'baro_rate', 'geom_rate', 'squawk', 'emergency', 'seen', 'seen_pos', 'dst', 'dir'];

const url = `https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/${radius}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const result = {
  source: 'adsb.lol',
  license: 'ODbL 1.0 — © adsb.lol contributors, https://adsb.lol',
  endpoint: url,
  capturedAt: new Date().toISOString(),
  center: { lat, lon, radius },
  intervalSec: interval,
  frames: [],
};

for (let i = 0; i < frames; i++) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const ac = (json.ac ?? json.aircraft ?? []).map((a) =>
      Object.fromEntries(KEEP.filter((k) => k in a).map((k) => [k, a[k]]))
    );
    result.frames.push({ now: json.now ?? Date.now(), ac });
    console.log(`frame ${i + 1}/${frames}: ${ac.length} aircraft`);
  } catch (err) {
    console.error(`frame ${i + 1} failed: ${err.message}`);
  }
  const wait = interval * 1000 - (Date.now() - t0);
  if (i < frames - 1 && wait > 0) await sleep(wait);
}

await writeFile(out, JSON.stringify(result));
console.log(`wrote ${out}`);
