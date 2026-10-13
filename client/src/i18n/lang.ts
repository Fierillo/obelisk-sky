// The village's language: the landing page's choice (`?lang=`, then what
// was picked there, then the browser's), so a visitor who read the landing
// page in Spanish gets the loader, the gate and the login in Spanish too.

import { pickLang, storedLang, type Lang } from '../landing/copy';

export type { Lang };

export const lang: Lang = typeof location === 'undefined' || typeof navigator === 'undefined'
  ? 'en'
  : pickLang(location.search, storedLang(), navigator.languages ?? [navigator.language]);

/** The words for the village's language. */
export function pick<T>(words: Record<Lang, T>, l: Lang = lang): T {
  return words[l];
}
