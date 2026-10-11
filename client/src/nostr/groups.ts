// NIP-29 group metadata (kind 39000) → what sky is allowed to show.
//
// public.obelisk.ar is whitelist-gated, so this proxy is the only thing
// standing between its content and the open web. A channel is shown only
// when it, and every parent above it, is neither `private` nor `hidden`.
// Parsing mirrors obelisk-dex `parseGroupMetadataTags` so "public" means
// the same thing here as in the app.

export type ChannelKind = 'text' | 'forum' | 'voice' | 'voice-sfu';

export interface GroupMeta {
  id: string;
  name: string;
  about: string;
  parent: string | null;
  kind: ChannelKind;
  isPublic: boolean;
  isHidden: boolean;
  /** NIP-29 `open` (default) vs `closed`: closed rooms gate voice to members. */
  isOpen: boolean;
  createdAt: number;
}

export function parseGroupMeta(tags: string[][], createdAt = 0): GroupMeta | null {
  let id: string | undefined;
  let name: string | undefined;
  let about: string | undefined;
  let parent: string | undefined;
  let isPublic = true;
  let isHidden = false;
  let isOpen = true;
  let voiceSfu = false;
  let voice = false;
  let forum = false;
  for (const t of tags) {
    const [k, v] = t;
    if (k === 'd') { if (id === undefined) id = v; continue; }
    if (k === 'name') { if (name === undefined) name = v; continue; }
    if (k === 'about') { if (about === undefined) about = v; continue; }
    if (k === 'parent') { if (parent === undefined) parent = v; continue; }
    if (k === 'public') { isPublic = true; continue; }
    if (k === 'private') { isPublic = false; continue; }
    if (k === 'hidden') { isHidden = true; continue; }
    if (k === 'open') { isOpen = true; continue; }
    if (k === 'closed') { isOpen = false; continue; }
    if (k === 't') {
      if (v === 'voice-sfu') voiceSfu = true;
      else if (v === 'voice') voice = true;
      else if (v === 'forum') forum = true;
    }
  }
  if (!id) return null;
  return {
    id,
    name: (name || id).slice(0, 48),
    about: (about || '').slice(0, 200),
    parent: parent || null,
    kind: voiceSfu ? 'voice-sfu' : voice ? 'voice' : forum ? 'forum' : 'text',
    isPublic,
    isHidden,
    isOpen,
    createdAt,
  };
}

/** True when the group and its whole parent chain may be shown. A parent we
 *  have not seen metadata for counts as not visible — fail closed. */
export function isVisible(id: string, groups: ReadonlyMap<string, GroupMeta>): boolean {
  const seen = new Set<string>();
  let cur: string | null = id;
  while (cur) {
    if (seen.has(cur)) return false; // parent cycle
    seen.add(cur);
    const g = groups.get(cur);
    if (!g || !g.isPublic || g.isHidden) return false;
    cur = g.parent;
  }
  return true;
}
