import { describe, it, expect, vi } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey, type EventTemplate } from 'nostr-tools';
import { createVoiceBridge } from './bridge';

const sk = generateSecretKey();
const R = 'wss://public.obelisk.ar';

function fakeHub(results: { status: string; reason: string | null }[][]) {
  const publish = vi.fn(async () => results.shift()!.map((r) => ({ url: R, ...r })));
  const leases: string[] = [];
  const subs: unknown[] = [];
  return {
    hub: {
      publish,
      acquireAuthLease: vi.fn((url: string, why: string) => { leases.push(`${url}:${why}`); return { release: () => leases.splice(leases.indexOf(`${url}:${why}`), 1) }; }),
      subscribe: vi.fn((spec: unknown) => { subs.push(spec); return { release: vi.fn(), keys: [], shared: false, setPriority: vi.fn() }; }),
      status: vi.fn(() => ({ auth: 'authenticated' })),
      onStatus: vi.fn(() => () => {}),
    },
    leases, subs, publish,
  };
}

const host = (hub: unknown) => ({ hub: hub as never, relay: () => R, pubkey: () => getPublicKey(sk), sign: async (t: EventTemplate) => finalizeEvent(t, sk) });

describe('voice bridge shim', () => {
  it('signs and publishes to the call relay, retrying auth-first on restricted', async () => {
    const f = fakeHub([[{ status: 'rejected', reason: 'restricted: auth first' }], [{ status: 'ok', reason: null }]]);
    const b = createVoiceBridge(host(f.hub));
    const ev = await b.publishEvent({ kind: 20078, content: '', tags: [['e', 'ch']] }, { authRetryOnRestricted: true });
    expect(ev.pubkey).toBe(getPublicKey(sk));
    expect(f.publish).toHaveBeenCalledTimes(2);
    expect((f.publish.mock.calls[1] as unknown as [{ authMode: string }])[0].authMode).toBe('auth-first');
  });
  it('throws when every relay rejects', async () => {
    const f = fakeHub([[{ status: 'rejected', reason: 'blocked: no' }]]);
    await expect(createVoiceBridge(host(f.hub)).publishEvent({ kind: 25050, content: '{}', tags: [] })).rejects.toThrow(/rejected/);
  });
  it('voice subscriptions hold a voice AUTH lease until released', () => {
    const f = fakeHub([]);
    const b = createVoiceBridge(host(f.hub));
    const off = b.subscribeVoiceFilterWatched({ kinds: [25050], '#p': ['x'] }, () => {}, { watchdogMs: 2500, answerAuth: true });
    expect(f.leases).toEqual([`${R}:voice`]);
    expect((f.subs[0] as { priority: string }).priority).toBe('voice');
    off();
    expect(f.leases).toEqual([]);
  });
  it('passes quota closes back to the voice code', () => {
    const f = fakeHub([]);
    const onQuota = vi.fn();
    createVoiceBridge(host(f.hub)).subscribeFilterWatched({ kinds: [20078] }, () => {}, { onQuotaOrRateLimitClose: onQuota });
    (f.subs[0] as { onRelayClosed: (r: string, reason: string) => void }).onRelayClosed(R, 'rate-limited: slow down');
    expect(onQuota).toHaveBeenCalled();
  });
});
