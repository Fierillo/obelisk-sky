import { describe, it, expect, vi } from 'vitest';
import { RemoteSigner, SignerQueue, withDeadline } from './remoteSigner';

const PK = 'a'.repeat(64), SIGNER = 'b'.repeat(64), CLIENT = '1'.repeat(64);
const QR_URI = `bunker://${SIGNER}?relay=wss%3A%2F%2Frelay.example`;
const SECRET_URI = `${QR_URI}&secret=s3cret`;

function fake(over: Record<string, unknown> = {}) {
  return {
    connect: vi.fn(async () => {}),
    getPublicKey: vi.fn(async () => PK),
    signEvent: vi.fn(async (t: { kind: number }) => ({ ...t, id: 'x', sig: 'y', pubkey: PK })),
    nip04Encrypt: vi.fn(async () => 'c4'), nip04Decrypt: vi.fn(async () => 'p4'),
    nip44Encrypt: vi.fn(async () => 'c44'), nip44Decrypt: vi.fn(async () => 'p44'),
    close: vi.fn(async () => {}),
    ...over,
  };
}

describe('the remote signer sky owns', () => {
  it('after the widget paired: no second connect, its own signer on the same client key', async () => {
    const inner = fake();
    const make = vi.fn((_secret: Uint8Array, _bp: unknown) => inner as never);
    const s = await RemoteSigner.fromPairing(QR_URI, CLIENT, PK, make);
    expect(make).toHaveBeenCalledTimes(1);
    expect(Buffer.from(make.mock.calls[0][0]).toString('hex')).toBe(CLIENT);
    expect(inner.connect).not.toHaveBeenCalled();
    expect(await s.getPublicKey()).toBe(PK);
    expect((await s.signEvent({ kind: 1, content: '', tags: [], created_at: 1 })).sig).toBe('y');
  });

  it('a reload connects only with a secret, and checks the account', async () => {
    const qr = fake();
    await RemoteSigner.restore(QR_URI, CLIENT, PK, () => qr as never);
    expect(qr.connect).not.toHaveBeenCalled();
    expect(qr.getPublicKey).toHaveBeenCalled();
    const withSecret = fake();
    await RemoteSigner.restore(SECRET_URI, CLIENT, PK, () => withSecret as never);
    expect(withSecret.connect).toHaveBeenCalled();
    const other = fake({ getPublicKey: vi.fn(async () => 'c'.repeat(64)) });
    await expect(RemoteSigner.restore(QR_URI, CLIENT, PK, () => other as never)).rejects.toThrow(/different account/);
    expect(other.close).toHaveBeenCalled();
  });

  it('rebuilds a signer found closed and retries once', async () => {
    const dead = fake({ signEvent: vi.fn(async () => { throw new Error('this signer is not open anymore, create a new one'); }) });
    const alive = fake();
    const make = vi.fn().mockReturnValueOnce(dead).mockReturnValueOnce(alive);
    const s = new RemoteSigner(new Uint8Array(32), { pubkey: SIGNER, relays: [], secret: null }, PK, make as never);
    const ev = await s.signEvent({ kind: 1, content: '', tags: [], created_at: 1 });
    expect(ev.sig).toBe('y');
    expect(make).toHaveBeenCalledTimes(2);
  });

  it('fails a request the signer never answers, instead of hanging', async () => {
    vi.useFakeTimers();
    const p = withDeadline(new Promise(() => {}), 1000);
    vi.advanceTimersByTime(1001);
    await expect(p).rejects.toThrow(/timed out/);
    vi.useRealTimers();
  });

  it('refuses everything once logged out', async () => {
    const s = new RemoteSigner(new Uint8Array(32), { pubkey: SIGNER, relays: [], secret: null }, PK, () => fake() as never);
    await s.close();
    await expect(s.signEvent({ kind: 1, content: '', tags: [], created_at: 1 })).rejects.toThrow(/Logged out/);
  });
});

describe('the signer queue', () => {
  it('puts the user\'s requests before background ones, and runs background one at a time', async () => {
    const q = new SignerQueue(2);
    const order: string[] = [];
    let open = 0, maxBg = 0;
    const gate: (() => void)[] = [];
    const job = (name: string, bg: boolean) => () => new Promise<void>((r) => {
      order.push(name);
      if (bg) { open++; maxBg = Math.max(maxBg, open); }
      gate.push(() => { if (bg) open--; r(); });
    });
    const all = [
      q.run('background', job('b1', true)), q.run('background', job('b2', true)), q.run('background', job('b3', true)),
      q.run('interactive', job('auth', false)),
    ];
    // b1 runs; b2 waits (one background at a time); auth jumps ahead of b2.
    await Promise.resolve();
    expect(order).toEqual(['b1', 'auth']);
    while (gate.length) { gate.shift()!(); await new Promise((r) => setTimeout(r, 0)); }
    await Promise.all(all);
    expect(order).toEqual(['b1', 'auth', 'b2', 'b3']);
    expect(maxBg).toBe(1);
  });
});
