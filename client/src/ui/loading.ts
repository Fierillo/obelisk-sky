// The loading screen: the island seen from straight above, first as an SVG
// map drawn from the plan (instant, no models), then the real ground
// rendered behind it by the same top-down camera, with trees, houses and
// villagers popping in as their models arrive.

import { TOP_DOWN_MARGIN } from '../world/cameraman';
import {
  dist, distToPolyline, inFootprint, islandOutline, millBlocked, onTrack, parkSite, rng, trackSite, waterworks, TRACK,
  type IslandPlan, type Vec2,
} from '../world/layout';
import { smoothRiver } from '../world/island';
import { fbm2 } from '../world/noise';
import { LANDMARKS, reserveLandmarkSlots, type LandmarkId } from '../world/landmarks';

const NS = 'http://www.w3.org/2000/svg';

export const STAGES = [
  { from: 0, label: 'Raising the island…' },
  { from: 0.08, label: 'Planting trees…' },
  { from: 0.4, label: 'Building houses…' },
  { from: 0.7, label: 'Waking up the villagers…' },
] as const;

/** Which stage a 0–1 progress is in. */
export function stageAt(progress: number): number {
  let i = 0;
  while (i + 1 < STAGES.length && progress >= STAGES[i + 1].from) i++;
  return i;
}

/** The SVG viewBox matching the top-down camera: the island plus the same
 *  margin fills the shorter side of the screen. World x → right, z → down. */
export function mapViewBox(radius: number, aspect: number): string {
  const half = (radius * TOP_DOWN_MARGIN) / Math.min(1, aspect);
  const w = half * 2 * aspect, h = half * 2;
  return `${(-w / 2).toFixed(2)} ${(-h / 2).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}`;
}

const pathOf = (pts: Vec2[], close: boolean) =>
  pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)} ${p.z.toFixed(2)}`).join('') + (close ? 'Z' : '');

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent?: Element): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent?.appendChild(e);
  return e;
}

/** What the map draws, worked out from the plan the way the world places it
 *  (world.ts: landmark slots, the track and park, bridges, the mill, groves). */
export interface MapFeatures {
  river: Vec2[];
  track: { c: Vec2; rot: number } | null;
  park: Vec2 | null;
  bridges: { p: Vec2; angle: number }[];
  mill: Vec2 | null;
  landmarks: { id: LandmarkId; pos: Vec2 }[];
  houses: Vec2[];
  trees: Vec2[];
}

export function mapFeatures(plan: IslandPlan): MapFeatures {
  const river = smoothRiver(plan);
  const track = trackSite(plan);
  const open = plan.slots.filter((s) => !track || !onTrack(s.pos, track, s.w * 0.7 + 0.6));
  const held = reserveLandmarkSlots(open, plan.plaza.c);
  const heldIdx = new Set([...held.values()].map((s) => s.index));
  const landmarks = LANDMARKS.flatMap((d) => {
    const s = held.get(d.id);
    return s ? [{ id: d.id, pos: s.pos }] : [];
  });
  // Channel houses go to the free slots nearest the plaza first.
  const houses = open.filter((s) => !heldIdx.has(s.index))
    .sort((a, b) => dist(a.pos, plan.plaza.c) - dist(b.pos, plan.plaza.c))
    .slice(0, 12).map((s) => s.pos);
  const { bridges: bridgeAt, mill } = waterworks(plan, river, held.get('liberture')?.pos ?? null, millBlocked(plan, track));
  const bridges = bridgeAt.map((p) => {
    const i = river.indexOf(p);
    const a = river[Math.max(0, i - 1)], b = river[Math.min(river.length - 1, i + 1)];
    return { p, angle: Math.atan2(b.z - a.z, b.x - a.x) };
  });
  const park = track ? parkSite(plan, track, river) : null;
  // Trees where the world grows its groves (decorate: noise, denser toward the rim).
  const r = rng(plan.seed + 77);
  const trees: Vec2[] = [];
  const busy = (p: Vec2) => dist(p, plan.plaza.c) < plan.plaza.r + 1.2
    || plan.slots.some((sl) => inFootprint(p, sl, 1) || dist(p, sl.yard) < 1.6)
    || distToPolyline(p, river) < plan.riverWidth * 0.7 + 0.6
    || dist(p, plan.pond.c) < plan.pond.r + 0.8
    || plan.mountains.some((m) => dist(p, m.pos) < m.r * 0.9 + 0.4)
    || (!!track && onTrack(p, track, 1.6))
    || (!!park && dist(p, park) < 2.4)
    || (!!mill && dist(p, mill.house) < 1.6);
  for (let n = 0; n < 1400 && trees.length < 70; n++) {
    const th = r() * Math.PI * 2;
    const rr = Math.sqrt(r()) * (plan.radiusAt(th) - 1.1);
    const p = { x: Math.cos(th) * rr, z: Math.sin(th) * rr };
    if (fbm2(p.x * 0.16 + 4, p.z * 0.16) + (rr / plan.R) * 0.55 < 0.42) continue;
    if (busy(p) || trees.some((q) => dist(p, q) < 1.3)) continue;
    trees.push(p);
  }
  return { river, track, park, bridges, mill: mill?.house ?? null, landmarks, houses, trees };
}

/** Each landmark's mark on the map: its colour and a letter. */
const LANDMARK_MARK: Record<LandmarkId, { color: string; letter: string }> = {
  lacrypta: { color: '#f7931a', letter: '₿' },
  nostrwot: { color: '#7c5cff', letter: 'W' },
  coffee: { color: '#8a5a3b', letter: 'C' },
  parrilla: { color: '#d8452b', letter: 'P' },
  liberture: { color: '#e0b43a', letter: 'L' },
};

const deg = (rad: number) => ((rad * 180) / Math.PI).toFixed(1);

/** The island map: ground, mountains, river, pond, plaza, track, bridges,
 *  plus the icons for each stage (hidden until their stage, see styles.css). */
export function islandMap(plan: IslandPlan, f: MapFeatures = mapFeatures(plan)): SVGSVGElement {
  const svg = el('svg', { class: 'loading-map', 'aria-hidden': 'true', preserveAspectRatio: 'xMidYMid meet' });
  const rim = islandOutline(plan);
  el('path', { class: 'lm-shadow', d: pathOf(rim, true), transform: 'translate(0.6 1.4)' }, svg);
  el('path', { class: 'lm-ground', d: pathOf(rim, true) }, svg);
  for (const m of plan.mountains) el('circle', { class: 'lm-mountain', cx: m.pos.x, cy: m.pos.z, r: m.r * 0.8 }, svg);
  el('path', { class: 'lm-river', d: pathOf(f.river, false), 'stroke-width': plan.riverWidth * 1.24 }, svg);
  el('circle', { class: 'lm-pond', cx: plan.pond.c.x, cy: plan.pond.c.z, r: plan.pond.r + 0.25 }, svg);
  el('circle', { class: 'lm-waterfall', cx: plan.waterfall.pos.x, cy: plan.waterfall.pos.z, r: 0.6 }, svg);
  for (const b of f.bridges) {
    el('rect', { class: 'lm-bridge', x: -0.45, y: -plan.riverWidth * 0.95, width: 0.9, height: plan.riverWidth * 1.9, rx: 0.2, transform: `translate(${b.p.x.toFixed(2)} ${b.p.z.toFixed(2)}) rotate(${deg(b.angle)})` }, svg);
  }
  if (f.track) {
    const L = TRACK.halfLength + TRACK.radius, R = TRACK.radius;
    const g = el('g', { transform: `translate(${f.track.c.x.toFixed(2)} ${f.track.c.z.toFixed(2)}) rotate(${deg(f.track.rot)})` }, svg);
    el('rect', { class: 'lm-track', x: -L, y: -R, width: 2 * L, height: 2 * R, rx: R }, g);
    el('rect', { class: 'lm-field', x: -L + 0.7, y: -R + 0.7, width: 2 * L - 1.4, height: 2 * R - 1.4, rx: R - 0.7 }, g);
  }
  if (f.park) el('rect', { class: 'lm-park', x: f.park.x - 1.2, y: f.park.z - 1.2, width: 2.4, height: 2.4, rx: 0.3, transform: f.track ? `rotate(${deg(f.track.rot)} ${f.park.x.toFixed(2)} ${f.park.z.toFixed(2)})` : '' }, svg);
  el('circle', { class: 'lm-plaza', cx: plan.plaza.c.x, cy: plan.plaza.c.z, r: plan.plaza.r }, svg);
  el('circle', { class: 'lm-obelisk', cx: plan.plaza.c.x, cy: plan.plaza.c.z, r: 0.55 }, svg);
  el('circle', { class: 'lm-campfire', cx: plan.campfire.x, cy: plan.campfire.z, r: 0.35 }, svg);

  const trees = el('g', { class: 'lm-icons lm-trees' }, svg);
  f.trees.forEach((p, n) => el('path', { d: `M${p.x.toFixed(2)} ${(p.z - 0.9).toFixed(2)}l0.7 1.4h-1.4Z`, style: `--i:${n % 30}` }, trees));
  const houses = el('g', { class: 'lm-icons lm-houses' }, svg);
  const house = (pos: Vec2, i: number, cls = '') => {
    const g = el('g', { transform: `translate(${pos.x.toFixed(2)} ${pos.z.toFixed(2)})`, style: `--i:${i}`, ...(cls ? { class: cls } : {}) }, houses);
    el('path', { d: 'M-0.9 -0.1L0 -1L0.9 -0.1V0.8H-0.9Z' }, g);
    return g;
  };
  // Landmarks first: each its own colour and letter.
  f.landmarks.forEach((l, i) => {
    const m = LANDMARK_MARK[l.id];
    const g = house(l.pos, i, `lm-landmark lm-${l.id}`);
    g.setAttribute('style', `--i:${i};--lm:${m.color}`);
    el('text', { x: 0, y: 0.55, 'text-anchor': 'middle' }, g).textContent = m.letter;
  });
  f.houses.forEach((p, i) => house(p, f.landmarks.length + i));
  if (f.mill) {
    const g = el('g', { class: 'lm-mill', transform: `translate(${f.mill.x.toFixed(2)} ${f.mill.z.toFixed(2)})`, style: `--i:${f.landmarks.length + f.houses.length}` }, houses);
    el('circle', { r: 0.7 }, g);
  }
  const people = el('g', { class: 'lm-icons lm-people' }, svg);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.4, d = plan.plaza.r * 0.72;
    el('circle', { cx: plan.plaza.c.x + Math.cos(a) * d, cy: plan.plaza.c.z + Math.sin(a) * d, r: 0.32, style: `--i:${i}` }, people);
  }
  return svg;
}

export class LoadingScreen {
  private svg: SVGSVGElement;
  private label: HTMLElement;
  private fill: HTMLElement;
  private stage = -1;

  constructor(private root: HTMLElement, private plan: IslandPlan) {
    this.svg = islandMap(plan);
    root.prepend(this.svg);
    this.label = root.querySelector('.loading-title') as HTMLElement;
    this.fill = root.querySelector('#loading-fill') as HTMLElement;
    this.fit();
    window.addEventListener('resize', this.fit);
    this.setProgress(0);
  }

  private fit = (): void => {
    const w = window.innerWidth || 1, h = window.innerHeight || 1;
    this.svg.setAttribute('viewBox', mapViewBox(this.plan.R, w / h));
  };

  setProgress(progress: number): void {
    const p = Math.max(0, Math.min(1, progress));
    this.fill.style.width = `${p * 100}%`;
    const s = stageAt(p);
    if (s === this.stage) return;
    this.stage = s;
    this.label.textContent = STAGES[s].label;
    this.root.dataset.stage = String(s);
  }

  /** The real island is on screen behind: let it show through. */
  showWorld(): void {
    this.root.classList.add('world');
  }

  /** Fade out; resolves once the fade has finished (or after `fallbackMs`,
   *  if no transition runs: reduced motion, a hidden tab). */
  done(fallbackMs = 900): Promise<void> {
    this.root.classList.add('done');
    window.removeEventListener('resize', this.fit);
    setTimeout(() => this.svg.remove(), 1200);
    return new Promise((resolve) => {
      const finish = (): void => {
        clearTimeout(timer);
        this.root.removeEventListener('transitionend', onEnd);
        resolve();
      };
      const onEnd = (e: TransitionEvent): void => { if (e.target === this.root && e.propertyName === 'opacity') finish(); };
      const timer = setTimeout(finish, fallbackMs);
      this.root.addEventListener('transitionend', onEnd);
    });
  }
}
