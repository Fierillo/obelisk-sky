// The village's sanitized event shapes: what feed.ts hands the world.
// Nothing here carries raw tags or raw content.

import type { ChannelKind } from './groups';

export interface WireGroup {
  id: string;
  name: string;
  about: string;
  kind: ChannelKind;
  open?: boolean;
  /** The group it hangs under (`parent` tag): a forum's thread when that is a forum (nostr/forum.ts). */
  parent?: string | null;
}

export interface WireProfile {
  pubkey: string;
  name: string;
  /** The kind 0 picture (https only), or null. */
  avatar: string | null;
  nip05: string | null;
  /** Lightning address (kind 0 `lud16`), for zaps. */
  lud16?: string | null;
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
  /** A zap bot's announcement: shown in the chat; its zap is the marker's or receipt's, or its own if neither comes. */
  zapNote?: boolean;
  /** Everyone it names: `nostr:` mentions in the content and `p` tags (a ping, like obelisk-dex). */
  mentions?: string[];
  /** obelisk-dex's voice note (its `voice` tag): drawn as its voice player with the length. */
  voiceNote?: { url: string; durationSeconds: number };
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
  /** The zapped message, or null for a zap to a person. */
  targetId: string | null;
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
  | { t: 'zap'; zap: WireZap }
  | { t: 'zap-removed'; id: string; targetId: string | null };
