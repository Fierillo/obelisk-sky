// Game tables, the way obelisk-dex plays them: kind 2390 logs per table,
// replayed through the app's own pure engines (vendored `@/lib/games`), so a
// table here and in the app is the same table.
//
// Import the protocol, session and registry modules directly, never the
// `@/lib/games` barrel: it re-exports a React clock hook.

import type { Event as NostrEvent, EventTemplate } from 'nostr-tools';
import { buildCreate, buildGameOp, gameMarker, localSeatId, parseGameEvent, type ParsedGameEvent, type SeatSpec } from '@/lib/games/protocol/protocol';
import { deriveSession, tableGame, type GameSession } from '@/lib/games/session/session';
import { canJoin, canStart, isMyTurn, isTurnExpired, controllerOf, seatsControlledBy, turnSecondsLeft } from '@/lib/games/session/session-queries';
import { getGameDef, loadGameDef } from '@/lib/games/core/registry';
import { gameMeta } from '@/lib/games/core/game-meta';
import { CR_SIZES, type CRSizeKey } from '@/lib/games/chain-reaction/chain-reaction';
import { GAME_LOG_WINDOW_SECONDS } from '@/lib/games/protocol/protocol';

export { canJoin, canStart, isMyTurn, isTurnExpired, controllerOf, seatsControlledBy, turnSecondsLeft, gameMeta, gameMarker, CR_SIZES };
export type { GameSession, CRSizeKey, SeatSpec };
export const GAME_KIND = 2390;
export { GAME_LOG_WINDOW_SECONDS };

/** Grace after a turn expires before anyone may claim it (app: TIMEOUT_CLAIM_GRACE_S). */
export const TIMEOUT_CLAIM_GRACE_S = 3;

export class GameBook {
  private logs = new Map<string, ParsedGameEvent[]>();
  private seen = new Set<string>();
  private listeners = new Set<(gameId: string) => void>();

  onChange(cb: (gameId: string) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  ingest(ev: NostrEvent): void {
    if (ev.kind !== GAME_KIND || this.seen.has(ev.id)) return;
    const parsed = parseGameEvent(ev);
    if (!parsed) return;
    this.seen.add(ev.id);
    const log = this.logs.get(parsed.gameId) ?? [];
    log.push(parsed);
    this.logs.set(parsed.gameId, log);
    const game = tableGame(log);
    if (game && !getGameDef(game)) void loadGameDef(game).then(() => this.emit(parsed.gameId));
    this.emit(parsed.gameId);
  }

  session(gameId: string, now = Math.floor(Date.now() / 1000)): GameSession | null {
    const log = this.logs.get(gameId);
    return log ? deriveSession(log, now) : null;
  }

  /** Tables in a channel, newest first (finished and cancelled included). */
  tables(channelId: string, now = Math.floor(Date.now() / 1000)): GameSession[] {
    const out: GameSession[] = [];
    for (const [id, log] of this.logs) {
      if (log[0]?.channelId !== channelId) continue;
      const s = this.session(id, now);
      if (s) out.push(s);
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
  }

  /** Tables still worth showing in a yard: waiting or being played. */
  liveTables(channelId: string, now?: number): GameSession[] {
    return this.tables(channelId, now).filter((s) => s.status === 'waiting' || s.status === 'in_progress');
  }

  private emit(id: string): void {
    for (const l of this.listeners) l(id);
  }
}

// ── event templates (exactly the app's) ──────────────────────────────────

const withTime = (t: { kind: number; content: string; tags: string[][] }): EventTemplate => ({ ...t, created_at: Math.floor(Date.now() / 1000) });

export function createTable(channelId: string, game: string, opts: Record<string, unknown>, turnTimeoutS: number): EventTemplate {
  return withTime(buildCreate(channelId, { game, opts, turnTimeoutS, nonce: Math.random().toString(36).slice(2, 10) }));
}

export function joinTable(s: GameSession): EventTemplate {
  return withTime(buildGameOp(s.channelId, s.id, 'join'));
}

/** Seat everyone who joined, in join order (the app's default seat picker). */
export function startTable(s: GameSession): EventTemplate {
  const seats: SeatSpec[] = s.joined.map((pk) => ({ id: pk, by: pk }));
  return withTime(buildGameOp(s.channelId, s.id, 'start', { seats }));
}

/** Start a table played on this machine: `players` seats, all on your key. */
export function startLocalTable(s: GameSession, me: string, players: number): EventTemplate {
  const seats: SeatSpec[] = Array.from({ length: players }, (_, i) => ({ id: localSeatId(me, i), by: me, label: `Player ${i + 1}` }));
  return withTime(buildGameOp(s.channelId, s.id, 'start', { seats }));
}

export function moveOnTable(s: GameSession, action: unknown, seat?: string): EventTemplate {
  return withTime(buildGameOp(s.channelId, s.id, 'move', { n: s.turnIndex, action, ...(seat ? { seat } : {}) }));
}

export function timeoutOnTable(s: GameSession): EventTemplate {
  return withTime(buildGameOp(s.channelId, s.id, 'timeout', { n: s.turnIndex }));
}

export function resignTable(s: GameSession, seat?: string | null): EventTemplate {
  return withTime(buildGameOp(s.channelId, s.id, 'resign', seat ? { seat } : {}));
}

export function cancelTable(s: GameSession): EventTemplate {
  return withTime(buildGameOp(s.channelId, s.id, 'cancel'));
}

/** May anyone claim the current turn as timed out now? */
export function claimableTimeout(s: GameSession, now = Math.floor(Date.now() / 1000)): boolean {
  return s.status === 'in_progress' && s.turnDeadline !== null && now > s.turnDeadline + TIMEOUT_CLAIM_GRACE_S && isTurnExpired(s, now);
}
