import { describe, it, expect } from 'vitest';
import { Director, CONVO_TTL, SIT_AFTER, MAX_PEOPLE, IMPLICIT_REPLY_WINDOW, type Command } from './director';
import type { WireMessage } from '../nostr/wire';

let n = 0;
const msg = (pubkey: string, groupId: string, at: number, replyTo: string | null = null): WireMessage =>
  ({ id: `m${n++}`, pubkey, groupId, text: 'hi', replyTo, replyToId: replyTo ? 'x' : null, createdAt: at });
const of = <C extends Command['c']>(cmds: Command[], c: C) => cmds.filter((x): x is Extract<Command, { c: C }> => x.c === c);

describe('Director', () => {
  it('a reply sends the replier into a conversation with the parent author', () => {
    const d = new Director();
    d.message(msg('A', 'g', 100), 100);
    d.take();
    d.message(msg('B', 'g', 9999, 'A'), 9999);
    const cmds = d.take();
    const gotos = of(cmds, 'goto-convo');
    expect(gotos.map((g) => g.pk).sort()).toEqual(['A', 'B']);
    expect(new Set(gotos.map((g) => g.convoId)).size).toBe(1);
    expect(of(cmds, 'say')[0]).toMatchObject({ pk: 'B', to: 'A' });
    expect(of(cmds, 'face')[0]).toMatchObject({ pk: 'A', target: 'B' });
  });

  it('treats a quick answer in the same channel as an implicit reply', () => {
    const d = new Director();
    d.message(msg('A', 'g', 100), 100);
    d.message(msg('B', 'g', 160), 160);
    expect(of(d.take(), 'say').at(-1)).toMatchObject({ pk: 'B', to: 'A' });
  });

  it('does not pair people across a long silence or across channels', () => {
    const d = new Director();
    d.message(msg('A', 'g', 100), 100);
    d.message(msg('B', 'g', 100 + IMPLICIT_REPLY_WINDOW + 1), 100 + IMPLICIT_REPLY_WINDOW + 1);
    d.message(msg('C', 'h', 100 + IMPLICIT_REPLY_WINDOW + 2), 100 + IMPLICIT_REPLY_WINDOW + 2);
    const says = of(d.take(), 'say');
    expect(says.every((s) => s.to === null)).toBe(true);
  });

  it('a third person answering joins the same circle', () => {
    const d = new Director();
    d.message(msg('A', 'g', 1), 1);
    d.message(msg('B', 'g', 2, 'A'), 2);
    d.message(msg('C', 'g', 3, 'B'), 3);
    expect([...d.convos.values()]).toHaveLength(1);
    expect([...d.convos.values()][0].members.sort()).toEqual(['A', 'B', 'C']);
  });

  it('sits down after a long exchange and breaks up after silence', () => {
    const d = new Director();
    for (let i = 0; i <= SIT_AFTER; i++) d.message(msg(i % 2 ? 'A' : 'B', 'g', i * 10), i * 10);
    expect(of(d.take(), 'sit')).toHaveLength(1);
    d.tick(SIT_AFTER * 10 + CONVO_TTL + 1);
    expect(of(d.take(), 'convo-end')).toHaveLength(1);
    expect(d.convos.size).toBe(0);
  });

  it('leaving for another channel ends a two-person conversation', () => {
    const d = new Director();
    d.message(msg('A', 'g', 1), 1);
    d.message(msg('B', 'g', 2, 'A'), 2);
    d.take();
    d.message(msg('B', 'other', 3), 3);
    const cmds = d.take();
    expect(of(cmds, 'convo-end')).toHaveLength(1);
    expect(of(cmds, 'goto-yard')[0]).toMatchObject({ pk: 'B', groupId: 'other' });
  });

  it('caps the scene, evicting the longest idle', () => {
    const d = new Director();
    for (let i = 0; i < MAX_PEOPLE + 5; i++) d.addResident(`p${i}`, 'g', i);
    expect(d.people.size).toBe(MAX_PEOPLE);
    expect(d.people.has('p0')).toBe(false);
    expect(d.people.has(`p${MAX_PEOPLE + 4}`)).toBe(true);
  });

  it('reactions and zaps become directed effects', () => {
    const d = new Director();
    d.message(msg('A', 'g', 1), 1);
    d.reaction({ id: 'r', pubkey: 'B', target: 'A', targetId: 'm', groupId: 'g', emoji: '🔥', createdAt: 2 }, 2);
    d.zap({ id: 'z', from: 'B', target: 'A', targetId: 'm', groupId: 'g', sats: 21, createdAt: 3 }, 3);
    const cmds = d.take();
    expect(of(cmds, 'react')[0]).toMatchObject({ from: 'B', to: 'A', emoji: '🔥' });
    expect(of(cmds, 'zap')[0]).toMatchObject({ from: 'B', to: 'A', sats: 21 });
  });
});
