// Runs the Cloudflare Worker handler in Node with a stubbed upstream fetch.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../../proxy/cloudflare-worker.js';

let calls;
const realFetch = globalThis.fetch;
beforeEach(() => {
  calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response('{"ac":[]}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
});
afterEach(() => { globalThis.fetch = realFetch; });

const req = (path, init = {}) => new Request(`https://proxy.example.dev${path}`, {
  ...init,
  headers: { Origin: 'https://user.github.io', ...(init.headers || {}) },
});

test('forwards GET to an allowed host and adds CORS', async () => {
  const res = await handle(req('/api.adsb.lol/v2/lat/33.3/lon/-111.6/dist/15'));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://user.github.io');
  assert.equal(calls[0].url, 'https://api.adsb.lol/v2/lat/33.3/lon/-111.6/dist/15');
  assert.equal(calls[0].init.method, 'GET');
});

test('all three providers are allowed', async () => {
  for (const h of ['api.airplanes.live', 'api.adsb.lol', 'opendata.adsb.fi']) {
    const res = await handle(req(`/${h}/v2/mil`));
    assert.equal(res.status, 200, h);
  }
});

test('rejects other hosts', async () => {
  const res = await handle(req('/evil.example.com/steal'));
  assert.equal(res.status, 400);
  assert.equal(calls.length, 0);
});

test('POST only to routeset', async () => {
  const ok = await handle(req('/api.adsb.lol/api/0/routeset', { method: 'POST', body: '{"planes":[]}', headers: { 'Content-Type': 'application/json' } }));
  assert.equal(ok.status, 200);
  assert.equal(calls[0].init.body, '{"planes":[]}');
  const bad = await handle(req('/api.adsb.lol/v2/mil', { method: 'POST', body: '{}' }));
  assert.equal(bad.status, 405);
  const put = await handle(req('/api.adsb.lol/v2/mil', { method: 'PUT', body: '{}' }));
  assert.equal(put.status, 405);
});

test('preflight answers 204 with CORS headers', async () => {
  const res = await handle(req('/api.adsb.lol/api/0/routeset', { method: 'OPTIONS' }));
  assert.equal(res.status, 204);
  assert.match(res.headers.get('Access-Control-Allow-Methods'), /POST/);
});

test('ALLOWED_ORIGINS restricts callers', async () => {
  const env = { ALLOWED_ORIGINS: 'https://me.github.io' };
  const res = await handle(req('/api.adsb.lol/v2/mil'), env);
  assert.equal(res.status, 403);
  const ok = await handle(req('/api.adsb.lol/v2/mil', { headers: { Origin: 'https://me.github.io' } }), env);
  assert.equal(ok.status, 200);
});
