import { describe, it, expect, vi } from 'vitest';
import { generateSecretKey, getPublicKey, finalizeEvent, type EventTemplate } from 'nostr-tools';
import { messageTemplate, reactionTemplate, deletionTemplate, joinTemplate, publishToGroup } from './publish';

const parent = { id: 'e'.repeat(64), pubkey: 'f'.repeat(64) };
const mentioned = getPublicKey(generateSecretKey());

describe('event shapes match obelisk-dex', () => {
  it('kind 9: emoji tags, h, reply e+p, mention p in that order', () => {
    const t = messageTemplate('g1', `hi nostr:npub1${mentioned}`, parent, [['emoji', 'pepe', 'https://x/p.png']], 100);
    expect(t.kind).toBe(9);
    expect(t.tags).toEqual([
      ['emoji', 'pepe', 'https://x/p.png'],
      ['h', 'g1'],
      ['e', parent.id, '', 'reply'],
      ['p', parent.pubkey],
      ['p', mentioned],
    ]);
  });
  it('does not duplicate a mention of the reply target', () => {
    const t = messageTemplate('g1', `nostr:npub1${parent.pubkey}`, parent);
    expect(t.tags.filter((x) => x[0] === 'p')).toEqual([['p', parent.pubkey]]);
  });
  it('kind 7, kind 5 and kind 9021', () => {
    expect(reactionTemplate('g', parent, '🔥', 1).tags).toEqual([['e', parent.id], ['p', parent.pubkey], ['h', 'g']]);
    expect(reactionTemplate('g', parent, '', 1).content).toBe('+');
    expect(deletionTemplate('g', 'r', 7, 1)).toMatchObject({ kind: 5, content: 'remove reaction', tags: [['e', 'r'], ['k', '7'], ['h', 'g']] });
    expect(deletionTemplate('g', 'm', 9, 1)).toMatchObject({ content: 'remove message', tags: [['e', 'm'], ['k', '9'], ['h', 'g']] });
    expect(joinTemplate('g', 1)).toEqual({ kind: 9021, content: '', tags: [['h', 'g']], created_at: 1 });
  });
});

describe('publishToGroup', () => {
  const sk = generateSecretKey();
  const sign = async (t: EventTemplate) => finalizeEvent(t, sk);
  const tpl = messageTemplate('g', 'hello', null);

  it('retries once with auth-first after a restricted rejection', async () => {
    const publish = vi.fn()
      .mockResolvedValueOnce([{ url: 'r', status: 'rejected', reason: 'restricted: auth first' }])
      .mockResolvedValueOnce([{ url: 'r', status: 'ok', reason: null }]);
    const out = await publishToGroup({ publish } as never, sign, tpl);
    expect(out.ok).toBe(true);
    expect(publish.mock.calls[1][0].authMode).toBe('auth-first');
  });
  it('flags a membership refusal', async () => {
    const publish = vi.fn().mockResolvedValue([{ url: 'r', status: 'rejected', reason: 'restricted: not a member of this group' }]);
    const out = await publishToGroup({ publish } as never, sign, tpl);
    expect(out).toMatchObject({ ok: false, needsJoin: true });
  });
  it('treats "already a member" as success for a join', async () => {
    const publish = vi.fn().mockResolvedValue([{ url: 'r', status: 'rejected', reason: 'duplicate: already a member' }]);
    expect((await publishToGroup({ publish } as never, sign, joinTemplate('g'))).ok).toBe(true);
  });
});
