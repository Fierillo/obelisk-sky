// Favourite places ("haunts"): up to three spots a person's character
// hangs around when the village animates them on its own. Chosen in the
// look editor and saved with the avatar event (nostr/avatars.ts); a guest
// island can also give its scripted people some (World.setHaunts).
//
// `pickIdle` is the roll World.idleLife makes when someone has stood idle
// long enough: with haunts, about two rolls in three go to one of them;
// the rest (and a haunt that has no free seat right now) fall through to
// the village's usual idle roll.

export const PLACE_IDS = [
  'coffee', 'parrilla', 'nostrwot', 'lacrypta', 'campfire', 'pond', 'plaza', 'park', 'track', 'gym', 'market', 'home',
] as const;

export type PlaceId = (typeof PLACE_IDS)[number];

export const MAX_HAUNTS = 3;

/** Share of idle rolls that go to a haunt (when one fits the hour). */
export const HAUNT_SHARE = 0.65;

/** Below this roll, someone with a home goes indoors at night (as without haunts). */
export const NIGHT_HOME_ROLL = 0.35;

/** Relay content in, a clean list out: known ids, no repeats, at most three. */
export function parseHaunts(x: unknown): PlaceId[] {
  if (!Array.isArray(x)) return [];
  const out: PlaceId[] = [];
  for (const v of x) {
    if (typeof v !== 'string' || !(PLACE_IDS as readonly string[]).includes(v) || out.includes(v as PlaceId)) continue;
    out.push(v as PlaceId);
    if (out.length === MAX_HAUNTS) break;
  }
  return out;
}

/** Add `id` to a choice of haunts, or take it off; a fourth replaces the oldest. */
export function toggleHaunt(list: readonly PlaceId[], id: PlaceId): PlaceId[] {
  if (list.includes(id)) return list.filter((x) => x !== id);
  return [...list, id].slice(-MAX_HAUNTS);
}

export interface IdleContext {
  haunts: readonly PlaceId[];
  /** The café's hours: by day only. */
  daylight: boolean;
  night: boolean;
  hasHome: boolean;
}

/**
 * One idle roll. `roll` drives the village's usual choice; `haunt`, when
 * set, is tried first. At night someone with a home still goes in as often
 * as before; the café is closed after dark; home needs a home.
 */
export function pickIdle(rng: () => number, ctx: IdleContext): { roll: number; haunt: PlaceId | null } {
  const roll = rng();
  if (!ctx.haunts.length) return { roll, haunt: null };
  if (ctx.night && ctx.hasHome && roll < NIGHT_HOME_ROLL) return { roll, haunt: null };
  const open = ctx.haunts.filter((h) => (h !== 'coffee' || ctx.daylight) && (h !== 'home' || ctx.hasHome));
  if (!open.length || rng() >= HAUNT_SHARE) return { roll, haunt: null };
  return { roll, haunt: open[Math.min(open.length - 1, Math.floor(rng() * open.length))] };
}
