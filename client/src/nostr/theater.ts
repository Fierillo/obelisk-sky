// The theater's screening: which channel the hall is showing, who hosts it,
// and who the host lets talk or share their screen.
//
// Replaceable kind 30078, d=`obelisk-sky:theater:<relay>`, one per host,
// signed by the host and re-sent every SCREENING_HEARTBEAT_S with a NIP-40
// `expiration` (SCREENING_TTL_S), like the live activities: a closed tab
// ends the screening by itself. Two live screenings: the earlier `since`
// holds the hall (ties by event id), so an admin takes over by starting
// one dated just before. `ended` closes it; `next` hands it to someone, who
// carries it on with the same `since` and grants.
//
// Raising a hand is ephemeral kind 20391 to the host (`p`), with the channel
// (`h`) and `{v:1, want:'mic'|'screen'|'down'}`; only the host listens.
//
// The grants are kept by every screen: a voice the host hasn't allowed is
// muted where it's heard, a screen it hasn't allowed isn't shown.

import type { Event as NostrEvent, EventTemplate } from 'nostr-tools';
import type { RelayHub } from '@nostr-wot/relay/hub';
import { activeRelay } from './hub';

export const SCREENING_T_TAG = 'obelisk-sky-theater';
export const KIND_SKY_HAND = 20391;
/** Seconds a screening lives without a heartbeat. */
export const SCREENING_TTL_S = 120;
/** Seconds between re-publishes while hosting. */
export const SCREENING_HEARTBEAT_S = 45;
/** At most one hand raise per this many seconds. */
export const HAND_EVERY_S = 10;

export const screeningDTag = (relay: string): string => `obelisk-sky:theater:${relay}`;

export interface ScreeningSpec {
  channel: string;
  since: number;
  title?: string;
  /** May talk, besides the host. */
  mic: string[];
  /** May share their screen, besides the host. */
  screen: string[];
}

export interface Screening extends ScreeningSpec {
  /** The host: the author. */
  host: string;
  id: string;
  at: number;
  exp: number;
  ended: boolean;
  /** On an ended screening: who carries it on. */
  next?: string;
}

const HEX64 = /^[0-9a-f]{64}$/;
const nowS = () => Math.floor(Date.now() / 1000);
const tag = (ev: NostrEvent, k: string) => ev.tags.find((t) => t[0] === k)?.[1];
const pks = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && HEX64.test(x)))].slice(0, 64) : []);

/** A screening (or its end, `null`) for the hall on `relay`. */
export function screeningTemplate(relay: string, s: ScreeningSpec | null, opts: { prevCreatedAt?: number; next?: string; at?: number } = {}): EventTemplate {
  const created = Math.max(opts.at ?? nowS(), (opts.prevCreatedAt ?? 0) + 1);
  const tags = [['d', screeningDTag(relay)], ['t', SCREENING_T_TAG]];
  if (s) {
    tags.push(['h', s.channel]);
    for (const pk of new Set([...s.mic, ...s.screen])) tags.push(['p', pk]);
  } else if (opts.next) tags.push(['p', opts.next]);
  tags.push(['expiration', String(created + (s ? SCREENING_TTL_S : 30))]);
  const content = s
    ? { v: 1, op: 'start', channel: s.channel, since: Math.min(s.since, created), title: s.title?.slice(0, 80) || undefined, mic: s.mic, screen: s.screen }
    : { v: 1, op: 'end', next: opts.next };
  return { kind: 30078, tags, content: JSON.stringify(content), created_at: created };
}

/** Strict parse; null when it isn't a screening of this relay's hall. */
export function parseScreening(ev: NostrEvent, relay: string): Screening | null {
  if (ev.kind !== 30078 || tag(ev, 'd') !== screeningDTag(relay)) return null;
  const exp = Number(tag(ev, 'expiration'));
  if (!Number.isFinite(exp)) return null;
  let j: Record<string, unknown>;
  try { j = JSON.parse(ev.content); } catch { return null; }
  if (!j || typeof j !== 'object' || j.v !== 1) return null;
  const base = { host: ev.pubkey, id: ev.id, at: ev.created_at, exp: Math.min(exp, ev.created_at + SCREENING_TTL_S) };
  if (j.op === 'end') {
    const next = typeof j.next === 'string' && HEX64.test(j.next) && j.next !== ev.pubkey ? j.next : undefined;
    return { ...base, channel: '', since: ev.created_at, mic: [], screen: [], ended: true, next };
  }
  if (j.op !== 'start' || typeof j.channel !== 'string' || !j.channel || j.channel.length > 128) return null;
  const since = typeof j.since === 'number' && Number.isFinite(j.since) && j.since > 0 ? Math.min(Math.floor(j.since), ev.created_at) : ev.created_at;
  const title = typeof j.title === 'string' ? j.title.slice(0, 80) : undefined;
  return { ...base, channel: j.channel, since, title, mic: pks(j.mic), screen: pks(j.screen), ended: false };
}

/** May `pk` talk in this screening? Everyone may when there's none. */
export function canSpeak(s: Screening | null, pk: string): boolean {
  return !s || s.host === pk || s.mic.includes(pk);
}

/** May `pk` share their screen in this screening? */
export function canShare(s: Screening | null, pk: string): boolean {
  return !s || s.host === pk || s.screen.includes(pk);
}

export type HandWant = 'mic' | 'screen' | 'down';

export function handTemplate(host: string, channel: string, want: HandWant, at = nowS()): EventTemplate {
  return { kind: KIND_SKY_HAND, tags: [['p', host], ['h', channel]], content: JSON.stringify({ v: 1, want }), created_at: at };
}

export interface Hand { pk: string; channel: string; want: Exclude<HandWant, 'down'>; at: number }

export function parseHand(ev: NostrEvent): { pk: string; to: string; channel: string; want: HandWant; at: number } | null {
  if (ev.kind !== KIND_SKY_HAND) return null;
  const to = tag(ev, 'p'), channel = tag(ev, 'h');
  if (!to || !channel) return null;
  let j: Record<string, unknown>;
  try { j = JSON.parse(ev.content); } catch { return null; }
  if (!j || j.v !== 1 || (j.want !== 'mic' && j.want !== 'screen' && j.want !== 'down')) return null;
  return { pk: ev.pubkey, to, channel, want: j.want, at: ev.created_at };
}

/** Earlier `since` holds the hall; ties go to the lower event id. */
const before = (a: Screening, b: Screening) => (a.since !== b.since ? a.since < b.since : a.id < b.id);

/** Every host's latest screening on this relay, which one holds the hall, and the hands raised to it. */
export class TheaterStore {
  private byPk = new Map<string, Screening>();
  private raised = new Map<string, Hand>();
  private listeners = new Set<() => void>();
  private subs: { release(): void }[] = [];

  constructor(private hub: RelayHub, private relay: string = activeRelay(), private now: () => number = nowS) {}

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private changed(): void {
    for (const l of this.listeners) l();
  }

  createdAt(pk: string): number {
    return this.byPk.get(pk)?.at ?? 0;
  }

  /** The latest event from `pk` (live or not). */
  latest(pk: string): Screening | null {
    return this.byPk.get(pk) ?? null;
  }

  ingest(ev: NostrEvent): boolean {
    if (ev.kind === KIND_SKY_HAND) return this.ingestHand(ev);
    const r = parseScreening(ev, this.relay);
    if (!r) return false;
    const prev = this.byPk.get(r.host);
    if (prev && (prev.at > r.at || (prev.at === r.at && prev.id <= r.id))) return false;
    this.byPk.set(r.host, r);
    this.changed();
    return true;
  }

  private ingestHand(ev: NostrEvent): boolean {
    const h = parseHand(ev);
    const cur = this.current();
    if (!h || !cur || h.to !== cur.host || h.channel !== cur.channel || h.pk === cur.host) return false;
    if (this.now() - h.at > 60) return false;
    const prev = this.raised.get(h.pk);
    if (prev && prev.at > h.at) return false;
    if (h.want === 'down') this.raised.delete(h.pk);
    else this.raised.set(h.pk, { pk: h.pk, channel: h.channel, want: h.want, at: h.at });
    this.changed();
    return true;
  }

  /** The screening holding the hall now, or null. */
  current(at = this.now()): Screening | null {
    let best: Screening | null = null;
    for (const s of this.byPk.values()) {
      if (s.ended || s.exp <= at) continue;
      if (!best || before(s, best)) best = s;
    }
    return best;
  }

  /** Hands raised to the current host for its channel (already granted ones left out). */
  hands(): Hand[] {
    const cur = this.current();
    if (!cur) return [];
    return [...this.raised.values()]
      .filter((h) => h.channel === cur.channel && !(h.want === 'mic' ? cur.mic : cur.screen).includes(h.pk))
      .sort((a, b) => a.at - b.at);
  }

  /** Put a hand down (answered, or the host dismissed it). */
  lower(pk: string): void {
    if (this.raised.delete(pk)) this.changed();
  }

  start(me: string | null): void {
    this.stop();
    const since = this.now() - SCREENING_TTL_S - 30;
    this.subs.push(this.hub.subscribe({
      relays: [this.relay],
      filters: [{ kinds: [30078], '#d': [screeningDTag(this.relay)], since }],
      priority: 'background',
      label: 'sky-theater',
      onEvent: (ev) => void this.ingest(ev),
    }));
    if (me) {
      this.subs.push(this.hub.subscribe({
        relays: [this.relay],
        filters: [{ kinds: [KIND_SKY_HAND], '#p': [me], since: this.now() - 10 }],
        priority: 'background',
        label: 'sky-theater-hands',
        onEvent: (ev) => void this.ingest(ev),
      }));
    }
  }

  stop(): void {
    for (const s of this.subs) s.release();
    this.subs = [];
  }
}

/**
 * When the host re-sends: on every change of what it holds, and every
 * SCREENING_HEARTBEAT_S. Pure: feed it what you host each tick.
 */
export class ScreeningBeacon {
  private sentKey = '';
  private sentAt = 0;

  update(s: ScreeningSpec | null, nowMs: number): boolean {
    const key = s ? JSON.stringify([s.channel, s.since, s.title ?? '', [...s.mic].sort(), [...s.screen].sort()]) : '';
    if (key === this.sentKey && (!s || nowMs - this.sentAt < SCREENING_HEARTBEAT_S * 1000)) return false;
    this.sentKey = key;
    this.sentAt = nowMs;
    return true;
  }

  reset(): void {
    this.sentKey = '';
    this.sentAt = 0;
  }
}
