// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { LOAD, LoadingScreen, STAGES, loadAt, islandMap, mapFeatures, mapViewBox, stageAt } from './loading';
import { dist, distToPolyline, onTrack, planIsland, ISLAND_R } from '../world/layout';
import { LANDMARKS } from '../world/landmarks';
import { TOP_DOWN_MARGIN } from '../world/cameraman';

describe('loading stages', () => {
  it('walk through the island being raised, planted, built and woken', () => {
    expect(stageAt(0)).toBe(0);
    expect(stageAt(0.2)).toBe(1);
    expect(stageAt(0.5)).toBe(2);
    expect(stageAt(0.7)).toBe(3);
    expect(stageAt(0.85)).toBe(4);
    expect(stageAt(0.95)).toBe(5);
    expect(stageAt(1)).toBe(STAGES.length - 1);
  });
  it('weigh the boot: models, people, the village, the warm-up; 1 only once warm', () => {
    expect(loadAt('models', 0)).toBe(0);
    expect(loadAt('models', 1)).toBeCloseTo(0.6);
    expect(loadAt('people', 0.5)).toBeCloseTo(0.7);
    expect(loadAt('people', 1)).toBeCloseTo(0.8);
    expect(loadAt('village', 1)).toBeCloseTo(0.88);
    expect(loadAt('warm', 0.999)).toBeLessThan(1);
    expect(loadAt('warm', 1)).toBe(1);
    expect(loadAt('people', 3)).toBeCloseTo(0.8);
    // The parts follow one another with no gap, and the stages start on them.
    const parts = Object.values(LOAD);
    for (let i = 1; i < parts.length; i++) expect(parts[i][0]).toBe(parts[i - 1][1]);
    expect(stageAt(loadAt('people', 0))).toBe(3);
    expect(stageAt(loadAt('village', 0))).toBe(4);
    expect(stageAt(loadAt('warm', 0))).toBe(5);
    expect(STAGES.map((s) => s.label).every(Boolean)).toBe(true);
  });
});

describe('the map', () => {
  it('frames the island like the top-down camera', () => {
    const [x, y, w, h] = mapViewBox(ISLAND_R, 2).split(' ').map(Number);
    expect(h).toBeCloseTo(2 * ISLAND_R * TOP_DOWN_MARGIN, 1);
    expect(w).toBeCloseTo(h * 2, 1);
    expect(x).toBeCloseTo(-w / 2, 1);
    expect(y).toBeCloseTo(-h / 2, 1);
    // Portrait: the width holds the island.
    const [, , pw] = mapViewBox(ISLAND_R, 0.5).split(' ').map(Number);
    expect(pw).toBeCloseTo(2 * ISLAND_R * TOP_DOWN_MARGIN, 1);
  });
  it('draws the ground, river, pond, plaza and the icons for each stage', () => {
    const svg = islandMap(planIsland());
    for (const c of ['lm-ground', 'lm-river', 'lm-pond', 'lm-plaza', 'lm-obelisk']) expect(svg.querySelector(`.${c}`), c).not.toBeNull();
    expect(svg.querySelectorAll('.lm-trees > *').length).toBeGreaterThan(10);
    expect(svg.querySelectorAll('.lm-houses > *').length).toBeGreaterThan(5);
    expect(svg.querySelectorAll('.lm-people > *').length).toBeGreaterThan(3);
  });
});

describe('the map matches the village', () => {
  const plan = planIsland();
  const f = mapFeatures(plan);
  it('marks every landmark in its own slot, and the track and park', () => {
    expect(f.landmarks.map((l) => l.id).sort()).toEqual(LANDMARKS.map((d) => d.id).sort());
    expect(f.track).not.toBeNull();
    expect(f.park).not.toBeNull();
    expect(f.bridges).toHaveLength(3);
    const svg = islandMap(plan, f);
    for (const id of LANDMARKS.map((d) => d.id)) expect(svg.querySelector(`.lm-${id}`), id).not.toBeNull();
    for (const c of ['lm-track', 'lm-park', 'lm-bridge', 'lm-campfire']) expect(svg.querySelector(`.${c}`), c).not.toBeNull();
  });
  it('puts no house or tree on the river, the track or a landmark', () => {
    const spots = [...f.houses, ...f.trees];
    for (const p of spots) {
      expect(distToPolyline(p, f.river)).toBeGreaterThan(plan.riverWidth * 0.5);
      expect(onTrack(p, f.track!, 0.2)).toBe(false);
    }
    for (const h of f.houses) for (const l of f.landmarks) expect(dist(h, l.pos)).toBeGreaterThan(0.5);
    expect(f.trees.length).toBeGreaterThan(20);
  });
});

describe('LoadingScreen', () => {
  let root: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = '<div id="loading" class="loading"><div class="loading-inner"><div class="loading-title"></div><div class="loading-bar"><div id="loading-fill"></div></div></div></div>';
    root = document.getElementById('loading')!;
  });
  it('shows the stage and the bar as models arrive, then lets the island through', async () => {
    const l = new LoadingScreen(root, planIsland());
    expect(root.querySelector('svg.loading-map')).not.toBeNull();
    expect(root.querySelector('.loading-title')!.textContent).toBe(STAGES[0].label);
    l.setProgress(0.5);
    expect(root.dataset.stage).toBe('2');
    expect(root.querySelector('.loading-title')!.textContent).toBe(STAGES[2].label);
    expect((root.querySelector('#loading-fill') as HTMLElement).style.width).toBe('50%');
    l.showWorld();
    expect(root.classList.contains('world')).toBe(true);
    const faded = l.done(20);
    expect(root.classList.contains('done')).toBe(true);
    await faded; // no CSS transitions in jsdom: the fallback resolves it
  });

  it('resolves when its own opacity fade ends', async () => {
    const l = new LoadingScreen(root, planIsland());
    let resolved = false;
    const faded = l.done(10_000).then(() => { resolved = true; });
    const ev = new Event('transitionend') as TransitionEvent;
    Object.defineProperty(ev, 'propertyName', { value: 'opacity' });
    root.dispatchEvent(ev);
    await faded;
    expect(resolved).toBe(true);
  });
});
