// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const stages: { set: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>; canvas: HTMLCanvasElement }[] = [];
vi.mock('./lookPreview', () => ({
  LookPreview: class {
    canvas = document.createElement('canvas');
    set = vi.fn();
    dispose = vi.fn();
    constructor() { this.canvas.className = 'look-preview'; stages.push(this); }
  },
}));

const { openCreator } = await import('./creator');
const { DEFAULT_AVATAR } = await import('../nostr/avatars');

const deps = () => ({ current: () => DEFAULT_AVATAR, preview: vi.fn(), save: vi.fn(async () => null), cancel: vi.fn() });

describe('look editor preview', () => {
  beforeEach(() => { document.body.innerHTML = ''; stages.length = 0; });

  it('shows the character under the title and follows every choice', () => {
    openCreator(document.body, deps());
    const panel = document.querySelector('.creator')!;
    expect(panel.children[1].className).toBe('look-preview');
    const stage = stages[0];
    expect(stage.set).toHaveBeenCalledTimes(1);
    (panel.querySelector('.body .creator-chip[data-v="f"]') as HTMLButtonElement).click();
    expect(stage.set).toHaveBeenLastCalledWith(expect.objectContaining({ look: expect.objectContaining({ body: 'f' }) }));
  });

  it('offers "no shirt" to men only, and drops it when the body changes', () => {
    openCreator(document.body, deps());
    const panel = document.querySelector('.creator')!;
    const stage = stages[0];
    const shirt = [...panel.querySelectorAll<HTMLButtonElement>('.hood .creator-chip')].find((b) => /shirt/i.test(b.textContent ?? ''))!;
    (panel.querySelector('.body .creator-chip[data-v="m"]') as HTMLButtonElement).click();
    expect(shirt.disabled).toBe(false);
    shirt.click();
    expect(shirt.classList.contains('on')).toBe(true);
    expect(stage.set).toHaveBeenLastCalledWith(expect.objectContaining({ look: expect.objectContaining({ shirtless: true }) }));
    (panel.querySelector('.body .creator-chip[data-v="f"]') as HTMLButtonElement).click();
    expect(shirt.disabled).toBe(true);
    expect(stage.set.mock.lastCall![0].look).not.toHaveProperty('shirtless');
  });

  it('frees its renderer on cancel, on save and when reopened', async () => {
    openCreator(document.body, deps());
    (document.querySelector('.creator .themes-foot .account-btn:not(.primary)') as HTMLButtonElement).click();
    expect(stages[0].dispose).toHaveBeenCalled();
    expect(document.querySelector('.creator')).toBeNull();

    openCreator(document.body, deps());
    openCreator(document.body, deps());
    expect(stages[1].dispose).toHaveBeenCalled();
    expect(document.querySelectorAll('.creator')).toHaveLength(1);

    (document.querySelector('.creator .account-btn.primary') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(stages[2].dispose).toHaveBeenCalled());
  });
});

describe('closing the look editor', () => {
  beforeEach(() => { document.body.innerHTML = ''; stages.length = 0; });
  it('closes from its ×, from Esc and from closeCreator, putting the preview back each time', async () => {
    const { closeCreator } = await import('./creator');
    for (const how of ['x', 'esc', 'api'] as const) {
      const d = deps();
      openCreator(document.body, d);
      if (how === 'x') (document.querySelector('.creator .creator-close') as HTMLButtonElement).click();
      else if (how === 'esc') window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      else expect(closeCreator()).toBe(true);
      expect(document.querySelector('.creator')).toBeNull();
      expect(d.cancel).toHaveBeenCalledTimes(1);
    }
    expect(closeCreator()).toBe(false);
  });
});

describe('favourite places in the look editor', () => {
  beforeEach(() => { document.body.innerHTML = ''; stages.length = 0; });
  it('picks up to three (a fourth replaces the oldest), unpicks, and saves them with the look', async () => {
    const d = deps();
    openCreator(document.body, d);
    const chip = (v: string) => document.querySelector(`.creator .haunts .creator-chip[data-v="${v}"]`) as HTMLButtonElement;
    expect(document.querySelectorAll('.creator .haunts .creator-chip').length).toBeGreaterThanOrEqual(10);
    for (const v of ['pond', 'gym', 'plaza', 'market']) chip(v).click();
    expect([...document.querySelectorAll('.creator .haunts .creator-chip.on')].map((b) => (b as HTMLElement).dataset.v).sort()).toEqual(['gym', 'market', 'plaza']);
    chip('plaza').click();
    expect(chip('plaza').classList.contains('on')).toBe(false);
    // The hat chips don't light up with them.
    expect(document.querySelectorAll('.creator .hats .creator-chip.on')).toHaveLength(1);
    (document.querySelector('.creator .account-btn.primary') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(d.save).toHaveBeenCalledWith(expect.objectContaining({ haunts: ['gym', 'market'] })));
  });
});
