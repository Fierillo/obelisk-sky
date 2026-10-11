// A ronda de mate: people sharing a bench share one mate. Whoever sits in the
// middle is the cebador. It goes to each of the others in turn and comes back
// to the cebador between them, so every pass is between neighbours. Pure: the
// world moves the mate from hand to hand (world.ts `updateRounds`).

/** The holder sips (Character's sip starts at once), then rests a moment. */
export const SIP_TIME = 3.6;
/** Handing it over: arms out, the mate changes hands halfway, arms back. */
export const PASS_TIME = 1.2;

export interface Round {
  cebador: string;
  holder: string;
  /** The guest who had it last (the next one after them is served next). */
  lastGuest: string | null;
  phase: 'sip' | 'pass';
  t: number;
  /** Being passed to (phase 'pass'). */
  to: string | null;
}

/** The cebador: the middle of the bench (`seated` in seat order). */
export function cebadorOf(seated: readonly string[]): string {
  return seated[Math.floor((seated.length - 1) / 2)];
}

/** Who gets the mate after `r.holder`: back to the cebador, or the guest after the last one. */
export function nextHolder(r: Pick<Round, 'cebador' | 'holder' | 'lastGuest'>, seated: readonly string[]): string {
  if (r.holder !== r.cebador && seated.includes(r.cebador)) return r.cebador;
  const guests = seated.filter((pk) => pk !== r.cebador);
  if (!guests.length) return r.cebador;
  const i = r.lastGuest ? guests.indexOf(r.lastGuest) : -1;
  return guests[(i + 1) % guests.length];
}

/**
 * Advance the round on a bench where `seated` (in seat order) sit. Fewer
 * than two: no round (each has their own mate). People getting up or sitting
 * down mid-round are taken in their stride.
 */
export function stepRound(r: Round | null, seated: readonly string[], dt: number): Round | null {
  if (seated.length < 2) return null;
  const cebador = cebadorOf(seated);
  // The giver got up just after handing it over: the taker simply has it.
  if (r && !seated.includes(r.holder) && r.phase === 'pass' && r.to && seated.includes(r.to) && r.t >= PASS_TIME / 2) {
    return { cebador, holder: r.to, lastGuest: r.to !== cebador ? r.to : r.lastGuest, phase: 'sip', t: 0, to: null };
  }
  if (!r || !seated.includes(r.holder)) {
    // A new round, or the holder got up with it: the cebador starts again.
    return { cebador, holder: cebador, lastGuest: null, phase: 'sip', t: 0, to: null };
  }
  let next: Round = { ...r, cebador };
  next.t += dt;
  if (next.phase === 'pass' && (!next.to || !seated.includes(next.to))) {
    // They left before taking it: offer it to whoever is next instead.
    next = { ...next, to: nextHolder(next, seated), t: Math.min(next.t, PASS_TIME / 2) };
  }
  if (next.phase === 'sip' && next.t >= SIP_TIME) {
    next = { ...next, phase: 'pass', t: 0, to: nextHolder(next, seated) };
  } else if (next.phase === 'pass' && next.t >= PASS_TIME) {
    const to = next.to!;
    next = { ...next, holder: to, lastGuest: to !== next.cebador ? to : next.lastGuest, phase: 'sip', t: 0, to: null };
  }
  return next;
}

/** Who has the mate in hand right now (it changes hands halfway through a pass). */
export function carrierOf(r: Round): string {
  return r.phase === 'pass' && r.to && r.t >= PASS_TIME / 2 ? r.to : r.holder;
}

/** How far the giver and the taker reach toward each other (0..1..0 over a pass). */
export function reachOf(r: Round): number {
  if (r.phase !== 'pass') return 0;
  return Math.sin(Math.PI * Math.min(1, r.t / PASS_TIME));
}
