// The guest island's script: its houses (39000-style group metas) and the
// conversations played in them, as local events from the villagers in
// npcs.json (scripts/guest-npcs.mjs). Pure: time and language come in, events
// come out. None of it is signed (sig ''), none of it is ever sent: it is fed
// straight into a SkyState (guest/feed.ts).
//
// The lines are ordinary village chat made up for the demo, never anyone's
// words: who says which line is picked by turn, so it changes as the script
// loops. The banner says the chats are a demo.

import { getEventHash, type Event as NostrEvent } from 'nostr-tools';
import type { Lang } from '../i18n/lang';
import { SkyState } from '../nostr/state';
import type { ServerMsg } from '../nostr/wire';
import npcData from './npcs.json';

export type HouseId = 'bitcoin' | 'nostr-dev' | 'art-memes' | 'mate' | 'fitness' | 'fogon';

/** Where a villager likes to wander (world haunts; see applyGuestHaunts in main.ts). */
export type Haunt = 'coffee' | 'parrilla' | 'nostrwot' | 'campfire' | 'pond' | 'plaza' | 'park' | 'track' | 'gym' | 'market' | 'home';

export interface GuestNpc {
  pubkey: string;
  /** A hint for people reading the file; the village shows their kind 0 name. */
  name: string;
  home: HouseId;
  haunts: Haunt[];
}

export const NPCS: readonly GuestNpc[] = npcData as GuestNpc[];

type Words = Record<Lang, string>;

export interface House {
  id: HouseId;
  name: Words;
  about: Words;
  /** A voice channel: an ombú and a campfire (its call stays off on the guest island). */
  voice?: boolean;
}

export const HOUSES: readonly House[] = [
  { id: 'bitcoin', name: { en: 'Bitcoin', es: 'Bitcoin' }, about: { en: 'Sats, nodes and the price of a choripán.', es: 'Sats, nodos y el precio del choripán.' } },
  { id: 'nostr-dev', name: { en: 'Nostr dev', es: 'Nostr dev' }, about: { en: 'Relays, NIPs and late-night builds.', es: 'Relays, NIPs y builds de madrugada.' } },
  { id: 'art-memes', name: { en: 'Art & memes', es: 'Arte y memes' }, about: { en: 'Drawings, pixels and nostriches doing silly things.', es: 'Dibujos, píxeles y nostriches haciendo cosas raras.' } },
  { id: 'mate', name: { en: 'Mate & chat', es: 'Mate y charla' }, about: { en: 'Pass the mate and tell us how your day went.', es: 'Pasá el mate y contanos cómo te fue.' } },
  // "Fitness" makes this house the gym (world/gym.ts GYM_RE).
  { id: 'fitness', name: { en: 'Fitness', es: 'Fitness' }, about: { en: 'Squats, laps round the island and stretching.', es: 'Sentadillas, vueltas a la isla y elongación.' } },
  { id: 'fogon', name: { en: 'Campfire', es: 'Fogón' }, about: { en: 'Stories and a guitar round the fire.', es: 'Historias y guitarra alrededor del fuego.' }, voice: true },
];

/** The id of a house's channel. */
export const houseGroupId = (h: HouseId): string => `guest-${h}`;

/** A line of a thread: who says it (a role, 0–2), what, which earlier line it answers, and reactions to it. */
export interface Line {
  by: number;
  t: Words;
  re?: number;
  react?: [by: number, emoji: string][];
}

export interface Thread {
  house: HouseId;
  lines: Line[];
}

const L = (by: number, en: string, es: string, re?: number, react?: [number, string][]): Line => ({ by, t: { en, es }, ...(re !== undefined ? { re } : {}), ...(react ? { react } : {}) });

export const THREADS: readonly Thread[] = [
  // ── Bitcoin ──
  { house: 'bitcoin', lines: [
    L(0, 'Morning! Just finished syncing a fresh node on an old laptop ☕', '¡Buen día! Terminé de sincronizar un nodo nuevo en una notebook vieja ☕'),
    L(1, 'Nice! How long did the initial sync take?', '¡Bien! ¿Cuánto tardó la sincronización inicial?', 0),
    L(0, 'About two days. The fan sounded like a jet engine 😅', 'Unos dos días. El ventilador sonaba como un avión 😅', 1, [[1, '😂'], [2, '🔥']]),
    L(2, 'Worth it. Running your own node is the best kind of homework.', 'Vale la pena. Correr tu propio nodo es la mejor tarea para el hogar.'),
    L(1, 'Agreed. Next step: lightning channels.', 'Coincido. Próximo paso: canales de lightning.', 3, [[0, '⚡']]),
  ] },
  { house: 'bitcoin', lines: [
    L(0, 'Who wants to split a pizza paid in sats tonight? 🍕', '¿Quién se suma a una pizza pagada en sats esta noche? 🍕'),
    L(1, "Count me in, I'll bring the hot sauce", 'Contá conmigo, llevo el picante', 0),
    L(2, 'The place by the café takes lightning now!', '¡El local al lado del café ya acepta lightning!', 0, [[0, '🙌']]),
    L(0, 'Perfect, see you at eight by the obelisk', 'Perfecto, nos vemos a las ocho en el obelisco', 2),
  ] },
  { house: 'bitcoin', lines: [
    L(0, 'Reminder: write your seed words on paper, not in a screenshot 📝', 'Recordatorio: anotá tus palabras semilla en papel, no en una captura de pantalla 📝', undefined, [[1, '💯'], [2, '👍']]),
    L(1, 'And test the backup before you need it.', 'Y probá el respaldo antes de necesitarlo.'),
    L(2, 'Learned that one the hard way. Twice.', 'Lo aprendí por las malas. Dos veces.', 1),
    L(0, 'Twice?! 😬', '¡¿Dos veces?! 😬', 2),
    L(2, 'Third time lucky: I have three steel plates now', 'A la tercera va la vencida: ahora tengo tres placas de acero', 3, [[0, '😂']]),
  ] },
  { house: 'bitcoin', lines: [
    L(0, "What's the smallest thing you've bought with sats?", '¿Qué es lo más chico que compraste con sats?'),
    L(1, 'A sticker. 210 sats.', 'Un sticker. 210 sats.', 0),
    L(2, 'A medialuna at the café this morning 🥐', 'Una medialuna en el café esta mañana 🥐', 0, [[0, '🥐']]),
    L(0, 'Circular economy, one croissant at a time', 'Economía circular, de a una medialuna'),
  ] },
  // ── Nostr dev ──
  { house: 'nostr-dev', lines: [
    L(0, 'Anyone else debugging websockets at this hour? 🦉', '¿Alguien más debuggeando websockets a esta hora? 🦉'),
    L(1, 'Always. Which relay is giving you trouble?', 'Siempre. ¿Qué relay te está dando problemas?', 0),
    L(0, 'Mine. It was my own typo in the filter 🙃', 'El mío. Era un typo mío en el filtro 🙃', 1, [[1, '😂'], [2, '🫠']]),
    L(2, 'The classic. Since and until swapped?', 'El clásico. ¿Since y until al revés?'),
    L(0, 'Exactly that.', 'Exactamente eso.', 3),
  ] },
  { house: 'nostr-dev', lines: [
    L(0, 'Shipped a small client update: profile pictures load faster now 🚀', 'Subí una actualización chica del cliente: las fotos de perfil cargan más rápido 🚀', undefined, [[1, '🚀'], [2, '🔥']]),
    L(1, 'Caching or a CDN?', '¿Caché o CDN?', 0),
    L(0, 'Caching, and asking fewer relays at once.', 'Caché, y preguntarle a menos relays a la vez.', 1),
    L(2, 'Less is more with relays.', 'Con los relays, menos es más.'),
    L(1, "I'll try that on mine this weekend", 'Lo pruebo en el mío este finde'),
  ] },
  { house: 'nostr-dev', lines: [
    L(0, 'Every app should let you bring your own relay list', 'Toda app debería dejarte traer tu propia lista de relays'),
    L(1, "That's just good manners 😄", 'Eso es pura buena educación 😄', 0, [[0, '😄']]),
    L(2, 'And your own keys, obviously', 'Y tus propias claves, obvio', 0),
    L(0, 'Keys first, relays second, coffee third ☕', 'Primero las claves, después los relays, tercero el café ☕', 2),
  ] },
  { house: 'nostr-dev', lines: [
    L(0, "Who's up for a hack night at the café on Thursday?", '¿Quién se prende a una noche de hackeo en el café el jueves?'),
    L(1, "In! I'll bring the extension cords", '¡Me sumo! Llevo las zapatillas eléctricas', 0),
    L(2, "I'll bring snacks and bad ideas 🍪", 'Yo llevo snacks y malas ideas 🍪', 0, [[0, '🍪']]),
    L(0, 'Bad ideas are the best starting point', 'Las malas ideas son el mejor punto de partida'),
    L(1, 'Last time a bad idea became a whole spec draft 😅', 'La última vez una mala idea terminó en un borrador de spec entero 😅'),
  ] },
  // ── Art & memes ──
  { house: 'art-memes', lines: [
    L(0, 'Drew the obelisk at sunset, the purple sky came out great 🎨', 'Dibujé el obelisco al atardecer, el cielo violeta quedó genial 🎨', undefined, [[1, '😍'], [2, '💜']]),
    L(1, 'Post it! I want it as a wallpaper', '¡Subilo! Lo quiero de fondo de pantalla', 0),
    L(2, 'The nostriches need a portrait too 🐦', 'Los nostriches también necesitan un retrato 🐦'),
    L(0, "Working on it, they never stand still", 'Estoy en eso, nunca se quedan quietos', 2),
  ] },
  { house: 'art-memes', lines: [
    L(0, 'Meme idea: a nostrich trying to use a fax machine', 'Idea de meme: un nostrich intentando usar un fax'),
    L(1, "😂 caption: 'my first relay'", "😂 epígrafe: 'mi primer relay'", 0, [[0, '😂'], [2, '💀']]),
    L(2, "I'd frame that", 'Eso lo enmarco'),
  ] },
  { house: 'art-memes', lines: [
    L(0, 'Anyone know a good free tool for pixel art?', '¿Alguien conoce una buena herramienta gratis para pixel art?'),
    L(1, "Plenty of good open-source ones, I'll send you my favourite", 'Hay varias buenas de código abierto, te paso mi favorita', 0),
    L(2, 'Pixel art of the whole island would be amazing', 'Un pixel art de toda la isla estaría increíble'),
    L(0, 'Challenge accepted 🫡', 'Desafío aceptado 🫡', 2, [[2, '🙌']]),
  ] },
  { house: 'art-memes', lines: [
    L(0, 'Gallery night at the theater on Saturday 🖼️', 'Noche de galería en el cine el sábado 🖼️'),
    L(1, 'Can we put the memes on the big screen?', '¿Podemos poner los memes en la pantalla grande?', 0),
    L(0, 'Only the good ones', 'Solo los buenos', 1),
    L(1, 'So... all of them', 'O sea... todos', 2, [[0, '😂'], [2, '😂']]),
  ] },
  // ── Mate & chat ──
  { house: 'mate', lines: [
    L(0, "Who's got the mate going? 🧉", '¿Quién tiene el mate en marcha? 🧉'),
    L(1, 'Here, on the bench by the plaza. Bring cookies', 'Acá, en el banco de la plaza. Traé galletitas', 0),
    L(2, 'On my way with bizcochitos', 'Voy para allá con bizcochitos', 1, [[1, '🙌']]),
    L(0, 'Sweet or bitter mate?', '¿Mate dulce o amargo?'),
    L(1, 'Bitter, always', 'Amargo, siempre', 3),
    L(2, "Sweet, don't judge me 😅", 'Dulce, no me juzguen 😅', 3, [[0, '😂']]),
  ] },
  { house: 'mate', lines: [
    L(0, 'Asado on Sunday at the parrilla? 🔥', '¿Asado el domingo en la parrilla? 🔥'),
    L(1, "Yes! Who's the asador?", '¡Sí! ¿Quién hace de asador?', 0),
    L(2, 'I volunteer. Bring the provoleta', 'Me ofrezco. Traigan la provoleta', 1, [[0, '🔥'], [1, '🥩']]),
    L(0, 'Choripán for everyone and a round of applause for the asador 👏', 'Choripán para todos y un aplauso para el asador 👏'),
  ] },
  { house: 'mate', lines: [
    L(0, 'Rainy afternoon, perfect for tortas fritas 🌧️', 'Tarde de lluvia, ideal para tortas fritas 🌧️', undefined, [[1, '😋']]),
    L(1, 'And a long chat by the window', 'Y una charla larga al lado de la ventana'),
    L(2, 'Save me two!', '¡Guardame dos!', 0),
    L(0, 'No promises 😇', 'No prometo nada 😇', 2),
  ] },
  { house: 'mate', lines: [
    L(0, 'Today I learned the kiosk takes sats', 'Hoy aprendí que el kiosco acepta sats'),
    L(1, 'The whole neighbourhood is joining in', 'Se está sumando todo el barrio', 0),
    L(2, 'Next: the bus 🚌', 'Lo próximo: el colectivo 🚌', undefined, [[0, '😂']]),
  ] },
  // ── Fitness ──
  { house: 'fitness', lines: [
    L(0, 'Leg day. Wish me luck 🦵', 'Día de piernas. Deséenme suerte 🦵', undefined, [[1, '💪'], [2, '🙏']]),
    L(1, 'Squats, then a lap of the track?', '¿Sentadillas y después una vuelta a la pista?', 0),
    L(0, 'Deal, but slowly', 'Trato hecho, pero despacio', 1),
    L(2, "I'll be at the pull-up bars if anyone needs a spot", 'Estoy en las barras de dominadas si alguien necesita ayuda'),
  ] },
  { house: 'fitness', lines: [
    L(0, 'New personal best on the bench press! 🏋️', '¡Nuevo récord personal en press de banca! 🏋️', undefined, [[1, '🔥'], [2, '💪']]),
    L(1, "Congrats! What's the secret?", '¡Felicitaciones! ¿Cuál es el secreto?', 0),
    L(0, 'Sleep, mate, and never skipping Mondays', 'Dormir, mate y no faltar nunca los lunes', 1),
    L(2, 'The mate is doing a lot of work there 🧉', 'El mate está haciendo mucho trabajo ahí 🧉', 2),
  ] },
  { house: 'fitness', lines: [
    L(0, 'Morning run round the island: 3 laps done 🏃', 'Corrida matinal alrededor de la isla: 3 vueltas 🏃'),
    L(1, 'The view from the track at sunrise is unbeatable', 'La vista desde la pista al amanecer no tiene igual', 0),
    L(2, "Tomorrow I'm coming too, wake me up", 'Mañana me sumo, despertame', undefined, [[0, '⏰']]),
  ] },
  // ── Campfire ──
  { house: 'fogon', lines: [
    L(0, 'Fire\'s lit, marshmallows are out 🔥', 'El fuego está prendido, salieron los malvaviscos 🔥', undefined, [[1, '🔥']]),
    L(1, 'Saving me a log?', '¿Me guardás un tronco?', 0),
    L(2, 'Someone bring the guitar 🎸', 'Que alguien traiga la guitarra 🎸'),
    L(0, "It's already here, tuning it", 'Ya está acá, la estoy afinando', 2),
  ] },
  { house: 'fogon', lines: [
    L(0, 'Story time by the fire: what got you into nostr?', 'Ronda de historias junto al fuego: ¿cómo llegaste a nostr?'),
    L(1, 'A friend sent me a zap and I had to find out what it was ⚡', 'Un amigo me mandó un zap y tuve que averiguar qué era ⚡', 0, [[0, '⚡']]),
    L(2, 'I wanted a timeline nobody could take away from me', 'Quería un timeline que nadie me pudiera sacar', 0),
    L(0, 'Good reasons, both of them 🙂', 'Buenas razones, las dos 🙂'),
  ] },
];

/** What the villagers say back to a guest now and then. */
export const ANSWERS: readonly Words[] = [
  { en: 'Hi! Good to see you on the island 👋', es: '¡Hola! Qué bueno verte por la isla 👋' },
  { en: 'Grab a seat, the mate is going round 🧉', es: 'Sentate, que el mate está girando 🧉' },
  { en: 'Ha, good one 😄', es: 'Jaja, buenísimo 😄' },
  { en: 'Tell us more!', es: '¡Contá más!' },
  { en: 'Agreed 🙌', es: 'Coincido 🙌' },
  { en: 'Have you tried the parrilla yet? 🔥', es: '¿Ya probaste la parrilla? 🔥' },
  { en: 'Welcome! Make yourself at home', es: '¡Bienvenida la visita! Sentite como en casa' },
];

// ── turning the script into events ──────────────────────────────────────

/** A small seeded random (mulberry32): the same seed, the same village. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Who plays roles 0–2 of thread `index` in loop `cycle`: the house's own first, then others, rotating. */
export function castFor(thread: Thread, index: number, cycle = 0, npcs: readonly GuestNpc[] = NPCS): string[] {
  const own = npcs.filter((n) => n.home === thread.house);
  const others = npcs.filter((n) => n.home !== thread.house)
    .sort((a, b) => hashStr(`${a.pubkey}:${index}:${cycle}`) - hashStr(`${b.pubkey}:${index}:${cycle}`));
  const rot = own.length ? (index + cycle) % own.length : 0;
  const pool = [...own.slice(rot), ...own.slice(0, rot), ...others].map((n) => n.pubkey);
  return [...new Set(pool)].slice(0, 3);
}

/** A local event: a hashed id (unique by `seq`), no signature. */
export function guestEvent(kind: number, pubkey: string, content: string, tags: string[][], createdAt: number, seq: string): NostrEvent {
  const ev = { kind, pubkey, content, tags: [...tags, ['sky-guest', seq]], created_at: createdAt };
  return { ...ev, id: getEventHash(ev), sig: '' };
}

/** The houses as kind 39000 metadata. */
export function houseMetas(lang: Lang, at: number): NostrEvent[] {
  return HOUSES.map((h) => guestEvent(39000, '0'.repeat(64), '', [
    ['d', houseGroupId(h.id)], ['name', h.name[lang]], ['about', h.about[lang]], ['public'], ['open'],
    ...(h.voice ? [['t', 'voice']] : []),
  ], at, `meta:${h.id}`));
}

/** One played line: the kind 9, and its reactions a little later. */
export interface Beat { ev: NostrEvent; reactions: NostrEvent[] }

/**
 * Thread `index` as events, its first line at `start`, `gap(i)` seconds
 * between lines (reactions follow their line by a few seconds). `cycle` keeps
 * ids unique and changes who says what.
 */
export function playThread(index: number, start: number, lang: Lang, cycle = 0, gap: (i: number) => number = () => 60, npcs: readonly GuestNpc[] = NPCS): Beat[] {
  const thread = THREADS[index];
  const cast = castFor(thread, index, cycle, npcs);
  const group = houseGroupId(thread.house);
  const out: Beat[] = [];
  let at = start;
  thread.lines.forEach((line, i) => {
    if (i) at += Math.max(1, Math.round(gap(i)));
    const pk = cast[line.by % cast.length];
    const tags: string[][] = [['h', group]];
    const parent = line.re !== undefined ? out[line.re]?.ev : undefined;
    if (parent) tags.push(['e', parent.id, '', 'reply'], ['p', parent.pubkey]);
    const ev = guestEvent(9, pk, line.t[lang], tags, at, `${cycle}:${index}:${i}`);
    const reactions = (line.react ?? []).map(([by, emoji], j) => {
      const who = cast[by % cast.length];
      return guestEvent(7, who, emoji, [['e', ev.id], ['p', ev.pubkey], ['h', group]], at + 3 + j * 2, `${cycle}:${index}:${i}:r${j}`);
    }).filter((r) => r.pubkey !== ev.pubkey);
    out.push({ ev, reactions });
  });
  return out;
}

/** How long the snapshot's past reaches back. */
export const GUEST_HISTORY_S = 6 * 3600;

/**
 * The guest island as it is at `now`: every house, and every thread played
 * once over the last few hours, the latest few within the last twenty
 * minutes (so the village wakes up mid-conversation). Deterministic for a
 * given `now`, `lang` and `seed`.
 */
export function guestHistory(now: number, lang: Lang, seed = 1): NostrEvent[] {
  const rnd = seeded(seed);
  const order = THREADS.map((_, i) => i).sort(() => rnd() - 0.5);
  const out: NostrEvent[] = houseMetas(lang, now - GUEST_HISTORY_S - 60);
  // Older threads spread over the window; the last three close to now.
  const n = order.length;
  order.forEach((ti, k) => {
    const recent = k >= n - 3;
    const start = recent
      ? now - (n - k) * 6 * 60 - 120
      : now - GUEST_HISTORY_S + Math.floor((k / Math.max(1, n - 3)) * (GUEST_HISTORY_S - 30 * 60));
    for (const b of playThread(ti, start, lang, 0, () => 20 + rnd() * 70)) out.push(b.ev, ...b.reactions);
  });
  return out.filter((e) => e.created_at <= now);
}

/** Feed events into a state (metas first, then messages and reactions by time). */
export function ingestAll(state: SkyState, events: readonly NostrEvent[]): void {
  for (const e of events) if (e.kind === 39000) state.ingestGroupMeta(e);
  const rest = events.filter((e) => e.kind !== 39000).sort((a, b) => a.created_at - b.created_at || a.kind - b.kind);
  for (const e of rest) {
    if (e.kind === 9) state.ingestMessage(e);
    else if (e.kind === 7) state.ingestReaction(e);
  }
}

/** The snapshot a fresh guest village opens with (`relay`: shown as where you are). */
export function buildGuestSnapshot(now: number, lang: Lang, relay = 'guest', seed = 1): Extract<ServerMsg, { t: 'snapshot' }> {
  const state = new SkyState(() => {}, () => now);
  ingestAll(state, guestHistory(now, lang, seed));
  return state.snapshot(relay) as Extract<ServerMsg, { t: 'snapshot' }>;
}
