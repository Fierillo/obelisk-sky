// The parrilla: a quincho (a tiled roof on timber posts, brick walls at the
// back and sides) over a brick grill with chorizos, morcillas and a tira de
// asado on the grate, the brasero in the corner where the wood burns down to
// coals, smoke going up the chimney, a long table laid with plates, cutlery
// and wine, benches on legs, a hand-painted sign. Neighbours gather there in
// the evening.
//
// Local frame: open side faces +z, the grill against the back wall.

import * as THREE from 'three';
import type { LandmarkBuild, LandmarkSeat } from './index';
import { bitcoinSign, canvasTexture } from './signs';

const flat = (color: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true, ...o });

function brickTexture(): THREE.CanvasTexture {
  const t = canvasTexture(128, 128, (g) => {
    g.fillStyle = '#d8c8b0';
    g.fillRect(0, 0, 128, 128);
    for (let row = 0; row < 8; row++) {
      for (let col = -1; col < 5; col++) {
        const x = col * 32 + (row % 2 ? 16 : 0);
        g.fillStyle = `hsl(${10 + Math.random() * 10}, ${45 + Math.random() * 15}%, ${34 + Math.random() * 10}%)`;
        g.fillRect(x + 1, row * 16 + 1, 30, 14);
      }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const paintedSign = () => canvasTexture(512, 140, (g) => {
  g.fillStyle = '#7a4a2a';
  g.fillRect(0, 0, 512, 140);
  g.strokeStyle = '#f2e3c6';
  g.lineWidth = 6;
  g.strokeRect(10, 10, 492, 120);
  g.fillStyle = '#f2e3c6';
  g.font = 'italic 800 78px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('Parrilla', 256, 74);
});

/** Parrilla size (local): width, depth, the tile floor's top. */
export const PARRILLA = { W: 1.9, D: 1.5, FLOOR: 0.05 } as const;
/** The brasero, in the back-left corner: where wood burns down to coals. */
export const BRASERO = { x: -0.69, z: -1.11, hx: 0.17, hz: 0.2, top: 0.42 } as const;
/** The side walls (brick), from the back wall forward. */
export const SIDE_WALL = { len: 0.86, h: 1.05, t: 0.12 } as const;

/** The tile floor's top, eased up over its outer 0.1 so there's no ledge. */
export function parrillaGround(l: { x: number; z: number }): number {
  const { W, D, FLOOR } = PARRILLA;
  const e = Math.min(W / 2 + 0.15 - Math.abs(l.x), Math.min(l.z + D, 0.3 - l.z));
  return e > 0 ? FLOOR * Math.min(1, e / 0.1) : 0;
}

export function buildParrilla(): LandmarkBuild {
  const g = new THREE.Group();
  const { W, D } = PARRILLA;
  const brickTex = brickTexture();
  const brick = (w: number, h: number) => {
    const t = brickTex.clone();
    t.needsUpdate = true;
    t.repeat.set(w * 2.2, h * 2.2);
    return new THREE.MeshStandardMaterial({ map: t, roughness: 1 });
  };
  const timber = flat(0x5a3a22);

  // Floor of terracotta tiles.
  const floor = new THREE.Mesh(new THREE.BoxGeometry(W + 0.3, 0.05, D + 0.3), flat(0xb5653e, { roughness: 1 }));
  floor.position.set(0, 0.025, -D / 2 + 0.15);
  floor.receiveShadow = true;
  g.add(floor);

  // Back wall with the grill built in, and its chimney.
  const back = new THREE.Mesh(new THREE.BoxGeometry(W, 1.35, 0.18), brick(W, 1.35));
  back.position.set(0, 0.675, -D + 0.09);
  back.castShadow = back.receiveShadow = true;
  g.add(back);
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.42, 0.45), brick(1, 0.42));
  base.position.set(0, 0.21, -D + 0.4);
  base.castShadow = true;
  g.add(base);
  const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.52, 0.45, 4, 1), brick(1, 0.45));
  hood.rotation.y = Math.PI / 4;
  hood.position.set(0, 1.05, -D + 0.38);
  g.add(hood);
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.85, 0.24), brick(0.24, 0.85));
  chimney.position.set(0, 1.6, -D + 0.3);
  chimney.castShadow = true;
  g.add(chimney);

  // Side walls: brick, from the back corners forward, with a timber cap.
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 - SIDE_WALL.t / 2);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(SIDE_WALL.t, SIDE_WALL.h, SIDE_WALL.len), brick(SIDE_WALL.len, SIDE_WALL.h));
    wall.position.set(x, SIDE_WALL.h / 2, -D + 0.18 + SIDE_WALL.len / 2);
    wall.castShadow = wall.receiveShadow = true;
    g.add(wall);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(SIDE_WALL.t + 0.03, 0.03, SIDE_WALL.len + 0.02), timber);
    cap.position.set(x, SIDE_WALL.h + 0.015, wall.position.z);
    g.add(cap);
  }

  // The brasero: a brick box with low walls round its top and no grate, the
  // wood burning on it and its coals raked out under the grill.
  const coalMat = new THREE.MeshStandardMaterial({ color: 0x1a0d08, emissive: 0xff4a12, emissiveIntensity: 0.6, roughness: 1 });
  const bx = BRASERO;
  const braseroBase = new THREE.Mesh(new THREE.BoxGeometry(bx.hx * 2, bx.top, bx.hz * 2), brick(bx.hx * 2, bx.top));
  braseroBase.position.set(bx.x, bx.top / 2, bx.z);
  braseroBase.castShadow = true;
  g.add(braseroBase);
  const lipMat = brick(0.4, 0.1);
  for (const [w, d, x, z] of [[bx.hx * 2, 0.04, bx.x, bx.z + bx.hz - 0.02], [0.04, bx.hz * 2, bx.x + bx.hx - 0.02, bx.z]] as const) {
    const lip = new THREE.Mesh(new THREE.BoxGeometry(w, 0.09, d), lipMat);
    lip.position.set(x, bx.top + 0.045, z);
    g.add(lip);
  }
  const charred = flat(0x2a1a10);
  for (let i = 0; i < 3; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.26, 6), charred);
    log.rotation.set(Math.PI / 2, 0, (i - 1) * 0.7);
    log.position.set(bx.x - 0.02 + (i - 1) * 0.03, bx.top + 0.03 + (i === 1 ? 0.035 : 0), bx.z - 0.02);
    g.add(log);
  }
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending });
  const flames: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.14, 5), flameMat);
    f.position.set(bx.x + (i - 1) * 0.06, bx.top + 0.1, bx.z + (i % 2 ? 0.04 : -0.05));
    g.add(f);
    flames.push(f);
  }
  const COALS = 34;
  const coals = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.035, 0), coalMat, COALS);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < COALS; i++) {
    // A pile in the brasero; a thin bed raked under the grate.
    const inBrasero = i < 16;
    const x = inBrasero ? bx.x + (Math.random() - 0.5) * bx.hx * 1.5 : (Math.random() - 0.5) * 0.8;
    const z = inBrasero ? bx.z + (Math.random() - 0.5) * bx.hz * 1.5 : -D + 0.4 + (Math.random() - 0.5) * 0.3;
    coals.setMatrixAt(i, m4.makeTranslation(x, inBrasero ? bx.top + 0.02 : 0.44, z));
  }
  g.add(coals);
  const steel = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, metalness: 0.7, roughness: 0.5 });
  for (let i = 0; i < 9; i++) {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.9, 4), steel);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, 0.52, -D + 0.25 + i * 0.035);
    g.add(bar);
  }
  const chorizo = flat(0x8a2d1c, { roughness: 0.5 });
  const morcilla = flat(0x2a1414, { roughness: 0.5 });
  const asado = flat(0x7a3b22, { roughness: 0.6 });
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.12, 3, 6), i % 2 ? morcilla : chorizo);
    s.rotation.z = Math.PI / 2;
    s.position.set(-0.32 + i * 0.12, 0.55, -D + 0.32);
    g.add(s);
  }
  for (let i = 0; i < 2; i++) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.03, 0.09), asado);
    strip.position.set(-0.1 + i * 0.32, 0.545, -D + 0.47);
    g.add(strip);
  }

  // Quincho: posts and a tiled pitched roof.
  for (const [x, z] of [[-W / 2 + 0.05, 0.05], [W / 2 - 0.05, 0.05], [-W / 2 + 0.05, -D + 0.05], [W / 2 - 0.05, -D + 0.05]]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.4, 0.08), timber);
    post.position.set(x, 0.7, z);
    post.castShadow = true;
    g.add(post);
  }
  const tile = flat(0xa4472a);
  const rise = 0.45, over = 0.18;
  const half = Math.hypot(D / 2 + over, rise);
  for (const s of [-1, 1]) {
    const slope = new THREE.Mesh(new THREE.BoxGeometry(W + 0.35, 0.05, half), tile);
    slope.position.set(0, 1.4 + rise / 2, -D / 2 + s * (D / 4 + over / 2));
    slope.rotation.x = s * Math.atan2(rise, D / 2 + over);
    slope.castShadow = true;
    g.add(slope);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(W + 0.2, 0.07, 0.07), timber);
  beam.position.set(0, 1.4, 0.05);
  g.add(beam);

  // The sign hangs from the front beam.
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.19), new THREE.MeshStandardMaterial({ map: paintedSign(), side: THREE.DoubleSide, roughness: 0.9 }));
  sign.position.set(0, 1.23, 0.07);
  g.add(sign);
  // "Bitcoin accepted here" on the back wall, right of the grill.
  const btc = bitcoinSign();
  btc.position.set(0.66, 0.86, -D + 0.185);
  g.add(btc);

  // Long table and two benches (the seats).
  const seats: LandmarkSeat[] = [];
  const table = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.34), timber);
  table.position.set(0, 0.3, -0.45);
  table.castShadow = true;
  g.add(table);
  for (const x of [-0.5, 0.5]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.28), timber);
    leg.position.set(x, 0.15, -0.45);
    g.add(leg);
  }
  const plate = flat(0xf2f2ee);
  const wine = new THREE.MeshStandardMaterial({ color: 0x3a0812, roughness: 0.3, metalness: 0.1 });
  // Cutlery: a fork left and a knife right of every plate (instanced).
  const forkGeo = new THREE.BoxGeometry(0.012, 0.004, 0.085);
  const knifeGeo = new THREE.BoxGeometry(0.01, 0.004, 0.095);
  const cutleryMat = new THREE.MeshStandardMaterial({ color: 0xc9ccd2, metalness: 0.8, roughness: 0.3 });
  const forks = new THREE.InstancedMesh(forkGeo, cutleryMat, 6);
  const knives = new THREE.InstancedMesh(knifeGeo, cutleryMat, 6);
  forks.name = 'forks';
  knives.name = 'knives';
  let k = 0;
  const LEG = 0.1625 - PARRILLA.FLOOR; // tiles up to the bench's underside
  const legGeo = new THREE.CylinderGeometry(0.014, 0.012, LEG, 5);
  for (const side of [-1, 1]) {
    const bz = -0.45 + side * 0.33;
    const bench = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.035, 0.16), timber);
    bench.position.set(0, 0.18, bz);
    bench.castShadow = true;
    bench.name = 'bench';
    g.add(bench);
    // Four legs down to the tiles.
    for (const lx of [-0.54, 0.54]) for (const lz of [-0.055, 0.055]) {
      const leg = new THREE.Mesh(legGeo, timber);
      leg.position.set(lx, PARRILLA.FLOOR + LEG / 2, bz + lz);
      leg.name = 'bench-leg';
      g.add(leg);
    }
    for (const x of [-0.4, 0, 0.4]) {
      seats.push({ pos: { x, z: bz }, face: side > 0 ? Math.PI : 0, y: 0.19, prop: 'asado' });
      const pz = -0.45 + side * 0.09;
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.01, 12), plate);
      p.position.set(x, 0.325, pz);
      g.add(p);
      // From the diner's side: fork on their left, knife on their right.
      forks.setMatrixAt(k, m4.makeTranslation(x - side * 0.08, 0.322, pz));
      knives.setMatrixAt(k, m4.makeTranslation(x + side * 0.08, 0.322, pz));
      k++;
    }
  }
  g.add(forks, knives);
  const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.12, 8), wine);
  bottle.position.set(0.15, 0.38, -0.45);
  g.add(bottle);

  // Smoke out of the chimney, and the coals' warm light.
  const smokeMat = new THREE.SpriteMaterial({ color: 0xd8d4cc, transparent: true, opacity: 0.4, depthWrite: false });
  const smoke: { s: THREE.Sprite; phase: number }[] = [];
  for (let i = 0; i < 9; i++) {
    const s = new THREE.Sprite(smokeMat.clone());
    g.add(s);
    smoke.push({ s, phase: i / 9 });
  }
  const fire = new THREE.PointLight(0xff7a2a, 0.4, 3.2, 1.6);
  fire.position.set(-0.35, 0.7, -D + 0.6);
  g.add(fire);

  let night = 0;
  return {
    group: g,
    seats,
    solids: [
      { x: 0, z: -0.45, hx: 0.6, hz: 0.17, top: 0.32 },
      { x: 0, z: -0.12, hx: 0.6, hz: 0.08, top: 0.2 },
      { x: 0, z: -0.78, hx: 0.6, hz: 0.08, top: 0.2 },
      { x: BRASERO.x, z: BRASERO.z, hx: BRASERO.hx, hz: BRASERO.hz, top: BRASERO.top + 0.09 },
      ...[-1, 1].map((sx) => ({ x: sx * (W / 2 - SIDE_WALL.t / 2), z: -D + 0.18 + SIDE_WALL.len / 2, hx: SIDE_WALL.t / 2, hz: SIDE_WALL.len / 2, top: SIDE_WALL.h })),
    ],
    groundAt: parrillaGround,
    doorLocal: new THREE.Vector3(0, 0, 0.8),
    update(_dt, t) {
      const flick = 0.75 + Math.sin(t * 7.3) * 0.12 + Math.sin(t * 13.1) * 0.08;
      coalMat.emissiveIntensity = (0.6 + night * 0.9) * flick;
      fire.intensity = (0.4 + night * 1.6) * flick;
      flames.forEach((f, i) => {
        const h = 0.75 + Math.sin(t * (9 + i * 2.3) + i) * 0.25 + Math.sin(t * 17 + i * 4) * 0.1;
        f.scale.set(1, h, 1);
        f.position.y = BRASERO.top + 0.03 + 0.07 * h;
      });
      for (const p of smoke) {
        const k = (t * 0.18 + p.phase) % 1;
        p.s.position.set(Math.sin(t * 0.7 + p.phase * 9) * 0.08 + k * 0.25, 2.05 + k * 1.3, -D + 0.3);
        p.s.scale.setScalar(0.12 + k * 0.45);
        (p.s.material as THREE.SpriteMaterial).opacity = 0.42 * (1 - k) * (k < 0.1 ? k * 10 : 1);
      }
    },
    setNight(n) {
      night = n;
    },
  };
}
