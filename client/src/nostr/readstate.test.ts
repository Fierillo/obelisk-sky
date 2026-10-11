import { describe, it, expect } from 'vitest';
import { decodeCursors, encodeCursors, mergeCursors, countUnread, effectiveCursor, FALLBACK_WINDOW_MS } from './readstate';

describe('read-state payload (shared with obelisk.ar)', () => {
  it('round-trips the app wire format', () => {
    const wire = { v: 1, groups: { g1: { lastReadAt: 1700000000000 }, g2: { lastReadAt: 5 } }, mentionsReadAt: 9 };
    const c = decodeCursors(wire);
    expect(c).toEqual({ groups: { g1: 1700000000000, g2: 5 }, mentionsReadAt: 9 });
    expect(encodeCursors(c)).toEqual(wire);
  });
  it('rejects other versions and junk', () => {
    expect(decodeCursors({ v: 2, groups: { g: { lastReadAt: 1 } } })).toEqual({ groups: {}, mentionsReadAt: 0 });
    expect(decodeCursors({ v: 1, groups: { g: { lastReadAt: 'x' } } }).groups).toEqual({});
    expect(decodeCursors(null).groups).toEqual({});
  });
  it('merges with max and never moves a cursor back', () => {
    const a = { groups: { g: 10, h: 5 }, mentionsReadAt: 3 };
    expect(mergeCursors(a, { groups: { g: 4, h: 8, i: 1 }, mentionsReadAt: 2 })).toBe(true);
    expect(a).toEqual({ groups: { g: 10, h: 8, i: 1 }, mentionsReadAt: 3 });
    expect(mergeCursors(a, { groups: { g: 1 }, mentionsReadAt: 0 })).toBe(false);
  });
});

describe('unread counting', () => {
  const msgs = [10, 20, 30, 40].map((s, i) => ({ createdAt: s, pubkey: i === 3 ? 'me' : 'x' }));
  it('counts others\' messages after the cursor (ms vs s)', () => {
    expect(countUnread(msgs, 15_000, 'me')).toBe(2);
    expect(countUnread(msgs, 0, null)).toBe(4);
  });
  it('falls back to the last 24 h with no cursor', () => {
    expect(effectiveCursor(undefined, 1e12)).toBe(1e12 - FALLBACK_WINDOW_MS);
    expect(effectiveCursor(77, 1e12)).toBe(77);
  });
});
