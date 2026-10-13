// @vitest-environment jsdom
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { openZapSheet, resetZapSheetState, type ZapSheetDeps } from './zapSheet';

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
  beforeEach(() => resetZapSheetState());
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
  it('can\'t be cancelled or replaced while it pays', async () => {
    let finish!: () => void;
    const { deps, zap } = open({ send: vi.fn(() => new Promise<{ markerError: null }>((r) => { finish = () => r({ markerError: null }); })) });
    zap.click();
    await flush();
    const cancel = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Cancel')!;
    expect(cancel.disabled).toBe(true);
    cancel.click();
    expect(document.querySelector('.zap-sheet')).not.toBeNull();
    openZapSheet(document.body, PK, 100, deps);
    expect(document.querySelectorAll('.zap-sheet')).toHaveLength(1);
    expect(deps.toast).toHaveBeenCalledWith(expect.stringContaining('still being paid'));
    finish();
    await flush();
    expect(deps.send).toHaveBeenCalledTimes(1);
  });
  it('after a payment that may have gone through, no other sheet offers to zap', async () => {
    const first = open({ send: vi.fn(async () => { throw new Error('quiet'); }) });
    first.zap.click();
    await flush();
    const again = open();
    expect(again.zap.disabled).toBe(true);
    expect(again.sheet.textContent).toContain('reload');
  });
  it('enables Zap when their Lightning address arrives after opening', async () => {
    vi.useFakeTimers();
    let address: string | null = null;
    const { zap } = open({ lud16: () => address });
    expect(zap.disabled).toBe(true);
    address = 'ana@getalby.com';
    vi.advanceTimersByTime(1100);
    expect(zap.disabled).toBe(false);
    vi.useRealTimers();
  });
});
