// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { DomScreen } from './domScreen';
import { TheaterScreen } from './theaterScreen';

function scene() {
  const parent = document.createElement('div');
  const canvas = document.createElement('canvas');
  parent.append(canvas, document.createElement('div'));
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.9));
  screen.position.set(0, 1.2, -2);
  screen.updateMatrixWorld(true);
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.08, 100);
  const look = (x: number, z: number, at: THREE.Vector3) => {
    camera.position.set(x, 1, z);
    camera.lookAt(at);
    camera.updateMatrixWorld(true);
  };
  return { parent, canvas, screen, camera, look };
}

describe('a page element over a screen', () => {
  it('sits right after the canvas, sized to the screen’s shape, letting clicks through', () => {
    const { parent, canvas, screen } = scene();
    const d = new DomScreen(parent, canvas, screen, 1.6, 0.9, 'film-video', 1024);
    const layer = canvas.nextElementSibling as HTMLElement;
    expect(layer.className).toBe('film-video');
    expect(layer.style.pointerEvents).toBe('none');
    expect(d.holder.style.pointerEvents).toBe('none');
    expect(d.holder.style.width).toBe('1024px');
    expect(d.holder.style.height).toBe('576px');
  });

  it('shows only while on and the screen is in view, facing you', () => {
    const { parent, canvas, screen, camera, look } = scene();
    const d = new DomScreen(parent, canvas, screen, 1.6, 0.9, 'film-video');
    const layer = canvas.nextElementSibling as HTMLElement;
    look(0, 2, screen.position);
    expect(d.update(camera, false)).toBe(false);
    expect(layer.style.display).toBe('none');
    expect(d.update(camera, true)).toBe(true);
    expect(layer.style.display).toBe('');
    look(0, 2, new THREE.Vector3(0, 1, 6));
    expect(d.update(camera, true)).toBe(false);
    look(0, -4, screen.position);
    expect(d.update(camera, true)).toBe(false);
    d.dispose();
    expect(parent.querySelector('.film-video')).toBeNull();
  });
});

describe('the theater screen hands its film to the overlay', () => {
  it('draws black while overlaid (no frames copied), the film again when not, the card always', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    const s = new TheaterScreen(1.6, 0.9);
    const mat = s.mesh.material as THREE.MeshBasicMaterial;
    const card = mat.map;
    // No film: overlaying changes nothing, the card shows.
    s.setOverlaid(true);
    expect(mat.map).toBe(card);
    expect(s.element).toBeNull();
    s.setOverlaid(false);
    s.attach({} as MediaStream);
    expect(s.element).toBeInstanceOf(HTMLVideoElement);
    const film = mat.map;
    expect(film).toBeInstanceOf(THREE.VideoTexture);
    s.setOverlaid(true);
    expect(mat.map).toBeNull();
    expect(mat.color.getHex()).toBe(0x000000);
    s.setOverlaid(false);
    expect(mat.map).toBe(film);
    expect(mat.color.getHex()).toBe(0xffffff);
    // The film ends while overlaid: the card comes back, and its <video> leaves the page.
    const holder = document.createElement('div');
    holder.append(s.element!);
    s.setOverlaid(true);
    s.attach(null);
    expect(mat.map).not.toBeNull();
    expect(holder.children).toHaveLength(0);
    vi.restoreAllMocks();
  });
});
