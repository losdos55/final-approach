#!/usr/bin/env node
// Tiny static dev server that mimics GitHub Pages project hosting:
// the app is served under /final-approach/ (configurable) so relative paths
// are exercised exactly as in production.
//
//   node scripts/serve.mjs [--port 8080] [--base /final-approach/]

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1]]);
    return acc;
  }, [])
);
const PORT = Number(args.port ?? process.env.PORT ?? 8080);
let BASE = args.base ?? '/final-approach/';
if (!BASE.endsWith('/')) BASE += '/';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

export function startServer({ port = PORT, base = BASE, quiet = false } = {}) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let path = decodeURIComponent(url.pathname);
    if (path === '/' || path === base.slice(0, -1)) {
      res.writeHead(302, { Location: base });
      return res.end();
    }
    if (!path.startsWith(base)) {
      res.writeHead(404);
      return res.end('Not found (app is served under ' + base + ')');
    }
    path = path.slice(base.length) || 'index.html';
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(ROOT, path));
    if (!file.startsWith(ROOT) || /(^|\/)\.(git|env)/.test(path)) {
      res.writeHead(403);
      return res.end();
    }
    try {
      const st = await stat(file);
      if (!st.isFile()) throw new Error('not a file');
      const body = await readFile(file);
      res.writeHead(200, {
        'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': 'no-cache',
        ...(path === 'sw.js' ? { 'Service-Worker-Allowed': base } : {}),
      });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
    if (!quiet) console.log(req.method, req.url);
  });
  return new Promise((r) => server.listen(port, () => r(server)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await startServer();
  console.log(`Final Approach: http://localhost:${PORT}${BASE}  (demo: ${BASE}?demo=1)`);
}
