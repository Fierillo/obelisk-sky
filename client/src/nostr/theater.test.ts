import { describe, it, expect } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools';
import {
  HAND_EVERY_S, SCREENING_HEARTBEAT_S, SCREENING_TTL_S, ScreeningBeacon, TheaterStore,
  canShare, canSpeak, handTemplate, parseHand, parseScreening, screeningDTag, screeningTemplate, type ScreeningSpec,
} from './theater';

const RELAY = 'wss://relay.test';
const T0 = 1_700_000_000;
const keys = () => { const sk = generateSecretKey(); return { sk, pk: getPublicKey(sk) }; };
const host = keys(), admin = keys(), viewer = keys();
const spec = (o: Partial<ScreeningSpec> = {}): ScreeningSpec => ({ channel: 'cine', since: T0, mic: [], screen: [], ...o });
const sign = (k: { sk: Uint8Array }, t: ReturnType<typeof screeningTemplate>) => finalizeEvent(t, k.sk);
const hub = { subscribe: () => ({ release() {} }) } as never;
const store = (now = T0 + 5) => new TheaterStore(hub, RELAY, () => now);

describe('screening events', () => {
  it('round-trip the channel, grants and since', () => {
    const ev = sign(host, screeningTemplate(RELAY, spec({ mic: [viewer.pk], title: 'Peli' }), { at: T0 + 3 }));
    expect(ev.tags).toContainEqual(['d', screeningDTag(RELAY)]);
    expect(ev.tags).toContainEqual(['h', 'cine']);
    expect(ev.tags).toContainEqual(['p', viewer.pk]);
    const s = parseScreening(ev, RELAY)!;
    expect(s).toMatchObject({ host: host.pk, channel: 'cine', since: T0, title: 'Peli', mic: [viewer.pk], screen: [], ended: false, exp: T0 + 3 + SCREENING_TTL_S });
  });
  it("ignore another relay's hall and malformed grants", () => {
    const ev = sign(host, screeningTemplate(RELAY, spec()));
    expect(parseScreening(ev, 'wss://other.test')).toBeNull();
    const bad = sign(host, { ...screeningTemplate(RELAY, spec()), content: JSON.stringify({ v: 1, op: 'start', channel: 'cine', since: T0, mic: ['nope', 7], screen: 'x' }) });
    expect(parseScreening(bad, RELAY)).toMatchObject({ mic: [], screen: [] });
  });
  it('an end can hand the hall to someone', () => {
    const ev = sign(host, screeningTemplate(RELAY, null, { next: admin.pk }));
    expect(parseScreening(ev, RELAY)).toMatchObject({ ended: true, next: admin.pk });
  });
});

describe('who holds the hall', () => {
  it('the live screening, until it ends or expires', () => {
    const s = store();
    s.ingest(sign(host, screeningTemplate(RELAY, spec(), { at: T0 })));
    expect(s.current()?.host).toBe(host.pk);
    expect(s.current(T0 + SCREENING_TTL_S + 1)).toBeNull();
    s.ingest(sign(host, screeningTemplate(RELAY, null, { at: T0 + 1 })));
    expect(s.current()).toBeNull();
  });
  it('the earlier since wins: an admin takes over by starting one dated before', () => {
    const s = store();
    s.ingest(sign(host, screeningTemplate(RELAY, spec(), { at: T0 })));
    s.ingest(sign(admin, screeningTemplate(RELAY, spec({ since: T0 + 2 }), { at: T0 + 2 })));
    expect(s.current()?.host).toBe(host.pk);
    s.ingest(sign(admin, screeningTemplate(RELAY, spec({ since: T0 - 1 }), { at: T0 + 3 })));
    expect(s.current()?.host).toBe(admin.pk);
  });
  it('keeps only the newest event per host', () => {
    const s = store();
    const newer = sign(host, screeningTemplate(RELAY, spec({ mic: [viewer.pk] }), { at: T0 + 2 }));
    const older = sign(host, screeningTemplate(RELAY, spec(), { at: T0 }));
    expect(s.ingest(newer)).toBe(true);
    expect(s.ingest(older)).toBe(false);
    expect(s.current()?.mic).toEqual([viewer.pk]);
  });
});

describe('grants', () => {
  it('the host may talk and share; others only when allowed; everyone when nothing is screening', () => {
    const s = parseScreening(sign(host, screeningTemplate(RELAY, spec({ mic: [viewer.pk] }))), RELAY)!;
    expect(canSpeak(s, host.pk)).toBe(true);
    expect(canShare(s, host.pk)).toBe(true);
    expect(canSpeak(s, viewer.pk)).toBe(true);
    expect(canShare(s, viewer.pk)).toBe(false);
    expect(canSpeak(s, admin.pk)).toBe(false);
    expect(canSpeak(null, admin.pk)).toBe(true);
  });
});

describe('raised hands', () => {
  it('reach the current host for its channel, and drop once granted or lowered', () => {
    const s = store();
    s.ingest(sign(host, screeningTemplate(RELAY, spec(), { at: T0 })));
    const hand = finalizeEvent(handTemplate(host.pk, 'cine', 'mic', T0 + 4), viewer.sk);
    expect(parseHand(hand)).toMatchObject({ pk: viewer.pk, to: host.pk, want: 'mic' });
    expect(s.ingest(hand)).toBe(true);
    expect(s.hands().map((h) => h.pk)).toEqual([viewer.pk]);
    // To someone else, or another channel: ignored.
    expect(s.ingest(finalizeEvent(handTemplate(admin.pk, 'cine', 'mic', T0 + 4), viewer.sk))).toBe(false);
    expect(s.ingest(finalizeEvent(handTemplate(host.pk, 'other', 'mic', T0 + 4), admin.sk))).toBe(false);
    s.ingest(sign(host, screeningTemplate(RELAY, spec({ mic: [viewer.pk] }), { at: T0 + 5 })));
    expect(s.hands()).toEqual([]);
    s.ingest(finalizeEvent(handTemplate(host.pk, 'cine', 'screen', T0 + 5), viewer.sk));
    expect(s.hands()).toHaveLength(1);
    s.ingest(finalizeEvent(handTemplate(host.pk, 'cine', 'down', T0 + 6), viewer.sk));
    expect(s.hands()).toEqual([]);
    expect(HAND_EVERY_S).toBeGreaterThan(0);
  });
});

describe('the host beacon', () => {
  it('sends on a change and on the heartbeat, and an end once', () => {
    const b = new ScreeningBeacon();
    expect(b.update(null, 0)).toBe(false);
    expect(b.update(spec(), 0)).toBe(true);
    expect(b.update(spec(), 1000)).toBe(false);
    expect(b.update(spec({ mic: [viewer.pk] }), 2000)).toBe(true);
    expect(b.update(spec({ mic: [viewer.pk] }), 2000 + SCREENING_HEARTBEAT_S * 1000)).toBe(true);
    expect(b.update(null, 50_000)).toBe(true);
    expect(b.update(null, 99_000)).toBe(false);
  });
});
