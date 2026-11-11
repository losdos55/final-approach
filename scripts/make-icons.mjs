#!/usr/bin/env node
// Renders icons/icon.svg into the PNG sizes the manifest and iOS need, using
// the pre-installed Playwright Chromium (dev-only tooling).
//
//   node scripts/make-icons.mjs

import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const svg = await readFile(new URL('../icons/icon.svg', import.meta.url), 'utf8');

const targets = [
  { file: 'icons/icon-192.png', size: 192, pad: 0, radius: 0 },
  { file: 'icons/icon-512.png', size: 512, pad: 0, radius: 0 },
  // Maskable: keep the artwork inside the 80% safe zone; background is full-bleed.
  { file: 'icons/icon-maskable-512.png', size: 512, pad: 0.1, radius: 0 },
  { file: 'icons/apple-touch-icon.png', size: 180, pad: 0, radius: 0 },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const t of targets) {
  const inner = Math.round(t.size * (1 - t.pad * 2));
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(`<!doctype html><html><body style="margin:0;background:#03060a;display:grid;place-items:center;width:${t.size}px;height:${t.size}px;overflow:hidden">
    <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`);
  await page.screenshot({ path: t.file, omitBackground: false });
  console.log('wrote', t.file);
}
await browser.close();
