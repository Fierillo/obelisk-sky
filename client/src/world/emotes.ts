// Emotes: things you do on the spot: dance, sit in the lotus pose, nod,
// shake your head, fold your arms, crouch. They play while you stand still
// and stop as soon as you move. Yours goes out with your live movement
// (nostr/motion.ts `e`), so everyone in the village sees it.

export type EmoteKind = 'dance' | 'lotus' | 'yes' | 'no' | 'arms' | 'crouch';

export interface Emote {
  kind: EmoteKind;
  label: string;
  icon: string;
  /** Lower and upper body clips (people.ts' library); the lotus pose is built per body (`lotusClipName`). */
  lower: string;
  upper: string;
  /** Seconds before it ends on its own (a nod); none: until you move. */
  seconds?: number;
  /** Sitting on the ground: the clip carries the body's height, so no sole lift. */
  grounded?: boolean;
}

export const EMOTES: readonly Emote[] = [
  { kind: 'dance', label: 'Dance', icon: '💃', lower: 'Dance_Loop', upper: 'Dance_Loop' },
  { kind: 'lotus', label: 'Lotus', icon: '🧘', lower: 'lotus', upper: 'lotus', grounded: true },
  { kind: 'yes', label: 'Nod', icon: '👍', lower: 'Idle_Loop', upper: 'Yes', seconds: 2.4 },
  { kind: 'no', label: 'No', icon: '🙅', lower: 'Idle_Loop', upper: 'Idle_No_Loop', seconds: 3 },
  { kind: 'arms', label: 'Arms folded', icon: '🙎', lower: 'Idle_Loop', upper: 'Idle_FoldArms_Loop' },
  { kind: 'crouch', label: 'Crouch', icon: '🧎', lower: 'Crouch_Idle_Loop', upper: 'Crouch_Idle_Loop' },
];

export const EMOTE_KINDS = new Set<string>(EMOTES.map((e) => e.kind));

export function emoteOf(kind: string | null | undefined): Emote | null {
  return EMOTES.find((e) => e.kind === kind) ?? null;
}

/** The lotus clip for one body (the skeletons differ, so it's built per body). */
export function lotusClipName(body: string): string {
  return `lotus:${body}`;
}
