// Forums, as obelisk-dex has them (components/chat/forum/ForumView.tsx): a
// forum channel holds publications ("threads"), each a NIP-29 group of its
// own pinned to it by a `["parent", forumId]` tag. A thread is never a
// channel by itself: it has no house, no row in the channel list; its posts
// count at its forum, and the forum's chat lists its threads. Pure.

import type { WireGroup, WireMessage } from './wire';

/** The forum `g` is a thread of, if any. */
export function forumOf(g: WireGroup | undefined, byId: ReadonlyMap<string, WireGroup>): string | null {
  const parent = g?.parent ? byId.get(g.parent) : undefined;
  return parent && parent.kind === 'forum' && parent.id !== g!.id ? parent.id : null;
}

/** Where a group's talk happens in the village: its forum for a thread, else itself. */
export function homeOf(id: string, byId: ReadonlyMap<string, WireGroup>): string {
  return forumOf(byId.get(id), byId) ?? id;
}

/** The channels the village draws (every group but forum threads). */
export function channelsOnly(groups: readonly WireGroup[]): WireGroup[] {
  const byId = new Map(groups.map((g) => [g.id, g]));
  return groups.filter((g) => !forumOf(g, byId));
}

export interface ThreadSummary {
  group: WireGroup;
  /** The opening post and the latest one. */
  first: WireMessage;
  last: WireMessage;
  count: number;
}

/** A forum's threads, latest activity first. As in obelisk-dex, a thread nobody has written in yet isn't listed. */
export function forumThreads(forumId: string, groups: readonly WireGroup[], msgsOf: (id: string) => readonly WireMessage[]): ThreadSummary[] {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const out: ThreadSummary[] = [];
  for (const g of groups) {
    if (forumOf(g, byId) !== forumId) continue;
    const msgs = msgsOf(g.id);
    if (!msgs.length) continue;
    out.push({ group: g, first: msgs[0], last: msgs[msgs.length - 1], count: msgs.length });
  }
  return out.sort((a, b) => b.last.createdAt - a.last.createdAt);
}
