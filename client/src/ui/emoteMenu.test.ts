// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { EmoteMenu } from './emoteMenu';
import { EMOTES } from '../world/emotes';

describe('the emote menu', () => {
  const make = (current: string | null = null) => {
    const pick = vi.fn();
    const m = new EmoteMenu(document.body, { pick, current: () => current as never });
    return { m, pick };
  };

  it('lists every emote, with the lotus pose and a dance', () => {
    const { m } = make();
    const kinds = [...m.el.querySelectorAll<HTMLElement>('.emote-btn')].map((b) => b.dataset.kind);
    expect(kinds).toEqual(EMOTES.map((e) => e.kind));
    expect(kinds).toContain('lotus');
    expect(kinds).toContain('dance');
  });

  it('picks by number while open and closes, ignores numbers while closed', () => {
    const { m, pick } = make();
    expect(m.key('1')).toBe(false);
    m.toggle(true);
    expect(m.key('2')).toBe(true);
    expect(pick).toHaveBeenCalledWith(EMOTES[1].kind);
    expect(m.open).toBe(false);
  });

  it('marks the emote you are doing, and closes on Escape', () => {
    const { m } = make('dance');
    m.toggle(true);
    expect(m.el.querySelector('[data-kind="dance"]')!.classList.contains('on')).toBe(true);
    expect(m.key('Escape')).toBe(true);
    expect(m.open).toBe(false);
  });

  it('0 picks the tenth: Sangreee...', () => {
    const { m, pick } = make();
    m.toggle(true);
    expect(m.el.querySelector('[data-kind="sangre"] kbd')!.textContent).toBe('0');
    expect(m.key('0')).toBe(true);
    expect(pick).toHaveBeenCalledWith('sangre');
  });

  it('picks on click', () => {
    const { m, pick } = make();
    m.toggle(true);
    (m.el.querySelector('[data-kind="lotus"]') as HTMLButtonElement).click();
    expect(pick).toHaveBeenCalledWith('lotus');
  });
});
