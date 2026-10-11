// sky.obelisk.ar: static host for the client, plus the chat's link unfurler.
//
// v2 has no relay connection and no keys on the server: the browser logs in
// with the user's own signer and talks to the relay itself.
//
//   GET /                  built client (dist/client)
//   GET /healthz           JSON status
//   GET /api/link-preview  OpenGraph unfurl for chat links (server/linkPreview.ts)

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, statSync, createReadStream } from 'node:fs';
import { join, normalize, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleLinkPreview } from './linkPreview';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 3024);
const HOST = process.env.HOST || '127.0.0.1';
const STATIC_DIR = join(ROOT, 'dist', 'client');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.glb': 'model/gltf-binary',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.stl': 'model/stl',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

// The model loader reads textures embedded in .glb files through blob: URLs
// and decodes meshopt geometry with WebAssembly ('wasm-unsafe-eval' allows
// compiling wasm, not eval of script). The client connects to relays (wss:) and loads profile pictures from
// anywhere (img-src https:). Scripts and styles are first-party only, plus
// Google Fonts for the bubble typefaces.
export const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'microphone=(self), camera=()',
  'content-security-policy':
    "default-src 'self'; img-src 'self' data: blob: https:; media-src 'self' blob:; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; " +
    "connect-src 'self' wss: https: blob: data:; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; frame-ancestors 'self'",
};

export function resolveStatic(pathname: string): { file: string; rel: string } | null {
  let rel: string;
  try {
    rel = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  } catch {
    return null;
  }
  if (rel === '/' || rel === '') rel = '/index.html';
  let file = join(STATIC_DIR, rel);
  if (!file.startsWith(STATIC_DIR)) return null;
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(STATIC_DIR, 'index.html');
  return { file, rel };
}

function serveStatic(req: IncomingMessage, res: ServerResponse, pathname: string): void {
  const hit = resolveStatic(pathname);
  if (!hit) { res.writeHead(400).end(); return; }
  if (!existsSync(hit.file)) { res.writeHead(503).end('client not built'); return; }
  const type = MIME[extname(hit.file)] || 'application/octet-stream';
  const immutable = hit.rel.startsWith('/assets/') || hit.rel.startsWith('/models/');
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    'content-type': type,
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  if (req.method === 'HEAD') { res.end(); return; }
  createReadStream(hit.file).pipe(res);
}

const server = createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://x');
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, built: existsSync(join(STATIC_DIR, 'index.html')) }));
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
  if (url.pathname === '/api/link-preview') {
    handleLinkPreview(req, res, url).catch(() => { if (!res.headersSent) res.writeHead(500).end(); });
    return;
  }
  serveStatic(req, res, url.pathname);
});

if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, HOST, () => console.log(`obelisk-sky static on http://${HOST}:${PORT}`));
  for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { server.close(); process.exit(0); });
}
