// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';

describe('watch mode', () => {
  it('covers the page with the film (or a card), hides the village’s controls, and closes on Esc', async () => {
    const { WatchView } = await import('./theaterPanel');
    let closed = 0;
    const w = new WatchView(() => { closed++; });
    expect(document.body.classList.contains('watching')).toBe(true);
    w.show(null, ['Cine', 'Nobody is sharing yet']);
    expect(w.el.textContent).toContain('Nobody is sharing yet');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(closed).toBe(1);
    w.close();
    expect(document.body.classList.contains('watching')).toBe(false);
    expect(document.querySelector('.theater-watch')).toBeNull();
  });
});
