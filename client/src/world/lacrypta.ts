// La Crypta's house, from photos of its front in Buenos Aires: a red-brick
// Tudor front of two equal gables side by side, a downpipe between them;
// mullioned triple pointed-arch windows in pale stone frames (two tiers on
// the left bay, one on the right, a slit vent high in the right gable); a
// tall grey stone base under the left bay; the wooden arched door half a
// storey up on the right, reached by stone steps that curve down a grassy
// mound to the street, with a fairy-light rail and a round shrub by the door.
// La Crypta's arched, striped logo on the stone base is backlit; the orange
// "{(₿)}" sits on the lawn; red and violet uplights at night. No front fence.
//
// Local space: the facade is the plane z = 0 facing +z; the house is behind
// it, the mound and stairs in front of it.

import * as THREE from 'three';
import { grassDetailTexture } from './island';

const flat = (color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9, ...extra });

let brickCanvas: HTMLCanvasElement | null = null;

/** A brick texture (running bond, dark mortar, a little variation), repeated
 *  to fit a wall of w × h. The canvas is drawn once; each wall gets its own
 *  texture on it, since a repeat is per texture. */
function brickTexture(w = 1, h = 1): THREE.CanvasTexture {
  brickCanvas ??= drawBricks();
  const t = new THREE.CanvasTexture(brickCanvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(w * 1.6, h * 1.6);
  return t;
}

function drawBricks(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#3a2621';
  g.fillRect(0, 0, 256, 256);
  const bw = 32, bh = 12;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let row = 0; row < 256 / bh + 1; row++) {
    const off = row % 2 ? bw / 2 : 0;
    for (let col = -1; col < 256 / bw + 1; col++) {
      const l = 0.36 + rnd() * 0.1;
      const h = 0.025 + rnd() * 0.02;
      g.fillStyle = `hsl(${h * 360} ${48 + rnd() * 12}% ${l * 100}%)`;
      g.fillRect(col * bw + off + 1, row * bh + 1, bw - 2, bh - 2);
    }
  }
  return c;
}

/** A pointed (gothic) arch outline of width w and total height h. */
function lancet(w: number, h: number): THREE.Shape {
  const s = new THREE.Shape();
  const r = w; // equilateral arch
  const spring = h - w * 0.87;
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, spring);
  s.absarc(-w / 2, spring, r, 0, Math.PI / 3, false);
  s.absarc(w / 2, spring, r, (Math.PI * 2) / 3, Math.PI, false);
  s.lineTo(-w / 2, 0);
  return s;
}

export interface LaCryptaHouse {
  group: THREE.Group;
  /** 0 day … 1 night. */
  setNight(night: number, t: number): void;
  doorLocal: THREE.Vector3;
}

export function buildLaCryptaHouse(): LaCryptaHouse {
  const g = new THREE.Group();
  const stone = flat(0xd8d2c7, { roughness: 0.8 });
  const baseStone = flat(0xb9b4ab, { roughness: 0.95 });
  const slate = flat(0x4a4038, { roughness: 0.75 });
  const grass = new THREE.MeshStandardMaterial({ color: 0x6aa443, map: grassDetailTexture(), roughness: 1 });
  const step = flat(0x7d776f, { roughness: 0.9 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x1e1a1c, emissive: 0xff7a40, emissiveIntensity: 0.08, roughness: 0.25, metalness: 0.2, side: THREE.DoubleSide });
  const woodDoor = new THREE.MeshStandardMaterial({ color: 0x7a4a2c, emissive: 0xffb060, emissiveIntensity: 0, roughness: 0.7, flatShading: true, side: THREE.DoubleSide });

  const W = 2.9;            // facade width: two bays
  const bay = W / 2;
  const D = 2.1;            // depth behind the facade
  const lift = 0.7;         // the raised ground floor (top of the stone base)
  const eaves = lift + 2.0; // where the gables start
  const rise = 1.15;        // gable height
  const L = -bay / 2, R = bay / 2; // bay centres

  const brickBox = (w: number, h: number, d: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ map: brickTexture(w, h), roughness: 0.95 }));
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };
  const gableRoof = (w: number, depth: number) => {
    const over = 0.1;
    const sh = new THREE.Shape();
    sh.moveTo(-w / 2 - over, 0);
    sh.lineTo(0, rise);
    sh.lineTo(w / 2 + over, 0);
    sh.lineTo(w / 2 + over - 0.09, -0.06);
    sh.lineTo(0, rise - 0.12);
    sh.lineTo(-w / 2 - over + 0.09, -0.06);
    sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth: depth + over, bevelEnabled: false });
    geo.translate(0, 0, -depth);
    const m = new THREE.Mesh(geo, slate);
    m.castShadow = true;
    return m;
  };
  const gableWall = (w: number) => {
    const sh = new THREE.Shape();
    sh.moveTo(-w / 2, 0);
    sh.lineTo(0, rise - 0.06);
    sh.lineTo(w / 2, 0);
    sh.closePath();
    const geo = new THREE.ShapeGeometry(sh);
    const pos = geo.attributes.position;
    const uv: number[] = [];
    for (let i = 0; i < pos.count; i++) uv.push(pos.getX(i) / w + 0.5, pos.getY(i) / rise);
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: brickTexture(w, rise), roughness: 0.95, side: THREE.DoubleSide }));
    m.castShadow = true;
    return m;
  };
  /** A mullioned window: n pointed lights in a stone frame, a transom bar,
   *  a hood moulding above. Bottom-centre at (x, y) on the facade. */
  const windowN = (x: number, y: number, n: number, lightW: number, h: number) => {
    const gap = 0.045;
    const fw = n * lightW + (n + 1) * gap;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(fw + 0.06, h + 0.08, 0.06), stone);
    frame.position.set(x, y + h / 2, 0.02);
    frame.castShadow = true;
    g.add(frame);
    for (let i = 0; i < n; i++) {
      const cx = x - fw / 2 + gap + lightW / 2 + i * (lightW + gap);
      const glass = new THREE.Mesh(new THREE.ShapeGeometry(lancet(lightW, h - 0.06), 6), glassMat);
      glass.position.set(cx, y + 0.03, 0.055);
      g.add(glass);
    }
    const transom = new THREE.Mesh(new THREE.BoxGeometry(fw, 0.035, 0.04), stone);
    transom.position.set(x, y + h * 0.66, 0.065);
    g.add(transom);
    const hood = new THREE.Mesh(new THREE.BoxGeometry(fw + 0.16, 0.05, 0.1), stone);
    hood.position.set(x, y + h + 0.07, 0.04);
    g.add(hood);
  };

  // The house: two brick bays with a gable each, side by side.
  for (const cx of [L, R]) {
    const body = brickBox(bay, eaves, D);
    body.position.set(cx, eaves / 2, -D / 2);
    g.add(body);
    const roof = gableRoof(bay, D);
    roof.position.set(cx, eaves, 0.02);
    g.add(roof);
    const wall = gableWall(bay);
    wall.position.set(cx, eaves, 0.003);
    g.add(wall);
  }
  // Tall grey stone base under the left bay, a lower band under the right.
  const baseL = new THREE.Mesh(new THREE.BoxGeometry(bay + 0.02, lift, 0.08), baseStone);
  baseL.position.set(L, lift / 2, 0.03);
  baseL.receiveShadow = true;
  g.add(baseL);
  const sill = new THREE.Mesh(new THREE.BoxGeometry(W + 0.04, 0.06, 0.12), stone);
  sill.position.set(0, lift + 0.03, 0.05);
  g.add(sill);

  // Windows as in the photo.
  windowN(L, lift + 0.25, 3, 0.16, 0.7);  // left, ground floor
  windowN(L, lift + 1.3, 3, 0.15, 0.6);   // left, upper floor
  windowN(R + 0.12, lift + 1.25, 3, 0.15, 0.62); // right, upper floor
  const vent = new THREE.Mesh(new THREE.ShapeGeometry(lancet(0.08, 0.26), 6), glassMat);
  vent.position.set(R, eaves + 0.45, 0.01);
  g.add(vent);
  // Narrow side-bay windows on the left corner.
  for (const y of [lift + 0.25, lift + 1.3]) {
    const side = new THREE.Mesh(new THREE.ShapeGeometry(lancet(0.13, 0.6), 6), glassMat);
    side.position.set(-W / 2 - 0.003, y, -0.5);
    side.rotation.y = -Math.PI / 2;
    g.add(side);
  }

  // The wooden arched door, half a storey up, in a stone surround.
  const doorX = R - 0.25;
  const surround = new THREE.Mesh(new THREE.ShapeGeometry(lancet(0.56, 0.95), 8), stone);
  surround.position.set(doorX, lift, 0.02);
  g.add(surround);
  const door = new THREE.Mesh(new THREE.ShapeGeometry(lancet(0.42, 0.82), 8), woodDoor);
  door.position.set(doorX, lift, 0.03);
  g.add(door);
  const landing = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.4), step);
  landing.position.set(doorX, lift - 0.03, 0.2);
  landing.receiveShadow = true;
  g.add(landing);

  // White downpipe between the bays.
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, eaves - 0.2, 6), flat(0xe6e4df));
  pipe.position.set(0.02, (eaves - 0.2) / 2 + 0.1, 0.06);
  g.add(pipe);

  // The grassy mound: from the door's level down to the street, in front
  // of the right bay and tapering across the left.
  const moundDepth = 2.0;
  {
    const nx = 14, nz = 10;
    const pos: number[] = [];
    const idx: number[] = [];
    const x0 = -W / 2, x1 = W / 2 + 0.3;
    const height = (x: number, z: number) => {
      // Highest under the door, falling to the street and to the left.
      const across = THREE.MathUtils.clamp((x - (L - 0.2)) / (doorX - (L - 0.2)), 0, 1);
      const out = 1 - z / moundDepth;
      // Both side edges come down to the ground (no lip hanging in the air).
      const edge = Math.min(1, (x - x0) / 0.45, (x1 - x) / 0.45);
      const e = edge * edge * (3 - 2 * edge);
      return Math.max(0, lift * Math.pow(out, 1.15) * (0.25 + 0.75 * across) * e);
    };
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const x = x0 + (x1 - x0) * (i / nx), z = 0.12 + (moundDepth - 0.12) * (j / nz);
      pos.push(x, height(x, z) + 0.01, z);
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    // Same turf as the island around it: world-ish UVs, smooth normals.
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(pos.flatMap((v, k) => (k % 3 === 1 ? [] : [v * 0.62])), 2));
    geo.computeVertexNormals();
    const mound = new THREE.Mesh(geo, grass);
    mound.receiveShadow = true;
    g.add(mound);
  }

  // Curved stone steps, as seen from the street: down from the door with a
  // slight bow to the right, then sweeping to the left at the bottom.
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(doorX, 0, 0.3),
    new THREE.Vector3(doorX + 0.1, 0, 0.7),
    new THREE.Vector3(doorX + 0.06, 0, 1.15),
    new THREE.Vector3(doorX - 0.2, 0, 1.6),
    new THREE.Vector3(doorX - 0.55, 0, moundDepth + 0.05),
  ]);
  const N = 11;
  const railPts: THREE.Vector3[] = [];
  for (let i = 0; i < N; i++) {
    const t0 = i / N, t1 = (i + 1) / N;
    const a = path.getPoint(t0), b = path.getPoint(t1);
    const mid = a.clone().lerp(b, 0.5);
    const yTop = lift * (1 - (i + 0.5) / N);
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.46, Math.max(0.05, yTop), a.distanceTo(b) + 0.02), step);
    st.position.set(mid.x, Math.max(0.05, yTop) / 2, mid.z);
    st.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
    st.castShadow = true;
    st.receiveShadow = true;
    g.add(st);
    // Rail on the left of the steps (as you walk up).
    const tan = b.clone().sub(a).normalize();
    railPts.push(mid.clone().add(new THREE.Vector3(tan.z, 0, -tan.x).multiplyScalar(-0.3)).setY(yTop + 0.38));
  }
  const railCurve = new THREE.CatmullRomCurve3(railPts);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(railCurve, 30, 0.011, 5), flat(0x161616)));
  for (const k of [0, 4, 8, N - 1]) {
    const p = railPts[k];
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.4, 5), flat(0x161616));
    post.position.set(p.x, p.y - 0.2, p.z);
    g.add(post);
  }
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff2c4, emissive: 0xffd77a, emissiveIntensity: 1 });
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.016, 6, 4), bulbMat, 24);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 24; i++) bulbs.setMatrixAt(i, m4.makeTranslation(railCurve.getPoint(i / 23).add(new THREE.Vector3(0, -0.015, 0))));
  g.add(bulbs);

  // The round shrub by the door, on a short trunk.
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 0.3, 5), flat(0x4a3526));
  trunk.position.set(doorX - 0.62, lift * 0.62 + 0.15, 0.55);
  g.add(trunk);
  const shrub = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 1), flat(0x3d7a3a));
  shrub.scale.set(1.15, 0.9, 1);
  shrub.position.set(doorX - 0.62, lift * 0.62 + 0.42, 0.55);
  shrub.castShadow = true;
  g.add(shrub);

  // La Crypta's logo on the stone base, backlit: an arched white plaque
  // with three black bars.
  const logoGlow = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, emissive: 0xfff6e6, emissiveIntensity: 0.25, flatShading: true });
  const logoX = L - 0.18, logoY = 0.12;
  const logo = new THREE.Mesh(new THREE.ShapeGeometry(roundArch(0.36, 0.44), 10), logoGlow);
  logo.position.set(logoX, logoY, 0.075);
  g.add(logo);
  for (let i = 0; i < 3; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.28 - i * 0.02, 0.04, 0.01), flat(0x161616));
    bar.position.set(logoX + 0.02 + i * 0.01, logoY + 0.07 + i * 0.075, 0.082);
    g.add(bar);
  }
  const logoLight = new THREE.PointLight(0xfff3dc, 0, 1.4, 1.6);
  logoLight.position.set(logoX, logoY + 0.22, 0.32);
  g.add(logoLight);

  // The orange "{(₿)}" on the lawn, right of the steps.
  const sc = document.createElement('canvas');
  sc.width = 512;
  sc.height = 160;
  const sg = sc.getContext('2d')!;
  sg.fillStyle = '#ff6a1a';
  sg.font = '800 128px Inter, system-ui, sans-serif';
  sg.textAlign = 'center';
  sg.textBaseline = 'middle';
  sg.fillText('{(₿)}', 256, 86);
  const signTex = new THREE.CanvasTexture(sc);
  signTex.colorSpace = THREE.SRGBColorSpace;
  const signMat = new THREE.MeshStandardMaterial({ map: signTex, transparent: true, emissive: 0xff5a10, emissiveMap: signTex, emissiveIntensity: 0.6, side: THREE.DoubleSide });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.25), signMat);
  sign.position.set(W / 2 + 0.15, 0.95, 0.8);
  sign.rotation.x = -0.15;
  g.add(sign);
  // Two thin posts hold it up off the slope.
  for (const dx of [-0.13, 0.13]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.85, 5), flat(0x161616));
    post.position.set(sign.position.x + dx, 0.45, sign.position.z - 0.02);
    g.add(post);
  }

  // Night: warm windows and door, red by the door, violet wash up the gables.
  const red = new THREE.PointLight(0xff2a3a, 0, 2.4, 1.6);
  red.position.set(doorX - 0.45, lift + 0.25, 0.55);
  const violet = new THREE.SpotLight(0x7a6aff, 0, 7, Math.PI / 4.5, 0.6, 1.2);
  violet.position.set(0, 0.1, 1.6);
  violet.target.position.set(0, eaves, 0);
  const signLight = new THREE.PointLight(0xff6a1a, 0, 1.6, 1.8);
  signLight.position.set(W / 2 + 0.15, 1.05, 1.05);
  g.add(red, violet, violet.target, signLight);

  return {
    group: g,
    doorLocal: new THREE.Vector3(doorX - 0.6, 0, moundDepth + 0.3),
    setNight(night: number, t: number) {
      glassMat.emissiveIntensity = 0.08 + night * 0.9;
      woodDoor.emissiveIntensity = night * 0.18;
      bulbMat.emissiveIntensity = 0.4 + night * (1.6 + Math.sin(t * 3) * 0.25);
      logoGlow.emissiveIntensity = 0.3 + night * 0.5;
      logoLight.intensity = night * 0.35;
      signMat.emissiveIntensity = 0.5 + night * 1.1;
      red.intensity = night * 1.1;
      violet.intensity = night * 6;
      signLight.intensity = night * 0.9;
    },
  };
}

/** A round-topped arch (the La Crypta plaque) of width w, height h. */
function roundArch(w: number, h: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, h - w / 2);
  s.absarc(0, h - w / 2, w / 2, 0, Math.PI, false);
  s.lineTo(-w / 2, 0);
  return s;
}
