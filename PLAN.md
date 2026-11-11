# Final Approach — build plan

## 0. Data source verification (2026-11-10)

Real requests were made from a cloud container with `Origin: https://<user>.github.io`.

| Source | Endpoint | Result | CORS (`Access-Control-Allow-Origin`) |
|---|---|---|---|
| airplanes.live | `/v2/point/{lat}/{lon}/{nm}` | **HTTP 403** `{"error":"Please contact us at contact@airplanes.live …"}` (Cloudflare, datacenter IPs appear to need approval) | none |
| adsb.lol | `/v2/lat/{lat}/lon/{lon}/dist/{nm}`, `/v2/point/…`, `/v2/mil`, `/v2/hex/{hex}` | 200, JSON `{ac:[…], msg, now, total, ctime, ptime}` | **none**; `OPTIONS` → 405 |
| adsb.lol | `POST /api/0/routeset` `{"planes":[{callsign,lat,lng}]}` | **HTTP 201 with an empty body** for every callsign tried (schema in `/api/openapi.json` matches the documented body) | none |
| adsb.fi | `/api/v2/lat/{lat}/lon/{lon}/dist/{nm}`, `/api/v2/mil` | 200, JSON `{now, aircraft:[…], resultCount, ptime}` (note **`aircraft`**, not `ac`, on the point endpoint; `/mil` uses `ac`) | **none**; `OPTIONS` → 405 |
| planespotters.net | `/pub/photos/hex/{hex}`, `/pub/photos/reg/{reg}` | 403 to non-browser clients without a User-Agent containing a contact URL. Browsers send their own UA. | **`*`** (GET, OPTIONS) |
| CARTO Dark Matter / Positron | `basemaps.cartocdn.com/gl/{dark-matter,positron}-gl-style/style.json` | 200; tiles, sprites and glyphs on `tiles.basemaps.cartocdn.com` | `*` |
| Esri World Imagery | `server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}` | 200 JPEG | `*` |
| OurAirports | `davidmegginson.github.io/ourairports-data/{airports,runways}.csv` | 200 | n/a (build time) |

### Field names confirmed (readsb/tar1090 style)

Both adsb.lol and adsb.fi aircraft objects contain:
`hex, type, flight (space padded), r, t, dbFlags, category, lat, lon, alt_baro ("ground" | number),
alt_geom, gs, track, true_heading, mag_heading, baro_rate, geom_rate, squawk, emergency, seen,
seen_pos, dst, dir, nav_*, mlat, tisb, rssi, messages, …`

- **adsb.fi additionally returns `desc`, `ownOp`, `year`.** adsb.lol does **not**, so the app
  ships a small ICAO type-designator table (`js/data/types.js`) to fill in a description.
- `dbFlags` bit 1 = military (observed on `/v2/mil`, e.g. a Fairchild C-26D).
- `dst`/`dir` are relative to the query point.

### Decisions after verification

1. **No position provider allows browser CORS**, so per the brief the app includes an optional
   user-deployed proxy (`proxy/cloudflare-worker.js`, restricted to the three provider hosts,
   GET + the routeset POST) and a *Proxy URL* setting. Without a proxy the app still tries the
   providers directly (in case they enable CORS later), and on failure shows a specific message
   ("Browser blocked by CORS — add a proxy in Settings or try Demo mode").
2. Provider order for *auto* stays airplanes.live → adsb.lol → adsb.fi as requested, but
   airplanes.live failures trigger fast fallback with backoff so a 403 never stalls the feed.
3. adsb.lol routeset is implemented defensively against its historical response shape
   (array of `{callsign, _airport_codes_iata, _airports:[{icao,iata,…}], plausible}`) and silently
   disables itself for the session after repeated empty responses. Route enrichment is a bonus.
4. Planespotters is called directly from the browser (CORS `*`). The app never re-hosts images,
   and always shows "Photo: {photographer} / planespotters.net" linking to the photo page.
   Playwright tests mock this API.
5. Fixture data (`fixtures/kiwa-live.json`) is recorded from **adsb.lol** because its data is
   ODbL-licensed and redistributable with attribution. Synthetic entries are added and clearly
   flagged (`_synthetic: true`) where the capture lacks a military/inbound/outbound example
   for KIWA.
6. MapLibre GL JS **6.15.0** is vendored. v6 ships as ES modules (`maplibre-gl.mjs` + a module
   worker loaded relative to `import.meta.url`), which fits the no-build ES-module app.
7. OurAirports gives KIWA IATA as `AZA` and elevation 1382 ft; the built-in default uses the
   brief's 1384 ft until the user picks an airport from the list.

## 1. File structure

```
index.html, manifest.webmanifest, sw.js
css/themes.css      color tokens (dark + light), radii, shadows
css/base.css        reset, typography, layout shells, safe areas
css/components.css  glass bar, fab buttons, sheet, lists, details, settings, toasts
js/app.js           bootstrap + wiring
js/state.js         tiny store with pub/sub
js/settings.js      schema v2, load/save/migrate/export/import (pure, testable)
js/airports.js      lazy loading + search of data/airports.json & runways.json
js/watchlist.js     presets + matching
js/spotting.js      pure classification / ETA / closing angle (unit tested)
js/routes.js        adsb.lol routeset batching + IndexedDB cache (1 h)
js/photos.js        planespotters queue (1/s) + IndexedDB cache (7 d)
js/demo.js          fixture replay for ?demo=1
js/data/types.js    ICAO type families → silhouette class + description fallback
js/providers/       index.js (fallback, limiter, backoff), normalize.js, airplaneslive.js, adsblol.js, adsbfi.js
js/map/             map.js, layers.js, icons.js (original SVG silhouettes, SDF), animation.js, trails.js, bubbles.js
js/ui/              searchbar.js, sheet.js, lists.js, details.js, settings-view.js, toasts.js, filters.js
js/util/            geo.js, units.js, db.js, throttle.js, storage.js, dom.js
data/               airports.json, runways.json (generated, committed)
vendor/             maplibre-gl.mjs, maplibre-gl-worker.mjs, maplibre-gl.css, LICENSE-maplibre.txt
icons/              icon.svg + generated PNGs
scripts/            build-airports.mjs, capture-fixture.mjs, serve.mjs, make-icons.mjs
tests/unit          node:test — spotting, geo, units, settings migration, normalize, limiter
tests/e2e           Playwright (library API driven by node:test, no extra deps)
fixtures/           recorded responses near KIWA
proxy/              cloudflare-worker.js
```

## 2. Key technical choices

- **Rate limiting**: one `HostLimiter` per hostname (≥1000 ms between request starts), shared by
  positions, routes and photos. Exponential backoff (2 s → 60 s) on errors/429, surfaced as the
  status dot + text.
- **Animation**: each aircraft has a `from` (rendered position at the moment new data arrived)
  and a dead-reckoned `target` (true position projected by `gs`/`track` for the age of the
  report). Every frame the rendered position eases from→target over ~1.2 s, then keeps
  dead-reckoning. GeoJSON source is updated per frame (throttled to ~30 fps) — fine for a few
  hundred aircraft.
- **Icons**: original silhouettes drawn as SVG paths, rasterised to canvas at 2× and registered
  with `sdf: true` so `icon-color` can follow altitude. Military gets `icon-halo-color`.
- **Storage**: localStorage for settings/watchlist (try/catch, in-memory fallback), IndexedDB for
  photo and route caches (with in-memory fallback when IDB is unavailable).
- **Service worker**: versioned caches, cache-first app shell, network-only for live APIs,
  stale-while-revalidate for CARTO/Esri tiles capped at ~400 entries.
