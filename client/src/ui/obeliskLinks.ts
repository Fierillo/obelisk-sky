// Links into Obelisk (obelisk.ar) for what Sky only shows: a note to like,
// repost or answer there, a profile to follow. Native interactions are on
// the roadmap (AGENTS.md).

import { nip19 } from 'nostr-tools';

export const OBELISK_URL = 'https://obelisk.ar';

/** A note on Obelisk: its nevent carries the author and up to two relays to find it on. */
export function obeliskNoteUrl(id: string, author: string, relays: readonly string[] = []): string {
  return `${OBELISK_URL}/notes/${nip19.neventEncode({ id, author, relays: relays.slice(0, 2) })}`;
}

/** Someone's profile on Obelisk. */
export function obeliskProfileUrl(pubkey: string): string {
  return `${OBELISK_URL}/p/${nip19.npubEncode(pubkey)}`;
}
