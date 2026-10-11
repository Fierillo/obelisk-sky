// "Automatic" quality: where to start on this device, and when to step down
// (frames too slow) or back up (plenty of headroom). Pure, so the rules are
// testable; Post (post.ts) feeds it frame times.

export type Level = 'low' | 'medium' | 'high' | 'ultra';
export const ORDER: Level[] = ['low', 'medium', 'high', 'ultra'];

export interface Device {
  /** A touch screen is the main pointer (phones, tablets). */
  coarse: boolean;
  /** navigator.deviceMemory (GB), when the browser tells. */
  memory?: number;
  /** navigator.hardwareConcurrency. */
  cores?: number;
  /** The smaller side of the screen, CSS px. */
  short: number;
}

/** A first guess before any frame is timed: phones and small machines start lower. */
export function startLevel(d: Device): Level {
  const weak = (d.memory !== undefined && d.memory <= 4) || (d.cores !== undefined && d.cores <= 4);
  if (d.coarse) return weak || d.short < 500 ? 'low' : 'medium';
  return weak ? 'medium' : 'high';
}

/** Frames slower than this (on average) step the level down… */
export const DOWN_BELOW_FPS = 40;
/** …and faster than this for a long while step it back up. */
export const UP_ABOVE_FPS = 57;
export const DOWN_WINDOW = 90;
export const UP_WINDOW = 300;

export interface Adapt {
  level: Level;
  /** Never step up to this level again (it was too slow once), or null. */
  ceiling: Level | null;
  times: number[];
  cooldown: number;
}

export function newAdapt(level: Level, ceiling: Level | null = null): Adapt {
  return { level, ceiling, times: [], cooldown: 5 };
}

/** Feed one frame time; returns the new level when it changes. */
export function adaptStep(a: Adapt, dt: number): Level | null {
  a.cooldown -= dt;
  a.times.push(dt);
  if (a.times.length > UP_WINDOW) a.times.shift();
  if (a.cooldown > 0 || a.times.length < DOWN_WINDOW) return null;
  const recent = a.times.slice(-DOWN_WINDOW);
  const avg = recent.reduce((s, x) => s + x, 0) / recent.length;
  const i = ORDER.indexOf(a.level);
  if (avg > 1 / DOWN_BELOW_FPS && i > 0) {
    // Too slow: down, and remember not to come back up this far.
    a.ceiling = a.level;
    a.level = ORDER[i - 1];
    a.times = [];
    a.cooldown = 5;
    return a.level;
  }
  const up = ORDER[i + 1];
  if (up && (!a.ceiling || ORDER.indexOf(up) < ORDER.indexOf(a.ceiling)) && a.times.length >= UP_WINDOW) {
    const all = a.times.reduce((s, x) => s + x, 0) / a.times.length;
    if (all < 1 / UP_ABOVE_FPS) {
      a.level = up;
      a.times = [];
      a.cooldown = 20;
      return a.level;
    }
  }
  return null;
}
