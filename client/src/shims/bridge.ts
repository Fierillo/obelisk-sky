// `@/services/nostr-bridge` for obelisk-dex's mesh voice code, re-hosted in
// sky. Voice only reaches the bridge for a handful of calls (see
// services/voice/transport-*.ts, relay-prep.ts, active-call-watcher.ts);
// they are answered here over sky's RelayHub, with a 'voice' AUTH lease on
// the call's relay as the app holds one. The message components' read hooks
// are at the bottom.

import type { EventTemplate, Event as NostrEvent, Filter, VerifiedEvent } from 'nostr-tools';
import type { RelayHub } from '@nostr-wot/relay/hub';
import { useSyncExternalStore } from 'react';
import type { JsMediaFavorites, JsMediaPack, JsUserMetadata } from '@/services/nostr-bridge/common/types';
import { getProfile, subscribeProfile } from '../nostr/profileStore';
import { getFollows, subscribeFollows } from '../nostr/follows';

export { resubscribeOnQuotaClose } from '@/services/nostr-bridge/relay/quota-resubscribe';


export interface VoiceHost {
  hub: RelayHub;
  relay: () => string;
  pubkey: () => string | null;
  sign: (t: EventTemplate) => Promise<VerifiedEvent>;
}

interface PublishOpts { extraRelays?: string[]; mode?: 'replace'; authRetryOnRestricted?: boolean }
interface SubscribeOpts {
  watchdogMs?: number;
  relays?: readonly string[];
  onEose?: () => void;
  onQuotaOrRateLimitClose?: () => void;
  answerAuth?: boolean;
  [option: string]: unknown;
}

/** The active-call entries the app's bridge hands voice (kind 31314, SFU only). */
export interface ActiveCallEntry { status: string; mode?: 'mesh' | 'sfu'; participantPubkeys?: string[] }

const QUOTA = /rate-?limit|too many|quota|slow down|limit/i;

export function createVoiceBridge(host: VoiceHost) {
  const relaysFor = (opts?: { extraRelays?: string[]; mode?: 'replace'; relays?: readonly string[] }): string[] =>
    opts?.relays?.length ? [...opts.relays]
      : opts?.mode === 'replace' && opts.extraRelays?.length ? opts.extraRelays
        : [...new Set([host.relay(), ...(opts?.extraRelays ?? [])])];

  const subscribe = (filter: Filter, onEvent: (ev: NostrEvent) => void, opts: SubscribeOpts = {}) => {
    const relays = relaysFor(opts);
    const leases = opts.answerAuth === false ? [] : relays.map((r) => host.hub.acquireAuthLease(r, 'voice'));
    const h = host.hub.subscribe({
      relays,
      filters: [filter],
      priority: 'voice',
      label: 'sky-voice',
      ...(opts.watchdogMs ? { watchdogMs: opts.watchdogMs } : {}),
      onEvent: (ev) => onEvent(ev),
      onEose: () => opts.onEose?.(),
      onRelayClosed: (_r, reason) => { if (QUOTA.test(reason)) opts.onQuotaOrRateLimitClose?.(); },
    });
    return () => { h.release(); for (const l of leases) l.release(); };
  };

  return {
    getPublicKey: () => host.pubkey(),

    async publishEvent(template: { kind: number; content: string; tags: string[][]; created_at?: number }, opts: PublishOpts = {}): Promise<VerifiedEvent> {
      const event = await host.sign({ ...template, created_at: template.created_at ?? Math.floor(Date.now() / 1000) });
      const relays = relaysFor(opts);
      let results = await host.hub.publish({ relays, event });
      // A whitelist relay refuses an EVENT that beat AUTH with `restricted:`.
      if (opts.authRetryOnRestricted && results.some((r) => r.status === 'rejected' && /^restricted:/i.test(r.reason ?? ''))) {
        results = await host.hub.publish({ relays, event, authMode: 'auth-first' });
      }
      if (!results.some((r) => r.status === 'ok')) {
        const why = results.map((r) => `${r.url}: ${r.reason ?? r.status}`).join('; ');
        throw new Error(`publish rejected (${why})`);
      }
      return event;
    },

    subscribeFilterWatched: subscribe,
    subscribeVoiceFilterWatched: subscribe,
    subscribeFilter: subscribe,
    signEventTemplate: (t: Omit<EventTemplate, 'created_at'> & { created_at?: number }) => host.sign({ ...t, created_at: t.created_at ?? Math.floor(Date.now() / 1000) }),

    /** Resolves 'ok' once the call's relay has authenticated us, or 'timeout'. */
    waitForRelayAuth(timeoutMs: number): Promise<'ok' | 'timeout'> {
      return new Promise((resolve) => {
        const ok = () => host.hub.status(host.relay()).auth === 'authenticated' || host.hub.status(host.relay()).auth === 'not-required';
        if (ok()) return resolve('ok');
        const off = host.hub.onStatus(() => { if (ok()) { off(); clearTimeout(t); resolve('ok'); } });
        const t = setTimeout(() => { off(); resolve('timeout'); }, timeoutMs);
      });
    },

    /** The hub budgets REQ slots itself; nothing to reserve. */
    reserveVoiceRelayCapacity: () => () => {},

    /** Kind 31314 is the SFU's; mesh calls never see one. */
    subscribeActiveCallByChannel: (_cb: (byChannel: Record<string, ActiveCallEntry | undefined>) => void): (() => void) => () => {},
  };
}

/** What the voice code sees as "the bridge". */
export type BridgeImpl = ReturnType<typeof createVoiceBridge>;

let impl: BridgeImpl | null = null;

export function installVoiceBridge(host: VoiceHost): void {
  impl = createVoiceBridge(host);
}

export async function getBridge(): Promise<BridgeImpl> {
  if (!impl) throw new Error('voice bridge not installed');
  return impl;
}

export function getBridgeImpl(): BridgeImpl | null {
  return impl;
}

export function isImportableRelayUrl(url: string): boolean {
  return /^wss:\/\/[^\s/]+/i.test(url);
}

// ── message rendering ──────────────────────────────────────────────────
// The re-hosted message components (components/chat/message/*) read a few
// bridge hooks. Profiles come from sky's profile store (fetched on first
// read, like the app's ensureUserMetadata); sky has no member lists, media
// packs or favourites, so those are empty and mention chips resolve names
// themselves.

// The bridge's public types the message code imports (type-only re-exports;
// common/types has no runtime imports). JsMemberInfo lives in the bridge's
// members hook, which pulls the whole bridge, so it is repeated here.
export type { JsMediaFavorites, JsMediaItem, JsMediaKind, JsMediaPack, JsMessage, JsUserMetadata } from '@/services/nostr-bridge/common/types';
export interface JsMemberInfo {
  pubkey: string;
  displayName: string;
  picture?: string;
  nip05?: string;
  role: 'admin' | 'member';
}

const EMPTY_MEMBERS: ReadonlyArray<JsMemberInfo> = [];
const EMPTY_PACKS: Readonly<Record<string, JsMediaPack>> = {};
const EMPTY_FAVORITES: JsMediaFavorites = { items: [], packAddresses: [], createdAt: 0 };

export function useUserMetadata(pubkey: string | null): JsUserMetadata | null {
  return useSyncExternalStore(
    (cb) => (pubkey ? subscribeProfile(pubkey, cb) : () => {}),
    () => (pubkey ? getProfile(pubkey) : null),
    () => null,
  );
}

export function useGroupMemberInfo(_groupId: string | null): ReadonlyArray<JsMemberInfo> {
  return EMPTY_MEMBERS;
}

export function useMyFollowSet(): ReadonlySet<string> {
  return useSyncExternalStore(subscribeFollows, getFollows, getFollows);
}

export function useMediaPacks(): Readonly<Record<string, JsMediaPack>> {
  return EMPTY_PACKS;
}

export function useMyMediaFavorites(): JsMediaFavorites {
  return EMPTY_FAVORITES;
}

// The app's relay-derived localStorage cache. Vendored modules that sky
// reaches only for their types import it; sky keeps no such cache.
export function cacheGet<T>(_relay: string, _kind: number, _id: string): { value: T; createdAt: number; relay: string; kind: number } | null {
  return null;
}

export function cacheSet<T>(_relay: string, _kind: number, _id: string, _value: T): void {}

// ── the composer ───────────────────────────────────────────────────────
// The re-hosted message bar (client/src/chat/composer) reuses the app's
// media picker, whose favourites and "create media" tiles save the reader's
// media list through `nostrActions`. Sky keeps no such list (the controls
// are hidden in styles.css), so a stray call fails plainly instead of
// reaching a bridge that isn't there.
export const nostrActions = {
  saveMediaFavorites: async (_favorites: Omit<JsMediaFavorites, 'createdAt'>): Promise<void> => {
    throw new Error('Media favourites live in obelisk.ar');
  },
};
