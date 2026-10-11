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
