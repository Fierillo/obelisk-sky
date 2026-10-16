import { describe, it, expect } from 'vitest';
import { channelsOnly, forumOf, forumThreads, homeOf } from './forum';
import type { WireGroup, WireMessage } from './wire';

const g = (id: string, kind: WireGroup['kind'], parent?: string): WireGroup => ({ id, name: id, about: '', kind, ...(parent ? { parent } : {}) });
const groups = [g('pubs', 'forum'), g('t1', 'text', 'pubs'), g('t2', 'text', 'pubs'), g('t3', 'text', 'pubs'), g('chat', 'text'), g('sub', 'text', 'chat')];
const byId = new Map(groups.map((x) => [x.id, x]));
const msg = (id: string, groupId: string, at: number): WireMessage => ({ id, pubkey: 'p'.repeat(64), groupId, text: id, replyTo: null, replyToId: null, createdAt: at });

describe('forums (obelisk-dex publications)', () => {
  it("a forum's children are its threads; a text channel's children stay channels", () => {
    expect(forumOf(byId.get('t1'), byId)).toBe('pubs');
    expect(forumOf(byId.get('sub'), byId)).toBeNull();
    expect(homeOf('t2', byId)).toBe('pubs');
    expect(homeOf('chat', byId)).toBe('chat');
  });

  it('draws no house and lists no row for a thread', () => {
    expect(channelsOnly(groups).map((x) => x.id)).toEqual(['pubs', 'chat', 'sub']);
  });

  it('lists threads with messages, latest activity first, with their opening and last post', () => {
    const msgs: Record<string, WireMessage[]> = { t1: [msg('a', 't1', 10), msg('b', 't1', 50)], t2: [msg('c', 't2', 30)] };
    const out = forumThreads('pubs', groups, (id) => msgs[id] ?? []);
    expect(out.map((t) => t.group.id)).toEqual(['t1', 't2']);
    expect(out[0]).toMatchObject({ count: 2, first: { id: 'a' }, last: { id: 'b' } });
  });
});
