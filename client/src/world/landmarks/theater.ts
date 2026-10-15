// The theater: a picture house with a lit marquee over the door. Inside,
// the big screen hangs on the front wall over a low stage, and rows of red
// seats rise toward the back. Whatever the hall's call is sharing plays on
// the screen (world.ts `setTheater`, voice/callRoom.ts); the house lights go
// down while it plays.
//
// Local frame: facade on z = 0 facing +z, the hall behind it. You come in at
// the front right, beside the screen, and walk up the aisle on the right.

import * as THREE from 'three';
import { canvasTexture } from './signs';
import { TheaterScreen } from '../theaterScreen';
import type { LandmarkBuild, LandmarkSeat } from './index';

export const THEATER = {
  W: 2.8,
  D: 2.6,
  H: 1.75,
  T: 0.07,
  /** The doors: a wide double door, easy to walk through at any angle the slot turns it. */
  DOOR0: 0.5,
  DOOR1: 1.32,
  DOOR_H: 1.0,
  /** The screen (on the front wall, facing into the hall). */
  SCREEN_W: 1.6,
  SCREEN_H: 0.9,
  SCREEN_X: -0.52,
  SCREEN_Y: 1.02,
  /** The floor rises from RAKE_Z0 (at the screen end) to RAKE_Z1 (the back) by RAKE_RISE. */
  RAKE_Z0: -0.85,
  RAKE_Z1: -2.35,
  RAKE_RISE: 0.24,
  /** Seat rows (z) and columns (x). */
  ROWS: [-1.05, -1.45, -1.85, -2.25],
  COLS: [-1.15, -0.85, -0.55, -0.25, 0.05, 0.35],
  SEAT_TOP: 0.19,
} as const;

/** The floor inside: flat by the screen, rising evenly toward the back (no ledges). */
export function theaterFloor(z: number): number {
  const k = Math.min(1, Math.max(0, (THEATER.RAKE_Z0 - z) / (THEATER.RAKE_Z0 - THEATER.RAKE_Z1)));
  return 0.006 + THEATER.RAKE_RISE * k;
}

const flat = (color: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...o });

/** What World drives on the theater beyond any landmark's hooks. */
export interface TheaterHall {
  screen: TheaterScreen;
  /** The screen's black backing (unscaled, unlike the letterboxed screen): what the film's overlay is placed on. */
  screenBack: THREE.Object3D;
  /** The marquee's words (the channel, or the film's title). */
  setMarquee(text: string): void;
  /** A film is playing: house lights down. */
  setPlaying(on: boolean): void;
}

export function buildTheater(): LandmarkBuild & { hall: TheaterHall } {
  const { W, D, H, T, DOOR0, DOOR1, DOOR_H } = THEATER;
  const g = new THREE.Group();
  const outer = flat(0x6d2a35);
  const inner = flat(0x2a1f2b);
  const gold = flat(0xd9b45a, { metalness: 0.5, roughness: 0.4 });
  const box = (w: number, h: number, d: number, m: THREE.Material | THREE.Material[], x: number, y: number, z: number) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z);
    b.castShadow = b.receiveShadow = true;
    g.add(b);
    return b;
  };

  // Walls: burgundy outside, dark plum inside; the door at the front right.
  const walls: THREE.Mesh[] = [
    box(W, H, T, [outer, outer, outer, outer, inner, outer], 0, H / 2, -D + T / 2),
    box(T, H, D, [inner, outer, outer, outer, outer, outer], -W / 2 + T / 2, H / 2, -D / 2),
    box(T, H, D, [outer, inner, outer, outer, outer, outer], W / 2 - T / 2, H / 2, -D / 2),
    box(DOOR0 + W / 2, H, T, [outer, outer, outer, outer, outer, inner], (-W / 2 + DOOR0) / 2, H / 2, -T / 2),
    box(W / 2 - DOOR1, H, T, [outer, outer, outer, outer, outer, inner], (DOOR1 + W / 2) / 2, H / 2, -T / 2),
    box(DOOR1 - DOOR0, H - DOOR_H, T, [outer, outer, outer, outer, outer, inner], (DOOR0 + DOOR1) / 2, (H + DOOR_H) / 2, -T / 2),
  ];
  const roofParts: THREE.Object3D[] = [];
  const roof = box(W + 0.14, 0.12, D + 0.14, flat(0x3b2230), 0, H + 0.06, -D / 2);
  roof.name = 'roof';
  roofParts.push(roof, box(W + 0.18, 0.06, 0.08, gold, 0, H + 0.13, 0.04));
  box(W + 0.04, 0.12, 0.06, flat(0x3b2230), 0, 0.06, 0.02); // plinth

  // The raked floor: a sloped carpet and its flat front, built from the same curve the feet walk on.
  const carpet = flat(0x7a1f2b, { roughness: 1 });
  {
    const x0 = -W / 2 + T, x1 = W / 2 - T, z0 = -T, z1 = -D + T;
    const steps = 8;
    const pos: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const z = z0 + ((z1 - z0) * i) / steps;
      const y = theaterFloor(z);
      pos.push(x0, y, z, x1, y, z);
    }
    const idx: number[] = [];
    for (let i = 0; i < steps; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const floor = new THREE.Mesh(geo, carpet);
    floor.receiveShadow = true;
    g.add(floor);
  }

  // The stage and the screen on the front wall, facing into the hall.
  box(THEATER.SCREEN_W + 0.3, 0.1, 0.4, flat(0x3a2a22), THEATER.SCREEN_X, 0.05, -T - 0.2);
  const backing = new THREE.Mesh(new THREE.PlaneGeometry(THEATER.SCREEN_W + 0.08, THEATER.SCREEN_H + 0.08), new THREE.MeshBasicMaterial({ color: 0x050507 }));
  backing.name = 'theater-screen-back';
  backing.rotation.y = Math.PI;
  backing.position.set(THEATER.SCREEN_X, THEATER.SCREEN_Y, -T - 0.006);
  g.add(backing);
  const screen = new TheaterScreen(THEATER.SCREEN_W, THEATER.SCREEN_H);
  screen.mesh.rotation.y = Math.PI;
  screen.mesh.position.set(THEATER.SCREEN_X, THEATER.SCREEN_Y, -T - 0.01);
  g.add(screen.mesh);
  // Velvet curtains either side of it.
  const velvet = flat(0x9b1c2c, { roughness: 1 });
  for (const s of [-1, 1]) box(0.14, H - 0.12, 0.05, velvet, THEATER.SCREEN_X + s * (THEATER.SCREEN_W / 2 + 0.1), (H - 0.12) / 2, -T - 0.04);

  // Rows of seats: a cushion, a back and arms, facing the screen (+z).
  const seats: LandmarkSeat[] = [];
  const seatMat = flat(0xb3202f, { roughness: 0.9 });
  const armMat = flat(0x2b2024);
  for (const z of THEATER.ROWS) {
    const fy = theaterFloor(z);
    for (const x of THEATER.COLS) {
      box(0.22, 0.05, 0.2, seatMat, x, fy + THEATER.SEAT_TOP - 0.025, z);
      box(0.22, 0.26, 0.04, seatMat, x, fy + THEATER.SEAT_TOP + 0.1, z - 0.11);
      seats.push({ pos: { x, z }, face: 0, y: fy + THEATER.SEAT_TOP, prop: 'popcorn', indoor: true });
    }
    // One riser under the whole row, and the arms between seats.
    box(THEATER.COLS[THEATER.COLS.length - 1] - THEATER.COLS[0] + 0.26, THEATER.SEAT_TOP - 0.05, 0.16, armMat, (THEATER.COLS[0] + THEATER.COLS[THEATER.COLS.length - 1]) / 2, fy + (THEATER.SEAT_TOP - 0.05) / 2, z - 0.02);
    for (let i = 0; i <= THEATER.COLS.length; i++) {
      const ax = i === 0 ? THEATER.COLS[0] - 0.13 : i === THEATER.COLS.length ? THEATER.COLS[i - 1] + 0.13 : (THEATER.COLS[i - 1] + THEATER.COLS[i]) / 2;
      box(0.025, 0.1, 0.18, armMat, ax, fy + THEATER.SEAT_TOP + 0.04, z - 0.02);
    }
  }

  // Aisle lights along the right, a dim house light, and wall sconces.
  const glowMat = new THREE.MeshStandardMaterial({ color: 0x332200, emissive: 0xffb347, emissiveIntensity: 0.8 });
  for (const z of THEATER.ROWS) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, 0.04), glowMat);
    l.position.set(0.6, theaterFloor(z) + 0.02, z);
    g.add(l);
  }
  const sconceMat = new THREE.MeshStandardMaterial({ color: 0x3a2a10, emissive: 0xffd08a, emissiveIntensity: 0.6 });
  for (const z of [-0.9, -1.7]) for (const s of [-1, 1]) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.08), sconceMat);
    c.position.set(s * (W / 2 - T - 0.02), 1.15, z);
    g.add(c);
  }
  const houseLight = new THREE.PointLight(0xffd6a0, 0.6, 3.6, 1.4);
  houseLight.position.set(0, H - 0.25, -1.5);
  g.add(houseLight);

  // The marquee over the door: a lit board with the channel's name, bulbs round it.
  let marqueeText = '';
  const marqueeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.3 });
  const drawMarquee = (text: string) => {
    const t = canvasTexture(512, 128, (c) => {
      c.fillStyle = '#16111a';
      c.fillRect(0, 0, 512, 128);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = '#f5d76e';
      c.font = '800 30px Inter, system-ui, sans-serif';
      c.fillText('CINE', 256, 30);
      c.fillStyle = '#ffffff';
      c.font = '700 52px Inter, system-ui, sans-serif';
      c.fillText(text.slice(0, 18), 256, 82);
    });
    marqueeMat.map?.dispose();
    marqueeMat.map = t;
    marqueeMat.emissiveMap = t;
    marqueeMat.needsUpdate = true;
  };
  drawMarquee('NOW SHOWING');
  const marquee = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.38, 0.06), [gold, gold, gold, gold, marqueeMat, gold]);
  marquee.position.set(0.2, H - 0.22, 0.06);
  g.add(marquee);
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0x553300, emissive: 0xffe08a, emissiveIntensity: 0.8 });
  const bulbGeo = new THREE.SphereGeometry(0.018, 6, 4);
  for (let i = 0; i < 12; i++) {
    for (const y of [H - 0.43, H - 0.01]) {
      const b = new THREE.Mesh(bulbGeo, bulbMat);
      b.position.set(0.2 - 0.72 + (1.44 * i) / 11, y, 0.1);
      g.add(b);
    }
  }
  // Film posters either side of the door.
  for (const [x, hue] of [[-0.9, '#2f5d9b'], [-0.25, '#3f8f4a']] as const) {
    const tex = canvasTexture(128, 192, (c) => {
      c.fillStyle = hue;
      c.fillRect(0, 0, 128, 192);
      c.fillStyle = '#f5d76e';
      c.beginPath();
      c.arc(64, 78, 34, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#ffffff';
      c.font = '700 20px Inter, system-ui, sans-serif';
      c.textAlign = 'center';
      c.fillText('ESTRENO', 64, 160);
    });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.5), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
    p.position.set(x, 0.62, 0.006);
    g.add(p);
    box(0.38, 0.54, 0.02, gold, x, 0.62, -0.002);
  }

  // The door: two glass leaves sliding apart.
  const glass = new THREE.MeshStandardMaterial({ color: 0x1a1418, emissive: 0xffb347, emissiveIntensity: 0.1, roughness: 0.1, transparent: true, opacity: 0.55 });
  const halfW = (DOOR1 - DOOR0) / 2;
  const leaves = [-1, 1].map((s) => {
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(halfW, DOOR_H, 0.03), glass);
    leaf.position.set((DOOR0 + DOOR1) / 2 + (s * halfW) / 2, DOOR_H / 2, -T / 2);
    g.add(leaf);
    return { leaf, s, x0: leaf.position.x };
  });

  const solids: NonNullable<LandmarkBuild['solids']> = [
    // The stage under the screen.
    { x: THEATER.SCREEN_X, z: -T - 0.2, hx: (THEATER.SCREEN_W + 0.3) / 2, hz: 0.2, top: 0.1 },
  ];

  let insideNow = false;
  let playing = false;
  let lightK = 1;
  let nightNow = 0;
  const applyLights = () => {
    houseLight.intensity = (0.35 + nightNow * 0.6) * lightK;
    sconceMat.emissiveIntensity = 0.15 + 0.6 * lightK;
  };

  const hall: TheaterHall = {
    screen,
    screenBack: backing,
    setMarquee(text) {
      const t = text.trim() || 'NOW SHOWING';
      if (t === marqueeText) return;
      marqueeText = t;
      drawMarquee(t);
    },
    setPlaying(on) { playing = on; },
  };

  return {
    group: g,
    hall,
    seats,
    solids,
    doorLocal: new THREE.Vector3((DOOR0 + DOOR1) / 2, 0, 0.6),
    groundAt(l) {
      const inRoom = l.x > -W / 2 + T && l.x < W / 2 - T && l.z > -D + T && l.z < -T;
      return inRoom ? theaterFloor(l.z) : 0;
    },
    interior: {
      rooms: [
        { minX: -W / 2 + T + 0.02, maxX: W / 2 - T - 0.02, minZ: -D + T + 0.02, maxZ: -T - 0.02 },
        { minX: DOOR0 + 0.04, maxX: DOOR1 - 0.04, minZ: -0.4, maxZ: 0.6 },
      ],
      door: { x: (DOOR0 + DOOR1) / 2, z: 0 },
      setDoor(open) { for (const l of leaves) l.leaf.position.x = l.x0 + l.s * open * halfW * 0.9; },
      setInside(on) {
        if (on === insideNow) return;
        insideNow = on;
        for (const o of [...roofParts, marquee]) o.visible = !on;
        for (const m of [outer, inner]) { m.transparent = on; m.opacity = on ? 0.25 : 1; m.depthWrite = !on; m.needsUpdate = true; }
        for (const w of walls) w.castShadow = !on;
      },
    },
    update(dt, t) {
      // The house lights fade down while a film plays, and back up after.
      const want = playing ? 0.15 : 1;
      lightK += (want - lightK) * Math.min(1, dt * 1.5);
      applyLights();
      // The marquee's bulbs chase.
      bulbMat.emissiveIntensity = 0.6 + 0.4 * Math.sin(t * 6);
    },
    setNight(night) {
      nightNow = night;
      marqueeMat.emissiveIntensity = 0.3 + night * 0.9;
      glass.emissiveIntensity = 0.1 + night * 0.4;
      glowMat.emissiveIntensity = 0.5 + night * 0.8;
      applyLights();
    },
  };
}
