// Lazy-loaded OurAirports data: search for the picker and runway geometry.

let airportsPromise = null;
let runwaysPromise = null;

function expand(json) {
  const f = json.fields;
  return json.rows.map((r) => Object.fromEntries(f.map((k, i) => [k, r[i]])));
}

export function loadAirports() {
  airportsPromise ??= fetch('./data/airports.json')
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`airports: HTTP ${r.status}`))))
    .then(expand)
    .catch((err) => { airportsPromise = null; throw err; });
  return airportsPromise;
}

export function loadRunways() {
  runwaysPromise ??= fetch('./data/runways.json')
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`runways: HTTP ${r.status}`))))
    .catch((err) => { runwaysPromise = null; throw err; });
  return runwaysPromise;
}

/** Runways for an airport ident: [{le:{id,lat,lon}, he:{id,lat,lon}, length}] */
export async function runwaysFor(ident) {
  if (!ident) return [];
  const data = await loadRunways();
  return (data.airports[ident] ?? []).map((r) => ({
    le: { id: r[0], lat: r[1], lon: r[2] },
    he: { id: r[3], lat: r[4], lon: r[5] },
    length: r[6],
    surface: r[7],
  }));
}

/** Rank airports for a free-text query (ICAO, IATA, name, city). */
export function searchAirports(list, query, limit = 30) {
  const q = query.trim().toUpperCase();
  if (!q) return list.filter((a) => a.type === 'large_airport').slice(0, limit);
  const scored = [];
  for (const a of list) {
    let score = 0;
    if (a.icao === q || a.ident === q) score = 100;
    else if (a.iata === q) score = 95;
    else if (a.icao.startsWith(q) || a.ident.startsWith(q)) score = 80;
    else {
      const name = a.name.toUpperCase();
      const city = a.municipality.toUpperCase();
      if (name.startsWith(q) || city.startsWith(q)) score = 60;
      else if (name.includes(q) || city.includes(q)) score = 40;
    }
    if (score) {
      if (a.type === 'large_airport') score += 5;
      if (a.mil) score += 2;
      scored.push([score, a]);
    }
  }
  scored.sort((x, y) => y[0] - x[0] || x[1].ident.localeCompare(y[1].ident));
  return scored.slice(0, limit).map((s) => s[1]);
}

/** Convert a data row to the settings airport shape. */
export function toSettingsAirport(a) {
  return {
    ident: a.ident,
    icao: a.icao || a.ident,
    iata: a.iata || '',
    name: a.name,
    municipality: a.municipality || '',
    lat: a.lat,
    lon: a.lon,
    elevation: a.elevation_ft ?? 0,
    custom: false,
  };
}
