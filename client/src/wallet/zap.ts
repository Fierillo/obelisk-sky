// Sending a zap from a channel, as obelisk-dex does (services/wallet/send-zap.ts):
// ask the recipient's Lightning address for an invoice with a signed NIP-57
// zap request, pay it with the account's wallet (./wallet.ts), then post the
// channel's marker: a kind 7 "⚡" carrying the invoice, so everyone there (in
// Obelisk and in the village, nostr/state.ts parseZapMarker) sees the zap.
// Once the money has moved nothing reports a failure: a retry would pay twice.
// If the account changed while the wallet paid, the marker is not posted
// (the new account would sign it and be credited), as dex does.

import { requestZapInvoice } from '@nostr-wot/wallet';
import { getDefaultRelays } from '@nostr-wot/data';
import type { EventTemplate, VerifiedEvent } from 'nostr-tools';
import { mayHavePaid } from '@nostr-wot/wallet/nwc';
import { isImportableRelayUrl } from '@/services/nostr-bridge/relay/relay-list';
import { payerFor } from './wallet';

export interface ZapDraft {
  account: string;
  loginMethod: string;
  sign: (t: EventTemplate) => Promise<VerifiedEvent>;
  recipient: string;
  lud16: string | null;
  groupId: string;
  messageId: string | null;
  sats: number;
  comment: string;
  relay: string;
  /** Still the account (and relay) the zap started with. */
  isCurrent: () => boolean;
}

export type ZapProblem = 'noAddress' | 'noWallet' | 'invalidAmount';

export const ZAP_QUICK_AMOUNTS_SATS: readonly number[] = [21, 100, 500, 1000, 5000, 21000];
export const DEFAULT_ZAP_AMOUNT_SATS = 100;

/** The first reason a zap can't start, before anything leaves the browser. */
export function checkZap(d: Pick<ZapDraft, 'lud16' | 'sats'>, walletKind: string | null): ZapProblem | null {
  if (!d.lud16) return 'noAddress';
  if (!walletKind) return 'noWallet';
  if (!Number.isInteger(d.sats) || d.sats <= 0) return 'invalidAmount';
  return null;
}

/** The channel's marker for a paid zap (dex's postZapMarker). */
export function zapMarkerTemplate(d: Pick<ZapDraft, 'recipient' | 'groupId' | 'messageId'>, paid: { invoice: string; zapRequest: unknown; amountMsats: number }, at = Math.floor(Date.now() / 1000)): EventTemplate {
  return {
    kind: 7,
    content: '⚡',
    created_at: at,
    tags: [
      ...(d.messageId ? [['e', d.messageId]] : []),
      ['p', d.recipient],
      ['h', d.groupId],
      ['amount', String(paid.amountMsats), 'msat'],
      ['bolt11', paid.invoice],
      ['description', JSON.stringify(paid.zapRequest)],
    ],
  };
}

export class ZapPaymentUnconfirmed extends Error {}

/**
 * Pay and announce. Throws only while no money has moved, or a
 * `ZapPaymentUnconfirmed` when the wallet went quiet after the request (it
 * may have paid: the UI must not offer a retry). Resolves with the marker's
 * error, if only that failed.
 */
export async function sendZap(d: ZapDraft, publish: (t: EventTemplate) => Promise<{ ok: boolean; reason?: string }>): Promise<{ markerError: string | null }> {
  const step = zapTrace();
  const payer = await step('wallet-connect', () => payerFor(d.account, d.loginMethod));
  if (!payer) throw new Error('noWallet');
  const amountMsats = d.sats * 1000;
  const relays = [...new Set([d.relay, ...getDefaultRelays()])].filter(isImportableRelayUrl);
  const { invoice, zapRequest } = await step('invoice', () => requestZapInvoice({
    getPublicKey: async () => d.account,
    signEvent: (t: EventTemplate) => step('sign-zap', async () => {
      if (!d.isCurrent()) throw new Error('not-logged-in');
      return d.sign(t);
    }),
  } as never, {
    recipientPubkey: d.recipient,
    lud16: d.lud16!,
    eventId: d.messageId ?? undefined,
    amountMsats,
    relays,
    comment: d.comment.trim() || undefined,
  }));
  try {
    await step(`payment-${payer.kind}`, () => payer.pay(invoice));
  } catch (e) {
    if (mayHavePaid(e)) throw new ZapPaymentUnconfirmed(e instanceof Error ? e.message : String(e));
    throw e;
  }
  if (!d.isCurrent()) return { markerError: 'not-logged-in' };
  try {
    const out = await step('channel-marker', () => publish(zapMarkerTemplate(d, { invoice, zapRequest, amountMsats })));
    return { markerError: out.ok ? null : out.reason ?? 'refused' };
  } catch (e) {
    return { markerError: e instanceof Error ? e.message : String(e) };
  }
}

/** dex's per-attempt stage log (send-zap.ts), in development only: stage and
 *  status, never the invoice, events, keys, comment or a provider's error text. */
function zapTrace(): <T>(stage: string, action: () => Promise<T>) => Promise<T> {
  const attempt = crypto.randomUUID();
  const trace = (stage: string, status: string, code: string | null = null) => {
    if (import.meta.env?.DEV) console.info('[zap]', { attempt, stage, status, code });
  };
  return async (stage, action) => {
    trace(stage, 'start');
    try {
      const out = await action();
      trace(stage, 'complete');
      return out;
    } catch (e) {
      trace(stage, 'failed', e instanceof Error && 'code' in e && typeof e.code === 'string' ? e.code : null);
      throw e;
    }
  };
}
