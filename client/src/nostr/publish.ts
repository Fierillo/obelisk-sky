// Group publishing, with the exact event shapes obelisk-dex main writes
// (src/services/nostr-bridge/groups/message/send.ts, reactions.ts,
// membership/membership-commands.ts), so a message sent from the village is
// indistinguishable from one sent in the app.

import type { EventTemplate, VerifiedEvent } from 'nostr-tools';
import type { RelayHub } from '@nostr-wot/relay/hub';
import { extractMentionPubkeysFromMessage } from '@/utils/message-text/mentions';
import { activeRelay } from './hub';
import { guestAuthor, isGuest, localEvent } from './guest';

const now = () => Math.floor(Date.now() / 1000);

export interface ReplyTarget { id: string; pubkey: string }

/** Kind 9: emoji tags, `h`, reply `e`+`p`, then a `p` per mentioned pubkey. */
export function messageTemplate(groupId: string, content: string, replyTo: ReplyTarget | null, emojiTags: string[][] = [], at = now()): EventTemplate {
  const tags: string[][] = [...emojiTags.map((t) => [...t]), ['h', groupId]];
  if (replyTo) {
    tags.push(['e', replyTo.id, '', 'reply']);
    tags.push(['p', replyTo.pubkey]);
  }
  for (const pk of extractMentionPubkeysFromMessage(content, [])) {
    if (!tags.some((t) => t[0] === 'p' && t[1] === pk)) tags.push(['p', pk]);
  }
  return { kind: 9, content, tags, created_at: at };
}

/** Kind 7 on a group message. */
export function reactionTemplate(groupId: string, target: ReplyTarget, emoji: string, at = now()): EventTemplate {
  return { kind: 7, content: emoji || '+', tags: [['e', target.id], ['p', target.pubkey], ['h', groupId]], created_at: at };
}

/** Kind 5 removing one of your own reactions (k=7) or messages (k=9). */
export function deletionTemplate(groupId: string, eventId: string, kind: 7 | 9, at = now()): EventTemplate {
  return {
    kind: 5,
    content: kind === 7 ? 'remove reaction' : 'remove message',
    tags: [['e', eventId], ['k', String(kind)], ['h', groupId]],
    created_at: at,
  };
}

/** Kind 9021: ask to join a closed group. */
export function joinTemplate(groupId: string, at = now()): EventTemplate {
  return { kind: 9021, content: '', tags: [['h', groupId]], created_at: at };
}

export type PublishOutcome =
  | { ok: true; event: VerifiedEvent }
  | { ok: false; event: VerifiedEvent | null; reason: string; needsJoin: boolean };

const ALREADY_MEMBER = /already a member/i;

/**
 * Sign and publish to the group relay. The relay answers `restricted:` to
 * an EVENT that beat AUTH (docs/architecture/data-system.md), so a first
 * `restricted:` is retried once with the hub authenticating first.
 */
export async function publishToGroup(hub: RelayHub, sign: (t: EventTemplate) => Promise<VerifiedEvent>, template: EventTemplate): Promise<PublishOutcome> {
  // The guest island: a local event (no signature), never sent (nostr/guest.ts).
  if (isGuest()) {
    const pk = guestAuthor();
    return pk ? { ok: true, event: localEvent(template, pk) } : { ok: false, event: null, reason: 'guest', needsJoin: false };
  }
  let event: VerifiedEvent;
  try {
    event = await sign(template);
  } catch (e) {
    return { ok: false, event: null, reason: e instanceof Error ? e.message : 'signing failed', needsJoin: false };
  }
  return publishSigned(hub, event);
}

/** Publish an event that is already signed (e.g. your cached look, to a relay
 *  that doesn't have it yet), with the same AUTH retry. */
export async function publishSigned(hub: RelayHub, event: VerifiedEvent): Promise<PublishOutcome> {
  if (isGuest()) return { ok: true, event };
  let [res] = await hub.publish({ relays: [activeRelay()], event });
  if (res?.status === 'rejected' && /^restricted:/i.test(res.reason ?? '')) {
    [res] = await hub.publish({ relays: [activeRelay()], event, authMode: 'auth-first' });
  }
  if (res?.status === 'ok') return { ok: true, event };
  const reason = res?.reason ?? res?.status ?? 'no answer';
  if (event.kind === 9021 && ALREADY_MEMBER.test(reason)) return { ok: true, event };
  return { ok: false, event, reason, needsJoin: /^restricted:/i.test(reason) && /member/i.test(reason) };
}
