// Calls going on right now, in channels you're not in: what obelisk-dex
// shows as LIVE. Read from the relay as the app's bridge does
// (services/nostr-bridge/voice/voice-presence.ts): the SFU's active-call
// advertisements (kind 31314, `d` channel, `status`, `expiration`, `count`,
// participants) and everyone's presence beacons (kind 20078, `e` channel,
// `t` obelisk-voice-presence; `["v","screen"]` while sharing a screen; the
// SFU's own beacons carry `["sfu","1"]` and its roster as `p` tags).
//
// The theater uses it to find a transmission already on, and the voice
// bridge hands it to obelisk-dex's client (an SFU room closing).

import type { Event as NostrEvent } from 'nostr-tools';
import type { RelayHub } from '@nostr-wot/relay/hub';
import {
  deriveActiveCalls, mergePubkeys, parseSfuParticipantPubkeys,
  type ActiveCallInfo, type MeshPresence, type SfuActiveCall, type SfuPresence,
} from '@/services/nostr-bridge/voice/voice-calls';
import { activeRelay } from './hub';

export const KIND_SFU_ACTIVE_CALL = 31314;
export const KIND_VOICE_PRESENCE = 20078;

export interface LiveCall extends ActiveCallInfo {
  /** Who is sharing a screen there (from their beacons). */
  screens: string[];
}

const tag = (ev: NostrEvent, k: string) => ev.tags.find((t) => t[0] === k)?.[1];
const nowS = () => Math.floor(Date.now() / 1000);

export class LiveCalls {
  private sfuCalls = new Map<string, SfuActiveCall>();
  private sfuPresence = new Map<string, Map<string, SfuPresence>>();
  private mesh = new Map<string, Map<string, MeshPresence>>();
  /** channel → pubkey → until when their beacon says they share a screen. */
  private sharing = new Map<string, Map<string, number>>();
  private seen = new Map<string, number>();
  private listeners = new Set<(calls: Record<string, LiveCall>) => void>();
  private subs: { release(): void }[] = [];
  private sweep: ReturnType<typeof setInterval> | null = null;
  private cache: Record<string, LiveCall> = {};

  constructor(private hub: RelayHub, private now: () => number = nowS) {}

  onChange(cb: (calls: Record<string, LiveCall>) => void): () => void {
    this.listeners.add(cb);
    cb(this.cache);
    return () => this.listeners.delete(cb);
  }

  /** Every live call, by channel. */
  all(): Record<string, LiveCall> {
    return this.cache;
  }

  get(channelId: string): LiveCall | null {
    return this.cache[channelId] ?? null;
  }

  ingest(ev: NostrEvent): boolean {
    if (ev.kind === KIND_SFU_ACTIVE_CALL) return this.ingestActive(ev);
    if (ev.kind === KIND_VOICE_PRESENCE) return this.ingestBeacon(ev);
    return false;
  }

  private ingestActive(ev: NostrEvent): boolean {
    const ch = tag(ev, 'd');
    if (!ch) return false;
    const prev = this.sfuCalls.get(ch);
    if (prev && prev.createdAt >= ev.created_at) return false;
    const status = tag(ev, 'status') ?? 'active';
    const exp = Number(tag(ev, 'expiration') ?? 0) || 0;
    if (status === 'closed' || (exp && exp <= this.now())) {
      this.sfuCalls.delete(ch);
      this.sfuPresence.delete(ch);
      this.recompute();
      return true;
    }
    const participants = parseSfuParticipantPubkeys(ev);
    const count = tag(ev, 'count');
    this.sfuCalls.set(ch, {
      hostPubkey: tag(ev, 'host') ?? ev.pubkey, status, expiresAt: exp, createdAt: ev.created_at, mode: 'sfu',
      participantCount: count === undefined ? (participants.length || -1) : Number(count) || 0,
      participantPubkeys: participants.length ? participants : undefined,
    });
    this.recompute();
    return true;
  }

  private ingestBeacon(ev: NostrEvent): boolean {
    if (!ev.tags.some((t) => t[0] === 't' && t[1] === 'obelisk-voice-presence')) return false;
    const ch = tag(ev, 'e');
    if (!ch) return false;
    const exp = Number(tag(ev, 'expiration') ?? 0) || ev.created_at + 30;
    const key = `${ch}|${ev.pubkey}`;
    if ((this.seen.get(key) ?? 0) > ev.created_at) return false;
    this.seen.set(key, ev.created_at);
    const status = tag(ev, 'status');
    const gone = status === 'left' || status === 'closed' || exp <= this.now();
    if (ev.tags.some((t) => t[0] === 'sfu' && t[1] === '1')) {
      // The SFU's own beacon: its roster, not a person.
      let by = this.sfuPresence.get(ch);
      if (!by) this.sfuPresence.set(ch, (by = new Map()));
      const roster = mergePubkeys(ev.tags.filter((t) => t[0] === 'p' && t[1]).map((t) => t[1]));
      if (gone || !roster.length) by.delete(ev.pubkey);
      else by.set(ev.pubkey, { expiresAt: exp, createdAt: ev.created_at, participantPubkeys: roster });
      if (!by.size) this.sfuPresence.delete(ch);
    } else {
      let by = this.mesh.get(ch);
      if (!by) this.mesh.set(ch, (by = new Map()));
      let sh = this.sharing.get(ch);
      if (!sh) this.sharing.set(ch, (sh = new Map()));
      if (gone) { by.delete(ev.pubkey); sh.delete(ev.pubkey); }
      else {
        // In an SFU room people still beacon (who's sharing), but the SFU's roster says who's in.
        if (!this.sfuCalls.has(ch)) by.set(ev.pubkey, { expiresAt: exp, createdAt: ev.created_at });
        if (ev.tags.some((t) => t[0] === 'v' && t[1] === 'screen')) sh.set(ev.pubkey, exp);
        else sh.delete(ev.pubkey);
      }
      if (!by.size) this.mesh.delete(ch);
      if (!sh.size) this.sharing.delete(ch);
    }
    this.recompute();
    return true;
  }

  /** Drop what has expired; true if anything went. */
  prune(): boolean {
    const now = this.now();
    let changed = false;
    const drop = <V extends { expiresAt: number } | number>(m: Map<string, Map<string, V>>) => {
      for (const [ch, by] of m) {
        for (const [pk, v] of by) {
          const until = typeof v === 'number' ? v : (v as { expiresAt: number }).expiresAt;
          if (until && until <= now) { by.delete(pk); changed = true; }
        }
        if (!by.size) { m.delete(ch); changed = true; }
      }
    };
    drop(this.mesh);
    drop(this.sfuPresence);
    drop(this.sharing);
    for (const [ch, c] of this.sfuCalls) if (c.expiresAt && c.expiresAt <= now) { this.sfuCalls.delete(ch); changed = true; }
    if (changed) this.recompute();
    return changed;
  }

  private recompute(): void {
    const base = deriveActiveCalls(this.mesh, this.sfuPresence, this.sfuCalls);
    const out: Record<string, LiveCall> = {};
    for (const [ch, c] of Object.entries(base)) {
      // An SFU room still open in its empty grace isn't a transmission.
      if (c.participantCount === 0) continue;
      out[ch] = { ...c, screens: [...(this.sharing.get(ch)?.keys() ?? [])].sort() };
    }
    this.cache = out;
    for (const l of this.listeners) l(out);
  }

  start(relay: string = activeRelay()): void {
    this.stop();
    const since = this.now() - 60;
    this.subs.push(this.hub.subscribe({
      relays: [relay],
      filters: [{ kinds: [KIND_SFU_ACTIVE_CALL], since: this.now() - 6 * 3600 }, { kinds: [KIND_VOICE_PRESENCE], '#t': ['obelisk-voice-presence'], since }],
      priority: 'background',
      label: 'sky-live-calls',
      onEvent: (ev) => void this.ingest(ev),
    }));
    this.sweep = setInterval(() => this.prune(), 15_000);
  }

  stop(): void {
    for (const s of this.subs) s.release();
    this.subs = [];
    if (this.sweep) clearInterval(this.sweep);
    this.sweep = null;
    this.sfuCalls.clear();
    this.sfuPresence.clear();
    this.mesh.clear();
    this.sharing.clear();
    this.seen.clear();
    this.recompute();
  }
}

/** The live call the theater should show when nothing is picked: one with a screen being shared first, then the busiest. */
export function liveForTheater(calls: Record<string, LiveCall>, isVoice: (channelId: string) => boolean): string | null {
  const list = Object.entries(calls).filter(([ch]) => isVoice(ch));
  list.sort(([, a], [, b]) => (b.screens.length > 0 ? 1 : 0) - (a.screens.length > 0 ? 1 : 0) || b.participantCount - a.participantCount);
  return list[0]?.[0] ?? null;
}
