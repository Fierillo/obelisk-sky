// Orbit controls plus an "auto-director" that cuts to whoever is talking.
// Any manual drag hands control to the viewer for a while.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FpFeel, type FeelInput } from './fpFeel';

const HOME_TARGET = new THREE.Vector3(0, -0.5, 1);
const HOME_OFFSET = new THREE.Vector3(22, 21, 43);
/** Margin around the island in the top-down view (the loading screen's map uses the same). */
export const TOP_DOWN_MARGIN = 1.15;
/** Where you see your character from: 11 m back, 0.85 rad up (see `played()`). */
const FOLLOW_DISTANCE = 11;
const FOLLOW_ELEVATION = 0.85;
// Player anchors sit 0.5 above the ground the player stands on (World.personAnchor):
// the eyes are a little above that, the follow target a little above too.
const EYE_ABOVE_ANCHOR = 0.12;
const TARGET_ABOVE_ANCHOR = 0.1;

/** Height above the island's centre at which a straight-down camera fits a
 *  disc of `radius` (plus the margin) in the viewport's shorter side. */
export function topDownHeight(radius: number, fovDeg: number, aspect: number): number {
  return (radius * TOP_DOWN_MARGIN) / (Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2) * Math.min(1, aspect));
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
/** The intro's curve: eases in like `easeInOut`, but spends longer landing. */
export const introEase = (t: number) => easeInOut(1 - (1 - t) ** 1.4);
/** The intro never advances more than one 30 fps frame at a time: a stalled
 *  frame (models, shaders) slows the swing instead of skipping part of it. */
const INTRO_MAX_STEP = 1 / 30;
/** How fast the intro's landing pose follows a new one (s). */
const INTRO_RETARGET_TAU = 0.35;
/** Input finishes the intro over this long, from wherever it is. */
const INTRO_SKIP_SECONDS = 0.9;
const SKIP_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'shift']);

interface Pose { target: THREE.Vector3; pos: THREE.Vector3 }

/** The opening shot: straight down on the round island while it loads,
 *  then a swing down into the 3D view. */
interface Intro {
  radius: number;
  /** null while holding the top-down view. */
  to: Pose | null;
  /** Where the swing is heading right now: eases towards `to` when that changes. */
  cur: Pose | null;
  /** The end pose belongs to your character: keep following it afterwards. */
  toPlayer: boolean;
  t: number;
  /** Progress per second. */
  rate: number;
}

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
  private dragFrom: { x: number; y: number; id: number } | null = null;
  private intro: Intro | null = null;
  /** Where your eyes are (the head bone), when the body is loaded. */
  eye: (() => THREE.Vector3 | null) | null = null;
  /** First person's field of view; running widens it a little. */
  fpFov = 70;
  private feel = new FpFeel();
  private feelIn: FeelInput = { speed: 0, running: false, airborne: false, landed: false, strafe: 0, turn: 0 };
  /** In first person but training or sitting: the camera steps out to watch
   *  you (you'd see nothing from your own eyes), and back in when you're done. */
  private watching = false;
  private watchPos: THREE.Vector3 | null = null;
  /** Easing into first person from wherever the camera was. */
  private fpEnter: { pos: THREE.Vector3; quat: THREE.Quaternion; t: number } | null = null;
  private lastYaw = 0;

  /** Enter or leave first person, facing `yaw` (atan2(dx, dz)). */
  setFirstPerson(on: boolean, yaw = 0): void {
    if (on === this.firstPerson) return;
    if (this.intro) this.endIntro();
    this.firstPerson = on;
    this.controls.enabled = !on;
    this.watching = false;
    if (on) {
      this.fpYaw = this.lastYaw = yaw;
      this.fpPitch = -0.08;
      this.tween = null;
      this.follow = null;
      this.feel.reset();
      // Glide down into your eyes rather than cutting.
      this.fpEnter = { pos: this.camera.position.clone(), quat: this.camera.quaternion.clone(), t: 0 };
    } else {
      if (document.pointerLockElement) document.exitPointerLock();
      this.fpEnter = null;
      this.camera.up.set(0, 1, 0);
      const p = this.player?.();
      if (p) {
        // Back out behind where you were looking, gliding from your eyes.
        const back = new THREE.Vector3(-Math.sin(this.fpYaw), 0, -Math.cos(this.fpYaw)).multiplyScalar(Math.cos(0.85)).setY(Math.sin(0.85));
        const look = new THREE.Vector3(Math.sin(this.fpYaw), 0, Math.cos(this.fpYaw));
        this.tween = {
          fromT: this.camera.position.clone().addScaledVector(look, 1), toT: p.clone(),
          fromP: this.camera.position.clone(), toP: p.clone().addScaledVector(back, 11), t: 0, dur: 0.55,
        };
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
    dom.addEventListener('pointerdown', (e) => { if (this.firstPerson && !document.pointerLockElement) this.dragFrom = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
    window.addEventListener('pointermove', (e) => {
      // Only the finger that started on the scene looks around (not the one on the stick).
      if (!this.firstPerson || !this.dragFrom || e.pointerId !== this.dragFrom.id) return;
      this.look((e.clientX - this.dragFrom.x) * 1.6, (e.clientY - this.dragFrom.y) * 1.6);
      this.dragFrom = { x: e.clientX, y: e.clientY, id: e.pointerId };
    });
    window.addEventListener('pointerup', (e) => { if (e.pointerId === this.dragFrom?.id) this.dragFrom = null; });
    window.addEventListener('pointercancel', (e) => { if (e.pointerId === this.dragFrom?.id) this.dragFrom = null; });
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
    // Any input during the intro's swing finishes it quickly.
    for (const ev of ['pointerdown', 'wheel'] as const) dom.addEventListener(ev, () => this.skipIntro(), { passive: true });
    window.addEventListener('keydown', (e) => { if (SKIP_KEYS.has(e.key.toLowerCase())) this.skipIntro(); });
    this.controls.addEventListener('start', () => {
      if (this.intro) return;
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
    if (this.intro) {
      // Mid-intro the swing bends there instead of jumping.
      this.intro.to = { target: target.clone(), pos: target.clone().addScaledVector(nd, distance) };
      this.intro.toPlayer = false;
      return;
    }
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
    // Arriving while the intro runs: it lands behind you.
    const p = get?.();
    if (this.intro?.to && p) {
      this.intro.to = this.followPose(p);
      this.intro.toPlayer = true;
    }
  }

  private followPose(p: THREE.Vector3): Pose {
    const target = p.clone().setY(p.y + TARGET_ABOVE_ANCHOR);
    const d = HOME_OFFSET.clone().setY(0).normalize().multiplyScalar(Math.cos(FOLLOW_ELEVATION)).setY(Math.sin(FOLLOW_ELEVATION));
    return { target, pos: target.clone().addScaledVector(d, FOLLOW_DISTANCE) };
  }

  // ── intro ─────────────────────────────────────────────────────────────

  /** Look straight down on the island (radius `radius`) until `playIntro`. */
  holdTopDown(radius: number): void {
    this.tween = null;
    this.follow = null;
    this.intro = { radius, to: null, cur: null, toPlayer: false, t: 0, rate: 0 };
    this.applyIntro();
  }

  /** First person: watch yourself (training, sitting) or look from your eyes. */
  setWatching(on: boolean, yaw?: number): void {
    if (on === this.watching || !this.firstPerson) return;
    this.watching = on;
    if (on) {
      this.watchPos = this.camera.position.clone();
      // Look at yourself from where it reads best (the caller picks), level-ish.
      if (yaw !== undefined) { this.fpYaw = yaw; this.fpPitch = -0.08; }
    }
    // Back into your eyes: glide from where the watching camera was.
    else this.fpEnter = { pos: this.camera.position.clone(), quat: this.camera.quaternion.clone(), t: 0 };
  }

  get isWatching(): boolean {
    return this.firstPerson && this.watching;
  }

  /** How you're moving, for the first-person bob, dip and lean (main.ts, each frame). */
  setFeel(i: Omit<FeelInput, 'turn'>): void {
    this.feelIn = { ...i, turn: 0 };
  }

  /** Swing from the top-down view to your character (if you're on the
   *  island) or the whole-island view, over `dur` seconds. */
  playIntro(dur = 3.4): void {
    if (!this.intro) return;
    const p = this.player?.();
    this.intro.to ??= p ? this.followPose(p) : { target: HOME_TARGET.clone(), pos: HOME_TARGET.clone().add(HOME_OFFSET) };
    this.intro.cur ??= { target: this.intro.to.target.clone(), pos: this.intro.to.pos.clone() };
    this.intro.toPlayer ||= !!p;
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.intro.rate = reduce ? 1e3 : 1 / dur;
  }

  /** 0 → 1 over the intro; 1 when there is none. */
  get introProgress(): number {
    return this.intro ? introEase(this.intro.t) : 1;
  }

  get inIntro(): boolean {
    return this.intro !== null;
  }

  private skipIntro(): void {
    const it = this.intro;
    if (!it || !it.rate) return;
    it.rate = Math.max(it.rate, (1 - it.t) / INTRO_SKIP_SECONDS);
  }

  /** Place the camera along the swing: target, distance, elevation and
   *  bearing all ease from straight down to the end pose. */
  private applyIntro(): void {
    const it = this.intro!;
    const h = topDownHeight(it.radius, this.camera.fov, this.camera.aspect);
    const k = introEase(it.t);
    const to = it.cur;
    const target = new THREE.Vector3();
    let dist = h, polar = 0, bearing = 0;
    if (to) {
      const off = to.pos.clone().sub(to.target);
      const d1 = off.length();
      const polar1 = Math.acos(THREE.MathUtils.clamp(off.y / d1, -1, 1));
      const bearing1 = Math.atan2(off.x, off.z);
      target.lerp(to.target, k);
      dist = THREE.MathUtils.lerp(h, d1, k);
      polar = polar1 * k;
      bearing = bearing1 * k;
    }
    const sp = Math.sin(polar), cp = Math.cos(polar);
    this.camera.position.set(Math.sin(bearing) * sp, cp, Math.cos(bearing) * sp).multiplyScalar(dist).add(target);
    // Up is the way the view tilts: at the top it points to -z (north up), so
    // there's no spin when the camera passes over the pole.
    this.camera.up.set(-Math.sin(bearing) * cp, sp, -Math.cos(bearing) * cp);
    this.camera.lookAt(target);
    this.controls.target.copy(target);
  }

  private endIntro(): void {
    const it = this.intro!;
    this.intro = null;
    this.camera.up.set(0, 1, 0);
    if (it.cur) {
      this.controls.target.copy(it.cur.target);
      this.camera.position.copy(it.cur.pos);
    }
    this.camera.lookAt(this.controls.target);
    // No leftover damping from before the intro: it would nudge the first frame.
    this.controls.enableDamping = false;
    this.controls.update();
    this.controls.enableDamping = true;
    // The landing pose moved late: glide the rest of the way rather than snap.
    if (it.to && it.cur && (it.to.pos.distanceTo(it.cur.pos) > 0.01 || it.to.target.distanceTo(it.cur.target) > 0.01)) {
      this.tween = { fromT: it.cur.target.clone(), toT: it.to.target.clone(), fromP: it.cur.pos.clone(), toP: it.to.pos.clone(), t: 0, dur: 0.6 };
    }
    this.lastCut = performance.now();
    if (it.toPlayer) this.playingUntil = performance.now() + 30_000;
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
      d.multiplyScalar(Math.cos(FOLLOW_ELEVATION)).setY(Math.sin(FOLLOW_ELEVATION));
      if (p) this.flyTo(p, FOLLOW_DISTANCE, d, 0.9);
    }
  }

  get playing(): boolean {
    return performance.now() < this.playingUntil;
  }

  /** Something happened between these points — maybe cut to it. */
  interest(points: THREE.Vector3[], force = false): void {
    if (this.intro || !this.auto || this.userActive || this.follow || this.playing || this.firstPerson) return;
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
    if (this.intro) {
      const it = this.intro;
      const step = Math.min(dt, INTRO_MAX_STEP);
      it.t = Math.min(1, it.t + step * it.rate);
      if (it.to && it.cur) {
        const a = 1 - Math.exp(-step / INTRO_RETARGET_TAU);
        it.cur.target.lerp(it.to.target, a);
        it.cur.pos.lerp(it.to.pos, a);
      }
      this.applyIntro();
      if (this.intro.t >= 1) this.endIntro();
      return;
    }
    if (this.firstPerson && this.watching) {
      const p = this.player?.();
      if (p) {
        // Around you, turned with the mouse; aimed at your chest (up at the bar
        // for pull-ups, down on the bench for a press).
        const e = this.eye?.();
        const focus = e ? e.clone().setY(e.y - 0.14) : p.clone().setY(p.y + 0.1);
        const elev = THREE.MathUtils.clamp(0.42 - this.fpPitch * 0.6, 0.12, 1.2);
        const want = focus.clone().add(new THREE.Vector3(-Math.sin(this.fpYaw) * Math.cos(elev), Math.sin(elev), -Math.cos(this.fpYaw) * Math.cos(elev)).multiplyScalar(1.9));
        this.watchPos ??= this.camera.position.clone();
        this.watchPos.lerp(want, 1 - Math.exp(-dt * 5));
        this.camera.up.set(0, 1, 0);
        this.camera.position.copy(this.watchPos);
        this.camera.lookAt(focus);
        if (Math.abs(this.camera.fov - this.fpFov) > 0.01) { this.camera.fov = this.fpFov; this.camera.updateProjectionMatrix(); }
        this.controls.target.copy(p);
      }
      return;
    }
    if (this.firstPerson) {
      const p = this.player?.();
      if (p) {
        // Your eyes: the head bone when the body is there (so sitting, lifting
        // and jumping carry them), else above the floor you stand on.
        const eye = this.eye?.() ?? p.clone().setY(p.y + EYE_ABOVE_ANCHOR);
        const turn = dt > 0 ? Math.atan2(Math.sin(this.fpYaw - this.lastYaw), Math.cos(this.fpYaw - this.lastYaw)) / dt : 0;
        this.lastYaw = this.fpYaw;
        const o = this.feel.step(dt, { ...this.feelIn, turn });
        const right = new THREE.Vector3(-Math.cos(this.fpYaw), 0, Math.sin(this.fpYaw));
        eye.y += o.up;
        eye.addScaledVector(right, o.side);
        const dir = new THREE.Vector3(Math.sin(this.fpYaw) * Math.cos(this.fpPitch), Math.sin(this.fpPitch), Math.cos(this.fpYaw) * Math.cos(this.fpPitch));
        this.camera.up.set(0, 1, 0);
        this.camera.position.copy(eye);
        this.camera.lookAt(eye.clone().add(dir));
        this.camera.rotateZ(-o.roll);
        const fov = this.fpFov + o.fov;
        if (Math.abs(this.camera.fov - fov) > 0.01) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
        if (this.fpEnter) {
          // Ease in from where the camera was.
          const en = this.fpEnter;
          en.t = Math.min(1, en.t + dt / 0.4);
          const k = easeInOut(en.t);
          this.camera.position.lerpVectors(en.pos, eye, k);
          this.camera.quaternion.slerpQuaternions(en.quat, this.camera.quaternion.clone(), k);
          if (en.t >= 1) this.fpEnter = null;
        }
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
        const delta = p.setY(p.y + TARGET_ABOVE_ANCHOR).sub(this.controls.target).multiplyScalar(Math.min(1, dt * 6));
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
