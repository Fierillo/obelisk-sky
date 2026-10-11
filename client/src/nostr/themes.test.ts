import { describe, it, expect } from 'vitest';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';
import { parseThemes, themesTemplate, resolveTheme, heuristicTheme, parseLayoutCategories, themesDTag, layoutDTag, EMPTY_THEMES } from './themes';

const R = 'wss://public.obelisk.ar';
const sk = generateSecretKey();

describe('sky theme config', () => {
  it('round-trips through its event and verifies the d tag', () => {
    const cfg = { channels: { run: 'sports' as const }, categories: { cat1: 'gaming' as const }, updatedAt: 0 };
    const ev = finalizeEvent(themesTemplate(R, cfg), sk);
    const back = parseThemes(ev, R)!;
    expect(back.channels).toEqual({ run: 'sports' });
    expect(back.categories).toEqual({ cat1: 'gaming' });
    expect(parseThemes(ev, 'wss://other.relay')).toBeNull();
  });
  it('drops unknown themes and keeps the first of duplicates', () => {
    const ev = finalizeEvent({ kind: 30078, content: '', created_at: 1, tags: [['d', themesDTag(R)], ['channel', 'a', 'disco'], ['channel', 'b', 'sports'], ['channel', 'b', 'gaming']] }, sk);
    expect(parseThemes(ev, R)!.channels).toEqual({ b: 'sports' });
  });
  it('bumps created_at past the previous config', () => {
    expect(themesTemplate(R, EMPTY_THEMES, 9_999_999_999).created_at).toBe(10_000_000_000);
  });
});

describe('resolveTheme', () => {
  const g = (id: string, name: string, kind: 'text' | 'forum' | 'voice' = 'text') => ({ id, name, kind });
  it('channel beats category beats heuristic beats kind', () => {
    const cfg = { channels: { a: 'library' as const }, categories: { c: 'gaming' as const }, updatedAt: 1 };
    expect(resolveTheme(g('a', 'RUNSTR'), cfg, { a: 'c' })).toBe('library');
    expect(resolveTheme(g('b', 'RUNSTR'), cfg, { b: 'c' })).toBe('gaming');
    expect(resolveTheme(g('d', 'RUNSTR'), cfg, {})).toBe('sports');
    expect(resolveTheme(g('e', 'Feedback', 'forum'), cfg, {})).toBe('library');
    expect(resolveTheme(g('f', 'General'), cfg, {})).toBe('plaza');
  });
  it('guesses from names on day one', () => {
    expect(heuristicTheme('🏃🏻 RUNSTR', 'text')).toBe('sports');
    expect(heuristicTheme('Calistenia', 'text')).toBe('sports');
    expect(heuristicTheme('Gaming night', 'text')).toBe('gaming');
    expect(heuristicTheme('🎙️ Voice P2P', 'voice')).toBe('stage');
  });
  it('reads category membership from the app layout event', () => {
    const ev = finalizeEvent({ kind: 30078, content: '', created_at: 1, tags: [['d', layoutDTag(R)], ['category', 'c', 'Sports', '0'], ['channel', 'x', 'c', '0'], ['channel', 'y', '', '1']] }, sk);
    expect(parseLayoutCategories(ev, R)).toEqual({ x: 'c' });
  });
});
