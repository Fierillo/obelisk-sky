// Profiles as a subscribable store, for the re-hosted obelisk-dex message
// components: their `useUserMetadata(pk)` (shims/bridge.ts) reads from here,
// and the first read of an unknown pubkey asks the feed to fetch its kind 0,
// the way the app's `ensureUserMetadata` does. Fed by main.ts from the same
// 'profile' messages that name the characters.

import type { JsUserMetadata } from '@/services/nostr-bridge/common/types';
import type { WireProfile } from './wire';

type Listener = () => void;

const profiles = new Map<string, JsUserMetadata>();
const listeners = new Map<string, Set<Listener>>();
const asked = new Set<string>();
let requester: ((pk: string) => void) | null = null;

/** Who to ask for a missing profile (the feed). */
export function setProfileRequester(fn: ((pk: string) => void) | null): void {
  requester = fn;
  asked.clear();
}

export function putProfile(p: WireProfile): void {
  if (p.loaded === false) return;
  const prev = profiles.get(p.pubkey);
  if (prev && prev.name === p.name && prev.picture === p.avatar && prev.nip05 === p.nip05 && prev.lud16 === (p.lud16 ?? null)) return;
  profiles.set(p.pubkey, {
    pubkey: p.pubkey,
    name: p.name,
    displayName: p.name,
    picture: p.avatar,
    nip05: p.nip05,
    about: null,
    banner: null,
    lud16: p.lud16 ?? null,
    website: null,
  });
  for (const l of listeners.get(p.pubkey) ?? []) l();
}

export function getProfile(pk: string): JsUserMetadata | null {
  const p = profiles.get(pk) ?? null;
  if (!p && requester && !asked.has(pk)) {
    asked.add(pk);
    // Not inside React's render: the feed may emit synchronously.
    queueMicrotask(() => requester?.(pk));
  }
  return p;
}

export function subscribeProfile(pk: string, cb: Listener): () => void {
  let set = listeners.get(pk);
  if (!set) listeners.set(pk, (set = new Set()));
  set.add(cb);
  return () => { set!.delete(cb); if (!set!.size) listeners.delete(pk); };
}

/** Relay switch / logout: names from the old relay don't carry over. */
export function clearProfiles(): void {
  profiles.clear();
  asked.clear();
}
