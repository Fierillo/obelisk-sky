// Turn a kind 9 body into a short, safe line for a speech bubble.
//
// Browsers render this with textContent, so this is about readability and
// not leaking identifiers: npubs become @names, event refs and long hex
// become placeholders, links shrink to their host.

import { nip19 } from 'nostr-tools';

export const MAX_TEXT = 280;

const NOSTR_URI = /nostr:(npub1[02-9ac-hj-np-z]+|nprofile1[02-9ac-hj-np-z]+|note1[02-9ac-hj-np-z]+|nevent1[02-9ac-hj-np-z]+|naddr1[02-9ac-hj-np-z]+)/gi;
// obelisk-dex writes mentions as `nostr:npub1<64-hex>` (serializeMention),
// which is not bech32; read it before the bech32 forms.
const LEGACY_MENTION = /nostr:npub1([0-9a-f]{64})(?![0-9a-z])/gi;
const BARE_NPUB = /\b(npub1[02-9ac-hj-np-z]{58})\b/gi;
const URL_RE = /https?:\/\/[^\s<>"')]+/gi;
const HEX64 = /\b[0-9a-f]{64}\b/gi;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg)(\?|#|$)/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v)(\?|#|$)/i;
const AUDIO_EXT = /\.(mp3|ogg|oga|wav|m4a|opus|weba)(\?|#|$)/i;

export function shortNpub(pubkey: string): string {
  try {
    const n = nip19.npubEncode(pubkey);
    return `${n.slice(0, 9)}…${n.slice(-4)}`;
  } catch {
    return 'someone';
  }
}

function pubkeyOf(bech: string): string | null {
  try {
    const d = nip19.decode(bech.toLowerCase());
    if (d.type === 'npub') return d.data;
    if (d.type === 'nprofile') return d.data.pubkey;
  } catch { /* not decodable */ }
  return null;
}

const BARE_NPROFILE = /\b(nprofile1[02-9ac-hj-np-z]{20,})\b/gi;
const HEX_PUBKEY = /^[0-9a-f]{64}$/;

/**
 * Pubkeys a message refers to, for profile fetches: `nostr:npub1<hex>`
 * (obelisk-dex's own form), `nostr:` npub / nprofile, bare npub / nprofile,
 * and, when given, the event's `p` tags.
 */
export function mentionedPubkeys(content: string, tags: readonly string[][] = []): string[] {
  const out = new Set<string>();
  for (const m of content.matchAll(LEGACY_MENTION)) out.add(m[1].toLowerCase());
  const rest = content.replace(LEGACY_MENTION, '');
  for (const m of rest.matchAll(NOSTR_URI)) {
    const pk = pubkeyOf(m[1]);
    if (pk) out.add(pk);
  }
  const bare = rest.replace(NOSTR_URI, '');
  for (const re of [BARE_NPUB, BARE_NPROFILE]) {
    for (const m of bare.matchAll(re)) {
      const pk = pubkeyOf(m[1]);
      if (pk) out.add(pk);
    }
  }
  for (const t of tags) {
    if (t[0] === 'p' && typeof t[1] === 'string' && HEX_PUBKEY.test(t[1])) out.add(t[1]);
  }
  return [...out];
}

export function sanitizeText(content: string, nameOf: (pubkey: string) => string): string {
  let s = content;
  s = s.replace(LEGACY_MENTION, (_all, hex: string) => `@${nameOf(hex.toLowerCase())}`);
  s = s.replace(NOSTR_URI, (_all, bech: string) => {
    const pk = pubkeyOf(bech);
    if (pk) return `@${nameOf(pk)}`;
    return '[note]';
  });
  s = s.replace(BARE_NPUB, (bech: string) => {
    const pk = pubkeyOf(bech);
    return pk ? `@${nameOf(pk)}` : bech;
  });
  s = s.replace(URL_RE, (url) => {
    if (IMAGE_EXT.test(url)) return '[image]';
    if (VIDEO_EXT.test(url)) return '[video]';
    if (AUDIO_EXT.test(url)) return '[voice note]';
    try {
      return `[${new URL(url).host.replace(/^www\./, '')}]`;
    } catch {
      return '[link]';
    }
  });
  s = s.replace(/\[\[game:[0-9a-f]{64}\]\]/gi, '[game table]').replace(/\[\[app:[0-9a-f]{64}\]\]/gi, '[app]');
  s = s.replace(HEX64, (h) => `${h.slice(0, 6)}…`);
  // Markdown noise that reads badly in a bubble.
  s = s.replace(/```[\s\S]*?```/g, '[code]').replace(/[*_~`>#]+/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  if (!s) return '…';
  if ([...s].length > MAX_TEXT) s = [...s].slice(0, MAX_TEXT - 1).join('') + '…';
  return s;
}

/** A kind 0 display name, cleaned to one short line. */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.replace(/[\u0000-\u001f\u007f​-‏‪-‮]/g, '').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  return [...s].slice(0, 32).join('');
}
