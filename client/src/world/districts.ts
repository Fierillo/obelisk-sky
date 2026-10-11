// Scenery for themed districts: a running track and calisthenics park for
// sports channels, arcade cabinets and neon for gaming, plus the mate gourd
// people drink from on the benches.

import * as THREE from 'three';
import type { ExerciseKind } from './anim/exercises';
import { TRACK, type Vec2 } from './layout';

const mat = (color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, ...extra });

/** A stadium-shaped track (two straights, two bends), lanes painted white. */
export function buildTrack(site: { c: Vec2; rot: number }): THREE.Group {
  const g = new THREE.Group();
  // Raised a touch: the grass undulates by a few cm and must not poke through.
  g.position.set(site.c.x, 0.07, site.c.z);
  g.rotation.y = -site.rot;
  const { halfLength: L, radius: R } = TRACK;
  const width = TRACK_WIDTH;
  const stadium = (r: number) => {
    const s = new THREE.Shape();
    s.moveTo(-L, -r);
    s.lineTo(L, -r);
    s.absarc(L, 0, r, -Math.PI / 2, Math.PI / 2, false);
    s.lineTo(-L, r);
    s.absarc(-L, 0, r, Math.PI / 2, Math.PI * 1.5, false);
    return s;
  };
  const outer = stadium(R);
  outer.holes.push(new THREE.Path(stadium(R - width).getPoints(48).reverse()));
  const ring = new THREE.Mesh(new THREE.ShapeGeometry(outer, 24), mat(0xc65a3e, { roughness: 1 }));
  ring.rotation.x = -Math.PI / 2;
  ring.receiveShadow = true;
  g.add(ring);
  const infield = new THREE.Mesh(new THREE.ShapeGeometry(stadium(R - width), 24), mat(0x6fb24a));
  infield.rotation.x = -Math.PI / 2;
  infield.position.y = 0.004;
  infield.receiveShadow = true;
  g.add(infield);
  // Lane lines.
  const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  for (let i = 0; i <= 3; i++) {
    const r = R - (width * i) / 3;
    const pts = stadium(r).getPoints(64).map((p) => new THREE.Vector3(p.x, 0.012, -p.y));
    const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), lineMat);
    g.add(line);
  }
  // Start/finish line.
  const start = new THREE.Mesh(new THREE.PlaneGeometry(0.06, width), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  start.rotation.x = -Math.PI / 2;
  start.position.set(0, 0.014, R - width / 2);
  g.add(start);
  return g;
}

/** The track's lanes, inside (0) to outside: each is a third of its width. */
export const TRACK_LANES = 3;
const TRACK_WIDTH = 0.9;

/** Points around the track, along the middle of `lane` (or the track's
 *  centre line), for people running laps. */
export function trackLap(site: { c: Vec2; rot: number }, n = 24, lane?: number): Vec2[] {
  const { halfLength: L, radius: R } = TRACK;
  const r = lane === undefined ? R - TRACK_WIDTH / 2 : R - TRACK_WIDTH + (TRACK_WIDTH * (lane + 0.5)) / TRACK_LANES;
  const pts: Vec2[] = [];
  const perim = 4 * L + 2 * Math.PI * r;
  for (let i = 0; i < n; i++) {
    let d = (i / n) * perim;
    let lx: number, lz: number;
    if (d < 2 * L) { lx = -L + d; lz = -r; }
    else if ((d -= 2 * L) < Math.PI * r) { const a = -Math.PI / 2 + d / r; lx = L + Math.cos(a) * r; lz = Math.sin(a) * r; }
    else if ((d -= Math.PI * r) < 2 * L) { lx = L - d; lz = r; }
    else { d -= 2 * L; const a = Math.PI / 2 + d / r; lx = -L + Math.cos(a) * r; lz = Math.sin(a) * r; }
    const c = Math.cos(site.rot), s = Math.sin(site.rot);
    pts.push({ x: site.c.x + lx * c - lz * s, z: site.c.z + lx * s + lz * c });
  }
  return pts;
}

/** Pull-up bar, parallel bars and monkey bars on a rubber mat. */
/**
 * Where people train in the park, in its local frame: the spot they stand
 * on (under or between the bars), which way they face (as atan2(dx, dz)),
 * the grip height and the exercises it offers. Matches the geometry below.
 */
export const CALISTHENICS_STATIONS: { at: Vec2; face: number; grip: number; half?: number; kinds: ExerciseKind[] }[] = [
  { at: { x: -0.7, z: -0.4 }, face: 0, grip: 1.12, kinds: ['pullup', 'muscleup'] },
  { at: { x: -0.55, z: 0.375 }, face: Math.PI / 2, grip: 0.5, half: 0.11, kinds: ['dip'] },
  { at: { x: 0.65, z: -0.5 }, face: Math.PI / 2, grip: 0.03, kinds: ['pushup'] },
];

export function buildCalisthenics(at: Vec2, rot: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(at.x, 0, at.z);
  g.rotation.y = rot;
  const steel = mat(0x8d969e, { metalness: 0.6, roughness: 0.35 });
  const paint = mat(0x2f9b8f, { metalness: 0.3, roughness: 0.5 });
  // Rubber safety flooring, in the park's teal.
  const padMat = mat(0x2f8f86, { roughness: 1 });
  const post = (x: number, z: number, h: number, m = paint) => {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, h, 6), m);
    p.position.set(x, h / 2, z);
    p.castShadow = true;
    g.add(p);
  };
  const bar = (x1: number, x2: number, y: number, z: number) => {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, Math.abs(x2 - x1), 6), steel);
    b.rotation.z = Math.PI / 2;
    b.position.set((x1 + x2) / 2, y, z);
    b.castShadow = true;
    g.add(b);
  };
  const pad = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.03, 1.4), padMat);
  pad.position.y = 0.015;
  pad.receiveShadow = true;
  g.add(pad);
  // Pull-up bar.
  post(-1.0, -0.4, 1.15); post(-0.4, -0.4, 1.15); bar(-1.0, -0.4, 1.12, -0.4);
  // Parallel bars.
  // Parallel bars, 22 cm apart (about shoulder-and-a-bit for a village person).
  for (const z of [0.265, 0.485]) { post(-0.9, z, 0.5); post(-0.2, z, 0.5); bar(-0.9, -0.2, 0.5, z); }
  // Monkey bars: two posts each side, a top rail along each side, rungs across.
  for (const z of [-0.2, 0.25]) { post(0.3, z, 1.0); post(1.1, z, 1.0); bar(0.3, 1.1, 0.98, z); }
  for (let i = 0; i <= 4; i++) {
    const x = 0.3 + i * 0.2;
    const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.45, 6), steel);
    rung.rotation.x = Math.PI / 2;
    rung.position.set(x, 0.98, 0.025);
    g.add(rung);
  }
  return g;
}

const NEON = [0xff3df2, 0x36f1ff, 0xb4f953, 0xffd23d];

/** An arcade cabinet with a glowing screen. */
export function buildArcadeCabinet(seed: number): THREE.Group {
  const g = new THREE.Group();
  const neon = NEON[seed % NEON.length];
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.62, 0.3), mat(0x1c1630));
  body.position.y = 0.31;
  body.castShadow = true;
  g.add(body);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.18), new THREE.MeshStandardMaterial({ color: neon, emissive: neon, emissiveIntensity: 1.4 }));
  screen.position.set(0, 0.46, 0.152);
  g.add(screen);
  const marquee = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.05), new THREE.MeshStandardMaterial({ color: neon, emissive: neon, emissiveIntensity: 2 }));
  marquee.position.set(0, 0.6, 0.13);
  g.add(marquee);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.04, 0.14), mat(0x2a2142));
  panel.position.set(0, 0.34, 0.2);
  panel.rotation.x = 0.3;
  g.add(panel);
  return g;
}

/** Neon strips along a building's eaves (gaming district). */
export function neonTrim(width: number, height: number, seed: number): THREE.Group {
  const g = new THREE.Group();
  const color = NEON[seed % NEON.length];
  const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.2 });
  const half = width / 2 + 0.03;
  for (const [x, z, len, rot] of [[0, half, width, 0], [0, -half, width, 0], [half, 0, width, Math.PI / 2], [-half, 0, width, Math.PI / 2]] as const) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(len + 0.06, 0.04, 0.04), m);
    s.position.set(x, height, z);
    s.rotation.y = rot;
    g.add(s);
  }
  return g;
}

/** A mate: gourd with a silver bombilla. Held at chest height. */
export function buildMate(): THREE.Group {
  const g = new THREE.Group();
  const gourd = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), mat(0x6b4226, { roughness: 0.6 }));
  gourd.scale.set(1, 1.15, 1);
  g.add(gourd);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.008, 6, 12), mat(0xc9ccd1, { metalness: 0.8, roughness: 0.3 }));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.055;
  g.add(rim);
  const yerba = new THREE.Mesh(new THREE.CircleGeometry(0.034, 10), mat(0x6f8f2e));
  yerba.rotation.x = -Math.PI / 2;
  yerba.position.y = 0.05;
  g.add(yerba);
  const bombilla = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.13, 5), mat(0xd7dadf, { metalness: 0.9, roughness: 0.2 }));
  bombilla.position.set(0.015, 0.1, 0);
  bombilla.rotation.z = -0.35;
  g.add(bombilla);
  g.scale.setScalar(1.6);
  // Where the lips go: the bombilla's tip (unscaled local space).
  g.userData.mouth = new THREE.Vector3(0.015 + Math.sin(0.35) * 0.065, 0.1 + Math.cos(0.35) * 0.065, 0);
  return g;
}

/** A cup of coffee on its saucer, same scale as the mate (held in hand). */
export function buildCup(): THREE.Group {
  const g = new THREE.Group();
  const white = mat(0xf4f1ea, { roughness: 0.4 });
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.038, 0.075, 12, 1, true), white);
  cup.position.y = 0.04;
  g.add(cup);
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.038, 12), white);
  bottom.rotation.x = -Math.PI / 2;
  bottom.position.y = 0.003;
  g.add(bottom);
  const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.046, 12), mat(0x4a2c1a, { roughness: 0.3 }));
  coffee.rotation.x = -Math.PI / 2;
  coffee.position.y = 0.068;
  g.add(coffee);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.006, 5, 10), white);
  handle.position.set(0.055, 0.045, 0);
  g.add(handle);
  g.scale.setScalar(1.6);
  g.userData.mouth = new THREE.Vector3(0, 0.075, 0.045); // the rim, on the drinker's side
  return g;
}

/** A choripán from the parrilla: a chorizo split in a crusty roll, same scale as the mate. */
export function buildChoripan(): THREE.Group {
  const g = new THREE.Group();
  const bread = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.09, 4, 8), mat(0xd9a45b, { roughness: 0.9 }));
  bread.rotation.z = Math.PI / 2;
  bread.scale.set(1, 1, 0.8);
  bread.position.y = 0.03;
  g.add(bread);
  const chorizo = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.12, 4, 8), mat(0x8a2d1c, { roughness: 0.5 }));
  chorizo.rotation.z = Math.PI / 2;
  chorizo.position.set(0.012, 0.055, 0);
  g.add(chorizo);
  const chimi = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.004, 0.022), mat(0x4f7a2a));
  chimi.position.set(0, 0.075, 0);
  g.add(chimi);
  g.scale.setScalar(1.6);
  g.userData.mouth = new THREE.Vector3(0.07, 0.04, 0); // one end of the roll
  return g;
}

let laptopScreen: THREE.CanvasTexture | null = null;

/** A mock laptop, open, with something nostr on the screen. Decorative only. */
export function buildLaptop(): THREE.Group {
  if (!laptopScreen) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 160;
    const x = c.getContext('2d')!;
    x.fillStyle = '#0a0a0a';
    x.fillRect(0, 0, 256, 160);
    x.fillStyle = '#171717';
    x.fillRect(0, 0, 70, 160);
    x.fillStyle = '#b4f953';
    x.fillRect(14, 14, 10, 30);
    for (let i = 0; i < 6; i++) { x.fillStyle = i === 1 ? '#b4f953' : '#3a3a3a'; x.fillRect(10, 58 + i * 14, 46, 6); }
    for (let i = 0; i < 7; i++) {
      x.fillStyle = ['#fafafa', '#a3a3a3', '#818cf8'][i % 3];
      x.fillRect(84, 18 + i * 19, 60 + ((i * 53) % 100), 7);
    }
    x.fillStyle = '#262626';
    x.fillRect(80, 140, 166, 12);
    laptopScreen = new THREE.CanvasTexture(c);
    laptopScreen.colorSpace = THREE.SRGBColorSpace;
  }
  const g = new THREE.Group();
  const alu = mat(0xb8bcc4, { metalness: 0.6, roughness: 0.35 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.006, 0.09), alu);
  base.position.y = 0.003;
  g.add(base);
  const keys = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.045), mat(0x2b2b2f));
  keys.rotation.x = -Math.PI / 2;
  keys.position.set(0, 0.0065, -0.008);
  g.add(keys);
  // The lid, hinged at the back edge and leaning back a little.
  const lid = new THREE.Group();
  lid.position.set(0, 0.006, 0.045);
  lid.rotation.x = 0.25;
  const shell = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.085, 0.004), alu);
  shell.position.y = 0.0425;
  lid.add(shell);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.075), new THREE.MeshStandardMaterial({ map: laptopScreen, emissive: 0xffffff, emissiveMap: laptopScreen, emissiveIntensity: 0.6 }));
  screen.position.set(0, 0.0425, -0.0025);
  screen.rotation.y = Math.PI;
  lid.add(screen);
  g.add(lid);
  g.traverse((o) => { o.castShadow = true; });
  return g;
}
