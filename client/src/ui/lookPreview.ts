// The look editor's own little stage: your character, lit like a studio,
// turning slowly (drag to turn it yourself). Uses the same Character as the
// village so what you see here is what everyone sees.

import * as THREE from 'three';
import type { Avatar } from '../nostr/avatars';
import { Character, CHAR_HEIGHT } from '../world/character';
import { buildHat } from '../world/pet';

export class LookPreview {
  readonly canvas = document.createElement('canvas');
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(28, 1, 0.05, 20);
  private person = new Character('look-preview', '');
  private clock = new THREE.Clock();
  private raf = 0;
  private yaw = 0.5;
  private drag: { x: number; yaw: number } | null = null;
  private idleFor = 0;
  private hatKey = '';

  constructor() {
    this.canvas.className = 'look-preview';
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    } catch {
      // No WebGL left for a second context: the panel works without it.
      this.canvas.hidden = true;
      return;
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene.add(new THREE.HemisphereLight(0xf4f1ff, 0x5a5560, 1.6));
    const key = new THREE.DirectionalLight(0xfff1d6, 2.4);
    key.position.set(1.5, 2.5, 2.5);
    const rim = new THREE.DirectionalLight(0xb4f953, 0.8);
    rim.position.set(-2, 1.5, -2);
    this.scene.add(key, rim);
    this.person.badge.visible = false;
    this.person.targetOpacity = 1;
    this.scene.add(this.person.root);
    this.camera.position.set(0, CHAR_HEIGHT * 0.6, CHAR_HEIGHT * 2.15);
    this.camera.lookAt(0, CHAR_HEIGHT * 0.5, 0);
    this.canvas.addEventListener('pointerdown', (e) => {
      this.drag = { x: e.clientX, yaw: this.yaw };
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (this.drag) this.yaw = this.drag.yaw + (e.clientX - this.drag.x) * 0.012;
    });
    const up = () => { this.drag = null; this.idleFor = 0; };
    this.canvas.addEventListener('pointerup', up);
    this.canvas.addEventListener('pointercancel', up);
    this.raf = requestAnimationFrame(this.frame);
  }

  set(a: Avatar): void {
    if (a.look) this.person.setLook(a.look);
    const hatKey = `${a.hat}|${a.hatColor}`;
    if (hatKey !== this.hatKey) {
      this.hatKey = hatKey;
      this.person.setHat(buildHat(a.hat, a.hatColor));
    }
  }

  private frame = () => {
    this.raf = requestAnimationFrame(this.frame);
    const r = this.renderer;
    if (!r) return;
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    if (this.canvas.width !== Math.round(w * r.getPixelRatio()) || this.canvas.height !== Math.round(h * r.getPixelRatio())) {
      r.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    // A slow turn on its own a moment after you let go.
    this.idleFor += dt;
    if (!this.drag && this.idleFor > 2) this.yaw += dt * 0.4;
    this.person.root.rotation.y = this.yaw;
    this.person.update(dt);
    r.render(this.scene, this.camera);
  };

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.person.dispose();
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    this.renderer = null;
  }
}
