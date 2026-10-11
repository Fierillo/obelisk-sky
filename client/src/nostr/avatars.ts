// Your 3D look in the village: body, hat and pet.
//
// Replaceable kind 30078, d=`obelisk:avatar3d:v1` (no other obelisk d-tag
// collides), JSON content, published to the group relay so everyone there
// sees it. Everything read from a relay goes through `parseAvatar`: unknown
// fields are dropped, every value is checked against a fixed list, names
// are clipped. A person without one wears the look their pubkey picks.
// v2 carries a full look for the Quaternius people (people/people.ts); v1
// (a Kenney skin letter) still parses and maps to a stable look.

import type { Event as NostrEvent, EventTemplate } from 'nostr-tools';
import type { RelayHub } from '@nostr-wot/relay/hub';
import { activeRelay } from './hub';
import { parseLook, type PersonLook } from '../people/people';

export const AVATAR_D_TAG = 'obelisk:avatar3d:v1';

export const SKINS = 'abcdefghijklmnopqr'.split('');
export const HATS = ['none', 'cap', 'beanie', 'tophat', 'crown', 'headband', 'boina'] as const;
export const PETS = [
  'beaver', 'bee', 'bunny', 'caterpillar', 'cat', 'chick', 'cow', 'crab', 'deer', 'dog', 'elephant', 'fish',
  'fox', 'giraffe', 'hog', 'koala', 'lion', 'monkey', 'panda', 'parrot', 'penguin', 'pig', 'polar', 'tiger',
] as const;
export const HAT_COLORS = ['#b4f953', '#ff4d5e', '#38bdf8', '#fbbf24', '#c084fc', '#f472b6', '#fafafa', '#171717'] as const;

export type Hat = (typeof HATS)[number];
export type PetKind = (typeof PETS)[number];

export interface Avatar {
  /** 1: a blocky skin letter only; 2: a full look (body, hair, clothes). */
  v: 1 | 2;
  /** v1's skin letter, kept so a v1 avatar maps to the same look every time. */
  skin: string;
  look: PersonLook | null;
  hat: Hat;
  hatColor: string;
  pet: { kind: PetKind; name: string } | null;
}

export const DEFAULT_AVATAR: Avatar = { v: 1, skin: 'a', look: null, hat: 'none', hatColor: HAT_COLORS[0], pet: null };

const oneOf = <T extends string>(list: readonly T[], v: unknown, fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);

/** Strict parse of relay content; null when it isn't an avatar at all. */
export function parseAvatar(content: string): Avatar | null {
  let j: Record<string, unknown>;
  try { j = JSON.parse(content); } catch { return null; }
  if (!j || typeof j !== 'object' || (j.v !== 1 && j.v !== 2)) return null;
  const look = j.v === 2 ? parseLook(j.look) : null;
  if (j.v === 2 && !look) return null;
  const petRaw = j.pet as Record<string, unknown> | null | undefined;
  const pet = petRaw && typeof petRaw === 'object' && (PETS as readonly string[]).includes(petRaw.kind as string)
    ? { kind: petRaw.kind as PetKind, name: cleanPetName(petRaw.name) }
    : null;
  return {
    v: look ? 2 : 1,
    skin: oneOf(SKINS, j.skin, 'a'),
    look,
    hat: oneOf(HATS, j.hat, 'none'),
    hatColor: oneOf(HAT_COLORS, j.hatColor, HAT_COLORS[0]),
    pet,
  };
}

export function cleanPetName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return [...raw.replace(/[\u0000-\u001f\u007f​-‏‪-‮]/g, '').trim()].slice(0, 24).join('');
}

export function avatarTemplate(a: Avatar, prevCreatedAt = 0): EventTemplate {
  return {
    kind: 30078,
    tags: [['d', AVATAR_D_TAG]],
    content: JSON.stringify(a.look
      ? { v: 2, skin: a.skin, look: a.look, hat: a.hat, hatColor: a.hatColor, pet: a.pet }
      : { v: 1, skin: a.skin, hat: a.hat, hatColor: a.hatColor, pet: a.pet }),
    created_at: Math.max(Math.floor(Date.now() / 1000), prevCreatedAt + 1),
  };
}

/** Avatars for the people in the village, fetched in batches as they appear. */
export class AvatarStore {
  private byPk = new Map<string, { a: Avatar; at: number }>();
  private asked = new Set<string>();
  private listeners = new Set<(pk: string, a: Avatar) => void>();

  constructor(private hub: RelayHub) {}

  onChange(cb: (pk: string, a: Avatar) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  get(pk: string): Avatar | null {
    return this.byPk.get(pk)?.a ?? null;
  }

  createdAt(pk: string): number {
    return this.byPk.get(pk)?.at ?? 0;
  }

  ingest(ev: NostrEvent): void {
    if (ev.kind !== 30078 || !ev.tags.some((t) => t[0] === 'd' && t[1] === AVATAR_D_TAG)) return;
    const prev = this.byPk.get(ev.pubkey);
    if (prev && prev.at >= ev.created_at) return;
    const a = parseAvatar(ev.content);
    if (!a) return;
    this.byPk.set(ev.pubkey, { a, at: ev.created_at });
    for (const l of this.listeners) l(ev.pubkey, a);
  }

  /** Ask the relay for anyone we haven't asked about yet. */
  want(pubkeys: Iterable<string>): void {
    const fresh = [...pubkeys].filter((p) => !this.asked.has(p)).slice(0, 200);
    if (!fresh.length) return;
    for (const p of fresh) this.asked.add(p);
    void this.hub.query({
      relays: [activeRelay()],
      filters: [{ kinds: [30078], authors: fresh, '#d': [AVATAR_D_TAG] }],
      maxWaitMs: 5000,
      label: 'sky-avatars',
    }).then((r) => { for (const ev of r.events) this.ingest(ev); }).catch(() => {});
  }
}
