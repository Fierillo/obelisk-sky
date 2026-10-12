// The floating island itself: grass top, layered earth cross-section,
// rocky underside with roots, mountains, river, pond and waterfall.

import * as THREE from 'three';
import { distToPolyline, dist, rng, type IslandPlan, type Vec2 } from './layout';
import { fbm2, noise3 } from './noise';

const C = (hex: number) => new THREE.Color(hex);

export interface IslandMeshes {
  group: THREE.Group;
  /** The lawn's height (terrainHeight), gridded for fast reads. */
  heightAt: (p: Vec2) => number;
  water: THREE.ShaderMaterial[];
  riverPts: Vec2[];
  fallTop: THREE.Vector3;
  fallDir: THREE.Vector3;
}

export function buildIsland(plan: IslandPlan, footprints: { pos: Vec2; r: number }[]): IslandMeshes {
  const group = new THREE.Group();
  group.name = 'island';
  const water: THREE.ShaderMaterial[] = [];

  const riverPts = smoothRiver(plan);

  group.add(buildTop(plan, riverPts, footprints));
  const heightAt = heightGrid(plan, terrainHeight(plan, riverPts, footprints));
  group.add(buildSkirt(plan));
  group.add(buildRoots(plan));
  for (const m of plan.mountains) group.add(buildMountain(m.pos, m.r, m.h, plan.seed + Math.round(m.pos.x * 10)));

  // The river runs at about 0.55 units a second; the pond is still. They
  // meet on an exact circle (POND_EDGE past the shore): the pond draws
  // inside it, the river outside, and the river turns into the pond's own
  // surface as it gets there, so nothing overlaps and nothing jumps.
  const wmat = waterMaterial(0.55, plan.riverWidth * 1.24, plan.pond);
  const pmat = waterMaterial(0, 1, plan.pond);
  water.push(wmat, pmat);
  group.add(buildRiver(riverPts, plan.riverWidth, wmat));
  const pond = new THREE.Mesh(new THREE.CircleGeometry(plan.pond.r + POND_EDGE + 0.15, 64), pmat);
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(plan.pond.c.x, -0.13, plan.pond.c.z);
  pond.receiveShadow = true;
  group.add(pond);

  const end = riverPts[riverPts.length - 1];
  const prev = riverPts[riverPts.length - 6];
  const dir = new THREE.Vector3(end.x - prev.x, 0, end.z - prev.z).normalize();
  const th = Math.atan2(end.z, end.x);
  const edgeR = plan.radiusAt(th);
  const fallTop = new THREE.Vector3(Math.cos(th) * edgeR, -0.13, Math.sin(th) * edgeR);
  const fmat = waterfallMaterial();
  water.push(fmat);
  group.add(buildWaterfall(fallTop, dir, plan.riverWidth, fmat));

  return { group, heightAt, water, riverPts, fallTop, fallDir: dir };
}

/** The river polyline, smoothed once; the ground, the water and the loading
 *  screen's map all sample this. */
export function smoothRiver(plan: IslandPlan, points = 120): Vec2[] {
  const curve = new THREE.CatmullRomCurve3(plan.river.map((p) => new THREE.Vector3(p.x, 0, p.z)), false, 'catmullrom', 0.4);
  return curve.getSpacedPoints(points).map((v) => ({ x: v.x, z: v.z }));
}

// ── top surface ─────────────────────────────────────────────────────────

/**
 * A tiling close-up of turf, multiplied over the ground's vertex colours:
 * thousands of short strokes in lighter and darker greens-greys, a few
 * clover-like blobs and bare specks. Near-white on average, so the
 * vertex colours keep the large-scale look (dirt banks, sand, the plaza).
 */
let grassDetail: THREE.CanvasTexture | null | undefined;

/** The turf texture, drawn once and shared (the island top, lawns). */
export function grassDetailTexture(): THREE.CanvasTexture | null {
  if (grassDetail !== undefined) return grassDetail;
  grassDetail = drawGrassDetail();
  return grassDetail;
}

function drawGrassDetail(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = 'rgb(222,228,214)';
  g.fillRect(0, 0, S, S);
  const r = mulberry(91);
  // Soft mottling.
  for (let i = 0; i < 160; i++) {
    const x = r() * S, y = r() * S, rad = 10 + r() * 40;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    const l = r() < 0.5 ? 'rgba(170,185,150,0.18)' : 'rgba(250,252,240,0.16)';
    grd.addColorStop(0, l);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { g.save(); g.translate(ox, oy); g.fillRect(x - rad, y - rad, rad * 2, rad * 2); g.restore(); }
  }
  // Blade strokes, wrapped at the edges so the tile is seamless.
  g.lineCap = 'round';
  for (let i = 0; i < 9000; i++) {
    const x = r() * S, y = r() * S;
    const len = 4 + r() * 9, a = -Math.PI / 2 + (r() - 0.5) * 1.1;
    const shade = r();
    g.strokeStyle = shade < 0.5
      ? `rgba(${120 + r() * 40},${145 + r() * 40},${105 + r() * 30},${0.35 + r() * 0.3})`
      : `rgba(${235 + r() * 20},${245 + r() * 10},${215 + r() * 30},${0.3 + r() * 0.3})`;
    g.lineWidth = 0.8 + r() * 1.2;
    for (const ox of [0, x > S - 12 ? -S : 0]) for (const oy of [0, y < 12 ? S : 0]) {
      g.beginPath();
      g.moveTo(x + ox, y + oy);
      g.lineTo(x + ox + Math.cos(a) * len, y + oy + Math.sin(a) * len);
      g.stroke();
    }
  }
  // Clover clumps and a few bare specks.
  for (let i = 0; i < 70; i++) {
    const x = r() * S, y = r() * S;
    g.fillStyle = `rgba(${130 + r() * 30},${165 + r() * 30},${110 + r() * 20},0.45)`;
    for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(x + Math.cos(k * 2.1) * 2.5, y + Math.sin(k * 2.1) * 2.5, 2.4, 0, Math.PI * 2); g.fill(); }
  }
  for (let i = 0; i < 120; i++) {
    g.fillStyle = `rgba(${200 + r() * 30},${185 + r() * 25},${150 + r() * 25},0.5)`;
    g.fillRect(r() * S, r() * S, 1.5 + r() * 2, 1.5 + r() * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The lawn's height at p: a gentle roll, flattened round the plaza and sunk a
 *  little under every building (so floors drawn at ground level are never
 *  pierced), dipping into the river bed and the pond and off the rim. The
 *  mesh is built from this and walking reads it (World.groundAt), so feet
 *  stand on what is drawn. `f` is the fraction of the way to the rim
 *  (derived from p when left out). */
export function terrainHeight(plan: IslandPlan, river: Vec2[], footprints: { pos: Vec2; r: number }[]): (p: Vec2, f?: number) => number {
  return (p, f) => {
    let y = fbm2(p.x * 0.35, p.z * 0.35) * 0.08;
    // Eased over the last 0.4 of a footprint (no seam in the lawn).
    let sink = 0;
    for (const fp of footprints) sink = Math.max(sink, smooth(fp.r, fp.r - 0.4, dist(p, fp.pos)));
    const flat = smooth(plan.plaza.r + 0.9, plan.plaza.r + 0.5, dist(p, plan.plaza.c));
    y *= 1 - 0.85 * Math.max(flat, sink);
    if (sink > 0) y = y + (Math.min(y, 0) - BUILDING_SINK - y) * sink;
    const dr = distToPolyline(p, river);
    const w = plan.riverWidth * 0.62;
    if (dr < w + 0.3) y = Math.min(y, -0.34 * smooth(w + 0.3, w * 0.3, dr));
    const dp = dist(p, plan.pond.c);
    if (dp < plan.pond.r + 0.5) y = Math.min(y, -0.45 * smooth(plan.pond.r + 0.5, plan.pond.r * 0.4, dp));
    const fr = f ?? Math.hypot(p.x, p.z) / plan.radiusAt(Math.atan2(p.z, p.x));
    if (fr > 0.965) y -= (fr - 0.965) * 3.2;
    return y;
  };
}

/** `height` sampled once on a grid (cell metres) over the island, read back
 *  bilinearly: walking asks for the ground every frame for everyone. */
export function heightGrid(plan: IslandPlan, height: (p: Vec2) => number, cell = 0.125): (p: Vec2) => number {
  let R = 0;
  for (let a = 0; a < Math.PI * 2; a += 0.05) R = Math.max(R, plan.radiusAt(a));
  const n = Math.ceil((2 * R) / cell) + 2;
  const h = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) h[j * n + i] = height({ x: -R + i * cell, z: -R + j * cell });
  return (p) => {
    const fx = (p.x + R) / cell, fz = (p.z + R) / cell;
    const i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= n - 1 || j >= n - 1) return height(p);
    const tx = fx - i, tz = fz - j, k = j * n + i;
    const a = h[k] + (h[k + 1] - h[k]) * tx, b = h[k + n] + (h[k + n + 1] - h[k + n]) * tx;
    return a + (b - a) * tz;
  };
}

/** How far the lawn sits below 0 under a building (floors are drawn at ~0). */
export const BUILDING_SINK = 0.008;

function buildTop(plan: IslandPlan, river: Vec2[], footprints: { pos: Vec2; r: number }[]): THREE.Mesh {
  const NR = 46, NS = 200;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const grassA = C(0x5f9b3c), grassB = C(0x86bb4f), grassC = C(0x4c8a35), dirt = C(0xb39463), sand = C(0xd9c48f);
  const plazaC = C(0xd8c3a5), worn = C(0x9bbd5c);
  const tmp = new THREE.Color();

  const heightAt = terrainHeight(plan, river, footprints);
  const colorAt = (p: Vec2, out: THREE.Color) => {
    const n = fbm2(p.x * 0.18 + 10, p.z * 0.18);
    out.copy(grassA).lerp(grassB, THREE.MathUtils.clamp(n * 1.4 + 0.5, 0, 1));
    const patch = fbm2(p.x * 0.6, p.z * 0.6 + 3);
    if (patch > 0.28) out.lerp(grassC, 0.5);
    const dr = distToPolyline(p, river);
    if (dr < plan.riverWidth * 0.62 + 0.55) out.lerp(dirt, 0.7);
    const dp = dist(p, plan.pond.c);
    if (dp < plan.pond.r + 0.7) out.lerp(sand, 0.8);
    const dz = dist(p, plan.plaza.c);
    if (dz < plan.plaza.r) out.copy(plazaC).offsetHSL(0, 0, (noise3(p.x * 3, 0, p.z * 3)) * 0.04);
    else if (dz < plan.plaza.r + 0.6) out.lerp(worn, 0.5);
  };

  pos.push(0, heightAt({ x: 0, z: 0 }, 0), 0);
  colorAt({ x: 0, z: 0 }, tmp);
  col.push(tmp.r, tmp.g, tmp.b);
  for (let i = 1; i <= NR; i++) {
    const f = i / NR;
    for (let s = 0; s < NS; s++) {
      const th = (s / NS) * Math.PI * 2;
      const r = plan.radiusAt(th) * f;
      // Jitter interior vertices a little: breaks the polar-grid look.
      const jit = i < NR ? 0.12 : 0;
      const p = { x: Math.cos(th) * r + noise3(i, s, 1) * jit, z: Math.sin(th) * r + noise3(s, i, 2) * jit };
      pos.push(p.x, heightAt(p, f), p.z);
      colorAt(p, tmp);
      col.push(tmp.r, tmp.g, tmp.b);
    }
  }
  const ring = (i: number, s: number) => 1 + (i - 1) * NS + (s % NS);
  for (let s = 0; s < NS; s++) idx.push(0, ring(1, s + 1), ring(1, s));
  for (let i = 1; i < NR; i++) {
    for (let s = 0; s < NS; s++) {
      const a = ring(i, s), b = ring(i, s + 1), c = ring(i + 1, s), d = ring(i + 1, s + 1);
      idx.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  // World-space UVs for the grass detail texture (one tile ≈ 1.6 units).
  const uv: number[] = [];
  for (let i = 0; i < pos.length; i += 3) uv.push(pos[i] * 0.62, pos[i + 2] * 0.62);
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  // Smooth normals: the lawn rolls instead of showing its polar grid.
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, map: grassDetailTexture(), roughness: 0.95 }));
  mesh.receiveShadow = true;
  mesh.name = 'ground';
  return mesh;
}

// ── layered cross-section and underside ────────────────────────────────

const BANDS: { y: number; s: number; c: number; jag: number }[] = [
  { y: -0.02, s: 1.0, c: 0x5b9338, jag: 0 },
  { y: -0.32, s: 1.005, c: 0x5b9338, jag: 0.02 },
  { y: -0.34, s: 0.995, c: 0x5c3b25, jag: 0.03 },
  { y: -1.25, s: 0.99, c: 0x6d4529, jag: 0.05 },
  { y: -1.28, s: 0.985, c: 0x9a6236, jag: 0.06 },
  { y: -2.35, s: 0.975, c: 0x8c5730, jag: 0.06 },
  { y: -2.38, s: 0.97, c: 0xb87a45, jag: 0.06 },
  { y: -3.3, s: 0.955, c: 0xa96d3c, jag: 0.07 },
  { y: -3.33, s: 0.95, c: 0x6e4a35, jag: 0.1 },
  { y: -4.6, s: 0.88, c: 0x5e4232, jag: 0.14 },
  { y: -6.2, s: 0.72, c: 0x523a2e, jag: 0.18 },
  { y: -7.8, s: 0.52, c: 0x4a3429, jag: 0.2 },
  { y: -9.4, s: 0.32, c: 0x412e25, jag: 0.2 },
  { y: -10.9, s: 0.14, c: 0x3a2a22, jag: 0.15 },
  { y: -12.0, s: 0.0, c: 0x352620, jag: 0 },
];

function buildSkirt(plan: IslandPlan): THREE.Mesh {
  const NS = 200;
  const pos: number[] = [];
  const col: number[] = [];
  const pts: THREE.Vector3[][] = [];
  for (let b = 0; b < BANDS.length; b++) {
    const band = BANDS[b];
    const row: THREE.Vector3[] = [];
    for (let s = 0; s < NS; s++) {
      const th = (s / NS) * Math.PI * 2;
      const base = plan.radiusAt(th);
      const wob = 1 + noise3(Math.cos(th) * 3, b * 0.7, Math.sin(th) * 3) * band.jag;
      const r = b === 0 ? base : base * band.s * wob;
      const y = band.y + (b > 0 && b < BANDS.length - 1 ? noise3(s * 0.3, b, 0) * 0.08 : 0);
      row.push(new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r));
    }
    pts.push(row);
  }
  const c1 = new THREE.Color();
  for (let b = 0; b < BANDS.length - 1; b++) {
    c1.setHex(BANDS[b + 1].c);
    for (let s = 0; s < NS; s++) {
      const a = pts[b][s], bb = pts[b][(s + 1) % NS], c = pts[b + 1][s], d = pts[b + 1][(s + 1) % NS];
      for (const v of [a, bb, c, bb, d, c]) pos.push(v.x, v.y, v.z);
      const shade = 1 + noise3(s * 0.9, b * 2.1, 5) * 0.08;
      for (let k = 0; k < 6; k++) col.push(c1.r * shade, c1.g * shade, c1.b * shade);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'skirt';
  return mesh;
}

function buildRoots(plan: IslandPlan): THREE.Object3D {
  const r = rng(plan.seed + 9);
  const geo = new THREE.CylinderGeometry(0.025, 0.05, 1, 4, 3);
  geo.translate(0, -0.5, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    pos.setX(i, pos.getX(i) + Math.sin(y * 5) * 0.06);
  }
  geo.computeVertexNormals();
  const count = 140;
  const inst = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0x4a3324, flatShading: true }), count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  for (let i = 0; i < count; i++) {
    const th = r() * Math.PI * 2;
    const band = 2 + Math.floor(r() * 9); // anywhere along the cross-section
    const b = BANDS[Math.min(band, BANDS.length - 2)];
    const rad = plan.radiusAt(th) * b.s * (0.97 - r() * 0.05);
    q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3));
    m.compose(new THREE.Vector3(Math.cos(th) * rad, b.y + 0.1, Math.sin(th) * rad), q, new THREE.Vector3(1, 0.5 + r() * 1.8, 1));
    inst.setMatrixAt(i, m);
  }
  inst.castShadow = true;
  return inst;
}

// ── mountains ──────────────────────────────────────────────────────────

function buildMountain(p: Vec2, radius: number, h: number, seed: number): THREE.Mesh {
  const geo = new THREE.ConeGeometry(radius, h, 9, 6, false);
  geo.translate(0, h / 2 - 0.25, 0);
  const pos = geo.attributes.position;
  const r = rng(seed);
  const off = r() * 100;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (y > h - 0.3) continue; // keep the tip sharp
    const k = 1 + noise3(x * 0.8 + off, y * 0.6, z * 0.8) * 0.22;
    pos.setX(i, x * k);
    pos.setZ(i, z * k);
    pos.setY(i, y + noise3(x + off, y, z) * 0.25 * (y > 0.1 ? 1 : 0));
  }
  const flat = geo.toNonIndexed();
  const fp = flat.attributes.position;
  const col: number[] = [];
  const rock = C(0xa98593), rock2 = C(0xc3a1ab), snow = C(0xf6f1f4), base = C(0x6f9a4a);
  const c = new THREE.Color();
  for (let i = 0; i < fp.count; i += 3) {
    const y = (fp.getY(i) + fp.getY(i + 1) + fp.getY(i + 2)) / 3;
    const t = y / h;
    if (t > 0.68 + noise3(i, 0, 3) * 0.06) c.copy(snow);
    else if (t < 0.12) c.copy(base).lerp(rock, t * 4);
    else c.copy(rock).lerp(rock2, Math.max(0, noise3(i * 0.3, 1, 1)));
    for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
  }
  flat.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  flat.computeVertexNormals();
  const mesh = new THREE.Mesh(flat, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }));
  mesh.position.set(p.x, 0, p.z);
  mesh.rotation.y = r() * Math.PI;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// ── water ──────────────────────────────────────────────────────────────

/** Where the river hands over to the pond: this far past the pond's shore. */
export const POND_EDGE = 0.25;
/** Over this distance outside the pond the river becomes the pond's surface. */
export const POND_BLEND = 0.9;

/**
 * Water. The river (`flow > 0`) is drawn in its own frame: uv.x runs across
 * it (0 and 1 are the banks), uv.y is the distance along it, so ripples,
 * streaks and foam all travel downstream and foam gathers at the banks. The
 * pond has no current: its ripples drift in world space.
 *
 * With a pond, the two split the surface on the circle `pond.r + POND_EDGE`:
 * the pond material draws only inside it, the river only outside, and over
 * the last POND_BLEND the river shades exactly as the pond does.
 */
export function waterMaterial(flow = 0, width = 1, pond: { c: Vec2; r: number } | null = null): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 }, uDay: { value: 1 }, uFlow: { value: flow }, uWidth: { value: width },
      uPond: { value: new THREE.Vector3(pond?.c.x ?? 0, pond?.c.z ?? 0, pond ? pond.r + POND_EDGE : -1) },
      uBlend: { value: POND_BLEND },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vW;
      void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uDay; uniform float uFlow; uniform float uWidth; uniform vec3 uPond; uniform float uBlend;
      varying vec2 vUv; varying vec3 vW;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ return n(p) * 0.6 + n(p * 2.3 + 7.1) * 0.3 + n(p * 5.1 - 3.7) * 0.1; }
      // One water surface: q is the ripple frame, bank the distance to the
      // nearest bank (large for open water), current 1 for the river's
      // streaks and foam, 0 for still water. Alpha in w.
      vec4 surface(vec2 q, float bank, float current) {
        // Ripples stretched along the current; a second, finer layer.
        float a = fbm(vec2(q.x * 2.6, q.y * 1.1));
        float b = fbm(vec2(q.x * 5.0 + 3.0, q.y * 2.4 - uTime * 0.2));
        // Fake surface normal from the ripple field, for a sun glint.
        float e = 0.05;
        float ax = fbm(vec2((q.x + e) * 2.6, q.y * 1.1)), ay = fbm(vec2(q.x * 2.6, (q.y + e) * 1.1));
        vec3 nrm = normalize(vec3((a - ax) * 3.0, 1.0, (a - ay) * 3.0));
        vec3 view = normalize(cameraPosition - vW);
        vec3 sun = normalize(vec3(0.5, 0.8, 0.3));
        float glint = pow(max(dot(nrm, normalize(sun + view)), 0.0), 60.0);
        vec3 deep = vec3(0.10, 0.40, 0.55), shallow = vec3(0.32, 0.72, 0.78);
        float depth = smoothstep(0.0, 0.45, bank);
        vec3 col = mix(shallow, deep, depth * (0.55 + a * 0.45));
        // Streaks riding the current, and foam along the banks.
        float streak = smoothstep(0.66, 0.74, b) * mix(0.2, 0.35, current);
        float foam = current * (1.0 - smoothstep(0.0, 0.16, bank + (a - 0.5) * 0.12));
        col = mix(col, vec3(0.93, 0.98, 1.0), clamp(streak + foam * 0.8, 0.0, 1.0));
        col += glint * 0.55 * uDay;
        // Fresnel: shallower angles reflect more sky.
        float fres = pow(1.0 - max(view.y, 0.0), 3.0);
        col = mix(col, vec3(0.75, 0.88, 0.95), fres * 0.35 * uDay);
        col *= mix(0.16, 1.0, uDay);
        return vec4(col, mix(0.82, 0.95, max(depth, foam)));
      }
      void main() {
        vec2 still = vW.xz + vec2(uTime * 0.08, uTime * 0.05);
        float d = uPond.z > 0.0 ? distance(vW.xz, uPond.xy) : 1e3;
        if (uFlow <= 0.0) {
          // The pond: only inside the hand-over circle.
          if (uPond.z > 0.0 && d > uPond.z) discard;
          gl_FragColor = surface(still, 9.0, 0.0);
        } else {
          if (d <= uPond.z) discard;
          // River frame, in world units: x across, y downstream.
          vec2 q = vec2((vUv.x - 0.5) * uWidth, vUv.y);
          // Faster in the middle than at the banks.
          float across = abs(vUv.x - 0.5) * 2.0;
          q.y -= uTime * uFlow * (1.15 - across * across * 0.6);
          float bank = min(vUv.x, 1.0 - vUv.x) * uWidth;
          vec4 river = surface(q, bank, 1.0);
          // Nearing the pond, become the pond: at the circle they're identical.
          float k = 1.0 - smoothstep(uPond.z, uPond.z + uBlend, d);
          gl_FragColor = k > 0.0 ? mix(river, surface(still, 9.0, 0.0), k) : river;
        }
        #include <colorspace_fragment>
      }`,
  });
}

function buildRiver(pts: Vec2[], width: number, mat: THREE.Material): THREE.Mesh {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let along = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const t = new THREE.Vector2(b.x - a.x, b.z - a.z).normalize();
    const nrm = new THREE.Vector2(-t.y, t.x);
    const w = width * 0.62 + (i === 0 ? -0.3 : 0);
    if (i > 0) along += dist(pts[i], pts[i - 1]);
    pos.push(pts[i].x + nrm.x * w, -0.13, pts[i].z + nrm.y * w, pts[i].x - nrm.x * w, -0.13, pts[i].z - nrm.y * w);
    uv.push(0, along, 1, along);
    if (i > 0) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

function waterfallMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uDay: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uDay; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      void main(){
        float col = floor(vUv.x * 14.0);
        float speed = 0.9 + h(vec2(col, 1.0)) * 0.6;
        float s = fract(vUv.y * 3.0 + uTime * speed + h(vec2(col, 2.0)));
        float streak = smoothstep(0.0, 0.25, s) * (1.0 - smoothstep(0.55, 1.0, s));
        vec3 c = mix(vec3(0.42, 0.78, 0.86), vec3(0.95, 1.0, 1.0), streak * 0.7);
        float edge = smoothstep(0.0, 0.12, vUv.x) * (1.0 - smoothstep(0.88, 1.0, vUv.x));
        // Soft at the lip, where it takes over from the river, and fading below.
        float fade = smoothstep(0.0, 0.05, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
        c *= mix(0.35, 1.0, uDay);
        gl_FragColor = vec4(c, (0.65 + streak * 0.3) * edge * fade);
        #include <colorspace_fragment>
      }`,
  });
}

function buildWaterfall(top: THREE.Vector3, dir: THREE.Vector3, width: number, mat: THREE.Material): THREE.Mesh {
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const N = 24;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    // Spill over the lip, then fall in a gentle arc.
    const out = 0.25 + Math.sqrt(t) * 1.6;
    const y = top.y - t * t * 16 - t * 1.5;
    const c = top.clone().addScaledVector(dir, out).setY(y);
    const w = width * 0.6 * (1 + t * 0.6);
    pos.push(c.x + side.x * w, c.y, c.z + side.z * w, c.x - side.x * w, c.y, c.z - side.z * w);
    uv.push(0, t, 1, t);
    if (i > 0) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2;
  return mesh;
}

function smooth(e0: number, e1: number, x: number): number {
  const t = THREE.MathUtils.clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
