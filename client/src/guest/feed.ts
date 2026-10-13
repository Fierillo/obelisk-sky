// The guest island's feed: what nostr/feed.ts is for a relay, played from
// the script (guest/script.ts) instead. One snapshot of the last few hours,
// then a scripted line or reaction every so often, forever (the threads are
// reshuffled and recast on every loop), and now and then a villager answers
// what the guest wrote. Profiles (kind 0) are the only thing read from the
// network, from the public profile relays; nothing is ever published.

import type { Event as NostrEvent } from 'nostr-tools';
import type { RelayHub } from '@nostr-wot/relay/hub';
import type { Lang } from '../i18n/lang';
import { SkyState } from '../nostr/state';
import { profilesDue, type ProfileAsks } from '../nostr/feed';
import type { ServerMsg, WireMessage } from '../nostr/wire';
import { ANSWERS, HOUSES, NPCS, THREADS, guestEvent, guestHistory, houseGroupId, ingestAll, playThread, seeded } from './script';

export interface GuestFeedOptions {
  lang: Lang;
  /** Shown as where you are (the relay you picked). */
  relay: string;
  /** Your pubkey (your words are yours); for a logged-out visitor, the tab's guest pubkey. */
  me: string | null;
  /** A name for a logged-out visitor ("Guest"); null when `me` is a real account. */
  guestName?: string | null;
  /** Where kind 0s are read (never the group relay: no AUTH on the guest island). */
  profileRelays?: () => string[];
  now?: () => number;
  random?: () => number;
  /** Seconds between threads, and between lines of a thread. */
  pace?: { thread: [number, number]; line: [number, number] };
}

const NPC_SET = new Set(NPCS.map((n) => n.pubkey));

export class GuestFeed {
  readonly state: SkyState;
  private ready = false;
  private stopped = false;
  private timers: ReturnType<typeof setInterval>[] = [];
  /** Scripted events waiting for their time (created_at), oldest first. */
  private queue: NostrEvent[] = [];
  private order: number[] = [];
  private cycle = 1;
  private nextThreadAt = 0;
  private lastSpeaker = new Map<string, string>();
  private answered = 0;
  private lastAnswerAt = 0;
  private seq = 0;
  private asks: ProfileAsks = new Map();
  private readonly now: () => number;
  private readonly rnd: () => number;
  private readonly pace: NonNullable<GuestFeedOptions['pace']>;

  constructor(private hub: RelayHub | null, private hooks: { onMsg(m: ServerMsg): void }, private opts: GuestFeedOptions) {
    this.now = opts.now ?? (() => Math.floor(Date.now() / 1000));
    this.rnd = opts.random ?? Math.random;
    this.pace = opts.pace ?? { thread: [20, 60], line: [12, 35] };
    this.state = new SkyState((m) => this.emit(m), this.now);
  }

  start(): void {
    const now = this.now();
    const history = guestHistory(now, this.opts.lang, Math.floor(this.rnd() * 1e9));
    ingestAll(this.state, history);
    for (const e of history) if (e.kind === 9) this.lastSpeaker.set(e.tags.find((t) => t[0] === 'h')![1], e.pubkey);
    this.ready = true;
    this.hooks.onMsg(this.state.snapshot(this.opts.relay));
    // You: a logged-out guest gets a name; an account's own kind 0 is fetched.
    const me = this.opts.me;
    if (me && this.opts.guestName) {
      this.state.ingestProfile({ kind: 0, pubkey: me, created_at: now, tags: [], content: JSON.stringify({ name: this.opts.guestName }), id: '', sig: '' });
    }
    if (me) this.state.watch(me);
    this.nextThreadAt = now + this.between(this.pace.thread);
    this.timers.push(setInterval(() => this.tick(), 1000));
    if (this.hub) this.timers.push(setInterval(() => this.fetchProfiles(), 2500));
    this.fetchProfiles();
  }

  stop(): void {
    this.stopped = true;
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    this.queue = [];
  }

  /** Play whatever is due; start the next thread when the last one is done. */
  tick(): void {
    if (this.stopped) return;
    const now = this.now();
    while (this.queue.length && this.queue[0].created_at <= now) this.ingest(this.queue.shift()!);
    if (!this.queue.length && now >= this.nextThreadAt) {
      this.queueThread(now);
      this.nextThreadAt = Infinity;
    }
    if (!this.queue.length && this.nextThreadAt === Infinity) this.nextThreadAt = now + this.between(this.pace.thread);
  }

  /** How many scripted events are waiting (tests). */
  get pending(): number {
    return this.queue.length;
  }

  private between([lo, hi]: [number, number]): number {
    return Math.round(lo + this.rnd() * (hi - lo));
  }

  private queueThread(now: number): void {
    if (!this.order.length) {
      // A new loop: reshuffled, and recast (castFor changes with the cycle).
      this.order = THREADS.map((_, i) => i).sort(() => this.rnd() - 0.5);
      this.cycle++;
    }
    const index = this.order.shift()!;
    const beats = playThread(index, now + 1, this.opts.lang, this.cycle, () => this.between(this.pace.line));
    for (const b of beats) this.queue.push(b.ev, ...b.reactions);
    this.queue.sort((a, b) => a.created_at - b.created_at);
  }

  private ingest(e: NostrEvent): void {
    if (e.kind === 9) {
      this.state.ingestMessage(e);
      this.lastSpeaker.set(e.tags.find((t) => t[0] === 'h')![1], e.pubkey);
    } else if (e.kind === 7) this.state.ingestReaction(e);
  }

  private emit(m: ServerMsg): void {
    if (!this.ready || this.stopped) return;
    this.hooks.onMsg(m);
    if (m.t === 'msg' && m.msg.pubkey === this.opts.me && !NPC_SET.has(m.msg.pubkey)) this.heard(m.msg);
  }

  /** The guest said something: a villager may answer, a few seconds later. */
  private heard(msg: WireMessage): void {
    const now = this.now();
    if (now - this.lastAnswerAt < 20) return;
    if (this.answered > 0 && this.rnd() < 0.5) return;
    const house = HOUSES.find((h) => houseGroupId(h.id) === msg.groupId);
    const last = this.lastSpeaker.get(msg.groupId);
    const pool = NPCS.filter((n) => house && n.home === house.id).map((n) => n.pubkey);
    const who = last && NPC_SET.has(last) ? last : pool[Math.floor(this.rnd() * pool.length)] ?? NPCS[Math.floor(this.rnd() * NPCS.length)]?.pubkey;
    if (!who) return;
    this.answered++;
    this.lastAnswerAt = now;
    const words = ANSWERS[this.answered === 1 ? 0 : 1 + Math.floor(this.rnd() * (ANSWERS.length - 1))];
    const at = now + 4 + Math.floor(this.rnd() * 5);
    const ev = guestEvent(9, who, words[this.opts.lang], [['h', msg.groupId], ['e', msg.id, '', 'reply'], ['p', msg.pubkey]], at, `answer:${this.seq++}:${msg.id}`);
    this.queue.push(ev);
    this.queue.sort((a, b) => a.created_at - b.created_at);
  }

  /** Kind 0s for the villagers (and you, logged in), read only, never from the group relay. */
  private fetchProfiles(): void {
    if (!this.hub || this.stopped) return;
    const relays = this.opts.profileRelays?.() ?? [];
    if (!relays.length) return;
    const skip = this.opts.guestName ? this.opts.me : null;
    const people = this.state.knownPeople().filter((p) => p !== skip);
    const due = profilesDue(people, (p) => this.state.hasProfile(p), this.asks, Date.now());
    if (!due.length) return;
    try {
      void this.hub.query({
        relays,
        filters: [{ kinds: [0], authors: due }],
        maxWaitMs: 5000,
        cache: { mode: 'bypass' },
        label: 'sky-guest-profiles',
      }).then((r) => { if (!this.stopped) for (const ev of r.events) this.state.ingestProfile(ev); }).catch(() => {});
    } catch (e) {
      console.warn('[sky] guest profiles', e);
    }
  }
}

/** A seeded random for tests and reproducible runs. */
export { seeded };
