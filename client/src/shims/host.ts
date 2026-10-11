// What the re-hosted obelisk-dex code asks of "the app": sky registers its
// session here once, and the shims below forward to it.

import type { EventTemplate, VerifiedEvent } from 'nostr-tools';

export interface SkyHost {
  login(args: unknown): Promise<void>;
  sign(t: EventTemplate): Promise<VerifiedEvent>;
  pubkey(): string | null;
}

let host: SkyHost | null = null;

export function registerHost(h: SkyHost): void {
  host = h;
}

export function getHost(): SkyHost {
  if (!host) throw new Error('sky host not registered');
  return host;
}
