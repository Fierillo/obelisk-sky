import { afterEach, describe, expect, it, vi } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey, type EventTemplate } from 'nostr-tools';

const payer = { kind: 'nwc' as const, pay: vi.fn(async () => ({ preimage: 'p' })) };
vi.mock('./wallet', () => ({ payerFor: vi.fn(async () => payer) }));

import { sendZap, ZapPaymentUnconfirmed, type ZapDraft } from './zap';
import { NwcError } from '@nostr-wot/wallet/nwc';

const sk = generateSecretKey();
const ME = getPublicKey(sk);
const ANA = 'ab'.repeat(32);

function draft(over: Partial<ZapDraft> = {}): ZapDraft {
  return {
    account: ME, loginMethod: 'nsec', sign: vi.fn(async (t: EventTemplate) => finalizeEvent(t, sk)),
    recipient: ANA, lud16: 'ana@pay.example', groupId: 'g', messageId: 'm1', sats: 21, comment: 'gracias',
    relay: 'wss://public.obelisk.ar', isCurrent: () => true, ...over,
  };
}

// Only the network and the wallet are fake: the SDK builds and signs the real zap request.
function lnurl() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname === '/.well-known/lnurlp/ana') return Response.json({ callback: 'https://pay.example/cb', allowsNostr: true, nostrPubkey: 'cd'.repeat(32), minSendable: 1000, maxSendable: 1e9 });
    const zap = JSON.parse(url.searchParams.get('nostr')!);
    expect(zap.kind).toBe(9734);
    expect(zap.tags).toContainEqual(['p', ANA]);
    return Response.json({ pr: 'lnbc-test-invoice' });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => { vi.unstubAllGlobals(); payer.pay.mockReset(); payer.pay.mockImplementation(async () => ({ preimage: 'p' })); });

describe('sendZap', () => {
  it('asks once for the invoice, pays it once, then posts dex’s marker', async () => {
    const fetchMock = lnurl();
    const publish = vi.fn(async () => ({ ok: true }));
    await expect(sendZap(draft(), publish)).resolves.toEqual({ markerError: null });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(payer.pay).toHaveBeenCalledExactlyOnceWith('lnbc-test-invoice');
    expect(publish).toHaveBeenCalledTimes(1);
    const marker = (publish.mock.calls[0] as unknown as [EventTemplate])[0];
    expect(marker.kind).toBe(7);
    expect(marker.tags).toEqual(expect.arrayContaining([['e', 'm1'], ['p', ANA], ['h', 'g'], ['amount', '21000', 'msat'], ['bolt11', 'lnbc-test-invoice']]));
  });

  it('posts no marker if the account changed while the wallet paid', async () => {
    lnurl();
    let current = true;
    payer.pay.mockImplementation(async () => { current = false; return { preimage: 'p' }; });
    const publish = vi.fn(async () => ({ ok: true }));
    await expect(sendZap(draft({ isCurrent: () => current }), publish)).resolves.toEqual({ markerError: 'not-logged-in' });
    expect(payer.pay).toHaveBeenCalledTimes(1);
    expect(publish).not.toHaveBeenCalled();
  });

  it('a refused marker is reported, never a failure (the money moved)', async () => {
    lnurl();
    await expect(sendZap(draft(), async () => ({ ok: false, reason: 'restricted: not a member' }))).resolves.toEqual({ markerError: 'restricted: not a member' });
  });

  it('a wallet that went quiet after the request is “may have paid”, not a failure to retry', async () => {
    lnurl();
    payer.pay.mockRejectedValueOnce(new NwcError('wallet-timeout', 'unknown'));
    await expect(sendZap(draft(), async () => ({ ok: true }))).rejects.toBeInstanceOf(ZapPaymentUnconfirmed);
  });

  it('a wallet that refused moved nothing: the error is the wallet’s own', async () => {
    lnurl();
    payer.pay.mockRejectedValueOnce(new Error('insufficient balance'));
    await expect(sendZap(draft(), async () => ({ ok: true }))).rejects.toThrow('insufficient balance');
  });
});
