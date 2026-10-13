// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { APP_COPY, applyAppLang, t, type AppKey } from './app';
import { pick, urlWithoutLang } from './lang';

describe('the village page in each language', () => {
  it('has every word in Spanish too', () => {
    expect(Object.keys(APP_COPY.es).sort()).toEqual(Object.keys(APP_COPY.en).sort());
    for (const v of Object.values(APP_COPY.es)) expect(v.trim()).not.toBe('');
  });
  it('fills in names', () => {
    expect(t('gate.guestRefused', { relay: 'public.obelisk.ar' }, 'es')).toMatch(/^public\.obelisk\.ar todavía no te admitió/);
  });
  it('puts the words into the page', () => {
    document.body.innerHTML = '<div class="loading-title" data-i18n="loading.island">Raising the island…</div><button data-i18n="rotate.button">Play in full screen</button><b data-i18n="nope">x</b>';
    applyAppLang(document, 'es');
    expect(document.querySelector('.loading-title')!.textContent).toBe('Levantando la isla…');
    expect(document.querySelector('button')!.textContent).toBe('Jugar en pantalla completa');
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
  it('gives an aria-label of its own', () => {
    document.body.innerHTML = '<button class="card-close" aria-label="Close" data-i18n-aria="close"></button><nav aria-label="View controls" data-i18n-aria="controls"></nav>';
    applyAppLang(document, 'es');
    expect(document.querySelector('button')!.getAttribute('aria-label')).toBe('Cerrar');
    expect(document.querySelector('button')!.hasAttribute('title')).toBe(false);
    expect(document.querySelector('nav')!.getAttribute('aria-label')).toBe('Controles de la vista');
  });
  it('knows every key app/index.html asks for', () => {
    const html = readFileSync(join(__dirname, '../../app/index.html'), 'utf8');
    const keys = [...html.matchAll(/data-i18n(?:-title|-aria)?="([^"]+)"/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(40);
    for (const k of keys) expect(APP_COPY.es[k as AppKey], k).toBeTruthy();
    // The call bar, the near prompt and the private call bar come in Spanish too.
    for (const k of ['call.join', 'call.leave', 'near.dm', 'pcall.hangup', 'bell.read']) expect(keys).toContain(k);
  });
  it('drops ?lang= when a language is picked, keeping the rest', () => {
    expect(urlWithoutLang('https://sky.obelisk.ar/app/?lang=en&relay=public.obelisk.ar')).toBe('https://sky.obelisk.ar/app/?relay=public.obelisk.ar');
    expect(urlWithoutLang('https://sky.obelisk.ar/app')).toBe('https://sky.obelisk.ar/app');
  });
});
