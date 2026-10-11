// The user's own view of the group relay, through the RelayHub, fed into
// SkyState. Replaces v1's server proxy: nothing is read with any key but the
// signed-in user's.
//
// Before the first EOSE the state fills silently; then main.ts gets one
// snapshot, and every later event live.

import type { Event as NostrEvent } from 'nostr-tools';
import type { RelayHub, SubscriptionHandle } from '@nostr-wot/relay/hub';
import { HISTORY_SECONDS, SkyState } from './state';
import type { ServerMsg } from './wire';
import { activeRelay, profileRelays } from './hub';

export type FeedAccess = 'connecting' | 'open' | 'refused' | 'offline';

export interface FeedHooks {
  onMsg(m: ServerMsg): void;
  onAccess(a: FeedAccess, reason?: string): void;
  /** Kind 2390 game ops (obelisk-dex tables), straight from the relay. */
  onGame?(ev: NostrEvent): void;
}

/** A relay CLOSED reason that means "this key is not admitted here". */
export function isAccessRefusal(reason: string): boolean {
  return /^restricted:/i.test(reason) && /whitelist|not allowed|access denied|not admitted|web of trust|wot/i.test(reason);
}

/** A relay set may miss a kind 0 once: ask again after 30 s, 2 min, then every 10 min. */
export function nextProfileRetry(tries: number, now: number): number {
  const waits = [30_000, 120_000, 600_000];
  return now + waits[Math.min(tries - 1, waits.length - 1)];
}

export class Feed {
  readonly state: SkyState;
  private ready = false;
  private groupSub: SubscriptionHandle | null = null;
  private contentSub: SubscriptionHandle | null = null;
  private resubTimer: ReturnType<typeof setTimeout> | null = null;
  private timers: ReturnType<typeof setInterval>[] = [];
  /** Profile lookups so far: tries made and when the next may go out. */
  private requested = new Map<string, { tries: number; next: number }>();
  private zapSince = 0;
  private stopped = false;
  private unStatus: (() => void) | null = null;

  constructor(private hub: RelayHub, private hooks: FeedHooks) {
    this.state = new SkyState((m) => { if (this.ready) hooks.onMsg(m); }, undefined, { publicOnly: false });
  }

  start(): void {
    this.hooks.onAccess('connecting');
    this.unStatus = this.hub.onStatus((s) => {
      if (s.url.replace(/\/$/, '') !== activeRelay()) return;
      if (s.connection === 'offline' || s.connection === 'failed') this.hooks.onAccess('offline', s.lastError ?? undefined);
      if (s.auth === 'refused') this.hooks.onAccess('refused', s.authError ?? undefined);
    });
    void this.hub.connect(activeRelay()).catch(() => { /* the hub keeps retrying */ });
    this.groupSub = this.hub.subscribe({
      relays: [activeRelay()],
      filters: [{ kinds: [39000] }],
      priority: 'active',
      watchdogMs: 8000,
      label: 'sky-groups',
      onEvent: (ev) => { if (this.state.ingestGroupMeta(ev)) this.scheduleContent(); },
      onEose: () => {
        this.hooks.onAccess('open');
        if (!this.state.visibleGroupIds().length) this.finishSnapshot();
      },
      onRelayClosed: (_r, reason) => { if (isAccessRefusal(reason)) this.hooks.onAccess('refused', reason); },
    });
    this.timers.push(setInterval(() => this.fetchProfiles(), 2500));
    this.timers.push(setInterval(() => this.fetchZaps(), 60_000));
    this.timers.push(setInterval(() => this.state.prune(), 10 * 60_000));
    // Never leave the user on a blank island if an EOSE goes missing.
    setTimeout(() => this.finishSnapshot(), 12_000);
  }

  stop(): void {
    this.stopped = true;
    for (const t of this.timers) clearInterval(t);
    this.groupSub?.release();
    this.contentSub?.release();
    this.unStatus?.();
  }

  private scheduleContent(): void {
    if (this.resubTimer) clearTimeout(this.resubTimer);
    this.resubTimer = setTimeout(() => this.subscribeContent(), 400);
  }

  private subscribeContent(): void {
    if (this.stopped) return;
    const ids = this.state.visibleGroupIds();
    const prev = this.contentSub;
    if (!ids.length) { prev?.release(); this.contentSub = null; return; }
    const since = Math.floor(Date.now() / 1000) - HISTORY_SECONDS;
    this.contentSub = this.hub.subscribe({
      relays: [activeRelay()],
      filters: [
        { kinds: [9], '#h': ids, since, limit: 4000 },
        { kinds: [7], '#h': ids, since, limit: 4000 },
        { kinds: [5], '#h': ids, since, limit: 2000 },
        // Game tables live a day (the app's GAME_LOG_WINDOW_SECONDS).
        { kinds: [2390], '#h': ids, since: Math.floor(Date.now() / 1000) - 24 * 3600, limit: 3000 },
      ],
      priority: 'active',
      watchdogMs: 8000,
      label: 'sky-content',
      onEvent: (ev: NostrEvent) => {
        if (ev.kind === 9) this.state.ingestMessage(ev);
        else if (ev.kind === 7) this.state.ingestReaction(ev);
        else if (ev.kind === 5) this.state.ingestDeletion(ev);
        else if (ev.kind === 2390) this.hooks.onGame?.(ev);
      },
      onEose: () => { this.finishSnapshot(); this.fetchZaps(true); },
      onRelayClosed: (_r, reason) => { if (isAccessRefusal(reason)) this.hooks.onAccess('refused', reason); },
    });
    // Release the old REQ only after the new one holds the socket.
    prev?.release();
  }

  private finishSnapshot(): void {
    if (this.ready || this.stopped) return;
    this.ready = true;
    this.hooks.onMsg(this.state.snapshot(activeRelay()));
  }

  /** Zap receipts point at messages, not groups: poll by `#e`. */
  private fetchZaps(full = false): void {
    const ids = this.state.messageIds();
    if (!ids.length) return;
    const now = Math.floor(Date.now() / 1000);
    const since = full || !this.zapSince ? now - HISTORY_SECONDS : this.zapSince - 120;
    this.zapSince = now;
    for (let i = 0; i < ids.length; i += 250) {
      void this.hub.query({
        relays: [activeRelay()],
        filters: [{ kinds: [9735], '#e': ids.slice(i, i + 250), since }],
        cache: { mode: 'bypass' },
        label: 'sky-zaps',
      }).then((r) => { for (const ev of r.events) this.state.ingestZap(ev); }).catch(() => {});
    }
  }

  private fetchProfiles(): void {
    const now = Date.now();
    const missing = this.state.missingProfiles().filter((p) => (this.requested.get(p)?.next ?? 0) <= now).slice(0, 150);
    if (!missing.length) return;
    for (const p of missing) {
      const tries = (this.requested.get(p)?.tries ?? 0) + 1;
      this.requested.set(p, { tries, next: nextProfileRetry(tries, now) });
    }
    void this.hub.query({
      relays: profileRelays(),
      filters: [{ kinds: [0], authors: missing }],
      maxWaitMs: 5000,
      label: 'sky-profiles',
    }).then((r) => { for (const ev of r.events) this.state.ingestProfile(ev); }).catch(() => {});
  }
}
