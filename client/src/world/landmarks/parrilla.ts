// The parrilla: a quincho (a tiled roof on timber posts) over a brick grill
// with glowing coals, chorizos, morcillas and a tira de asado on the grate,
// smoke going up the chimney, a long table with benches and a hand-painted
// sign. Neighbours gather there in the evening.
//
// Local frame: open side faces +z, the grill against the back wall.

import * as THREE from 'three';
import type { LandmarkBuild, LandmarkSeat } from './index';

const flat = (color: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true, ...o });

function brickTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#d8c8b0';
  g.fillRect(0, 0, 128, 128);
  for (let row = 0; row < 8; row++) {
    for (let col = -1; col < 5; col++) {
      const x = col * 32 + (row % 2 ? 16 : 0);
      g.fillStyle = `hsl(${10 + Math.random() * 10}, ${45 + Math.random() * 15}%, ${34 + Math.random() * 10}%)`;
      g.fillRect(x + 1, row * 16 + 1, 30, 14);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function paintedSign(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 140;
  const g = c.getContext('2d')!;
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
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildParrilla(): LandmarkBuild {
  const g = new THREE.Group();
  const W = 1.9, D = 1.5;
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

  // Coals and the grate with the meat.
  const coalMat = new THREE.MeshStandardMaterial({ color: 0x1a0d08, emissive: 0xff4a12, emissiveIntensity: 0.6, roughness: 1 });
  const coals = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.035, 0), coalMat, 30);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 30; i++) coals.setMatrixAt(i, m4.makeTranslation((Math.random() - 0.5) * 0.8, 0.44, -D + 0.4 + (Math.random() - 0.5) * 0.3));
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
  for (const side of [-1, 1]) {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.035, 0.16), timber);
    bench.position.set(0, 0.18, -0.45 + side * 0.33);
    bench.castShadow = true;
    g.add(bench);
    for (const x of [-0.4, 0, 0.4]) {
      seats.push({ pos: { x, z: -0.45 + side * 0.33 }, face: side > 0 ? Math.PI : 0, y: 0.19, prop: 'asado' });
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.01, 12), plate);
      p.position.set(x, 0.325, -0.45 + side * 0.09);
      g.add(p);
    }
  }
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
  fire.position.set(0, 0.7, -D + 0.6);
  g.add(fire);

  let night = 0;
  return {
    group: g,
    seats,
    solids: [
      { x: 0, z: -0.45, hx: 0.6, hz: 0.17, top: 0.32 },
      { x: 0, z: -0.12, hx: 0.6, hz: 0.08, top: 0.2 },
      { x: 0, z: -0.78, hx: 0.6, hz: 0.08, top: 0.2 },
    ],
    doorLocal: new THREE.Vector3(0, 0, 0.8),
    update(_dt, t) {
      const flick = 0.75 + Math.sin(t * 7.3) * 0.12 + Math.sin(t * 13.1) * 0.08;
      coalMat.emissiveIntensity = (0.6 + night * 0.9) * flick;
      fire.intensity = (0.4 + night * 1.6) * flick;
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
