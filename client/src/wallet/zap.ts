// Sending a zap from a channel, as obelisk-dex does (services/wallet/send-zap.ts):
// ask the recipient's Lightning address for an invoice with a signed NIP-57
// zap request, pay it with the account's wallet (./wallet.ts), then post the
// channel's marker: a kind 7 "⚡" carrying the invoice, so everyone there (in
// Obelisk and in the village, nostr/state.ts parseZapMarker) sees the zap.
// Once the money has moved nothing reports a failure: a retry would pay twice.

import { requestZapInvoice } from '@nostr-wot/wallet';
import { getDefaultRelays } from '@nostr-wot/data';
import type { EventTemplate, VerifiedEvent } from 'nostr-tools';
import { mayHavePaid } from '@nostr-wot/wallet/nwc';
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
  const payer = await payerFor(d.account, d.loginMethod);
  if (!payer) throw new Error('noWallet');
  const amountMsats = d.sats * 1000;
  const relays = [...new Set([d.relay, ...getDefaultRelays()])].filter((r) => /^wss:\/\//.test(r));
  const { invoice, zapRequest } = await requestZapInvoice({
    getPublicKey: async () => d.account,
    signEvent: (t: EventTemplate) => d.sign(t),
  } as never, {
    recipientPubkey: d.recipient,
    lud16: d.lud16!,
    eventId: d.messageId ?? undefined,
    amountMsats,
    relays,
    comment: d.comment.trim() || undefined,
  });
  try {
    await payer.pay(invoice);
  } catch (e) {
    if (mayHavePaid(e)) throw new ZapPaymentUnconfirmed(e instanceof Error ? e.message : String(e));
    throw e;
  }
  try {
    const out = await publish(zapMarkerTemplate(d, { invoice, zapRequest, amountMsats }));
    return { markerError: out.ok ? null : out.reason ?? 'refused' };
  } catch (e) {
    return { markerError: e instanceof Error ? e.message : String(e) };
  }
}
