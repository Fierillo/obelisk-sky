// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { APP_COPY, applyAppLang, t } from './app';
import { pick } from './lang';

describe('the village page in each language', () => {
  it('has every word in Spanish too', () => {
    expect(Object.keys(APP_COPY.es).sort()).toEqual(Object.keys(APP_COPY.en).sort());
    for (const v of Object.values(APP_COPY.es)) expect(v.trim()).not.toBe('');
  });
  it('fills in names', () => {
    expect(t('gate.refused', { relay: 'public.obelisk.ar' }, 'es')).toMatch(/^public\.obelisk\.ar es solo por invitación/);
  });
  it('puts the words into the page', () => {
    document.body.innerHTML = '<div class="loading-title" data-i18n="loading.island">Raising the island…</div><button data-i18n="rotate.button">Go full screen</button><b data-i18n="nope">x</b>';
    applyAppLang(document, 'es');
    expect(document.querySelector('.loading-title')!.textContent).toBe('Levantando la isla…');
    expect(document.querySelector('button')!.textContent).toBe('Pantalla completa');
    expect(document.querySelector('b')!.textContent).toBe('x');
  });
  it('picks the words for a language', () => {
    expect(pick({ en: 'Got it', es: 'Entendido' }, 'es')).toBe('Entendido');
  });
  it('translates the menu: labels, titles and aria-labels', () => {
    document.body.innerHTML = '<button data-act="settings" title="Settings" aria-label="Settings" data-i18n-title="ctl.settings.title"><span class="ctl-label" data-i18n="ctl.settings">Settings</span></button>';
    applyAppLang(document, 'es');
    const b = document.querySelector('button')!;
    expect(b.title).toBe('Ajustes');
    expect(b.getAttribute('aria-label')).toBe('Ajustes');
    expect(b.textContent).toBe('Ajustes');
  });
});
