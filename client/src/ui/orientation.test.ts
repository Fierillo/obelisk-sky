// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { lockLandscape } from './orientation';

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
