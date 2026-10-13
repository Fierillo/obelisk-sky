// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { initOrientation, lockLandscape } from './orientation';

describe('holding landscape', () => {
  it('goes full screen, then locks landscape', async () => {
    const order: string[] = [];
    const doc = { fullscreenElement: null, documentElement: { requestFullscreen: vi.fn(async () => { order.push('full'); }) } } as unknown as Document;
    const scr = { orientation: { lock: vi.fn(async (o: string) => { order.push(o); }) } } as unknown as Screen;
    expect(await lockLandscape(doc, scr)).toBe(true);
    expect(order).toEqual(['full', 'landscape']);
  });

  it('says so when the browser refuses (iOS, desktop)', async () => {
    const doc = { fullscreenElement: null, documentElement: { requestFullscreen: vi.fn(async () => { throw new Error('no'); }) } } as unknown as Document;
    expect(await lockLandscape(doc, { orientation: { lock: async () => { throw new Error('NotSupported'); } } } as unknown as Screen)).toBe(false);
    expect(await lockLandscape(doc, {} as Screen)).toBe(false);
  });
});

describe('the rotate card', () => {
  const card = () => {
    const el = document.createElement('div');
    el.innerHTML = '<div class="rotate-title" data-i18n="rotate.title">Play in full screen</div><div class="rotate-text" data-i18n="rotate.text">x</div><button class="rotate-go"></button><div class="rotate-hint"></div>';
    return el;
  };
  it('goes full screen when its button is pressed', () => {
    const el = card();
    const requestFullscreen = vi.fn(async () => {});
    initOrientation(el, { fullscreenEnabled: true, fullscreenElement: null, documentElement: { requestFullscreen } } as unknown as Document);
    el.querySelector('button')!.click();
    expect(requestFullscreen).toHaveBeenCalled();
    expect(el.classList.contains('no-fullscreen')).toBe(false);
  });
  it('without full screen (iPhone) only asks you to turn the phone', () => {
    const el = card();
    initOrientation(el, { fullscreenEnabled: false, documentElement: {} } as unknown as Document);
    expect(el.classList.contains('no-fullscreen')).toBe(true);
    expect(el.querySelector<HTMLElement>('.rotate-title')!.dataset.i18n).toBe('rotate.turnTitle');
  });
});
