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
  'ctl.director': 'Auto camera',
  'ctl.director.title': 'Auto-director: follow conversations',
  'ctl.story': 'History',
  'ctl.story.title': 'History: replay the latest conversation (again to go live)',
  'ctl.time': 'Time of day',
  'ctl.time.title': 'Time of day: Buenos Aires',
  'ctl.signs': 'Signs',
  'ctl.signs.title': 'Channel signs',
  'ctl.tilt': 'Toy town',
  'ctl.tilt.title': 'Toy-town view: blur the top and bottom of the picture so the island looks like a tiny model',
  'ctl.sound': 'Sound',
  'ctl.sound.title': 'Ambient sound',
  'ctl.districts': 'Districts',
  'ctl.districts.title': 'Districts (relay operator)',
  'ctl.home': 'Whole island',
  'ctl.home.title': 'Whole island',
  'ctl.emote': 'Emotes',
  'ctl.emote.title': 'Emotes: dance, lotus pose… (G)',
  'ctl.firstperson': 'First person',
  'ctl.firstperson.title': 'First-person view (V)',
  'ctl.settings': 'Settings',
  'ctl.settings.title': 'Settings',
  'ctl.help': 'Controls',
  'ctl.help.title': 'How to play (controls)',
  'ctl.fullscreen': 'Fullscreen',
  'ctl.fullscreen.title': 'Fullscreen',
  'ctl.about': 'About',
  'ctl.about.title': 'About Obelisk Sky',
  'ctl.logout': 'Log out',
  'ctl.logout.title': 'Log out',
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
  'ctl.director': 'Cámara automática',
  'ctl.director.title': 'Cámara automática: sigue las conversaciones',
  'ctl.story': 'Historial',
  'ctl.story.title': 'Historial: repetí la última conversación (otra vez para volver al vivo)',
  'ctl.time': 'Hora del día',
  'ctl.time.title': 'Hora del día: Buenos Aires',
  'ctl.signs': 'Carteles',
  'ctl.signs.title': 'Carteles de los canales',
  'ctl.tilt': 'Maqueta',
  'ctl.tilt.title': 'Vista maqueta: desenfoca arriba y abajo para que la isla parezca una miniatura',
  'ctl.sound': 'Sonido',
  'ctl.sound.title': 'Sonido ambiente',
  'ctl.districts': 'Distritos',
  'ctl.districts.title': 'Distritos (operador del relay)',
  'ctl.home': 'Toda la isla',
  'ctl.home.title': 'Toda la isla',
  'ctl.emote': 'Gestos',
  'ctl.emote.title': 'Gestos: bailar, loto… (G)',
  'ctl.firstperson': 'Primera persona',
  'ctl.firstperson.title': 'Vista en primera persona (V)',
  'ctl.settings': 'Ajustes',
  'ctl.settings.title': 'Ajustes',
  'ctl.help': 'Controles',
  'ctl.help.title': 'Cómo jugar (controles)',
  'ctl.fullscreen': 'Pantalla completa',
  'ctl.fullscreen.title': 'Pantalla completa',
  'ctl.about': 'Acerca de',
  'ctl.about.title': 'Acerca de Obelisk Sky',
  'ctl.logout': 'Salir',
  'ctl.logout.title': 'Salir',
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
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n-title]')) {
    const key = el.dataset.i18nTitle as AppKey;
    if (!(key in APP_COPY[l])) continue;
    el.title = t(key, {}, l);
    if (el.hasAttribute('aria-label')) el.setAttribute('aria-label', t(key, {}, l));
  }
}
