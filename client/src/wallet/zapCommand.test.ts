import { describe, it, expect } from 'vitest';
import { nip19 } from 'nostr-tools';
import { isZapCommand, parseZapCommand, type ZapContext } from './zapCommand';
import { checkZap, zapMarkerTemplate } from './zap';
import { parseZapMarker } from '../nostr/state';

const ME = 'a'.repeat(64), ANA = 'b'.repeat(64), BOB = 'c'.repeat(64), ANA2 = 'd'.repeat(64);
const ctx = (over: Partial<ZapContext> = {}): ZapContext => ({
  messages: [{ id: 'm1', pubkey: ANA }, { id: 'm2', pubkey: BOB }, { id: 'm3', pubkey: ME }],
  me: ME, replyingTo: null,
  people: [{ pubkey: ANA, names: ['Ana'] }, { pubkey: BOB, names: ['Bob'] }],
  ...over,
});

describe('/zap', () => {
  it('is only the command', () => {
    expect(isZapCommand('/zap')).toBe(true);
    expect(isZapCommand('/zap @ana 21')).toBe(true);
    expect(isZapCommand('/zapper')).toBe(false);
  });
  it('zaps the last other speaker, or whoever is being answered', () => {
    expect(parseZapCommand('/zap', ctx())).toEqual({ ok: true, target: { recipient: BOB, messageId: 'm2', sats: null } });
    expect(parseZapCommand('/zap 500', ctx({ replyingTo: { id: 'm1', pubkey: ANA } }))).toEqual({ ok: true, target: { recipient: ANA, messageId: 'm1', sats: 500 } });
  });
  it('by npub or by a name that fits one person', () => {
    expect(parseZapCommand(`/zap nostr:${nip19.npubEncode(ANA)} 21`, ctx())).toMatchObject({ ok: true, target: { recipient: ANA, sats: 21, messageId: 'm1' } });
    expect(parseZapCommand('/zap @bob', ctx())).toMatchObject({ ok: true, target: { recipient: BOB } });
    expect(parseZapCommand('/zap @ana', ctx({ people: [{ pubkey: ANA, names: ['Ana'] }, { pubkey: ANA2, names: ['Ana'] }] }))).toEqual({ ok: false, error: 'ambiguous', token: '@ana' });
    expect(parseZapCommand('/zap @zed', ctx())).toEqual({ ok: false, error: 'unknown-user', token: '@zed' });
  });
  it('never zaps yourself, and needs someone', () => {
    expect(parseZapCommand(`/zap ${ME}`, ctx())).toEqual({ ok: false, error: 'self' });
    expect(parseZapCommand('/zap', ctx({ messages: [{ id: 'x', pubkey: ME }] }))).toEqual({ ok: false, error: 'no-target' });
  });
});

describe('a zap', () => {
  it('needs an address, a wallet and an amount, in that order', () => {
    expect(checkZap({ lud16: null, sats: 21 }, 'nwc')).toBe('noAddress');
    expect(checkZap({ lud16: 'ana@x.com', sats: 21 }, null)).toBe('noWallet');
    expect(checkZap({ lud16: 'ana@x.com', sats: 0 }, 'webln')).toBe('invalidAmount');
    expect(checkZap({ lud16: 'ana@x.com', sats: 21 }, 'nwc')).toBeNull();
  });
  it('is announced with the marker Obelisk and the village both read', () => {
    const t = zapMarkerTemplate({ recipient: ANA, groupId: 'g', messageId: 'm1' }, { invoice: 'lnbc210n1x', zapRequest: { kind: 9734 }, amountMsats: 21000 });
    expect(t.kind).toBe(7);
    expect(t.content).toBe('⚡');
    expect(t.tags).toContainEqual(['h', 'g']);
    expect(parseZapMarker(t.tags, t.content)).toEqual({ target: ANA, targetId: 'm1', sats: 21, bolt11: 'lnbc210n1x' });
  });
});
