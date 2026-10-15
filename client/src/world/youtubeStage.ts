// LABITCONF's stage plays its video while you're inside the hall. A YouTube
// player can't become a WebGL texture (cross-origin iframe), so the embed is
// a real <iframe> placed in 3D exactly over the LED wall with CSS3DRenderer,
// in a layer over the canvas (pointer-events off: clicks still reach the
// world). It is created when you walk in, looping, and removed when you walk
// out, so nothing loads or plays outside. It starts muted (browsers always
// let a muted video autoplay) and is unmuted through the player's own
// messages (enablejsapi) while sound is on: the page has had a gesture by
// then, and the iframe is allowed autoplay. Drawn over the
// canvas, it would cover anyone standing between you and the wall: the wall
// hangs high over the stage so that rarely happens, and the layer hides when
// the wall faces away, is out of view or the eye is right up against it.

import * as THREE from 'three';
import { CSS3DRenderer, CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js';

export const LABITCONF_VIDEO = 'UniEraIBJZQ';

/** The iframe's size in CSS pixels (16:9); the 3D object is scaled to the wall. */
const PX_W = 1280, PX_H = 720;

const YT_ORIGIN = 'https://www.youtube-nocookie.com';

/** The embed: autoplay (muted, so it may), looped (YouTube loops a single video only through `playlist`), no controls, driven by messages. */
export function embedUrl(id: string = LABITCONF_VIDEO, origin?: string): string {
  const q = new URLSearchParams({
    autoplay: '1', mute: '1', loop: '1', playlist: id, controls: '0',
    playsinline: '1', modestbranding: '1', rel: '0', disablekb: '1', iv_load_policy: '3',
    enablejsapi: '1',
  });
  if (origin) q.set('origin', origin);
  return `${YT_ORIGIN}/embed/${id}?${q}`;
}

/** Can the camera see the wall's front (in view, facing it, not pressed against it)? */
export function stageVisible(screen: THREE.Object3D, camera: THREE.Camera, frustum: THREE.Frustum, width: number, height: number): boolean {
  const e = screen.matrixWorld.elements;
  const centre = new THREE.Vector3(e[12], e[13], e[14]);
  const normal = new THREE.Vector3(e[8], e[9], e[10]).normalize();
  const eye = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
  // CSS3D draws badly once a corner is behind the eye: keep a little distance in front.
  if (eye.sub(centre).dot(normal) < 0.25) return false;
  return frustum.intersectsSphere(new THREE.Sphere(centre, Math.hypot(width, height) / 2));
}

export class YoutubeStage {
  private css: CSS3DRenderer;
  private scene = new THREE.Scene();
  private holder: HTMLDivElement;
  private obj: CSS3DObject;
  private iframe: HTMLIFrameElement | null = null;
  private frustum = new THREE.Frustum();
  private m = new THREE.Matrix4();
  private scale: THREE.Matrix4;
  private shown = false;
  private sound = false;
  /** Seconds left to keep telling a fresh player whether to sound (it ignores messages until ready). */
  private tell = 0;

  constructor(parent: HTMLElement, after: Element | null, private screen: THREE.Object3D, private width: number, private height: number, private video = LABITCONF_VIDEO) {
    this.css = new CSS3DRenderer();
    const el = this.css.domElement;
    el.className = 'stage-video';
    el.style.position = 'absolute';
    el.style.inset = '0';
    el.style.pointerEvents = 'none';
    el.style.display = 'none';
    parent.insertBefore(el, after ? after.nextSibling : parent.firstChild);
    this.holder = document.createElement('div');
    this.holder.style.width = `${PX_W}px`;
    this.holder.style.height = `${PX_H}px`;
    this.holder.style.background = '#000';
    this.obj = new CSS3DObject(this.holder);
    this.holder.style.pointerEvents = 'none'; // CSS3DObject turns them on
    this.obj.matrixAutoUpdate = false;
    this.scene.add(this.obj);
    this.scale = new THREE.Matrix4().makeScale(width / PX_W, height / PX_H, 1);
  }

  /** Is the video's iframe in the page (you're inside)? */
  get playing(): boolean {
    return !!this.iframe;
  }

  /** Sound on (the Sound switch, and the page has had a gesture): unmuted at full volume; off: muted. */
  setSound(on: boolean): void {
    if (on === this.sound) return;
    this.sound = on;
    this.tell = 6;
    this.command();
  }

  private command(): void {
    const w = this.iframe?.contentWindow;
    if (!w) return;
    const send = (func: string, args: unknown[] = []) => w.postMessage(JSON.stringify({ event: 'command', func, args }), YT_ORIGIN);
    if (this.sound) { send('unMute'); send('setVolume', [100]); } else send('mute');
    send('playVideo');
  }

  setSize(w: number, h: number): void {
    this.css.setSize(w, h);
  }

  /** Once a frame, after the world drew: `inside` starts or stops the video, the camera places it. */
  update(camera: THREE.PerspectiveCamera, inside: boolean, dt = 0): void {
    if (inside && !this.iframe) {
      const f = document.createElement('iframe');
      f.src = embedUrl(this.video, typeof location !== 'undefined' ? location.origin : undefined);
      f.addEventListener('load', () => { this.tell = 6; this.command(); });
      f.title = 'LABITCONF';
      f.allow = 'autoplay; encrypted-media; picture-in-picture';
      f.referrerPolicy = 'strict-origin-when-cross-origin';
      f.style.cssText = `width:${PX_W}px;height:${PX_H}px;border:0;pointer-events:none;display:block`;
      f.tabIndex = -1;
      this.holder.append(f);
      this.iframe = f;
    } else if (!inside && this.iframe) {
      this.iframe.remove();
      this.iframe = null;
    }
    // A fresh player only hears commands once it's ready: say it again each second for a while.
    if (this.iframe && this.tell > 0) {
      const before = Math.ceil(this.tell);
      this.tell -= dt;
      if (Math.ceil(this.tell) !== before) this.command();
    }
    this.frustum.setFromProjectionMatrix(this.m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const show = inside && stageVisible(this.screen, camera, this.frustum, this.width, this.height);
    if (show !== this.shown) {
      this.shown = show;
      this.css.domElement.style.display = show ? '' : 'none';
    }
    if (!show) return;
    this.obj.matrix.multiplyMatrices(this.screen.matrixWorld, this.scale);
    this.obj.matrixWorldNeedsUpdate = true;
    this.css.render(this.scene, camera);
  }

  /** Hide it now (Watch mode, the world not drawing); the next update brings it back. */
  hide(): void {
    this.shown = false;
    this.css.domElement.style.display = 'none';
  }

  dispose(): void {
    this.iframe?.remove();
    this.iframe = null;
    this.css.domElement.remove();
  }
}
