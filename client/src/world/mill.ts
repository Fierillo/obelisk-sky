// The watermill: a small stone-and-timber mill house on the bank, its axle
// out through the wall to a paddle wheel standing in the current, turning
// with the water (bottom moving downstream) and throwing a little spray.
// Placement is layout.ts `millSite`; this file only builds and animates.
//
// Local frame: origin on the river centreline, +X across the river toward
// the house's bank (the axle), +Z along the bank, y up. The wheel is the
// Kenney `watermill-wide` paddle wheel (axle along its local X, radius 0.9).

import * as THREE from 'three';
import { MILL, type MillSite } from './layout';
import { model } from './assets';

const WATER_Y = -0.13;

export interface Mill {
  group: THREE.Group;
  update(dt: number, t: number): void;
  setNight(night: number): void;
}

const flat = (color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true, ...opts });

/** Lime-washed plaster between dark timbers, drawn once. */
function timberTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e9e1cf';
  g.fillRect(0, 0, 256, 256);
  // Plaster blotches.
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(${150 + Math.random() * 40},${140 + Math.random() * 30},${110 + Math.random() * 30},${0.05 + Math.random() * 0.06})`;
    g.beginPath();
    g.arc(Math.random() * 256, Math.random() * 256, 3 + Math.random() * 10, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#4a3121';
  g.fillRect(0, 0, 256, 16);
  g.fillRect(0, 240, 256, 16);
  g.fillRect(0, 120, 256, 12);
  for (const x of [0, 120, 240]) g.fillRect(x, 0, 16, 256);
  // Braces.
  g.strokeStyle = '#4a3121';
  g.lineWidth = 10;
  g.beginPath();
  g.moveTo(16, 120); g.lineTo(120, 16);
  g.moveTo(136, 16); g.lineTo(240, 120);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function stoneTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#6f6a62';
  g.fillRect(0, 0, 256, 128);
  for (let row = 0; row < 6; row++) {
    let x = row % 2 ? -18 : 0;
    while (x < 256) {
      const w = 26 + Math.random() * 26;
      const l = 48 + Math.random() * 18;
      g.fillStyle = `hsl(${30 + Math.random() * 15}, ${6 + Math.random() * 8}%, ${l}%)`;
      g.beginPath();
      g.roundRect(x + 2, row * 21.3 + 2, w - 4, 17, 5);
      g.fill();
      x += w;
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function buildMill(site: MillSite, halfWidth: number): Mill {
  const g = new THREE.Group();
  g.position.set(site.at.x, 0, site.at.z);
  g.rotation.y = site.rot;

  const houseX = halfWidth + 0.25 + MILL.houseDepth / 2;
  const D = MILL.houseDepth, W = MILL.houseWidth;
  const baseH = 0.5, wallH = 0.75;

  // Stone base, deep enough to sit into the carved bank.
  const stoneTex = stoneTexture();
  stoneTex.repeat.set(2, 1);
  const stone = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 1 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(D + 0.08, baseH + 0.4, W + 0.08), stone);
  base.position.set(houseX, baseH / 2 - 0.2, 0);
  base.castShadow = base.receiveShadow = true;
  g.add(base);

  // Timber-framed upper walls.
  const plasterTex = timberTexture();
  const plaster = new THREE.MeshStandardMaterial({ map: plasterTex, roughness: 0.95 });
  const walls = new THREE.Mesh(new THREE.BoxGeometry(D, wallH, W), plaster);
  walls.position.set(houseX, baseH + wallH / 2, 0);
  walls.castShadow = walls.receiveShadow = true;
  g.add(walls);

  // Steep shingle roof, ridge along the bank.
  const roofMat = flat(0x7a3b2a, { roughness: 0.8 });
  const rise = 0.65, over = 0.14;
  const sh = new THREE.Shape();
  sh.moveTo(-D / 2 - over, 0);
  sh.lineTo(0, rise);
  sh.lineTo(D / 2 + over, 0);
  sh.lineTo(D / 2 + over - 0.08, -0.05);
  sh.lineTo(0, rise - 0.1);
  sh.lineTo(-D / 2 - over + 0.08, -0.05);
  sh.closePath();
  const roofGeo = new THREE.ExtrudeGeometry(sh, { depth: W + over * 2, bevelEnabled: false });
  roofGeo.translate(0, 0, -(W + over * 2) / 2);
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.set(houseX, baseH + wallH, 0);
  roof.castShadow = true;
  g.add(roof);
  // Gable ends.
  const gableShape = new THREE.Shape();
  gableShape.moveTo(-D / 2, 0);
  gableShape.lineTo(0, rise - 0.08);
  gableShape.lineTo(D / 2, 0);
  gableShape.closePath();
  for (const s of [-1, 1]) {
    const gable = new THREE.Mesh(new THREE.ShapeGeometry(gableShape), flat(0xe2d8c2, { side: THREE.DoubleSide }));
    gable.position.set(houseX, baseH + wallH, s * (W / 2 + 0.001));
    g.add(gable);
  }
  // Chimney on the land side.
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.5, 0.18), stone);
  chimney.position.set(houseX + D * 0.22, baseH + wallH + 0.45, W * 0.28);
  chimney.castShadow = true;
  g.add(chimney);

  // Door on the land side, windows on both long walls.
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.5, 0.3), flat(0x5a3a22));
  door.position.set(houseX + D / 2 + 0.01, 0.27, -W * 0.18);
  g.add(door);
  const step = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.4), stone);
  step.position.set(houseX + D / 2 + 0.1, 0.03, -W * 0.18);
  g.add(step);
  const glow = new THREE.MeshStandardMaterial({ color: 0x2a2018, emissive: 0xffb45a, emissiveIntensity: 0.05 });
  for (const [x, z] of [[houseX + D / 2 + 0.012, W * 0.22], [houseX - D / 2 - 0.012, -W * 0.25], [houseX - D / 2 - 0.012, W * 0.25]] as const) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.24, 0.22), glow);
    win.position.set(x, baseH + wallH * 0.5, z);
    g.add(win);
    const sill = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.28), flat(0x4a3121));
    sill.position.set(x, baseH + wallH * 0.5 - 0.14, z);
    g.add(sill);
  }

  // Axle from the river wall to the wheel, on a timber bearing.
  const wheelOff = halfWidth - MILL.wheelWidth / 2 - 0.04;
  const hubY = WATER_Y + MILL.wheelRadius - MILL.wheelRadius * 2 / 3 + 0.0; // a third of the wheel under water
  const axleLen = houseX - D / 2 - wheelOff + 0.05;
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, axleLen, 8), flat(0x3b2a1c));
  axle.rotation.z = Math.PI / 2;
  axle.position.set(wheelOff + axleLen / 2, hubY, 0);
  g.add(axle);
  const bearing = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.18), flat(0x4a3121));
  bearing.position.set(houseX - D / 2 - 0.06, hubY - 0.12, 0);
  g.add(bearing);

  // The wheel, in a pivot that spins about local X.
  const pivot = new THREE.Group();
  pivot.position.set(wheelOff, hubY, 0);
  const wheel = model('town/watermill-wide');
  wheel.scale.setScalar(MILL.wheelRadius / 0.9);
  pivot.add(wheel);
  g.add(pivot);

  // Spray where the paddles meet the water, and a ring of foam.
  const sprayN = 26;
  const sprayGeo = new THREE.BufferGeometry();
  const sprayPos = new Float32Array(sprayN * 3);
  const sprayLife = new Float32Array(sprayN).map(() => Math.random());
  const sprayVel = Array.from({ length: sprayN }, () => new THREE.Vector3());
  sprayGeo.setAttribute('position', new THREE.BufferAttribute(sprayPos, 3));
  const spray = new THREE.Points(sprayGeo, new THREE.PointsMaterial({ color: 0xeaf8ff, size: 0.05, transparent: true, opacity: 0.85, depthWrite: false }));
  g.add(spray);
  const foam = new THREE.Mesh(
    new THREE.RingGeometry(0.05, 0.42, 20),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  foam.rotation.x = -Math.PI / 2;
  foam.scale.set(MILL.wheelWidth / 0.84, 1, 1.5);
  foam.position.set(wheelOff, WATER_Y + 0.012, 0);
  g.add(foam);
  // Downstream, in local coordinates: the tangent rotated into the group.
  const down = new THREE.Vector3(site.t.x, 0, site.t.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), -site.rot);
  const respawn = (i: number) => {
    sprayLife[i] = 0;
    const along = (Math.random() - 0.5) * 0.2;
    sprayPos[i * 3] = wheelOff + (Math.random() - 0.5) * MILL.wheelWidth;
    sprayPos[i * 3 + 1] = WATER_Y + 0.02;
    sprayPos[i * 3 + 2] = along + down.z * 0.25;
    sprayVel[i].set((Math.random() - 0.5) * 0.3, 0.5 + Math.random() * 0.5, 0).addScaledVector(down, 0.4 + Math.random() * 0.4);
  };
  for (let i = 0; i < sprayN; i++) respawn(i);

  const spin = site.spin;
  return {
    group: g,
    update(dt: number, t: number) {
      // Paddles move at about the current's speed: ω = v / r.
      pivot.rotation.x += spin * dt * (0.55 / MILL.wheelRadius);
      for (let i = 0; i < sprayN; i++) {
        sprayLife[i] += dt * 1.4;
        if (sprayLife[i] >= 1) { respawn(i); continue; }
        sprayVel[i].y -= 2.2 * dt;
        sprayPos[i * 3] += sprayVel[i].x * dt;
        sprayPos[i * 3 + 1] = Math.max(WATER_Y, sprayPos[i * 3 + 1] + sprayVel[i].y * dt);
        sprayPos[i * 3 + 2] += sprayVel[i].z * dt;
      }
      sprayGeo.attributes.position.needsUpdate = true;
      (foam.material as THREE.MeshBasicMaterial).opacity = 0.28 + Math.sin(t * 5) * 0.06;
    },
    setNight(night: number) {
      glow.emissiveIntensity = 0.05 + night * 1.6;
    },
  };
}
