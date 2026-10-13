// Private messages and call signals, the way obelisk-dex sends them, so a
// conversation started in the village continues in the app and back:
//
// - Chat is NIP-17: a kind 14 rumor, sealed (13) and gift-wrapped (1059) by
//   `@nostr-wot/dm`, published to the recipient's inbox relays (kind 10050,
//   else their 10002 read relays, else the group relay), and a copy wrapped
//   to ourselves for our own inbox. Identity is the rumor id.
// - Call control is a kind 25055 rumor (obelisk-dex services/call/protocol)
//   wrapped the same way, with an `expiration` on the wrap (5 min); accept
//   and decline are also wrapped to ourselves so other devices stop ringing.
// - We read kind 1059 `#p` us on our inbox relays plus the group relay.
//
// Never volunteer AUTH when publishing a wrap (authMode 'never'): an
// ephemeral key signed it, and naming ourselves would undo that.

import { finalizeEvent, generateSecretKey, getEventHash, type Event as NostrEvent, type UnsignedEvent } from 'nostr-tools';
import { v2 as nip44 } from 'nostr-tools/nip44';
import type { RelayHub } from '@nostr-wot/relay/hub';
import type { NostrSigner } from '@nostr-wot/signers';
import { buildChatMessage, sealAndGiftWrap, unwrapGiftWrap } from '@nostr-wot/dm';
import { encodeDmCallMessage, isFreshCallMessage, parseDmCallMessage, type DmCallMessage, type IncomingDmCallMessage } from '@/services/call/protocol';
import { activeRelay, profileRelays } from './hub';
import { isGuest } from './guest';
import { vw } from '../i18n/village';

export const KIND_DM_CHAT = 14;
export const KIND_DM_CALL = 25055;
const CALL_WRAP_TTL_S = 300;

export interface DirectMessage {
  /** The rumor id: the same on both sides and on every device. */
  id: string;
  from: string;
  to: string;
  text: string;
  at: number;
}

/** Relays from a kind 10050 (`relay` tags) or a 10002 (read `r` tags). */
export function inboxRelaysOf(events: readonly NostrEvent[], pk: string): string[] {
  const newest = (kind: number) => events.filter((e) => e.kind === kind && e.pubkey === pk).sort((a, b) => b.created_at - a.created_at)[0];
  const ok = (u: unknown): u is string => typeof u === 'string' && /^wss?:\/\/[^\s]+$/i.test(u);
  const inbox = newest(10050)?.tags.filter((t) => t[0] === 'relay' && ok(t[1])).map((t) => t[1]) ?? [];
  if (inbox.length) return [...new Set(inbox)].slice(0, 6);
  const nip65 = newest(10002)?.tags.filter((t) => t[0] === 'r' && ok(t[1]) && (!t[2] || t[2] === 'read')).map((t) => t[1]) ?? [];
  return [...new Set(nip65)].slice(0, 6);
}

/** Who a conversation is with, from one message. */
export const peerOf = (m: DirectMessage, me: string): string => (m.from === me ? m.to : m.from);

export class DmStore {
  private threads = new Map<string, DirectMessage[]>();
  private seenWraps = new Set<string>();
  private seenRumors = new Set<string>();
  private relaysOf = new Map<string, Promise<string[]>>();
  private sub: { release(): void } | null = null;
  private listeners = new Set<(peer: string, m: DirectMessage, fresh: boolean) => void>();
  private callListeners = new Set<(m: IncomingDmCallMessage & { peer: string }) => void>();
  /** Wraps that arrived while still catching up don't notify (no old toasts). */
  private live = false;

  constructor(private hub: RelayHub, private me: string, private signer: NostrSigner) {}

  /** `fresh`: it arrived now (not while catching up on old wraps), worth a notice. */
  onMessage(cb: (peer: string, m: DirectMessage, fresh: boolean) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  onCall(cb: (m: IncomingDmCallMessage & { peer: string }) => void): () => void {
    this.callListeners.add(cb);
    return () => this.callListeners.delete(cb);
  }

  thread(peer: string): DirectMessage[] {
    return this.threads.get(peer) ?? [];
  }

  /** Conversations, newest first. */
  peers(): { peer: string; last: DirectMessage }[] {
    return [...this.threads].map(([peer, ms]) => ({ peer, last: ms[ms.length - 1] })).sort((a, b) => b.last.at - a.last.at);
  }

  /** Where `pk` reads its DMs (cached). */
  inbox(pk: string): Promise<string[]> {
    let p = this.relaysOf.get(pk);
    if (!p) {
      p = this.hub.query({ relays: profileRelays(), filters: [{ kinds: [10050, 10002], authors: [pk] }], maxWaitMs: 4000, label: 'sky-dm-relays' })
        .then((r) => inboxRelaysOf(r.events, pk))
        .catch(() => [] as string[])
        .then((rs) => (rs.length ? rs : [activeRelay()]));
      this.relaysOf.set(pk, p);
    }
    return p;
  }

  async start(): Promise<void> {
    const mine = await this.inbox(this.me);
    const relays = [...new Set([...mine, activeRelay()])];
    this.sub = this.hub.subscribe({
      relays,
      filters: [{ kinds: [1059], '#p': [this.me], limit: 200 }],
      label: 'sky-dm-inbox',
      onEvent: (ev: NostrEvent) => void this.ingest(ev),
      onEose: () => { this.live = true; },
    });
    setTimeout(() => { this.live = true; }, 6000);
  }

  stop(): void {
    this.sub?.release();
    this.sub = null;
  }

  async ingest(wrap: NostrEvent): Promise<void> {
    if (wrap.kind !== 1059 || this.seenWraps.has(wrap.id)) return;
    this.seenWraps.add(wrap.id);
    let opened: Awaited<ReturnType<typeof unwrapGiftWrap>>;
    try { opened = await unwrapGiftWrap(this.signer, wrap); } catch { return; }
    const { message: rumor, senderPubkey: from } = opened;
    const to = rumor.tags.find((t) => t[0] === 'p')?.[1] ?? this.me;
    const peer = from === this.me ? to : from;
    if (rumor.kind === KIND_DM_CALL) {
      const msg = parseDmCallMessage(rumor.content);
      if (!msg || !isFreshCallMessage(rumor.created_at)) return;
      for (const l of this.callListeners) l({ ...msg, from, sentAt: rumor.created_at, peer });
      return;
    }
    if (rumor.kind !== KIND_DM_CHAT || typeof rumor.content !== 'string') return;
    this.add({ id: rumor.id, from, to, text: rumor.content.slice(0, 4000), at: rumor.created_at }, this.live);
  }

  private add(m: DirectMessage, notify: boolean): void {
    if (this.seenRumors.has(m.id)) return;
    this.seenRumors.add(m.id);
    const peer = peerOf(m, this.me);
    const list = this.threads.get(peer) ?? [];
    list.push(m);
    list.sort((a, b) => a.at - b.at);
    this.threads.set(peer, list);
    for (const l of this.listeners) l(peer, m, notify);
  }

  /** NIP-17 chat to `peer`, plus our own copy. */
  async send(peer: string, text: string): Promise<string | null> {
    if (isGuest()) return vw.dmCouldNotSend;
    const rumor = buildChatMessage(this.me, peer, text) as UnsignedEvent;
    rumor.created_at = Math.floor(Date.now() / 1000);
    const id = getEventHash(rumor);
    try {
      const wrap = await sealAndGiftWrap(this.signer, peer, rumor);
      const theirs = await this.inbox(peer);
      const res = await this.hub.publish({ relays: theirs, event: wrap, authMode: 'never' });
      if (!res.some((r) => r.status === 'ok')) return 'Not delivered: their relays did not accept it.';
      this.add({ id, from: this.me, to: peer, text, at: rumor.created_at }, false);
      // Our copy, for our other devices and the app.
      const self = await sealAndGiftWrap(this.signer, this.me, rumor);
      const mine = (await this.inbox(this.me)).filter((u) => !theirs.includes(u));
      if (mine.length) void this.hub.publish({ relays: mine, event: self, authMode: 'never' });
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : vw.dmCouldNotSend;
    }
  }

  /** A call control message (invite, accept, …), as obelisk-dex wraps it. */
  async sendCall(peer: string, msg: DmCallMessage, selfNotice = false): Promise<void> {
    if (isGuest()) return;
    const now = Math.floor(Date.now() / 1000);
    const rumor: UnsignedEvent = { pubkey: this.me, kind: KIND_DM_CALL, created_at: now, tags: [['p', peer]], content: encodeDmCallMessage(msg) };
    const wrap = await this.wrapExpiring(peer, rumor, now + CALL_WRAP_TTL_S);
    await this.hub.publish({ relays: await this.inbox(peer), event: wrap, authMode: 'never' });
    if (selfNotice) {
      const self = await this.wrapExpiring(this.me, rumor, now + CALL_WRAP_TTL_S).catch(() => null);
      if (self) void this.hub.publish({ relays: await this.inbox(this.me), event: self, authMode: 'never' });
    }
  }

  /** `sealAndGiftWrap` with an `expiration` on the outer wrap (obelisk-dex calls.ts). */
  private async wrapExpiring(recipient: string, rumor: UnsignedEvent, expiresAt: number): Promise<NostrEvent> {
    if (!this.signer.nip44Encrypt) throw new Error('This signer cannot encrypt (NIP-44)');
    const fuzzed = () => Math.floor(Date.now() / 1000) - Math.floor(Math.random() * 2 * 24 * 3600);
    const seal = await this.signer.signEvent({
      kind: 13, created_at: fuzzed(), tags: [],
      content: await this.signer.nip44Encrypt(recipient, JSON.stringify({ ...rumor, id: getEventHash(rumor) })),
    });
    const ephSk = generateSecretKey();
    const conv = nip44.utils.getConversationKey(ephSk, recipient);
    return finalizeEvent({
      kind: 1059, created_at: fuzzed(),
      tags: [['p', recipient], ['expiration', String(expiresAt)]],
      content: nip44.encrypt(JSON.stringify(seal), conv),
    }, ephSk);
  }
}
