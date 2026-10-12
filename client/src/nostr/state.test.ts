import { describe, it, expect } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey, type Event as NostrEvent } from 'nostr-tools';
import { SkyState, reactionEmoji, HISTORY_SECONDS, parseZapAnnouncement } from './state';
import type { ServerMsg } from './wire';

const NOW = 1_800_000_000;
const alice = generateSecretKey();
const bob = generateSecretKey();
const relayKey = generateSecretKey();

function ev(sk: Uint8Array, kind: number, tags: string[][], content = '', created_at = NOW): NostrEvent {
  return finalizeEvent({ kind, tags, content, created_at }, sk);
}
const meta = (id: string, extra: string[][] = [], at = NOW) =>
  ev(relayKey, 39000, [['d', id], ['name', id.toUpperCase()], ...extra], '', at);
const msg = (sk: Uint8Array, group: string, content: string, tags: string[][] = [], at = NOW) =>
  ev(sk, 9, [['h', group], ...tags], content, at);

function setup() {
  const out: ServerMsg[] = [];
  const s = new SkyState((m) => out.push(m), () => NOW);
  return { s, out };
}

describe('SkyState visibility', () => {
  it('shows public groups and drops private, hidden and private-parent ones', () => {
    const { s } = setup();
    s.ingestGroupMeta(meta('pub', [['public']]));
    s.ingestGroupMeta(meta('priv', [['private']]));
    s.ingestGroupMeta(meta('hid', [['hidden']]));
    s.ingestGroupMeta(meta('child', [['parent', 'priv']]));
    s.ingestGroupMeta(meta('orphan', [['parent', 'unknown']]));
    expect(s.visibleGroupIds()).toEqual(['pub']);
  });

  it('never stores messages from a non-visible group', () => {
    const { s, out } = setup();
    s.ingestGroupMeta(meta('priv', [['private']]));
    s.ingestMessage(msg(alice, 'priv', 'secret'));
    expect(s.messageIds()).toHaveLength(0);
    expect(out.some((m) => m.t === 'msg')).toBe(false);
  });

  it('purges a group that flips to private and announces it', () => {
    const { s, out } = setup();
    s.ingestGroupMeta(meta('g', [], NOW - 10));
    s.ingestMessage(msg(alice, 'g', 'hello'));
    expect(s.messageIds()).toHaveLength(1);
    expect(s.ingestGroupMeta(meta('g', [['private']], NOW))).toBe(true);
    expect(s.messageIds()).toHaveLength(0);
    expect(out.at(-1)).toEqual({ t: 'group-removed', id: 'g' });
    expect((s.snapshot('r') as Extract<ServerMsg, { t: 'snapshot' }>).groups).toHaveLength(0);
  });

  it('shows every group the relay sent when not limited to public ones', () => {
    const out: ServerMsg[] = [];
    const s = new SkyState((m) => out.push(m), () => NOW, { publicOnly: false });
    s.ingestGroupMeta(meta('priv', [['private']]));
    s.ingestGroupMeta(meta('hid', [['hidden']]));
    expect(s.visibleGroupIds().sort()).toEqual(['hid', 'priv']);
  });

  it('ignores stale metadata', () => {
    const { s } = setup();
    s.ingestGroupMeta(meta('g', [['private']], NOW));
    s.ingestGroupMeta(meta('g', [], NOW - 100));
    expect(s.visibleGroupIds()).toEqual([]);
  });
});

describe('SkyState messages', () => {
  it('resolves a reply to the parent author', () => {
    const { s, out } = setup();
    s.ingestGroupMeta(meta('g'));
    const parent = msg(alice, 'g', 'hi');
    s.ingestMessage(parent);
    s.ingestMessage(msg(bob, 'g', 'hey alice', [['e', parent.id, '', 'reply'], ['p', getPublicKey(alice)]]));
    const last = out.at(-1) as Extract<ServerMsg, { t: 'msg' }>;
    expect(last.msg.replyTo).toBe(getPublicKey(alice));
    expect(last.msg.replyToId).toBe(parent.id);
  });

  it('falls back to the p tag when the parent is outside the window', () => {
    const { s, out } = setup();
    s.ingestGroupMeta(meta('g'));
    s.ingestMessage(msg(bob, 'g', 'late', [['e', 'f'.repeat(64), '', 'reply'], ['p', getPublicKey(alice)]]));
    expect((out.at(-1) as Extract<ServerMsg, { t: 'msg' }>).msg.replyTo).toBe(getPublicKey(alice));
  });

  it('drops messages older than the history window', () => {
    const { s } = setup();
    s.ingestGroupMeta(meta('g'));
    s.ingestMessage(msg(alice, 'g', 'old', [], NOW - HISTORY_SECONDS - 5));
    expect(s.messageIds()).toHaveLength(0);
  });

  it('wire messages carry no tags or raw content', () => {
    const { s, out } = setup();
    s.ingestGroupMeta(meta('g'));
    s.ingestMessage(msg(alice, 'g', 'look https://x.com/a.png'));
    const m = (out.at(-1) as Extract<ServerMsg, { t: 'msg' }>).msg;
    expect(Object.keys(m).sort()).toEqual(['content', 'createdAt', 'emojis', 'groupId', 'id', 'images', 'pubkey', 'replyTo', 'replyToId', 'text']);
    expect(m.text).toBe('look [image]');
  });
});

describe('SkyState reactions, zaps, profiles', () => {
  it('maps a reaction onto the message author', () => {
    const { s, out } = setup();
    s.ingestGroupMeta(meta('g'));
    const m = msg(alice, 'g', 'hi');
    s.ingestMessage(m);
    s.ingestReaction(ev(bob, 7, [['e', m.id], ['p', getPublicKey(alice)], ['h', 'g']], '🔥'));
    const r = out.at(-1) as Extract<ServerMsg, { t: 'reaction' }>;
    expect(r.reaction).toMatchObject({ target: getPublicKey(alice), emoji: '🔥', pubkey: getPublicKey(bob) });
  });

  it('ignores zaps on messages it does not hold', () => {
    const { s, out } = setup();
    s.ingestGroupMeta(meta('g'));
    s.ingestZap(ev(bob, 9735, [['e', 'a'.repeat(64)], ['bolt11', 'lnbc10n1x']]));
    expect(out.some((m) => m.t === 'zap')).toBe(false);
  });

  it('only exposes profiles of people seen in visible content', () => {
    const { s, out } = setup();
    s.ingestGroupMeta(meta('g'));
    s.ingestProfile(ev(alice, 0, [], JSON.stringify({ name: 'Alice', picture: 'https://p.example/a.png' })));
    expect(out.some((m) => m.t === 'profile')).toBe(false);
    s.ingestMessage(msg(alice, 'g', 'hi'));
    const p = out.find((m) => m.t === 'profile') as Extract<ServerMsg, { t: 'profile' }>;
    expect(p.profile.name).toBe('Alice');
    expect(p.profile.avatar).toBe('https://p.example/a.png');
    expect(s.isKnownPicture('https://p.example/a.png')).toBe(true);
    expect(s.isKnownPicture('https://evil.example/x.png')).toBe(false);
  });

  it('rejects non-https pictures', () => {
    const { s } = setup();
    s.ingestGroupMeta(meta('g'));
    s.ingestMessage(msg(alice, 'g', 'hi'));
    s.ingestProfile(ev(alice, 0, [], JSON.stringify({ name: 'A', picture: 'javascript:alert(1)' })));
    expect(s.isKnownPicture('javascript:alert(1)')).toBe(false);
  });
});

describe('deletions and media', () => {
  it('removes a message only when its author deletes it', () => {
    const { s, out } = setup();
    s.ingestGroupMeta(meta('g'));
    const m = msg(alice, 'g', 'oops');
    s.ingestMessage(m);
    s.ingestDeletion(ev(bob, 5, [['e', m.id], ['k', '9'], ['h', 'g']], 'remove message'));
    expect(s.messageIds()).toContain(m.id);
    s.ingestDeletion(ev(alice, 5, [['e', m.id], ['k', '9'], ['h', 'g']], 'remove message'));
    expect(s.messageIds()).not.toContain(m.id);
    expect(out.at(-1)).toEqual({ t: 'msg-removed', id: m.id, groupId: 'g' });
  });
  it('reads imeta images and custom emoji, https only', () => {
    const { s, out } = setup();
    s.ingestGroupMeta(meta('g'));
    s.ingestMessage(msg(alice, 'g', 'look :pepe:', [
      ['imeta', 'url https://img.example/a.jpg', 'm image/jpeg'],
      ['imeta', 'url http://insecure/b.jpg'],
      ['imeta', 'url https://v.example/c.mp4', 'm video/mp4'],
      ['emoji', 'pepe', 'https://e.example/pepe.png'],
      ['emoji', 'bad', 'javascript:alert(1)'],
    ]));
    const m = (out.at(-1) as Extract<ServerMsg, { t: 'msg' }>).msg;
    expect(m.images).toEqual(['https://img.example/a.jpg']);
    expect(m.emojis).toEqual({ pepe: 'https://e.example/pepe.png' });
    expect(m.content).toBe('look :pepe:');
  });
});

describe('reactionEmoji', () => {
  it('normalises reaction content', () => {
    expect(reactionEmoji('+')).toBe('❤️');
    expect(reactionEmoji('')).toBe('❤️');
    expect(reactionEmoji(':pepe:')).toBe('✨');
    expect(reactionEmoji('🤙')).toBe('🤙');
    expect(reactionEmoji('lol')).toBe('❤️');
  });
});

describe('the zap bot', () => {
  const zapBot = generateSecretKey();
  const A = getPublicKey(alice), B = getPublicKey(bob);
  const target = 'c'.repeat(64);

  it('reads the announcement', () => {
    expect(parseZapAnnouncement('⚡ @alice sent 1,420 satoshis to @bob', [['h', 'g'], ['e', target], ['p', A], ['p', B]]))
      .toEqual({ from: A, target: B, sats: 1420, targetId: target });
    expect(parseZapAnnouncement('⚡ @anonymous sent 1 satoshi to @bob', [['p', B]])).toEqual({ from: null, target: B, sats: 1, targetId: null });
    expect(parseZapAnnouncement('⚡ zap bot online — I will announce zaps', [['p', B]])).toBeNull();
    expect(parseZapAnnouncement('⚡ @alice sent 5 satoshis to @bob', [['p', B]])).toBeNull();
  });

  it('turns an announcement into a zap from the sender to the recipient, once', () => {
    const { s, out } = setup();
    s.ingestGroupMeta(meta('g'));
    const tags = [['e', target], ['p', A], ['p', B]];
    s.ingestMessage(msg(zapBot, 'g', '⚡ @alice sent 21 satoshis to @bob', tags));
    s.ingestMessage(msg(zapBot, 'g', '⚡ @alice sent 21 satoshis to @bob', tags, NOW + 1));
    const m = out.find((x) => x.t === 'msg') as Extract<ServerMsg, { t: 'msg' }>;
    expect(m.msg.zapNote).toBe(true);
    const zaps = out.filter((x) => x.t === 'zap') as Extract<ServerMsg, { t: 'zap' }>[];
    expect(zaps).toHaveLength(1);
    expect(zaps[0].zap).toMatchObject({ from: A, target: B, sats: 21, targetId: target, groupId: 'g' });
    expect((s.snapshot('r') as Extract<ServerMsg, { t: 'snapshot' }>).zaps).toHaveLength(1);
  });

  it('leaves ordinary messages alone', () => {
    const { s, out } = setup();
    s.ingestGroupMeta(meta('g'));
    s.ingestMessage(msg(alice, 'g', 'I sent 5 sats to bob'));
    expect((out.find((x) => x.t === 'msg') as Extract<ServerMsg, { t: 'msg' }>).msg.zapNote).toBeUndefined();
    expect(out.some((x) => x.t === 'zap')).toBe(false);
  });
});
