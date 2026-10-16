// Forums, as obelisk-dex has them (components/chat/forum/ForumView.tsx): a
// forum channel holds publications ("threads"), each a NIP-29 group of its
// own pinned to it by a `["parent", forumId]` tag. In the channel list they
// nest under their forum, and the forum's chat lists them. They keep their
// own houses: on a real relay a forum's child can be a whole channel
// (openGym's), not just a thread. Pure.

import type { WireGroup, WireMessage } from './wire';

/** The forum `g` is a thread of, if any. */
export function forumOf(g: WireGroup | undefined, byId: ReadonlyMap<string, WireGroup>): string | null {
  const parent = g?.parent ? byId.get(g.parent) : undefined;
  return parent && parent.kind === 'forum' && parent.id !== g!.id ? parent.id : null;
}

/** The forum a group nests under, else itself. */
export function homeOf(id: string, byId: ReadonlyMap<string, WireGroup>): string {
  return forumOf(byId.get(id), byId) ?? id;
}

/** The channel list's top rows (every group but a forum's children). */
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
