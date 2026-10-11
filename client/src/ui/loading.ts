// The loading screen: the island seen from straight above, first as an SVG
// map drawn from the plan (instant, no models), then the real ground
// rendered behind it by the same top-down camera, with trees, houses and
// villagers popping in as their models arrive.

import { TOP_DOWN_MARGIN } from '../world/cameraman';
import { islandOutline, rng, type IslandPlan, type Vec2 } from '../world/layout';
import { smoothRiver } from '../world/island';

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

/** The island map: ground, mountains, river, pond, plaza, plus the icons
 *  for each stage (hidden until their stage, see styles.css). */
export function islandMap(plan: IslandPlan): SVGSVGElement {
  const svg = el('svg', { class: 'loading-map', 'aria-hidden': 'true', preserveAspectRatio: 'xMidYMid meet' });
  const rim = islandOutline(plan);
  el('path', { class: 'lm-shadow', d: pathOf(rim, true), transform: 'translate(0.6 1.4)' }, svg);
  el('path', { class: 'lm-ground', d: pathOf(rim, true) }, svg);
  for (const m of plan.mountains) el('circle', { class: 'lm-mountain', cx: m.pos.x, cy: m.pos.z, r: m.r * 0.8 }, svg);
  el('path', { class: 'lm-river', d: pathOf(smoothRiver(plan, 60), false), 'stroke-width': plan.riverWidth * 1.24 }, svg);
  el('circle', { class: 'lm-pond', cx: plan.pond.c.x, cy: plan.pond.c.z, r: plan.pond.r + 0.25 }, svg);
  el('circle', { class: 'lm-plaza', cx: plan.plaza.c.x, cy: plan.plaza.c.z, r: plan.plaza.r }, svg);
  el('circle', { class: 'lm-obelisk', cx: plan.plaza.c.x, cy: plan.plaza.c.z, r: 0.55 }, svg);

  // Trees on open ground, houses on the slots nearest the plaza, people on the plaza.
  const r = rng(plan.seed + 3);
  const trees = el('g', { class: 'lm-icons lm-trees' }, svg);
  for (let i = 0, n = 0; i < 400 && n < 26; i++) {
    const th = r() * Math.PI * 2, rad = Math.sqrt(r()) * (plan.radiusAt(th) - 1.5);
    const p = { x: Math.cos(th) * rad, z: Math.sin(th) * rad };
    if (Math.hypot(p.x - plan.plaza.c.x, p.z - plan.plaza.c.z) < plan.plaza.r + 1.5) continue;
    if (plan.slots.some((s) => Math.hypot(p.x - s.pos.x, p.z - s.pos.z) < s.w + 0.6)) continue;
    if (Math.hypot(p.x - plan.pond.c.x, p.z - plan.pond.c.z) < plan.pond.r + 1) continue;
    el('path', { d: `M${p.x.toFixed(2)} ${(p.z - 0.9).toFixed(2)}l0.7 1.4h-1.4Z`, style: `--i:${n++}` }, trees);
  }
  const houses = el('g', { class: 'lm-icons lm-houses' }, svg);
  plan.slots.slice(0, 14).forEach((s, i) => {
    const g = el('g', { transform: `translate(${s.pos.x.toFixed(2)} ${s.pos.z.toFixed(2)})`, style: `--i:${i}` }, houses);
    el('path', { d: 'M-0.9 -0.1L0 -1L0.9 -0.1V0.8H-0.9Z' }, g);
  });
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
