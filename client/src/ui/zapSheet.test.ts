// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { openZapSheet, type ZapSheetDeps } from './zapSheet';

const PK = 'b'.repeat(64);
function open(over: Partial<ZapSheetDeps> = {}, preset: number | null = 21) {
  document.body.innerHTML = '';
  const deps: ZapSheetDeps = {
    name: () => 'Ana', lud16: () => 'ana@getalby.com',
    walletKind: () => 'nwc', walletView: () => ({ kind: 'nwc', alias: 'Alby', relay: 'wss://r', lud16: null }),
    connect: vi.fn(async () => {}), send: vi.fn(async () => ({ markerError: null })),
    isUnconfirmed: (e) => (e as Error).message === 'quiet', toast: vi.fn(),
    ...over,
  };
  openZapSheet(document.body, PK, preset, deps);
  const zap = [...document.querySelectorAll('button')].find((b) => b.textContent?.startsWith('⚡'))!;
  return { deps, zap, sheet: document.querySelector('.zap-sheet')! };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('the zap sheet', () => {
  it('pays the amount with the connected wallet and closes', async () => {
    const { deps, zap, sheet } = open();
    expect(sheet.textContent).toContain('Alby');
    expect(zap.disabled).toBe(false);
    zap.click();
    await flush();
    expect(deps.send).toHaveBeenCalledWith(21, '');
    expect(deps.toast).toHaveBeenCalledWith('⚡ Sent 21 sats to Ana');
    expect(document.querySelector('.zap-sheet')).toBeNull();
  });
  it('can\'t zap someone with no Lightning address', () => {
    const { zap, sheet } = open({ lud16: () => null });
    expect(zap.disabled).toBe(true);
    expect(sheet.textContent).toContain('no Lightning address');
  });
  it('offers to connect a wallet when there is none', () => {
    const { zap, sheet } = open({ walletKind: () => null, walletView: () => null });
    expect(zap.disabled).toBe(true);
    expect(sheet.querySelector('.zap-uri')).not.toBeNull();
  });
  it('never offers a second try when the wallet may have paid', async () => {
    const { zap, sheet } = open({ send: vi.fn(async () => { throw new Error('quiet'); }) });
    zap.click();
    await flush();
    expect(sheet.textContent).toContain('stopped answering');
    expect(zap.disabled).toBe(true);
  });
});
