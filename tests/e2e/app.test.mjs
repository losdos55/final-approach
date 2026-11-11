// End-to-end tests in demo mode: iPhone (390×844) and desktop (1440×900).
//   npm run test:e2e      (SCREENSHOTS=1 also refreshes docs/screenshots)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { setup, mockPhotos, watchConsole, waitForAircraft, renderedAircraft, hideDocument } from './helpers.mjs';

const SHOTS = process.env.SCREENSHOTS === '1';
if (SHOTS) mkdirSync('docs/screenshots', { recursive: true });
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `docs/screenshots/${name}.png` }); };

let env;
before(async () => { env = await setup(8123); });
after(async () => { await env?.close(); });

async function newPhone(extra = {}) {
  const ctx = await env.browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: SHOTS ? 2 : 1,
    isMobile: true,
    hasTouch: true,
    colorScheme: 'dark',
    ...extra,
  });
  await mockPhotos(ctx);
  const page = await ctx.newPage();
  const errors = watchConsole(page);
  return { ctx, page, errors };
}

test('iPhone: demo loads under a subpath, aircraft render, no console errors', async () => {
  const { ctx, page, errors } = await newPhone();
  await page.goto(`${env.url}?demo=1`);
  await waitForAircraft(page, 50);
  await page.waitForFunction(() => window.__fa.map.isStyleLoaded() && window.__fa.map.getLayer('fa-aircraft'));
  await page.waitForTimeout(2500);
  assert.ok(await renderedAircraft(page) > 10, 'aircraft drawn on the map');
  const summary = await page.textContent('#summary');
  assert.match(summary, /\d+ inbound/);
  assert.match(summary, /military/);
  await shot(page, 'mobile-map');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('iPhone: selecting an aircraft opens details with photo credit, bubble and trail', async () => {
  const { ctx, page, errors } = await newPhone();
  await page.goto(`${env.url}?demo=1`);
  await waitForAircraft(page, 50);
  // Let a few frames of the fixture build up a trail.
  await page.waitForTimeout(11000);
  await page.click('#tab-arrivals');
  await page.waitForSelector('#list .row');
  const hex = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#list .row')];
    const c17 = rows.find((r) => r.dataset.hex === '~c17001');
    return (c17 ?? rows[0]).dataset.hex;
  });
  await page.click(`#list .row[data-hex="${hex}"]`);
  await page.waitForSelector('#view-detail:not([hidden]) .d-title');
  // Photo bubble attached to the icon
  await page.waitForSelector('.bubble.selected .bubble-main', { timeout: 5000 });
  // Hero photo (mocked) + credit with link
  if (!hex.startsWith('~')) {
    await page.waitForSelector('#detail .hero img', { timeout: 8000 });
    const credit = await page.textContent('#detail .credit');
    assert.match(credit, /Photo: Test Photographer \/ planespotters\.net/);
    const href = await page.getAttribute('#detail .credit a', 'href');
    assert.match(href, /^https:\/\/www\.planespotters\.net\/photo\//);
  }
  const title = await page.textContent('#detail .d-title');
  assert.ok(title.length > 3);
  // Bubble moves with the aircraft
  const p1 = await page.$eval('.bubble.selected', (el) => el.style.transform);
  await page.waitForTimeout(1500);
  const p2 = await page.$eval('.bubble.selected', (el) => el.style.transform);
  assert.notEqual(p1, p2, 'bubble tracks the moving icon');
  // Altitude-coloured trail for the selection
  const segs = await page.evaluate(() => window.__fa.map.querySourceFeatures('fa-trail-sel').length);
  assert.ok(segs >= 1, 'selected trail drawn');
  await page.waitForTimeout(600);
  await shot(page, 'mobile-details');
  // Back returns to the board
  await page.click('[data-act="back"]');
  await page.waitForSelector('#view-board:not([hidden])');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('iPhone: photo bubble for a real-hex aircraft shows the photo and credit', async () => {
  const { ctx, page, errors } = await newPhone();
  await page.goto(`${env.url}?demo=1`);
  await waitForAircraft(page, 50);
  const hex = await page.evaluate(() => [...window.__fa.traffic.tracks.values()].find((t) => !t.hex.startsWith('~') && t.inRadius && t.ac.reg).hex);
  await page.evaluate((h) => window.__fa.select(h, { fly: true }), hex);
  await page.waitForSelector('.bubble.selected img.bubble-photo', { timeout: 8000 });
  const credit = await page.textContent('.bubble.selected .bubble-credit');
  assert.match(credit, /Test Photographer \/ planespotters\.net/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('iPhone: bottom sheet snaps between peek, half and full', async () => {
  const { ctx, page } = await newPhone();
  await page.goto(`${env.url}?demo=1`);
  await waitForAircraft(page, 20);
  const detent = () => page.getAttribute('#sheet', 'data-detent');
  assert.equal(await detent(), 'peek');
  await page.click('#sheet-grab');
  await page.waitForTimeout(500);
  assert.equal(await detent(), 'half');
  await shot(page, 'mobile-board');
  // Clear any watchlist toasts so they don't cover the handle.
  await page.evaluate(() => { document.querySelector('#toasts').innerHTML = ''; });
  // Drag the grab area up to full.
  const box = await page.locator('#sheet-grab').boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + 10;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) { await page.mouse.move(x, y - i * 30); await page.waitForTimeout(16); }
  await page.mouse.up();
  await page.waitForTimeout(500);
  assert.equal(await detent(), 'full');
  // And drag down slowly to peek.
  await page.evaluate(() => { document.querySelector('#toasts').innerHTML = ''; });
  const box2 = await page.locator('#sheet-grab').boundingBox();
  const y2 = box2.y + 10;
  await page.mouse.move(x, y2);
  await page.mouse.down();
  for (let i = 1; i <= 30; i++) { await page.mouse.move(x, y2 + i * 25); await page.waitForTimeout(30); }
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(500);
  assert.equal(await detent(), 'peek');
  await ctx.close();
});

test('settings and watchlist presets persist across reload; export/import round-trips', async () => {
  const { ctx, page, errors } = await newPhone();
  await page.goto(`${env.url}?demo=1`);
  await page.click('#btn-settings');
  await page.waitForSelector('#settings:not([hidden]) .settings-body');
  await page.click('[data-seg="units"][data-value="metric"]');
  await page.click('[data-preset="fighters"]');
  await page.click('[data-preset="rotary"]');
  await page.fill('[data-wl-add="callsigns"] input', 'rch');
  await page.press('[data-wl-add="callsigns"] input', 'Enter');
  await shot(page, 'settings');
  const exported = await page.evaluate(() => localStorage.getItem('final-approach.settings'));
  await page.reload();
  await page.waitForFunction(() => window.__fa);
  const s = await page.evaluate(() => window.__fa.settings);
  assert.equal(s.units, 'metric');
  for (const t of ['F35', 'F16', 'F15', 'F18H', 'F22', 'A10', 'T38', 'H60', 'H64', 'V22']) assert.ok(s.watchlist.types.includes(t), t);
  assert.deepEqual(s.watchlist.callsigns, ['RCH']);
  // Import the exported JSON into a fresh context.
  const { ctx: ctx2, page: p2 } = await newPhone();
  await p2.goto(`${env.url}?demo=1`);
  await p2.click('#btn-settings');
  const exportFile = await page.evaluate(() => JSON.stringify({ app: 'final-approach', settings: JSON.parse(localStorage.getItem('final-approach.settings')) }));
  await p2.setInputFiles('[data-import]', { name: 'fa.json', mimeType: 'application/json', buffer: Buffer.from(exportFile) });
  await p2.waitForFunction(() => window.__fa.settings.units === 'metric');
  const s2 = await p2.evaluate(() => localStorage.getItem('final-approach.settings'));
  assert.deepEqual(JSON.parse(s2), JSON.parse(exported));
  assert.deepEqual(errors, []);
  await ctx2.close();
  await ctx.close();
});

test('military filter chip shows only military aircraft', async () => {
  const { ctx, page } = await newPhone();
  await page.goto(`${env.url}?demo=1`);
  await waitForAircraft(page, 50);
  await page.click('.chip[data-filter="military"]');
  await page.click('#tab-nearby');
  await page.waitForTimeout(400);
  const rows = await page.$$eval('#list .row', (r) => r.map((x) => x.dataset.hex));
  assert.ok(rows.length >= 1);
  const allMil = await page.evaluate((hexes) => hexes.every((h) => window.__fa.traffic.tracks.get(h).ac.military), rows);
  assert.ok(allMil);
  assert.ok(await page.$('#list .badge-mil'));
  await ctx.close();
});

test('Desktop 1440×900: side panel layout, no console errors', async () => {
  const ctx = await env.browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: SHOTS ? 2 : 1, colorScheme: 'dark' });
  await mockPhotos(ctx);
  const page = await ctx.newPage();
  const errors = watchConsole(page);
  await page.goto(`${env.url}?demo=1`);
  await waitForAircraft(page, 50);
  await page.waitForTimeout(6000);
  const box = await page.locator('#sheet').boundingBox();
  assert.ok(box.x < 40 && box.width <= 440 && box.height > 600, `panel ${JSON.stringify(box)}`);
  assert.ok(await renderedAircraft(page) > 10);
  const hex = await page.evaluate(() => [...window.__fa.traffic.tracks.values()].find((t) => t.inRadius && t.spot.status === 'inbound' && !t.hex.startsWith('~')).hex);
  await page.click(`#list .row[data-hex="${hex}"]`);
  await page.waitForSelector('#detail .hero img', { timeout: 8000 });
  await page.waitForTimeout(1200);
  await shot(page, 'desktop');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('polling pauses while hidden and resumes when visible', async () => {
  const { ctx, page } = await newPhone();
  await page.goto(`${env.url}?demo=1`);
  await waitForAircraft(page, 10);
  await hideDocument(page, true);
  assert.equal(await page.evaluate(() => window.__fa.feed.paused), true);
  assert.equal(await page.getAttribute('.status-dot', 'data-state'), 'paused');
  await hideDocument(page, false);
  assert.equal(await page.evaluate(() => window.__fa.feed.paused), false);
  await ctx.close();
});

test('PWA: manifest, service worker and offline reload from the subpath', async () => {
  const ctx = await env.browser.newContext({ viewport: { width: 390, height: 844 } });
  await mockPhotos(ctx);
  const page = await ctx.newPage();
  await page.goto(`${env.url}?demo=1`);
  const manifest = await page.evaluate(async () => (await fetch(document.querySelector('link[rel=manifest]').href)).json());
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './');
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  assert.ok(scope.endsWith('/final-approach/'), scope);
  // Reload once so the page is controlled, then go offline and reload again.
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  await waitForAircraft(page, 10);
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => window.__fa && document.querySelector('#summary'));
  await waitForAircraft(page, 10, 20000);
  await ctx.setOffline(false);
  await ctx.close();
});
