// A fixed budget of point and spot lights. Every lamp, fire and glowing sign
// in the village is a real light, and every lit pixel pays for each one in
// the scene, lit or not. Only the few nearest where you're looking stay on.
// The counts stay constant (when there are enough lights), so turning
// lights over never makes three.js recompile its shaders.

export interface LightSpot {
  x: number;
  y: number;
  z: number;
  kind: 'point' | 'spot';
  /** Currently giving light (night, a fire): preferred over dark ones. */
  lit: boolean;
}

export interface Budget { point: number; spot: number }

/** Budgets by device: phones and the lowest quality get fewer. */
export function lightBudget(coarse: boolean, level: string): Budget {
  if (level === 'low') return { point: 2, spot: 1 };
  if (coarse || level === 'medium') return { point: 4, spot: 1 };
  return { point: 7, spot: 2 };
}

/** Indices of the lights to keep on: lit ones nearest `to` first, padded with
 *  the nearest dark ones so each kind keeps exactly its budget. */
export function chooseLights(lights: readonly LightSpot[], to: { x: number; y: number; z: number }, budget: Budget): Set<number> {
  const keep = new Set<number>();
  for (const kind of ['point', 'spot'] as const) {
    const ranked = lights
      .map((l, i) => ({ i, l, d: (l.x - to.x) ** 2 + (l.y - to.y) ** 2 + (l.z - to.z) ** 2 }))
      .filter((r) => r.l.kind === kind)
      .sort((a, b) => Number(b.l.lit) - Number(a.l.lit) || a.d - b.d);
    for (const r of ranked.slice(0, budget[kind])) keep.add(r.i);
  }
  return keep;
}
