#!/usr/bin/env node
// Manual live sanity check: runs the Cloudflare Worker code locally as a proxy
// (http://localhost:8787), opens the app against REAL provider data in
// headless Chromium, and compares the app's aircraft count with a direct API
// call for the same area. Optionally saves a screenshot.
//
//   NODE_USE_ENV_PROXY=1 node scripts/live-check.mjs [--seconds 20] [--shot docs/screenshots/live.png]

import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { handle } from '../proxy/cloudflare-worker.js';
import { startServer } from './serve.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, c, i, arr) => (c.startsWith('--') && a.push([c.slice(2), arr[i + 1]]), a), []));
const seconds = Number(args.seconds ?? 20);
const { chromium } = createRequire(import.meta.url)('playwright');

// Local proxy using the worker's handler.
const proxy = createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const request = new Request(`http://localhost:8787${req.url}`, {
    method: req.method,
    headers: req.headers,
    body: ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? undefined : body,
  });
  const r = await handle(request, {});
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(Buffer.from(await r.arrayBuffer()));
});
await new Promise((r) => proxy.listen(8787, r));
const app = await startServer({ port: 8090, quiet: true });

const launch = {};
if (process.env.HTTPS_PROXY) launch.proxy = { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' };
const browser = await chromium.launch({ ...launch, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark' });
await ctx.addInitScript(() => {
  if (!localStorage.getItem('final-approach.settings')) {
    localStorage.setItem('final-approach.settings', JSON.stringify({ version: 2, proxyUrl: 'http://localhost:8787' }));
  }
});
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const requests = [];
page.on('request', (r) => { if (/localhost:8787|planespotters/.test(r.url())) requests.push({ url: r.url(), t: Date.now() }); });

const t0 = Date.now();
await page.goto('http://localhost:8090/final-approach/?nosw');
await page.waitForFunction(() => (window.__fa?.traffic.tracks.size ?? 0) > 0, null, { timeout: 15000 });
console.log(`first aircraft after ${Date.now() - t0} ms`);
await page.waitForTimeout(seconds * 1000);

const stats = await page.evaluate(() => {
  const t = [...window.__fa.traffic.tracks.values()];
  return {
    total: t.length,
    inRadius: t.filter((x) => x.inRadius).length,
    provider: window.__fa.ui.get().status.provider,
    inbound: t.filter((x) => x.inRadius && x.spot.status === 'inbound').map((x) => `${x.ac.callsign || x.hex} ${x.ac.type} ${Math.round(x.spot.distNm)}nm eta ${x.spot.eta?.toFixed(1)}`),
    outbound: t.filter((x) => x.inRadius && x.spot.status === 'outbound').map((x) => `${x.ac.callsign || x.hex} ${x.ac.type}`),
  };
});
console.log(stats);

// Select the nearest inbound (or nearest) aircraft to exercise photo + bubble + trail.
const hex = await page.evaluate(() => {
  const t = [...window.__fa.traffic.tracks.values()].filter((x) => x.inRadius && !x.ac.onGround).sort((a, b) => (a.spot.status === 'inbound' ? -1 : 1) - (b.spot.status === 'inbound' ? -1 : 1) || a.spot.distNm - b.spot.distNm)[0];
  if (t) window.__fa.select(t.hex, { fly: true });
  return t?.hex;
});
await page.waitForTimeout(6000);
const photo = await page.evaluate(() => ({
  hero: document.querySelector('#detail .hero img')?.src ?? document.querySelector('#detail .hero')?.textContent.trim(),
  credit: document.querySelector('#detail .credit')?.textContent,
}));
console.log('selected', hex, photo);
if (args.shot) await page.screenshot({ path: args.shot });

// Compare with a direct request for the same query.
const s = await page.evaluate(() => window.__fa.settings);
const direct = await fetch(`https://api.adsb.lol/v2/lat/${s.airport.lat}/lon/${s.airport.lon}/dist/${s.radiusNm + 5}`).then((r) => r.json()).catch(() => null);
console.log('direct adsb.lol count:', direct?.ac?.length, 'app count:', stats.total);

const byHost = {};
for (const r of requests) {
  const host = r.url.includes('planespotters') ? 'planespotters' : r.url.split('/')[3];
  (byHost[host] ??= []).push(r.t);
}
for (const [h, ts] of Object.entries(byHost)) {
  const gaps = ts.slice(1).map((t, i) => t - ts[i]);
  console.log(`${h}: ${ts.length} requests, min gap ${gaps.length ? Math.min(...gaps) : '-'} ms`);
}
console.log('console errors:', errors);
await browser.close();
proxy.close();
app.close();
