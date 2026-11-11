#!/usr/bin/env node
// Builds data/airports.json and data/runways.json from OurAirports (public domain).
//
//   NODE_USE_ENV_PROXY=1 node scripts/build-airports.mjs           # download
//   node scripts/build-airports.mjs --airports a.csv --runways r.csv  # local files
//
// Selection: large_airport + medium_airport that have an ICAO code, plus any
// open airport whose name marks it as a military field.

import { readFile, writeFile, mkdir } from 'node:fs/promises';

const BASE = 'https://davidmegginson.github.io/ourairports-data/';
const MIL_RE = /(Air Force Base|Air Reserve Base|Army Airfield|Naval Air Station|Marine Corps Air Station)/i;

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1]]);
    return acc;
  }, [])
);

/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, newlines in quotes). */
export function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows;
  return body.filter((r) => r.length === header.length).map((r) =>
    Object.fromEntries(header.map((h, i) => [h, r[i]]))
  );
}

async function load(name, localPath) {
  if (localPath) return readFile(localPath, 'utf8');
  const res = await fetch(BASE + name);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return res.text();
}

const round = (n, d = 5) => Math.round(Number(n) * 10 ** d) / 10 ** d;

const airportsCsv = parseCSV(await load('airports.csv', args.airports));
const runwaysCsv = parseCSV(await load('runways.csv', args.runways));

const selected = new Map(); // ident -> airport
for (const a of airportsCsv) {
  if (a.type === 'closed' || a.type === 'heliport' || a.type === 'seaplane_base') continue;
  const icao = a.icao_code || (/^[A-Z]{4}$/.test(a.gps_code) ? a.gps_code : '');
  const major = (a.type === 'large_airport' || a.type === 'medium_airport') && icao;
  const mil = MIL_RE.test(a.name);
  if (!major && !mil) continue;
  const lat = Number(a.latitude_deg);
  const lon = Number(a.longitude_deg);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
  selected.set(a.ident, {
    ident: a.ident,
    icao: icao || '',
    iata: a.iata_code || '',
    name: a.name,
    municipality: a.municipality || '',
    country: a.iso_country || '',
    lat: round(lat),
    lon: round(lon),
    elevation_ft: a.elevation_ft === '' ? null : Number(a.elevation_ft),
    type: a.type,
    mil: mil ? 1 : 0,
  });
}

// Runways: only open ones with both ends located.
const runways = {};
for (const r of runwaysCsv) {
  if (!selected.has(r.airport_ident) || r.closed === '1') continue;
  const le = [Number(r.le_latitude_deg), Number(r.le_longitude_deg)];
  const he = [Number(r.he_latitude_deg), Number(r.he_longitude_deg)];
  if (r.le_latitude_deg === '' || r.he_latitude_deg === '' || ![...le, ...he].every(Number.isFinite)) continue;
  (runways[r.airport_ident] ??= []).push([
    r.le_ident, round(le[0]), round(le[1]),
    r.he_ident, round(he[0]), round(he[1]),
    r.length_ft === '' ? null : Number(r.length_ft),
    r.surface || '',
  ]);
}

// Compact column format keeps the files small; js/airports.js expands rows.
const AIRPORT_FIELDS = ['ident', 'icao', 'iata', 'name', 'municipality', 'country', 'lat', 'lon', 'elevation_ft', 'type', 'mil'];
const airportsOut = {
  source: 'OurAirports (public domain), https://ourairports.com/data/',
  generated: new Date().toISOString().slice(0, 10),
  fields: AIRPORT_FIELDS,
  rows: [...selected.values()]
    .sort((a, b) => a.ident.localeCompare(b.ident))
    .map((a) => AIRPORT_FIELDS.map((f) => a[f])),
};
const runwaysOut = {
  source: 'OurAirports (public domain), https://ourairports.com/data/',
  generated: airportsOut.generated,
  fields: ['le_ident', 'le_lat', 'le_lon', 'he_ident', 'he_lat', 'he_lon', 'length_ft', 'surface'],
  airports: runways,
};

await mkdir('data', { recursive: true });
await writeFile('data/airports.json', JSON.stringify(airportsOut));
await writeFile('data/runways.json', JSON.stringify(runwaysOut));
console.log(`airports: ${airportsOut.rows.length}, airports with runways: ${Object.keys(runways).length}`);
