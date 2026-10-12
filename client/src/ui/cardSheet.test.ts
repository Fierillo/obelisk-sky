// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { wireCard } from './cardSheet';

function card() {
  const c = document.createElement('div');
  c.innerHTML = '<div class="card-head"><span class="grip"></span><button class="card-close">×</button></div><div class="card-body"></div>';
  document.body.append(c);
  return c;
}
const ptr = (type: string, y: number) => Object.assign(new MouseEvent(type, { bubbles: true, clientY: y }), { pointerId: 1 });

describe('the card controls', () => {
  it('closes on the × even though the head is a drag grip', () => {
    const c = card();
    const close = vi.fn();
    const capture = vi.fn();
    (c.querySelector('.card-head') as HTMLElement).setPointerCapture = capture;
    wireCard(c, close);
    const x = c.querySelector('.card-close') as HTMLElement;
    x.dispatchEvent(ptr('pointerdown', 10));
    expect(capture).not.toHaveBeenCalled();
    x.click();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('closes when the grip is dragged down far enough, not for a nudge', () => {
    const c = card();
    const close = vi.fn();
    wireCard(c, close);
    const grip = c.querySelector('.grip') as HTMLElement;
    grip.dispatchEvent(ptr('pointerdown', 100));
    grip.dispatchEvent(ptr('pointerup', 130));
    expect(close).not.toHaveBeenCalled();
    grip.dispatchEvent(ptr('pointerdown', 100));
    grip.dispatchEvent(ptr('pointerup', 200));
    expect(close).toHaveBeenCalledTimes(1);
  });
});
