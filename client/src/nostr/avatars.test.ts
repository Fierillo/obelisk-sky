import { describe, it, expect } from 'vitest';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';
import { parseAvatar, avatarTemplate, AvatarStore, AVATAR_D_TAG, DEFAULT_AVATAR } from './avatars';
import { defaultLook, parseLook } from '../people/people';

describe('avatar config', () => {
  it('round-trips through its event', () => {
    const a = { v: 1 as const, skin: 'q', look: null, hat: 'boina' as const, hatColor: '#ff4d5e', pet: { kind: 'dog' as const, name: 'Mate' } };
    const t = avatarTemplate(a);
    expect(t.tags).toEqual([['d', AVATAR_D_TAG]]);
    expect(parseAvatar(t.content)).toEqual(a);
  });
  it('drops unknown values and fields, clips names', () => {
    const a = parseAvatar(JSON.stringify({ v: 1, skin: 'zz', hat: 'helmet', hatColor: 'red', pet: { kind: 'dragon', name: 'x' }, extra: '<script>' }))!;
    expect(a).toEqual({ ...DEFAULT_AVATAR, pet: null });
    const b = parseAvatar(JSON.stringify({ v: 1, pet: { kind: 'cat', name: 'x'.repeat(100) + '‮' } }))!;
    expect(b.pet!.name).toHaveLength(24);
    expect(Object.keys(b).sort()).toEqual(['hat', 'hatColor', 'look', 'pet', 'skin', 'v']);
  });
  it('rejects other versions and junk', () => {
    expect(parseAvatar('nope')).toBeNull();
    expect(parseAvatar(JSON.stringify({ v: 2 }))).toBeNull();
    expect(parseAvatar(JSON.stringify({ v: 3, skin: 'a' }))).toBeNull();
  });
  it('keeps the newest per person', () => {
    const sk = generateSecretKey();
    const store = new AvatarStore({} as never);
    const ev = (skin: string, at: number) => finalizeEvent({ ...avatarTemplate({ ...DEFAULT_AVATAR, skin }), created_at: at }, sk);
    store.ingest(ev('b', 20));
    store.ingest(ev('c', 10));
    expect(store.get(ev('a', 1).pubkey)!.skin).toBe('b');
  });
});

describe('avatar v2 (a full look)', () => {
  const look = { ...defaultLook(42), body: 'm' as const, outfit: 'ranger' as const, hood: true, beard: true };
  it('round-trips a look', () => {
    const a = { ...DEFAULT_AVATAR, v: 2 as const, look };
    expect(parseAvatar(avatarTemplate(a).content)).toEqual(a);
  });
  it('rejects a look with any value off its list', () => {
    for (const bad of [{ top: 'red' }, { hair: 'mohawk' }, { body: 'x' }, { skinTint: '#123456' }, { shoes: 'url(x)' }]) {
      expect(parseLook({ ...look, ...bad })).toBeNull();
      expect(parseAvatar(JSON.stringify({ v: 2, skin: 'a', look: { ...look, ...bad } }))).toBeNull();
    }
  });
  it('drops a beard or hood that the body or outfit cannot wear, and extra fields', () => {
    const f = parseLook({ ...look, body: 'f', beard: true, outfit: 'peasant', hood: true, extra: 1 })!;
    expect(f.beard).toBe(false);
    expect(f.hood).toBe(false);
    expect(Object.keys(f)).not.toContain('extra');
  });
  it('still reads v1 avatars, with no look', () => {
    const a = parseAvatar(JSON.stringify({ v: 1, skin: 'c', hat: 'cap', hatColor: '#38bdf8', pet: null }))!;
    expect(a.v).toBe(1);
    expect(a.look).toBeNull();
    expect(a.skin).toBe('c');
  });
  it('gives everyone a stable default look', () => {
    expect(defaultLook(7)).toEqual(defaultLook(7));
    expect(parseLook(defaultLook(7))).toEqual(defaultLook(7));
  });
});
