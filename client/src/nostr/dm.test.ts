import { describe, it, expect } from 'vitest';
import { generateSecretKey, getPublicKey, finalizeEvent, type Event as NostrEvent } from 'nostr-tools';
import { PrivateKeySigner } from '@nostr-wot/signers';
import { sealAndGiftWrap } from '@nostr-wot/dm';
import { encodeDmCallMessage } from '@/services/call/protocol';
import { DmStore, inboxRelaysOf, KIND_DM_CALL } from './dm';

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

/** A hub that records publishes and answers queries with nothing. */
function fakeHub() {
  const published: { relays: string[]; event: NostrEvent }[] = [];
  return {
    published,
    hub: {
      query: async () => ({ events: [] }),
      publish: async (spec: { relays: string[]; event: NostrEvent }) => { published.push(spec); return spec.relays.map(() => ({ status: 'ok' })); },
      subscribe: () => ({ release() {} }),
    } as never,
  };
}

describe('inbox relays', () => {
  const sk = generateSecretKey(), pk = getPublicKey(sk);
  it('prefers kind 10050, then 10002 read relays', () => {
    const k10050 = finalizeEvent({ kind: 10050, created_at: 1, tags: [['relay', 'wss://inbox.example']], content: '' }, sk);
    const k10002 = finalizeEvent({ kind: 10002, created_at: 1, tags: [['r', 'wss://read.example', 'read'], ['r', 'wss://write.example', 'write'], ['r', 'wss://both.example']], content: '' }, sk);
    expect(inboxRelaysOf([k10050, k10002], pk)).toEqual(['wss://inbox.example']);
    expect(inboxRelaysOf([k10002], pk)).toEqual(['wss://read.example', 'wss://both.example']);
    expect(inboxRelaysOf([], pk)).toEqual([]);
  });
});

describe('private messages', () => {
  const aliceSk = generateSecretKey(), bobSk = generateSecretKey();
  const alice = getPublicKey(aliceSk), bob = getPublicKey(bobSk);
  const aliceSigner = new PrivateKeySigner(hex(aliceSk)), bobSigner = new PrivateKeySigner(hex(bobSk));

  it('sends a NIP-17 gift wrap the other side opens, plus a copy for ourselves', async () => {
    const a = fakeHub();
    const store = new DmStore(a.hub, alice, aliceSigner);
    expect(await store.send(bob, 'hola che')).toBeNull();
    expect(store.thread(bob).map((m) => m.text)).toEqual(['hola che']);
    const wraps = a.published.map((p) => p.event);
    expect(wraps.every((w) => w.kind === 1059 && w.pubkey !== alice)).toBe(true); // signed by throwaway keys
    // Bob reads the one addressed to him.
    const b = fakeHub();
    const bobStore = new DmStore(b.hub, bob, bobSigner);
    let got = '';
    bobStore.onMessage((peer, m) => { if (peer === alice) got = m.text; });
    for (const w of wraps) await bobStore.ingest(w);
    expect(got).toBe('hola che');
    expect(bobStore.thread(alice)[0].id).toBe(store.thread(bob)[0].id); // same rumor id on both sides
  });

  it('routes call control messages apart from chat, and drops stale ones', async () => {
    const b = fakeHub();
    const bobStore = new DmStore(b.hub, bob, bobSigner);
    const calls: string[] = [];
    bobStore.onCall((m) => calls.push(m.type));
    const now = Math.floor(Date.now() / 1000);
    const rumor = (at: number) => ({ pubkey: alice, kind: KIND_DM_CALL, created_at: at, tags: [['p', bob]], content: encodeDmCallMessage({ type: 'cancel', callId: 'a'.repeat(64) }) });
    await bobStore.ingest(await sealAndGiftWrap(aliceSigner, bob, rumor(now)));
    await bobStore.ingest(await sealAndGiftWrap(aliceSigner, bob, rumor(now - 3600)));
    expect(calls).toEqual(['cancel']);
    expect(bobStore.thread(alice)).toEqual([]);
  });

  it('wraps call messages to the peer, with an expiration', async () => {
    const a = fakeHub();
    await new DmStore(a.hub, alice, aliceSigner).sendCall(bob, { type: 'decline', callId: 'b'.repeat(64) }, true);
    expect(a.published).toHaveLength(2); // to them, and a notice to our other devices
    expect(a.published[0].event.tags.find((t) => t[0] === 'expiration')).toBeTruthy();
  });
});
