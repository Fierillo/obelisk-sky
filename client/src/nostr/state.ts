// The village's memory: visible groups, a 30-day message ring, reactions,
// zaps and the profiles of people who appear in them. Pure: feed.ts feeds it
// relay events through the user's own RelayHub, main.ts consumes what it
// emits.
//
// Visibility: the relay already decides what this user may read (NIP-29
// private groups, NIP-42 AUTH as them), so a logged-in client shows every
// group it is sent, like obelisk.ar does. `publicOnly` keeps v1's stricter
// rule (no `private` / `hidden`, parent chain included) for any view that
// might be shown to someone other than the signed-in user.

import type { Event as NostrEvent } from 'nostr-tools';
import { getSatoshisAmountFromBolt11 } from 'nostr-tools/nip57';
import { isVisible, parseGroupMeta, type GroupMeta } from './groups';
import { cleanName, mentionedPubkeys, sanitizeText, shortNpub } from './sanitize';
import type { ServerMsg, WireGroup, WireMessage, WireProfile, WireReaction, WireZap } from './wire';

export const HISTORY_SECONDS = 30 * 24 * 3600;
export const MAX_MESSAGES = 4000;
export const MAX_REACTIONS = 3000;
export const MAX_ZAPS = 1000;

interface StoredMessage {
  id: string;
  pubkey: string;
  groupId: string;
  content: string;
  replyToId: string | null;
  replyHint: string | null; // first p-tag, used when the parent isn't in the ring
  images: string[];
  emojis: Record<string, string>;
  /** Everyone the message names (mentions and p tags), for profile fetches. */
  mentions: string[];
  createdAt: number;
}

const HTTPS = /^https:\/\/[^\s"'<>]+$/i;

/** NIP-92 imeta image URLs and NIP-30 emoji, https only. */
export function mediaFromTags(tags: string[][]): { images: string[]; emojis: Record<string, string> } {
  const images: string[] = [];
  const emojis: Record<string, string> = {};
  for (const t of tags) {
    if (t[0] === 'imeta') {
      const url = t.find((x) => x.startsWith('url '))?.slice(4);
      const mime = t.find((x) => x.startsWith('m '))?.slice(2) ?? '';
      if (url && HTTPS.test(url) && (!mime || mime.startsWith('image/'))) images.push(url);
    } else if (t[0] === 'emoji' && /^[\w-]{1,64}$/.test(t[1] ?? '') && HTTPS.test(t[2] ?? '')) {
      emojis[t[1]] = t[2];
    }
  }
  return { images, emojis };
}

interface Profile {
  name: string | null;
  picture: string | null;
  nip05: string | null;
  createdAt: number;
}

export type Emit = (msg: ServerMsg) => void;

export class SkyState {
  private meta = new Map<string, GroupMeta>();
  private visible = new Set<string>();
  private messages = new Map<string, StoredMessage>();
  private reactions = new Map<string, WireReaction>();
  private zaps = new Map<string, WireZap>();
  private profiles = new Map<string, Profile>();
  /** Pubkeys that showed up in visible content — the only profiles we expose. */
  private people = new Set<string>();

  constructor(
    private emit: Emit,
    private now: () => number = () => Math.floor(Date.now() / 1000),
    private opts: { publicOnly?: boolean } = { publicOnly: true },
  ) {}

  visibleGroupIds(): string[] {
    return [...this.visible];
  }

  messageIds(): string[] {
    return [...this.messages.keys()];
  }

  /** People we've seen but hold no kind 0 for yet. */
  missingProfiles(): string[] {
    return [...this.people].filter((p) => !this.profiles.has(p));
  }

  // ── groups ─────────────────────────────────────────────────────────────

  /** Returns true when the visible set changed (relay.ts re-subscribes). */
  ingestGroupMeta(ev: NostrEvent): boolean {
    if (ev.kind !== 39000) return false;
    const g = parseGroupMeta(ev.tags, ev.created_at);
    if (!g) return false;
    const prev = this.meta.get(g.id);
    if (prev && prev.createdAt > g.createdAt) return false;
    this.meta.set(g.id, g);
    return this.recomputeVisible();
  }

  private recomputeVisible(): boolean {
    let changed = false;
    for (const id of this.meta.keys()) {
      const vis = this.opts.publicOnly === false ? true : isVisible(id, this.meta);
      if (vis && !this.visible.has(id)) {
        this.visible.add(id);
        this.emit({ t: 'group', group: this.wireGroup(id)! });
        changed = true;
      } else if (!vis && this.visible.has(id)) {
        this.visible.delete(id);
        this.purgeGroup(id);
        this.emit({ t: 'group-removed', id });
        changed = true;
      } else if (vis) {
        // Rename etc. — cheap to resend.
        this.emit({ t: 'group', group: this.wireGroup(id)! });
      }
    }
    return changed;
  }

  private purgeGroup(id: string): void {
    for (const [k, m] of this.messages) if (m.groupId === id) this.messages.delete(k);
    for (const [k, r] of this.reactions) if (r.groupId === id) this.reactions.delete(k);
    for (const [k, z] of this.zaps) if (z.groupId === id) this.zaps.delete(k);
  }

  private wireGroup(id: string): WireGroup | null {
    const g = this.meta.get(id);
    if (!g) return null;
    return { id: g.id, name: g.name, about: g.about, kind: g.kind, open: g.isOpen };
  }

  // ── messages ───────────────────────────────────────────────────────────

  ingestMessage(ev: NostrEvent): void {
    if (ev.kind !== 9 || this.messages.has(ev.id)) return;
    const groupId = ev.tags.find((t) => t[0] === 'h')?.[1];
    if (!groupId || !this.visible.has(groupId)) return;
    if (ev.created_at < this.now() - HISTORY_SECONDS || ev.created_at > this.now() + 300) return;
    const replyToId = ev.tags.find((t) => t[0] === 'e' && t[3] === 'reply')?.[1] ?? null;
    const m: StoredMessage = {
      id: ev.id,
      pubkey: ev.pubkey,
      groupId,
      content: ev.content,
      replyToId,
      replyHint: replyToId ? (ev.tags.find((t) => t[0] === 'p')?.[1] ?? null) : null,
      ...mediaFromTags(ev.tags),
      mentions: mentionedPubkeys(ev.content, ev.tags).slice(0, 20),
      createdAt: ev.created_at,
    };
    this.messages.set(ev.id, m);
    this.notePerson(ev.pubkey);
    for (const pk of m.mentions) this.notePerson(pk);
    this.trim(this.messages, MAX_MESSAGES);
    const wire = this.wireMessage(m);
    if (wire.replyTo) this.notePerson(wire.replyTo);
    this.emit({ t: 'msg', msg: wire });
  }

  private wireMessage(m: StoredMessage): WireMessage {
    let replyTo: string | null = null;
    if (m.replyToId) {
      const parent = this.messages.get(m.replyToId);
      replyTo = parent ? parent.pubkey : m.replyHint;
      if (replyTo && !/^[0-9a-f]{64}$/.test(replyTo)) replyTo = null;
    }
    return {
      id: m.id,
      pubkey: m.pubkey,
      groupId: m.groupId,
      text: sanitizeText(m.content, (pk) => this.nameOf(pk)),
      content: m.content.slice(0, 8000),
      images: m.images,
      emojis: m.emojis,
      replyTo,
      replyToId: m.replyToId,
      createdAt: m.createdAt,
    };
  }

  /** Kind 5 from the author: drop their message or reaction (`k` 9 / 7). */
  ingestDeletion(ev: NostrEvent): void {
    if (ev.kind !== 5) return;
    for (const t of ev.tags) {
      if (t[0] !== 'e' || !t[1]) continue;
      const m = this.messages.get(t[1]);
      if (m && m.pubkey === ev.pubkey) {
        this.messages.delete(t[1]);
        this.emit({ t: 'msg-removed', id: t[1], groupId: m.groupId });
        continue;
      }
      const r = this.reactions.get(t[1]);
      if (r && r.pubkey === ev.pubkey) {
        this.reactions.delete(t[1]);
        this.emit({ t: 'reaction-removed', id: t[1], targetId: r.targetId });
      }
    }
  }

  // ── reactions / zaps ───────────────────────────────────────────────────

  ingestReaction(ev: NostrEvent): void {
    if (ev.kind !== 7 || this.reactions.has(ev.id)) return;
    const groupId = ev.tags.find((t) => t[0] === 'h')?.[1];
    if (!groupId || !this.visible.has(groupId)) return;
    const targetId = [...ev.tags].reverse().find((t) => t[0] === 'e')?.[1];
    if (!targetId) return;
    const parent = this.messages.get(targetId);
    const target = parent?.pubkey ?? ev.tags.find((t) => t[0] === 'p')?.[1];
    if (!target || !/^[0-9a-f]{64}$/.test(target)) return;
    const r: WireReaction = {
      id: ev.id,
      pubkey: ev.pubkey,
      target,
      targetId,
      groupId,
      emoji: reactionEmoji(ev.content),
      createdAt: ev.created_at,
    };
    this.reactions.set(ev.id, r);
    this.trim(this.reactions, MAX_REACTIONS);
    this.notePerson(ev.pubkey);
    this.notePerson(target);
    this.emit({ t: 'reaction', reaction: r });
  }

  /** NIP-57 receipt whose `e` points at a message we hold. Only the zapped
   *  message's group decides visibility — never the receipt's own tags. */
  ingestZap(ev: NostrEvent): void {
    if (ev.kind !== 9735 || this.zaps.has(ev.id)) return;
    const targetId = ev.tags.find((t) => t[0] === 'e')?.[1];
    const msg = targetId ? this.messages.get(targetId) : undefined;
    if (!msg) return;
    let from: string | null = null;
    let sats = 0;
    try {
      const desc = JSON.parse(ev.tags.find((t) => t[0] === 'description')?.[1] ?? '');
      if (desc?.kind === 9734 && typeof desc.pubkey === 'string' && /^[0-9a-f]{64}$/.test(desc.pubkey)) {
        from = desc.pubkey;
      }
    } catch { /* anonymous / malformed request */ }
    const bolt11 = ev.tags.find((t) => t[0] === 'bolt11')?.[1];
    if (bolt11) {
      try { sats = getSatoshisAmountFromBolt11(bolt11); } catch { sats = 0; }
    }
    if (!sats) return;
    const z: WireZap = {
      id: ev.id,
      from,
      target: msg.pubkey,
      targetId: msg.id,
      groupId: msg.groupId,
      sats,
      createdAt: ev.created_at,
    };
    this.zaps.set(ev.id, z);
    this.trim(this.zaps, MAX_ZAPS);
    if (from) this.notePerson(from);
    this.emit({ t: 'zap', zap: z });
  }

  // ── profiles ───────────────────────────────────────────────────────────

  ingestProfile(ev: NostrEvent): void {
    if (ev.kind !== 0) return;
    const prev = this.profiles.get(ev.pubkey);
    if (prev && prev.createdAt >= ev.created_at) return;
    let j: Record<string, unknown> = {};
    try { j = JSON.parse(ev.content); } catch { return; }
    const pic = typeof j.picture === 'string' && /^https:\/\/[^\s]+$/i.test(j.picture) && j.picture.length < 1000
      ? j.picture : null;
    this.profiles.set(ev.pubkey, {
      name: cleanName(j.display_name) ?? cleanName(j.displayName) ?? cleanName(j.name),
      picture: pic,
      nip05: cleanName(j.nip05),
      createdAt: ev.created_at,
    });
    if (this.people.has(ev.pubkey)) this.emit({ t: 'profile', profile: this.wireProfile(ev.pubkey) });
  }

  private notePerson(pk: string): void {
    if (this.people.has(pk)) return;
    this.people.add(pk);
    if (this.profiles.has(pk)) this.emit({ t: 'profile', profile: this.wireProfile(pk) });
  }

  /** Someone the UI wants a name for (a mention chip): fetch their kind 0. */
  watch(pk: string): void {
    if (/^[0-9a-f]{64}$/.test(pk)) this.notePerson(pk);
  }

  nameOf(pk: string): string {
    return this.profiles.get(pk)?.name ?? shortNpub(pk);
  }

  private wireProfile(pk: string): WireProfile {
    const p = this.profiles.get(pk);
    return {
      pubkey: pk,
      name: p?.name ?? shortNpub(pk),
      avatar: p?.picture ?? null,
      nip05: p?.nip05 ?? null,
      loaded: !!p,
    };
  }

  /** Avatar URLs we've handed out — the avatar proxy fetches nothing else. */
  isKnownPicture(url: string): boolean {
    for (const pk of this.people) if (this.profiles.get(pk)?.picture === url) return true;
    return false;
  }

  // ── snapshot / housekeeping ────────────────────────────────────────────

  snapshot(relay: string): ServerMsg {
    const messages = [...this.messages.values()]
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((m) => this.wireMessage(m));
    const involved = new Set<string>();
    for (const m of messages) { involved.add(m.pubkey); if (m.replyTo) involved.add(m.replyTo); }
    for (const m of this.messages.values()) for (const pk of m.mentions) involved.add(pk);
    for (const r of this.reactions.values()) { involved.add(r.pubkey); involved.add(r.target); }
    for (const z of this.zaps.values()) { if (z.from) involved.add(z.from); involved.add(z.target); }
    return {
      t: 'snapshot',
      relay,
      groups: [...this.visible].map((id) => this.wireGroup(id)!).filter(Boolean),
      profiles: [...involved].map((pk) => this.wireProfile(pk)),
      messages,
      reactions: [...this.reactions.values()].sort((a, b) => a.createdAt - b.createdAt),
      zaps: [...this.zaps.values()].sort((a, b) => a.createdAt - b.createdAt),
      now: this.now(),
    };
  }

  /** Drop anything older than the history window. */
  prune(): void {
    const cutoff = this.now() - HISTORY_SECONDS;
    for (const [k, m] of this.messages) if (m.createdAt < cutoff) this.messages.delete(k);
    for (const [k, r] of this.reactions) if (r.createdAt < cutoff) this.reactions.delete(k);
    for (const [k, z] of this.zaps) if (z.createdAt < cutoff) this.zaps.delete(k);
  }

  private trim<V extends { createdAt: number }>(map: Map<string, V>, cap: number): void {
    if (map.size <= cap) return;
    const sorted = [...map.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
    for (const [k] of sorted.slice(0, map.size - cap)) map.delete(k);
  }
}

export function reactionEmoji(content: string): string {
  const c = content.trim();
  if (c === '' || c === '+') return '❤️';
  if (c === '-') return '👎';
  if (/^:[\w-]+:$/.test(c)) return '✨'; // NIP-30 custom emoji — image not proxied
  const first = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(c)[Symbol.iterator]().next().value?.segment ?? '';
  return /\p{Extended_Pictographic}/u.test(first) ? first : '❤️';
}
