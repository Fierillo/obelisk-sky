// Live movement: where you walk, so others see you move as you do.
//
// Ephemeral kind 20390 (relays forward it and keep nothing), signed with your
// own key and sent to the group relay. It carries intent, not a stream of
// positions: where you are, where a click is taking you (`d`) or which way
// you're heading (`h`), and whether you run. Every client walks you with the
// same speeds and pathfinding, so a few events a minute look like live
// walking. Interactions (sitting, training) stay in nostr/activity.ts and
// snap you onto the exact spot.
//
// Sending is conservative: at most one event a second, a correction every few
// seconds while you hold a direction, a heartbeat while you stand (so people
// who arrive later see where you are), and back-off when the relay refuses.

import type { Event as NostrEvent, EventTemplate } from 'nostr-tools';
import type { RelayHub } from '@nostr-wot/relay/hub';
import { activeRelay } from './hub';

export const KIND_SKY_MOTION = 20390;
export const MOTION_T_TAG = 'obelisk-sky-motion';

/** Never more often than this (ms), before any back-off. */
export const MIN_GAP_MS = 1000;
/** A correction while walking by keys / along a clicked path (ms). */
export const KEYS_CORRECTION_MS = 2000;
export const PATH_CORRECTION_MS = 4000;
/** While standing still (ms). */
export const IDLE_HEARTBEAT_MS = 30_000;
/** Someone whose last motion is older than this is no longer live (ms). */
export const MOTION_STALE_MS = 75_000;
const MAX_BACKOFF = 8;

type Vec2 = { x: number; z: number };

/** One player's movement state. */
export interface Motion {
  /** Sender's clock, ms. */
  t: number;
  p: Vec2;
  moving: boolean;
  run: boolean;
  /** Where a click is taking them (walking a path). */
  dest: Vec2 | null;
  /** Heading while walking by keys (radians, atan2(dx, dz)). */
  heading: number | null;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const finite = (v: unknown, lim = 1000): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= lim;
const point = (v: unknown): Vec2 | null =>
  Array.isArray(v) && v.length === 2 && finite(v[0]) && finite(v[1]) ? { x: v[0], z: v[1] } : null;

export function motionTemplate(m: Motion, at = Math.floor(m.t / 1000)): EventTemplate {
  const c: Record<string, unknown> = { v: 1, t: Math.round(m.t), p: [r2(m.p.x), r2(m.p.z)] };
  if (m.moving) c.mv = 1;
  if (m.run) c.run = 1;
  if (m.moving && m.dest) c.d = [r2(m.dest.x), r2(m.dest.z)];
  else if (m.moving && m.heading !== null) c.h = Math.round(m.heading * 1000) / 1000;
  return {
    kind: KIND_SKY_MOTION,
    created_at: at,
    tags: [['t', MOTION_T_TAG], ['expiration', String(at + 60)]],
    content: JSON.stringify(c),
  };
}

/** Strict parse; null for anything that isn't a well-formed motion event. */
export function parseMotion(ev: NostrEvent): (Motion & { pk: string }) | null {
  if (ev.kind !== KIND_SKY_MOTION) return null;
  let j: Record<string, unknown>;
  try { j = JSON.parse(ev.content); } catch { return null; }
  if (!j || typeof j !== 'object' || j.v !== 1 || !finite(j.t, 1e14)) return null;
  const p = point(j.p);
  if (!p) return null;
  const moving = j.mv === 1;
  const dest = moving ? point(j.d) : null;
  const heading = moving && !dest && finite(j.h, 10) ? j.h : null;
  return { pk: ev.pubkey, t: j.t, p, moving: moving && (!!dest || heading !== null), run: j.run === 1, dest, heading };
}

/** Where someone walking by keys should be `seconds` after their event. */
export function extrapolate(m: Motion, seconds: number, speeds: { walk: number; run: number }): Vec2 {
  if (!m.moving || m.dest || m.heading === null) return m.p;
  const v = m.run ? speeds.run : speeds.walk;
  return { x: m.p.x + Math.sin(m.heading) * v * seconds, z: m.p.z + Math.cos(m.heading) * v * seconds };
}

/** Everyone's latest motion on this relay. */
export class MotionStore {
  private byPk = new Map<string, Motion & { pk: string; got: number }>();
  private listeners = new Set<(pk: string) => void>();
  private sub: { release(): void } | null = null;

  constructor(private hub: RelayHub, private now: () => number = Date.now) {}

  onChange(cb: (pk: string) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  ingest(ev: NostrEvent): boolean {
    const m = parseMotion(ev);
    if (!m) return false;
    const prev = this.byPk.get(m.pk);
    if (prev && prev.t >= m.t) return false;
    this.byPk.set(m.pk, { ...m, got: this.now() });
    for (const l of this.listeners) l(m.pk);
    return true;
  }

  /** The latest motion for `pk` and how long ago it arrived (ms), if still live. */
  get(pk: string): { m: Motion; ageMs: number } | null {
    const r = this.byPk.get(pk);
    if (!r) return null;
    const ageMs = this.now() - r.got;
    return ageMs < MOTION_STALE_MS ? { m: r, ageMs } : null;
  }

  /** Everyone whose motion is still live. */
  livePks(): string[] {
    const now = this.now();
    return [...this.byPk.values()].filter((r) => now - r.got < MOTION_STALE_MS).map((r) => r.pk);
  }

  start(): void {
    this.sub?.release();
    this.sub = this.hub.subscribe({
      relays: [activeRelay()],
      filters: [{ kinds: [KIND_SKY_MOTION], since: Math.floor(this.now() / 1000) - 10 }],
      priority: 'background',
      label: 'sky-motion',
      onEvent: (ev) => void this.ingest(ev),
    });
  }

  stop(): void {
    this.sub?.release();
    this.sub = null;
  }
}

/** The viewer's movement this frame, as the controller sees it. */
export interface PlayerMotionState { p: Vec2; moving: boolean; run: boolean; dest: Vec2 | null; heading: number }

/**
 * When to publish the viewer's movement. Pure: feed it the state every frame;
 * it returns the Motion to send (or null), and hears back ok/fail.
 */
export class MotionBeacon {
  private lastSig = '';
  private lastSent = -Infinity;
  private backoff = 1;

  update(s: PlayerMotionState, nowMs: number): Motion | null {
    const sig = signature(s);
    const since = nowMs - this.lastSent;
    if (since < MIN_GAP_MS * this.backoff) return null;
    const due = sig !== this.lastSig
      || (s.moving && since >= (s.dest ? PATH_CORRECTION_MS : KEYS_CORRECTION_MS) * this.backoff)
      || since >= IDLE_HEARTBEAT_MS;
    if (!due) return null;
    this.lastSig = sig;
    this.lastSent = nowMs;
    return { t: nowMs, p: { ...s.p }, moving: s.moving, run: s.moving && s.run, dest: s.moving && s.dest ? { ...s.dest } : null, heading: s.moving && !s.dest ? s.heading : null };
  }

  /** The relay took it: ease back towards the normal pace. */
  ok(): void {
    this.backoff = Math.max(1, this.backoff / 2);
  }

  /** Refused or failed (rate limit): send less often for a while. */
  fail(): void {
    this.backoff = Math.min(MAX_BACKOFF, this.backoff * 2);
  }

  get slowdown(): number {
    return this.backoff;
  }

  reset(): void {
    this.lastSig = '';
    this.lastSent = -Infinity;
    this.backoff = 1;
  }
}

/** What counts as a change worth sending: start/stop, a new click, running, a turn of more than ~22°. */
function signature(s: PlayerMotionState): string {
  if (!s.moving) return 'idle';
  if (s.dest) return `d:${Math.round(s.dest.x * 2)}:${Math.round(s.dest.z * 2)}:${s.run ? 1 : 0}`;
  return `h:${Math.round(s.heading / (Math.PI / 8))}:${s.run ? 1 : 0}`;
}
