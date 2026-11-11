/* Final Approach service worker.
 * - App shell: cache-first (precached on install, versioned).
 * - Live aircraft, routes, photo API: network-only (never cached here).
 * - Map styles/tiles/glyphs: stale-while-revalidate, capped.
 */

const VERSION = 'v1.0.0';
const SHELL = `fa-shell-${VERSION}`;
const RUNTIME = `fa-runtime-${VERSION}`;
const TILES = 'fa-tiles-v1';
const TILE_LIMIT = 400;

// Keep in sync with the files on disk (tests/unit/sw.test.mjs checks this).
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/base.css',
  './css/components.css',
  './css/themes.css',
  './data/airports.json',
  './data/runways.json',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/icon.svg',
  './js/airports.js',
  './js/app.js',
  './js/data/types.js',
  './js/demo.js',
  './js/map/animation.js',
  './js/map/bubbles.js',
  './js/map/icons.js',
  './js/map/layers.js',
  './js/map/map.js',
  './js/map/trails.js',
  './js/photos.js',
  './js/providers/adsbfi.js',
  './js/providers/adsblol.js',
  './js/providers/airplaneslive.js',
  './js/providers/index.js',
  './js/providers/normalize.js',
  './js/routes.js',
  './js/settings.js',
  './js/spotting.js',
  './js/state.js',
  './js/traffic.js',
  './js/ui/details.js',
  './js/ui/filters.js',
  './js/ui/lists.js',
  './js/ui/searchbar.js',
  './js/ui/settings-view.js',
  './js/ui/sheet.js',
  './js/ui/toasts.js',
  './js/util/db.js',
  './js/util/dom.js',
  './js/util/geo.js',
  './js/util/storage.js',
  './js/util/throttle.js',
  './js/util/units.js',
  './js/watchlist.js',
  './vendor/maplibre-gl-worker.mjs',
  './vendor/maplibre-gl.css',
  './vendor/maplibre-gl.mjs',
];

const TILE_HOSTS = ['basemaps.cartocdn.com', 'tiles.basemaps.cartocdn.com', 'server.arcgisonline.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL, RUNTIME, TILES]);
    for (const key of await caches.keys()) {
      if (key.startsWith('fa-') && !keep.has(key)) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function staleWhileRevalidate(event, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(event.request);
  const network = fetch(event.request).then((res) => {
    if (res.ok) {
      cache.put(event.request, res.clone()).then(() => trim(cacheName, TILE_LIMIT));
    }
    return res;
  }).catch(() => cached);
  if (cached) {
    event.waitUntil(network.catch(() => {}));
    return cached;
  }
  return network;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    // App shell & data: cache-first. Navigations ignore ?demo=1 etc.
    event.respondWith((async () => {
      const isNav = req.mode === 'navigate';
      const cached = await caches.match(isNav ? './index.html' : req, { ignoreSearch: true });
      if (cached) return cached;
      try {
        const res = await fetch(req);
        // Demo fixtures and anything else same-origin get cached on first use.
        if (res.ok && !isNav) {
          const c = await caches.open(RUNTIME);
          c.put(req, res.clone());
        }
        return res;
      } catch (err) {
        if (isNav) return caches.match('./index.html');
        throw err;
      }
    })());
    return;
  }

  if (TILE_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(event, TILES));
  }
  // Everything else (aircraft APIs, routes, planespotters) goes straight to the network.
});
