// Mentions and replies: what pings you, and when it counts as read. The
// rules are obelisk-dex's (services/notifications/classify.ts and its
// read-state): a reply to you, or you named in the content or a `p` tag;
// your own messages never ping. A ping is read once its channel has been
// read past it, or once "Mark all read" moved the mention cursor past it.

import type { WireMessage } from './wire';
import { mentionedPubkeys } from './sanitize';

export type PingReason = 'reply' | 'mention';

export function pingReason(m: Pick<WireMessage, 'pubkey' | 'replyTo' | 'content' | 'mentions'>, me: string): PingReason | null {
  if (m.pubkey === me) return null;
  if (m.replyTo === me) return 'reply';
  if (m.mentions?.includes(me)) return 'mention';
  if (m.content && mentionedPubkeys(m.content).includes(me)) return 'mention';
  return null;
}

/** The read cursors a ping is measured against (ms). */
export interface PingCursors { channel(groupId: string): number; mentionsReadAt: number }

/** Still unread: newer than both its channel's cursor and the mention cursor. */
export function pingOpen(m: Pick<WireMessage, 'groupId' | 'createdAt'>, c: PingCursors): boolean {
  const at = m.createdAt * 1000;
  return at > c.channel(m.groupId) && at > c.mentionsReadAt;
}

/** Every unread ping for `me`, newest first. */
export function openPings(msgs: Iterable<WireMessage>, me: string, c: PingCursors): { m: WireMessage; reason: PingReason }[] {
  const out: { m: WireMessage; reason: PingReason }[] = [];
  for (const m of msgs) {
    if (!pingOpen(m, c)) continue;
    const reason = pingReason(m, me);
    if (reason) out.push({ m, reason });
  }
  return out.sort((a, b) => b.m.createdAt - a.m.createdAt);
}

/** What a ping says: "Ana mentioned you in #general". */
export function pingTitle(sender: string, reason: PingReason, channel: string | null): string {
  const what = reason === 'reply' ? 'replied to you' : 'mentioned you';
  return channel ? `${sender} ${what} in #${channel}` : `${sender} ${what}`;
}
