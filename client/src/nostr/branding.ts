// How a relay presents itself: its operator's branding (obelisk-dex's
// kind 30078 `obelisk:branding:<relay>`, trusted from the NIP-11 operator
// only: tags icon, banner, name, description), else its NIP-11 name and
// icon, else its favicon.

import type { Event as NostrEvent } from 'nostr-tools';
import type { RelayHub } from '@nostr-wot/relay/hub';
import { fetchRelayInfo, faviconFor, operatorPubkeyFromRelayInfo } from '@/services/relay/relay-info';

export interface RelayIdentity { name: string | null; icon: string | null }

/** The branding tags, as obelisk-dex reads them (services/relay/relay-branding.ts). */
export function parseBranding(ev: NostrEvent): { icon: string; name: string } {
  let icon = '', name = '';
  for (const t of ev.tags) {
    if (t[0] === 'icon' && typeof t[1] === 'string') icon = t[1];
    else if (t[0] === 'name' && typeof t[1] === 'string') name = t[1];
  }
  return { icon, name };
}

const https = (u: string | null | undefined): string | null => (u && /^https:\/\/[^\s]+$/i.test(u) ? u : null);

/** Name and icon for `relay`: the operator's branding first, then NIP-11, then the favicon. */
export async function relayIdentity(hub: RelayHub, relay: string): Promise<RelayIdentity> {
  const info = await fetchRelayInfo(relay).catch(() => null);
  let name = info?.name?.trim() || null;
  let icon = https(info?.icon) ?? https(faviconFor(relay));
  const op = operatorPubkeyFromRelayInfo(info);
  if (op) {
    const r = await hub.query({ relays: [relay], filters: [{ kinds: [30078], authors: [op], '#d': [`obelisk:branding:${relay}`] }], maxWaitMs: 4000, label: 'sky-branding' }).catch(() => null);
    const ev = r?.events.filter((e) => e.pubkey === op).sort((a, b) => b.created_at - a.created_at)[0];
    if (ev) {
      const b = parseBranding(ev);
      name = b.name.trim() || name;
      icon = https(b.icon) ?? icon;
    }
  }
  return { name: name ? name.slice(0, 40) : null, icon };
}
