// The parrilla: a quincho (a tiled roof on timber posts, a brick wall at the
// back) over a brick asador: brick jambs round the opening, a hood and
// chimney, the brasero in its left quarter where the wood burns down to
// coals, and a grill over the rest with chorizos, morcillas and a tira de
// asado, smoke going up the chimney, a long table laid with plates, cutlery
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
/** The asador against the back wall: centre z, half sizes, jamb width, the lintel's underside. */
export const ASADOR = { z: -PARRILLA.D + 0.43, hx: 0.55, hz: 0.25, jamb: 0.1, lintel: 1.0, top: 1.43 } as const;
const INNER = ASADOR.hx - ASADOR.jamb;
/** The brasero, the left quarter inside the asador: where wood burns down to coals; `top` is the hearth. */
export const BRASERO = { x: -INNER + INNER / 4, z: ASADOR.z, hx: INNER / 4, hz: 0.2, top: 0.42 } as const;
/** The grill over the other three quarters. */
export const GRILL = { x: INNER / 4 + 0.01, hx: INNER * 0.75 - 0.02, hz: 0.2, y: 0.58 } as const;

/** The quincho's roof: post height, tile thickness, pitch, overhang past the posts. */
export const ROOF = { postTop: 1.4, t: 0.05, pitch: Math.atan2(0.45, PARRILLA.D / 2 + 0.18), over: 0.18, ridgeZ: -PARRILLA.D / 2 + 0.05 } as const;

/** Height of the roof's top (local z): the ridge over the middle, the
 *  underside resting on the front and back posts. */
export function roofTopAt(z: number): number {
  const { postTop, t, pitch, ridgeZ } = ROOF;
  // The ridge sits midway between the posts (z 0.05 and −D + 0.05).
  const ridge = postTop + t / Math.cos(pitch) + (PARRILLA.D / 2) * Math.tan(pitch);
  return ridge - Math.abs(z - ridgeZ) * Math.tan(pitch);
}

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

  // The back wall of the quincho.
  const back = new THREE.Mesh(new THREE.BoxGeometry(W, 1.35, 0.18), brick(W, 1.35));
  back.position.set(0, 0.675, -D + 0.09);
  back.castShadow = back.receiveShadow = true;
  g.add(back);

  // The asador, one brick unit against it: a base with steel doors, brick
  // jambs either side of the opening, a lintel, a hood and the chimney.
  const A = ASADOR;
  const hearth = BRASERO.top;
  const base = new THREE.Mesh(new THREE.BoxGeometry(A.hx * 2, hearth, A.hz * 2), brick(A.hx * 2, hearth));
  base.position.set(0, hearth / 2, A.z);
  base.castShadow = base.receiveShadow = true;
  g.add(base);
  const doorMat = flat(0x18181a, { roughness: 0.5, metalness: 0.4 });
  for (const sx of [-1, 1]) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(A.hx - A.jamb - 0.01, hearth - 0.1, 0.012), doorMat);
    door.position.set(sx * (A.hx - A.jamb) / 2, hearth / 2, A.z + A.hz + 0.006);
    g.add(door);
  }
  const steel = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, metalness: 0.7, roughness: 0.5 });
  const inox = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 0.8, roughness: 0.35 });
  const ledge = new THREE.Mesh(new THREE.BoxGeometry(A.hx * 2 - A.jamb * 2, 0.025, 0.08), inox);
  ledge.position.set(0, hearth + 0.0125, A.z + A.hz - 0.03);
  g.add(ledge);
  const openH = A.lintel - hearth;
  for (const sx of [-1, 1]) {
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(A.jamb, openH, A.hz * 2), brick(A.hz * 2, openH));
    jamb.position.set(sx * (A.hx - A.jamb / 2), hearth + openH / 2, A.z);
    jamb.castShadow = true;
    g.add(jamb);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(A.hx * 2 + 0.06, 0.07, A.hz * 2 + 0.04), flat(0xb5522e));
  lintel.position.set(0, A.lintel + 0.035, A.z + 0.02);
  lintel.castShadow = true;
  g.add(lintel);
  // The hood narrows from the lintel to the chimney, which stands to the back.
  const hoodH = 0.36, chimZ = A.z - 0.1;
  const hoodGeo = new THREE.BoxGeometry(A.hx * 2 + 0.04, hoodH, A.hz * 2 + 0.02);
  const hp = hoodGeo.attributes.position;
  for (let i = 0; i < hp.count; i++) {
    if (hp.getY(i) < 0) continue;
    hp.setX(i, hp.getX(i) * 0.26 / (A.hx * 2 + 0.04));
    hp.setZ(i, hp.getZ(i) * 0.26 / (A.hz * 2 + 0.02) + (chimZ - A.z));
  }
  hoodGeo.computeVertexNormals();
  const hood = new THREE.Mesh(hoodGeo, brick(1, hoodH));
  hood.position.set(0, A.lintel + 0.07 + hoodH / 2, A.z);
  hood.castShadow = true;
  g.add(hood);
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.75, 0.24), brick(0.24, 0.75));
  chimney.position.set(0, A.lintel + 0.07 + hoodH + 0.33, chimZ);
  chimney.castShadow = true;
  g.add(chimney);

  // Inside, on the hearth: the brasero in the left quarter, a steel basket
  // where the wood burns, its coals raked across under the grill.
  const coalMat = new THREE.MeshStandardMaterial({ color: 0x1a0d08, emissive: 0xff4a12, emissiveIntensity: 0.6, roughness: 1 });
  const bx = BRASERO;
  const cage = new THREE.CylinderGeometry(0.006, 0.006, 0.26, 4);
  for (let i = 0; i < 5; i++) {
    const bar = new THREE.Mesh(cage, steel);
    bar.position.set(bx.x + bx.hx - 0.01, hearth + 0.13, bx.z - bx.hz * 0.8 + i * bx.hz * 0.4);
    g.add(bar);
  }
  const charred = flat(0x2a1a10);
  for (let i = 0; i < 3; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.26, 6), charred);
    log.rotation.set(Math.PI / 2, 0, (i - 1) * 0.5);
    log.position.set(bx.x + (i - 1) * 0.04, hearth + 0.04 + (i === 1 ? 0.035 : 0), bx.z);
    g.add(log);
  }
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending });
  const flames: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.14, 5), flameMat);
    f.position.set(bx.x + (i - 1) * 0.05, hearth + 0.1, bx.z + (i % 2 ? 0.05 : -0.06));
    g.add(f);
    flames.push(f);
  }
  const COALS = 34;
  const coals = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.035, 0), coalMat, COALS);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < COALS; i++) {
    // A pile in the brasero; a thin bed raked under the grate.
    const inBrasero = i < 16;
    const x = inBrasero ? bx.x + (Math.random() - 0.5) * bx.hx * 1.5 : GRILL.x + (Math.random() - 0.5) * GRILL.hx * 1.8;
    const z = inBrasero ? bx.z + (Math.random() - 0.5) * bx.hz * 1.5 : A.z + (Math.random() - 0.5) * A.hz * 1.4;
    coals.setMatrixAt(i, m4.makeTranslation(x, hearth + 0.02, z));
  }
  g.add(coals);

  // The grill over the other three quarters: bars running front to back on
  // two rails, hung from the lintel on chains.
  const barGeo = new THREE.CylinderGeometry(0.006, 0.006, GRILL.hz * 2, 4);
  for (let x = GRILL.x - GRILL.hx + 0.01; x <= GRILL.x + GRILL.hx; x += 0.035) {
    const bar = new THREE.Mesh(barGeo, steel);
    bar.rotation.x = Math.PI / 2;
    bar.position.set(x, GRILL.y, A.z);
    g.add(bar);
  }
  for (const dz of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(GRILL.hx * 2, 0.02, 0.015), steel);
    rail.position.set(GRILL.x, GRILL.y, A.z + dz * GRILL.hz);
    g.add(rail);
  }
  const chainLen = A.lintel - GRILL.y;
  for (const sx of [-1, 1]) {
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, chainLen, 3), steel);
    chain.position.set(GRILL.x + sx * (GRILL.hx - 0.02), GRILL.y + chainLen / 2, A.z + GRILL.hz);
    g.add(chain);
  }
  const chorizo = flat(0x8a2d1c, { roughness: 0.5 });
  const morcilla = flat(0x2a1414, { roughness: 0.5 });
  const asado = flat(0x7a3b22, { roughness: 0.6 });
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.12, 3, 6), i % 2 ? morcilla : chorizo);
    s.rotation.z = Math.PI / 2;
    s.position.set(GRILL.x - GRILL.hx + 0.1 + i * 0.12, GRILL.y + 0.03, A.z - 0.1);
    g.add(s);
  }
  for (let i = 0; i < 2; i++) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.03, 0.09), asado);
    strip.position.set(GRILL.x - 0.15 + i * 0.3, GRILL.y + 0.025, A.z + 0.08);
    g.add(strip);
  }

  // Quincho: four posts, beams front and back, and a tiled gable roof whose
  // slopes meet at a ridge cap and rest on the posts; boarded gable ends.
  const { postTop, t: roofT, pitch, over, ridgeZ } = ROOF;
  for (const [x, z] of [[-W / 2 + 0.05, 0.05], [W / 2 - 0.05, 0.05], [-W / 2 + 0.05, -D + 0.05], [W / 2 - 0.05, -D + 0.05]]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, postTop, 0.08), timber);
    post.position.set(x, postTop / 2, z);
    post.castShadow = true;
    g.add(post);
  }
  for (const z of [0.05, -D + 0.05]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(W + 0.2, 0.07, 0.07), timber);
    beam.position.set(0, postTop - 0.035, z);
    g.add(beam);
  }
  const tile = flat(0xa4472a);
  const ridgeY = roofTopAt(ridgeZ);
  const run = D / 2 + over;
  for (const s of [-1, 1]) {
    const slope = new THREE.Mesh(new THREE.BoxGeometry(W + 0.35, roofT, run / Math.cos(pitch)), tile);
    // The top face runs from the ridge down to the eave; the box hangs below it.
    const n = new THREE.Vector3(0, Math.cos(pitch), s * Math.sin(pitch));
    slope.position.set(0, ridgeY - (run / 2) * Math.tan(pitch), ridgeZ + (s * run) / 2).addScaledVector(n, -roofT / 2);
    slope.rotation.x = s * pitch;
    slope.castShadow = slope.receiveShadow = true;
    g.add(slope);
  }
  const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, W + 0.37, 6), flat(0x8f3a22));
  ridge.rotation.z = Math.PI / 2;
  ridge.position.set(0, ridgeY, ridgeZ);
  g.add(ridge);
  const gableShape = new THREE.Shape();
  gableShape.moveTo(0.05, postTop);
  gableShape.lineTo(ridgeZ, ridgeY - roofT / Math.cos(pitch));
  gableShape.lineTo(-D + 0.05, postTop);
  gableShape.closePath();
  const boards = flat(0x7a5232, { side: THREE.DoubleSide });
  for (const sx of [-1, 1]) {
    // Shape x is local z (turned a quarter about y), shape y is height.
    const gable = new THREE.Mesh(new THREE.ShapeGeometry(gableShape), boards);
    gable.rotation.y = -Math.PI / 2;
    gable.position.x = sx * (W / 2 - 0.05);
    g.add(gable);
  }

  // The sign hangs from the front beam.
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.19), new THREE.MeshStandardMaterial({ map: paintedSign(), side: THREE.DoubleSide, roughness: 0.9 }));
  sign.position.set(0, 1.23, 0.07);
  g.add(sign);
  // "Bitcoin accepted here" on the back wall, right of the asador.
  const btc = bitcoinSign();
  btc.position.set(0.75, 0.86, -D + 0.185);
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
      { x: 0, z: ASADOR.z, hx: ASADOR.hx, hz: ASADOR.hz, top: ASADOR.top },
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
        f.position.y = BRASERO.top + 0.04 + 0.07 * h;
      });
      for (const p of smoke) {
        const k = (t * 0.18 + p.phase) % 1;
        p.s.position.set(Math.sin(t * 0.7 + p.phase * 9) * 0.08 + k * 0.25, ASADOR.top + 0.75 + k * 1.3, ASADOR.z - 0.1);
        p.s.scale.setScalar(0.12 + k * 0.45);
        (p.s.material as THREE.SpriteMaterial).opacity = 0.42 * (1 - k) * (k < 0.1 ? k * 10 : 1);
      }
    },
    setNight(n) {
      night = n;
    },
  };
}
