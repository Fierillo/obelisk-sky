// @/hooks/session/useSession for the re-hosted login modal: login goes to
// sky's SessionManager; a generated key's first profile is published the way
// obelisk-dex does it (src/services/session/login.ts publishGeneratedProfile).

import { finalizeEvent } from 'nostr-tools/pure';
import { getPool, nsecToBytes } from '@nostr-wot/data';
import { randomProfileName } from '@/utils/identity/display-name';
import { getHost } from '../host';

const GENERATED_PROFILE_RELAYS = ['wss://public.obelisk.ar', 'wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.nostr.band', 'wss://purplepag.es'];

interface Draft { name?: string; about?: string; picture?: string; banner?: string }

async function publishGeneratedProfile(nsec: string, profile: Draft): Promise<void> {
  const secretKey = nsecToBytes(nsec);
  if (!secretKey) return;
  const name = profile.name?.trim() || randomProfileName();
  const content = {
    name,
    display_name: name,
    ...(profile.about ? { about: profile.about } : {}),
    ...(profile.picture ? { picture: profile.picture } : {}),
    ...(profile.banner ? { banner: profile.banner } : {}),
  };
  const event = finalizeEvent({ kind: 0, created_at: Math.floor(Date.now() / 1000), tags: [], content: JSON.stringify(content) }, secretKey);
  try { await Promise.allSettled(getPool().publish(GENERATED_PROFILE_RELAYS, event)); } catch { /* non-fatal */ }
}

export function useSessionActions() {
  return {
    login: (args: unknown) => getHost().login(args),
    publishGeneratedProfile,
    logout: () => {},
  };
}

export function useSessionNotice(): null {
  return null;
}

export function useMyPubkey(): string | null {
  return getHost().pubkey();
}

export function useIsLoggedIn(): boolean {
  return !!getHost().pubkey();
}
