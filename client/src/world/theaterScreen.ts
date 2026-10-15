// The theater's big screen: a shared screen from the call plays on it as a
// video texture, letterboxed to keep its shape (the plane shrinks over a
// black backing); with nothing shared it shows
// a card (the channel, or how to start a screening). Unlit, so it glows in
// the dark hall and costs no light. The video is paused while nobody near
// is watching, so phones don't decode a film they can't see. While you're in
// the hall the film plays in its own <video> laid over the screen
// (world/domScreen.ts, at the film's own frame rate): the screen then draws
// black (`setOverlaid`), so no frame is copied to the GPU for nothing.

import * as THREE from 'three';
import { canvasTexture } from './landmarks/signs';
import { vw } from '../i18n/village';

const CARD_W = 1024, CARD_H = 576;

/** No new frame this long from a live track: the player is stuck, give it its stream again. */
export const FILM_STALL_MS = 4000;
/** At most one nudge (play, or a reload) this often. */
const KICK_EVERY_MS = 1000;

/**
 * What a film that should be playing needs: `play` when it is paused (a
 * failed play(), the browser pausing it), `reload` when it plays but no frame
 * has come for a while although its track is live and sending (a stuck
 * decoder after a hiccup on the connection), else nothing. A muted or ended
 * track is the sender's pause: wait for it.
 */
export function filmNeeds(s: { paused: boolean; sinceFrameMs: number; trackLive: boolean; sinceKickMs: number }): 'play' | 'reload' | null {
  if (s.sinceKickMs < KICK_EVERY_MS) return null;
  if (s.paused) return 'play';
  if (s.trackLive && s.sinceFrameMs > FILM_STALL_MS && s.sinceKickMs > FILM_STALL_MS) return 'reload';
  return null;
}

export class TheaterScreen {
  readonly mesh: THREE.Mesh;
  private mat: THREE.MeshBasicMaterial;
  private card: THREE.CanvasTexture;
  private cardKey = '';
  private video: HTMLVideoElement | null = null;
  private tex: THREE.VideoTexture | null = null;
  private stream: MediaStream | null = null;
  private active = true;
  private overlaid = false;
  /** When the film last showed a new frame, and when it was last nudged (ms, performance.now). */
  private lastFrame = 0;
  private lastKick = 0;
  private frames = 0;
  private shownMap: THREE.Texture;

  constructor(readonly width: number, readonly height: number) {
    this.card = canvasTexture(CARD_W, CARD_H, () => {});
    this.shownMap = this.card;
    this.mat = new THREE.MeshBasicMaterial({ map: this.card, toneMapped: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), this.mat);
    this.mesh.name = 'theater-screen';
    this.showCard(vw.theater, vw.pickAndStart);
  }

  /** What's playing, or null for the card. */
  get playing(): boolean {
    return !!this.stream;
  }

  /** The card shown when nothing is shared (redrawn only when its words change). */
  showCard(title: string, line: string): void {
    const key = `${title}\n${line}`;
    if (key === this.cardKey) return;
    this.cardKey = key;
    const old = this.card;
    this.card = canvasTexture(CARD_W, CARD_H, (g) => {
      const grad = g.createLinearGradient(0, 0, 0, CARD_H);
      grad.addColorStop(0, '#1b1f2e');
      grad.addColorStop(1, '#0b0d14');
      g.fillStyle = grad;
      g.fillRect(0, 0, CARD_W, CARD_H);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#f5d76e';
      g.font = '800 96px Inter, system-ui, sans-serif';
      g.fillText(title.slice(0, 22), CARD_W / 2, CARD_H * 0.42);
      g.fillStyle = '#c9cfdf';
      g.font = '500 40px Inter, system-ui, sans-serif';
      g.fillText(line.slice(0, 48), CARD_W / 2, CARD_H * 0.62);
    });
    if (!this.stream) this.useMap(this.card);
    old.dispose();
  }

  /** Play a stream on the screen (null: back to the card). */
  attach(stream: MediaStream | null): void {
    if (stream === this.stream) return;
    this.detach();
    if (!stream || typeof document === 'undefined') return;
    const v = document.createElement('video');
    v.muted = true; // the sound comes through the call, gated
    v.playsInline = true;
    // Started with play(), not `autoplay`: browsers pause muted autoplaying
    // videos that leave the screen (the overlay hiding as you turn away).
    v.srcObject = stream;
    this.lastFrame = this.lastKick = performance.now();
    this.watchFrames(v);
    v.addEventListener('resize', () => this.fit());
    v.addEventListener('loadedmetadata', () => this.fit());
    this.video = v;
    this.stream = stream;
    this.tex = new THREE.VideoTexture(v);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.useMap(this.tex);
    if (this.active) void v.play().catch(() => {});
  }

  /** The film's <video> while one plays (for the overlay), else null. */
  get element(): HTMLVideoElement | null {
    return this.video;
  }

  /** The film shows in its overlay: draw the screen black instead of copying its frames. */
  setOverlaid(on: boolean): void {
    if (on === this.overlaid) return;
    this.overlaid = on;
    this.applyMap();
  }

  /** Count the film's frames as they're shown (where the browser can tell us). */
  private watchFrames(v: HTMLVideoElement): void {
    const rvfc = (v as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number }).requestVideoFrameCallback;
    if (!rvfc) return;
    const onFrame = () => {
      if (this.video !== v) return;
      this.frames++;
      this.lastFrame = performance.now();
      rvfc.call(v, onFrame);
    };
    rvfc.call(v, onFrame);
  }

  /**
   * Once a frame: keep a film that should be playing playing. Restarts it
   * when paused, and gives a stuck one its stream again (filmNeeds).
   */
  tick(now = performance.now()): void {
    const v = this.video, stream = this.stream;
    if (!v || !stream || !this.active) return;
    // Without frame callbacks (older browsers), the decoded-frame count stands in.
    if (typeof (v as { requestVideoFrameCallback?: unknown }).requestVideoFrameCallback !== 'function') {
      const n = v.getVideoPlaybackQuality?.().totalVideoFrames ?? 0;
      if (n !== this.frames) { this.frames = n; this.lastFrame = now; }
    }
    const track = stream.getVideoTracks?.()[0];
    const need = filmNeeds({
      paused: v.paused,
      sinceFrameMs: now - this.lastFrame,
      trackLive: !!track && track.readyState === 'live' && !track.muted,
      sinceKickMs: now - this.lastKick,
    });
    if (!need) return;
    this.lastKick = now;
    if (need === 'reload') {
      this.lastFrame = now;
      v.srcObject = null;
      v.srcObject = stream;
    }
    void v.play().catch(() => {});
  }

  /** Someone near is watching: keep the video running (else pause it). */
  setActive(on: boolean): void {
    if (on === this.active) return;
    this.active = on;
    if (!this.video) return;
    if (on) void this.video.play().catch(() => {});
    else this.video.pause();
  }

  private detach(): void {
    if (this.video) {
      this.video.pause();
      this.video.srcObject = null;
      this.video.remove(); // out of the overlay, if it was in it
    }
    this.tex?.dispose();
    this.video = null;
    this.tex = null;
    this.stream = null;
    this.useMap(this.card);
  }

  /** Letterbox: the picture keeps its shape inside the screen (the black backing shows round it). */
  private fit(): void {
    const v = this.video;
    if (!v || !v.videoWidth || !v.videoHeight) return;
    const [sx, sy] = letterbox(v.videoWidth / v.videoHeight, this.width / this.height);
    this.mesh.scale.set(sx, sy, 1);
  }

  private useMap(t: THREE.Texture): void {
    if (t !== this.tex) this.mesh.scale.set(1, 1, 1);
    this.shownMap = t;
    this.applyMap();
  }

  private applyMap(): void {
    const off = this.overlaid && !!this.tex && this.shownMap === this.tex;
    const map = off ? null : this.shownMap;
    if (this.mat.map === map) return;
    this.mat.map = map;
    this.mat.color.set(off ? 0x000000 : 0xffffff);
    this.mat.needsUpdate = true;
  }

  dispose(): void {
    this.detach();
    this.card.dispose();
    this.mat.dispose();
    this.mesh.geometry.dispose();
  }
}

/** The picture's scale [x, y] inside the screen (each ≤ 1) for a picture of aspect `pic` on a screen of aspect `scr`. */
export function letterbox(pic: number, scr: number): [number, number] {
  if (!(pic > 0) || !(scr > 0)) return [1, 1];
  return pic > scr ? [1, scr / pic] : [pic / scr, 1];
}
