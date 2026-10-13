// The Lightning wallet zaps pay with, as obelisk-dex has it
// (services/wallet/wallet.ts, nwc-wallet.ts):
//
// 1. a Nostr Wallet Connect (NIP-47) wallet the account connected here: the
//    URI is checked (it answers and may pay), sealed in the session vault
//    (dex's nwc-storage) and talks over the page hub (dex's nwc-transport);
// 2. only for an extension (NIP-07) login, the WebLN provider on window.webln;
// 3. otherwise none.
//
// A connected wallet wins: connecting one is an explicit choice. A wallet
// belongs to the account that connected it; logging out forgets it (memory,
// sealed record and key), like dex's reset hook.

import { NwcClient, NwcError, canPay, parseNwcUri, type NwcConnection } from '@nostr-wot/wallet/nwc';
import { isWebLNAvailable } from '@nostr-wot/wallet';
import { createHubNwcTransport, type HubNwcTransport } from '@/services/wallet/nwc-transport';
import { deleteNwcWallet, destroyNwcVaultKey, forgetNwcRecords, hasNwcRecord, openNwcWallet, sealNwcWallet } from '@/services/wallet/nwc-storage';
import { pageHub } from '../nostr/hub';

export type WalletKind = 'nwc' | 'webln';
export interface WalletView { kind: 'nwc'; alias: string | null; relay: string; lud16: string | null }
export interface Payer { kind: WalletKind; pay(invoice: string): Promise<{ preimage: string | null }> }

interface Active { account: string; connection: NwcConnection; alias: string | null; transport: HubNwcTransport | null; client: NwcClient | null }

let active: Active | null = null;
let loading: { account: string; promise: Promise<void> } | null = null;
let generation = 0;
const listeners = new Set<() => void>();
const changed = () => { for (const l of listeners) l(); };

export function onWalletChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function clientOf(w: Active): NwcClient {
  if (!w.client) {
    w.transport = createHubNwcTransport(pageHub(), w.connection);
    w.client = new NwcClient(w.connection, w.transport);
  }
  return w.client;
}

function drop(): void {
  active?.transport?.destroy();
  active = null;
  loading = null;
  generation++;
}

/** The account's connected wallet, as the UI shows it (never the secret). */
export function walletView(account: string | null): WalletView | null {
  if (!account || active?.account !== account) return null;
  return { kind: 'nwc', alias: active.alias, relay: active.connection.relays[0] ?? '', lud16: active.connection.lud16 ?? null };
}

/** Load `account`'s sealed wallet, if it has one. Idempotent per account. */
export function loadWallet(account: string): Promise<void> {
  if (active?.account === account) return Promise.resolve();
  if (loading?.account === account) return loading.promise;
  // Only when there's another account's wallet to put down: dropping bumps
  // `generation`, which would fail a connect already under way.
  if (active || loading) drop();
  forgetNwcRecords(account);
  if (!hasNwcRecord(account)) return Promise.resolve();
  const mine = generation;
  const promise = openNwcWallet(account).then((stored) => {
    if (generation !== mine) return;
    loading = null;
    let connection: NwcConnection | null = null;
    try { connection = stored ? parseNwcUri(stored.uri) : null; } catch { connection = null; }
    if (!stored || !connection) return;
    active = { account, connection, alias: stored.alias, transport: null, client: null };
    changed();
  }).catch(() => { loading = null; });
  loading = { account, promise };
  return promise;
}

/** Check a pasted `nostr+walletconnect://` URI, seal it and make it the account's wallet. */
export async function connectWallet(account: string, uri: string): Promise<WalletView> {
  const connection = parseNwcUri(uri.trim());
  const candidate: Active = { account, connection, alias: null, transport: null, client: null };
  const client = clientOf(candidate);
  const mine = generation;
  try {
    const info = await client.fetchInfo();
    if (!canPay(info)) throw new NwcError('nwc-cannot-pay', 'not-paid');
    candidate.alias = await client.walletAlias().catch(() => null);
    if (generation !== mine) throw new NwcError('wallet-failed', 'not-paid');
    await sealNwcWallet(account, { uri: uri.trim(), alias: candidate.alias });
    if (generation !== mine) {
      // Logged out (or switched) while it was being sealed: it isn't theirs to keep.
      await deleteNwcWallet(account).catch(() => {});
      throw new NwcError('wallet-failed', 'not-paid');
    }
    drop();
    active = candidate;
    changed();
    return walletView(account)!;
  } catch (e) {
    if (active !== candidate) candidate.transport?.destroy();
    throw e;
  }
}

export async function disconnectWallet(): Promise<void> {
  const account = active?.account ?? null;
  drop();
  changed();
  if (account) await deleteNwcWallet(account);
}

/** Logged out: the wallet goes with the account. */
export function forgetWallet(): void {
  drop();
  changed();
  forgetNwcRecords(null);
  void destroyNwcVaultKey().catch(() => {});
}

/** Which wallet would pay for this login right now, without asking it. */
export function walletKindFor(account: string | null, loginMethod: string | null): WalletKind | null {
  if (!account) return null;
  if (active?.account === account || hasNwcRecord(account)) return 'nwc';
  return loginMethod === 'nip07' && isWebLNAvailable() ? 'webln' : null;
}

type WebLN = { enable(): Promise<void>; sendPayment(invoice: string): Promise<{ preimage?: string } | undefined> };

/** The payer for this login: its connected wallet, else WebLN for an extension login, else null. */
export async function payerFor(account: string, loginMethod: string): Promise<Payer | null> {
  await loadWallet(account);
  const w = active;
  if (w && w.account === account) {
    const mine = generation;
    return {
      kind: 'nwc',
      pay: async (invoice) => {
        if (active !== w || generation !== mine) throw new NwcError('wallet-failed', 'not-paid');
        const { preimage } = await clientOf(w).payInvoice(invoice);
        return { preimage: preimage ?? null };
      },
    };
  }
  if (loginMethod !== 'nip07') return null;
  const webln = (window as unknown as { webln?: WebLN }).webln;
  if (!webln) return null;
  await webln.enable();
  return {
    kind: 'webln',
    pay: async (invoice) => {
      // The extension was swapped out under us: don't pay through a provider nobody chose.
      if ((window as unknown as { webln?: WebLN }).webln !== webln) throw new Error('wallet-failed');
      return { preimage: (await webln.sendPayment(invoice))?.preimage || null };
    },
  };
}
