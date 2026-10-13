// Words of the village's own page (app/index.html, the gate, the loader, the
// rotate card) in each language. Elements carry `data-i18n` (text) or
// `data-i18n-title` (title and aria-label) with a key from here.

import { lang, type Lang } from './lang';

const en = {
  'login': 'Log in',
  'logout': 'Log out',
  'gate.login': 'Log in with Nostr',
  'gate.loggedOut': 'Log in with your Nostr key to see who lives here and join the conversations.',
  'gate.refused': '{relay} is invite-only and has not admitted this key yet. Ask in Obelisk to be let in.',
  'status.connecting': 'Connecting…',
  'status.loggedOut': 'Logged out',
  'status.refused': 'Not admitted',
  'status.reconnecting': 'Reconnecting…',
  'loading.island': 'Raising the island…',
  'loading.trees': 'Planting trees…',
  'loading.houses': 'Building houses…',
  'loading.people': 'Waking up the villagers…',
  'rotate.title': 'Turn your phone sideways',
  'rotate.text': 'The village is played in landscape.',
  'rotate.button': 'Go full screen',
  'toast.loginToWalk': 'Log in to walk around as yourself.',
};

export type AppKey = keyof typeof en;

const es: Record<AppKey, string> = {
  'login': 'Ingresar',
  'logout': 'Salir',
  'gate.login': 'Ingresar con Nostr',
  'gate.loggedOut': 'Ingresá con tu clave de Nostr para ver quién vive acá y sumarte a las conversaciones.',
  'gate.refused': '{relay} es solo por invitación y todavía no admitió esta clave. Pedí que te dejen entrar en Obelisk.',
  'status.connecting': 'Conectando…',
  'status.loggedOut': 'Sin sesión',
  'status.refused': 'Sin acceso',
  'status.reconnecting': 'Reconectando…',
  'loading.island': 'Levantando la isla…',
  'loading.trees': 'Plantando árboles…',
  'loading.houses': 'Construyendo casas…',
  'loading.people': 'Despertando a los vecinos…',
  'rotate.title': 'Girá el teléfono',
  'rotate.text': 'La aldea se juega en horizontal.',
  'rotate.button': 'Pantalla completa',
  'toast.loginToWalk': 'Ingresá para recorrer la aldea con tu personaje.',
};

export const APP_COPY: Record<Lang, Record<AppKey, string>> = { en, es };

/** A word of the page, with `{name}` filled in. */
export function t(key: AppKey, values: Record<string, string> = {}, l: Lang = lang): string {
  return APP_COPY[l][key].replace(/\{(\w+)\}/g, (m, k: string) => values[k] ?? m);
}

/** Put the language's words into every `[data-i18n]` element under `root`. */
export function applyAppLang(root: ParentNode, l: Lang = lang): void {
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = el.dataset.i18n as AppKey;
    if (key in APP_COPY[l]) el.textContent = t(key, {}, l);
  }
}
