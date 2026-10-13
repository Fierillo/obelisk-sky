// `/zap [who] [amount]`, as obelisk-dex reads it (services/wallet/parse-zap-command.ts):
//   /zap                → the message being answered, else the last one from someone else
//   /zap 100            → the same, with the amount
//   /zap <npub|hex|@name> [amount] → that person (their latest message here, if any)
// A name that fits more than one person is refused, never guessed: anyone can
// take a name, and money must not reach an impostor.

import { npubToHex } from '@nostr-wot/data';
import { vw, type VillageWords } from '../i18n/village';

export interface ZapTarget { recipient: string; messageId: string | null; sats: number | null }
export type ZapCommandError = 'ambiguous' | 'unknown-user' | 'no-target' | 'self';
export type ZapCommand = { ok: true; target: ZapTarget } | { ok: false; error: ZapCommandError; token?: string };

export interface ZapContext {
  messages: readonly { id: string; pubkey: string }[];
  me: string | null;
  replyingTo: { id: string; pubkey: string } | null;
  /** People who could be meant by name: the channel's members and posters. */
  people: readonly { pubkey: string; names: readonly string[] }[];
}

export const isZapCommand = (text: string): boolean => /^\/zap(\s|$)/i.test(text.trim());

export function parseZapCommand(text: string, ctx: ZapContext): ZapCommand {
  const args = text.trim().replace(/^\/zap/i, '').trim().split(/\s+/).filter(Boolean);
  let sats: number | null = null;
  if (args.length && /^\d+$/.test(args[args.length - 1])) sats = parseInt(args.pop()!, 10);
  const token = args.join(' ');
  let recipient: string | null;
  if (token) {
    const r = resolve(token, ctx.people);
    if (r === 'ambiguous') return { ok: false, error: 'ambiguous', token };
    if (!r) return { ok: false, error: 'unknown-user', token };
    recipient = r;
  } else if (ctx.replyingTo) recipient = ctx.replyingTo.pubkey;
  else {
    recipient = [...ctx.messages].reverse().find((m) => m.pubkey !== ctx.me)?.pubkey ?? null;
    if (!recipient) return { ok: false, error: 'no-target' };
  }
  if (recipient === ctx.me) return { ok: false, error: 'self' };
  const messageId = ctx.replyingTo?.pubkey === recipient
    ? ctx.replyingTo.id
    : [...ctx.messages].reverse().find((m) => m.pubkey === recipient)?.id ?? null;
  return { ok: true, target: { recipient, messageId, sats } };
}

function resolve(token: string, people: ZapContext['people']): string | 'ambiguous' | null {
  // An identifier anywhere in it wins (a mention leaves `nostr:npub1…`).
  for (const piece of token.split(/\s+/)) {
    const s = piece.replace(/^@/, '').replace(/^nostr:/, '');
    if (s.startsWith('npub1') || s.startsWith('nprofile1')) { const hex = npubToHex(s); if (hex) return hex; }
    if (/^[0-9a-f]{64}$/i.test(s)) return s.toLowerCase();
  }
  const needle = token.replace(/^@/, '').toLowerCase();
  const unique = (pks: string[]) => { const d = [...new Set(pks)]; return d.length === 0 ? null : d.length === 1 ? d[0] : 'ambiguous'; };
  const exact = unique(people.filter((p) => p.names.some((n) => n.toLowerCase() === needle)).map((p) => p.pubkey));
  if (exact) return exact;
  return unique(people.filter((p) => p.names.some((n) => n.toLowerCase().includes(needle))).map((p) => p.pubkey));
}

/** What a refused `/zap` says. */
export function zapCommandMessage(e: ZapCommandError, token = '', w: VillageWords = vw): string {
  switch (e) {
    case 'ambiguous': return w.zapAmbiguous(token);
    case 'unknown-user': return w.zapUnknown(token);
    case 'no-target': return w.zapNoTarget;
    case 'self': return w.zapSelf;
  }
}
