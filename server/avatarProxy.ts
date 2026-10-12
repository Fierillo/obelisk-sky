// GET /api/avatar?url=…: a profile picture, same-origin. The village draws
// pictures into WebGL (the badge over a character's head), which needs CORS
// from the picture's host; many Nostr hosts don't send it, and those people
// would only ever show a letter. The client asks the host directly first and
// comes here only when that fails.
//
// Same guards as the link preview (vendored safe-fetch): every hop's host must
// be public, redirects are followed by hand, a size cap and a timeout. Only
// raster images go out (no SVG: served from our origin it could run script),
// with nosniff from the server's own headers. A small memory cache and its
// own per-IP budget keep it from becoming an open proxy.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { assertPublicHost } from '@/services/server/link-preview/safe-fetch';
import { FETCH_TIMEOUT_MS, MAX_REDIRECTS, UA } from '@/constants/server/link-preview';

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const RASTER = /^image\/(png|jpe?g|gif|webp|avif)$/;
const RATE_LIMIT = 240;
const RATE_WINDOW_MS = 10 * 60_000;
const CACHE_MAX = 400;
const CACHE_TTL_MS = 60 * 60_000;

type Entry = { at: number; type: string; body: Buffer } | { at: number; type: null; body: null };
const cache = new Map<string, Entry>();
const hits = new Map<string, { count: number; resetAt: number }>();

/** A picture URL we'd fetch: http(s) only, no credentials, no odd ports. */
export function avatarTarget(raw: string | null): URL | null {
  if (!raw || raw.length > 2048) return null;
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.username || u.password) return null;
  if (u.port && u.port !== '80' && u.port !== '443') return null;
  return u;
}

/** Only raster images: the content type, without parameters, must be one we draw. */
export function rasterType(header: string | null): string | null {
  const t = (header ?? '').split(';')[0].trim().toLowerCase();
  return RASTER.test(t) ? t : null;
}

function limited(ip: string): boolean {
  const now = Date.now();
  const e = hits.get(ip);
  if (!e || now > e.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    if (hits.size > 5_000) for (const [k, v] of hits) if (now > v.resetAt) hits.delete(k);
    return false;
  }
  return ++e.count > RATE_LIMIT;
}

function clientIp(req: IncomingMessage): string {
  const h = (k: string) => { const v = req.headers[k]; return Array.isArray(v) ? v[0] : v; };
  return h('cf-connecting-ip') ?? h('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}

async function fetchImage(start: string): Promise<{ type: string; body: Buffer } | null> {
  let current = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const u = avatarTarget(current);
    if (!u) return null;
    await assertPublicHost(u.hostname);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
    try {
      const r = await fetch(current, { redirect: 'manual', signal: ctl.signal, headers: { 'user-agent': UA, accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif' } });
      if (r.status >= 300 && r.status < 400) {
        const loc = r.headers.get('location');
        if (!loc) return null;
        current = new URL(loc, current).toString();
        continue;
      }
      const type = rasterType(r.headers.get('content-type'));
      if (!r.ok || !type || !r.body) return null;
      if (Number(r.headers.get('content-length') ?? 0) > AVATAR_MAX_BYTES) return null;
      const reader = r.body.getReader();
      const chunks: Buffer[] = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > AVATAR_MAX_BYTES) { await reader.cancel(); return null; }
        chunks.push(Buffer.from(value));
      }
      return { type, body: Buffer.concat(chunks) };
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

export async function handleAvatar(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const target = avatarTarget(url.searchParams.get('url'));
  if (!target) { res.writeHead(400).end(); return; }
  const key = target.toString();
  const now = Date.now();
  let hit = cache.get(key);
  if (hit && now - hit.at > CACHE_TTL_MS) { cache.delete(key); hit = undefined; }
  if (!hit) {
    if (limited(clientIp(req))) { res.writeHead(429).end(); return; }
    let got: { type: string; body: Buffer } | null = null;
    try { got = await fetchImage(key); } catch { got = null; }
    hit = got ? { at: now, ...got } : { at: now, type: null, body: null };
    cache.set(key, hit);
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
  }
  if (!hit.type) { res.writeHead(404, { 'cache-control': 'public, max-age=600' }).end(); return; }
  res.writeHead(200, { 'content-type': hit.type, 'content-length': String(hit.body.length), 'cache-control': 'public, max-age=86400', 'content-security-policy': "default-src 'none'; sandbox" });
  res.end(req.method === 'HEAD' ? undefined : hit.body);
}
