// Repository hygiene: service-worker precache matches disk, relative paths,
// no secrets, and the request limiter enforces 1 request/second per host.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { HostLimiter, Backoff } from '../../js/util/throttle.js';
import { viaProxy } from '../../js/providers/index.js';
import { parseRoute, routeLabel } from '../../js/routes.js';
import { parsePhotos } from '../../js/photos.js';

const ROOT = new URL('../../', import.meta.url).pathname;
const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

test('service worker precaches every shipped file that exists', () => {
  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  const list = [...sw.matchAll(/'(\.\/[^']*)'/g)].map((m) => m[1]);
  for (const p of list) {
    if (p === './') continue;
    assert.ok(existsSync(join(ROOT, p)), `precached file missing: ${p}`);
  }
  const shipped = ['css', 'js', 'vendor', 'data', 'icons']
    .flatMap((d) => walk(join(ROOT, d)))
    .map((p) => `./${relative(ROOT, p)}`)
    .filter((p) => /\.(css|js|mjs|json|png|svg)$/.test(p));
  for (const p of shipped) assert.ok(list.includes(p), `not precached: ${p}`);
});

test('app uses only relative URLs for its own assets', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  for (const m of html.matchAll(/(?:href|src)="([^"#]+)"/g)) {
    assert.ok(m[1].startsWith('./') || /^https?:/.test(m[1]), `non-relative: ${m[1]}`);
  }
  const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  for (const i of manifest.icons) assert.ok(!i.src.startsWith('/'), i.src);
  assert.ok(manifest.icons.some((i) => i.purpose === 'maskable'));
  for (const f of walk(join(ROOT, 'js'))) {
    const src = readFileSync(f, 'utf8');
    assert.ok(!/fetch\(\s*['"`]\//.test(src), `absolute fetch in ${f}`);
  }
});

test('no secrets or analytics in the repo', () => {
  const files = [...walk(join(ROOT, 'js')), join(ROOT, 'index.html'), join(ROOT, 'sw.js'), ...walk(join(ROOT, 'proxy'))];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    assert.ok(!/(api[_-]?key|secret|token)\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}['"]/i.test(src), `possible secret in ${f}`);
    assert.ok(!/google-analytics|googletagmanager|plausible\.io|segment\.com|mixpanel|sentry\.io/i.test(src), `analytics in ${f}`);
  }
});

test('limiter spaces requests to the same host by >= 1 s and lets other hosts through', async () => {
  let now = 0;
  const lim = new HostLimiter({ minIntervalMs: 1000, now: () => now, sleep: async (ms) => { now += ms; } });
  const starts = [];
  for (let i = 0; i < 5; i++) starts.push(await lim.acquire('api.adsb.lol'));
  for (let i = 1; i < starts.length; i++) assert.ok(starts[i] - starts[i - 1] >= 1000);
  const t = now;
  await lim.acquire('api.planespotters.net');
  assert.equal(now, t, 'different host is not delayed');
  assert.ok(lim.minGap('api.adsb.lol') >= 1000);
});

test('limiter serialises concurrent callers', async () => {
  const lim = new HostLimiter({ minIntervalMs: 50 });
  const t0 = Date.now();
  const ts = await Promise.all([1, 2, 3, 4].map(() => lim.acquire('h')));
  ts.sort((a, b) => a - b);
  for (let i = 1; i < ts.length; i++) assert.ok(ts[i] - ts[i - 1] >= 45, `gap ${ts[i] - ts[i - 1]}`);
  assert.ok(Date.now() - t0 >= 140);
});

test('backoff grows exponentially, honours Retry-After, resets on success', () => {
  let now = 0;
  const b = new Backoff({ baseMs: 2000, maxMs: 60000, now: () => now });
  assert.equal(b.fail('x'), 2000);
  assert.equal(b.fail('x'), 4000);
  assert.equal(b.fail('x'), 8000);
  assert.ok(b.blocked('x'));
  now += 8001;
  assert.ok(!b.blocked('x'));
  for (let i = 0; i < 10; i++) b.fail('x');
  assert.equal(b.fail('x'), 60000);
  b.succeed('x');
  assert.equal(b.failures('x'), 0);
  assert.equal(b.fail('y', 30000), 30000);
});

test('proxy URL rewriting', () => {
  assert.equal(viaProxy('https://api.adsb.lol/v2/mil', ''), 'https://api.adsb.lol/v2/mil');
  assert.equal(viaProxy('https://api.adsb.lol/v2/mil', 'https://p.example.workers.dev/'), 'https://p.example.workers.dev/api.adsb.lol/v2/mil');
});

test('routeset and photo parsing', () => {
  const r = parseRoute({ callsign: 'SWA1', _airport_codes_iata: 'PHX-AZA', _airports: [{ icao: 'KPHX', iata: 'PHX' }, { icao: 'KIWA', iata: 'AZA' }], plausible: 1 });
  assert.deepEqual([r.origin, r.destination, r.plausible], ['KPHX', 'KIWA', true]);
  assert.equal(routeLabel(r), 'PHX → AZA');
  assert.equal(parseRoute({ callsign: 'X' }), null);
  assert.equal(parseRoute(null), null);
  const p = parsePhotos({ photos: [{ thumbnail: { src: 't.jpg' }, thumbnail_large: { src: 'l.jpg' }, link: 'https://www.planespotters.net/photo/1', photographer: 'A. Spotter' }] });
  assert.deepEqual(p, { thumb: 't.jpg', large: 'l.jpg', link: 'https://www.planespotters.net/photo/1', photographer: 'A. Spotter' });
  assert.deepEqual(parsePhotos({ photos: [] }), { none: true });
  assert.deepEqual(parsePhotos(null), { none: true });
});
