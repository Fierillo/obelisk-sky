// The landing page at /: language switch only. No Three.js, no React; the
// village itself lives at /app.

import { COPY, LANGS, pickLang, rememberLang, storedLang, type CopyKey, type Lang } from './copy';

/** Put `lang`'s words into every `[data-i18n]` element under `root`. */
export function applyLang(doc: Document, lang: Lang): void {
  const words = COPY[lang];
  doc.documentElement.lang = lang;
  doc.title = words['meta.title'];
  for (const el of doc.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const w = words[el.dataset.i18n as CopyKey];
    if (w) el.textContent = w;
    if (w && el.dataset.glow) glowWord(el, el.dataset.glow);
  }
  for (const b of doc.querySelectorAll<HTMLButtonElement>('[data-lang]')) b.setAttribute('aria-pressed', String(b.dataset.lang === lang));
}

/** Wrap each `word` in `el`'s text in a `.glow-word` span (the hero's shimmering "Nostr"). */
export function glowWord(el: HTMLElement, word: string): void {
  const text = el.textContent ?? '';
  const parts = text.split(word);
  if (parts.length < 2) return;
  el.textContent = '';
  parts.forEach((part, i) => {
    if (i > 0) {
      const span = el.ownerDocument.createElement('span');
      span.className = 'glow-word';
      span.textContent = word;
      el.append(span);
    }
    if (part) el.append(part);
  });
}

export function mountLanding(doc: Document): void {
  applyLang(doc, pickLang(location.search, storedLang(), navigator.languages ?? [navigator.language]));
  for (const b of doc.querySelectorAll<HTMLButtonElement>('[data-lang]')) {
    b.addEventListener('click', () => {
      const lang = b.dataset.lang as Lang;
      if (!LANGS.includes(lang)) return;
      rememberLang(lang);
      applyLang(doc, lang);
    });
  }
}

if (typeof document !== 'undefined' && document.querySelector('.hero')) mountLanding(document);
