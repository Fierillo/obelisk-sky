import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildExerciseClip, repsDone, EXERCISES } from './exercises';

/** A stick figure with the people's bone names, metres, facing +z, left at +x. */
function figure(): THREE.Object3D {
  const g = new THREE.Group();
  const bone = (name: string, parent: THREE.Object3D, x: number, y: number, z: number) => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(x, y, z);
    parent.add(b);
    return b;
  };
  const root = bone('root', g, 0, 0, 0);
  const pelvis = bone('pelvis', root, 0, 0.95, 0);
  const spine = bone('spine_01', pelvis, 0, 0.45, 0);
  bone('Head', spine, 0, 0.2, 0);
  for (const [s, x] of [['l', 1], ['r', -1]] as const) {
    const ua = bone(`upperarm_${s}`, spine, 0.2 * x, 0, 0);
    const la = bone(`lowerarm_${s}`, ua, 0, -0.3, 0);
    const h = bone(`hand_${s}`, la, 0, -0.27, 0);
    bone(`middle_01_${s}`, h, 0, -0.09, 0);
    const th = bone(`thigh_${s}`, pelvis, 0.1 * x, -0.05, 0);
    const ca = bone(`calf_${s}`, th, 0, -0.45, 0);
    const ft = bone(`foot_${s}`, ca, 0, -0.42, 0);
    bone(`ball_${s}`, ft, 0, -0.03, 0.14);
  }
  g.updateMatrixWorld(true);
  return g;
}

function poseAt(clip: THREE.AnimationClip, t: number): THREE.Object3D {
  const f = figure();
  const mixer = new THREE.AnimationMixer(f);
  mixer.clipAction(clip).play();
  mixer.setTime(t);
  f.updateMatrixWorld(true);
  return f;
}
const y = (o: THREE.Object3D, n: string) => o.getObjectByName(n)!.getWorldPosition(new THREE.Vector3()).y;
// The stick figure has no thumb or knuckle line, so its grip point is the wrist.
const palmY = (o: THREE.Object3D) => (y(o, 'hand_l') + y(o, 'hand_r')) / 2;

describe('exercise clips', () => {
  it('hang from the bar at its height, top and bottom of a pull-up', () => {
    const clip = buildExerciseClip('pullup', figure(), 2.8);
    for (const k of EXERCISES.pullup.keys) expect(palmY(poseAt(clip, k.t))).toBeCloseTo(2.8, 2);
    // Pulled up, the head is near the bar; hanging, well below it.
    expect(y(poseAt(clip, 0.9), 'Head')).toBeGreaterThan(y(poseAt(clip, 0), 'Head') + 0.3);
  });
  it('support on the parallel bars with the feet off the floor', () => {
    const clip = buildExerciseClip('dip', figure(), 1.25);
    const top = poseAt(clip, 0);
    expect(palmY(top)).toBeCloseTo(1.25, 2);
    expect(Math.min(y(top, 'ball_l'), y(top, 'ball_r'))).toBeGreaterThan(0.05);
    expect(y(poseAt(clip, 1.0), 'Head')).toBeLessThan(y(top, 'Head'));
  });
  it('push-ups keep hands and toes on the floor and lower the chest', () => {
    const clip = buildExerciseClip('pushup', figure(), 0);
    const up = poseAt(clip, 0), down = poseAt(clip, 0.9);
    for (const p of [up, down]) {
      expect(palmY(p)).toBeCloseTo(0, 2);
      expect(Math.min(y(p, 'ball_l'), y(p, 'ball_r'))).toBeLessThan(0.08);
    }
    expect(y(down, 'spine_01')).toBeLessThan(y(up, 'spine_01') - 0.05);
  });
  it('counts finished repetitions', () => {
    expect(repsDone('pullup', 0)).toBe(0);
    expect(repsDone('pullup', 2.29)).toBe(0);
    expect(repsDone('pullup', 4.7)).toBe(2);
  });
});

describe('dips grip both parallel bars', () => {
  it('puts each palm over its bar, at any bar width', () => {
    for (const half of [0.22, 0.3]) {
      const clip = buildExerciseClip('dip', figure(), 1.25, `dip-${half}`, half);
      for (const t of [0, 1.0]) {
        const f = poseAt(clip, t);
        const x = (n: string) => f.getObjectByName(n)!.getWorldPosition(new THREE.Vector3()).x;
        expect(Math.abs(x('hand_l') - x('hand_r')) / 2).toBeCloseTo(half, 2);
        expect(palmY(f)).toBeCloseTo(1.25, 2);
      }
    }
  });
});

describe('the bar stays in the hands, never through the body', () => {
  it('pull-ups and muscle-ups keep the palms on the bar line (y and front-back) at every key', () => {
    for (const kind of ['pullup', 'muscleup'] as const) {
      const clip = buildExerciseClip(kind, figure(), 2.8);
      for (const k of EXERCISES[kind].keys) {
        const f = poseAt(clip, k.t);
        const z = (n: string) => f.getObjectByName(n)!.getWorldPosition(new THREE.Vector3()).z;
        expect(palmY(f)).toBeCloseTo(2.8, 2);
        expect((z('hand_l') + z('hand_r')) / 2).toBeCloseTo(0, 2);
      }
    }
  });
  it('muscle-ups swing (kip) before the pull', () => {
    const clip = buildExerciseClip('muscleup', figure(), 2.8);
    const feetZ = (t: number) => poseAt(clip, t).getObjectByName('ball_l')!.getWorldPosition(new THREE.Vector3()).z;
    expect(Math.abs(feetZ(0.45) - feetZ(0.95))).toBeGreaterThan(0.25);
  });
});

describe('gym lifts', () => {
  const pos = (o: THREE.Object3D, n: string) => o.getObjectByName(n)!.getWorldPosition(new THREE.Vector3());
  it('squats keep the feet planted and drop the hips', () => {
    const clip = buildExerciseClip('squat', figure(), 0);
    const up = poseAt(clip, 0), low = poseAt(clip, 1.3);
    const sole = (f: THREE.Object3D) => Math.min(y(f, 'foot_l'), y(f, 'foot_r'), y(f, 'ball_l'), y(f, 'ball_r'));
    const rest = sole(figure());
    for (const f of [up, low]) {
      expect(sole(f)).toBeCloseTo(rest, 2);
      expect(Math.abs(pos(f, 'foot_l').z)).toBeLessThan(0.05);
    }
    expect(y(low, 'pelvis')).toBeLessThan(y(up, 'pelvis') - 0.25);
  });
  it('curls bring the hands up to the shoulders and back down', () => {
    const clip = buildExerciseClip('curl', figure(), 0);
    expect(palmY(poseAt(clip, 1.0))).toBeGreaterThan(palmY(poseAt(clip, 0)) + 0.25);
  });
  it('bench press lies on the bench and pushes the bar up from the chest', () => {
    const clip = buildExerciseClip('benchpress', figure(), 0.5);
    const up = poseAt(clip, 0), down = poseAt(clip, 1.2);
    for (const f of [up, down]) {
      // Lying: head and pelvis level, just above the bench.
      expect(Math.abs(y(f, 'Head') - y(f, 'pelvis'))).toBeLessThan(0.15);
      expect(y(f, 'pelvis')).toBeGreaterThan(0.5);
      expect(y(f, 'pelvis')).toBeLessThan(0.75);
    }
    expect(palmY(up)).toBeGreaterThan(palmY(down) + 0.2);
    expect(palmY(down)).toBeGreaterThan(y(down, 'spine_01') - 0.05); // the bar stays above the chest
  });
  it('counts reps for every exercise', () => {
    for (const k of Object.keys(EXERCISES) as (keyof typeof EXERCISES)[]) {
      const keys = EXERCISES[k].keys;
      expect(repsDone(k, keys[keys.length - 1].t * 3 + 0.01)).toBe(3);
    }
  });
});

describe('the lotus pose', () => {
  const pos = (o: THREE.Object3D, n: string) => o.getObjectByName(n)!.getWorldPosition(new THREE.Vector3());
  it('sits on the ground cross-legged, upright, knees out, hands on the knees', () => {
    const clip = buildExerciseClip('lotus', figure(), 0);
    for (const t of [0, 1.2, 2.4]) {
      const f = poseAt(clip, t);
      const low = Math.min(...['foot_l', 'foot_r', 'ball_l', 'ball_r', 'calf_l', 'calf_r'].map((n) => y(f, n)));
      // Nothing below the ground, the seat close above it.
      expect(low).toBeGreaterThan(-0.01);
      expect(y(f, 'pelvis')).toBeGreaterThan(0.03);
      expect(y(f, 'pelvis')).toBeLessThan(0.3);
      // Upright: the head over the pelvis.
      expect(y(f, 'Head') - y(f, 'pelvis')).toBeGreaterThan(0.55);
      // Knees wide (to the sides), shins crossed in front.
      expect(pos(f, 'calf_l').x).toBeGreaterThan(0.3);
      expect(pos(f, 'calf_r').x).toBeLessThan(-0.3);
      expect(pos(f, 'foot_l').x).toBeLessThan(pos(f, 'calf_l').x - 0.25);
      // Hands rest near the knees.
      expect(pos(f, 'hand_l').distanceTo(pos(f, 'calf_l'))).toBeLessThan(0.3);
      expect(pos(f, 'hand_r').distanceTo(pos(f, 'calf_r'))).toBeLessThan(0.3);
    }
  });
});
