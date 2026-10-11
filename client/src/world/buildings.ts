// One building per channel, assembled from Kenney's modular walls with a
// procedural roof. Size grows with activity; voice channels get a shade tree
// with chairs (ombu.ts), publications a stone hall with banners.

import * as THREE from 'three';
import { model } from './assets';
import { hashStr, rng, type District, type Slot } from './layout';
import { neonTrim } from './districts';
import type { WireGroup } from '../nostr/wire';
import { buildVoiceTree, type VoiceTree } from './ombu';

export const SPORTS_ROOFS = [0xe0662f, 0x2f9b8f, 0xf2b134, 0x3f6fc4];
export const GAMING_ROOFS = [0x2a1f4a, 0x3b1d5a, 0x1d2a5a, 0x4a1d3f];
export const ROOF_COLORS = [0x7b4bb3, 0xc8463d, 0x3f6fc4, 0xd9772e, 0x2f9b8f, 0xb8456f, 0x5a5fc9, 0xe0a33a];

/** Light a building's roof lime while its channel has a mention or reply for you. */
export function setRoofPing(b: Building, on: boolean, t: number): void {
  b.group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.name !== 'roof' || !m.isMesh) return;
    const mat = m.material as THREE.MeshStandardMaterial;
    mat.emissive.setHex(on ? 0xb4f953 : 0x000000);
    mat.emissiveIntensity = on ? 0.35 + Math.sin(t * 4) * 0.2 : 0;
  });
}

export interface Building {
  group: THREE.Group;
  /** Warm window panes, shown at night. */
  windows: THREE.Mesh[];
  /** Local-space door position (front, +z). */
  doorLocal: THREE.Vector3;
  height: number;
  roofColor: number;
  /** Voice channels: a shade tree with chairs instead of a house. */
  tree?: VoiceTree;
}

const windowGlow = new THREE.MeshBasicMaterial({ color: 0xffc56b, transparent: true, opacity: 0.95 });
const paneGeo = new THREE.PlaneGeometry(0.34, 0.34);

export function tierFor(count30d: number): number {
  if (count30d >= 60) return 3;
  if (count30d >= 20) return 2;
  if (count30d >= 5) return 1;
  return 0;
}

export function buildBuilding(g: WireGroup, slot: Slot, tier: number, district: District = 'plaza'): Building {
  const group = new THREE.Group();
  group.position.set(slot.pos.x, 0, slot.pos.z);
  group.rotation.y = slot.rot;
  const h = hashStr(g.id);
  const r = rng(h);
  const palette = district === 'sports' ? SPORTS_ROOFS : district === 'gaming' ? GAMING_ROOFS : ROOF_COLORS;
  const roofColor = palette[h % palette.length];
  const windows: THREE.Mesh[] = [];

  if (g.kind === 'voice' || g.kind === 'voice-sfu') {
    // Calls happen under a tree: chairs round the trunk, cushions in the channel's colour.
    const tree = buildVoiceTree(slot.w, roofColor, h);
    group.add(tree.group);
    return { group, windows, doorLocal: new THREE.Vector3(0, 0, slot.d / 2), height: tree.height, roofColor, tree };
  }

  const s = slot.w;
  const floors = Math.min(3, 1 + (tier >= 1 ? 1 : 0) + (tier >= 3 ? 1 : 0));
  const stone = g.kind === 'forum' || r() < 0.4;
  const doorX = s === 2 ? 0.5 : 0;

  // Foundation slab so buildings sit cleanly on the uneven grass.
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(s + 0.2, 0.18, s + 0.2),
    new THREE.MeshStandardMaterial({ color: stone ? 0xa59a8e : 0x8d7a66, flatShading: true }),
  );
  base.position.y = 0.04;
  base.receiveShadow = true;
  base.castShadow = true;
  group.add(base);

  const lift = 0.13;
  for (let f = 0; f < floors; f++) {
    const wood = !stone || f > 0;
    const prefix = wood ? 'town/wall-wood' : 'town/wall';
    for (let i = 0; i < s; i++) {
      const c = i - (s - 1) / 2;
      // Four sides: [rotation, cell centre]
      const sides: [number, number, number, boolean][] = [
        [-Math.PI / 2, c, 0, true], // front (+z)
        [Math.PI / 2, -c, 0, false], // back (−z)
        [0, c, 0, false], // right (+x)
        [Math.PI, c, 0, false], // left (−x)
      ];
      sides.forEach(([rot, cc], k) => {
        const isDoor = f === 0 && k === 0 && Math.abs(cc - doorX) < 0.01;
        const pick = r();
        const variant = isDoor ? '-door'
          : pick < 0.45 ? '-window-shutters' : pick < 0.65 ? '-window-glass' : pick < 0.75 ? '-window-round' : '';
        const piece = model(prefix + variant);
        const cell = new THREE.Group();
        cell.rotation.y = rot;
        // Each wall piece is a slab on the cell's +x edge; slide the cell so
        // that edge lands on the footprint's edge.
        piece.position.set((s - 1) / 2, 0, cc * (k === 1 || k === 3 ? 1 : 1));
        if (k === 0 || k === 1) piece.position.set((s - 1) / 2, 0, k === 0 ? -cc : cc);
        cell.add(piece);
        cell.position.y = lift + f;
        group.add(cell);
        if (variant.startsWith('-window')) {
          const pane = new THREE.Mesh(paneGeo, windowGlow);
          pane.position.set((s - 1) / 2 + 0.515, 0.55, piece.position.z);
          pane.rotation.y = Math.PI / 2;
          pane.visible = false;
          cell.add(pane);
          windows.push(pane);
        }
      });
    }
  }

  const top = lift + floors;
  const roofH = gableRoof(group, s, top, roofColor, r() < 0.5);
  if (r() < 0.7) {
    const ch = model('town/chimney');
    ch.position.set(-s / 2 + 0.45, top - 0.1, -s / 4);
    ch.scale.setScalar(0.9);
    group.add(ch);
  }
  if (g.kind === 'forum') {
    for (const x of [-s / 2 + 0.2, s / 2 - 0.2]) {
      const ban = model(r() < 0.5 ? 'town/banner-red' : 'town/banner-green');
      ban.position.set(x, lift + 0.2, s / 2 + 0.06);
      group.add(ban);
    }
  }
  // Lantern by the door.
  const lan = model('town/lantern');
  lan.position.set(doorX + (s === 2 ? -1.05 : 0.85), 0, s / 2 + 0.45);
  lan.scale.setScalar(0.55);
  group.add(lan);

  if (district === 'gaming') group.add(neonTrim(s, top - 0.02, h));
  return { group, windows, doorLocal: new THREE.Vector3(doorX, 0, s / 2 + 0.35), height: top + roofH, roofColor };
}

/** Low-poly gable roof with overhang, coloured per channel. */
function gableRoof(parent: THREE.Group, s: number, y: number, color: number, alongX: boolean): number {
  const over = 0.22;
  const w = s + over * 2;
  const rise = s * 0.36 + 0.25;
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(0, rise);
  shape.lineTo(w / 2, 0);
  shape.lineTo(w / 2 - 0.12, -0.08);
  shape.lineTo(0, rise - 0.16);
  shape.lineTo(-w / 2 + 0.12, -0.08);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: s + over * 2, bevelEnabled: false });
  geo.translate(0, 0, -(s + over * 2) / 2);
  const mat = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.75 });
  const roof = new THREE.Mesh(geo, mat);
  roof.name = 'roof';
  roof.position.y = y;
  if (alongX) roof.rotation.y = Math.PI / 2;
  roof.castShadow = true;
  roof.receiveShadow = true;
  parent.add(roof);

  // Gable end walls (triangles) so the roof isn't hollow from the side.
  const tri = new THREE.Shape();
  tri.moveTo(-s / 2, 0);
  tri.lineTo(0, rise - 0.2);
  tri.lineTo(s / 2, 0);
  tri.closePath();
  const tgeo = new THREE.ShapeGeometry(tri);
  const tmat = new THREE.MeshStandardMaterial({ color: 0xe8dcc8, flatShading: true, side: THREE.DoubleSide });
  for (const z of [-s / 2, s / 2]) {
    const t = new THREE.Mesh(tgeo, tmat);
    t.position.set(0, y, z);
    const holder = new THREE.Group();
    holder.add(t);
    if (alongX) holder.rotation.y = Math.PI / 2;
    t.castShadow = true;
    parent.add(holder);
  }
  return rise;
}

/** Voice channels: an open pavilion with a domed roof — people gather here. */
