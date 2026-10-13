// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { openSettings, SETTINGS_WORDS } from './settings';
import { PrefsStore } from '../prefs';

describe('settings in the village’s language', () => {
  it('has every word in Spanish', () => {
    expect(Object.keys(SETTINGS_WORDS.es).sort()).toEqual(Object.keys(SETTINGS_WORDS.en).sort());
  });
  it('draws the panel in Spanish when the landing page chose Spanish', () => {
    const root = document.createElement('div');
    openSettings(root, new PrefsStore(), () => 'medium', 'es');
    const text = root.textContent ?? '';
    expect(text).toContain('Ajustes');
    expect(text).toContain('Gráficos');
    expect(text).toContain('Listo');
    expect(text).not.toContain('Graphics');
  });
});

describe('the look editor in the village’s language', () => {
  it('has every word in Spanish', async () => {
    const { CREATOR_WORDS } = await import('./creator');
    expect(Object.keys(CREATOR_WORDS.es).sort()).toEqual(Object.keys(CREATOR_WORDS.en).sort());
    for (const k of ['hair_', 'outfit_', 'hat_'] as const) expect(Object.keys(CREATOR_WORDS.es[k]).sort()).toEqual(Object.keys(CREATOR_WORDS.en[k]).sort());
  });
});
