import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { FpHands, handsPose, type PoseState } from './fpHands';
import { BOB_WALK } from './fpFeel';

const S = (o: Partial<PoseState> = {}): PoseState => ({ phase: 0, walk: 0, run: 0, air: 0, turn: 0, t: 0, ...o });

describe('first-person hands', () => {
  it('rest low in the corners, one each side, loose, still when you stand', () => {
    const a = handsPose(S());
    const b = handsPose(S({ phase: 2 }));
    expect(a.left.x).toBeLessThan(0);
    expect(a.right.x).toBeGreaterThan(0);
    expect(a.right.y).toBeLessThan(0);
    expect(a.right.z).toBeLessThan(-0.1); // in front of you, past the near plane
    expect(b.right).toEqual(a.right);
    expect(a.right.grip).toBeLessThan(0.5);
  });

  it('swing opposite each other as you walk, rising as they come forward', () => {
    const p = handsPose(S({ phase: Math.PI / 2, walk: 1 }));
    const rest = handsPose(S());
    // One forward (more negative z), the other back.
    expect(Math.sign(p.right.z - rest.right.z)).toBe(-Math.sign(p.left.z - rest.left.z));
    const fwd = p.right.z < p.left.z ? p.right : p.left;
    const back = fwd === p.right ? p.left : p.right;
    expect(fwd.y).toBeGreaterThan(back.y);
    expect(Math.abs(p.right.z - rest.right.z)).toBeLessThan(0.04);
  });

  it('running: elbows bent (hands higher and in), fists closed, a bigger swing', () => {
    const walk = handsPose(S({ phase: Math.PI / 2, walk: 1 }));
    const run = handsPose(S({ phase: Math.PI / 2, walk: 1, run: 1 }));
    expect(Math.abs(run.right.x)).toBeLessThan(Math.abs(walk.right.x));
    expect(run.left.y).toBeGreaterThan(walk.left.y);
    expect(run.right.grip).toBeGreaterThan(0.9);
    expect(Math.abs(run.right.z - run.left.z)).toBeGreaterThan(Math.abs(walk.right.z - walk.left.z));
  });

  it('lift and spread in a jump, and trail a turn', () => {
    const g = handsPose(S());
    const j = handsPose(S({ air: 1 }));
    expect(j.right.y).toBeGreaterThan(g.right.y);
    expect(j.right.x).toBeGreaterThan(g.right.x);
    expect(j.left.x).toBeLessThan(g.left.x);
    const turning = handsPose(S({ turn: 2 }));
    expect(turning.right.x).toBeLessThan(g.right.x);
    expect(turning.left.x).toBeLessThan(g.left.x);
  });

  it('follow the camera, take your colours, and close the fingers when running', () => {
    const h = new FpHands();
    h.group.visible = true;
    h.setColors('#a97c5f', '#3d7bd9');
    const cam = new THREE.PerspectiveCamera();
    cam.position.set(1, 2, 3);
    h.update(cam, { phase: 0, amp: 0, airborne: false, t: 0 });
    expect(h.group.position.toArray()).toEqual([1, 2, 3]);
    const mats = new Set<string>();
    h.group.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (m) mats.add(m.color.getHexString()); });
    expect(mats.has(new THREE.Color('#3d7bd9').getHexString())).toBe(true);
    const curlOf = () => { let sum = 0; h.group.traverse((o) => { if (o.type === 'Group' && o.rotation.x < 0) sum += -o.rotation.x; }); return sum; };
    const loose = curlOf();
    for (let i = 1; i <= 60; i++) h.update(cam, { phase: i * 0.3, amp: 0.008, airborne: false, t: i / 30, running: true });
    expect(curlOf()).toBeGreaterThan(loose);
  });
});

describe('first-person hands, stepping', () => {
  const range = (o: Partial<PoseState>, k: 'y' | 'z') => {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < 64; i++) {
      const v = handsPose(S({ ...o, phase: (i / 64) * Math.PI * 2 })).right[k];
      lo = Math.min(lo, v); hi = Math.max(hi, v);
    }
    return hi - lo;
  };
  it('bob up and down clearly with every step when you walk, not a tremble', () => {
    expect(range({ walk: 1 }, 'y')).toBeGreaterThan(0.025);
    expect(range({}, 'y')).toBeLessThan(0.004);
  });
  it('running bobs and swings higher than walking', () => {
    expect(range({ walk: 1, run: 1 }, 'y')).toBeGreaterThan(range({ walk: 1 }, 'y') * 1.6);
    expect(range({ walk: 1, run: 1 }, 'z')).toBeGreaterThan(range({ walk: 1 }, 'z') * 1.4);
  });
  it('dip on each footfall: two dips a stride', () => {
    const ys = Array.from({ length: 64 }, (_, i) => handsPose(S({ walk: 1, phase: (i / 64) * Math.PI * 2 })).left.y + handsPose(S({ walk: 1, phase: (i / 64) * Math.PI * 2 })).right.y);
    let minima = 0;
    for (let i = 0; i < 64; i++) if (ys[i] < ys[(i + 63) % 64] && ys[i] < ys[(i + 1) % 64]) minima++;
    expect(minima).toBe(2);
  });
  it('a plain walk is a full walk (the hands don\'t hang still at walking pace)', () => {
    const h = new FpHands();
    h.group.visible = true;
    const cam = new THREE.PerspectiveCamera();
    const ys: number[] = [];
    for (let i = 1; i <= 120; i++) {
      h.update(cam, { phase: i * 0.25, amp: BOB_WALK, airborne: false, t: i / 60 });
      if (i > 60) ys.push(h.group.children[1].position.y);
    }
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.02);
  });
});
