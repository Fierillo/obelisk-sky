// The coffee shop: a cream storefront with dark green trim, a striped
// awning over a big window, an espresso machine glowing inside with steam
// off a cup on the counter, a "CAFÉ" sign, a chalkboard on the pavement and
// two little tables outside where people sit with a coffee.
//
// Local frame: facade on z = 0 facing +z, the building behind it.

import * as THREE from 'three';
import { bitcoinSign } from './signs';
import type { LandmarkBuild, LandmarkSeat } from './index';

const flat = (color: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...o });

function signTexture(text: string, fg: string, bg: string, w = 512, h = 128, font = '800 84px Inter, system-ui, sans-serif'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function chalkboard(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 320;
  const g = c.getContext('2d')!;
  g.fillStyle = '#20302a';
  g.fillRect(0, 0, 256, 320);
  g.fillStyle = '#f4f1e8';
  g.textAlign = 'center';
  g.font = '700 34px Inter, system-ui, sans-serif';
  g.fillText('HOY', 128, 52);
  g.font = '500 26px Inter, system-ui, sans-serif';
  ['Cortado', 'Lágrima', 'Flat white', 'Medialunas'].forEach((l, i) => g.fillText(l, 128, 110 + i * 46));
  g.fillStyle = '#b4f953';
  g.font = '600 22px Inter, system-ui, sans-serif';
  g.fillText('⚡ zaps ok', 128, 296);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildCoffeeShop(): LandmarkBuild {
  const g = new THREE.Group();
  const W = 2.5, D = 1.7, H = 1.45;
  const cream = flat(0xefe6d2);
  const green = flat(0x1f4d3a);
  const wood = flat(0x6b4426);

  const T = 0.07;
  const inner = flat(0xf3ead8);
  const box = (w: number, h: number, d: number, m: THREE.Material | THREE.Material[], x: number, y: number, z: number) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z);
    b.castShadow = b.receiveShadow = true;
    g.add(b);
    return b;
  };
  // Walls (cream outside, warm white inside), the front with its window and door.
  const WIN0 = -1.13, WIN1 = 0.23, DOOR0 = 0.5, DOOR1 = 1.0, WIN_Y0 = 0.21, WIN_Y1 = 1.03, DOOR_H = 0.95;
  const walls: THREE.Mesh[] = [
    box(W, H, T, [cream, cream, cream, cream, inner, cream], 0, H / 2, -D + T / 2),
    box(T, H, D, [inner, cream, cream, cream, cream, cream], -W / 2 + T / 2, H / 2, -D / 2),
    box(T, H, D, [cream, inner, cream, cream, cream, cream], W / 2 - T / 2, H / 2, -D / 2),
    box(WIN0 + W / 2, H, T, cream, (-W / 2 + WIN0) / 2, H / 2, -T / 2),
    box(DOOR0 - WIN1, H, T, cream, (WIN1 + DOOR0) / 2, H / 2, -T / 2),
    box(W / 2 - DOOR1, H, T, cream, (DOOR1 + W / 2) / 2, H / 2, -T / 2),
    box(WIN1 - WIN0, WIN_Y0, T, cream, (WIN0 + WIN1) / 2, WIN_Y0 / 2, -T / 2),
    box(WIN1 - WIN0, H - WIN_Y1, T, cream, (WIN0 + WIN1) / 2, (H + WIN_Y1) / 2, -T / 2),
    box(DOOR1 - DOOR0, H - DOOR_H, T, cream, (DOOR0 + DOOR1) / 2, (H + DOOR_H) / 2, -T / 2),
  ];
  // "Bitcoin accepted here" between the window and the door.
  const btc = bitcoinSign();
  btc.scale.setScalar(0.92);
  btc.position.set((WIN1 + DOOR0) / 2, 0.66, 0.004);
  g.add(btc);
  const roofParts: THREE.Object3D[] = [];
  const ceiling = box(W, 0.04, D, cream, 0, H - 0.02, -D / 2);
  roofParts.push(ceiling);
  const cornice = box(W + 0.12, 0.12, D + 0.12, green, 0, H + 0.06, -D / 2);
  roofParts.push(cornice);
  box(W + 0.04, 0.14, 0.06, green, 0, 0.07, 0.02).position.y = 0.07; // plinth
  // Wooden floor.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W - 2 * T, D - T), flat(0x9a6b45, { roughness: 0.8 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0.006, -D / 2 - T / 2);
  floor.receiveShadow = true;
  g.add(floor);

  // The big window: warm, see-through glass with green mullions.
  const glow = new THREE.MeshStandardMaterial({ color: 0xffe2b8, emissive: 0xffc27a, emissiveIntensity: 0.12, roughness: 0.1, transparent: true, opacity: 0.3, depthWrite: false });
  const win = new THREE.Mesh(new THREE.BoxGeometry(WIN1 - WIN0, WIN_Y1 - WIN_Y0, 0.02), glow);
  win.position.set((WIN0 + WIN1) / 2, (WIN_Y0 + WIN_Y1) / 2, -0.01);
  g.add(win);
  for (const x of [WIN0, (WIN0 + WIN1) / 2, WIN1]) box(0.04, WIN_Y1 - WIN_Y0 + 0.04, 0.05, green, x, (WIN_Y0 + WIN_Y1) / 2, 0.005);
  for (const y of [WIN_Y0, WIN_Y1]) box(WIN1 - WIN0 + 0.05, 0.05, 0.05, green, (WIN0 + WIN1) / 2, y, 0.005);
  // Door: hinged on its left edge, swings in.
  const doorPivot = new THREE.Group();
  doorPivot.position.set(DOOR0, 0, 0);
  g.add(doorPivot);
  const doorLeaf = new THREE.Mesh(new THREE.BoxGeometry(DOOR1 - DOOR0, DOOR_H, 0.03), green);
  doorLeaf.position.set((DOOR1 - DOOR0) / 2, DOOR_H / 2, -0.015);
  doorLeaf.castShadow = true;
  doorPivot.add(doorLeaf);
  const doorGlass = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.42, 0.035), glow);
  doorGlass.position.set((DOOR1 - DOOR0) / 2, 0.62, -0.015);
  doorPivot.add(doorGlass);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.8, roughness: 0.3 }));
  knob.position.set(DOOR1 - DOOR0 - 0.06, 0.45, 0.01);
  doorPivot.add(knob);

  // Inside: the counter at the back with the espresso machine, shelves of
  // cups and jars, a menu, hanging lamps, and a table by the window.
  const chrome = new THREE.MeshStandardMaterial({ color: 0xd8dde3, metalness: 0.9, roughness: 0.25 });
  box(1.15, 0.42, 0.3, wood, -0.55, 0.21, -D + T + 0.25);
  box(1.19, 0.03, 0.34, flat(0x2b2b2f), -0.55, 0.435, -D + T + 0.25);
  const machine = box(0.36, 0.22, 0.2, chrome, -0.8, 0.56, -D + T + 0.22);
  void machine;
  const red = new THREE.MeshStandardMaterial({ color: 0x220a0a, emissive: 0xff3b2f, emissiveIntensity: 0.6 });
  for (const x of [-0.88, -0.72]) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 4), red);
    lamp.position.set(x, 0.62, -D + T + 0.32);
    g.add(lamp);
  }
  box(0.12, 0.2, 0.12, flat(0x2b2b2f), -0.45, 0.55, -D + T + 0.22); // grinder
  const cupMat = flat(0xffffff);
  for (let i = 0; i < 4; i++) box(0.05, 0.045, 0.05, cupMat, -0.25 + i * 0.07, 0.47, -D + T + 0.3);
  for (const y of [0.85, 1.08]) {
    box(1.1, 0.025, 0.14, wood, -0.55, y, -D + T + 0.07);
    for (let i = 0; i < 7; i++) {
      const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.08, 8), flat([0xffffff, 0x7a4a24, 0xe8b83a, 0x2f7a55][i % 4]));
      jar.position.set(-1.0 + i * 0.15, y + 0.055, -D + T + 0.07);
      g.add(jar);
    }
  }
  const menu = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.52), new THREE.MeshStandardMaterial({ map: chalkboard(), roughness: 1 }));
  menu.position.set(0.55, 0.85, -D + T + 0.004);
  g.add(menu);
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2f, emissive: 0xffd08a, emissiveIntensity: 0.3 });
  const pendants: THREE.Object3D[] = [];
  for (const x of [-0.8, -0.2, 0.5]) {
    const cord = box(0.01, 0.3, 0.01, flat(0x111111), x, H - 0.17, -0.85);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.07, 10, 1, true), lampMat);
    shade.position.set(x, H - 0.36, -0.85);
    g.add(shade);
    pendants.push(cord, shade);
  }
  const plant = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 1), flat(0x3f8f4a));
  plant.position.set(1.0, 0.28, -D + T + 0.15);
  plant.scale.set(1, 1.3, 1);
  g.add(plant);
  box(0.14, 0.16, 0.14, flat(0xb5653e), 1.0, 0.08, -D + T + 0.15);
  const roomLight = new THREE.PointLight(0xffd6a0, 0.5, 3, 1.4);
  roomLight.position.set(-0.2, 1.1, -0.9);
  g.add(roomLight);

  // Striped awning over the window.
  const sc = document.createElement('canvas');
  sc.width = 256;
  sc.height = 16;
  const sg = sc.getContext('2d')!;
  for (let i = 0; i < 16; i++) { sg.fillStyle = i % 2 ? '#f4f1e8' : '#2f7a55'; sg.fillRect(i * 16, 0, 16, 16); }
  const stripes = new THREE.CanvasTexture(sc);
  stripes.colorSpace = THREE.SRGBColorSpace;
  const awningMat = new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.9, side: THREE.DoubleSide });
  const awning = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.55), awningMat);
  awning.position.set(-0.45, 1.13, 0.22);
  awning.rotation.x = -Math.PI / 2 + 0.45;
  awning.castShadow = true;
  g.add(awning);
  const valance = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.1), awningMat);
  valance.position.set(-0.45, 0.94, 0.47);
  g.add(valance);

  // The sign.
  const signTex = signTexture('CAFÉ', '#f4f1e8', '#1f4d3a');
  const signMat = new THREE.MeshStandardMaterial({ map: signTex, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 0.15 });
  const sign = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.25, 0.04), [green, green, green, green, signMat, green]);
  sign.position.set(-0.3, 1.3, 0.04);
  g.add(sign);

  // Chalkboard on the pavement.
  const board = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.34), new THREE.MeshStandardMaterial({ map: chalkboard(), roughness: 1 }));
  board.position.set(1.15, 0.2, 0.55);
  board.rotation.set(-0.2, -0.4, 0);
  g.add(board);

  // Two tables with two chairs each, in front.
  const seats: LandmarkSeat[] = [];
  const solids: NonNullable<LandmarkBuild['solids']> = [];
  const metal = flat(0x2b2b2f, { metalness: 0.5, roughness: 0.5 });
  const top = flat(0xe9e4da);
  for (const tx of [-0.95, 0.15]) {
    const tz = 0.95;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.3, 6), metal);
    leg.position.set(tx, 0.15, tz);
    g.add(leg);
    solids.push({ x: tx, z: tz, hx: 0.15, hz: 0.15, top: 0.32 });
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 14), top);
    disc.position.set(tx, 0.31, tz);
    disc.castShadow = true;
    g.add(disc);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.017, 0.035, 8), flat(0xffffff));
    cup.position.set(tx + 0.05, 0.338, tz);
    g.add(cup);
    for (const side of [-1, 1]) {
      const cx = tx + side * 0.32;
      const chair = new THREE.Group();
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.02, 0.17), wood);
      seat.position.y = 0.18;
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.2, 0.17), wood);
      back.position.set(side * 0.085, 0.29, 0);
      chair.add(seat, back);
      for (const [lx, lz] of [[-0.07, -0.07], [0.07, -0.07], [-0.07, 0.07], [0.07, 0.07]]) {
        const l = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.18, 4), metal);
        l.position.set(lx, 0.09, lz);
        chair.add(l);
      }
      chair.position.set(cx, 0, tz);
      chair.traverse((o) => { o.castShadow = true; });
      g.add(chair);
      // Face the table.
      seats.push({ pos: { x: cx, z: tz }, face: side > 0 ? -Math.PI / 2 : Math.PI / 2, y: 0.19, prop: 'coffee', laptop: true });
    }
  }

  // A table inside by the window, two chairs, for coffee and a laptop.
  {
    const tx = -0.6, tz = -0.6;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.3, 6), metal);
    leg.position.set(tx, 0.15, tz);
    g.add(leg);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.02, 14), top);
    disc.position.set(tx, 0.31, tz);
    disc.castShadow = true;
    g.add(disc);
    solids.push({ x: tx, z: tz, hx: 0.13, hz: 0.13, top: 0.32 });
    for (const side of [-1, 1]) {
      const cx = tx + side * 0.3;
      const seatM = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.16), wood);
      seatM.position.set(cx, 0.18, tz);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.2, 0.16), wood);
      back.position.set(cx + side * 0.08, 0.29, tz);
      g.add(seatM, back);
      for (const [lx, lz] of [[-0.06, -0.06], [0.06, -0.06], [-0.06, 0.06], [0.06, 0.06]]) {
        const l = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.18, 4), metal);
        l.position.set(cx + lx, 0.09, tz + lz);
        g.add(l);
      }
      seats.push({ pos: { x: cx, z: tz }, face: side > 0 ? -Math.PI / 2 : Math.PI / 2, y: 0.19, prop: 'coffee', laptop: true });
    }
  }
  solids.push({ x: -0.55, z: -D + T + 0.25, hx: 0.58, hz: 0.16, top: 0.45 });

  // Steam: a few soft puffs rising off the cups and the machine.
  const puffMat = new THREE.SpriteMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false });
  const puffs: { s: THREE.Sprite; base: THREE.Vector3; phase: number }[] = [];
  for (const base of [new THREE.Vector3(-0.9, 0.36, 0.95), new THREE.Vector3(0.2, 0.36, 0.95), new THREE.Vector3(-0.8, 0.7, -D + T + 0.22)]) {
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Sprite(puffMat.clone());
      s.scale.setScalar(0.05);
      g.add(s);
      puffs.push({ s, base, phase: i / 3 });
    }
  }

  const light = new THREE.PointLight(0xffc27a, 0, 3, 1.6);
  light.position.set(-0.45, 0.8, 0.6);
  g.add(light);

  let insideNow = false;
  return {
    group: g,
    seats,
    solids,
    doorLocal: new THREE.Vector3(0.75, 0, 1.5),
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
        for (const o of [...roofParts, sign, awning, valance, ...pendants]) o.visible = !on;
        for (const m of [cream, inner]) { m.transparent = on; m.opacity = on ? 0.28 : 1; m.depthWrite = !on; m.needsUpdate = true; }
        for (const w of walls) w.castShadow = !on;
      },
    },
    update(_dt, t) {
      for (const p of puffs) {
        const k = (t * 0.5 + p.phase) % 1;
        p.s.position.set(p.base.x + Math.sin(t * 2 + p.phase * 6) * 0.015, p.base.y + k * 0.22, p.base.z);
        p.s.scale.setScalar(0.03 + k * 0.06);
        (p.s.material as THREE.SpriteMaterial).opacity = 0.35 * (1 - k);
      }
    },
    setNight(night) {
      glow.emissiveIntensity = 0.12 + night * 0.5;
      lampMat.emissiveIntensity = 0.3 + night * 1.5;
      roomLight.intensity = 0.5 + night * 1.3;
      signMat.emissiveIntensity = 0.15 + night * 0.7;
      light.intensity = night * 1.4;
    },
  };
}
