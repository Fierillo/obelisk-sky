// La Crypta's living room, from photos of it at night: dark wood panelling,
// a white carved stone fireplace with a log fire, the big orange neon ₿ over
// the mantel with candles and "PAPER ST" street signs, the ceiling washed
// orange; cream sofas around a low table. On the right wall, over the dark
// leaded windows, the neon "Sex is cool but have you ever fucked the
// system ?" with a circled ₿.
//
// Built in the house's local frame (facade at z = 0, the room behind it);
// everything stands on the floor at `floor`.

import * as THREE from 'three';
import type { LandmarkSeat, LocalRect } from './landmarks';

export interface RoomSpec extends LocalRect {
  floor: number;
  ceil: number;
  /** The front door (centre x, width): the front panelling leaves it open. */
  door: { x: number; w: number };
}

export interface LivingRoom {
  group: THREE.Group;
  seats: LandmarkSeat[];
  solids: { x: number; z: number; hx: number; hz: number; top: number }[];
  /** Hidden for the follow camera's cutaway (ceiling, front panelling). */
  cutaway: THREE.Object3D[];
  update(dt: number, t: number): void;
  setNight(night: number): void;
}

const flat = (color: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...o });

const NEON = '#ff8a2a';
const NEON_GLOW = '#ff5a00';

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = false): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Dark raised wood panels, two by two. */
const panelTexture = () => canvasTexture(256, 256, (g) => {
  g.fillStyle = '#24160f';
  g.fillRect(0, 0, 256, 256);
  for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) {
    const x = 14 + c * 128, y = 14 + r * 128, w = 100, h = 100;
    g.fillStyle = '#3a2418';
    g.fillRect(x, y, w, h);
    g.fillStyle = '#4a2f1f';
    g.fillRect(x, y, w, 5);
    g.fillRect(x, y, 5, h);
    g.fillStyle = '#160d08';
    g.fillRect(x, y + h - 5, w, 5);
    g.fillRect(x + w - 5, y, 5, h);
  }
}, true);

/** Dark parquet planks. */
const parquetTexture = () => canvasTexture(256, 256, (g) => {
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let row = 0; row < 8; row++) {
    const off = (row % 2) * 48;
    for (let col = -1; col < 4; col++) {
      g.fillStyle = `hsl(22 ${40 + rnd() * 10}% ${16 + rnd() * 7}%)`;
      g.fillRect(col * 96 + off + 1, row * 32 + 1, 94, 30);
    }
  }
}, true);

/** Signs and neon hung on the panelling: this far off the wall plane, and
 *  drawn in front of it, or they flicker through it as the camera moves
 *  (depth precision at the follow camera's distance, and the AO pass). */
export const DECAL_GAP = 0.025;
export function decal<M extends THREE.Material>(m: M): M {
  m.polygonOffset = true;
  m.polygonOffsetFactor = -2;
  m.polygonOffsetUnits = -4;
  return m;
}

/** The white stone frieze over the firebox: a row of carved roundels. */
const friezeTexture = () => canvasTexture(512, 96, (g) => {
  g.fillStyle = '#d9d4ca';
  g.fillRect(0, 0, 512, 96);
  for (let i = 0; i < 7; i++) {
    const cx = 40 + i * 72;
    g.strokeStyle = '#8f897f';
    g.lineWidth = 5;
    g.beginPath();
    g.arc(cx, 48, 28, 0, Math.PI * 2);
    g.stroke();
    for (let k = 0; k < 4; k++) {
      g.beginPath();
      g.arc(cx + Math.cos(k * Math.PI / 2) * 12, 48 + Math.sin(k * Math.PI / 2) * 12, 9, 0, Math.PI * 2);
      g.stroke();
    }
  }
});

/** A white street sign with a black rim: "PAPER ST". */
const streetSign = () => canvasTexture(256, 64, (g) => {
  g.fillStyle = '#f2f2ee';
  g.fillRect(0, 0, 256, 64);
  g.strokeStyle = '#1b1b1b';
  g.lineWidth = 5;
  g.strokeRect(5, 5, 246, 54);
  g.fillStyle = '#1b1b1b';
  g.font = '700 40px "DIN Condensed", "Arial Narrow", Inter, sans-serif';
  g.textBaseline = 'middle';
  g.fillText('PAPER', 18, 35);
  g.font = '700 20px Inter, sans-serif';
  g.fillText('ST', 200, 22);
});

/** A bitcoin "B" with its two bars, as a neon outline or filled. Centred on
 *  (cx, cy), `h` tall. */
function drawBitcoin(g: CanvasRenderingContext2D, cx: number, cy: number, h: number, outline: boolean): void {
  g.save();
  g.translate(cx, cy);
  g.font = `800 ${h}px Inter, "Helvetica Neue", Arial, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const bw = h * 0.07, bh = h * 0.13, bx = [-h * 0.12, h * 0.06];
  if (outline) {
    g.strokeText('B', 0, h * 0.04);
    for (const x of bx) { g.strokeRect(x - bw / 2, -h * 0.5, bw, bh); g.strokeRect(x - bw / 2, h * 0.37, bw, bh); }
  } else {
    g.fillText('B', 0, h * 0.04);
    for (const x of bx) { g.fillRect(x - bw / 2, -h * 0.5, bw, bh); g.fillRect(x - bw / 2, h * 0.37, bw, bh); }
  }
  g.restore();
}

/** The neon ₿ over the mantel: an orange tube outline with a glow. */
const neonBitcoin = () => canvasTexture(384, 512, (g) => {
  g.strokeStyle = NEON;
  g.lineJoin = 'round';
  g.shadowColor = NEON_GLOW;
  for (const [blur, width] of [[40, 14], [18, 8], [0, 5]] as const) {
    g.shadowBlur = blur;
    g.lineWidth = width;
    drawBitcoin(g, 192, 256, 400, true);
  }
  g.shadowBlur = 0;
  g.strokeStyle = '#ffd9a8';
  g.lineWidth = 2;
  drawBitcoin(g, 192, 256, 400, true);
});

/** The neon words over dark leaded windows. */
const neonWords = () => canvasTexture(1024, 512, (g) => {
  g.fillStyle = '#120b08';
  g.fillRect(0, 0, 1024, 512);
  // Leaded diamonds and the window frames behind the sign.
  g.strokeStyle = '#3a2a20';
  g.lineWidth = 3;
  for (let k = -512; k <= 1536; k += 56) {
    g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 512, 512); g.stroke();
    g.beginPath(); g.moveTo(k, 512); g.lineTo(k + 512, 0); g.stroke();
  }
  g.fillStyle = '#24160f';
  for (const x of [0, 250, 500, 750, 1000]) g.fillRect(x, 0, 24, 512);
  g.fillRect(0, 0, 1024, 18);
  g.fillRect(0, 494, 1024, 18);
  // The words, in warm orange with a glow.
  g.fillStyle = '#ffb35a';
  g.shadowColor = NEON_GLOW;
  g.font = '600 74px "Arial Rounded MT Bold", "Nunito", Inter, sans-serif';
  g.textBaseline = 'middle';
  for (const blur of [32, 12]) {
    g.shadowBlur = blur;
    g.fillText('Sex is cool but have', 60, 120);
    g.fillText('you ever fucked  the', 60, 220);
    g.fillText('system ?', 200, 320);
  }
  // The circled ₿.
  g.strokeStyle = '#ffb35a';
  g.lineWidth = 9;
  g.shadowBlur = 24;
  g.beginPath();
  g.arc(640, 330, 70, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 5;
  drawBitcoin(g, 640, 330, 92, true);
});

/** A flame: a soft teardrop, white-yellow at the root to red at the tip. */
const flameTexture = () => canvasTexture(64, 128, (g) => {
  const grad = g.createLinearGradient(0, 128, 0, 0);
  grad.addColorStop(0, 'rgba(255,240,180,1)');
  grad.addColorStop(0.35, 'rgba(255,160,40,0.95)');
  grad.addColorStop(0.75, 'rgba(230,60,10,0.6)');
  grad.addColorStop(1, 'rgba(200,30,0,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(32, 0);
  g.bezierCurveTo(52, 50, 64, 80, 58, 106);
  g.quadraticCurveTo(32, 134, 6, 106);
  g.bezierCurveTo(0, 80, 12, 50, 32, 0);
  g.fill();
});

export function buildLivingRoom(s: RoomSpec): LivingRoom {
  const g = new THREE.Group();
  const seats: LandmarkSeat[] = [];
  const solids: LivingRoom['solids'] = [];
  const cutaway: THREE.Object3D[] = [];
  const F = s.floor, H = s.ceil - s.floor;
  const W = s.maxX - s.minX, D = s.maxZ - s.minZ;
  const cx = (s.minX + s.maxX) / 2, cz = (s.minZ + s.maxZ) / 2;
  const add = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T => {
    o.position.set(x, y, z);
    g.add(o);
    return o;
  };
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
    const b = add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m), x, y, z);
    b.castShadow = b.receiveShadow = true;
    return b;
  };

  // Panelled walls (just inside the brick), parquet, the orange ceiling.
  const panelMat = (w: number) => {
    const t = panelTexture();
    t.repeat.set(w / 0.55, H / 0.55);
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 });
  };
  const e = 0.004;
  const back = add(new THREE.Mesh(new THREE.PlaneGeometry(W, H), panelMat(W)), cx, F + H / 2, s.minZ + e);
  const left = add(new THREE.Mesh(new THREE.PlaneGeometry(D, H), panelMat(D)), s.minX + e, F + H / 2, cz);
  left.rotation.y = Math.PI / 2;
  const right = add(new THREE.Mesh(new THREE.PlaneGeometry(D, H), panelMat(D)), s.maxX - e, F + H / 2, cz);
  right.rotation.y = -Math.PI / 2;
  for (const p of [back, left, right]) p.receiveShadow = true;
  // The front panelling, either side of the door (hidden in the cutaway).
  const d0 = s.door.x - s.door.w / 2, d1 = s.door.x + s.door.w / 2;
  for (const [a, b] of [[s.minX, d0], [d1, s.maxX]]) {
    const p = add(new THREE.Mesh(new THREE.PlaneGeometry(b - a, H), panelMat(b - a)), (a + b) / 2, F + H / 2, s.maxZ - e);
    p.rotation.y = Math.PI;
    cutaway.push(p);
  }
  const parquet = parquetTexture();
  parquet.repeat.set(W / 0.6, D / 0.6);
  const floor = add(new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: parquet, roughness: 0.6 })), cx, F + 0.002, cz);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  const ceilMat = new THREE.MeshStandardMaterial({ color: 0xd86a30, emissive: 0xff6a20, emissiveIntensity: 0.25, roughness: 0.9 });
  const ceiling = add(new THREE.Mesh(new THREE.PlaneGeometry(W, D), ceilMat), cx, s.ceil - 0.005, cz);
  ceiling.rotation.x = Math.PI / 2;
  cutaway.push(ceiling);
  // A dark cornice where the walls meet the ceiling.
  const cornice = flat(0x1a100a);
  cutaway.push(box(W, 0.06, 0.05, cornice, cx, s.ceil - 0.03, s.minZ + 0.025));

  // The fireplace, on the back wall, a little left of centre.
  const fx = cx - 0.25, fz = s.minZ;
  const stone = flat(0xe4e0d8, { roughness: 0.8 });
  const sooty = flat(0x0d0a09, { roughness: 1 });
  const SW = 0.82, SH = 0.6;
  box(0.13, SH, 0.12, stone, fx - SW / 2 + 0.065, F + SH / 2, fz + 0.06);
  box(0.13, SH, 0.12, stone, fx + SW / 2 - 0.065, F + SH / 2, fz + 0.06);
  const friezeMat = new THREE.MeshStandardMaterial({ map: friezeTexture(), roughness: 0.8 });
  // A little proud of the pillars: their tops overlap it, coplanar faces would flicker.
  box(SW, 0.16, 0.13, friezeMat, fx, F + SH - 0.08, fz + 0.065);
  box(SW - 0.26, SH - 0.16, 0.06, sooty, fx, F + (SH - 0.16) / 2, fz + 0.03);
  box(SW + 0.22, 0.02, 0.32, stone, fx, F + 0.01, fz + 0.16); // hearth
  // The mantel shelf.
  box(SW + 0.3, 0.04, 0.16, flat(0x1e130c), fx, F + SH + 0.02, fz + 0.08);
  // Logs and the fire.
  const logM = flat(0x3a2414);
  for (const [dx, rot] of [[-0.06, 0.4], [0.07, -0.35], [0, 0]] as const) {
    const log = add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 6), logM), fx + dx, F + 0.05 + (dx === 0 ? 0.04 : 0), fz + 0.1);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = rot;
  }
  add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.02, 0.1), new THREE.MeshBasicMaterial({ color: 0xff5010 })), fx, F + 0.03, fz + 0.1);
  const flameTex = flameTexture();
  const flames: { m: THREE.Mesh; base: number; phase: number }[] = [];
  for (let i = 0; i < 5; i++) {
    const mat = new THREE.MeshBasicMaterial({ map: flameTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const hgt = 0.2 + (i % 2) * 0.08;
    const m = add(new THREE.Mesh(new THREE.PlaneGeometry(0.11, hgt), mat), fx - 0.14 + i * 0.07, F + 0.05 + hgt / 2, fz + 0.1 + (i % 2) * 0.02);
    flames.push({ m, base: hgt, phase: i * 1.7 });
  }
  const fireLight = add(new THREE.PointLight(0xff7a2a, 1.2, 2.6, 1.4), fx, F + 0.3, fz + 0.45);

  // Candles on the mantel, in clusters at both ends.
  const wax = flat(0xf3eee2, { emissive: 0xffd9a0, emissiveIntensity: 0.15 });
  const wick = new THREE.MeshBasicMaterial({ color: 0xffd27a, toneMapped: false });
  const wicks: THREE.Mesh[] = [];
  for (const [dx, hgt] of [[-0.46, 0.08], [-0.41, 0.11], [-0.36, 0.06], [-0.3, 0.09], [0.33, 0.1], [0.38, 0.07], [0.43, 0.12], [0.47, 0.08]] as const) {
    const y0 = F + SH + 0.04;
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, hgt, 8), wax), fx + dx, y0 + hgt / 2, fz + 0.1);
    wicks.push(add(new THREE.Mesh(new THREE.SphereGeometry(0.008, 5, 4), wick), fx + dx, y0 + hgt + 0.01, fz + 0.1));
  }
  // "PAPER ST" on the mantel, and another on the wall to the right.
  const signMat = decal(new THREE.MeshStandardMaterial({ map: streetSign(), roughness: 0.5 }));
  const sign1 = add(new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.075), signMat), fx - 0.55, F + SH + 0.08, fz + 0.05);
  sign1.rotation.y = 0.15;
  add(new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.075), signMat), fx + 0.95, F + 0.42, fz + DECAL_GAP);

  // The neon ₿ over the mantel, up to the ceiling's orange wash.
  const neonMat = decal(new THREE.MeshBasicMaterial({ map: neonBitcoin(), transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
  const bh = Math.min(0.6, H - SH - 0.12);
  add(new THREE.Mesh(new THREE.PlaneGeometry(bh * 0.75, bh), neonMat), fx, F + SH + 0.06 + bh / 2, fz + DECAL_GAP);
  // A warm light under the ceiling: the neon and the fire wash it orange.
  const ceilLight = add(new THREE.PointLight(0xff8a3a, 1, 3.2, 1.3), cx, s.ceil - 0.18, cz);

  // The neon words on the right wall, over its leaded windows.
  const wordsMat = decal(new THREE.MeshBasicMaterial({ map: neonWords(), toneMapped: false }));
  const words = add(new THREE.Mesh(new THREE.PlaneGeometry(1.36, 0.68), wordsMat), s.maxX - DECAL_GAP, F + 0.66, cz - 0.1);
  words.rotation.y = -Math.PI / 2;

  // Two cream sofas in an L facing the fire, a low brass-and-glass table.
  const fabric = flat(0xe8ddcc, { roughness: 1 });
  const cushion = flat(0xf1e8da, { roughness: 1 });
  const SEAT_Y = 0.17;
  /** A sofa centred at (x, z), `len` long, facing `face` (0 = +z). */
  const sofa = (x: number, z: number, len: number, face: number, n: number) => {
    const sg = new THREE.Group();
    sg.position.set(x, F, z);
    sg.rotation.y = face;
    g.add(sg);
    const part = (w: number, h: number, d: number, m: THREE.Material, px: number, py: number, pz: number) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      b.position.set(px, py, pz);
      b.castShadow = b.receiveShadow = true;
      sg.add(b);
    };
    part(len, 0.11, 0.3, fabric, 0, 0.055, 0);                          // base
    for (let i = 0; i < n; i++) part(len / n - 0.02, 0.05, 0.26, cushion, -len / 2 + (i + 0.5) * (len / n), 0.135, 0.01);
    part(len, 0.2, 0.07, fabric, 0, 0.2, -0.13);                        // back
    for (const sx of [-1, 1]) part(0.07, 0.17, 0.3, fabric, sx * (len / 2 + 0.035), 0.14, 0); // arms
    // Solid (the base you'd jump on) and seats along it, in room coordinates.
    const c = Math.cos(face), sn = Math.sin(face);
    const along = { x: c, z: -sn }, fwd = { x: sn, z: c };
    const hx = Math.abs(c) * (len / 2 + 0.07) + Math.abs(sn) * 0.15, hz = Math.abs(sn) * (len / 2 + 0.07) + Math.abs(c) * 0.15;
    solids.push({ x, z, hx, hz, top: F + 0.3 });
    for (let i = 0; i < n; i++) {
      const o = -len / 2 + (i + 0.5) * (len / n);
      seats.push({ pos: { x: x + along.x * o + fwd.x * 0.02, z: z + along.z * o + fwd.z * 0.02 }, face, y: F + SEAT_Y, prop: 'mate', indoor: true, bench: `sofa:${x.toFixed(2)}:${z.toFixed(2)}` });
    }
  };
  // One across the room facing the fire, one along the left wall facing in;
  // three places each, one mate going round.
  sofa(fx + 0.05, s.minZ + 1.25, 0.96, Math.PI, 3);
  sofa(s.minX + 0.22, s.minZ + 0.75, 0.9, Math.PI / 2, 3);
  // The table and a rug under it.
  const tx = fx + 0.05, tz = s.minZ + 0.72;
  const rug = add(new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.62), flat(0x5a1e18, { roughness: 1 })), tx - 0.05, F + 0.004, tz);
  rug.rotation.x = -Math.PI / 2;
  rug.receiveShadow = true;
  const brass = flat(0xb08a3e, { metalness: 0.7, roughness: 0.35 });
  for (const [dx, dz] of [[-0.18, -0.12], [0.18, -0.12], [-0.18, 0.12], [0.18, 0.12]]) box(0.015, 0.12, 0.015, brass, tx + dx, F + 0.06, tz + dz);
  box(0.4, 0.012, 0.28, brass, tx, F + 0.12, tz);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.008, 0.26), new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.6 })), tx, F + 0.13, tz);
  solids.push({ x: tx, z: tz, hx: 0.2, hz: 0.14, top: F + 0.14 });
  // A fireplace you can't walk into.
  solids.push({ x: fx, z: fz + 0.1, hx: SW / 2 + 0.1, hz: 0.12, top: F + SH + 0.04 });

  let night = 0;
  return {
    group: g,
    seats,
    solids,
    cutaway,
    update(_dt, t) {
      for (const f of flames) {
        const k = 0.5 + 0.5 * Math.sin(t * 9 + f.phase) * Math.sin(t * 5.3 + f.phase * 2);
        f.m.scale.set(0.85 + k * 0.3, 0.75 + k * 0.5, 1);
        f.m.position.y = F + 0.05 + (f.base * f.m.scale.y) / 2;
        (f.m.material as THREE.MeshBasicMaterial).opacity = 0.7 + k * 0.3;
      }
      const flick = 0.85 + 0.15 * Math.sin(t * 11) * Math.sin(t * 7.1);
      fireLight.intensity = (1.1 + night * 0.6) * flick;
      for (let i = 0; i < wicks.length; i++) wicks[i].scale.setScalar(0.8 + 0.3 * Math.abs(Math.sin(t * 6 + i * 1.3)));
    },
    setNight(n) {
      night = n;
      ceilMat.emissiveIntensity = 0.22 + n * 0.25;
      ceilLight.intensity = 0.8 + n * 0.6;
    },
  };
}
