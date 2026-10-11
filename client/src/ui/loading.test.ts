// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { LoadingScreen, STAGES, islandMap, mapViewBox, stageAt } from './loading';
import { planIsland, ISLAND_R } from '../world/layout';
import { TOP_DOWN_MARGIN } from '../world/cameraman';

describe('loading stages', () => {
  it('walk through the island being raised, planted, built and woken', () => {
    expect(stageAt(0)).toBe(0);
    expect(stageAt(0.2)).toBe(1);
    expect(stageAt(0.5)).toBe(2);
    expect(stageAt(0.95)).toBe(3);
    expect(stageAt(1)).toBe(STAGES.length - 1);
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

describe('LoadingScreen', () => {
  let root: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = '<div id="loading" class="loading"><div class="loading-inner"><div class="loading-title"></div><div class="loading-bar"><div id="loading-fill"></div></div></div></div>';
    root = document.getElementById('loading')!;
  });
  it('shows the stage and the bar as models arrive, then lets the island through', () => {
    const l = new LoadingScreen(root, planIsland());
    expect(root.querySelector('svg.loading-map')).not.toBeNull();
    expect(root.querySelector('.loading-title')!.textContent).toBe(STAGES[0].label);
    l.setProgress(0.5);
    expect(root.dataset.stage).toBe('2');
    expect(root.querySelector('.loading-title')!.textContent).toBe(STAGES[2].label);
    expect((root.querySelector('#loading-fill') as HTMLElement).style.width).toBe('50%');
    l.showWorld();
    expect(root.classList.contains('world')).toBe(true);
    l.done();
    expect(root.classList.contains('done')).toBe(true);
  });
});
