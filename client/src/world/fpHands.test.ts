import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { FpHands, handsPose, newArmPose, newViewArm, readArmPose, viewArm, type ArmPose, type PoseState } from './fpHands';
import { BOB_WALK } from './fpFeel';

const S = (o: Partial<PoseState> = {}): PoseState => ({ phase: 0, walk: 0, run: 0, air: 0, turn: 0, t: 0, ...o });

describe('first-person hands, the fallback (no body yet)', () => {
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
    expect(h.followingBody).toBe(false);
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
      if (i > 60) ys.push(h.handOf(1).position.y);
    }
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.02);
  });
});

// A stand-in for the people's skeleton (model units, the mannequin's bone
// names), arms hanging, in a body group scaled and turned like a Character's.
function fakeBody(yaw = 0) {
  const body = new THREE.Group();
  body.rotation.y = yaw;
  body.position.set(3, 0.4, -2);
  const model = new THREE.Group();
  model.scale.setScalar(0.4);
  body.add(model);
  const bones = new Map<string, THREE.Bone>();
  const bone = (name: string, parent: THREE.Object3D, x: number, y: number, z: number) => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(x, y, z);
    parent.add(b);
    bones.set(name, b);
    return b;
  };
  for (const [s, x] of [['l', 0.18], ['r', -0.18]] as const) {
    const up = bone(`upperarm_${s}`, model, x, 1.38, -0.1);
    const lo = bone(`lowerarm_${s}`, up, 0, -0.25, 0);
    const hand = bone(`hand_${s}`, lo, 0, -0.23, 0);
    bone(`index_01_${s}`, hand, 0, -0.09, 0.03);
    bone(`pinky_01_${s}`, hand, 0, -0.08, -0.03);
    const m1 = bone(`middle_01_${s}`, hand, 0, -0.1, 0);
    const m2 = bone(`middle_02_${s}`, m1, 0, -0.045, 0);
    const m3 = bone(`middle_03_${s}`, m2, 0, -0.03, 0);
    bone(`middle_04_leaf_${s}`, m3, 0, -0.025, 0);
  }
  const read = (out: ArmPose = newArmPose()) => { expect(readArmPose((n) => bones.get(n), body, out)).toBe(true); return out; };
  return { body, bones, read };
}

/** Where a point is on screen: right and up per unit ahead, and how far ahead. */
function onScreen(cam: THREE.Camera, p: THREE.Vector3) {
  cam.updateMatrixWorld(true);
  const v = p.clone().applyMatrix4(cam.matrixWorldInverse);
  return { x: v.x / -v.z, y: v.y / -v.z, ahead: -v.z };
}

function eyesAt(pos: THREE.Vector3, yaw = 0, pitch = -0.08) {
  const cam = new THREE.PerspectiveCamera(70, 16 / 9, 0.08, 900);
  cam.position.copy(pos);
  cam.lookAt(pos.clone().add(new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch))));
  return cam;
}

const handWorld = (h: FpHands, side: 1 | -1) => h.handOf(side).getWorldPosition(new THREE.Vector3());

describe('first-person arms follow the body', () => {
  it("read the arms in the body's own frame, whichever way it faces", () => {
    const a = fakeBody(0).read();
    const b = fakeBody(1.2).read();
    for (const k of ['shoulder', 'elbow', 'wrist', 'knuckle'] as const) expect(b.right[k].distanceTo(a.right[k])).toBeLessThan(1e-6);
    // World units: the 0.48 m arm of a 1.8 m model is 0.192 in the village.
    expect(a.right.shoulder.distanceTo(a.right.wrist)).toBeCloseTo(0.48 * 0.4, 4);
    expect(a.right.shoulder.x).toBeLessThan(0); // the body's right is −x (it faces +z)
    expect(a.right.grip).toBe(0); // a straight finger
  });

  it('a hanging arm shows low in its own bottom corner, past the near plane', () => {
    const { read } = fakeBody(0.7);
    const h = new FpHands();
    h.group.visible = true;
    const eye = new THREE.Vector3(1, 0.7, 2);
    const cam = eyesAt(eye, 0.3);
    h.update(cam, { phase: 0, amp: 0, airborne: false, t: 0, eye }, read());
    expect(h.followingBody).toBe(true);
    const tanV = Math.tan(THREE.MathUtils.degToRad(35));
    for (const side of [1, -1] as const) {
      const s = onScreen(cam, handWorld(h, side));
      expect(s.ahead).toBeGreaterThan(0.1);
      expect(Math.sign(s.x)).toBe(side);
      expect(s.y).toBeLessThan(-tanV * 0.4); // the lower part of the view
      expect(s.y).toBeGreaterThan(-tanV); // but in it
      expect(Math.abs(s.x)).toBeLessThan((tanV * 16) / 9);
    }
  });

  it('swing as the clip swings them: opposite arms, opposite phase, the forward hand higher and further ahead', () => {
    const { bones, read } = fakeBody();
    const h = new FpHands();
    h.group.visible = true;
    const eye = new THREE.Vector3(0, 0.7, 0);
    const cam = eyesAt(eye);
    const pose = (l: number) => {
      // A negative turn about the body's x swings the arm forward (+z).
      bones.get('upperarm_l')!.rotation.x = -l;
      bones.get('upperarm_r')!.rotation.x = l;
      h.update(cam, { phase: 0, amp: 0, airborne: false, t: 0, eye }, read());
      return { l: onScreen(cam, handWorld(h, -1)), r: onScreen(cam, handWorld(h, 1)) };
    };
    const a = pose(0.4);
    expect(a.l.y).toBeGreaterThan(a.r.y);
    expect(a.l.ahead).toBeGreaterThan(a.r.ahead);
    const b = pose(-0.4);
    expect(b.r.y).toBeGreaterThan(b.l.y);
    expect(b.r.ahead).toBeGreaterThan(b.l.ahead);
    // Mirror images of each other.
    expect(b.r.y).toBeCloseTo(a.l.y, 6);
    expect(b.r.x).toBeCloseTo(-a.l.x, 6);
  });

  it("keep the clip's own elbow bend and arm proportions, and close the hand as it does", () => {
    const { bones, read } = fakeBody();
    bones.get('upperarm_r')!.rotation.x = 0.5;
    bones.get('lowerarm_r')!.rotation.x = -1.4; // a jog's bent elbow
    for (const n of ['middle_01_r', 'middle_02_r', 'middle_03_r']) bones.get(n)!.rotation.x = 1.2; // a fist
    const body = read();
    const v = viewArm(body.right, 1, newViewArm());
    const bend = (s: THREE.Vector3, e: THREE.Vector3, w: THREE.Vector3) => e.clone().sub(s).angleTo(w.clone().sub(e));
    expect(bend(v.shoulder, v.elbow, v.wrist)).toBeCloseTo(bend(body.right.shoulder, body.right.elbow, body.right.wrist), 6);
    const ratio = v.elbow.distanceTo(v.wrist) / body.right.elbow.distanceTo(body.right.wrist);
    expect(v.shoulder.distanceTo(v.elbow) / body.right.shoulder.distanceTo(body.right.elbow)).toBeCloseTo(ratio, 6);
    expect(body.right.grip).toBeGreaterThan(0.9);
    // The fist in view: fingers curled all the way, the open hand not.
    const h = new FpHands();
    h.group.visible = true;
    const eye = new THREE.Vector3();
    h.update(eyesAt(eye), { phase: 0, amp: 0, airborne: false, t: 0, eye }, body);
    const curlOf = (g: THREE.Object3D) => { let c = 0; g.traverse((o) => { if (o.type === 'Group' && o.rotation.x < 0) c += -o.rotation.x; }); return c; };
    expect(curlOf(h.handOf(1))).toBeGreaterThan(curlOf(h.handOf(-1)) * 3);
  });

  it('arms raised out to the side (a jump) are brought in toward the view, not lost off its edge', () => {
    const { bones, read } = fakeBody();
    bones.get('upperarm_l')!.rotation.z = 1.4; // out to the body's left (+x)
    bones.get('upperarm_r')!.rotation.z = -1.4;
    const body = read();
    const v = viewArm(body.right, 1, newViewArm());
    const out = body.right.shoulder.x - body.right.wrist.x; // the body's right is −x
    expect(out).toBeGreaterThan(0.17);
    expect(v.wrist.x - v.shoulder.x).toBeLessThan(out * 0.8);
    expect(v.wrist.z).toBeLessThan(-0.08); // still ahead of you
  });

  it('hang from your eyes, not the camera: a landing dip or a roll leaves the shoulders with the body', () => {
    const { read } = fakeBody();
    const pose = read();
    const h = new FpHands();
    h.group.visible = true;
    const offsets: number[][] = [];
    // Up through a jump (the eye rides the body), then the camera dips on landing and rolls.
    for (const [eyeY, dip, roll] of [[0.7, 0, 0], [0.82, 0, 0], [0.95, 0, 0], [0.7, -0.016, 0.02], [0.7, -0.01, -0.02]]) {
      const eye = new THREE.Vector3(1, eyeY, 2);
      const cam = eyesAt(eye.clone().setY(eyeY + dip), 0.4);
      cam.rotateZ(roll);
      h.update(cam, { phase: 0, amp: 0, airborne: eyeY > 0.7, t: 0, eye }, pose);
      offsets.push(h.shoulderOf(1).sub(eye).toArray().map((x) => +x.toFixed(6)));
    }
    for (const o of offsets) expect(o).toEqual(offsets[0]);
    // The same pose in the air: the hands don't lift or spread on their own.
    const eye = new THREE.Vector3(0, 0.7, 0);
    h.update(eyesAt(eye), { phase: 0, amp: 0, airborne: false, t: 1, eye }, pose);
    const ground = handWorld(h, 1).sub(eye);
    h.update(eyesAt(eye), { phase: 0, amp: 0, airborne: true, t: 1.5, eye }, pose);
    expect(handWorld(h, 1).sub(eye).distanceTo(ground)).toBeLessThan(1e-9);
  });
});
