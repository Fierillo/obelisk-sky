// The Liberture house: a dark slate cube with an indigo neon cornice, a
// glass front and, above the roof, the six pillars of the Liberture logo as
// glowing orbs going round an upright ring that swings like the nostr-wot
// graph next door. Inside, one corner
// per pillar (a desk for Work, a daybed for Sleep, a counter of greens for
// Nutrition, cushions for Mind, a dumbbell rack for Exercise, a safe for
// Finance), a habit heatmap on the back wall and the "pillar tower" (the
// app's habit helix: one radar plate a day, stacked) turning in the middle.
//
// Local frame: facade on z = 0 facing +z, the building behind it.

import * as THREE from 'three';
import type { LandmarkBuild, LandmarkSeat } from './index';
import { bitcoinSign, canvasTexture } from './signs';

/** The six pillars in Liberture's order, with the colours its tracker paints. */
export const PILLARS = [
  { id: 'work', color: 0x8b93f8 },
  { id: 'sleep', color: 0x4fc7d9 },
  { id: 'nutrition', color: 0x3fcf8e },
  { id: 'mind', color: 0xf472b6 },
  { id: 'exercise', color: 0xf2a15a },
  { id: 'finance', color: 0xd4b23c },
] as const;

const INDIGO = 0x5b5bd6;
export const W = 2.6, D = 1.8, H = 1.5;
const T = 0.07;
/** Top of the roof slab. */
export const ROOF = H + 0.08;
const RING_R = 0.55, ORB_R = 0.15;
const RING_C = { x: 0, y: ROOF + 1.05, z: -D / 2 };

/** Which way the orbs' ring faces at time `t`: it swings like the
 *  nostr-wot graph next door (radians about +y). */
export const ringYaw = (t: number) => Math.sin(t * 0.25) * 0.6;

/** Where pillar orb `i` floats at time `t` (local): on an upright ring (the
 *  logo's hexagon stood on edge), going round, each orb bobbing a little on
 *  its own phase, the ring swinging side to side. `out` is reused. */
export function orbPosition(i: number, t: number, out = new THREE.Vector3()): THREE.Vector3 {
  const a = Math.PI / 2 - i * (Math.PI / 3) + t * 0.22;
  const u = Math.cos(a) * RING_R, yaw = ringYaw(t);
  return out.set(
    RING_C.x + u * Math.cos(yaw),
    RING_C.y + Math.sin(a) * RING_R + Math.sin(t * 1.2 + i * 1.05) * 0.03,
    RING_C.z - u * Math.sin(yaw),
  );
}

const flat = (color: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...o });
const neon = (color: number, k = 0.8) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k, roughness: 0.4 });
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

const haloTexture = () => canvasTexture(64, 64, (g) => {
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.3, 'rgba(255,255,255,0.45)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
});

const signTexture = () => canvasTexture(640, 112, (g) => {
  g.fillStyle = '#0f1420';
  g.fillRect(0, 0, 640, 112);
  const grad = g.createLinearGradient(60, 0, 580, 0);
  grad.addColorStop(0, '#8B5CF6');
  grad.addColorStop(0.5, '#06B6D4');
  grad.addColorStop(1, '#10B981');
  g.fillStyle = grad;
  g.font = '800 70px Inter, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('LIBERTURE', 320, 60);
});

/** The back-wall screen: a year of habits as a heatmap and this week's grid, in the pillar colours. */
const screenTexture = () => canvasTexture(512, 288, (g) => {
  g.fillStyle = '#0f1420';
  g.fillRect(0, 0, 512, 288);
  g.fillStyle = '#e8eaf2';
  g.font = '700 22px Inter, system-ui, sans-serif';
  g.fillText('Today', 24, 38);
  g.fillStyle = '#8a90a6';
  g.font = '500 15px "Geist Mono", ui-monospace, monospace';
  g.fillText('streak 42 · 5/6 pillars', 330, 38);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let row = 0; row < 6; row++) {
    const col = hex(PILLARS[row].color);
    for (let d = 0; d < 34; d++) {
      g.globalAlpha = rnd() < 0.25 ? 0.12 : 0.35 + rnd() * 0.65;
      g.fillStyle = col;
      g.fillRect(24 + d * 13.5, 64 + row * 20, 11, 16);
    }
  }
  g.globalAlpha = 1;
  // This week: a ring per pillar.
  PILLARS.forEach((p, i) => {
    const x = 60 + i * 78, y = 230, k = 0.45 + ((i * 37) % 50) / 100;
    g.strokeStyle = '#262c3d';
    g.lineWidth = 8;
    g.beginPath(); g.arc(x, y, 26, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = hex(p.color);
    g.beginPath(); g.arc(x, y, 26, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); g.stroke();
  });
});

export function buildLibertureHouse(): LandmarkBuild {
  const g = new THREE.Group();
  const slate = flat(0x1d2330);
  const inner = flat(0x2b3242);
  const trim = flat(0x121620);
  const indigo = neon(INDIGO, 0.9);
  const box = (w: number, h: number, d: number, m: THREE.Material | THREE.Material[], x: number, y: number, z: number, parent: THREE.Object3D = g) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z);
    b.castShadow = b.receiveShadow = true;
    parent.add(b);
    return b;
  };

  // Walls: slate outside, lighter inside. The front is glass either side of a centred door.
  const DOOR0 = -0.25, DOOR1 = 0.25, DOOR_H = 1.0, WIN_Y0 = 0.18, WIN_Y1 = 1.12;
  const WINS: [number, number][] = [[-1.12, -0.4], [0.4, 1.12]];
  const walls: THREE.Mesh[] = [
    box(W, H, T, [slate, slate, slate, slate, inner, slate], 0, H / 2, -D + T / 2),
    box(T, H, D, [inner, slate, slate, slate, slate, slate], -W / 2 + T / 2, H / 2, -D / 2),
    box(T, H, D, [slate, inner, slate, slate, slate, slate], W / 2 - T / 2, H / 2, -D / 2),
  ];
  // Front: solid between the openings, sills and heads over the windows and door.
  const solidsX: [number, number][] = [[-W / 2, -1.12], [-0.4, DOOR0], [DOOR1, 0.4], [1.12, W / 2]];
  for (const [a, b] of solidsX) walls.push(box(b - a, H, T, slate, (a + b) / 2, H / 2, -T / 2));
  for (const [a, b] of WINS) {
    walls.push(box(b - a, WIN_Y0, T, slate, (a + b) / 2, WIN_Y0 / 2, -T / 2));
    walls.push(box(b - a, H - WIN_Y1, T, slate, (a + b) / 2, (H + WIN_Y1) / 2, -T / 2));
  }
  walls.push(box(DOOR1 - DOOR0, H - DOOR_H, T, slate, 0, (H + DOOR_H) / 2, -T / 2));
  // "Bitcoin accepted here" beside the door.
  const btc = bitcoinSign();
  btc.scale.setScalar(0.66);
  btc.position.set((DOOR1 + 0.4) / 2, 0.66, 0.004);
  g.add(btc);

  // Flat roof with a parapet, the neon cornice line, and the plinth the orbs rise from.
  const roofParts: THREE.Object3D[] = [];
  roofParts.push(box(W + 0.08, 0.08, D + 0.08, trim, 0, H + 0.04, -D / 2));
  for (const [w, d, x, z] of [[W + 0.08, 0.06, 0, 0.01], [W + 0.08, 0.06, 0, -D - 0.01], [0.06, D + 0.08, -W / 2 - 0.01, -D / 2], [0.06, D + 0.08, W / 2 + 0.01, -D / 2]] as const) {
    roofParts.push(box(w, 0.1, d, slate, x, ROOF + 0.05, z));
  }
  const cornice = [
    box(W + 0.1, 0.025, 0.02, indigo, 0, H - 0.02, 0.05),
    box(0.02, 0.025, D + 0.1, indigo, -W / 2 - 0.04, H - 0.02, -D / 2),
    box(0.02, 0.025, D + 0.1, indigo, W / 2 + 0.04, H - 0.02, -D / 2),
  ];
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.08, 6), trim);
  plinth.position.set(RING_C.x, ROOF + 0.04, RING_C.z);
  plinth.castShadow = true;
  g.add(plinth);
  const plinthRing = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.015, 4, 6), indigo);
  plinthRing.rotation.x = Math.PI / 2;
  plinthRing.position.set(RING_C.x, ROOF + 0.085, RING_C.z);
  g.add(plinthRing);
  roofParts.push(plinth, plinthRing);
  box(W + 0.04, 0.12, 0.05, trim, 0, 0.06, 0.02); // base

  // Floor: dark, with the hexagon of the pillars inlaid round the tower.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W - 2 * T, D - T), flat(0x181d28, { roughness: 0.6 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0.006, -D / 2 - T / 2);
  floor.receiveShadow = true;
  g.add(floor);
  const TOWER = { x: 0, z: -0.98 };
  const inlayMats = PILLARS.map((p) => new THREE.MeshStandardMaterial({ color: p.color, emissive: p.color, emissiveIntensity: 0.25, roughness: 0.5 }));
  PILLARS.forEach((_, i) => {
    const seg = new THREE.Mesh(new THREE.CircleGeometry(0.5, 1, Math.PI / 2 + i * (Math.PI / 3), Math.PI / 3), inlayMats[i]);
    seg.rotation.x = -Math.PI / 2;
    seg.position.set(TOWER.x, 0.008, TOWER.z);
    seg.scale.setScalar(0.96);
    g.add(seg);
  });

  // Glass front and the door (hinged on its left edge, swings in).
  const glass = new THREE.MeshStandardMaterial({ color: 0xc9d2ff, emissive: 0x7c83ff, emissiveIntensity: 0.08, roughness: 0.1, transparent: true, opacity: 0.25, depthWrite: false });
  for (const [a, b] of WINS) {
    const pane = new THREE.Mesh(new THREE.BoxGeometry(b - a, WIN_Y1 - WIN_Y0, 0.02), glass);
    pane.position.set((a + b) / 2, (WIN_Y0 + WIN_Y1) / 2, -0.01);
    g.add(pane);
    for (const x of [a, (a + b) / 2, b]) box(0.03, WIN_Y1 - WIN_Y0 + 0.03, 0.04, trim, x, (WIN_Y0 + WIN_Y1) / 2, 0.005);
  }
  const doorPivot = new THREE.Group();
  doorPivot.position.set(DOOR0, 0, 0);
  g.add(doorPivot);
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(DOOR1 - DOOR0, DOOR_H, 0.03), glass);
  leaf.position.set((DOOR1 - DOOR0) / 2, DOOR_H / 2, -0.015);
  doorPivot.add(leaf);
  for (const x of [0.015, DOOR1 - DOOR0 - 0.015]) box(0.03, DOOR_H, 0.035, trim, x, DOOR_H / 2, -0.015, doorPivot);
  box(0.012, 0.3, 0.02, indigo, DOOR1 - DOOR0 - 0.06, 0.5, 0.012, doorPivot); // bar handle

  // The sign over the door.
  const signTex = signTexture();
  const signMat = new THREE.MeshStandardMaterial({ map: signTex, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 0.4 });
  const sign = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.21, 0.04), [trim, trim, trim, trim, signMat, trim]);
  sign.position.set(0, 1.3, 0.04);
  g.add(sign);

  // Inside.
  const seats: LandmarkSeat[] = [];
  const solids: NonNullable<LandmarkBuild['solids']> = [];
  const wood = flat(0x3a3f52);
  const light = flat(0xd9dce6);
  const BACK = -D + T;
  const glyphs = new THREE.TextureLoader();
  /** A pillar's corner: its glyph on the wall and a strip of its colour at the skirting. */
  const corner = (i: number, x: number, z: number, rotY: number, strip: number, y = 1.05) => {
    const p = PILLARS[i];
    const tex = glyphs.load(`/liberture/${p.id}.svg`);
    tex.colorSpace = THREE.SRGBColorSpace;
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    plaque.position.set(x, y, z);
    plaque.rotation.y = rotY;
    g.add(plaque);
    const s = new THREE.Mesh(new THREE.BoxGeometry(strip, 0.02, 0.012), inlayMats[i]);
    s.position.set(x, 0.05, z + (rotY === 0 ? 0.002 : 0));
    s.rotation.y = rotY;
    g.add(s);
  };

  // Work, back left: a desk with a laptop and a chair.
  {
    const x = -0.78, z = BACK + 0.16;
    box(0.56, 0.025, 0.28, wood, x, 0.31, z);
    for (const dx of [-0.25, 0.25]) box(0.025, 0.3, 0.26, trim, x + dx, 0.15, z);
    const lid = box(0.2, 0.13, 0.008, flat(0x2b2f3a), x, 0.39, z - 0.06);
    lid.rotation.x = -0.2;
    box(0.2, 0.008, 0.13, flat(0x2b2f3a), x, 0.33, z + 0.01);
    box(0.18, 0.11, 0.004, neon(PILLARS[0].color, 0.6), x, 0.39, z - 0.054).rotation.x = -0.2;
    solids.push({ x, z, hx: 0.28, hz: 0.14, top: 0.33 });
    const cz = z + 0.33;
    box(0.17, 0.02, 0.17, light, x, 0.18, cz);
    box(0.17, 0.2, 0.02, light, x, 0.29, cz + 0.085);
    box(0.02, 0.18, 0.02, trim, x, 0.09, cz);
    seats.push({ pos: { x, z: cz }, face: Math.PI, y: 0.19, prop: 'none', laptop: true, indoor: true });
    corner(0, x, BACK + 0.004, 0, 0.6);
  }
  // Finance, back centre under the screen: a sideboard with a safe and coin jars.
  {
    const x = 0.02, z = BACK + 0.12;
    box(0.5, 0.26, 0.2, wood, x, 0.13, z);
    solids.push({ x, z, hx: 0.25, hz: 0.1, top: 0.27 });
    box(0.16, 0.16, 0.14, flat(0x3c4150, { metalness: 0.6, roughness: 0.4 }), x - 0.13, 0.34, z);
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 12), neon(PILLARS[5].color, 0.5));
    dial.rotation.x = Math.PI / 2;
    dial.position.set(x - 0.13, 0.34, z + 0.075);
    g.add(dial);
    const coin = neon(PILLARS[5].color, 0.25);
    for (let j = 0; j < 3; j++) {
      const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.1, 10), glass);
      jar.position.set(x + 0.05 + j * 0.08, 0.31, z);
      g.add(jar);
      const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03 + j * 0.03, 10), coin);
      fill.position.set(x + 0.05 + j * 0.08, 0.27 + (0.03 + j * 0.03) / 2, z);
      g.add(fill);
    }
    corner(5, x, BACK + 0.004, 0, 0.5, 1.3);
  }
  // The screen: a year of habits.
  const screenTex = screenTexture();
  const screenMat = new THREE.MeshStandardMaterial({ map: screenTex, emissive: 0xffffff, emissiveMap: screenTex, emissiveIntensity: 0.5 });
  box(0.86, 0.5, 0.02, trim, 0.02, 0.84, BACK + 0.012);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.45), screenMat);
  screen.position.set(0.02, 0.84, BACK + 0.024);
  g.add(screen);
  // Nutrition, back right: a counter with greens and a bowl of fruit.
  {
    const x = 0.86, z = BACK + 0.15;
    box(0.6, 0.4, 0.26, light, x, 0.2, z);
    box(0.62, 0.025, 0.28, wood, x, 0.41, z);
    solids.push({ x, z, hx: 0.31, hz: 0.14, top: 0.43 });
    const green = flat(0x3f8f4a);
    for (const [dx, s] of [[-0.2, 0.08], [-0.1, 0.06]] as const) {
      box(0.07, 0.07, 0.07, flat(0xe7e2d8), x + dx, 0.46, z - 0.04);
      const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), green);
      leaves.position.set(x + dx, 0.53, z - 0.04);
      g.add(leaves);
    }
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), light);
    bowl.position.set(x + 0.12, 0.5, z + 0.02);
    g.add(bowl);
    for (const [dx, dz, c] of [[0.09, 0.0, 0xf2a15a], [0.15, 0.03, 0xe0473b], [0.12, -0.03, 0xd4c43c]] as const) {
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), flat(c));
      f.position.set(x + dx, 0.47, z + 0.02 + dz);
      g.add(f);
    }
    corner(2, x, BACK + 0.004, 0, 0.6);
  }
  // Sleep, along the left wall: a low daybed with a moon lamp.
  {
    const x = -W / 2 + T + 0.17, z = -0.78;
    box(0.3, 0.12, 0.62, trim, x, 0.06, z);
    box(0.28, 0.06, 0.6, flat(0x34507a), x, 0.15, z);
    box(0.08, 0.05, 0.16, light, x - 0.08, 0.2, z - 0.2); // pillow
    solids.push({ x, z, hx: 0.15, hz: 0.31, top: 0.18 });
    seats.push({ pos: { x: x + 0.04, z: z + 0.12 }, face: Math.PI / 2, y: 0.18, prop: 'none', indoor: true });
    const moon = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10), neon(0xdff6ff, 0.9));
    moon.position.set(x, 0.62, z - 0.42);
    g.add(moon);
    box(0.012, 0.55, 0.012, trim, x, 0.3, z - 0.42);
    solids.push({ x, z: z - 0.42, hx: 0.04, hz: 0.04, top: 2 });
    corner(1, -W / 2 + T + 0.004, z, Math.PI / 2, 0.62);
  }
  // Exercise, along the right wall: a dumbbell rack and a yoga mat.
  {
    const x = W / 2 - T - 0.1, z = -0.85;
    box(0.14, 0.04, 0.5, trim, x, 0.28, z);
    for (const dz of [-0.22, 0.22]) box(0.12, 0.28, 0.03, trim, x, 0.14, z + dz);
    const bell = flat(0x3a3f4d, { metalness: 0.5, roughness: 0.5 });
    for (let j = 0; j < 4; j++) {
      const bz = z - 0.17 + j * 0.115, r = 0.025 + j * 0.006;
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 6), bell);
      bar.rotation.x = Math.PI / 2;
      bar.position.set(x, 0.32 + r, bz);
      g.add(bar);
      for (const e of [-0.045, 0.045]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.03, 8), bell);
        w.rotation.x = Math.PI / 2;
        w.position.set(x, 0.32 + r, bz + e);
        g.add(w);
      }
    }
    solids.push({ x, z, hx: 0.07, hz: 0.25, top: 0.38 });
    const mat = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.012, 0.62), neon(PILLARS[4].color, 0.15));
    mat.position.set(x - 0.32, 0.012, -0.4);
    mat.receiveShadow = true;
    g.add(mat);
    corner(4, W / 2 - T - 0.004, z, -Math.PI / 2, 0.5);
  }
  // Mind, by the left window: two meditation cushions looking out.
  {
    const cushion = flat(PILLARS[3].color, { roughness: 0.95 });
    for (const x of [-0.78, -0.48]) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.08, 14), cushion);
      c.position.set(x, 0.04, -0.3);
      c.castShadow = c.receiveShadow = true;
      g.add(c);
      seats.push({ pos: { x, z: -0.3 }, face: 0, y: 0.1, prop: 'none', indoor: true });
    }
    const plant = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 1), flat(0x3f8f4a));
    plant.position.set(-1.05, 0.28, -0.22);
    plant.scale.set(1, 1.4, 1);
    g.add(plant);
    box(0.13, 0.15, 0.13, trim, -1.05, 0.075, -0.22);
    solids.push({ x: -1.05, z: -0.22, hx: 0.07, hz: 0.07, top: 0.5 });
    corner(3, -W / 2 + T + 0.004, -0.3, Math.PI / 2, 0.3);
  }

  // The pillar tower: the habit helix, a radar plate a day stacked up, today on top.
  const tower = new THREE.Group();
  tower.position.set(TOWER.x, 0, TOWER.z);
  g.add(tower);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.0, 6), indigo);
  rod.position.y = 0.6;
  tower.add(rod);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.1, 6), trim);
  base.position.y = 0.05;
  base.castShadow = true;
  tower.add(base);
  const plateMat = new THREE.MeshBasicMaterial({ color: INDIGO, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
  const edgeMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95 });
  const DAYS = 7;
  for (let d = 0; d < DAYS; d++) {
    const pts: THREE.Vector2[] = [];
    const cols: number[] = [];
    for (let i = 0; i < 6; i++) {
      const v = 0.45 + 0.55 * Math.abs(Math.sin(d * 1.7 + i * 2.3));
      const a = Math.PI / 2 - i * (Math.PI / 3);
      pts.push(new THREE.Vector2(Math.cos(a) * 0.22 * v, Math.sin(a) * 0.22 * v));
      const c = new THREE.Color(PILLARS[i].color);
      cols.push(c.r, c.g, c.b);
    }
    const y = 0.2 + d * 0.13;
    const fill = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(pts)), plateMat);
    fill.rotation.x = -Math.PI / 2;
    fill.position.y = y;
    tower.add(fill);
    const edgeGeo = new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(p.x, y, -p.y)));
    edgeGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    tower.add(new THREE.LineLoop(edgeGeo, edgeMat));
  }
  solids.push({ x: TOWER.x, z: TOWER.z, hx: 0.2, hz: 0.2, top: 2 });

  // The six pillar orbs over the roof, with halos and faint beams down to the plinth.
  const halo = haloTexture();
  const orbs: { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial; glow: THREE.Sprite; beam: THREE.Mesh }[] = [];
  const beamGeo = new THREE.CylinderGeometry(0.008, 0.008, 1, 5, 1, true);
  beamGeo.translate(0, 0.5, 0);
  PILLARS.forEach((p) => {
    const mat = new THREE.MeshStandardMaterial({ color: p.color, emissive: p.color, emissiveIntensity: 0.9, roughness: 0.25 });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(ORB_R, 18, 12), mat);
    mesh.castShadow = true;
    mesh.name = `orb:${p.id}`;
    g.add(mesh);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo, color: p.color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.setScalar(0.62);
    g.add(glow);
    const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
    g.add(beam);
    orbs.push({ mesh, mat, glow, beam });
  });
  const coreMat = new THREE.MeshStandardMaterial({ color: 0xe6e8ff, emissive: 0xa5a8ff, emissiveIntensity: 0.9, roughness: 0.2 });
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 1), coreMat);
  g.add(core);
  const coreGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo, color: 0x9a9dff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
  coreGlow.scale.setScalar(0.7);
  g.add(coreGlow);
  // The one light: night only, so by day it never takes a slot from the budget.
  const orbLight = new THREE.PointLight(0xa5a8ff, 0, 4.5, 1.5);
  orbLight.position.set(RING_C.x, RING_C.y, RING_C.z);
  g.add(orbLight);

  let flare = 0;
  let nightNow = 0;
  const orbAt = new THREE.Vector3();
  const place = (t: number) => {
    const swell = 1 + flare * 0.35;
    orbs.forEach((o, i) => {
      const at = orbPosition(i, t, orbAt);
      o.mesh.position.copy(at);
      o.mesh.scale.setScalar(swell);
      o.glow.position.copy(at);
      o.glow.scale.setScalar((0.55 + 0.08 * Math.sin(t * 2.1 + i)) * swell * (1 + nightNow * 0.4));
      o.mat.emissiveIntensity = 0.8 + nightNow * 0.9 + flare * 1.5;
      o.beam.position.set(at.x, ROOF + 0.08, at.z);
      o.beam.scale.y = at.y - ORB_R - ROOF - 0.08;
    });
    core.position.set(RING_C.x, RING_C.y + Math.sin(t * 0.9) * 0.03, RING_C.z);
    core.rotation.set(t * 0.4, t * 0.6, 0);
    coreGlow.position.copy(core.position);
    coreMat.emissiveIntensity = 0.8 + nightNow + flare * 1.5;
  };
  place(0);

  let insideNow = false;
  return {
    group: g,
    seats,
    solids,
    doorLocal: new THREE.Vector3(0, 0, 1.4),
    interior: {
      rooms: [
        { minX: -W / 2 + T + 0.02, maxX: W / 2 - T - 0.02, minZ: -D + T + 0.02, maxZ: -T - 0.02 },
        { minX: DOOR0 + 0.04, maxX: DOOR1 - 0.04, minZ: -0.3, maxZ: 0.5 },
      ],
      door: { x: (DOOR0 + DOOR1) / 2, z: 0 },
      setDoor(open) { doorPivot.rotation.y = open * 1.45; },
      setInside(on) {
        if (on === insideNow) return;
        insideNow = on;
        for (const o of [...roofParts, sign, ...cornice]) o.visible = !on;
        for (const m of [slate, inner]) { m.transparent = on; m.opacity = on ? 0.28 : 1; m.depthWrite = !on; m.needsUpdate = true; }
        for (const w of walls) w.castShadow = !on;
      },
    },
    update(dt, t) {
      flare = Math.max(0, flare - dt * 0.8);
      tower.rotation.y = t * 0.3;
      place(t);
    },
    pulse() { flare = 1; },
    setNight(night) {
      nightNow = night;
      indigo.emissiveIntensity = 0.9 + night * 1.2;
      for (const m of inlayMats) m.emissiveIntensity = 0.25 + night * 0.6;
      glass.emissiveIntensity = 0.08 + night * 0.35;
      signMat.emissiveIntensity = 0.4 + night * 0.8;
      screenMat.emissiveIntensity = 0.5 + night * 0.6;
      orbLight.intensity = night * 1.6;
    },
  };
}
