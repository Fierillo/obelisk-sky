import { describe, it, expect } from 'vitest';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';
import {
  IDLE_HEARTBEAT_MS, JUMP_GAP_MS, KEYS_CORRECTION_MS, KIND_SKY_MOTION, MIN_GAP_MS, MOTION_STALE_MS, PATH_CORRECTION_MS,
  MotionBeacon, MotionStore, extrapolate, motionTemplate, parseMotion, type Motion, type PlayerMotionState,
} from './motion';

const sk = generateSecretKey();
const sign = (m: Motion) => finalizeEvent(motionTemplate(m), sk);
const keys: Motion = { t: 1_000_000, p: { x: 1.234, z: -5.678 }, moving: true, run: true, dest: null, heading: Math.PI / 2 };
const click: Motion = { t: 1_000_500, p: { x: 0, z: 0 }, moving: true, run: false, dest: { x: 3, z: 4 }, heading: null };
const idle: Motion = { t: 1_001_000, p: { x: 2, z: 2 }, moving: false, run: false, dest: null, heading: null };

describe('motion events', () => {
  it('are ephemeral, tagged and expiring', () => {
    const ev = sign(keys);
    expect(ev.kind).toBe(KIND_SKY_MOTION);
    expect(ev.kind).toBeGreaterThanOrEqual(20000);
    expect(ev.kind).toBeLessThan(30000);
    expect(ev.tags).toContainEqual(['t', 'obelisk-sky-motion']);
    expect(ev.tags.find((t) => t[0] === 'expiration')).toBeTruthy();
  });
  it('round-trip walking by keys, a click and standing', () => {
    expect(parseMotion(sign(keys))).toMatchObject({ pk: getPk(), t: keys.t, p: { x: 1.23, z: -5.68 }, moving: true, run: true, dest: null, heading: 1.571 });
    expect(parseMotion(sign(click))).toMatchObject({ moving: true, run: false, dest: { x: 3, z: 4 }, heading: null });
    expect(parseMotion(sign(idle))).toMatchObject({ moving: false, run: false, dest: null, heading: null });
  });
  it('rejects junk and out-of-range values', () => {
    const bad = (content: unknown) => parseMotion(finalizeEvent({ ...motionTemplate(idle), content: JSON.stringify(content) }, sk));
    expect(bad({ v: 2, t: 1, p: [0, 0] })).toBeNull();
    expect(bad({ v: 1, p: [0, 0] })).toBeNull();
    expect(bad({ v: 1, t: 1, p: [0] })).toBeNull();
    expect(bad({ v: 1, t: 1, p: [1e9, 0] })).toBeNull();
    expect(bad({ v: 1, t: 1, p: ['a', 0] })).toBeNull();
    expect(parseMotion(finalizeEvent({ ...motionTemplate(idle), content: '{' }, sk))).toBeNull();
    expect(parseMotion(finalizeEvent({ ...motionTemplate(idle), kind: 1 }, sk))).toBeNull();
    // Moving with neither a destination nor a heading is standing.
    expect(bad({ v: 1, t: 1, p: [0, 0], mv: 1 })).toMatchObject({ moving: false });
  });
});

function getPk(): string {
  return sign(idle).pubkey;
}

describe('extrapolate', () => {
  const speeds = { walk: 1, run: 2 };
  it('carries a key-walker along their heading', () => {
    const p = extrapolate(keys, 1.5, speeds);
    expect(p.x).toBeCloseTo(1.234 + 3, 5);
    expect(p.z).toBeCloseTo(-5.678, 5);
  });
  it('leaves click-walkers and the idle where they are', () => {
    expect(extrapolate(click, 2, speeds)).toEqual(click.p);
    expect(extrapolate(idle, 2, speeds)).toEqual(idle.p);
  });
});

describe('MotionStore', () => {
  it('keeps the newest per person and forgets stale ones', () => {
    let now = 0;
    const s = new MotionStore({} as never, () => now);
    const seen: string[] = [];
    s.onChange((pk) => seen.push(pk));
    expect(s.ingest(sign(click))).toBe(true);
    expect(s.ingest(sign(keys))).toBe(false); // older t
    expect(s.ingest(sign(idle))).toBe(true);
    expect(seen).toHaveLength(2);
    now = 1000;
    expect(s.get(getPk())).toMatchObject({ m: { moving: false }, ageMs: 1000 });
    expect(s.livePks()).toEqual([getPk()]);
    now = MOTION_STALE_MS + 1;
    expect(s.get(getPk())).toBeNull();
    expect(s.livePks()).toEqual([]);
  });
});

describe('MotionBeacon', () => {
  const at = (p: Partial<PlayerMotionState>): PlayerMotionState => ({ p: { x: 0, z: 0 }, moving: false, run: false, dest: null, heading: 0, ...p });

  it('sends at once, then never more than once a second', () => {
    const b = new MotionBeacon();
    expect(b.update(at({}), 0)).toMatchObject({ moving: false });
    expect(b.update(at({ moving: true, heading: 0 }), 200)).toBeNull();
    // The change is still pending and goes out when the gap allows.
    expect(b.update(at({ moving: true, heading: 0 }), MIN_GAP_MS)).toMatchObject({ moving: true, heading: 0, dest: null });
  });
  it('sends turns, running and new clicks; ignores small wobbles', () => {
    const b = new MotionBeacon();
    b.update(at({ moving: true, heading: 0 }), 0);
    expect(b.update(at({ moving: true, heading: 0.1 }), 1500)).toBeNull();
    expect(b.update(at({ moving: true, heading: 1.2 }), 1600)).not.toBeNull();
    expect(b.update(at({ moving: true, heading: 1.2, run: true }), 2700)).toMatchObject({ run: true });
    expect(b.update(at({ moving: true, dest: { x: 5, z: 5 } }), 3800)).toMatchObject({ dest: { x: 5, z: 5 }, heading: null });
    expect(b.update(at({}), 4900)).toMatchObject({ moving: false, run: false });
  });
  it('corrects while walking and heartbeats while standing', () => {
    const b = new MotionBeacon();
    b.update(at({ moving: true, heading: 0 }), 0);
    expect(b.update(at({ moving: true, heading: 0 }), KEYS_CORRECTION_MS - 1)).toBeNull();
    expect(b.update(at({ moving: true, heading: 0 }), KEYS_CORRECTION_MS)).not.toBeNull();
    const c = new MotionBeacon();
    c.update(at({ moving: true, dest: { x: 1, z: 1 } }), 0);
    expect(c.update(at({ moving: true, dest: { x: 1, z: 1 } }), KEYS_CORRECTION_MS)).toBeNull();
    expect(c.update(at({ moving: true, dest: { x: 1, z: 1 } }), PATH_CORRECTION_MS)).not.toBeNull();
    const d = new MotionBeacon();
    d.update(at({}), 0);
    expect(d.update(at({}), IDLE_HEARTBEAT_MS - 1)).toBeNull();
    expect(d.update(at({}), IDLE_HEARTBEAT_MS)).not.toBeNull();
  });
  it('backs off when the relay refuses, and recovers', () => {
    const b = new MotionBeacon();
    b.update(at({}), 0);
    b.fail();
    b.fail();
    expect(b.slowdown).toBe(4);
    expect(b.update(at({ moving: true, heading: 0 }), 3 * MIN_GAP_MS)).toBeNull();
    expect(b.update(at({ moving: true, heading: 0 }), 4 * MIN_GAP_MS)).not.toBeNull();
    for (let i = 0; i < 10; i++) b.fail();
    expect(b.slowdown).toBe(8);
    b.ok(); b.ok(); b.ok();
    expect(b.slowdown).toBe(1);
  });
});

describe('jumps', () => {
  it('go out at once with j: 1, and parse back', () => {
    const b = new MotionBeacon();
    const base = { p: { x: 1, z: 2 }, moving: false, run: false, dest: null, heading: 0 };
    b.update(base, 0); // the first event
    const sent = b.update({ ...base, jumped: true }, JUMP_GAP_MS + 1);
    expect(sent?.jump).toBe(true);
    const ev = { ...motionTemplate(sent!), pubkey: 'a'.repeat(64), id: 'x', sig: 'y' };
    expect(JSON.parse(ev.content).j).toBe(1);
    expect(parseMotion(ev as never)?.jump).toBe(true);
  });
  it('still respect a minimum gap', () => {
    const b = new MotionBeacon();
    const base = { p: { x: 0, z: 0 }, moving: false, run: false, dest: null, heading: 0 };
    b.update(base, 0);
    expect(b.update({ ...base, jumped: true }, JUMP_GAP_MS - 50)).toBeNull();
  });
  it('are absent from ordinary events', () => {
    const ev = { ...motionTemplate({ t: 1, p: { x: 0, z: 0 }, moving: false, run: false, dest: null, heading: null }), pubkey: 'a'.repeat(64), id: 'x', sig: 'y' };
    expect(JSON.parse(ev.content).j).toBeUndefined();
    expect(parseMotion(ev as never)?.jump).toBe(false);
  });
});

describe('emotes', () => {
  const at = (p: Partial<PlayerMotionState>): PlayerMotionState => ({ p: { x: 0, z: 0 }, moving: false, run: false, dest: null, heading: 0, ...p });
  it('carries an emote while standing, and drops it while moving or when unknown', () => {
    expect(parseMotion(sign({ ...idle, emote: 'lotus' }))).toMatchObject({ moving: false, emote: 'lotus' });
    expect(parseMotion(sign({ ...keys, emote: 'dance' }))!.emote).toBeUndefined();
    const ev = finalizeEvent({ ...motionTemplate(idle), content: JSON.stringify({ v: 1, t: 1, p: [0, 0], e: 'fly' }) }, sk);
    expect(parseMotion(ev)!.emote).toBeUndefined();
  });
  it('sends starting and stopping an emote as a change', () => {
    const b = new MotionBeacon();
    b.update(at({}), 0);
    expect(b.update(at({ emote: 'dance' }), MIN_GAP_MS)).toMatchObject({ emote: 'dance' });
    expect(b.update(at({ emote: 'dance' }), MIN_GAP_MS * 3)).toBeNull();
    expect(b.update(at({ emote: null }), MIN_GAP_MS * 4)!.emote).toBeUndefined();
  });
  it('says when the emote began (es), so every screen plays it on the same beat', () => {
    const b = new MotionBeacon();
    b.update(at({}), 0);
    const m = b.update(at({ emote: 'sangre', emoteSince: 1_700_000_000_123 }), MIN_GAP_MS)!;
    const ev = finalizeEvent(motionTemplate({ ...m, t: 1_700_000_001_000 }), sk);
    expect(JSON.parse(ev.content).es).toBe(1_700_000_000_123);
    expect(parseMotion(ev)).toMatchObject({ emote: 'sangre', emoteSince: 1_700_000_000_123 });
    // A start after the event itself (a clock running ahead) is the event's time; none without an emote.
    const ahead = finalizeEvent({ ...motionTemplate(idle), content: JSON.stringify({ v: 1, t: 5000, p: [0, 0], e: 'groove', es: 9000 }) }, sk);
    expect(parseMotion(ahead)!.emoteSince).toBe(5000);
    const bare = finalizeEvent({ ...motionTemplate(idle), content: JSON.stringify({ v: 1, t: 5000, p: [0, 0], es: 4000 }) }, sk);
    expect(parseMotion(bare)!.emoteSince).toBeUndefined();
  });
});

describe('emotes while backing off', () => {
  const at = (p: Partial<PlayerMotionState>): PlayerMotionState => ({ p: { x: 0, z: 0 }, moving: false, run: false, dest: null, heading: 0, ...p });
  it('a short nod still goes out when the relay has slowed us down', () => {
    const b = new MotionBeacon();
    b.update(at({}), 0);
    b.fail(); b.fail(); // 4× slower
    expect(b.update(at({ emote: 'yes' }), MIN_GAP_MS)).toMatchObject({ emote: 'yes' });
    // An ordinary turn still waits for the slower pace.
    expect(b.update(at({ emote: 'yes', yaw: 2 }), MIN_GAP_MS * 2.5)).toBeNull();
  });
});

describe('facing and looking', () => {
  const at = (p: Partial<PlayerMotionState>): PlayerMotionState => ({ p: { x: 0, z: 0 }, moving: false, run: false, dest: null, heading: 0, ...p });
  it('carries the body yaw and a clamped look pitch', () => {
    const m = parseMotion(sign({ ...idle, yaw: 1.234, pitch: 2 }))!;
    expect(m.yaw).toBeCloseTo(1.23, 2);
    expect(m.pitch).toBeCloseTo(0.6, 2);
    expect(parseMotion(sign({ ...idle, yaw: 0.5, pitch: 0.01 }))!.pitch).toBeUndefined();
    const bad = finalizeEvent({ ...motionTemplate(idle), content: JSON.stringify({ v: 1, t: 1, p: [0, 0], y: 'x', lp: 9 }) }, sk);
    expect(parseMotion(bad)).toMatchObject({ moving: false });
    expect(parseMotion(bad)!.yaw).toBeUndefined();
    expect(parseMotion(bad)!.pitch).toBeUndefined();
  });
  it('sends a turn on the spot, not a twitch', () => {
    const b = new MotionBeacon();
    b.update(at({ yaw: 0 }), 0);
    expect(b.update(at({ yaw: 0.1 }), MIN_GAP_MS * 2)).toBeNull();
    expect(b.update(at({ yaw: 1.2 }), MIN_GAP_MS * 3)).toMatchObject({ yaw: 1.2 });
    expect(b.update(at({ yaw: 1.2, pitch: 0.5 }), MIN_GAP_MS * 5)).toMatchObject({ pitch: 0.5 });
  });
});
