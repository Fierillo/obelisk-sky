import { describe, it, expect } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import { KIND_SFU_ACTIVE_CALL, KIND_VOICE_PRESENCE, LiveCalls, liveForTheater } from './liveCalls';

const T = 1_700_000_000;
const A = 'a'.repeat(64), B = 'b'.repeat(64), SFU = 'f'.repeat(64);
let n = 0;
const ev = (o: Partial<NostrEvent>): NostrEvent => ({ id: String(++n).padStart(64, '0'), pubkey: A, created_at: T, kind: 1, tags: [], content: '', sig: '', ...o });
const hub = { subscribe: () => ({ release() {} }) } as never;
const active = (ch: string, o: { status?: string; count?: number; at?: number; ps?: string[] } = {}) => ev({
  kind: KIND_SFU_ACTIVE_CALL, pubkey: SFU, created_at: o.at ?? T,
  tags: [['d', ch], ['host', SFU], ['status', o.status ?? 'active'], ['expiration', String(T + 300)], ...(o.count !== undefined ? [['count', String(o.count)]] : []), ...(o.ps ?? []).map((p) => ['p', p])],
});
const beacon = (ch: string, pk: string, o: { screen?: boolean; left?: boolean; at?: number } = {}) => ev({
  kind: KIND_VOICE_PRESENCE, pubkey: pk, created_at: o.at ?? T,
  tags: [['e', ch], ['t', 'obelisk-voice-presence'], ['expiration', String((o.at ?? T) + 30)], ...(o.screen ? [['v', 'screen']] : []), ...(o.left ? [['status', 'left']] : [])],
});

describe('live calls', () => {
  it("see an SFU room that's on, with its people, until it closes", () => {
    const l = new LiveCalls(hub, () => T + 5);
    l.ingest(active('big', { count: 2, ps: [A, B] }));
    expect(l.get('big')).toMatchObject({ mode: 'sfu', participantCount: 2 });
    l.ingest(active('big', { status: 'closed', at: T + 1 }));
    expect(l.get('big')).toBeNull();
  });
  it('an SFU room with nobody in it (its empty grace) is not a transmission', () => {
    const l = new LiveCalls(hub, () => T + 5);
    l.ingest(active('big', { count: 0 }));
    expect(l.get('big')).toBeNull();
  });
  it('see who shares a screen from their beacons, in mesh and SFU rooms', () => {
    const l = new LiveCalls(hub, () => T + 5);
    l.ingest(beacon('cine', A, { screen: true }));
    l.ingest(beacon('cine', B));
    expect(l.get('cine')).toMatchObject({ mode: 'mesh', participantCount: 2, screens: [A] });
    l.ingest(beacon('cine', A, { left: true, at: T + 1 }));
    expect(l.get('cine')!.screens).toEqual([]);
    l.ingest(active('big', { count: 1, ps: [B] }));
    l.ingest(beacon('big', B, { screen: true }));
    expect(l.get('big')).toMatchObject({ mode: 'sfu', screens: [B] });
  });
  it('forget beacons once they expire', () => {
    let now = T + 5;
    const l = new LiveCalls(hub, () => now);
    l.ingest(beacon('cine', A));
    now = T + 60;
    expect(l.prune()).toBe(true);
    expect(l.get('cine')).toBeNull();
  });
  it('the theater shows a call with a screen shared first, then the busiest', () => {
    const l = new LiveCalls(hub, () => T + 5);
    l.ingest(active('big', { count: 5, ps: [A, B] }));
    l.ingest(beacon('cine', A, { screen: true }));
    expect(liveForTheater(l.all(), () => true)).toBe('cine');
    expect(liveForTheater(l.all(), (id) => id === 'big')).toBe('big');
    expect(liveForTheater({}, () => true)).toBeNull();
  });
  it('tells listeners (the voice bridge) at once and on every change', () => {
    const l = new LiveCalls(hub, () => T + 5);
    const seen: string[][] = [];
    l.onChange((c) => seen.push(Object.keys(c)));
    l.ingest(active('big', { count: 1, ps: [A] }));
    expect(seen).toEqual([[], ['big']]);
  });
});
