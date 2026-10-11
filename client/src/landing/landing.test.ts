// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COPY, LANGS, pickLang, type CopyKey } from './copy';
import { applyLang } from './landing';

const html = readFileSync(join(__dirname, '../../index.html'), 'utf8');

describe('landing copy', () => {
  it('has every word in both languages', () => {
    const keys = Object.keys(COPY.en).sort();
    for (const l of LANGS) {
      expect(Object.keys(COPY[l]).sort()).toEqual(keys);
      for (const k of keys) expect(COPY[l][k as CopyKey].trim(), `${l} ${k}`).not.toBe('');
    }
  });
  it('covers every key the page uses, and the page carries the English', () => {
    document.documentElement.innerHTML = html.replace(/^<!doctype html>/i, '');
    const els = [...document.querySelectorAll<HTMLElement>('[data-i18n]')];
    expect(els.length).toBeGreaterThan(20);
    for (const el of els) expect(el.textContent).toBe(COPY.en[el.dataset.i18n as CopyKey]);
  });
  it('switches the page to Spanish and back', () => {
    document.documentElement.innerHTML = html.replace(/^<!doctype html>/i, '');
    applyLang(document, 'es');
    expect(document.documentElement.lang).toBe('es');
    expect(document.querySelector('h1')!.textContent).toBe(COPY.es['hero.title']);
    expect(document.querySelector('[data-lang="es"]')!.getAttribute('aria-pressed')).toBe('true');
    applyLang(document, 'en');
    expect(document.querySelector('h1')!.textContent).toBe(COPY.en['hero.title']);
  });
  it('sends every call to action to the village', () => {
    document.documentElement.innerHTML = html.replace(/^<!doctype html>/i, '');
    for (const k of ['nav.enter', 'hero.enter', 'cta.enter']) expect(document.querySelector(`[data-i18n="${k}"]`)!.getAttribute('href')).toBe('/app');
  });
});

describe('pickLang', () => {
  it('prefers ?lang=, then the saved choice, then the browser', () => {
    expect(pickLang('?lang=es', 'en', ['en-US'])).toBe('es');
    expect(pickLang('', 'es', ['en-US'])).toBe('es');
    expect(pickLang('', null, ['es-AR', 'en'])).toBe('es');
    expect(pickLang('?lang=fr', 'xx', ['pt-BR', 'de'])).toBe('en');
  });
});
