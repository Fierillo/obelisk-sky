// The theater's big screen: a shared screen from the call plays on it as a
// video texture, letterboxed to keep its shape (the plane shrinks over a
// black backing); with nothing shared it shows
// a card (the channel, or how to start a screening). Unlit, so it glows in
// the dark hall and costs no light. The video is paused while nobody near
// is watching, so phones don't decode a film they can't see.

import * as THREE from 'three';
import { canvasTexture } from './landmarks/signs';

const CARD_W = 1024, CARD_H = 576;

export class TheaterScreen {
  readonly mesh: THREE.Mesh;
  private mat: THREE.MeshBasicMaterial;
  private card: THREE.CanvasTexture;
  private cardKey = '';
  private video: HTMLVideoElement | null = null;
  private tex: THREE.VideoTexture | null = null;
  private stream: MediaStream | null = null;
  private active = true;

  constructor(readonly width: number, readonly height: number) {
    this.card = canvasTexture(CARD_W, CARD_H, () => {});
    this.mat = new THREE.MeshBasicMaterial({ map: this.card, toneMapped: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), this.mat);
    this.mesh.name = 'theater-screen';
    this.showCard('Theater', 'Pick a channel and start a screening');
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
    v.autoplay = true;
    v.srcObject = stream;
    v.addEventListener('resize', () => this.fit());
    v.addEventListener('loadedmetadata', () => this.fit());
    this.video = v;
    this.stream = stream;
    this.tex = new THREE.VideoTexture(v);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.useMap(this.tex);
    if (this.active) void v.play().catch(() => {});
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
    this.mat.map = t;
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
