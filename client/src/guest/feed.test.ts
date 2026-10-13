import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RelayHub } from '@nostr-wot/relay/hub';
import { GuestFeed, seeded } from './feed';
import { NPCS, houseGroupId } from './script';
import { localEvent, setGuest } from '../nostr/guest';
import { messageTemplate } from '../nostr/publish';
import type { ServerMsg } from '../nostr/wire';

const ME = 'ab'.repeat(32);

function fakeHub() {
  return {
    publish: vi.fn(async () => []),
    query: vi.fn(async () => ({ events: [] })),
    subscribe: vi.fn(),
  };
}

describe('GuestFeed', () => {
  let clock = 1_760_000_000;
  beforeEach(() => { vi.useFakeTimers(); clock = 1_760_000_000; });
  afterEach(() => { vi.useRealTimers(); setGuest(null); });

  function make(hub = fakeHub()) {
    const got: ServerMsg[] = [];
    const feed = new GuestFeed(hub as unknown as RelayHub, { onMsg: (m) => got.push(m) }, {
      lang: 'en', relay: 'wss://public.obelisk.ar', me: ME, guestName: 'Guest',
      profileRelays: () => ['wss://purplepag.es'],
      now: () => clock, random: seeded(7),
      pace: { thread: [5, 5], line: [3, 3] },
    });
    return { feed, got, hub };
  }

  const advance = (s: number) => { for (let i = 0; i < s; i++) { clock++; vi.advanceTimersByTime(1000); } };

  it('opens with one snapshot, then plays the script live, for as long as it runs', () => {
    const { feed, got } = make();
    feed.start();
    expect(got[0].t).toBe('snapshot');
    expect(got.filter((m) => m.t === 'snapshot')).toHaveLength(1);
    advance(600);
    const live = got.filter((m): m is Extract<ServerMsg, { t: 'msg' }> => m.t === 'msg');
    expect(live.length).toBeGreaterThan(20);
    for (const m of live) expect(NPCS.some((n) => n.pubkey === m.msg.pubkey)).toBe(true);
    expect(got.some((m) => m.t === 'reaction')).toBe(true);
    feed.stop();
    const n = got.length;
    advance(60);
    expect(got.length).toBe(n);
  });

  it('answers what the guest says, a few seconds later, as a reply', () => {
    const { feed, got } = make();
    feed.start();
    setGuest('logged-out', ME);
    const mine = localEvent(messageTemplate(houseGroupId('mate'), 'hola a todos', null, [], clock), ME);
    feed.state.ingestMessage(mine);
    advance(12);
    const answer = got.find((m): m is Extract<ServerMsg, { t: 'msg' }> => m.t === 'msg' && m.msg.replyToId === mine.id);
    expect(answer).toBeTruthy();
    expect(NPCS.some((n) => n.pubkey === answer!.msg.pubkey)).toBe(true);
    expect(answer!.msg.replyTo).toBe(ME);
    feed.stop();
  });

  it('only reads kind 0s, from the relays it is given, and never publishes', () => {
    const { feed, hub } = make();
    feed.start();
    advance(30);
    feed.stop();
    expect(hub.publish).not.toHaveBeenCalled();
    expect(hub.query).toHaveBeenCalled();
    for (const [q] of hub.query.mock.calls as unknown as [{ relays: string[]; filters: { kinds: number[]; authors: string[] }[] }][]) {
      expect(q.relays).toEqual(['wss://purplepag.es']);
      expect(q.filters.every((f) => f.kinds.length === 1 && f.kinds[0] === 0)).toBe(true);
      // The guest's own pubkey is made up: never asked for.
      expect(q.filters.every((f) => !f.authors.includes(ME))).toBe(true);
    }
  });

  it('names a logged-out guest', () => {
    const { feed, got } = make();
    feed.start();
    feed.state.ingestMessage(localEvent(messageTemplate(houseGroupId('bitcoin'), 'hi', null, [], clock), ME));
    const prof = got.find((m): m is Extract<ServerMsg, { t: 'profile' }> => m.t === 'profile' && m.profile.pubkey === ME);
    expect(prof?.profile.name).toBe('Guest');
    feed.stop();
  });
});
