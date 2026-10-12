import { describe, it, expect } from 'vitest';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';
import {
  ACTIVITY_D_TAG, ACTIVITY_TTL_S, ActivityBeacon, ActivityStore, DEBOUNCE_MS, HEARTBEAT_S,
  activityTemplate, laneSpotId, parseActivity, parseSpot, seatSpotId, stationSpotId, validActivity, type Activity,
} from './activity';

const dips: Activity = { spot: 'station:1', kind: 'dip' };
const bench: Activity = { spot: 'seat:12:-34', kind: 'sit' };

describe('spot ids', () => {
  it('name stations by index and seats by position', () => {
    expect(stationSpotId(2)).toBe('station:2');
    expect(seatSpotId({ x: 1.234, z: -3.36 })).toBe('seat:12:-34');
    expect(parseSpot('station:2')).toEqual({ type: 'station', index: 2 });
    expect(parseSpot('seat:12:-34')).toEqual({ type: 'seat', pos: { x: 1.2, z: -3.4 } });
  });
  it('reject anything else', () => {
    for (const bad of ['', 'station:', 'station:x', 'station:123', 'seat:1', 'seat:1:2:3', 'bench:1:2', 'seat:1.5:2']) expect(parseSpot(bad)).toBeNull();
  });
  it('pair exercises with stations and sitting with seats', () => {
    expect(validActivity('station:0', 'muscleup')).toBe(true);
    expect(validActivity('seat:0:0', 'sit')).toBe(true);
    expect(validActivity('station:0', 'sit')).toBe(false);
    expect(validActivity('seat:0:0', 'dip')).toBe(false);
    expect(validActivity('station:0', 'backflip')).toBe(false);
  });
});

describe('activity events', () => {
  const sk = generateSecretKey();
  const sign = (a: Activity | null, at: number, since = at, prev = 0) => finalizeEvent(activityTemplate(a, since, prev, at), sk);

  it('round-trips a start and a stop', () => {
    const start = sign(dips, 1000, 990);
    expect(start.kind).toBe(30078);
    expect(start.tags).toContainEqual(['d', ACTIVITY_D_TAG]);
    expect(start.tags).toContainEqual(['op', 'start']);
    expect(start.tags).toContainEqual(['spot', 'station:1']);
    expect(start.tags).toContainEqual(['expiration', String(1000 + ACTIVITY_TTL_S)]);
    expect(parseActivity(start)).toMatchObject({ pk: start.pubkey, at: 1000, since: 990, exp: 1000 + ACTIVITY_TTL_S, activity: dips });
    const stop = sign(null, 1001);
    expect(stop.tags).toContainEqual(['op', 'stop']);
    expect(stop.tags.some((t) => t[0] === 'spot')).toBe(false);
    expect(parseActivity(stop)!.activity).toBeNull();
  });
  it('always moves created_at forward for the replaceable event', () => {
    expect(activityTemplate(dips, 5, 2000, 1000).created_at).toBe(2001);
  });
  it('rejects junk, bad pairs and a missing expiration', () => {
    const base = activityTemplate(dips, 1000, 0, 1000);
    const with_ = (content: unknown, tags = base.tags) => finalizeEvent({ ...base, tags, content: JSON.stringify(content) }, sk);
    expect(parseActivity(with_({ v: 1, op: 'start', spot: 'station:1', kind: 'sit' }))).toBeNull();
    expect(parseActivity(with_({ v: 1, op: 'start', spot: 'roof', kind: 'dip' }))).toBeNull();
    expect(parseActivity(with_({ v: 2, op: 'start', spot: 'station:1', kind: 'dip' }))).toBeNull();
    expect(parseActivity(with_({ v: 1, op: 'dance' }))).toBeNull();
    expect(parseActivity(with_({ v: 1, op: 'start', spot: 'station:1', kind: 'dip' }, base.tags.filter((t) => t[0] !== 'expiration')))).toBeNull();
    expect(parseActivity(finalizeEvent({ ...base, content: '{nope' }, sk))).toBeNull();
    expect(parseActivity(finalizeEvent({ ...base, tags: [['d', 'obelisk:avatar3d:v1']] }, sk))).toBeNull();
  });
  it('caps a far expiration and a future since', () => {
    const t = activityTemplate(dips, 1000, 0, 1000);
    const ev = finalizeEvent({
      ...t,
      tags: t.tags.map((x) => (x[0] === 'expiration' ? ['expiration', '999999'] : x)),
      content: JSON.stringify({ v: 1, op: 'start', spot: 'station:1', kind: 'dip', since: 5000 }),
    }, sk);
    expect(parseActivity(ev)).toMatchObject({ exp: 1000 + ACTIVITY_TTL_S, since: 1000 });
  });
});

describe('ActivityStore', () => {
  const ana = generateSecretKey(), beto = generateSecretKey(), me = generateSecretKey();
  const ev = (sk: Uint8Array, a: Activity | null, at: number, since = at) => finalizeEvent(activityTemplate(a, since, 0, at), sk);
  const store = () => new ActivityStore({} as never);

  it('keeps the newest event per person', () => {
    const s = store();
    const a = ev(ana, dips, 1000), b = ev(ana, null, 1010);
    expect(s.ingest(b)).toBe(true);
    expect(s.ingest(a)).toBe(false);
    expect(s.live(1011)).toEqual([]);
  });
  it('drops claims once they expire', () => {
    const s = store();
    s.ingest(ev(ana, dips, 1000));
    expect(s.live(1000 + ACTIVITY_TTL_S - 1)).toHaveLength(1);
    expect(s.live(1000 + ACTIVITY_TTL_S)).toEqual([]);
  });
  it('gives a contested spot to whoever got there first', () => {
    const s = store();
    const a = ev(ana, dips, 1050, 1000), b = ev(beto, dips, 1020, 1010);
    s.ingest(a);
    s.ingest(b);
    const live = s.live(1060);
    expect(live.find((c) => c.pk === a.pubkey)!.held).toBe(true);
    expect(live.find((c) => c.pk === b.pubkey)!.held).toBe(false);
  });
  it('holds different spots side by side', () => {
    const s = store();
    s.ingest(ev(ana, dips, 1000));
    s.ingest(ev(beto, bench, 1000));
    expect(s.live(1001).every((c) => c.held)).toBe(true);
  });
  it('races the viewer’s unpublished activity, and ignores their stale record', () => {
    const s = store();
    const mine = ev(me, bench, 1000);
    s.ingest(mine);
    s.ingest(ev(ana, dips, 1005, 1005));
    // Now on the bars since 1003: earlier than Ana, so it's ours.
    const live = s.live(1006, { pk: mine.pubkey, activity: dips, since: 1003 });
    expect(live.filter((c) => c.pk === mine.pubkey)).toHaveLength(1);
    expect(live.find((c) => c.pk === mine.pubkey)).toMatchObject({ spot: 'station:1', held: true });
    expect(live.find((c) => c.pk !== mine.pubkey)!.held).toBe(false);
    // Stood up: the old bench record is no claim.
    expect(s.live(1006, { pk: mine.pubkey, activity: null, since: 0 }).some((c) => c.pk === mine.pubkey)).toBe(false);
  });
  it('tells listeners when something new arrives', () => {
    const s = store();
    let n = 0;
    s.onChange(() => n++);
    const e = ev(ana, dips, 1000);
    s.ingest(e);
    s.ingest(e);
    expect(n).toBe(1);
  });
});

describe('ActivityBeacon', () => {
  it('publishes once the activity holds, then heartbeats, then stops', () => {
    const b = new ActivityBeacon();
    expect(b.update(null, 0)).toBeNull();
    expect(b.update(dips, 10_000)).toBeNull();
    expect(b.update(dips, 10_000 + DEBOUNCE_MS - 1)).toBeNull();
    expect(b.update(dips, 10_000 + DEBOUNCE_MS)).toEqual({ activity: dips, since: 10 });
    expect(b.published).toBe(true);
    expect(b.update(dips, 12_000)).toBeNull();
    expect(b.update(dips, 11_000 + HEARTBEAT_S * 1000)).toEqual({ activity: dips, since: 10 });
    expect(b.update(null, 60_000)).toBeNull();
    expect(b.update(null, 60_000 + DEBOUNCE_MS)).toEqual({ activity: null, since: 10 });
    expect(b.published).toBe(false);
    expect(b.update(null, 200_000)).toBeNull();
  });
  it('does not publish a quick change of mind', () => {
    const b = new ActivityBeacon();
    b.update(bench, 0);
    expect(b.update(null, 300)).toBeNull();
    expect(b.update(null, 5_000)).toBeNull();
  });
  it('sends the new activity when you switch exercise', () => {
    const b = new ActivityBeacon();
    b.update(dips, 0);
    b.update(dips, DEBOUNCE_MS);
    const mu = { spot: 'station:0', kind: 'muscleup' as const };
    b.update(mu, 20_000);
    expect(b.update(mu, 20_000 + DEBOUNCE_MS)).toEqual({ activity: mu, since: 20 });
  });
});

describe('track lanes and gym lifts', () => {
  it('pairs lanes with running and stations with exercises', () => {
    expect(parseSpot(laneSpotId(2))).toEqual({ type: 'lane', index: 2 });
    expect(validActivity('lane:1', 'run')).toBe(true);
    expect(validActivity('lane:1', 'sit')).toBe(false);
    expect(validActivity('lane:1', 'pushup')).toBe(false);
    expect(validActivity('station:4', 'benchpress')).toBe(true);
    expect(validActivity('station:4', 'run')).toBe(false);
    expect(validActivity('seat:10:20', 'run')).toBe(false);
    expect(parseSpot('lane:12')).toBeNull();
  });
});

describe('emotes on the spot (remote signers)', () => {
  it('names where you stand and pairs it only with an emote', async () => {
    const { hereSpotId, emoteActivity, emoteOfActivity } = await import('./activity');
    const spot = hereSpotId({ x: 1.23, z: -4.56 });
    expect(spot).toBe('here:12:-46');
    expect(parseSpot(spot)).toEqual({ type: 'here', pos: { x: 1.2, z: -4.6 } });
    expect(validActivity(spot, emoteActivity('dance'))).toBe(true);
    expect(validActivity(spot, 'sit')).toBe(false);
    expect(validActivity(spot, 'emote:backflip')).toBe(false);
    expect(validActivity('seat:0:0', 'emote:dance')).toBe(false);
    expect(emoteOfActivity('emote:lotus')).toBe('lotus');
    expect(emoteOfActivity('sit')).toBeNull();
  });
  it('round-trips through an event', () => {
    const ev = { ...activityTemplate({ spot: 'here:10:20', kind: 'emote:dance' }, 100, 0, 100), pubkey: 'a'.repeat(64), id: 'x', sig: 'y' };
    expect(parseActivity(ev as never)?.activity).toEqual({ spot: 'here:10:20', kind: 'emote:dance' });
  });
});
