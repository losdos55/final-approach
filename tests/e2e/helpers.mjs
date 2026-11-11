// Shared Playwright setup for the e2e tests (uses the Playwright library
// directly with node:test — no extra npm dependencies).
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { startServer } from '../../scripts/serve.mjs';

const require = createRequire(import.meta.url);
export const { chromium } = require('playwright');

export const BASE = '/final-approach/';
const PHOTO = readFileSync(new URL('../../icons/icon-512.png', import.meta.url));

export async function setup(port) {
  const server = await startServer({ port, base: BASE, quiet: true });
  const launch = { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] };
  if (process.env.HTTPS_PROXY) launch.proxy = { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' };
  const browser = await chromium.launch(launch);
  return {
    url: `http://localhost:${port}${BASE}`,
    browser,
    async close() {
      await browser.close();
      server.close();
    },
  };
}

/** Mock planespotters: every aircraft has a photo by a fictional photographer. */
export async function mockPhotos(ctx, seen = []) {
  await ctx.route('https://api.planespotters.net/**', (route) => {
    seen.push({ url: route.request().url(), t: Date.now() });
    const hex = route.request().url().split('/').pop();
    return route.fulfill({
      status: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        photos: [{
          id: '1',
          thumbnail: { src: `https://t.plnspttrs.net/test/${hex}_s.png`, size: { width: 200, height: 133 } },
          thumbnail_large: { src: `https://t.plnspttrs.net/test/${hex}_l.png`, size: { width: 420, height: 280 } },
          link: `https://www.planespotters.net/photo/test-${hex}`,
          photographer: 'Test Photographer',
        }],
      }),
    });
  });
  await ctx.route('https://t.plnspttrs.net/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PHOTO }));
}

/** Collect console errors / page errors. */
export function watchConsole(page) {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

export async function waitForAircraft(page, min = 10, timeout = 15000) {
  await page.waitForFunction((n) => (window.__fa?.traffic.tracks.size ?? 0) >= n, min, { timeout });
}

export async function renderedAircraft(page) {
  return page.evaluate(() => {
    const m = window.__fa.map;
    if (!m.getLayer('fa-aircraft')) return 0;
    return m.queryRenderedFeatures({ layers: ['fa-aircraft'] }).length;
  });
}

export async function hideDocument(page, hidden) {
  await page.evaluate((h) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}
