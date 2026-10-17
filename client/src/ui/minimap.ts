// The minimap: the island in a corner (the loading screen's drawing,
// ui/loading.ts), with the channels' houses (unread, "@"), the landmarks, the
// people live in the village and you as an arrow. North up, or turned with
// the camera. A click opens it big; on the big map a house walks you there.
// The island is drawn once; the dots move a few times a second (main.ts).

import type { IslandPlan, Vec2 } from '../world/layout';
import type { LandmarkId } from '../world/landmarks';
import { islandMap, LANDMARK_MARK } from './loading';
import { vw } from '../i18n/village';

const NS = 'http://www.w3.org/2000/svg';

export interface MinimapHouse { id: string; name: string; pos: Vec2; unread: number; ping: boolean }
export interface MinimapState {
  houses: MinimapHouse[];
  landmarks: { id: LandmarkId; pos: Vec2 }[];
  /** Everyone else connected and in the village. */
  people: Vec2[];
  /** You: where you are and which way you face (radians, like Math.atan2(dx, dz)). */
  me: { pos: Vec2; heading: number } | null;
  /** The camera's yaw (same measure), for the turning map. */
  cameraYaw: number;
}

/** Degrees to turn the map so the camera's forward points up (world x right, z down on the map). */
export function mapTurn(cameraYaw: number): number {
  // Forward on the map is (sin yaw, cos yaw); up is (0, -1).
  return -90 - (Math.atan2(Math.cos(cameraYaw), Math.sin(cameraYaw)) * 180) / Math.PI;
}

/** Degrees to turn an arrow drawn pointing up so it points along `heading`. */
export function arrowTurn(heading: number): number {
  return (Math.atan2(Math.cos(heading), Math.sin(heading)) * 180) / Math.PI + 90;
}

/** What to redraw: changes only when something on the map moved or changed. */
export function minimapSig(s: MinimapState, rotate: boolean): string {
  const r = (n: number) => n.toFixed(1);
  return [
    rotate ? r(s.cameraYaw * 10) : '',
    s.me ? `${r(s.me.pos.x)},${r(s.me.pos.z)},${r(s.me.heading * 10)}` : '',
    s.people.map((p) => `${r(p.x)},${r(p.z)}`).join(';'),
    s.houses.map((h) => `${h.id}:${r(h.pos.x)},${r(h.pos.z)}:${h.unread}:${h.ping ? 1 : 0}`).join(';'),
    s.landmarks.map((l) => l.id).join(','),
  ].join('|');
}

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent: Element): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent.appendChild(e);
  return e;
}

export class Minimap {
  readonly el: HTMLElement;
  private svg: SVGSVGElement;
  /** Everything that turns with the camera. */
  private turn: SVGGElement;
  private dyn: SVGGElement;
  private sig = '';
  big = false;
  rotate = false;

  constructor(parent: HTMLElement, private plan: IslandPlan, private onHouse: (id: string) => void) {
    this.el = document.createElement('div');
    this.el.className = 'minimap';
    this.el.setAttribute('role', 'button');
    this.el.tabIndex = 0;
    this.el.title = vw.minimapOpen;
    this.el.setAttribute('aria-label', vw.minimapOpen);
    // The loading screen's island, without its made-up houses and villagers.
    this.svg = islandMap(plan);
    this.svg.setAttribute('class', 'minimap-svg');
    this.svg.querySelector('.lm-houses')?.remove();
    this.svg.querySelector('.lm-people')?.remove();
    // Framed on the island with a little margin, in a square.
    const R = plan.R + 1;
    this.svg.setAttribute('viewBox', `${-R} ${-R} ${2 * R} ${2 * R}`);
    this.turn = document.createElementNS(NS, 'g');
    while (this.svg.firstChild) this.turn.appendChild(this.svg.firstChild);
    this.svg.appendChild(this.turn);
    this.dyn = svgEl('g', { class: 'mm-dyn' }, this.turn);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'minimap-close';
    close.textContent = '×';
    close.title = vw.close;
    close.addEventListener('click', (e) => { e.stopPropagation(); this.setBig(false); });
    this.el.append(this.svg, close);
    // A click opens it big; on the big map a click on a house goes there.
    this.el.addEventListener('click', (e) => {
      const house = (e.target as Element).closest('[data-house]');
      if (this.big && house) { this.onHouse(house.getAttribute('data-house')!); this.setBig(false); return; }
      if (!this.big) this.setBig(true);
    });
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !this.big) { e.preventDefault(); this.setBig(true); }
      if (e.key === 'Escape' && this.big) { e.stopPropagation(); this.setBig(false); }
    });
    parent.appendChild(this.el);
  }

  setBig(on: boolean): void {
    this.big = on;
    this.el.classList.toggle('big', on);
    this.el.title = on ? '' : vw.minimapOpen;
    this.sig = '';
  }

  setShown(on: boolean): void {
    this.el.hidden = !on;
    if (!on) this.setBig(false);
  }

  /** Redraw what moved (a few times a second). */
  update(s: MinimapState): void {
    if (this.el.hidden) return;
    const sig = `${this.big ? 'B' : ''}${minimapSig(s, this.rotate)}`;
    if (sig === this.sig) return;
    this.sig = sig;
    // Turned with the camera on the small map only: the big one stays north up.
    const turn = this.rotate && !this.big ? mapTurn(s.cameraYaw) : 0;
    this.turn.setAttribute('transform', turn ? `rotate(${turn.toFixed(1)})` : '');
    // Labels and marks stay upright on a turned map.
    const up = (x: number, z: number) => (turn ? `translate(${x.toFixed(2)} ${z.toFixed(2)}) rotate(${(-turn).toFixed(1)})` : `translate(${x.toFixed(2)} ${z.toFixed(2)})`);
    this.dyn.replaceChildren();
    for (const l of s.landmarks) {
      const m = LANDMARK_MARK[l.id];
      const g = svgEl('g', { class: 'mm-landmark', transform: up(l.pos.x, l.pos.z), style: `--lm:${m.color}` }, this.dyn);
      svgEl('path', { d: 'M-0.9 -0.1L0 -1L0.9 -0.1V0.8H-0.9Z' }, g);
      svgEl('text', { x: 0, y: 0.55, 'text-anchor': 'middle' }, g).textContent = m.letter;
    }
    for (const h of s.houses) {
      const g = svgEl('g', { class: `mm-house${h.unread ? ' unread' : ''}${h.ping ? ' ping' : ''}`, transform: up(h.pos.x, h.pos.z), 'data-house': h.id }, this.dyn);
      svgEl('title', {}, g).textContent = h.name;
      svgEl('path', { d: 'M-0.8 -0.1L0 -0.9L0.8 -0.1V0.7H-0.8Z' }, g);
      if (h.ping) svgEl('text', { class: 'mm-ping', x: 0.9, y: -0.6, 'text-anchor': 'middle' }, g).textContent = '@';
      else if (h.unread) svgEl('circle', { class: 'mm-dot', cx: 0.75, cy: -0.75, r: 0.38 }, g);
      if (this.big) svgEl('text', { class: 'mm-name', x: 0, y: 1.7, 'text-anchor': 'middle' }, g).textContent = h.name;
    }
    for (const p of s.people) svgEl('circle', { class: 'mm-person', cx: p.x.toFixed(2), cy: p.z.toFixed(2), r: 0.32 }, this.dyn);
    if (s.me) {
      const g = svgEl('g', { class: 'mm-me', transform: `translate(${s.me.pos.x.toFixed(2)} ${s.me.pos.z.toFixed(2)}) rotate(${arrowTurn(s.me.heading).toFixed(1)})` }, this.dyn);
      svgEl('path', { d: 'M0 -1.1L0.75 0.75L0 0.35L-0.75 0.75Z' }, g);
    }
  }
}
