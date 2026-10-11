// Who is here right now, and who has stepped away. Someone is live while
// their browser sends movement (nostr/motion.ts) or an activity
// (nostr/activity.ts); live and active in the last few minutes is online,
// live but idle longer than that is AFK. Everyone else is offline (their
// character only stands in for what they wrote).

export type Presence = 'online' | 'afk' | 'offline';

/** Live but idle this long counts as away. */
export const AFK_AFTER_MS = 5 * 60_000;

export class PresenceTracker {
  private active = new Map<string, number>();

  /** `pk` did something (moved, wrote, sat down, started a set) at `now`. */
  activity(pk: string, now: number): void {
    this.active.set(pk, Math.max(this.active.get(pk) ?? 0, now));
  }

  /** Online, AFK or offline, given whether their browser is live right now. */
  of(pk: string, live: boolean, now: number): Presence {
    if (!live) return 'offline';
    const last = this.active.get(pk);
    // Live but never seen acting yet: they just arrived, count them in.
    if (last === undefined) { this.active.set(pk, now); return 'online'; }
    return now - last > AFK_AFTER_MS ? 'afk' : 'online';
  }

  forget(pk: string): void {
    this.active.delete(pk);
  }
}
