// GET /api/link-preview?url=…: obelisk-dex's OpenGraph unfurler
// (src/app/api/link-preview/route.ts), served by sky's own static server so
// a link a reader only views reaches the third-party site from here, never
// from the reader's browser or an OG service. The SSRF guards (private
// network block, hand-followed redirects, size cap), per-IP rate limit,
// cache and the x.com oEmbed path are the app's own modules, vendored.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { isX, type LinkPreview } from '@/utils/link-preview/link-preview';
import { cachedPreview, storePreview } from '@/services/server/link-preview/preview-cache';
import { previewGeneric } from '@/services/server/link-preview/preview-generic';
import { previewX } from '@/services/server/link-preview/preview-x';
import { rateLimited } from '@/services/server/link-preview/rate-limit';

function json(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'content-type': 'application/json', ...headers }).end(JSON.stringify(body));
}

function clientIp(req: IncomingMessage): string {
  const h = (k: string) => {
    const v = req.headers[k];
    return Array.isArray(v) ? v[0] : v;
  };
  return h('cf-connecting-ip') ?? h('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}

export async function handleLinkPreview(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  if (rateLimited(clientIp(req))) return json(res, 429, { error: 'rate limited' });
  const target = url.searchParams.get('url');
  if (!target) return json(res, 400, { error: 'url required' });
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return json(res, 400, { error: 'invalid url' });
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return json(res, 400, { error: 'unsupported scheme' });

  const key = parsed.toString();
  const cached = cachedPreview(key);
  if (cached) {
    return json(res, cached.value ? 200 : 404, cached.value ?? { error: 'no preview' }, { 'cache-control': 'public, max-age=3600' });
  }
  let preview: LinkPreview | null = null;
  try {
    preview = isX(parsed.hostname) ? await previewX(key, parsed) : await previewGeneric(key);
  } catch {
    preview = null;
  }
  storePreview(key, preview);
  if (!preview) return json(res, 404, { error: 'no preview' });
  json(res, 200, preview, { 'cache-control': 'public, max-age=3600' });
}
