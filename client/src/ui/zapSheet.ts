// The zap sheet: who, how much, a note, which wallet pays, and Zap. With no
// wallet yet it offers to connect one (a Nostr Wallet Connect link) right
// there, like obelisk-dex's zap modal and wallet settings. What paying does
// is wallet/zap.ts; which wallet is wallet/wallet.ts.

import { DEFAULT_ZAP_AMOUNT_SATS, ZAP_QUICK_AMOUNTS_SATS, checkZap, type ZapProblem } from '../wallet/zap';
import type { WalletKind, WalletView } from '../wallet/wallet';

export interface ZapSheetDeps {
  name(pk: string): string;
  lud16(pk: string): string | null;
  walletKind(): WalletKind | null;
  walletView(): WalletView | null;
  connect(uri: string): Promise<void>;
  /** Pay and announce; resolves with the marker's error, if only that failed. Throws `unconfirmed` errors as such. */
  send(sats: number, comment: string): Promise<{ markerError: string | null }>;
  isUnconfirmed(e: unknown): boolean;
  toast(text: string): void;
}

const PROBLEM: Record<ZapProblem, string> = {
  noAddress: 'They have no Lightning address on their profile, so they can’t be zapped yet.',
  noWallet: 'Connect a wallet first.',
  invalidAmount: 'Pick an amount in sats.',
};

export function openZapSheet(parent: HTMLElement, recipient: string, preset: number | null, deps: ZapSheetDeps): void {
  parent.querySelector('.zap-sheet')?.remove();
  const el = div('themes zap-sheet');
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Send a zap');
  const name = deps.name(recipient);
  const lud16 = deps.lud16(recipient);
  const head = div('themes-head');
  head.append(div('themes-title', `⚡ Zap ${name}`), div('themes-sub', lud16 ?? 'No Lightning address on their profile'));
  const body = div('themes-body');

  // Amount: a field and one-tap amounts.
  const amount = document.createElement('input');
  amount.type = 'number';
  amount.min = '1';
  amount.inputMode = 'numeric';
  amount.className = 'themes-select zap-amount';
  amount.value = String(preset ?? DEFAULT_ZAP_AMOUNT_SATS);
  const quick = div('zap-quick');
  for (const n of ZAP_QUICK_AMOUNTS_SATS) {
    const b = button('creator-chip', n >= 1000 ? `${n / 1000}k` : String(n));
    b.addEventListener('click', () => { amount.value = String(n); paint(); });
    quick.append(b);
  }
  const amountRow = div('themes-row');
  amountRow.append(span('Amount (sats)'), amount);
  const comment = document.createElement('input');
  comment.type = 'text';
  comment.maxLength = 200;
  comment.placeholder = 'Add a note (optional)';
  comment.className = 'themes-select zap-comment';

  // Which wallet pays, or connecting one.
  const wallet = div('zap-wallet');
  const error = div('zap-error');
  body.append(amountRow, quick, comment, wallet, error);

  const foot = div('themes-foot');
  const status = div('themes-status');
  const cancel = button('account-btn', 'Cancel');
  const zap = button('account-btn primary', '⚡ Zap');
  foot.append(status, cancel, zap);
  el.append(head, body, foot);
  parent.append(el);

  let busy = false;
  let unconfirmed = false;
  const close = () => { el.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) close(); };
  document.addEventListener('keydown', onKey);
  cancel.addEventListener('click', close);

  function paintWallet(): void {
    wallet.replaceChildren();
    const kind = deps.walletKind();
    if (kind === 'nwc') {
      const v = deps.walletView();
      wallet.append(span(`Pays with your wallet${v?.alias ? ` “${v.alias}”` : ''}.`));
      return;
    }
    if (kind === 'webln') { wallet.append(span('Pays with your browser extension’s wallet.')); return; }
    // No wallet: connect one here.
    wallet.append(div('zap-connect-title', 'Connect a Lightning wallet'),
      div('zap-hint', 'Paste a Nostr Wallet Connect link from your wallet (Alby Hub, Primal, Coinos, Mutiny…). It’s kept sealed in this browser and forgotten when you log out.'));
    const uri = document.createElement('input');
    uri.type = 'password';
    uri.autocomplete = 'off';
    uri.placeholder = 'nostr+walletconnect://…';
    uri.className = 'themes-select zap-uri';
    const go = button('account-btn primary', 'Connect');
    go.addEventListener('click', async () => {
      if (!uri.value.trim()) return;
      go.disabled = true;
      error.textContent = '';
      status.textContent = 'Checking your wallet…';
      try {
        await deps.connect(uri.value);
        status.textContent = '';
        paint();
      } catch (e) {
        status.textContent = '';
        error.textContent = `Couldn’t connect: ${e instanceof Error ? e.message : String(e)}`;
        go.disabled = false;
      }
    });
    const r = div('zap-connect');
    r.append(uri, go);
    wallet.append(r);
  }

  function paint(): void {
    paintWallet();
    const problem = checkZap({ lud16, sats: Number(amount.value) }, deps.walletKind());
    zap.disabled = busy || unconfirmed || !!problem;
    zap.textContent = busy ? 'Zapping…' : `⚡ Zap ${Number(amount.value) > 0 ? Number(amount.value).toLocaleString() : ''} sats`;
    if (problem === 'noAddress') error.textContent = PROBLEM.noAddress;
  }
  amount.addEventListener('input', paint);

  zap.addEventListener('click', async () => {
    const sats = Number(amount.value);
    const problem = checkZap({ lud16, sats }, deps.walletKind());
    if (problem) { error.textContent = PROBLEM[problem]; return; }
    busy = true;
    error.textContent = '';
    status.textContent = 'Paying…';
    paint();
    try {
      const { markerError } = await deps.send(sats, comment.value);
      deps.toast(markerError ? `⚡ Sent ${sats.toLocaleString()} sats to ${name} (the channel didn’t take the note: ${markerError})` : `⚡ Sent ${sats.toLocaleString()} sats to ${name}`);
      busy = false;
      close();
    } catch (e) {
      busy = false;
      status.textContent = '';
      if (deps.isUnconfirmed(e)) {
        // It may have paid: no second try from here (a retry would pay twice).
        unconfirmed = true;
        error.textContent = 'Your wallet stopped answering after the payment was sent. Check it before trying again.';
      } else error.textContent = `The zap didn’t go through: ${e instanceof Error ? e.message : String(e)}`;
      paint();
    }
  });
  paint();
  amount.focus();
}

function div(cls: string, text?: string): HTMLDivElement {
  const d = document.createElement('div');
  d.className = cls;
  if (text !== undefined) d.textContent = text;
  return d;
}
function span(text: string): HTMLSpanElement {
  const s = document.createElement('span');
  s.textContent = text;
  return s;
}
function button(cls: string, text: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.textContent = text;
  return b;
}
