// The village's language: the landing page's choice (`?lang=`, then what
// was picked there or in the village's settings, then the browser's), so a
// visitor who read the landing page in Spanish gets the loader, the gate and
// the login in Spanish too. Modules read it once, so a change reloads.

import { LANGS, pickLang, rememberLang, storedLang, type Lang } from '../landing/copy';

export type { Lang };
export { LANGS };

export const lang: Lang = typeof location === 'undefined' || typeof navigator === 'undefined'
  ? 'en'
  : pickLang(location.search, storedLang(), navigator.languages ?? [navigator.language]);

/** The words for the village's language. */
export function pick<T>(words: Record<Lang, T>, l: Lang = lang): T {
  return words[l];
}

/** The address to reload on after picking a language: `?lang=` would win over the choice, so it goes. */
export function urlWithoutLang(href: string): string {
  const u = new URL(href);
  u.searchParams.delete('lang');
  return u.toString();
}

/** Pick the village's (and the landing page's) language and reload into it. */
export function switchLang(l: Lang): void {
  rememberLang(l);
  location.replace(urlWithoutLang(location.href));
}
