// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { planIsland, trackSite, onTrack } from './layout';
import { LANDMARKS, reserveLandmarkSlots, onLandmarkLawn } from './landmarks/index';
import { LABITCONF } from './landmarks/labitconf';
import { CHAR_HEIGHT } from './character';
import { obeliskShape } from './obelisk';
import { VILLAGE_WORDS } from '../i18n/village';
import { TOTEM, TOTEM_URL, TOTEM_ORIGIN, buildTotemMonitor, drawTotemCard, inTotemZone, totemInView, OcclusionProbe, TotemStage } from './totemMonitor';

/** LABITCONF's slot and the monitor's footprint in world space, as World places them. */
function placed() {
  const plan = planIsland();
  const track = trackSite(plan);
  const free = plan.slots.filter((s) => !track || !onTrack(s.pos, track, s.w * 0.7 + 0.6));
  const slots = reserveLandmarkSlots(free, plan.plaza.c);
  const s = slots.get('labitconf')!;
  const d = LANDMARKS.find((x) => x.id === 'labitconf')!;
  const c = Math.cos(s.rot), sn = Math.sin(s.rot);
  const toWorld = (x: number, z: number) => ({ x: s.pos.x + sn * d.forward + x * c + z * sn, z: s.pos.z + c * d.forward - x * sn + z * c });
  const m = buildTotemMonitor();
  const so = m.solid;
  const corners = [[-so.hx, -so.hz], [so.hx, -so.hz], [-so.hx, so.hz], [so.hx, so.hz]].map(([x, z]) => toWorld(TOTEM.X + x, TOTEM.Z + z));
  // World → the screen's frame (x across it, z out of its face), as World.totemLocal.
  const toScreen = (p: { x: number; z: number }) => {
    const dx = p.x - (s.pos.x + sn * d.forward), dz = p.z - (s.pos.z + c * d.forward);
    return { x: dx * c - dz * sn - TOTEM.X, z: dx * sn + dz * c - TOTEM.Z };
  };
  return { plan, slots, s, d, m, corners, centre: toWorld(TOTEM.X, TOTEM.Z), toScreen };
}

describe('the totem monitor on LABITCONF’s lawn', () => {
  it('shows totemcillo, one address for the iframe and the CSP', () => {
    expect(TOTEM_URL).toBe('https://totemcillo.vercel.app/');
    expect(TOTEM_ORIGIN).toBe('https://totemcillo.vercel.app');
  });

  it('is a 16:9 screen named for the World, facing the plaza (+z), held by a stand', () => {
    const { group, screen } = buildTotemMonitor();
    expect(screen.name).toBe('totem-screen');
    expect(TOTEM.W / TOTEM.H).toBeCloseTo(16 / 9, 5);
    expect(screen.parent).toBe(group);
    group.updateMatrixWorld(true);
    const normal = new THREE.Vector3(0, 0, 1).transformDirection(screen.matrixWorld);
    expect(normal.z).toBeCloseTo(1, 5);
    const geo = screen.geometry as THREE.PlaneGeometry;
    expect(geo.parameters.width).toBeCloseTo(TOTEM.W, 5);
    expect(geo.parameters.height).toBeCloseTo(TOTEM.H, 5);
  });

  it('hangs over the heads and under LABITCONF’s wordmark', () => {
    const { screen } = buildTotemMonitor();
    expect(screen.position.y - TOTEM.H / 2).toBeGreaterThan(CHAR_HEIGHT + 0.05);
    // The sign over the door is centred H − 0.36 up the facade: its letters stay readable over the monitor.
    expect(screen.position.y + TOTEM.H / 2).toBeLessThan(LABITCONF.H - 0.36);
  });

  it('is solid as high as its top: you walk round it, you can’t jump through the screen', () => {
    const { solid } = buildTotemMonitor();
    expect(solid.hx).toBeGreaterThanOrEqual(TOTEM.W / 2);
    expect(solid.hz).toBeGreaterThan(0.05);
    expect(solid.top).toBeGreaterThanOrEqual(TOTEM.Y + TOTEM.H / 2);
  });

  it('stands on the lawn in front of the facade, left of the door, within the building’s width', () => {
    const { solid } = buildTotemMonitor();
    const f = LANDMARKS.find((x) => x.id === 'labitconf')!.footprint;
    expect(TOTEM.Z - solid.hz).toBeGreaterThan(f.maxZ + 0.1);
    expect(TOTEM.X - solid.hx).toBeGreaterThanOrEqual(-LABITCONF.W / 2);
    // Well clear of the double door (local x DOOR0..DOOR1) and its approach.
    expect(TOTEM.X + solid.hx).toBeLessThan(LABITCONF.DOOR0 - 0.3);
  });

  it('keeps off the cobbled path to the door, the plaza’s paving and its lanterns', () => {
    const { plan, s, corners, centre } = placed();
    // The road is laid two half-metre cells wide from the slot's door (world.ts layPaths).
    for (const p of corners) expect(p.x).toBeLessThan(s.door.x - 0.1);
    for (const p of corners) expect(Math.hypot(p.x - plan.plaza.c.x, p.z - plan.plaza.c.z)).toBeGreaterThan(plan.plaza.r);
    // Lanterns ring the plaza (world.ts buildPlaza): room to walk between them and the stand.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2;
      const l = { x: plan.plaza.c.x + Math.cos(a) * (plan.plaza.r + 0.25), z: plan.plaza.c.z + Math.sin(a) * (plan.plaza.r + 0.25) };
      const { solid } = buildTotemMonitor();
      const dx = Math.max(0, Math.abs(l.x - centre.x) - solid.hx), dz = Math.max(0, Math.abs(l.z - centre.z) - solid.hz);
      expect(Math.hypot(dx, dz)).toBeGreaterThan(0.3);
    }
    // And never inside the obelisk.
    expect(Math.hypot(centre.x - plan.plaza.c.x, centre.z - plan.plaza.c.z)).toBeGreaterThan(obeliskShape(8).base + 1);
  });

  it('keeps the plaza’s lanterns out from in front of the screen: LABITCONF’s lawn reaches past its watch zone, and no other lantern goes', () => {
    const { plan, slots, toScreen } = placed();
    const others = LANDMARKS.filter((x) => x.id !== 'labitconf');
    let inFront = 0;
    // The ring of lanterns round the plaza (world.ts buildPlaza), each dropped on a landmark's lawn.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2;
      const l = { x: plan.plaza.c.x + Math.cos(a) * (plan.plaza.r + 0.25), z: plan.plaza.c.z + Math.sin(a) * (plan.plaza.r + 0.25) };
      const front = inTotemZone(toScreen(l), TOTEM.ZONE.pad);
      if (front) inFront++;
      expect(onLandmarkLawn(l, slots)).toBe(front || onLandmarkLawn(l, slots, others));
    }
    expect(inFront).toBe(1); // the one that stood between the plaza and the screen
  });
});

describe('the totem’s screen in the village', () => {
  it('paints a still look of the totem (its name, tags and QR block), never an instruction', () => {
    const said: string[] = [];
    let rects = 0;
    const g = new Proxy({} as CanvasRenderingContext2D, {
      get: (_t, k) => (k === 'fillText' ? (t: string) => said.push(t) : k === 'fillRect' ? () => { rects++; } : k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {}),
      set: () => true,
    });
    drawTotemCard(g, 1024, 576);
    const text = said.join(' ');
    expect(text).toMatch(/totemcillo/);
    expect(text).not.toMatch(/LABITCONF/);
    expect(text).toMatch(/la crypta/i);
    expect(text).toMatch(/#lacrypta/);
    expect(text).not.toMatch(/acerc|closer|approach|walk|tap|press|apret|click/i);
    // The QR's modules: a block of squares, as the totem shows one.
    expect(rects).toBeGreaterThan(40);
  });

  it('builds no page into the mesh itself (the live one is TotemStage’s layer)', () => {
    const { group } = buildTotemMonitor();
    let frames = 0;
    group.traverse((o) => { if ((o as unknown as { element?: unknown }).element) frames++; });
    expect(frames).toBe(0);
    expect(document.querySelectorAll('iframe')).toHaveLength(0);
  });
});

describe('walking up to the totem', () => {
  // Monitor-local: x across the screen, z out of its face (+z toward the plaza).
  it('is the ground right in front of the screen, as wide as it', () => {
    expect(inTotemZone({ x: 0, z: 0.6 })).toBe(true);
    expect(inTotemZone({ x: TOTEM.W / 2 - 0.05, z: 0.4 })).toBe(true);
    // Beside it, behind it, or back at the plaza: not.
    expect(inTotemZone({ x: TOTEM.W / 2 + 0.3, z: 0.6 })).toBe(false);
    expect(inTotemZone({ x: 0, z: -0.4 })).toBe(false);
    expect(inTotemZone({ x: 0, z: TOTEM.ZONE.depth + 0.2 })).toBe(false);
    // Padded, a little wider all round.
    expect(inTotemZone({ x: 0, z: TOTEM.ZONE.depth + 0.2 }, TOTEM.ZONE.pad)).toBe(true);
  });

  it('keeps clear of the road to LABITCONF’s door and the plaza’s middle (passers-by don’t get focused)', () => {
    const { plan, s } = placed();
    // World → monitor-local (LABITCONF faces +z at rot 0 here; checked by the placement tests).
    expect(Math.abs(s.rot)).toBeCloseTo(0, 6);
    const d = LANDMARKS.find((x) => x.id === 'labitconf')!;
    const local = (p: { x: number; z: number }) => ({ x: p.x - (s.pos.x + TOTEM.X), z: p.z - (s.pos.z + d.forward + TOTEM.Z) });
    for (let z = -3.75; z <= -0.25; z += 0.25) for (const x of [2.05, 2.5, 2.95]) expect(inTotemZone(local({ x, z }))).toBe(false);
    expect(inTotemZone(local(plan.plaza.c), TOTEM.ZONE.pad)).toBe(false);
  });

  it('asks before focusing: “Press E to watch the totemcillo”, in both languages (a tap on touch screens)', () => {
    const { en, es } = VILLAGE_WORDS;
    expect(en.watchTotem(false)).toBe('Press E to watch the totemcillo');
    expect(es.watchTotem(false)).toBe('Apretá E para mirar el totemcillo');
    expect(en.watchTotem(true)).not.toMatch(/\bE\b/);
    expect(es.watchTotem(true)).not.toMatch(/\bE\b/);
    for (const w of [en.watchTotem(true), en.watchTotem(false), es.watchTotem(true), es.watchTotem(false)]) expect(w).not.toMatch(/acerc|closer/i);
  });
});

describe('the live totem on the monitor', () => {
  it('is on within VIEW_M of the camera (6 m: past it the page is unreadable) and off past VIEW_M + VIEW_PAD', () => {
    expect(TOTEM.VIEW_M).toBe(6);
    expect(totemInView(TOTEM.VIEW_M - 0.1, false)).toBe(true);
    expect(totemInView(TOTEM.VIEW_M + 0.5, false)).toBe(false);
    expect(totemInView(TOTEM.VIEW_M + 0.5, true)).toBe(true);
    expect(totemInView(TOTEM.VIEW_M + TOTEM.VIEW_PAD + 0.1, true)).toBe(false);
  });

  function view() {
    const { group, screen } = buildTotemMonitor();
    group.position.set(0, 0, -3);
    group.updateMatrixWorld(true);
    const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.08, 100);
    camera.position.set(0, 1.4, 3);
    camera.lookAt(new THREE.Vector3(0, TOTEM.Y, -3));
    camera.updateMatrixWorld(true);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 0.2), new THREE.MeshBasicMaterial());
    wall.position.set(0, 1.5, 0);
    wall.updateMatrixWorld(true);
    return { screen, camera, wall };
  }

  it('sees the screen when nothing stands between it and the camera, not when a building does', () => {
    const { screen, camera, wall } = view();
    expect(new OcclusionProbe().clear(1, camera, screen, [])).toBe(true);
    expect(new OcclusionProbe().clear(1, camera, screen, [wall])).toBe(false);
    // A post off to the side hides one corner only: still hidden (the page would cover it).
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 4, 0.1), new THREE.MeshBasicMaterial());
    post.position.set(-0.7, 1, -2.2);
    post.updateMatrixWorld(true);
    expect(new OcclusionProbe().clear(1, camera, screen, [post])).toBe(false);
  });

  it('sees through glows (sprites): they never hide the screen, and probing them doesn’t throw', () => {
    const { screen, camera } = view();
    const glow = new THREE.Sprite(new THREE.SpriteMaterial());
    glow.position.set(0, 1.4, 0);
    glow.scale.setScalar(2);
    glow.updateMatrixWorld(true);
    expect(new OcclusionProbe().clear(1, camera, screen, [glow])).toBe(true);
  });

  it('looks a few times a second, keeping the last answer in between', () => {
    const { screen, camera, wall } = view();
    const probe = new OcclusionProbe();
    expect(probe.clear(1, camera, screen, [])).toBe(true);
    expect(probe.clear(TOTEM.PROBE_S / 4, camera, screen, [wall])).toBe(true);
    expect(probe.clear(TOTEM.PROBE_S, camera, screen, [wall])).toBe(false);
    expect(TOTEM.PROBE_S).toBeLessThanOrEqual(0.25);
  });

  function stageSetup() {
    const parent = document.createElement('div');
    const canvas = document.createElement('canvas');
    parent.append(canvas, document.createElement('div'));
    const v = view();
    const stage = new TotemStage(parent, canvas, v.screen, TOTEM.W, TOTEM.H);
    stage.setSize(800, 450);
    return { parent, canvas, stage, ...v };
  }

  it('lays the page right after the canvas, letting clicks through to the world', () => {
    const { canvas } = stageSetup();
    const layer = canvas.nextElementSibling as HTMLElement;
    expect(layer.className).toBe('totem-video');
    expect(layer.style.pointerEvents).toBe('none');
  });

  it('opens totemcillo in view, hides it (page kept) while hidden, drops it (and its connections) out of range', () => {
    const { parent, canvas, camera, stage } = stageSetup();
    const layer = canvas.nextElementSibling as HTMLElement;
    stage.update(camera, false, true);
    expect(parent.querySelectorAll('iframe')).toHaveLength(0);
    stage.update(camera, true, true);
    const f = parent.querySelector('iframe')!;
    expect(f.src).toBe(TOTEM_URL);
    expect(f.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin');
    expect(f.style.pointerEvents).toBe('none');
    expect(f.tabIndex).toBe(-1);
    // Wide enough that totemcillo draws its totem view, not its phone view (max-width: 700px).
    expect(parseInt(f.style.width, 10)).toBeGreaterThan(700);
    expect(layer.style.display).toBe('');
    expect(stage.live).toBe(true);
    // Hidden by a building: the 3D card shows, the page keeps running.
    stage.update(camera, true, false);
    expect(layer.style.display).toBe('none');
    expect(parent.querySelectorAll('iframe')).toHaveLength(1);
    // Out of range (or focus mode has the page): gone.
    stage.update(camera, false, true);
    expect(parent.querySelectorAll('iframe')).toHaveLength(0);
    expect(stage.live).toBe(false);
  });
});
