// Orbit controls plus an "auto-director" that cuts to whoever is talking.
// Any manual drag hands control to the viewer for a while.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const HOME_TARGET = new THREE.Vector3(0, -0.5, 1);
const HOME_OFFSET = new THREE.Vector3(22, 21, 43);

export class Cameraman {
  readonly controls: OrbitControls;
  auto = true;
  private userUntil = 0;
  private tween: { fromT: THREE.Vector3; toT: THREE.Vector3; fromP: THREE.Vector3; toP: THREE.Vector3; t: number; dur: number } | null = null;
  private lastCut = 0;
  private follow: (() => THREE.Vector3 | null) | null = null;
  /** Your character: the camera stays centred on it while you play. */
  private player: (() => THREE.Vector3 | null) | null = null;
  /** performance.now() until which you count as playing (no director cuts). */
  playingUntil = 0;
  /** First-person: the camera is your character's eyes. */
  firstPerson = false;
  fpYaw = 0;
  fpPitch = -0.08;
  sensitivity = 1;
  invertY = false;
  private dragFrom: { x: number; y: number } | null = null;

  /** Enter or leave first person, facing `yaw` (atan2(dx, dz)). */
  setFirstPerson(on: boolean, yaw = 0): void {
    if (on === this.firstPerson) return;
    this.firstPerson = on;
    this.controls.enabled = !on;
    if (on) {
      this.fpYaw = yaw;
      this.fpPitch = -0.08;
      this.tween = null;
      this.follow = null;
    } else {
      if (document.pointerLockElement) document.exitPointerLock();
      const p = this.player?.();
      if (p) {
        // Back out behind where you were looking.
        const back = new THREE.Vector3(-Math.sin(this.fpYaw), 0, -Math.cos(this.fpYaw)).multiplyScalar(Math.cos(0.85)).setY(Math.sin(0.85));
        this.controls.target.copy(p);
        this.camera.position.copy(p).addScaledVector(back, 11);
      }
      this.playingUntil = performance.now() + 30_000;
    }
  }

  private look(dx: number, dy: number): void {
    this.fpYaw -= dx * 0.0032 * this.sensitivity;
    this.fpPitch = THREE.MathUtils.clamp(this.fpPitch - dy * 0.0028 * this.sensitivity * (this.invertY ? -1 : 1), -1.2, 1.1);
  }

  constructor(private camera: THREE.PerspectiveCamera, dom: HTMLElement) {
    // First-person look: pointer lock on desktop (click the scene), or drag.
    dom.addEventListener('click', () => {
      if (this.firstPerson && !document.pointerLockElement && !matchMedia('(pointer: coarse)').matches) void dom.requestPointerLock?.();
    });
    document.addEventListener('mousemove', (e) => {
      if (this.firstPerson && document.pointerLockElement === dom) this.look(e.movementX, e.movementY);
    });
    dom.addEventListener('pointerdown', (e) => { if (this.firstPerson && !document.pointerLockElement) this.dragFrom = { x: e.clientX, y: e.clientY }; });
    window.addEventListener('pointermove', (e) => {
      if (!this.firstPerson || !this.dragFrom) return;
      this.look((e.clientX - this.dragFrom.x) * 1.6, (e.clientY - this.dragFrom.y) * 1.6);
      this.dragFrom = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('pointerup', () => { this.dragFrom = null; });
    this.controls = new OrbitControls(camera, dom);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 80;
    this.controls.maxPolarAngle = 1.36;
    this.controls.minPolarAngle = 0.2;
    this.controls.target.copy(HOME_TARGET);
    this.controls.autoRotateSpeed = 0.35;
    this.controls.zoomToCursor = true;
    camera.position.copy(HOME_TARGET).add(HOME_OFFSET);
    this.controls.addEventListener('start', () => {
      this.userUntil = performance.now() + 20_000;
      this.tween = null;
      this.follow = null;
    });
  }

  get userActive(): boolean {
    return performance.now() < this.userUntil;
  }

  home(): void {
    this.follow = null;
    this.flyTo(HOME_TARGET, HOME_OFFSET.length(), HOME_OFFSET.clone().normalize());
  }

  /** Fly so `target` is centred at `distance`, keeping the current bearing
   *  unless a direction is given. */
  flyTo(target: THREE.Vector3, distance: number, dir?: THREE.Vector3, dur = 1.6): void {
    const d = dir ?? this.camera.position.clone().sub(this.controls.target).normalize();
    // Keep a pleasant elevation.
    const flat = new THREE.Vector3(d.x, 0, d.z).normalize();
    const elev = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(d.y, -1, 1)), 0.45, 1.1);
    const nd = flat.multiplyScalar(Math.cos(elev)).setY(Math.sin(elev));
    this.tween = {
      fromT: this.controls.target.clone(), toT: target.clone(),
      fromP: this.camera.position.clone(), toP: target.clone().addScaledVector(nd, distance),
      t: 0, dur,
    };
  }

  /** Viewer picked something: fly there and keep it in frame. */
  focus(get: () => THREE.Vector3 | null, distance = 8): void {
    const p = get();
    if (!p) return;
    this.userUntil = performance.now() + 30_000;
    this.follow = get;
    this.flyTo(p, distance);
  }

  /** Follow your character; a step from the keyboard calls `played()`. */
  followPlayer(get: (() => THREE.Vector3 | null) | null): void {
    this.player = get;
  }

  /** You moved: keep the camera on you and hold off director cuts. */
  played(): void {
    const first = performance.now() > this.playingUntil;
    this.playingUntil = performance.now() + 30_000;
    this.follow = null;
    if (first && this.player && !this.firstPerson) {
      const p = this.player();
      // Steep enough to see over the roofs next to you.
      const d = this.camera.position.clone().sub(this.controls.target).setY(0).normalize();
      d.multiplyScalar(Math.cos(0.85)).setY(Math.sin(0.85));
      if (p) this.flyTo(p, 11, d, 0.9);
    }
  }

  get playing(): boolean {
    return performance.now() < this.playingUntil;
  }

  /** Something happened between these points — maybe cut to it. */
  interest(points: THREE.Vector3[], force = false): void {
    if (!this.auto || this.userActive || this.follow || this.playing || this.firstPerson) return;
    const now = performance.now();
    if (!force && now - this.lastCut < 4500) return;
    this.lastCut = now;
    const c = new THREE.Vector3();
    for (const p of points) c.add(p);
    c.divideScalar(points.length);
    let spread = 0;
    for (const p of points) spread = Math.max(spread, p.distanceTo(c));
    // Look down steeply enough to clear the roofs next to a yard.
    const d = this.camera.position.clone().sub(this.controls.target).setY(0).normalize();
    const elev = 0.95;
    d.multiplyScalar(Math.cos(elev)).setY(Math.sin(elev));
    this.flyTo(c.setY(0.4), THREE.MathUtils.clamp(12 + spread * 1.5, 12, 26), d);
  }

  update(dt: number): void {
    if (this.firstPerson) {
      const p = this.player?.();
      if (p) {
        const eye = p.clone().setY(0.62);
        this.camera.position.copy(eye);
        const dir = new THREE.Vector3(Math.sin(this.fpYaw) * Math.cos(this.fpPitch), Math.sin(this.fpPitch), Math.cos(this.fpYaw) * Math.cos(this.fpPitch));
        this.camera.lookAt(eye.add(dir));
        this.controls.target.copy(p);
      }
      return;
    }
    if (this.tween) {
      const tw = this.tween;
      tw.t = Math.min(1, tw.t + dt / tw.dur);
      const k = tw.t < 0.5 ? 4 * tw.t ** 3 : 1 - (-2 * tw.t + 2) ** 3 / 2;
      this.controls.target.lerpVectors(tw.fromT, tw.toT, k);
      this.camera.position.lerpVectors(tw.fromP, tw.toP, k);
      if (tw.t >= 1) this.tween = null;
    } else if (this.playing && this.player) {
      const p = this.player();
      if (p) {
        const delta = p.setY(0.6).sub(this.controls.target).multiplyScalar(Math.min(1, dt * 6));
        this.controls.target.add(delta);
        this.camera.position.add(delta);
      }
    } else if (this.follow) {
      const p = this.follow();
      if (p) {
        const delta = p.clone().sub(this.controls.target).multiplyScalar(Math.min(1, dt * 3));
        this.controls.target.add(delta);
        this.camera.position.add(delta);
      } else {
        this.follow = null;
      }
    }
    // Idle drift: a slow orbit when nobody's steering and nothing's on.
    this.controls.autoRotate = this.auto && !this.userActive && !this.tween && !this.follow && !this.playing && performance.now() - this.lastCut > 15_000;
    this.controls.update(dt);
  }
}
