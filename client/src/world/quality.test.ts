import { describe, it, expect } from 'vitest';
import { adaptStep, newAdapt, startLevel, type Adapt } from './quality';

const run = (a: Adapt, fps: number, seconds: number) => {
  const changes: string[] = [];
  for (let t = 0; t < seconds; t += 1 / fps) { const l = adaptStep(a, 1 / fps); if (l) changes.push(l); }
  return changes;
};

describe('automatic quality', () => {
  it('starts phones low and desktops high', () => {
    expect(startLevel({ coarse: true, memory: 4, cores: 8, short: 390 })).toBe('low');
    expect(startLevel({ coarse: true, memory: 8, cores: 8, short: 800 })).toBe('medium');
    expect(startLevel({ coarse: false, memory: 16, cores: 12, short: 1080 })).toBe('high');
    expect(startLevel({ coarse: false, memory: 4, cores: 4, short: 800 })).toBe('medium');
    expect(startLevel({ coarse: false, short: 900 })).toBe('high');
  });

  it('steps down when frames are slow', () => {
    const a = newAdapt('high');
    expect(run(a, 30, 20)).toEqual(['medium', 'low']);
  });

  it('steps back up with headroom, but not into a level that was too slow', () => {
    const a = newAdapt('medium');
    expect(run(a, 60, 60)).toEqual(['high', 'ultra']);
    const b = newAdapt('high');
    run(b, 30, 6); // too slow on high
    expect(b.level).toBe('medium');
    expect(run(b, 60, 120)).toEqual([]); // fine on medium, but high was too much
  });

  it('holds steady in between', () => {
    expect(run(newAdapt('high'), 50, 60)).toEqual([]);
  });
});
