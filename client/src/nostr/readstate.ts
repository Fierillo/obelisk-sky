// Read cursors shared with obelisk.ar.
//
// Same event the app writes (src/services/read-state/relay-sync.ts and
// sync-publish.ts): replaceable kind 30078, d=`obelisk:readstate:v1`,
// content NIP-44-encrypted to yourself, payload
// `{v:1, groups:{[gid]:{lastReadAt:ms}}, mentionsReadAt?:ms}`, on the group
// relay only. Cursors only move forward and merge with max(), so walking
// into a channel here marks it read in the app and the other way round.
// Publishing waits for a fixed 60 s window (the app's DEBOUNCE_MS) and only
// while the page is visible.

import type { EventTemplate, Event as NostrEvent, VerifiedEvent } from 'nostr-tools';
import type { RelayHub, SubscriptionHandle } from '@nostr-wot/relay/hub';
import { D_TAG_GROUPS, DEBOUNCE_MS } from '@/constants/read-state/sync-options';
import { parseSyncCursors } from '@/schemas/read-state/sync-cursors';
import { activeRelay } from './hub';

export const FALLBACK_WINDOW_MS = 24 * 3600 * 1000;

export interface Cursors {
  groups: Record<string, number>;
  mentionsReadAt: number;
}

export interface ReadStateSigner {
  pubkey: string;
  sign(t: EventTemplate): Promise<VerifiedEvent>;
  encrypt(plaintext: string): Promise<string>;
  decrypt(ciphertext: string): Promise<string>;
}

/** Wire payload → cursors (via the app's own schema). */
export function decodeCursors(payload: unknown): Cursors {
  const flat = parseSyncCursors(payload);
  const out: Cursors = { groups: {}, mentionsReadAt: 0 };
  for (const [k, v] of Object.entries(flat)) {
    if (k.startsWith('groups:')) out.groups[k.slice(7)] = v;
    else if (k === 'mentionsReadAt') out.mentionsReadAt = v;
  }
  return out;
}

export function encodeCursors(c: Cursors): unknown {
  const groups: Record<string, { lastReadAt: number }> = {};
  for (const [id, ms] of Object.entries(c.groups)) groups[id] = { lastReadAt: ms };
  return c.mentionsReadAt ? { v: 1, groups, mentionsReadAt: c.mentionsReadAt } : { v: 1, groups };
}

/** Per-key max: a cursor never moves back. Returns true if `into` changed. */
export function mergeCursors(into: Cursors, from: Cursors): boolean {
  let changed = false;
  for (const [id, ms] of Object.entries(from.groups)) {
    if (ms > (into.groups[id] ?? 0)) { into.groups[id] = ms; changed = true; }
  }
  if (from.mentionsReadAt > into.mentionsReadAt) { into.mentionsReadAt = from.mentionsReadAt; changed = true; }
  return changed;
}

export function effectiveCursor(stored: number | undefined, now = Date.now()): number {
  return stored && stored > 0 ? stored : now - FALLBACK_WINDOW_MS;
}

/** Messages newer than the cursor that aren't yours (the app's countChannelUnread). */
export function countUnread(messages: readonly { createdAt: number; pubkey: string }[], cursor: number, me: string | null): number {
  let n = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.createdAt * 1000 <= cursor) break;
    if (me && m.pubkey === me) continue;
    n++;
  }
  return n;
}

export class ReadState {
  readonly cursors: Cursors = { groups: {}, mentionsReadAt: 0 };
  private dirty = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private sub: SubscriptionHandle | null = null;
  private latestAt = 0;
  private listeners = new Set<() => void>();

  constructor(private hub: RelayHub, private signer: ReadStateSigner, private storage: Storage = localStorage) {
    try {
      const raw = this.storage.getItem(this.localKey());
      if (raw) mergeCursors(this.cursors, decodeCursors(JSON.parse(raw)));
    } catch { /* fresh start */ }
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  start(): void {
    this.sub = this.hub.subscribe({
      relays: [activeRelay()],
      filters: [{ kinds: [30078], authors: [this.signer.pubkey], '#d': [D_TAG_GROUPS] }],
      priority: 'background',
      label: 'sky-readstate',
      onEvent: (ev) => void this.ingest(ev),
    });
    document.addEventListener('visibilitychange', this.onVisible);
  }

  stop(): void {
    this.sub?.release();
    if (this.timer) clearTimeout(this.timer);
    document.removeEventListener('visibilitychange', this.onVisible);
  }

  cursorFor(groupId: string): number {
    return effectiveCursor(this.cursors.groups[groupId]);
  }

  /** You've seen `groupId` up to `ms`. */
  markRead(groupId: string, ms: number): void {
    if (ms <= (this.cursors.groups[groupId] ?? 0)) return;
    this.cursors.groups[groupId] = ms;
    this.changed();
  }

  markMentionsRead(ms = Date.now()): void {
    if (ms <= this.cursors.mentionsReadAt) return;
    this.cursors.mentionsReadAt = ms;
    this.changed();
  }

  private async ingest(ev: NostrEvent): Promise<void> {
    if (ev.pubkey !== this.signer.pubkey || ev.created_at < this.latestAt) return;
    if (!ev.tags.some((t) => t[0] === 'd' && t[1] === D_TAG_GROUPS)) return;
    this.latestAt = ev.created_at;
    try {
      const remote = decodeCursors(JSON.parse(await this.signer.decrypt(ev.content)));
      if (mergeCursors(this.cursors, remote)) { this.save(); this.emit(); }
    } catch { /* a payload we can't open is ignored, like the app does */ }
  }

  private changed(): void {
    this.dirty = true;
    this.save();
    this.emit();
    // Fixed window opened by the first change (later changes don't push it back).
    this.timer ??= setTimeout(() => { this.timer = null; void this.flush(); }, DEBOUNCE_MS);
  }

  private onVisible = () => {
    if (document.visibilityState === 'visible' && this.dirty && !this.timer) void this.flush();
  };

  private async flush(): Promise<void> {
    if (!this.dirty || document.visibilityState !== 'visible') return;
    this.dirty = false;
    try {
      const content = await this.signer.encrypt(JSON.stringify(encodeCursors(this.cursors)));
      const at = Math.max(Math.floor(Date.now() / 1000), this.latestAt + 1);
      const ev = await this.signer.sign({ kind: 30078, tags: [['d', D_TAG_GROUPS]], content, created_at: at });
      this.latestAt = at;
      await this.hub.publish({ relays: [activeRelay()], event: ev });
    } catch (e) {
      console.warn('[sky] read-state sync failed', e);
      this.dirty = true;
    }
  }

  private save(): void {
    try { this.storage.setItem(this.localKey(), JSON.stringify(encodeCursors(this.cursors))); } catch { /* storage full or blocked */ }
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }

  private localKey(): string {
    return `obelisk-sky/read/${this.signer.pubkey}`;
  }
}
