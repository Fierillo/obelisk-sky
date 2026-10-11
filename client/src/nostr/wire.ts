// The village's sanitized event shapes: what feed.ts hands the world.
// Nothing here carries raw tags or raw content.

import type { ChannelKind } from './groups';

export interface WireGroup {
  id: string;
  name: string;
  about: string;
  kind: ChannelKind;
  open?: boolean;
}

export interface WireProfile {
  pubkey: string;
  name: string;
  /** The kind 0 picture (https only), or null. */
  avatar: string | null;
  nip05: string | null;
  /** False while the kind 0 hasn't arrived (`name` is then a short npub). */
  loaded?: boolean;
}

export interface WireMessage {
  id: string;
  pubkey: string;
  groupId: string;
  text: string;
  /** The raw content, for the chat panel's renderer (bubbles use `text`). */
  content?: string;
  /** Image URLs announced in NIP-92 `imeta` tags. */
  images?: string[];
  /** NIP-30 custom emoji: shortcode → https URL. */
  emojis?: Record<string, string>;
  /** Author of the message this one replies to, when known. */
  replyTo: string | null;
  replyToId: string | null;
  createdAt: number;
}

export interface WireReaction {
  id: string;
  pubkey: string;
  target: string;
  targetId: string;
  groupId: string;
  emoji: string;
  createdAt: number;
}

export interface WireZap {
  id: string;
  from: string | null;
  target: string;
  targetId: string;
  groupId: string;
  sats: number;
  createdAt: number;
}

export type ServerMsg =
  | {
      t: 'snapshot';
      relay: string;
      groups: WireGroup[];
      profiles: WireProfile[];
      messages: WireMessage[];
      reactions: WireReaction[];
      zaps: WireZap[];
      now: number;
    }
  | { t: 'group'; group: WireGroup }
  | { t: 'group-removed'; id: string }
  | { t: 'profile'; profile: WireProfile }
  | { t: 'msg'; msg: WireMessage }
  | { t: 'msg-removed'; id: string; groupId: string }
  | { t: 'reaction-removed'; id: string; targetId: string }
  | { t: 'reaction'; reaction: WireReaction }
  | { t: 'zap'; zap: WireZap };
