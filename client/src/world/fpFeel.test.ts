import { describe, it, expect } from 'vitest';
import { FpFeel, RUN_FOV_KICK, type FeelInput } from './fpFeel';

const still: FeelInput = { speed: 0, running: false, airborne: false, landed: false, strafe: 0, turn: 0 };
const run = (f: FpFeel, seconds: number, i: Partial<FeelInput>) => {
  const out = [];
  for (let t = 0; t < seconds; t += 1 / 60) out.push(f.step(1 / 60, { ...still, ...i }));
  return out;
};

describe('first-person feel', () => {
  it('is perfectly still when you stand still', () => {
    const o = run(new FpFeel(), 1, {}).at(-1)!;
    expect(Math.abs(o.up) + Math.abs(o.side) + Math.abs(o.roll) + Math.abs(o.fov)).toBeLessThan(1e-6);
  });

  it('bobs with your steps, more when running, never above the eye', () => {
    const walk = run(new FpFeel(), 2, { speed: 0.78 }).slice(60);
    const sprint = run(new FpFeel(), 2, { speed: 2.6, running: true }).slice(60);
    const range = (xs: { up: number }[]) => Math.max(...xs.map((x) => x.up)) - Math.min(...xs.map((x) => x.up));
    expect(range(walk)).toBeGreaterThan(0.004);
    expect(range(sprint)).toBeGreaterThan(range(walk) * 1.5);
    expect(Math.max(...sprint.map((x) => x.up))).toBeLessThanOrEqual(1e-9);
  });

  it('stops bobbing in the air and dips on landing, then settles', () => {
    const f = new FpFeel();
    run(f, 1, { speed: 2.6, running: true });
    const air = run(f, 0.6, { speed: 2.6, running: true, airborne: true }).at(-1)!;
    expect(Math.abs(air.up)).toBeLessThan(0.002);
    const land = f.step(1 / 60, { ...still, landed: true });
    const after = run(f, 0.12, {});
    expect(Math.min(land.up, ...after.map((x) => x.up))).toBeLessThan(-0.008);
    expect(Math.abs(run(f, 1.5, {}).at(-1)!.up)).toBeLessThan(1e-3);
  });

  it('widens the view when you run and leans into a strafe', () => {
    const o = run(new FpFeel(), 2, { speed: 2.6, running: true, strafe: 1 }).at(-1)!;
    expect(o.fov).toBeGreaterThan(RUN_FOV_KICK * 0.9);
    expect(Math.abs(o.roll)).toBeGreaterThan(0.01);
  });
});
