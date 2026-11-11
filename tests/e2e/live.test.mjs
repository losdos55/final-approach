// Live-mode behaviour with mocked providers: provider fallback, the global
// 1 request/second/host limit, time-to-first-aircraft, and pausing when hidden.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setup, mockPhotos, watchConsole, waitForAircraft, hideDocument } from './helpers.mjs';

const fixture = JSON.parse(readFileSync(new URL('../../fixtures/kiwa-demo.json', import.meta.url)));
let env;
before(async () => { env = await setup(8124); });
after(async () => { await env?.close(); });

const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

test('falls back from a failing provider, respects 1 req/s per host, pauses when hidden', async () => {
  const ctx = await env.browser.newContext({ viewport: { width: 390, height: 844 } });
  const log = []; // {host, t}
  await mockPhotos(ctx, log);
  let frame = 0;
  await ctx.route('https://api.airplanes.live/**', (r) => {
    log.push({ host: 'api.airplanes.live', t: Date.now() });
    return r.fulfill({ status: 403, headers: CORS, body: '{"error":"no"}' });
  });
  await ctx.route('https://api.adsb.lol/**', (r) => {
    log.push({ host: 'api.adsb.lol', t: Date.now() });
    const f = fixture.frames[frame++ % fixture.frames.length];
    return r.fulfill({ status: 200, headers: CORS, body: JSON.stringify({ ac: f.ac, now: Date.now() }) });
  });
  await ctx.route('https://opendata.adsb.fi/**', (r) => {
    log.push({ host: 'opendata.adsb.fi', t: Date.now() });
    return r.fulfill({ status: 200, headers: CORS, body: JSON.stringify({ aircraft: [], now: Date.now() / 1000 }) });
  });
  // Record, inside the page, exactly when each fetch() is issued.
  await ctx.addInitScript(() => {
    window.__issued = [];
    const real = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input.url;
      window.__issued.push({ host: new URL(url, location.href).hostname, t: performance.now() });
      return real(input, init);
    };
  });
  // Fastest allowed polling to stress the limiter.
  await ctx.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('final-approach.settings', JSON.stringify({ version: 2, pollSec: 2, watchlist: { types: ['C17'], allMilitary: true } }));
      sessionStorage.setItem('seeded', '1');
    }
  });
  const page = await ctx.newPage();
  const errors = watchConsole(page);
  const t0 = Date.now();
  await page.goto(`${env.url}?nosw`);
  await waitForAircraft(page, 20, 10000);
  const firstAircraftMs = Date.now() - t0;
  assert.ok(firstAircraftMs < 10000, `aircraft after ${firstAircraftMs} ms`);

  await page.waitForTimeout(12000);
  const status = await page.evaluate(() => window.__fa.ui.get().status);
  assert.equal(status.providerId, 'adsblol');
  assert.equal(await page.getAttribute('.status-dot', 'data-state'), 'fresh');

  // Every host: consecutive requests at least 1 s apart (timestamps taken in the page).
  const issued = await page.evaluate(() => window.__issued);
  for (const host of ['api.airplanes.live', 'api.adsb.lol', 'opendata.adsb.fi', 'api.planespotters.net']) {
    const ts = issued.filter((e) => e.host === host).map((e) => e.t).sort((a, b) => a - b);
    for (let i = 1; i < ts.length; i++) assert.ok(ts[i] - ts[i - 1] >= 995, `${host} gap ${ts[i] - ts[i - 1]} ms`);
  }
  // In-page limiter agrees.
  const gaps = await page.evaluate(() => ['api.adsb.lol', 'api.planespotters.net'].map((h) => window.__fa.limiter.minGap(h)));
  for (const g of gaps) assert.ok(g >= 999, `limiter gap ${g}`);
  // airplanes.live is backing off instead of being hammered.
  assert.ok(log.filter((e) => e.host === 'api.airplanes.live').length <= 4);
  assert.ok(log.filter((e) => e.host === 'api.adsb.lol').length >= 5);

  // Hidden → no more position requests.
  await hideDocument(page, true);
  await page.waitForTimeout(500);
  const before = log.filter((e) => e.host === 'api.adsb.lol').length;
  await page.waitForTimeout(5000);
  assert.equal(log.filter((e) => e.host === 'api.adsb.lol').length, before, 'no polling while hidden');
  await hideDocument(page, false);
  await page.waitForTimeout(3000);
  assert.ok(log.filter((e) => e.host === 'api.adsb.lol').length > before, 'polling resumed');

  // The 403 from airplanes.live is reported by the browser as a failed resource; nothing else.
  assert.deepEqual(errors.filter((e) => !/status of 403/.test(e)), []);
  assert.ok(issued.some((e) => e.host === 'api.planespotters.net'), 'photos were looked up');
  await ctx.close();
});

test('without a proxy, a CORS-blocked provider shows a helpful banner', async () => {
  const ctx = await env.browser.newContext({ viewport: { width: 390, height: 844 } });
  for (const h of ['api.airplanes.live', 'api.adsb.lol', 'opendata.adsb.fi']) {
    // Playwright's fulfill() bypasses CORS, so emulate the browser's CORS
    // rejection with a network failure (both surface as a TypeError in fetch).
    await ctx.route(`https://${h}/**`, (r) => r.abort('failed'));
  }
  const page = await ctx.newPage();
  await page.goto(`${env.url}?nosw`);
  await page.waitForSelector('#banner:not([hidden])', { timeout: 15000 });
  assert.match(await page.textContent('#banner'), /proxy/i);
  assert.equal(await page.getAttribute('.status-dot', 'data-state'), 'error');
  await ctx.close();
});
