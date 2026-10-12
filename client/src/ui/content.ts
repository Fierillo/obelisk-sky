// Message content → DOM, built node by node (never innerHTML).
//
// - mentions: obelisk-dex's legacy `nostr:npub1<hex>`, bech32 `npub1…` /
//   `nprofile1…` (with or without `nostr:`) → an @name chip
// - event refs (`note1…`, `nevent1…`, `naddr1…`) → a short "note" chip
// - image URLs (by extension or announced in `imeta`) → <img>, video → <video>
// - other https links → a link showing only the host
// - NIP-30 `:shortcode:` with an `emoji` tag → <img class="emoji">

import { nip19 } from 'nostr-tools';

export type Token =
  | { t: 'text'; v: string }
  | { t: 'mention'; pubkey: string }
  | { t: 'note'; ref: string }
  | { t: 'image'; url: string }
  | { t: 'video'; url: string }
  | { t: 'link'; url: string; host: string }
  | { t: 'emoji'; code: string; url: string }
  | { t: 'game'; id: string }
  | { t: 'app'; id: string };

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif)(\?[^\s]*)?$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v)(\?[^\s]*)?$/i;
const BECH = '[02-9ac-hj-np-z]';
const TOKEN_RE = new RegExp(
  [
    'nostr:npub1([0-9a-f]{64})(?![0-9a-z])', // 1: legacy hex mention
    `(?:nostr:)?((?:npub1|nprofile1)${BECH}{20,})`, // 2: bech32 profile
    `(?:nostr:)?((?:note1|nevent1|naddr1)${BECH}{20,})`, // 3: event ref
    '(https?:\\/\\/[^\\s<>"\']+[^\\s<>"\'.,;:!?)\\]])', // 4: url
    ':([\\w-]{1,64}):', // 5: shortcode
    '\\[\\[(game|app):([0-9a-f]{64})\\]\\]', // 6,7: obelisk-dex game / app marker
  ].join('|'),
  'gi',
);

function profilePubkey(bech: string): string | null {
  try {
    const d = nip19.decode(bech.toLowerCase());
    if (d.type === 'npub') return d.data;
    if (d.type === 'nprofile') return d.data.pubkey;
  } catch { /* not a profile */ }
  return null;
}

export function tokenize(content: string, opts: { images?: string[]; emojis?: Record<string, string> } = {}): Token[] {
  const out: Token[] = [];
  const images = new Set(opts.images ?? []);
  let last = 0;
  const push = (tok: Token) => {
    const prev = out[out.length - 1];
    if (tok.t === 'text' && prev?.t === 'text') prev.v += tok.v;
    else out.push(tok);
  };
  for (const m of content.matchAll(TOKEN_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) push({ t: 'text', v: content.slice(last, idx) });
    last = idx + m[0].length;
    if (m[1]) { push({ t: 'mention', pubkey: m[1].toLowerCase() }); continue; }
    if (m[2]) {
      const pk = profilePubkey(m[2]);
      push(pk ? { t: 'mention', pubkey: pk } : { t: 'text', v: m[0] });
      continue;
    }
    if (m[3]) { push({ t: 'note', ref: m[3] }); continue; }
    if (m[4]) {
      const url = m[4];
      let host = '';
      try { host = new URL(url).host.replace(/^www\./, ''); } catch { push({ t: 'text', v: url }); continue; }
      if (!/^https:/i.test(url)) { push({ t: 'link', url, host }); continue; }
      if (images.has(url) || IMAGE_EXT.test(url)) push({ t: 'image', url });
      else if (VIDEO_EXT.test(url)) push({ t: 'video', url });
      else push({ t: 'link', url, host });
      continue;
    }
    if (m[6]) { push(m[6] === 'game' ? { t: 'game', id: m[7] } : { t: 'app', id: m[7] }); continue; }
    if (m[5]) {
      const url = opts.emojis?.[m[5]];
      push(url ? { t: 'emoji', code: m[5], url } : { t: 'text', v: m[0] });
    }
  }
  if (last < content.length) push({ t: 'text', v: content.slice(last) });
  return out;
}

export interface RenderOpts {
  nameOf: (pk: string) => string;
  images?: string[];
  emojis?: Record<string, string>;
  onMention?: (pk: string) => void;
  onImage?: (url: string) => void;
  onGame?: (id: string) => void;
}

export function renderContent(el: HTMLElement, content: string, opts: RenderOpts): void {
  el.replaceChildren();
  const media: HTMLElement[] = [];
  for (const tok of tokenize(content, opts)) {
    switch (tok.t) {
      case 'text': el.append(document.createTextNode(tok.v)); break;
      case 'mention': {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'mention';
        b.textContent = `@${opts.nameOf(tok.pubkey)}`;
        // The bubble or message around it has a click of its own (reply): the chip is the person.
        b.addEventListener('click', (e) => { e.stopPropagation(); opts.onMention?.(tok.pubkey); });
        el.append(b);
        break;
      }
      case 'note': {
        const a = document.createElement('a');
        a.className = 'note-ref';
        a.href = `https://njump.me/${tok.ref}`;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = 'note';
        el.append(a);
        break;
      }
      case 'link': {
        const a = document.createElement('a');
        a.href = tok.url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer nofollow';
        a.textContent = tok.host;
        a.title = tok.url;
        el.append(a);
        break;
      }
      case 'emoji': {
        const img = document.createElement('img');
        img.className = 'emoji';
        img.src = tok.url;
        img.alt = `:${tok.code}:`;
        img.title = `:${tok.code}:`;
        img.referrerPolicy = 'no-referrer';
        el.append(img);
        break;
      }
      case 'image': {
        const img = document.createElement('img');
        img.className = 'msg-img';
        img.src = tok.url;
        img.alt = '';
        img.loading = 'lazy';
        img.referrerPolicy = 'no-referrer';
        img.addEventListener('click', () => (opts.onImage ? opts.onImage(tok.url) : window.open(tok.url, '_blank', 'noopener')));
        img.onerror = () => img.replaceWith(Object.assign(document.createElement('a'), { href: tok.url, target: '_blank', rel: 'noopener noreferrer', textContent: 'image' }));
        media.push(img);
        break;
      }
      case 'game':
      case 'app': {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'game-chip';
        b.textContent = tok.t === 'game' ? 'Game table' : 'App';
        b.title = tok.t === 'game' ? 'A game started in this channel' : 'An app shared in this channel';
        b.addEventListener('click', () => opts.onGame?.(tok.id));
        el.append(b);
        break;
      }
      case 'video': {
        const v = document.createElement('video');
        v.className = 'msg-img';
        v.src = tok.url;
        v.controls = true;
        v.preload = 'metadata';
        v.playsInline = true;
        media.push(v);
        break;
      }
    }
  }
  // `imeta` images that the text never linked still belong to the message.
  for (const url of opts.images ?? []) {
    if (!content.includes(url)) {
      const img = document.createElement('img');
      img.className = 'msg-img';
      img.src = url;
      img.alt = '';
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      media.push(img);
    }
  }
  if (media.length) {
    const wrap = document.createElement('div');
    wrap.className = 'msg-media';
    wrap.append(...media);
    el.append(wrap);
  }
}
