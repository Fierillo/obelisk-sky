// Chat rows render their text with obelisk-dex's message components, one
// small React root per message. The chat panel rebuilds its rows often (new
// messages, reactions, names), so each message's element and root are kept
// and reused: re-rendering only when the message itself changed, and names
// update inside the chips through the profile store on their own.

import { createRoot, type Root } from 'react-dom/client';
import { useChatStore } from '@/store/chat';
import SkyMessageContent from './SkyMessageContent';
import '../obelisk.generated.css';

interface Mounted { el: HTMLElement; root: Root; key: string }

const mounted = new Map<string, Mounted>();

export interface BodyInput {
  id: string;
  content: string;
  groupId: string;
  images: string[];
  emojis: Record<string, string>;
  voiceNote?: { url: string; durationSeconds: number };
  /** The author's picture and the time, shown on a voice note's player. */
  picture?: string | null;
  createdAt?: number;
}

let onGame: ((gameId: string) => void) | undefined;
let onProfile: ((pubkey: string) => void) | undefined;

/** Sky's handlers for a game marker and a mention chip. */
export function setBodyHandlers(h: { onGame?: (id: string) => void; onProfile?: (pk: string) => void }): void {
  onGame = h.onGame;
  onProfile = h.onProfile;
}

// A mention chip calls the app's openProfilePopup: show sky's card instead.
useChatStore.subscribe((s, prev) => {
  if (s.profilePopupPubkey && s.profilePopupPubkey !== prev.profilePopupPubkey) {
    const pk = s.profilePopupPubkey;
    useChatStore.getState().closeProfilePopup();
    onProfile?.(pk);
  }
});

/** imeta images the body doesn't link itself go after it, so they still show. */
export function bodyContent(m: BodyInput): string {
  const extra = m.images.filter((u) => !m.content.includes(u));
  return extra.length ? `${m.content}\n${extra.join('\n')}` : m.content;
}

/** The element showing message `m`'s body (created once, then reused). */
export function messageBodyEl(m: BodyInput): HTMLElement {
  const content = bodyContent(m);
  const key = `${content}\u0000${JSON.stringify(m.emojis)}\u0000${m.voiceNote ? `${m.voiceNote.durationSeconds}|${m.picture ?? ''}` : ''}`;
  let cur = mounted.get(m.id);
  if (!cur) {
    const el = document.createElement('div');
    el.className = 'chat-text dex-body';
    cur = { el, root: createRoot(el), key: '' };
    mounted.set(m.id, cur);
  }
  if (cur.key !== key) {
    cur.key = key;
    cur.root.render(<SkyMessageContent content={content} channelId={m.groupId} customEmojis={m.emojis} voiceNote={m.voiceNote} voiceAuthorPicture={m.picture} voiceTimestamp={m.createdAt} onGame={(id) => onGame?.(id)} />);
  }
  return cur.el;
}

/** Unmount the bodies of messages no longer listed. */
export function pruneBodies(live: ReadonlySet<string>): void {
  for (const [id, cur] of mounted) {
    if (live.has(id)) continue;
    mounted.delete(id);
    // Not during a React render of another root: defer the unmount.
    queueMicrotask(() => cur.root.unmount());
  }
}
