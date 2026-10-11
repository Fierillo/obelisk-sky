import { describe, it, expect } from 'vitest';
import { AFK_AFTER_MS, PresenceTracker } from './presence';
import { parseChannelMembers } from './members';

describe('presence', () => {
  it('is online while live and active, AFK when idle, offline when not live', () => {
    const p = new PresenceTracker();
    expect(p.of('a', true, 1000)).toBe('online'); // just arrived
    expect(p.of('a', true, 1000 + AFK_AFTER_MS + 1)).toBe('afk');
    p.activity('a', 2000 + AFK_AFTER_MS);
    expect(p.of('a', true, 2000 + AFK_AFTER_MS + 10)).toBe('online');
    expect(p.of('a', false, 2000 + AFK_AFTER_MS + 10)).toBe('offline');
  });
});

describe('channel members', () => {
  const pk = (c: string) => c.repeat(64);
  const ev = (kind: number, at: number, d: string, pks: string[]) =>
    ({ kind, created_at: at, tags: [['d', d], ...pks.map((p) => ['p', p, 'admin'])], content: '', pubkey: pk('f'), id: String(at), sig: '' });
  it('takes the newest lists for that channel, admins counted as members', () => {
    const out = parseChannelMembers([
      ev(39002, 10, 'g', [pk('a')]),
      ev(39002, 20, 'g', [pk('a'), pk('b')]),
      ev(39001, 5, 'g', [pk('c')]),
      ev(39002, 30, 'other', [pk('d')]),
    ], 'g');
    expect(out.admins).toEqual([pk('c')]);
    expect(out.members.sort()).toEqual([pk('a'), pk('b'), pk('c')].sort());
  });
  it('ignores junk pubkeys', () => {
    expect(parseChannelMembers([ev(39002, 1, 'g', ['nope', pk('a')])], 'g').members).toEqual([pk('a')]);
  });
});
