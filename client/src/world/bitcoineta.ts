// La Bitcoineta: the orange and white VW T2 that tours Latin America
// teaching Bitcoin, parked as a stand inside LABITCONF. Built from boxes
// and cylinders at the village's scale (people are 0.72 tall: the van is
// about 1.7 long), its sliding door open on the hall side with a counter
// and the "Bitcoin accepted here" plate.
//
// Local frame: the van runs along z (nose at +z), the open side faces +x,
// the wheels stand on y = 0.

import * as THREE from 'three';
import { canvasTexture, bitcoinSign } from './landmarks/signs';

export const BITCOINETA = {
  /** Body length (z), width (x) and roof height. */
  L: 1.7,
  W: 0.64,
  H: 0.78,
  /** Ground clearance under the body. */
  LIFT: 0.12,
  /** Where the lower orange body meets the white upper half. */
  BELT: 0.46,
  /** The sliding door's opening on the +x side (z range). */
  DOOR0: -0.1,
  DOOR1: 0.38,
} as const;

const ORANGE = 0xf2a516;
const WHITE = 0xf7f3ea;
const CREAM = 0xf3e6c4;

const flat = (color: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.6, flatShading: true, ...o });

/** The side panel: "La Bitcoineta" in script and a few hand-drawn doodles, on orange. */
function sidePanel(): THREE.CanvasTexture {
  return canvasTexture(512, 160, (c) => {
    c.fillStyle = '#f2a516';
    c.fillRect(0, 0, 512, 160);
    c.strokeStyle = '#fff6df';
    c.fillStyle = '#fff6df';
    c.lineWidth = 3;
    // Doodles: stars, a lightning bolt, little ₿ coins.
    const star = (x: number, y: number, r: number) => {
      c.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i * Math.PI) / 5 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r;
        c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      c.closePath();
      c.stroke();
    };
    star(40, 40, 16); star(150, 120, 12); star(250, 34, 10);
    c.beginPath(); c.moveTo(96, 22); c.lineTo(80, 70); c.lineTo(100, 66); c.lineTo(86, 112); c.stroke();
    c.font = '700 30px Georgia, serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const [x, y] of [[200, 96], [300, 128], [40, 124]]) {
      c.beginPath(); c.arc(x, y, 18, 0, Math.PI * 2); c.stroke();
      c.fillText('₿', x, y + 1);
    }
    // The name, on the rear half like the real van.
    c.font = 'italic 800 46px Georgia, serif';
    c.fillText('La', 400, 52);
    c.font = 'italic 800 50px Georgia, serif';
    c.fillText('Bitcoineta', 400, 104);
  });
}

/** The ₿ disc on the nose: orange coin, white ₿. */
function noseBadge(): THREE.CanvasTexture {
  return canvasTexture(128, 128, (c) => {
    c.fillStyle = '#f7931a';
    c.beginPath(); c.arc(64, 64, 62, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ffffff';
    c.font = '800 84px Inter, system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('₿', 64, 70);
  });
}

export function buildBitcoineta(): THREE.Group {
  const { L, W, H, LIFT, BELT, DOOR0, DOOR1 } = BITCOINETA;
  const g = new THREE.Group();
  g.name = 'bitcoineta';
  const orange = flat(ORANGE);
  const white = flat(WHITE);
  const dark = flat(0x1d2a33, { roughness: 0.15, metalness: 0.3 });
  const black = flat(0x1b1b1d);
  const chrome = flat(0xd8dde2, { roughness: 0.25, metalness: 0.8 });
  const box = (w: number, h: number, d: number, m: THREE.Material | THREE.Material[], x: number, y: number, z: number) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z);
    b.castShadow = b.receiveShadow = true;
    g.add(b);
    return b;
  };

  // The body: orange below the belt, white above, the nose a little rounded
  // by a narrower cap. The +x side has its door opening cut out.
  const side = sidePanel();
  const sideMat = flat(ORANGE, { map: side });
  const lowH = BELT - LIFT;
  // Lower body in three pieces round the door (rear, under the door sill, front).
  const rearLen = DOOR0 + L / 2;
  box(W, lowH, rearLen, [sideMat, orange, orange, orange, orange, orange], 0, LIFT + lowH / 2, -L / 2 + rearLen / 2);
  box(W, 0.05, DOOR1 - DOOR0, orange, 0, LIFT + 0.025, (DOOR0 + DOOR1) / 2);
  box(0.03, lowH, DOOR1 - DOOR0, orange, -W / 2 + 0.015, LIFT + lowH / 2, (DOOR0 + DOOR1) / 2);
  const frontLen = L / 2 - DOOR1;
  box(W, lowH, frontLen, orange, 0, LIFT + lowH / 2, DOOR1 + frontLen / 2);
  // Upper body: windows all round, the door opening again on +x.
  const upH = H - BELT;
  box(W, upH, rearLen, [dark, dark, white, white, white, white], 0, BELT + upH / 2, -L / 2 + rearLen / 2);
  box(0.03, upH, DOOR1 - DOOR0, dark, -W / 2 + 0.015, BELT + upH / 2, (DOOR0 + DOOR1) / 2);
  box(W, upH, frontLen, [dark, dark, white, white, dark, white], 0, BELT + upH / 2, DOOR1 + frontLen / 2);
  box(W, 0.04, DOOR1 - DOOR0, white, 0, H - 0.02, (DOOR0 + DOOR1) / 2);
  // Window frames: a white pillar between each pane on both sides.
  for (const z of [-0.62, -0.3, DOOR0, DOOR1]) for (const s of [-1, 1]) {
    if (s > 0 && z > DOOR0 - 0.01 && z < DOOR1 + 0.01) continue;
    box(0.012, upH - 0.04, 0.04, white, s * (W / 2 + 0.004), BELT + upH / 2, z);
  }
  // The roof, slightly overhanging, and its black rack.
  box(W + 0.02, 0.03, L + 0.02, white, 0, H + 0.015, 0);
  for (const s of [-1, 1]) box(0.02, 0.02, L * 0.7, black, s * (W / 2 - 0.05), H + 0.08, -0.08);
  for (let i = 0; i < 5; i++) box(W - 0.08, 0.015, 0.02, black, 0, H + 0.08, -0.08 - L * 0.35 + (i * L * 0.7) / 4);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.02, 0.06, 0.02, black, sx * (W / 2 - 0.05), H + 0.045, -0.08 + sz * L * 0.34);

  // The nose: the white V over the orange, the ₿ badge, headlamps, bumper.
  const front = L / 2 + 0.005;
  const v = new THREE.Shape();
  v.moveTo(-W / 2, BELT + 0.06); v.lineTo(0, BELT - 0.14); v.lineTo(W / 2, BELT + 0.06); v.lineTo(W / 2, BELT); v.lineTo(-W / 2, BELT);
  const vMesh = new THREE.Mesh(new THREE.ShapeGeometry(v), white);
  vMesh.position.z = front;
  g.add(vMesh);
  const badge = new THREE.Mesh(new THREE.CircleGeometry(0.075, 20), new THREE.MeshStandardMaterial({ map: noseBadge(), roughness: 0.5 }));
  badge.position.set(0, BELT - 0.09, front + 0.004);
  g.add(badge);
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xfff2c0, emissiveIntensity: 0.4, roughness: 0.2 });
  for (const s of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 14), lampMat);
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(s * (W / 2 - 0.09), LIFT + 0.12, front + 0.01);
    g.add(lamp);
  }
  box(W + 0.04, 0.035, 0.035, white, 0, LIFT + 0.02, L / 2 + 0.02);
  box(W + 0.04, 0.035, 0.035, white, 0, LIFT + 0.02, -L / 2 - 0.02);
  // Grille slats under the windscreen.
  for (let i = 0; i < 4; i++) box(0.18, 0.008, 0.006, chrome, 0, BELT + 0.02 + i * 0.016, front + 0.003);

  // Wheels: black tyres, cream hubs (like the photo's wheels).
  const tyreGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.07, 16);
  const hubGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.075, 14);
  const hub = flat(CREAM, { roughness: 0.4 });
  for (const z of [-L / 2 + 0.28, L / 2 - 0.3]) for (const s of [-1, 1]) {
    const t = new THREE.Mesh(tyreGeo, black);
    t.rotation.z = Math.PI / 2;
    t.position.set(s * (W / 2 - 0.03), 0.11, z);
    t.castShadow = true;
    g.add(t);
    const h = new THREE.Mesh(hubGeo, hub);
    h.rotation.z = Math.PI / 2;
    h.position.copy(t.position);
    g.add(h);
  }

  // The stand: the sliding door slid back, an awning over the opening, a
  // counter in front with a jar of sats and the "Bitcoin accepted" plate.
  box(0.02, H - LIFT - 0.06, DOOR1 - DOOR0, orange, W / 2 + 0.03, LIFT + (H - LIFT) / 2, DOOR0 - (DOOR1 - DOOR0) / 2 - 0.02);
  const stripes = canvasTexture(64, 64, (c) => {
    for (let i = 0; i < 4; i++) { c.fillStyle = i % 2 ? '#ffffff' : '#f7931a'; c.fillRect(i * 16, 0, 16, 64); }
  });
  const awning = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.012, DOOR1 - DOOR0 + 0.16), flat(0xffffff, { map: stripes }));
  awning.position.set(W / 2 + 0.16, H - 0.02, (DOOR0 + DOOR1) / 2);
  awning.rotation.z = -0.28;
  awning.castShadow = true;
  g.add(awning);
  const wood = flat(0x8a5a3b);
  box(0.16, 0.025, DOOR1 - DOOR0 + 0.1, wood, W / 2 + 0.12, 0.36, (DOOR0 + DOOR1) / 2);
  for (const z of [DOOR0 - 0.03, DOOR1 + 0.03]) box(0.025, 0.35, 0.025, wood, W / 2 + 0.17, 0.175, z);
  const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.06, 10), new THREE.MeshStandardMaterial({ color: 0xffd76a, emissive: 0xf7931a, emissiveIntensity: 0.25, roughness: 0.3 }));
  jar.position.set(W / 2 + 0.12, 0.403, DOOR1 - 0.02);
  g.add(jar);
  const plate = bitcoinSign();
  plate.position.set(W / 2 + 0.205, 0.22, (DOOR0 + DOOR1) / 2);
  plate.rotation.y = Math.PI / 2;
  g.add(plate);
  return g;
}
