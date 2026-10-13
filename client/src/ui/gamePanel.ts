// A game table, opened from its 3D table in a yard or a "Game table" chip.
// Chain Reaction is played right here with the app's board helpers
// (vendored utils/games/chain-reaction/board-view); other games show their
// state and open in Obelisk.

import { readBoard, boardTurn, cellViews } from '@/utils/games/chain-reaction/board-view';
import { SEAT_COLORS } from '@/constants/games/chain-reaction';
import {
  canJoin, canStart, claimableTimeout, gameMeta, seatsControlledBy, turnSecondsLeft, type GameSession,
} from '../games/book';
import { vw } from '../i18n/village';

export interface GamePanelDeps {
  me: () => string | null;
  nameOf: (pk: string) => string;
  session: (gameId: string) => GameSession | null;
  join: (s: GameSession) => void;
  start: (s: GameSession) => void;
  move: (s: GameSession, cell: number, seat: string | null) => void;
  resign: (s: GameSession, seat: string | null) => void;
  cancel: (s: GameSession) => void;
  claimTimeout: (s: GameSession) => void;
  appLink: (s: GameSession) => string;
}

const STATUS: Record<GameSession['status'], string> = vw.gameStatus;

export class GamePanel {
  readonly el: HTMLElement;
  private gameId: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(parent: HTMLElement, private deps: GamePanelDeps) {
    this.el = document.createElement('div');
    this.el.className = 'game';
    this.el.hidden = true;
    parent.appendChild(this.el);
  }

  get openId(): string | null {
    return this.gameId;
  }

  open(gameId: string): void {
    this.gameId = gameId;
    this.el.hidden = false;
    this.render();
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.render(), 1000);
  }

  close(): void {
    this.gameId = null;
    this.el.hidden = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  refresh(gameId?: string): void {
    if (this.gameId && (!gameId || gameId === this.gameId)) this.render();
  }

  private render(): void {
    if (!this.gameId) return;
    const s = this.deps.session(this.gameId);
    this.el.replaceChildren();
    const head = div('game-head');
    const title = div('game-title');
    title.textContent = s ? (gameMeta(s.game)?.displayName ?? s.game) : vw.gameTable;
    const close = btn('game-close', vw.close);
    close.textContent = '×';
    close.addEventListener('click', () => this.close());
    head.append(title, close);
    this.el.append(head);
    if (!s) {
      const p = div('game-note');
      p.textContent = vw.gameTooOld;
      this.el.append(p);
      return;
    }
    const me = this.deps.me();
    const mine = seatsControlledBy(s, me);
    const status = div('game-status');
    const left = turnSecondsLeft(s);
    status.textContent = STATUS[s.status] + (s.status === 'in_progress' && left !== null ? vw.secondsLeft(Math.max(0, left)) : '');
    if (s.status === 'finished') status.textContent = s.draw ? vw.finishedDraw : vw.finishedWon(s.winner ? this.label(s, s.winner) : null);
    this.el.append(status, this.seatList(s, me));

    if (s.game === 'chain-reaction' && (s.status === 'in_progress' || s.status === 'finished')) this.el.append(this.board(s, mine));
    else if (s.game !== 'chain-reaction') {
      const p = div('game-note');
      p.textContent = vw.gameInObelisk;
      const a = document.createElement('a');
      a.className = 'account-btn primary';
      a.href = this.deps.appLink(s);
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = vw.openInObelisk;
      this.el.append(p, a);
    }

    const actions = div('game-actions');
    const add = (label: string, fn: () => void, primary = false) => {
      const b = btn(`account-btn${primary ? ' primary' : ''}`, label);
      b.textContent = label;
      b.addEventListener('click', fn);
      actions.append(b);
    };
    if (me && s.status === 'waiting' && canJoin(s, me)) add(vw.join, () => this.deps.join(s), true);
    if (me && s.status === 'waiting' && canStart(s, me)) add(vw.start, () => this.deps.start(s), true);
    if (me && s.status === 'waiting' && s.createdBy === me) add(vw.cancelTable, () => this.deps.cancel(s));
    if (me && s.status === 'in_progress' && mine.length) add(vw.resign, () => this.deps.resign(s, s.currentTurn && mine.includes(s.currentTurn) ? s.currentTurn : mine[0] ?? null));
    if (me && claimableTimeout(s)) add(vw.claimTimeout, () => this.deps.claimTimeout(s));
    if (actions.children.length) this.el.append(actions);
  }

  private label(s: GameSession, seatId: string): string {
    const seat = s.seats.find((x) => x.id === seatId);
    if (seat?.label) return seat.label;
    return this.deps.nameOf(seat?.by ?? seatId.split('#')[0]);
  }

  private seatList(s: GameSession, me: string | null): HTMLElement {
    const list = div('game-seats');
    const ids = s.status === 'waiting' ? s.joined : s.participants;
    if (!ids.length) {
      const p = div('game-note');
      p.textContent = vw.noOneJoined;
      list.append(p);
    }
    ids.forEach((id, i) => {
      const row = div('game-seat');
      const dot = document.createElement('span');
      dot.className = 'game-dot';
      dot.style.background = s.status === 'waiting' ? '#a3a3a3' : SEAT_COLORS[i % SEAT_COLORS.length].hex;
      const name = document.createElement('span');
      name.textContent = this.label(s, id) + (me && (id === me || id.startsWith(`${me}#`)) ? vw.you : '');
      row.append(dot, name);
      if (s.currentTurn === id && s.status === 'in_progress') row.classList.add('turn');
      if (s.eliminated.includes(id)) row.classList.add('out');
      list.append(row);
    });
    return list;
  }

  private board(s: GameSession, mine: string[]): HTMLElement {
    const b = readBoard(s);
    const turn = boardTurn(s, mine, b.seats);
    const views = cellViews(b.cells, {}, turn.myTurn, turn.mySeat);
    const grid = div('cr-board');
    grid.style.gridTemplateColumns = `repeat(${b.cols}, 1fr)`;
    grid.style.setProperty('--matrix', turn.matrixHex);
    views.forEach((v, i) => {
      const cell = btn('cr-cell', v.count ? vw.orbs(v.count) : vw.emptyCell);
      cell.disabled = !v.canClick;
      for (let k = 0; k < Math.min(v.count, 3); k++) {
        const orb = document.createElement('span');
        orb.className = 'cr-orb';
        orb.style.background = v.hex ?? '#888';
        cell.append(orb);
      }
      cell.addEventListener('click', () => this.deps.move(s, i, turn.actingSeatId));
      grid.append(cell);
    });
    const wrap = div('cr-wrap');
    const hint = div('game-note');
    hint.textContent = turn.myTurn ? vw.yourTurn : s.status === 'in_progress' ? vw.waitingFor(s.currentTurn ? this.label(s, s.currentTurn) : '…') : '';
    wrap.append(grid, hint);
    return wrap;
  }
}

function div(cls: string): HTMLDivElement {
  const d = document.createElement('div');
  d.className = cls;
  return d;
}

function btn(cls: string, label: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.setAttribute('aria-label', label);
  return b;
}
