// Final Approach — minimal CORS pass-through proxy (Cloudflare Worker).
//
// Why: the free ADS-B providers (airplanes.live, adsb.lol, adsb.fi) do not send
// CORS headers, so browsers block direct requests from a GitHub Pages site.
// This worker forwards requests to those three hosts ONLY and adds CORS.
//
// URL shape:  https://<your-worker>.workers.dev/<provider-host>/<path>
//   e.g.      https://fa-proxy.example.workers.dev/api.adsb.lol/v2/lat/33.3/lon/-111.6/dist/15
//
// Allowed: GET to the three hosts; POST only to api.adsb.lol/api/0/routeset.
// Optional: set ALLOWED_ORIGINS (comma separated, e.g. "https://you.github.io")
// as a Worker variable to restrict which sites may use your proxy.
// No logging, no storage, no keys.

const ALLOWED_HOSTS = new Set(['api.airplanes.live', 'api.adsb.lol', 'opendata.adsb.fi']);
const POST_ALLOWED = new Set(['api.adsb.lol/api/0/routeset']);
const MAX_BODY = 16 * 1024;

function corsHeaders(origin, allowedOrigins) {
  const allow = !allowedOrigins.length || allowedOrigins.includes(origin) ? (origin || '*') : 'null';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export async function handle(request, env = {}) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin') || '';
  const allowedOrigins = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const cors = corsHeaders(origin, allowedOrigins);
  const deny = (status, msg) => new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

  if (allowedOrigins.length && origin && !allowedOrigins.includes(origin)) return deny(403, 'origin not allowed');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  // "/api.adsb.lol/v2/..." → host + path
  const rest = url.pathname.replace(/^\/+/, '');
  const slash = rest.indexOf('/');
  const host = (slash === -1 ? rest : rest.slice(0, slash)).toLowerCase();
  const path = slash === -1 ? '/' : rest.slice(slash);
  if (!ALLOWED_HOSTS.has(host)) return deny(400, 'host not allowed');
  if (path.includes('..')) return deny(400, 'bad path');

  let body;
  if (request.method === 'POST') {
    if (!POST_ALLOWED.has(host + path)) return deny(405, 'POST not allowed for this path');
    body = await request.text();
    if (body.length > MAX_BODY) return deny(413, 'body too large');
  } else if (request.method !== 'GET') {
    return deny(405, 'method not allowed');
  }

  const upstream = await fetch(`https://${host}${path}${url.search}`, {
    method: request.method,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      'User-Agent': 'FinalApproach-proxy/1.0 (+self-hosted Cloudflare Worker for the Final Approach PWA)',
    },
    body,
  });

  const headers = new Headers(cors);
  headers.set('Content-Type', upstream.headers.get('Content-Type') || 'application/json');
  headers.set('Cache-Control', 'no-store');
  const ra = upstream.headers.get('Retry-After');
  if (ra) {
    headers.set('Retry-After', ra);
    headers.set('Access-Control-Expose-Headers', 'Retry-After');
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}

export default {
  fetch: (request, env) => handle(request, env).catch(() =>
    new Response(JSON.stringify({ error: 'upstream failed' }), {
      status: 502,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
    })),
};
