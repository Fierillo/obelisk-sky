// Emotes: things you do on the spot: dance, sit in the lotus pose, do
// push-ups or jumping jacks, nod, shake your head, fold your arms, crouch,
// or raise two knives and bleed ("Sangreee...", world/sangre.ts).
// They play while you stand still and stop as soon as you move. Yours goes
// out with your live movement (nostr/motion.ts `e`; a remote signer's as an
// activity, nostr/activity.ts `here:`), so everyone in the village sees it.

import type { EmoteClipKind } from './anim/exercises';

export type EmoteKind = 'groove' | 'dance' | 'lotus' | 'pushup' | 'jacks' | 'yes' | 'no' | 'arms' | 'crouch' | 'sangre';

export interface Emote {
  kind: EmoteKind;
  label: string;
  icon: string;
  /** Lower and upper body clips (people.ts' library); built ones are made per body instead (`built`). */
  lower: string;
  upper: string;
  /** Built from key poses for each body's skeleton (anim/exercises.ts), named `builtClipName`. */
  built?: EmoteClipKind | 'pushup';
  /** Music while it plays, heard by people near (audio/emoteMusic.ts). */
  music?: boolean;
  /** A sound (public/sounds/<file>) heard by people near, restarted every `every`
   *  seconds in time with the clip's rounds (audio/emoteMusic.ts emoteSounds). */
  sound?: { file: string; every: number };
  /** Seconds before it ends on its own (a nod); none: until you move. */
  seconds?: number;
  /** Sitting on the ground: the clip carries the body's height, so no sole lift. */
  grounded?: boolean;
  /** Kept in step on every screen, by the wall clock (Date.now, which devices keep
   *  within a fraction of a second): 'grid' plays every dancer from one shared
   *  beat (the music's bar grid too); 'leader' plays from whoever began first
   *  within EMOTE_SYNC_M. Others play from their own start. */
  sync?: 'grid' | 'leader';
}

export const EMOTES: readonly Emote[] = [
  { kind: 'groove', label: 'Dance', icon: '🕺', lower: 'groove', upper: 'groove', built: 'groove', grounded: true, music: true, sync: 'grid' },
  { kind: 'dance', label: 'Dance 2', icon: '💃', lower: 'Dance_Loop', upper: 'Dance_Loop', music: true, sync: 'grid' },
  { kind: 'lotus', label: 'Lotus', icon: '🧘', lower: 'lotus', upper: 'lotus', built: 'lotus', grounded: true, music: true, sync: 'grid' },
  { kind: 'pushup', label: 'Push-ups', icon: '💪', lower: 'pushup', upper: 'pushup', built: 'pushup', grounded: true, music: true, sync: 'grid' },
  { kind: 'jacks', label: 'Jumping jacks', icon: '🤸', lower: 'jacks', upper: 'jacks', built: 'jacks', grounded: true, music: true, sync: 'grid' },
  { kind: 'yes', label: 'Nod', icon: '👍', lower: 'Idle_Loop', upper: 'Yes', seconds: 2.4 },
  { kind: 'no', label: 'No', icon: '🙅', lower: 'Idle_Loop', upper: 'Idle_No_Loop', seconds: 3 },
  { kind: 'arms', label: 'Arms folded', icon: '🙎', lower: 'Idle_Loop', upper: 'Idle_FoldArms_Loop' },
  { kind: 'crouch', label: 'Crouch', icon: '🧎', lower: 'Crouch_Idle_Loop', upper: 'Crouch_Idle_Loop' },
  { kind: 'sangre', label: 'Sangreee...', icon: '🔪', lower: 'sangre', upper: 'sangre', built: 'sangre', sound: { file: 'sangre.mp3', every: 7 }, sync: 'leader' },
];

/** People doing the same 'leader' emote this close keep one beat (and share one music loop). */
export const EMOTE_SYNC_M = 6;

/**
 * The wall-clock time (ms) a body's emote counts its rounds from: 0 for the
 * shared grid; for 'leader', the earliest start among those `near` doing the
 * same; else its own start. Null: no sync (plays from when it began here).
 */
export function emoteAnchor(e: Emote, since: number, near: readonly (number | null)[]): number | null {
  if (e.sync === 'grid') return 0;
  if (e.sync !== 'leader') return null;
  return near.reduce<number>((a, b) => (b !== null && b < a ? b : a), since);
}

/** Where a looping clip of `duration` seconds is at wall time `now` (ms), counted from `anchor` (ms). */
export function clipPhase(now: number, anchor: number, duration: number): number {
  const t = (now - anchor) / 1000;
  return ((t % duration) + duration) % duration;
}

export const EMOTE_KINDS = new Set<string>(EMOTES.map((e) => e.kind));

export function emoteOf(kind: string | null | undefined): Emote | null {
  return EMOTES.find((e) => e.kind === kind) ?? null;
}

/** A built emote's clip for one body (the skeletons differ, so it's built per body). */
export function builtClipName(built: string, body: string): string {
  return `emote-${built}:${body}`;
}
