// A remote signer (NIP-46 bunker) that sky owns, the way obelisk-dex's bridge
// does (services/nostr-bridge/session/bunker*.ts):
//
// - The login widget pairs with the signer app and hands over its own
//   signer, but closes it when its modal unmounts, which sky does right after
//   a login. So sky builds its own BunkerSigner on the same authorised client
//   key and never calls connect() again: the pairing is done, and a second
//   connect (with the empty secret of a QR pairing) is refused ("no secret").
// - On a reload the stored pointer is rebuilt; connect() only when the
//   pointer carries a secret, then the account is checked once.
// - Every request has a deadline, so a lost answer fails instead of hanging
//   (a relay AUTH that never resolves locks the relay out until a reload).
// - Requests queue: the user's own (relay AUTH, posts) go first; background
//   ones (unwrapping DMs, read-state) one at a time behind them, so a signer
//   app isn't flooded at login and AUTH isn't buried.
// - A signer found closed is rebuilt once and the request retried.

import { BunkerSigner, parseBunkerInput, type BunkerPointer } from 'nostr-tools/nip46';
import { hexToBytes } from 'nostr-tools/utils';
import type { EventTemplate, VerifiedEvent } from 'nostr-tools';
import type { NostrSigner } from '@nostr-wot/signers';

/** obelisk-dex's BUNKER_AUTH_SIGNATURE_TIMEOUT_MS: an approval in the app may take a while. */
export const SIGN_DEADLINE_MS = 45_000;
export const BACKGROUND_DEADLINE_MS = 30_000;
export const CONNECT_DEADLINE_MS = 30_000;
/** At most this many requests out to the signer at once; background ones one at a time. */
export const MAX_IN_FLIGHT = 4;

export type Lane = 'interactive' | 'background';

export function withDeadline<T>(p: Promise<T>, ms: number, what = 'Remote signer timed out'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(what)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

/** Two lanes, interactive first; background work never more than one at a time. */
export class SignerQueue {
  private waiting: Record<Lane, (() => void)[]> = { interactive: [], background: [] };
  private running = 0;
  private bgRunning = 0;

  constructor(private max = MAX_IN_FLIGHT) {}

  run<T>(lane: Lane, op: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.waiting[lane].push(() => {
        this.running++;
        if (lane === 'background') this.bgRunning++;
        op().then(resolve, reject).finally(() => {
          this.running--;
          if (lane === 'background') this.bgRunning--;
          this.pump();
        });
      });
      this.pump();
    });
  }

  private pump(): void {
    while (this.running < this.max) {
      const next = this.waiting.interactive.shift() ?? (this.bgRunning < 1 ? this.waiting.background.shift() : undefined);
      if (!next) return;
      next();
    }
  }
}

type Inner = Pick<BunkerSigner, 'signEvent' | 'nip04Encrypt' | 'nip04Decrypt' | 'nip44Encrypt' | 'nip44Decrypt' | 'getPublicKey' | 'connect' | 'close'>;

/** Open the signer app's approval page (some signers ask for one). */
const openAuth = (url: string) => { try { window.open(url, '_blank', 'width=600,height=700'); } catch { /* blocked */ } };

export class RemoteSigner implements NostrSigner {
  private inner: Inner;
  private queue = new SignerQueue();
  private closed = false;

  constructor(
    private secret: Uint8Array, private bp: BunkerPointer, readonly pubkey: string,
    private make: (secret: Uint8Array, bp: BunkerPointer) => Inner = (s, b) => BunkerSigner.fromBunker(s, b, { onauth: openAuth }),
  ) {
    this.inner = make(secret, bp);
  }

  /** Right after the login widget paired: same client key, no second connect. */
  static async fromPairing(bunkerUri: string, clientSecretHex: string, pubkey: string, make?: RemoteSigner['make']): Promise<RemoteSigner> {
    const bp = await parseBunkerInput(bunkerUri);
    if (!bp) throw new Error('Invalid bunker URI');
    return new RemoteSigner(hexToBytes(clientSecretHex), bp, pubkey, make);
  }

  /** A reload: rebuild from the stored pointer and check it's still this account. */
  static async restore(bunkerUri: string, clientSecretHex: string, pubkey: string, make?: RemoteSigner['make']): Promise<RemoteSigner> {
    const s = await RemoteSigner.fromPairing(bunkerUri, clientSecretHex, pubkey, make);
    try {
      if (s.bp.secret) await withDeadline(s.inner.connect(), CONNECT_DEADLINE_MS);
      const pk = await withDeadline(s.inner.getPublicKey(), CONNECT_DEADLINE_MS);
      if (pk !== pubkey) throw new Error('The remote signer answered for a different account');
    } catch (e) {
      s.close();
      throw e;
    }
    return s;
  }

  async getPublicKey(): Promise<string> {
    return this.pubkey;
  }

  signEvent(t: EventTemplate): Promise<VerifiedEvent> {
    return this.run('interactive', SIGN_DEADLINE_MS, (s) => s.signEvent(t));
  }
  nip04Encrypt(pk: string, pt: string): Promise<string> {
    return this.run('interactive', SIGN_DEADLINE_MS, (s) => s.nip04Encrypt(pk, pt));
  }
  nip04Decrypt(pk: string, ct: string): Promise<string> {
    return this.run('background', BACKGROUND_DEADLINE_MS, (s) => s.nip04Decrypt(pk, ct));
  }
  nip44Encrypt(pk: string, pt: string): Promise<string> {
    return this.run('interactive', SIGN_DEADLINE_MS, (s) => s.nip44Encrypt(pk, pt));
  }
  nip44Decrypt(pk: string, ct: string): Promise<string> {
    return this.run('background', BACKGROUND_DEADLINE_MS, (s) => s.nip44Decrypt(pk, ct));
  }

  async close(): Promise<void> {
    this.closed = true;
    await this.inner.close().catch(() => {});
  }

  private run<T>(lane: Lane, ms: number, op: (s: Inner) => Promise<T>): Promise<T> {
    if (this.closed) return Promise.reject(new Error('Logged out'));
    return this.queue.run(lane, async () => {
      try {
        return await withDeadline(op(this.inner), ms);
      } catch (e) {
        // Closed under us (a modal, a lost socket): build it again once.
        if (this.closed || !/not open anymore/i.test(String((e as Error)?.message ?? e))) throw e;
        this.inner = this.make(this.secret, this.bp);
        return withDeadline(op(this.inner), ms);
      }
    });
  }
}
