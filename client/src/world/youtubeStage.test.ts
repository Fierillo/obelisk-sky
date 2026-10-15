// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { YoutubeStage, embedUrl, stageVisible, LABITCONF_VIDEO } from './youtubeStage';

function setup() {
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
  const stage = new YoutubeStage(parent, canvas, screen, 1.6, 0.9);
  stage.setSize(800, 450);
  return { parent, canvas, screen, camera, look, stage };
}

describe('the LABITCONF video', () => {
  it('embeds the video muted, autoplaying and looping', () => {
    const u = new URL(embedUrl());
    expect(u.origin).toBe('https://www.youtube-nocookie.com');
    expect(u.pathname).toBe(`/embed/${LABITCONF_VIDEO}`);
    expect(LABITCONF_VIDEO).toBe('UniEraIBJZQ');
    expect(u.searchParams.get('autoplay')).toBe('1');
    // Starts muted (so it may autoplay); sound comes through the player's messages.
    expect(u.searchParams.get('mute')).toBe('1');
    expect(u.searchParams.get('enablejsapi')).toBe('1');
    expect(new URL(embedUrl(LABITCONF_VIDEO, 'https://sky.obelisk.ar')).searchParams.get('origin')).toBe('https://sky.obelisk.ar');
    expect(u.searchParams.get('loop')).toBe('1');
    // YouTube only loops a single video through a playlist of itself.
    expect(u.searchParams.get('playlist')).toBe(LABITCONF_VIDEO);
  });

  it('puts its layer right after the canvas, under the overlay, letting clicks through', () => {
    const { parent, canvas } = setup();
    const layer = canvas.nextElementSibling as HTMLElement;
    expect(layer.className).toBe('stage-video');
    expect(layer.style.pointerEvents).toBe('none');
    expect(parent.children).toHaveLength(3);
  });

  it('plays while you are inside and stops when you leave', () => {
    const { parent, look, screen, camera, stage } = setup();
    look(0, 2, screen.position);
    stage.update(camera, false);
    expect(parent.querySelectorAll('iframe')).toHaveLength(0);
    stage.update(camera, true);
    stage.update(camera, true);
    const frames = parent.querySelectorAll('iframe');
    expect(frames).toHaveLength(1);
    expect(frames[0].src).toBe(embedUrl(LABITCONF_VIDEO, location.origin));
    expect(frames[0].allow).toContain('autoplay');
    // The page sends no referrer; YouTube's player wants one.
    expect(frames[0].referrerPolicy).toBe('strict-origin-when-cross-origin');
    expect(stage.playing).toBe(true);
    stage.update(camera, false);
    expect(parent.querySelectorAll('iframe')).toHaveLength(0);
    expect(stage.playing).toBe(false);
  });

  it('shows only while the wall is in view and faces you', () => {
    const { screen, camera, look, stage, canvas } = setup();
    const layer = canvas.nextElementSibling as HTMLElement;
    const frustum = () => new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    look(0, 2, screen.position);
    expect(stageVisible(screen, camera, frustum(), 1.6, 0.9)).toBe(true);
    stage.update(camera, true);
    expect(layer.style.display).toBe('');
    // Looking away from it.
    look(0, 2, new THREE.Vector3(0, 1, 6));
    expect(stageVisible(screen, camera, frustum(), 1.6, 0.9)).toBe(false);
    stage.update(camera, true);
    expect(layer.style.display).toBe('none');
    // Behind the wall, looking at its back.
    look(0, -4, screen.position);
    expect(stageVisible(screen, camera, frustum(), 1.6, 0.9)).toBe(false);
  });
});

describe('the LABITCONF video’s sound', () => {
  it('unmutes the player while sound is on, mutes it when off, and keeps telling a fresh player', () => {
    const { parent, look, screen, camera, stage } = setup();
    document.body.append(parent);
    look(0, 2, screen.position);
    stage.update(camera, true);
    const f = parent.querySelector('iframe')!;
    const sent: { func: string; args: unknown[] }[] = [];
    const origins: string[] = [];
    f.contentWindow!.postMessage = ((m: string, o: string) => { sent.push(JSON.parse(m)); origins.push(o); }) as typeof window.postMessage;
    stage.setSound(true);
    expect(sent.map((m) => m.func)).toEqual(['unMute', 'setVolume', 'playVideo']);
    expect(sent[1].args).toEqual([100]);
    expect(new Set(origins)).toEqual(new Set(['https://www.youtube-nocookie.com']));
    // Said again each second for a while (the player ignores commands until it's ready), then left alone.
    sent.length = 0;
    for (let i = 0; i < 10; i++) stage.update(camera, true, 1);
    expect(sent.filter((m) => m.func === 'unMute').length).toBeGreaterThanOrEqual(4);
    sent.length = 0;
    for (let i = 0; i < 5; i++) stage.update(camera, true, 1);
    expect(sent).toHaveLength(0);
    stage.setSound(false);
    expect(sent.map((m) => m.func)).toEqual(['mute', 'playVideo']);
    parent.remove();
  });
});
