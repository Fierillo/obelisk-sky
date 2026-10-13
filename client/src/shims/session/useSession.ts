// @/hooks/session/useSession for the re-hosted login modal: login goes to
// sky's SessionManager; a generated key's first profile is published the way
// obelisk-dex does it (src/services/session/login.ts publishGeneratedProfile);
// the profile editor's save is dex's updateSessionProfile
// (src/services/session/profile.ts) over sky's host.

import { finalizeEvent } from 'nostr-tools/pure';
import { getPool, nsecToBytes } from '@nostr-wot/data';
import { randomProfileName } from '@/utils/identity/display-name';
import { CodedError } from '@/utils/errors/codes';
import type { ProfileFormValues, ProfileUploading } from '@/types/session/profile';
import { uploadToBlossom } from '../blossom';
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

/**
 * Upload the picked picture and banner (Blossom, sky's signer), then merge
 * the fields into your kind 0 through the host. Dropped with an AbortError
 * when the account changes on the way.
 */
export async function updateProfile(values: ProfileFormValues, onUploading?: (which: ProfileUploading) => void): Promise<void> {
  const host = getHost();
  const pubkey = host.pubkey();
  if (!pubkey || !host.editProfile) throw new CodedError('not-logged-in', 'Not logged in');
  const generation = host.generation?.() ?? 0;
  const assertCurrent = () => {
    if (host.pubkey() !== pubkey || (host.generation?.() ?? 0) !== generation) {
      throw new DOMException('Session operation was superseded', 'AbortError');
    }
  };
  try {
    let picture = values.picture.trim();
    let banner = values.banner.trim();
    if (values.pictureFile) {
      onUploading?.('picture');
      picture = await uploadToBlossom(values.pictureFile);
      assertCurrent();
    }
    if (values.bannerFile) {
      onUploading?.('banner');
      banner = await uploadToBlossom(values.bannerFile);
      assertCurrent();
    }
    onUploading?.(null);
    const name = values.name.trim();
    await host.editProfile({
      name, displayName: name, about: values.about.trim(), picture, banner,
      nip05: values.nip05.trim(), lud16: values.lud16.trim(), website: values.website.trim(),
    }, assertCurrent);
  } finally {
    onUploading?.(null);
  }
}

export function useSessionActions() {
  return {
    login: (args: unknown) => getHost().login(args),
    publishGeneratedProfile,
    updateProfile,
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

/** Whether something can sign now: sky's session holds its signer once logged in. */
export function useSignerReady(): boolean {
  return !!getHost().pubkey();
}

export function useSessionGeneration(): number {
  return getHost().generation?.() ?? 0;
}
