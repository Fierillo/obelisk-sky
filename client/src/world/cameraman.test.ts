// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { Cameraman, topDownHeight, TOP_DOWN_MARGIN } from './cameraman';
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
    expect(cam.introProgress).toBeLessThan(0.8);
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

  it('retargets to you if you arrive mid-swing', () => {
    cam.holdTopDown(ISLAND_R);
    cam.playIntro(2);
    run(0.5);
    cam.followPlayer(() => new THREE.Vector3(-3, 0.5, 5));
    run(2);
    expect(cam.controls.target.distanceTo(new THREE.Vector3(-3, 0.6, 5))).toBeLessThan(1e-3);
  });

  it('finishes quickly on any input, and ignores director cuts meanwhile', () => {
    cam.holdTopDown(ISLAND_R);
    cam.playIntro(10);
    run(0.2);
    cam.interest([new THREE.Vector3(5, 0, 5)], true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
    run(0.5);
    expect(cam.inIntro).toBe(false);
    expect(cam.controls.target.distanceTo(new THREE.Vector3(0, -0.5, 1))).toBeLessThan(1e-3);
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
    cam.update(1 / 30);
    expect(camera.position.y).toBeCloseTo(0.62, 6);
    anchor.y = 2.3 + 0.5; // walked up onto a 2.3 m floor
    cam.update(1 / 30);
    expect(camera.position.y).toBeCloseTo(2.92, 6);
  });
});
