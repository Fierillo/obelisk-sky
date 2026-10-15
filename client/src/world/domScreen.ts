// A real page element (an <iframe>, a <video>) placed in 3D exactly over a
// screen mesh with CSS3DRenderer, in a layer over the canvas (pointer-events
// off: clicks still reach the world and its screen mesh). The browser plays
// it on its own, at the video's frame rate and full resolution, whatever
// rate the world is drawn at; a WebGL video texture only changes when a
// frame is drawn and is copied to the GPU each time. Used by LABITCONF's
// YouTube stage (world/youtubeStage.ts) and the theater's film (world.ts).
//
// Drawn over the canvas, it covers anyone standing between you and the
// screen, so screens that use it hang high. It hides when the screen faces
// away, is out of view, or the eye is right up against it (CSS3D draws
// badly once a corner is behind the eye).

import * as THREE from 'three';
import { CSS3DRenderer, CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js';

/** Can the camera see the screen's front (in view, facing it, not pressed against it)? */
export function screenVisible(screen: THREE.Object3D, camera: THREE.Camera, frustum: THREE.Frustum, width: number, height: number): boolean {
  const e = screen.matrixWorld.elements;
  const centre = new THREE.Vector3(e[12], e[13], e[14]);
  const normal = new THREE.Vector3(e[8], e[9], e[10]).normalize();
  const eye = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
  if (eye.sub(centre).dot(normal) < 0.25) return false;
  return frustum.intersectsSphere(new THREE.Sphere(centre, Math.hypot(width, height) / 2));
}

export class DomScreen {
  private css: CSS3DRenderer;
  private scene = new THREE.Scene();
  /** The element's box, `pxW` × `pxH` CSS pixels, scaled onto the screen. */
  readonly holder: HTMLDivElement;
  private obj: CSS3DObject;
  private frustum = new THREE.Frustum();
  private m = new THREE.Matrix4();
  private scale: THREE.Matrix4;
  private shown = false;

  constructor(parent: HTMLElement, after: Element | null, private screen: THREE.Object3D, private width: number, private height: number, className: string, pxW = 1280) {
    const pxH = Math.round((pxW * height) / width);
    this.css = new CSS3DRenderer();
    const el = this.css.domElement;
    el.className = className;
    el.style.position = 'absolute';
    el.style.inset = '0';
    el.style.pointerEvents = 'none';
    el.style.display = 'none';
    parent.insertBefore(el, after ? after.nextSibling : parent.firstChild);
    this.holder = document.createElement('div');
    this.holder.style.width = `${pxW}px`;
    this.holder.style.height = `${pxH}px`;
    this.holder.style.background = '#000';
    this.obj = new CSS3DObject(this.holder);
    this.holder.style.pointerEvents = 'none'; // CSS3DObject turns them on
    this.obj.matrixAutoUpdate = false;
    this.scene.add(this.obj);
    this.scale = new THREE.Matrix4().makeScale(width / pxW, height / pxH, 1);
  }

  /** Is the layer showing (the last update found the screen in view)? */
  get visible(): boolean {
    return this.shown;
  }

  setSize(w: number, h: number): void {
    this.css.setSize(w, h);
  }

  /** Once a frame, after the world drew: show the layer over the screen while `on` and the screen is in view. */
  update(camera: THREE.PerspectiveCamera, on: boolean): boolean {
    let show = on;
    if (show) {
      this.frustum.setFromProjectionMatrix(this.m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      show = screenVisible(this.screen, camera, this.frustum, this.width, this.height);
    }
    if (show !== this.shown) {
      this.shown = show;
      this.css.domElement.style.display = show ? '' : 'none';
    }
    if (show) {
      this.obj.matrix.multiplyMatrices(this.screen.matrixWorld, this.scale);
      this.obj.matrixWorldNeedsUpdate = true;
      this.css.render(this.scene, camera);
    }
    return show;
  }

  dispose(): void {
    this.css.domElement.remove();
  }
}
