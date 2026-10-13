// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { Cameraman, introEase, topDownHeight, TOP_DOWN_MARGIN } from './cameraman';
import { ISLAND_R } from './layout';

const forward = (c: THREE.Camera) => new THREE.Vector3(0, 0, -1).applyQuaternion(c.quaternion);
const screenUp = (c: THREE.Camera) => new THREE.Vector3(0, 1, 0).applyQuaternion(c.quaternion);

describe('topDownHeight', () => {
  it('fits the island and its margin in the shorter side of the screen', () => {
    const h = topDownHeight(ISLAND_R, 32, 16 / 9);
    expect(h * Math.tan(THREE.MathUtils.degToRad(16))).toBeCloseTo(ISLAND_R * TOP_DOWN_MARGIN, 6);
    // Portrait: the width is the limit, so the camera goes higher.
    expect(topDownHeight(ISLAND_R, 32, 0.5)).toBeCloseTo(h * 2, 6);
  });
});

describe('the intro', () => {
  let camera: THREE.PerspectiveCamera;
  let cam: Cameraman;
  beforeEach(() => {
    camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.08, 900);
    cam = new Cameraman(camera, document.createElement('div'));
  });
  const run = (seconds: number, step = 1 / 30) => { for (let t = 0; t < seconds; t += step) cam.update(step); };

  it('holds straight down on the island, north up, while it loads', () => {
    cam.holdTopDown(ISLAND_R);
    run(5);
    expect(camera.position.x).toBeCloseTo(0, 6);
    expect(camera.position.z).toBeCloseTo(0, 6);
    expect(camera.position.y).toBeCloseTo(topDownHeight(ISLAND_R, 32, 16 / 9), 4);
    expect(forward(camera).y).toBeCloseTo(-1, 6);
    expect(screenUp(camera).z).toBeCloseTo(-1, 6); // matches the SVG map: world -z is up
    expect(cam.inIntro).toBe(true);
    expect(cam.introProgress).toBe(0);
  });

  it('swings down to the whole-island view and hands over to the orbit controls', () => {
    cam.holdTopDown(ISLAND_R);
    cam.playIntro(2);
    run(1);
    expect(cam.introProgress).toBeGreaterThan(0.2);
    expect(cam.introProgress).toBeLessThan(0.85);
    run(1.2);
    expect(cam.inIntro).toBe(false);
    expect(camera.position.distanceTo(new THREE.Vector3(22, 20.5, 44))).toBeLessThan(1e-3);
    expect(cam.controls.target.distanceTo(new THREE.Vector3(0, -0.5, 1))).toBeLessThan(1e-3);
    expect(camera.up.toArray()).toEqual([0, 1, 0]);
    expect(cam.introProgress).toBe(1);
  });

  it('lands behind your character when you are on the island', () => {
    const me = new THREE.Vector3(4, 0.5, 2); // a personAnchor: 0.5 above the ground
    cam.followPlayer(() => me.clone());
    cam.holdTopDown(ISLAND_R);
    cam.playIntro(1);
    run(1.2);
    expect(cam.controls.target.distanceTo(new THREE.Vector3(4, 0.6, 2))).toBeLessThan(1e-3);
    expect(camera.position.distanceTo(cam.controls.target)).toBeCloseTo(11, 3);
    expect(cam.playing).toBe(true);
  });

  /** The largest camera move between two 30 fps frames over `seconds`. */
  const maxStep = (seconds: number) => {
    let last = camera.position.clone();
    let max = 0;
    for (let t = 0; t < seconds; t += 1 / 30) {
      cam.update(1 / 30);
      max = Math.max(max, camera.position.distanceTo(last));
      last = camera.position.clone();
    }
    return max;
  };

  it('retargets to you if you arrive mid-swing, without a jump', () => {
    cam.holdTopDown(ISLAND_R);
    cam.playIntro(2);
    const plain = maxStep(3); // the same swing with nothing changing
    cam = new Cameraman(camera, document.createElement('div'));
    cam.holdTopDown(ISLAND_R);
    cam.playIntro(2);
    run(0.5);
    cam.followPlayer(() => new THREE.Vector3(-3, 0.5, 5));
    const bent = maxStep(3);
    expect(cam.controls.target.distanceTo(new THREE.Vector3(-3, 0.6, 5))).toBeLessThan(1e-3);
    // Swapping the landing pose used to jump tens of metres in a frame.
    expect(bent).toBeLessThan(plain * 1.25);
  });

  it('never advances more than a 30 fps frame at once (a stalled frame slows it)', () => {
    cam.holdTopDown(ISLAND_R);
    cam.playIntro(2);
    cam.update(1); // one long frame: shader compilation, a burst of events
    expect(cam.introProgress).toBeCloseTo(introEase(1 / 30 / 2), 9);
    expect(cam.introProgress).toBeLessThan(0.02);
    expect(cam.inIntro).toBe(true);
  });

  it('is under way at once and lands exactly, with no speed left', () => {
    expect(introEase(0)).toBe(0);
    expect(introEase(1)).toBe(1);
    expect(introEase(0.1)).toBeGreaterThan(0.1);
    expect(introEase(0.15)).toBeGreaterThan(0.2);
    // Smooth: it starts from rest, never goes back, and settles at the end.
    expect(introEase(0.001)).toBeLessThan(0.001);
    let prev = 0;
    for (let i = 1; i <= 1000; i++) {
      const k = introEase(i / 1000);
      expect(k).toBeGreaterThanOrEqual(prev);
      prev = k;
    }
    expect(1 - introEase(0.999)).toBeLessThan(1e-4);
    // The camera itself has moved over a tenth of the way by 15 % of the intro.
    cam.holdTopDown(ISLAND_R);
    const start = camera.position.clone();
    cam.playIntro(2);
    run(0.3 - 1e-9);
    const end = new THREE.Vector3(22, 20.5, 44);
    expect(camera.position.distanceTo(start)).toBeGreaterThan(0.1 * start.distanceTo(end));
    run(2);
    expect(camera.position.distanceTo(end)).toBeLessThan(1e-3);
  });

  it('knows where it will land, for the warm-up frame', () => {
    cam.holdTopDown(ISLAND_R);
    const home = cam.introLanding();
    expect(home.target.distanceTo(new THREE.Vector3(0, -0.5, 1))).toBeLessThan(1e-6);
    const me = new THREE.Vector3(4, 0.5, 2);
    cam.followPlayer(() => me.clone());
    const behind = cam.introLanding();
    expect(behind.target.distanceTo(new THREE.Vector3(4, 0.6, 2))).toBeLessThan(1e-3);
    cam.playIntro(1);
    run(1.2);
    expect(cam.controls.target.distanceTo(behind.target)).toBeLessThan(1e-3);
    expect(camera.position.distanceTo(behind.pos)).toBeLessThan(1e-3);
  });

  it('finishes quickly on a movement key, and ignores director cuts meanwhile', () => {
    cam.holdTopDown(ISLAND_R);
    cam.playIntro(10);
    run(0.2);
    cam.interest([new THREE.Vector3(5, 0, 5)], true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
    run(1);
    expect(cam.inIntro).toBe(false);
    expect(cam.controls.target.distanceTo(new THREE.Vector3(0, -0.5, 1))).toBeLessThan(1e-3);
  });

  it('keeps going on keys that are not movement (shortcuts, modifiers)', () => {
    cam.holdTopDown(ISLAND_R);
    cam.playIntro(10);
    run(0.2);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Control' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' }));
    run(1);
    expect(cam.inIntro).toBe(true);
  });

  it('ignores input while still loading', () => {
    cam.holdTopDown(ISLAND_R);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
    run(2);
    expect(cam.inIntro).toBe(true);
  });
});

describe('first person', () => {
  it('puts the eyes above the floor you stand on (raised floors, upstairs)', () => {
    const camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.08, 900);
    const cam = new Cameraman(camera, document.createElement('div'));
    const anchor = new THREE.Vector3(1, 0.5, 1);
    cam.followPlayer(() => anchor.clone());
    cam.setFirstPerson(true, 0);
    for (let i = 0; i < 20; i++) cam.update(1 / 30); // the glide in has finished
    expect(camera.position.y).toBeCloseTo(0.62, 6);
    anchor.y = 2.3 + 0.5; // walked up onto a 2.3 m floor
    cam.update(1 / 30);
    expect(camera.position.y).toBeCloseTo(2.92, 6);
  });

  it('glides into your eyes instead of cutting, and uses the head when there is one', () => {
    const camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.08, 900);
    const cam = new Cameraman(camera, document.createElement('div'));
    cam.followPlayer(() => new THREE.Vector3(1, 0.5, 1));
    camera.position.set(10, 10, 10);
    cam.eye = () => new THREE.Vector3(1, 0.66, 1.03);
    cam.setFirstPerson(true, 0);
    cam.update(1 / 30);
    expect(camera.position.distanceTo(new THREE.Vector3(1, 0.66, 1.03))).toBeGreaterThan(1);
    for (let i = 0; i < 20; i++) cam.update(1 / 30);
    expect(camera.position.distanceTo(new THREE.Vector3(1, 0.66, 1.03))).toBeLessThan(1e-6);
  });

  it('bobs as you walk and widens the view when you run', () => {
    const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.08, 900);
    const cam = new Cameraman(camera, document.createElement('div'));
    cam.followPlayer(() => new THREE.Vector3(0, 0.5, 0));
    cam.setFirstPerson(true, 0);
    for (let i = 0; i < 20; i++) cam.update(1 / 30);
    const ys: number[] = [];
    cam.setFeel({ speed: 2.6, running: true, airborne: false, landed: false, strafe: 0 });
    for (let i = 0; i < 90; i++) { cam.update(1 / 60); ys.push(camera.position.y); }
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.004);
    expect(camera.fov).toBeGreaterThan(cam.fpFov + 3);
  });
});

describe('first person, watching yourself', () => {
  it('steps out behind you while you train or sit, and glides back into your eyes', () => {
    const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.08, 900);
    const cam = new Cameraman(camera, document.createElement('div'));
    const me = new THREE.Vector3(2, 0.5, 2);
    cam.followPlayer(() => me.clone());
    cam.setFirstPerson(true, 0); // looking along +z
    for (let i = 0; i < 20; i++) cam.update(1 / 30);
    cam.setWatching(true);
    for (let i = 0; i < 60; i++) cam.update(1 / 30);
    expect(cam.isWatching).toBe(true);
    const d = camera.position.distanceTo(me);
    expect(d).toBeGreaterThan(1.5);
    expect(camera.position.z).toBeLessThan(me.z); // behind you
    expect(camera.position.y).toBeGreaterThan(me.y);
    cam.setWatching(false);
    for (let i = 0; i < 30; i++) cam.update(1 / 30);
    expect(camera.position.distanceTo(new THREE.Vector3(2, 0.62, 2))).toBeLessThan(1e-6);
  });
});

describe('the camera never stays at NaN', () => {
  it('leaves a sane camera alone', () => {
    const camera = new THREE.PerspectiveCamera(32, 1, 0.08, 900);
    const cam = new Cameraman(camera, document.createElement('div'));
    cam.update(1 / 30);
    const before = camera.position.clone();
    expect(cam.guard()).toBe(false);
    expect(camera.position.equals(before)).toBe(true);
  });

  it('puts a NaN camera back over you, in first person too, and it stays finite', () => {
    const camera = new THREE.PerspectiveCamera(32, 1, 0.08, 900);
    const cam = new Cameraman(camera, document.createElement('div'));
    const me = new THREE.Vector3(3, 0.5, -2);
    cam.followPlayer(() => me.clone());
    cam.setFirstPerson(true, 0);
    camera.position.set(NaN, 1, 1);
    expect(cam.guard()).toBe(true);
    for (let i = 0; i < 30; i++) { cam.update(1 / 30); cam.guard(); }
    const p = camera.position;
    expect([p.x, p.y, p.z].every(Number.isFinite)).toBe(true);
    expect(p.distanceTo(me)).toBeLessThan(2);
  });
});
