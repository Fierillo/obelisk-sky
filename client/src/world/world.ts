// The village: builds the scene from the island plan and the channel list,
// and turns Director commands into walking, talking, sitting and effects.

import * as THREE from 'three';
import { shortNpub } from '../nostr/sanitize';
import type { WireGroup, WireMessage, WireProfile } from '../nostr/wire';
import { renderContent } from '../ui/content';
import { model } from './assets';
import { buildBuilding, tierFor, type Building } from './buildings';
import { Cameraman } from './cameraman';
import { Character, pubkeyColor, CHAR_HEIGHT, PERSON_SCALE, SIT_SEAT_HEIGHT, registerClip } from './character';
import { buildExerciseClip, repsDone, type ExerciseKind } from './anim/exercises';
import { buildPerson } from '../people/people';
import type { Command } from './director';
import { buildIsland, type IslandMeshes } from './island';
import {
  assignByDistrict, buildNavGrid, circleSpots, dist, distToPolyline, hashStr, inFootprint, onTrack, planIsland, rng, trackSite,
  type District, type IslandPlan, type NavGrid, type Slot, type Vec2,
  millSite, type MillSite,
} from './layout';
import { fbm2 } from './noise';
import { CALISTHENICS_STATIONS, buildArcadeCabinet, buildCalisthenics, buildChoripan, buildCup, buildLaptop, buildMate, buildTrack, trackLap } from './districts';
import { buildObelisk, type Obelisk } from './obelisk';
import { Overlay } from './overlay';
import { Pet, buildHat } from './pet';
import { LANDMARKS, reserveLandmarkSlots, type LandmarkBuild, type LandmarkId, type SeatProp } from './landmarks';
import { buildMill, type Mill } from './mill';
import type { Avatar } from '../nostr/avatars';
import { parseSpot, seatSpotId, stationSpotId, type Activity, type Claim } from '../nostr/activity';
import { extrapolate, type Motion } from '../nostr/motion';
import { RUN_SPEED as PLAYER_RUN, WALK_SPEED as PLAYER_WALK, type Solid } from '../player/controller';
import { Post } from './post';
import { PropBatch } from './props';
import { Sky, type TimeOverride } from './sky';
import type { Prefs } from '../prefs';

interface ConvoSpot { center: Vec2; groupId: string; members: string[]; fire: THREE.Object3D | null; sitting: boolean }

interface Effect { obj: THREE.Object3D; age: number; life: number; tick: (e: Effect, dt: number) => void }

export interface Seat { pos: Vec2; face: number; y: number; taken: string | null; dynamic?: boolean; prop?: SeatProp; landmark?: LandmarkId; laptop?: boolean; indoor?: boolean }

/** A place to train in the sports park (see districts.ts CALISTHENICS_STATIONS). */
export interface Station { pos: Vec2; face: number; grip: number; half?: number; kinds: ExerciseKind[]; taken: string | null }

export interface WorldHooks {
  onSay?: (pk: string, groupId: string, text: string, to: string | null, instant: boolean) => void;
  onPersonClick?: (pk: string) => void;
  onGroupClick?: (groupId: string) => void;
  onZap?: () => void;
  onArrive?: () => void;
  onGroundClick?: (p: Vec2) => void;
  onGameClick?: (gameId: string) => void;
  onLandmarkClick?: (id: LandmarkId) => void;
  onBubbleClick?: (msgId: string) => void;
}

/** Farther than this (or with no path) a claimed person fades across instead of running. */
const CLAIM_RUN_RANGE = 30;
/** Live movement: seconds without an update before someone stops being live. */
const MOVER_STALE_S = 75;
/** How far past a key-walker's last update to keep them walking (s). */
const MOVER_LEAD_S = 2.5;
/** Farther than this from where they really are: fade across. */
const MOVER_BLINK_M = 4;

const TREE_MODELS = ['nature/tree_default', 'nature/tree_oak', 'nature/tree_fat', 'nature/tree_detailed', 'nature/tree_cone',
  'nature/tree_pineDefaultA', 'nature/tree_pineRoundA', 'nature/tree_pineTallA', 'nature/tree_default', 'nature/tree_oak',
  'nature/tree_oak_fall', 'nature/tree_fat_fall'];
const FLOWERS = ['nature/flower_redA', 'nature/flower_yellowA', 'nature/flower_purpleA', 'nature/flower_redB', 'nature/flower_yellowB', 'nature/flower_purpleB'];
const BUSHES = ['nature/plant_bush', 'nature/plant_bushLarge', 'nature/plant_bushDetailed', 'nature/plant_bushSmall'];
const GRASS = ['nature/grass', 'nature/grass_large', 'nature/grass_leafs'];
const ROCKS = ['nature/rock_largeA', 'nature/rock_largeB', 'nature/rock_tallA', 'nature/rock_smallA', 'nature/rock_smallB', 'nature/stone_smallA'];

/** Height of `personAnchor` above the ground a person stands on. */
export const ANCHOR_Y = 0.5;

export class World {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly cam: Cameraman;
  readonly sky: Sky;
  readonly post: Post;
  readonly overlay: Overlay;
  readonly plan: IslandPlan;
  private island!: IslandMeshes;
  private grid!: NavGrid;
  private bridges: Vec2[] = [];
  private pathCells = new Set<number>();
  private staticRoot = new THREE.Group();
  private buildingRoot = new THREE.Group();
  readonly groups = new Map<string, WireGroup>();
  private slotOf = new Map<string, number>();
  readonly buildings = new Map<string, Building>();
  readonly people = new Map<string, Character>();
  private leaving = new Set<Character>();
  readonly profiles = new Map<string, WireProfile>();
  private convoOf = new Map<string, number>();
  private convos = new Map<number, ConvoSpot>();
  private pendingSit = new Set<string>();
  private effects: Effect[] = [];
  private swaying: THREE.InstancedMesh[] = [];
  private lampGlow: THREE.MeshStandardMaterial;
  private lampLights: THREE.PointLight[] = [];
  private obelisk!: Obelisk;
  private pulse = 0;
  private fireflies!: THREE.Points;
  private homeward = new Map<string, number>(); // pk → seconds left inside
  private clock = new THREE.Clock();
  private elapsed = 0;
  private raycaster = new THREE.Raycaster();
  private wanderRng = rng(99);
  hooks: WorldHooks = {};
  /** The signed-in viewer's own character, steered by the controller. */
  playerPk: string | null = null;
  /** Channel → themed district (sky-only config, see nostr/themes.ts). */
  private districtOf = new Map<string, District>();
  readonly track: { c: Vec2; rot: number } | null;
  private lastActivity = new Map<string, number>();
  private districtRoot = new THREE.Group();
  private gameRoot = new THREE.Group();
  /** Places to sit (and drink mate). */
  readonly seats: Seat[] = [];
  private seatOf = new Map<string, Seat>();
  /** Furniture the player bumps into but can jump onto (see PlayerController). */
  readonly solids: Solid[] = [];
  private laptops = new Map<string, THREE.Object3D>();
  readonly stations: Station[] = [];
  private trainingAt = new Map<string, { station: Station; kind: ExerciseKind; since: number }>();
  /** Slots held by landmarks (La Crypta, the nostr-wot HQ, the café, the parrilla). */
  readonly landmarkSlots: Map<LandmarkId, Slot>;
  private landmarks = new Map<LandmarkId, LandmarkBuild>();
  private millSite: MillSite | null = null;
  private mill: Mill | null = null;
  private avatars = new Map<string, Avatar>();
  private pets = new Map<string, Pet>();
  private built = false;

  constructor(private canvas: HTMLCanvasElement, overlayEl: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.08, 900);
    this.cam = new Cameraman(this.camera, canvas);
    this.sky = new Sky(this.scene);
    this.post = new Post(this.renderer, this.scene, this.camera, this.sky.sun);
    this.overlay = new Overlay(overlayEl, this.camera);
    this.plan = planIsland();
    this.track = trackSite(this.plan);
    // Landmarks hold their slots before any channel is placed; channels never get them.
    this.landmarkSlots = reserveLandmarkSlots(
      this.plan.slots.filter((s) => !this.track || !onTrack(s.pos, this.track, s.w * 0.7 + 0.6)),
      this.plan.plaza.c,
    );
    this.lampGlow = new THREE.MeshStandardMaterial({ color: 0xffe2a8, emissive: 0xffb84d, emissiveIntensity: 0 });
    this.scene.add(this.staticRoot, this.buildingRoot, this.districtRoot, this.gameRoot);
    this.installPicking();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Narrow screens: widen the lens so the island still fits.
    this.camera.fov = w < h ? 46 : 32;
    this.camera.updateProjectionMatrix();
    this.post.setSize(w, h);
  }

  // ── building the village ──────────────────────────────────────────────

  setGroups(groups: WireGroup[], activity: Map<string, number>): void {
    const ids = new Set(groups.map((g) => g.id));
    for (const g of groups) this.groups.set(g.id, g);
    for (const id of [...this.groups.keys()]) if (!ids.has(id)) this.removeGroup(id);

    this.lastActivity = activity;
    // Themed districts first, then busiest nearest the plaza. Existing
    // channels never move; new ones take the best free slot for their theme.
    const used = new Set(this.slotOf.values());
    const fresh = [...ids].filter((id) => !this.slotOf.has(id));
    if (fresh.length) {
      const held = new Set([...this.landmarkSlots.values()].map((sl) => sl.index));
      const freePlan = { ...this.plan, slots: this.plan.slots.filter((s) => !used.has(s.index) && !held.has(s.index)) };
      const order = assignByDistrict(fresh.map((id) => ({ id, district: this.districtFor(id), activity: activity.get(id) ?? 0 })), freePlan, this.track);
      for (const [id, i] of order) this.slotOf.set(id, i);
    }
    if (!this.built) {
      this.buildGround();
      this.buildStatic();
      this.built = true;
    }
    for (const g of groups) {
      if (!this.slotOf.has(g.id)) continue;
      const tier = tierFor(activity.get(g.id) ?? 0);
      const existing = this.buildings.get(g.id);
      const district = this.districtFor(g.id);
      if (existing && existing.group.userData.tier === tier && existing.group.userData.kind === g.kind && existing.group.userData.district === district) {
        this.setSign(g);
        continue;
      }
      if (existing) existing.group.removeFromParent();
      const slot = this.plan.slots[this.slotOf.get(g.id)!];
      const b = buildBuilding(g, slot, tier, district);
      b.group.userData = { groupId: g.id, tier, kind: g.kind, district };
      this.buildingRoot.add(b.group);
      this.buildings.set(g.id, b);
      this.setSign(g);
    }
    this.rebuildGrid();
    this.syncSlotDecor();
    this.buildDistrictProps();
  }

  districtFor(groupId: string): District {
    return this.districtOf.get(groupId) ?? 'plaza';
  }

  /** New theme config: re-lay the village if any channel changed district. */
  setDistricts(map: Map<string, District>): void {
    let changed = false;
    for (const id of new Set([...map.keys(), ...this.districtOf.keys()])) {
      if ((map.get(id) ?? 'plaza') !== (this.districtOf.get(id) ?? 'plaza') && this.groups.has(id)) changed = true;
    }
    this.districtOf = new Map(map);
    if (!changed || !this.built) return;
    for (const b of this.buildings.values()) b.group.removeFromParent();
    this.buildings.clear();
    this.slotOf.clear();
    this.setGroups([...this.groups.values()], this.lastActivity);
  }

  /** Arcade cabinets by gaming yards, a stool to drink mate at every yard. */
  private buildDistrictProps(): void {
    this.districtRoot.clear();
    for (let i = this.seats.length - 1; i >= 0; i--) if (this.seats[i].dynamic && !this.seats[i].taken) this.seats.splice(i, 1);
    for (const [id] of this.buildings) {
      const s = this.slotFor(id);
      if (!s) continue;
      const side = { x: Math.cos(s.rot), z: -Math.sin(s.rot) };
      const fwd = { x: Math.sin(s.rot), z: Math.cos(s.rot) };
      if (this.districtFor(id) === 'gaming') {
        for (const k of [-1, 1]) {
          const cab = buildArcadeCabinet(hashStr(id) + k + 1);
          cab.position.set(s.yard.x + side.x * 1.5 * k - fwd.x * 0.6, 0, s.yard.z + side.z * 1.5 * k - fwd.z * 0.6);
          cab.rotation.y = s.rot + Math.PI;
          this.districtRoot.add(cab);
        }
      }
      const stoolAt = { x: s.yard.x - side.x * 1.2 + fwd.x * 0.5, z: s.yard.z - side.z * 1.2 + fwd.z * 0.5 };
      if (!this.grid.isWalkable(stoolAt)) continue;
      const stool = model('town/stall-stool');
      stool.position.set(stoolAt.x, 0, stoolAt.z);
      this.districtRoot.add(stool);
      this.seats.push({ pos: stoolAt, face: Math.atan2(s.yard.x - stoolAt.x, s.yard.z - stoolAt.z), y: 0.2, taken: null, dynamic: true });
    }
  }

  private setSign(g: WireGroup): void {
    const b = this.buildings.get(g.id);
    const slot = this.slotFor(g.id);
    if (!b || !slot) return;
    this.overlay.setSign(g.id, new THREE.Vector3(slot.pos.x, b.height + 0.55, slot.pos.z), g.name, g.kind, () => this.hooks.onGroupClick?.(g.id));
  }

  /** Forget every channel and its slot (logout / account switch). */
  clearGroups(): void {
    for (const id of [...this.groups.keys()]) this.removeGroup(id);
    this.slotOf.clear();
    this.rebuildGrid();
    this.syncSlotDecor();
  }

  private removeGroup(id: string): void {
    this.groups.delete(id);
    this.buildings.get(id)?.group.removeFromParent();
    this.buildings.delete(id);
    this.overlay.removeSign(id);
    // The slot stays reserved so other buildings don't shuffle.
  }

  slotFor(groupId: string): Slot | null {
    const i = this.slotOf.get(groupId);
    return i === undefined ? null : this.plan.slots[i];
  }

  private usedSlots(): Slot[] {
    const used = [...this.slotOf.entries()].filter(([id]) => this.groups.has(id)).map(([, i]) => this.plan.slots[i]);
    return [...used, ...this.landmarkSlots.values()];
  }

  /** Channel slots only: landmarks block their real buildings, not the whole slot. */
  private gridSlots(): Slot[] {
    const held = new Set([...this.landmarkSlots.values()].map((s) => s.index));
    return this.usedSlots().filter((s) => !held.has(s.index));
  }

  private markLandmarks(grid: NavGrid): void {
    for (const d of LANDMARKS) {
      const s = this.landmarkSlots.get(d.id);
      if (!s) continue;
      const f = d.footprint;
      const c = Math.cos(s.rot), sn = Math.sin(s.rot);
      const ox = s.pos.x + sn * d.forward, oz = s.pos.z + c * d.forward;
      grid.mark((p) => {
        // World → landmark local (inverse of landmarkToWorld).
        const dx = p.x - ox, dz = p.z - oz;
        const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
        return lx > f.minX && lx < f.maxX && lz > f.minZ && lz < f.maxZ;
      }, 1);
    }
  }

  private rebuildGrid(): void {
    this.grid = buildNavGrid(this.plan, this.gridSlots(), this.bridges);
    this.markLandmarks(this.grid);
    for (const k of this.pathCells) if (!this.grid.blocked[k]) this.grid.cost[k] = 6;
    // Trees and props are obstacles too.
    for (const k of this.obstacles) this.grid.blocked[k] = 1;
  }

  private obstacles: number[] = [];
  private slotDecor = new Map<number, THREE.Object3D>();

  private buildSlotDecor(sl: Slot): THREE.Object3D {
    const g = new THREE.Group();
    const r = rng(sl.index * 31 + 7);
    const place = (o: THREE.Object3D, lx: number, lz: number, rot = sl.rot, scale = 1) => {
      const c = Math.cos(sl.rot), sn = Math.sin(sl.rot);
      o.position.set(sl.pos.x + lx * c + lz * sn, 0, sl.pos.z - lx * sn + lz * c);
      o.rotation.y = rot;
      o.scale.setScalar(scale);
      g.add(o);
    };
    const kind = hashStr(String(sl.index)) % 3;
    if (kind === 0) {
      for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) {
        place(model(j === 1 ? 'nature/crops_wheatStageB' : 'nature/crops_cornStageD'), (i - 2) * 0.38, (j - 1) * 0.5, sl.rot, 0.8);
      }
    } else if (kind === 1) {
      place(model('nature/tent_detailedOpen'), 0, 0, sl.rot, 1.6);
      place(model('nature/log_stack'), 0.9, 0.4);
    } else {
      for (let i = 0; i < 4; i++) place(model(TREE_MODELS[(sl.index + i) % 4]), (r() - 0.5) * 1.6, (r() - 0.5) * 1.6, r() * 6, 1 + r() * 0.4);
    }
    this.staticRoot.add(g);
    return g;
  }

  /** Show decorations only on slots no channel holds. */
  private syncSlotDecor(): void {
    const used = new Set(this.usedSlots().map((sl) => sl.index));
    for (const [i, o] of this.slotDecor) o.visible = !used.has(i);
  }

  /** The bare island (ground, river, mountains, waterfall): procedural, no
   *  models, so the loading screen can show it from above while they load. */
  buildGround(): void {
    if (this.island) return;
    const footprints = this.plan.slots.map((s) => ({ pos: s.pos, r: s.w * 0.8 + 0.4 }));
    this.island = buildIsland(this.plan, footprints);
    this.staticRoot.add(this.island.group);
  }

  /** Everything on the island that comes from models. Needs buildGround(). */
  private buildStatic(): void {
    const plan = this.plan;

    // Bridges where the paths will cross the river.
    const rp = this.island.riverPts;
    const pondIdx = rp.reduce((best, p, i) => (dist(p, plan.pond.c) < dist(rp[best], plan.pond.c) ? i : best), 0);
    const bridgeIdx = [Math.floor(pondIdx * 0.45), Math.floor(pondIdx + (rp.length - pondIdx) * 0.45)];
    this.bridges = bridgeIdx.map((i) => rp[i]);
    for (const i of bridgeIdx) {
      const a = rp[i - 2], b = rp[i + 2], p = rp[i];
      const along = Math.atan2(b.x - a.x, b.z - a.z);
      const br = model('nature/bridge_wood');
      br.position.set(p.x, -0.12, p.z);
      br.rotation.y = along;
      br.scale.set(1.9, 1.3, 1.5);
      this.staticRoot.add(br);
    }

    this.grid = buildNavGrid(plan, this.gridSlots(), this.bridges);
    this.markLandmarks(this.grid);
    this.layPaths();
    this.buildPlaza();
    this.buildMarket();
    this.decorate();
    this.buildSportsGround();
    this.buildLandmarks();
    // Every seat (bench, stool, log, chair) is solid up to its seat height.
    for (const seat of this.seats) {
      if (seat.dynamic) continue;
      const r = 0.13;
      this.solids.push({ minX: seat.pos.x - r, maxX: seat.pos.x + r, minZ: seat.pos.z - r, maxZ: seat.pos.z + r, top: seat.y });
    }
    this.buildFireflies();
    if (this.grassWanted) this.buildGrass(this.grassWanted);
  }

  /**
   * The street market: three stalls in a little square of its own, away from
   * the obelisk. Kenney's stalls hold their awning on one side only, so each
   * gets a pole at every corner. The tables are solid (walk round, or jump up).
   */
  private buildMarket(): void {
    const plan = this.plan;
    const free = (p: Vec2, pad: number) =>
      dist(p, plan.plaza.c) > plan.plaza.r + 1.5
      && !plan.slots.some((sl) => inFootprint(p, sl, 0.8 + pad) || dist(p, sl.yard) < 1.4 + pad)
      && distToPolyline(p, this.island.riverPts) > plan.riverWidth + 0.6 + pad
      && dist(p, plan.pond.c) > plan.pond.r + 0.8 + pad
      && !plan.mountains.some((m) => dist(p, m.pos) < m.r + pad)
      && (!this.track || !onTrack(p, this.track, 1 + pad))
      && Math.hypot(p.x, p.z) < plan.radiusAt(Math.atan2(p.z, p.x)) - 2
      && [...this.landmarkSlots.values()].every((sl) => dist(p, sl.pos) > 3.6);
    let best = null as Vec2 | null, bd = Infinity;
    // The roomiest clearance that fits somewhere, nearest the plaza.
    for (const pad of [1.9, 1.6, 1.3, 1.0]) {
      for (let r = 5; r < 12; r += 0.5) for (let k = 0; k < 48; k++) {
        const a = (k / 48) * Math.PI * 2;
        const p = { x: plan.plaza.c.x + Math.cos(a) * r, z: plan.plaza.c.z + Math.sin(a) * r };
        if (!free(p, pad) || this.onPath(p, 0.2)) continue;
        if (r < bd) { bd = r; best = p; }
      }
      if (best) break;
    }
    if (!best) return;
    this.marketAt = best;
    const toPlaza = Math.atan2(plan.plaza.c.x - best.x, plan.plaza.c.z - best.z);
    const stalls = ['town/stall-red', 'town/stall-green', 'town/stall-red'];
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x9a6a3c, roughness: 0.9 });
    for (let i = 0; i < 3; i++) {
      // An arc facing the way back to the plaza.
      const a = toPlaza + Math.PI + (i - 1) * 0.85;
      const pos = { x: best.x + Math.sin(a) * 1.75, z: best.z + Math.cos(a) * 1.75 };
      const st = model(stalls[i]);
      const S = 1.15;
      st.position.set(pos.x, 0.0, pos.z);
      st.rotation.y = a + Math.PI;
      st.scale.setScalar(S);
      this.staticRoot.add(st);
      for (const [lx, lz] of [[-0.47, -0.47], [0.47, -0.47], [-0.47, 0.47], [0.47, 0.47]]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.12, 6), poleMat);
        pole.position.set(lx, 0.56, lz);
        pole.castShadow = true;
        st.add(pole);
      }
      st.updateMatrixWorld(true);
      // The table top only (not the awning): solid up to table height.
      const half = 0.45 * S;
      this.solids.push({ minX: pos.x - half, maxX: pos.x + half, minZ: pos.z - half, maxZ: pos.z + half, top: 0.42 * S });
    }
  }

  /** Where the market square is (for residents to browse). */
  marketAt: Vec2 | null = null;

  /** A placed prop becomes solid: its footprint, up to its top. */
  private addSolidObject(o: THREE.Object3D, shrink = 0.04): void {
    o.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(o);
    if (box.isEmpty()) return;
    this.solids.push({ minX: box.min.x + shrink, maxX: box.max.x - shrink, minZ: box.min.z + shrink, maxZ: box.max.z - shrink, top: box.max.y });
  }

  /** Is p on a landmark's front lawn (where its stairs or terrace come down)? */
  private onLandmarkLawn(p: Vec2): boolean {
    for (const d of LANDMARKS) {
      const s = this.landmarkSlots.get(d.id);
      if (!s || !d.lawn) continue;
      const dx = p.x - s.pos.x, dz = p.z - s.pos.z;
      const along = dx * Math.sin(s.rot) + dz * Math.cos(s.rot);
      const across = dx * Math.cos(s.rot) - dz * Math.sin(s.rot);
      if (along > 0 && along < d.lawn.along && Math.abs(across) < d.lawn.across) return true;
    }
    return false;
  }

  /** Slot-local → world, for a landmark standing in slot `s` pushed `forward`. */
  private landmarkToWorld(s: Slot, forward: number, p: Vec2): Vec2 {
    const c = Math.cos(s.rot), sn = Math.sin(s.rot);
    const ox = s.pos.x + sn * forward, oz = s.pos.z + c * forward;
    return { x: ox + p.x * c + p.z * sn, z: oz - p.x * sn + p.z * c };
  }

  private buildLandmarks(): void {
    for (const d of LANDMARKS) {
      const s = this.landmarkSlots.get(d.id);
      if (!s) continue;
      this.slotDecor.get(s.index)?.removeFromParent();
      this.slotDecor.delete(s.index);
      const b = d.build();
      const fwd = { x: Math.sin(s.rot), z: Math.cos(s.rot) };
      b.group.position.set(s.pos.x + fwd.x * d.forward, 0, s.pos.z + fwd.z * d.forward);
      b.group.rotation.y = s.rot;
      b.group.traverse((o) => { o.userData.landmark = d.id; });
      this.staticRoot.add(b.group);
      this.landmarks.set(d.id, b);
      for (const so of b.solids ?? []) {
        const c = this.landmarkToWorld(s, d.forward, { x: so.x, z: so.z });
        const cs = Math.abs(Math.cos(s.rot)), sn = Math.abs(Math.sin(s.rot));
        const hx = so.hx * cs + so.hz * sn, hz = so.hx * sn + so.hz * cs;
        this.solids.push({ minX: c.x - hx, maxX: c.x + hx, minZ: c.z - hz, maxZ: c.z + hz, top: so.top });
      }
      for (const seat of b.seats ?? []) {
        this.seats.push({ pos: this.landmarkToWorld(s, d.forward, seat.pos), face: seat.face + s.rot, y: seat.y, taken: null, prop: seat.prop, landmark: d.id, laptop: seat.laptop, indoor: seat.indoor });
      }
    }
  }

  /** World → a landmark's local frame. */
  private toLandmarkLocal(id: LandmarkId, p: Vec2): Vec2 | null {
    const d = LANDMARKS.find((x) => x.id === id);
    const s = this.landmarkSlots.get(id);
    if (!d || !s) return null;
    const c = Math.cos(s.rot), sn = Math.sin(s.rot);
    const dx = p.x - (s.pos.x + sn * d.forward), dz = p.z - (s.pos.z + c * d.forward);
    return { x: dx * c - dz * sn, z: dx * sn + dz * c };
  }

  /** Inside a building you can enter (its room or doorway): walkable for the player. */
  insideWalkable(p: Vec2): boolean {
    for (const [id, b] of this.landmarks) {
      if (!b.interior) continue;
      const l = this.toLandmarkLocal(id, p);
      if (l && b.interior.rooms.some((r) => l.x > r.minX && l.x < r.maxX && l.z > r.minZ && l.z < r.maxZ)) return true;
    }
    return false;
  }

  /** How high the ground is at p: raised where a landmark has stairs or a
   *  floor up a storey (La Crypta's steps and living room), else 0. */
  groundAt(p: Vec2): number {
    let h = 0;
    for (const [id, b] of this.landmarks) {
      if (!b.groundAt) continue;
      const l = this.toLandmarkLocal(id, p);
      if (l) h = Math.max(h, b.groundAt(l));
    }
    return h;
  }

  /** Doors open for the player and for people walking live from another
   *  browser; the building you're in shows its inside. */
  private updateInteriors(): void {
    const me = this.playerPk ? this.people.get(this.playerPk) : null;
    const walkers = [me, ...[...this.movers.keys()].map((pk) => this.people.get(pk))].filter((c): c is Character => !!c);
    for (const [id, b] of this.landmarks) {
      const it = b.interior;
      if (!it) continue;
      const l = me ? this.toLandmarkLocal(id, me.pos) : null;
      let d = 99;
      for (const c of walkers) {
        const w = this.toLandmarkLocal(id, c.pos);
        if (w) d = Math.min(d, Math.hypot(w.x - it.door.x, w.z - it.door.z));
      }
      it.setDoor(THREE.MathUtils.clamp((1.3 - d) / 0.5, 0, 1));
      const r = it.rooms[0];
      // The cutaway is for the follow camera; in first person the room stays whole.
      it.setInside(!this.cam.firstPerson && !!l && l.x > r.minX && l.x < r.maxX && l.z > r.minZ && l.z < r.maxZ);
    }
  }

  /** A landmark's slot (for walking there) and where its resident stands. */
  landmarkSlot(id: LandmarkId): Slot | null {
    return this.landmarkSlots.get(id) ?? null;
  }

  landmarkResidentSpot(id: LandmarkId): { pos: Vec2; face: number } | null {
    const d = LANDMARKS.find((x) => x.id === id);
    const s = this.landmarkSlots.get(id);
    const at = this.landmarks.get(id)?.residentLocal;
    if (!d || !s || !at) return null;
    return { pos: this.landmarkToWorld(s, d.forward, at), face: s.rot };
  }

  /** Light up the landmarks that react to the village (the HQ's graph). */
  pulseLandmarks(): void {
    for (const b of this.landmarks.values()) b.pulse?.();
  }

  /** The running track and calisthenics park (always there; sports
   *  channels gather around it). */
  private buildSportsGround(): void {
    if (!this.track) return;
    this.staticRoot.add(buildTrack(this.track));
    // The park goes beside or past the end of the track, wherever no
    // building slot (used now or later) and no water is in the way.
    const t = this.track;
    const tan = { x: Math.cos(t.rot), z: Math.sin(t.rot) };
    const nrm = { x: -Math.sin(t.rot), z: Math.cos(t.rot) };
    const candidates = [
      { x: t.c.x + tan.x * 5.4, z: t.c.z + tan.z * 5.4 },
      { x: t.c.x - tan.x * 5.4, z: t.c.z - tan.z * 5.4 },
      { x: t.c.x + nrm.x * 3.2, z: t.c.z + nrm.z * 3.2 },
      { x: t.c.x - nrm.x * 3.2, z: t.c.z - nrm.z * 3.2 },
    ];
    const clearance = (p: Vec2) => Math.min(
      ...this.plan.slots.filter((sl) => !onTrack(sl.pos, t, sl.w * 0.7 + 0.6)).map((sl) => dist(p, sl.pos) - sl.w * 0.75),
      distToPolyline(p, this.island.riverPts) - 1,
      this.plan.radiusAt(Math.atan2(p.z, p.x)) - Math.hypot(p.x, p.z) - 1.2,
    );
    const parkAt = candidates.reduce((best, p) => (clearance(p) > clearance(best) ? p : best));
    const park = buildCalisthenics(parkAt, -t.rot);
    this.staticRoot.add(park);
    this.blockAround(parkAt, 0.9);
    // Its training spots, in world space.
    const r = -t.rot, cos = Math.cos(r), sin = Math.sin(r);
    for (const st of CALISTHENICS_STATIONS) {
      this.stations.push({
        pos: { x: parkAt.x + st.at.x * cos + st.at.z * sin, z: parkAt.z - st.at.x * sin + st.at.z * cos },
        face: st.face + r,
        grip: st.grip,
        half: st.half,
        kinds: st.kinds,
        taken: null,
      });
    }
    for (const p of trackLapPoints(this.track)) {
      const [i, j] = this.grid.cellOf(p);
      if (this.grid.inBounds(i, j)) this.pathCells.add(this.grid.idx(i, j));
    }
  }

  /** Cobbled paths from the plaza to every building slot (used or not, so
   *  later channels already have a road). */
  private layPaths(): void {
    const plan = this.plan;
    const grid = buildNavGrid(plan, plan.slots, this.bridges);
    const cells = new Set<number>();
    const track = this.track;
    const ordered = plan.slots
      .filter((s) => !track || !onTrack(s.pos, track, s.w * 0.7 + 0.6))
      .sort((a, b) => dist(a.yard, plan.plaza.c) - dist(b.yard, plan.plaza.c));
    for (const s of ordered) {
      // Reuse existing road: make laid cells cheap before routing the next.
      const path = grid.findPath({ x: plan.plaza.c.x, z: plan.plaza.c.z + plan.plaza.r - 0.5 }, s.door);
      if (!path) continue;
      let prev = { x: plan.plaza.c.x, z: plan.plaza.c.z + plan.plaza.r - 0.5 };
      for (const p of path) {
        const steps = Math.ceil(dist(prev, p) / 0.25);
        for (let k = 0; k <= steps; k++) {
          const q = { x: prev.x + (p.x - prev.x) * (k / steps), z: prev.z + (p.z - prev.z) * (k / steps) };
          const [i, j] = grid.cellOf(q);
          if (!grid.inBounds(i, j)) continue;
          for (const [di, dj] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
            const kk = grid.idx(i + di, j + dj);
            cells.add(kk);
            grid.cost[kk] = 4;
          }
        }
        prev = p;
      }
    }
    this.pathCells = cells;
    // Cobblestones: little flattened stones, instanced.
    const r = rng(5);
    const stoneGeo = new THREE.CylinderGeometry(0.075, 0.085, 0.04, 6);
    const pts: THREE.Matrix4[] = [];
    for (const k of cells) {
      if (grid.blocked[k] && !this.bridges.some((b) => dist(grid.centerOf(k % grid.n, Math.floor(k / grid.n)), b) < 1)) continue;
      const c = grid.centerOf(k % grid.n, Math.floor(k / grid.n));
      if (dist(c, plan.plaza.c) < plan.plaza.r - 0.2) continue;
      if (distToPolyline(c, this.island.riverPts) < plan.riverWidth * 0.75) continue;
      for (let n = 0; n < 3; n++) {
        const m = new THREE.Matrix4().compose(
          new THREE.Vector3(c.x + (r() - 0.5) * 0.45, 0.01, c.z + (r() - 0.5) * 0.45),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 3),
          new THREE.Vector3(0.8 + r() * 0.6, 1, 0.8 + r() * 0.6),
        );
        pts.push(m);
      }
    }
    const inst = new THREE.InstancedMesh(stoneGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.9 }), pts.length);
    const col = new THREE.Color();
    pts.forEach((m, i) => {
      inst.setMatrixAt(i, m);
      inst.setColorAt(i, col.setHSL(0.02 + r() * 0.06, 0.3 + r() * 0.2, 0.58 + r() * 0.12));
    });
    inst.receiveShadow = true;
    this.staticRoot.add(inst);
  }

  private buildPlaza(): void {
    const c = this.plan.plaza.c;
    // Plaza paving ring.
    const pave = new THREE.Mesh(
      new THREE.CylinderGeometry(this.plan.plaza.r, this.plan.plaza.r + 0.1, 0.06, 28),
      new THREE.MeshStandardMaterial({ color: 0xd9c6a8, flatShading: true, roughness: 0.95 }),
    );
    pave.position.set(c.x, 0.0, c.z);
    pave.receiveShadow = true;
    this.staticRoot.add(pave);

    // The landmark: Obelisk's own mark, in its real proportions, lit lime.
    this.obelisk = buildObelisk(8);
    this.obelisk.group.position.set(c.x, 0, c.z);
    this.obelisk.group.rotation.y = 0;
    this.staticRoot.add(this.obelisk.group);

    // Lanterns around the plaza, a few with real light.
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.2;
      const p = { x: c.x + Math.cos(a) * (this.plan.plaza.r + 0.25), z: c.z + Math.sin(a) * (this.plan.plaza.r + 0.25) };
      if (this.onLandmarkLawn(p)) continue; // a landmark's stairs or terrace come down here
      this.lantern(p, i % 2 === 0);
    }
    // Benches on the plaza (the market has its own square, see buildMarket).
    for (let i = 0; i < 3; i++) {
      const a = 0.9 + i * 0.55;
      const b = model('town/stall-bench');
      b.position.set(c.x + Math.cos(a) * (this.plan.plaza.r - 0.55), 0.03, c.z + Math.sin(a) * (this.plan.plaza.r - 0.55));
      b.rotation.y = -a;
      this.staticRoot.add(b);
      this.addSolidObject(b);
      const pos = { x: b.position.x, z: b.position.z };
      this.seats.push({ pos, face: Math.atan2(c.x - pos.x, c.z - pos.z) + Math.PI, y: 0.22, taken: null });
    }
  }

  private lantern(p: Vec2, light: boolean): void {
    const l = model('town/lantern');
    l.position.set(p.x, 0, p.z);
    l.scale.setScalar(0.6);
    this.staticRoot.add(l);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), this.lampGlow);
    bulb.position.set(p.x, 0.85, p.z);
    this.staticRoot.add(bulb);
    if (light && this.lampLights.length < 6) {
      const pl = new THREE.PointLight(0xffb45a, 0, 5, 1.6);
      pl.position.set(p.x, 0.95, p.z);
      this.lampLights.push(pl);
      this.staticRoot.add(pl);
    }
    // A thin post: you walk around it and can't jump over it.
    this.solids.push({ minX: p.x - 0.06, maxX: p.x + 0.06, minZ: p.z - 0.06, maxZ: p.z + 0.06, top: 3 });
  }

  private blockAround(p: Vec2, r: number): void {
    const [ci, cj] = this.grid.cellOf(p);
    const k = Math.ceil(r / 0.5);
    for (let dj = -k; dj <= k; dj++) for (let di = -k; di <= k; di++) {
      const c = this.grid.centerOf(ci + di, cj + dj);
      if (dist(c, p) <= r + 0.25 && this.grid.inBounds(ci + di, cj + dj)) this.obstacles.push(this.grid.idx(ci + di, cj + dj));
    }
  }

  private decorate(): void {
    const plan = this.plan;
    const props = new PropBatch();
    const r = rng(plan.seed + 77);
    const used = new Set(this.usedSlots().map((s) => s.index));
    // The watermill: the straightest free stretch of river past the pond.
    const half = plan.riverWidth * 0.62;
    this.millSite = millSite(this.island.riverPts, half, {
      avoid: [...this.bridges, plan.pond.c],
      clear: 2.4,
      blocked: (p) => plan.slots.some((sl) => inFootprint(p, sl, 0.4) || dist(p, sl.yard) < 1)
        || this.onPath(p, 0.2) || (!!this.track && onTrack(p, this.track, 0.6))
        || dist(p, { x: 0, z: 0 }) > plan.R - 1.4,
    });
    const occupied = (p: Vec2, pad: number) =>
      dist(p, plan.plaza.c) < plan.plaza.r + 0.6 + pad
      || (!!this.millSite && dist(p, this.millSite.house) < 1.15 + pad)
      || (!!this.marketAt && dist(p, this.marketAt) < 2.4 + pad)
      || plan.slots.some((s) => inFootprint(p, s, 0.6 + pad) || dist(p, s.yard) < 1.2 + pad)
      || distToPolyline(p, this.island.riverPts) < plan.riverWidth * 0.7 + pad
      || dist(p, plan.pond.c) < plan.pond.r + 0.3 + pad
      || plan.mountains.some((m) => dist(p, m.pos) < m.r * 0.9 + pad)
      || this.onPath(p, pad)
      || (!!this.track && onTrack(p, this.track, 1.2 + pad));

    // Trees: denser toward the rim and in noise-driven groves.
    for (let n = 0; n < 2600; n++) {
      const th = r() * Math.PI * 2;
      const rr = Math.sqrt(r()) * (plan.radiusAt(th) - 0.9);
      const p = { x: Math.cos(th) * rr, z: Math.sin(th) * rr };
      const grove = fbm2(p.x * 0.16 + 4, p.z * 0.16) + (rr / plan.R) * 0.55;
      if (grove < 0.38) continue;
      if (occupied(p, 0.35)) continue;
      const nearMountain = plan.mountains.some((m) => dist(p, m.pos) < m.r + 2);
      const pool = nearMountain ? TREE_MODELS.filter((t) => t.includes('pine') || t.includes('cone')) : TREE_MODELS;
      const t = pool[Math.floor(r() * pool.length)];
      props.add(t, p.x, 0, p.z, r() * 6.28, 0.9 + r() * 0.7);
      this.blockAround(p, 0.2);
      if (r() < 0.25) props.add(BUSHES[Math.floor(r() * BUSHES.length)], p.x + (r() - 0.5) * 0.9, 0, p.z + (r() - 0.5) * 0.9, r() * 6.28, 0.8 + r() * 0.5);
    }
    // Flowers, grass tufts, rocks, mushrooms — walkable dressing.
    for (let n = 0; n < 1500; n++) {
      const th = r() * Math.PI * 2;
      const rr = Math.sqrt(r()) * (plan.radiusAt(th) - 0.6);
      const p = { x: Math.cos(th) * rr, z: Math.sin(th) * rr };
      if (occupied(p, 0)) continue;
      const k = r();
      if (k < 0.4) props.add(GRASS[Math.floor(r() * GRASS.length)], p.x, 0, p.z, r() * 6.28, 0.8 + r() * 0.6);
      else if (k < 0.75) {
        const f = FLOWERS[Math.floor(fbm2(p.x * 0.3, p.z * 0.3) * 3 + 3) % FLOWERS.length];
        props.add(f, p.x, 0, p.z, r() * 6.28, 0.9 + r() * 0.6);
      } else if (k < 0.88) props.add(ROCKS[Math.floor(r() * ROCKS.length)], p.x, -0.02, p.z, r() * 6.28, 0.35 + r() * 0.4);
      else if (k < 0.94) props.add(r() < 0.5 ? 'nature/mushroom_red' : 'nature/mushroom_redGroup', p.x, 0, p.z, r() * 6.28, 0.7);
      else props.add(BUSHES[Math.floor(r() * BUSHES.length)], p.x, 0, p.z, r() * 6.28, 0.8 + r() * 0.4);
    }
    // Pond: lilies and reeds; rocks along the rim of the island top.
    for (let i = 0; i < 9; i++) {
      const a = r() * 6.28, d = r() * (plan.pond.r - 0.4);
      props.add(r() < 0.5 ? 'nature/lily_large' : 'nature/lily_small', plan.pond.c.x + Math.cos(a) * d, -0.12, plan.pond.c.z + Math.sin(a) * d, r() * 6.28, 1);
    }
    for (let i = 0; i < 70; i++) {
      const th = r() * Math.PI * 2;
      const rr = plan.radiusAt(th) - 0.35 - r() * 0.4;
      props.add(ROCKS[Math.floor(r() * ROCKS.length)], Math.cos(th) * rr, -0.1, Math.sin(th) * rr, r() * 6.28, 0.4 + r() * 0.6);
    }
    // Empty slots become gardens, camps and groves (slotDecor), removed the
    // moment a channel takes the slot.
    for (const sl of plan.slots) {
      if (this.track && onTrack(sl.pos, this.track, sl.w * 0.7 + 0.6)) continue;
      this.slotDecor.set(sl.index, this.buildSlotDecor(sl));
    }
    // Landmarks.
    if (this.millSite) {
      this.mill = buildMill(this.millSite, plan.riverWidth * 0.62);
      this.staticRoot.add(this.mill.group);
      this.blockAround(this.millSite.house, 0.85);
    }
    const fire = model('nature/campfire_logs');
    fire.position.set(plan.campfire.x, 0, plan.campfire.z);
    this.staticRoot.add(fire);
    for (let i = 0; i < 3; i++) {
      const pos = { x: plan.campfire.x + Math.cos(i * 2.1) * 0.8, z: plan.campfire.z + Math.sin(i * 2.1) * 0.8 };
      props.add('nature/log', pos.x, 0, pos.z, i * 2.1 + 1.57, 0.8);
      this.seats.push({ pos, face: Math.atan2(plan.campfire.x - pos.x, plan.campfire.z - pos.z), y: 0.12, taken: null });
    }
    // Two stools by the pond.
    for (const a of [2.4, 2.9]) {
      const pos = { x: plan.pond.c.x + Math.cos(a) * (plan.pond.r + 0.7), z: plan.pond.c.z + Math.sin(a) * (plan.pond.r + 0.7) };
      const st = model('town/stall-stool');
      st.position.set(pos.x, 0, pos.z);
      this.staticRoot.add(st);
      this.seats.push({ pos, face: Math.atan2(plan.pond.c.x - pos.x, plan.pond.c.z - pos.z), y: 0.2, taken: null });
    }

    props.build(this.staticRoot, { sway: (p) => p.includes('tree_') || p.includes('plant_') });
    this.swaying = props.swaying;
    this.installSway();
    this.rebuildGrid();
  }

  private onPath(p: Vec2, pad: number): boolean {
    if (!this.pathCells.size) return false;
    const [i, j] = this.grid.cellOf(p);
    const k = Math.ceil((pad + 0.25) / 0.5);
    for (let dj = -k; dj <= k; dj++) for (let di = -k; di <= k; di++) {
      if (this.pathCells.has(this.grid.idx(i + di, j + dj))) return true;
    }
    return false;
  }

  /** Wind: a vertex-shader sway on tree and bush materials. */
  private swayUniform = { value: 0 };
  private installSway(): void {
    const seen = new Set<THREE.Material>();
    for (const inst of this.swaying) {
      const mats = Array.isArray(inst.material) ? inst.material : [inst.material];
      for (const m of mats) {
        if (seen.has(m)) continue;
        seen.add(m);
        m.onBeforeCompile = (shader) => {
          shader.uniforms.uWind = this.swayUniform;
          shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nuniform float uWind;')
            .replace('#include <begin_vertex>', `#include <begin_vertex>
              #ifdef USE_INSTANCING
                vec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
                float sw = sin(uWind * 1.3 + ip.x * 0.7 + ip.z * 0.5) * 0.06 + sin(uWind * 2.7 + ip.z) * 0.02;
                transformed.x += sw * max(position.y, 0.0);
                transformed.z += sw * 0.5 * max(position.y, 0.0);
              #endif`);
        };
        m.needsUpdate = true;
      }
    }
  }

  private grass: THREE.InstancedMesh | null = null;

  /** A field of grass blades over the open ground, swaying in the wind
   *  (High and Ultra; it costs one draw call but many vertices). */
  private buildGrass(count: number): void {
    this.grass?.removeFromParent();
    this.grass = null;
    if (!count) return;
    const blade = grassTuft();
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
    const inst = new THREE.InstancedMesh(blade, mat, count);
    const r = rng(1234);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const col = new THREE.Color();
    let n = 0;
    for (let tries = 0; tries < count * 4 && n < count; tries++) {
      const th = r() * Math.PI * 2;
      const rr = Math.sqrt(r()) * (this.plan.R - 1.2);
      const p = { x: Math.cos(th) * rr, z: Math.sin(th) * rr };
      if (dist(p, this.plan.plaza.c) < this.plan.plaza.r + 0.3) continue;
      if (distToPolyline(p, this.island.riverPts) < this.plan.riverWidth) continue;
      if (dist(p, this.plan.pond.c) < this.plan.pond.r + 0.6) continue;
      if (this.plan.mountains.some((mt) => dist(p, mt.pos) < mt.r)) continue;
      if (this.track && onTrack(p, this.track, 0.1)) continue;
      if (this.plan.slots.some((s) => inFootprint(p, s, 0.1))) continue;
      if (this.onPath(p, 0)) continue;
      if (this.marketAt && dist(p, this.marketAt) < 2.1) continue;
      // Tufts grow in clumps: thin out where the clump noise is low.
      if (fbm2(p.x * 0.9 + 31, p.z * 0.9) < -0.12 && r() < 0.7) continue;
      q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.25, r() * 6.28, (r() - 0.5) * 0.25));
      const s = 0.65 + r() * 0.8;
      m.compose(new THREE.Vector3(p.x, 0, p.z), q, new THREE.Vector3(s, s * (0.8 + r() * 0.6), s));
      inst.setMatrixAt(n, m);
      inst.setColorAt(n, col.setHSL(0.22 + r() * 0.07, 0.5 + r() * 0.2, 0.36 + r() * 0.16));
      n++;
    }
    inst.count = n;
    inst.receiveShadow = true;
    inst.instanceMatrix.needsUpdate = true;
    this.swaying.push(inst);
    this.installSway();
    this.staticRoot.add(inst);
    this.grass = inst;
  }

  /** Local preferences → the scene (see prefs.ts). */
  applyPrefs(p: Prefs): void {
    this.post.configure({ quality: p.quality, resolution: p.resolution, shadows: p.shadows, ambientOcclusion: p.ambientOcclusion, bloom: p.bloom, tiltShift: p.tiltShift });
    this.sky.override = p.timeOfDay as TimeOverride;
    this.overlay.showSigns = p.signs;
    this.overlay.showBubbles = p.bubbles;
    this.cam.auto = p.autoDirector;
    this.cam.sensitivity = p.mouseSensitivity;
    this.cam.invertY = p.invertY;
    this.fpFov = p.fov;
    if (this.cam.firstPerson) { this.camera.fov = p.fov; this.camera.updateProjectionMatrix(); }
    const level = this.post.level;
    const want = !p.grass || level === 'low' ? 0 : level === 'medium' ? 5000 : level === 'high' ? 12000 : 22000;
    if (this.built && (this.grass?.count ?? 0) !== want && Math.abs((this.grass?.count ?? 0) - want) > 500) this.buildGrass(want);
    this.grassWanted = want;
    // Sharper textures at a glancing angle.
    const aniso = level === 'ultra' ? 16 : level === 'high' ? 8 : 1;
    this.scene.traverse((o) => {
      const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (mat && !Array.isArray(mat) && mat.map && mat.map.anisotropy !== aniso) { mat.map.anisotropy = aniso; mat.map.needsUpdate = true; }
    });
  }

  fpFov = 70;
  private grassWanted = 0;

  private buildFireflies(): void {
    const r = rng(3);
    const pos: number[] = [];
    for (let i = 0; i < 160; i++) {
      const th = r() * 6.28, rr = Math.sqrt(r()) * (this.plan.R - 2);
      pos.push(Math.cos(th) * rr, 0.3 + r() * 1.2, Math.sin(th) * rr);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.fireflies = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xe8ff7a, size: 0.09, transparent: true, opacity: 0, depthWrite: false }));
    this.staticRoot.add(this.fireflies);
  }

  // ── people ────────────────────────────────────────────────────────────

  private repaintQueued = false;

  setProfile(p: WireProfile): void {
    this.profiles.set(p.pubkey, p);
    this.people.get(p.pubkey)?.setProfile(p.name, p.avatar);
    // Bubbles already on screen may mention this person by npub: redraw them
    // once per frame at most.
    if (!this.repaintQueued) {
      this.repaintQueued = true;
      requestAnimationFrame(() => { this.repaintQueued = false; this.overlay.repaintBubbles(); });
    }
  }

  nameOf(pk: string): string {
    return this.profiles.get(pk)?.name ?? shortNpub(pk);
  }

  private yardSpot(groupId: string, spread = 1.5): Vec2 {
    const s = this.slotFor(groupId);
    const base = s ? s.yard : this.plan.plaza.c;
    for (let i = 0; i < 12; i++) {
      const a = this.wanderRng() * 6.28, d = this.wanderRng() * spread;
      const p = { x: base.x + Math.cos(a) * d, z: base.z + Math.sin(a) * d };
      if (this.grid.isWalkable(p)) return p;
    }
    return this.grid.nearestWalkable(base) ?? base;
  }

  private doorOf(groupId: string): Vec2 {
    const b = this.buildings.get(groupId);
    if (!b) return this.yardSpot(groupId, 0.5);
    const v = b.doorLocal.clone().applyMatrix4(b.group.matrixWorld);
    return { x: v.x, z: v.z };
  }

  private walkTo(c: Character, to: Vec2, opts: { instant?: boolean; run?: boolean; then?: () => void } = {}): void {
    if (opts.instant) {
      c.place(this.grid.nearestWalkable(to) ?? to);
      opts.then?.();
      return;
    }
    const path = this.grid.findPath(c.pos, to);
    if (!path) { c.place(this.grid.nearestWalkable(to) ?? to); opts.then?.(); return; }
    const far = dist(c.pos, to) > 9;
    c.walk(path, opts.run ?? far, opts.then);
  }

  private spawn(pk: string, groupId: string, arrival: 'instant' | 'balloon' | 'door'): void {
    let c = this.people.get(pk);
    if (c && this.leaving.has(c)) {
      this.leaving.delete(c);
      c.targetOpacity = 1;
      return;
    }
    if (c) { this.claimSpawned.delete(pk); return; }
    c = this.makePerson(pk);
    if (arrival === 'door') {
      c.place(this.doorOf(groupId));
      this.walkTo(c, this.yardSpot(groupId));
    } else if (arrival === 'balloon') {
      c.place(this.yardSpot(groupId, 1));
      this.balloon(c);
      this.hooks.onArrive?.();
    } else {
      c.place(this.yardSpot(groupId, 2.2));
      c.body.rotation.y = this.wanderRng() * 6.28;
    }
  }

  private makePerson(pk: string): Character {
    const prof = this.profiles.get(pk);
    const c = new Character(pk, prof?.name ?? 'someone');
    c.setProfile(prof?.name ?? shortNpub(pk), prof?.avatar ?? null);
    this.people.set(pk, c);
    this.applyAvatar(c);
    this.scene.add(c.root);
    c.idleFor = this.wanderRng() * 8;
    return c;
  }

  /** People who live at a landmark: they stay put and never leave. */
  private residents = new Set<string>();

  /** Put someone at a landmark for good (the nostr-wot account at its HQ). */
  addResident(pk: string, at: LandmarkId, badge?: string): void {
    const spot = this.landmarkResidentSpot(at);
    if (!spot || this.people.has(pk)) return;
    const prof = this.profiles.get(pk);
    const c = new Character(pk, prof?.name ?? shortNpub(pk));
    c.setProfile(prof?.name ?? shortNpub(pk), prof?.avatar ?? null);
    if (badge) c.setBadgeMark(badge);
    this.people.set(pk, c);
    this.residents.add(pk);
    this.applyAvatar(c);
    this.scene.add(c.root);
    c.place(spot.pos);
    c.body.rotation.y = spot.face;
    c.faceToward({ x: spot.pos.x + Math.sin(spot.face), z: spot.pos.z + Math.cos(spot.face) });
  }

  private despawn(pk: string): void {
    if (this.residents.has(pk)) return;
    if (this.pinned(pk)) { this.despawnLater.add(pk); return; }
    const c = this.people.get(pk);
    if (!c) return;
    this.stopTraining(pk);
    this.stand(pk);
    this.people.delete(pk);
    this.pets.get(pk)?.dispose();
    this.pets.delete(pk);
    this.leaving.add(c);
    c.targetOpacity = 0;
    this.convoOf.delete(pk);
  }

  apply(cmds: Command[]): void {
    for (const cmd of cmds) {
      switch (cmd.c) {
        case 'spawn': this.spawn(cmd.pk, cmd.groupId, cmd.arrival); break;
        case 'despawn': if (cmd.pk !== this.playerPk) this.despawn(cmd.pk); break;
        case 'goto-yard': {
          const c = this.people.get(cmd.pk);
          if (!c || cmd.pk === this.playerPk || this.pinned(cmd.pk)) break;
          this.stand(cmd.pk);
          this.stopTraining(cmd.pk);
          this.leaveConvoSpot(cmd.pk);
          c.stand();
          this.homeward.delete(cmd.pk);
          c.targetOpacity = 1;
          this.walkTo(c, this.yardSpot(cmd.groupId), { instant: cmd.instant });
          break;
        }
        case 'goto-convo': {
          const c = this.people.get(cmd.pk);
          if (!c) break;
          if (cmd.pk === this.playerPk) { this.convoOf.set(cmd.pk, cmd.convoId); break; }
          if (this.pinned(cmd.pk)) break;
          this.stand(cmd.pk);
          this.stopTraining(cmd.pk);
          this.homeward.delete(cmd.pk);
          c.targetOpacity = 1;
          const spot = this.convoSpot(cmd.convoId, cmd.groupId);
          if (!spot.members.includes(cmd.pk)) spot.members.push(cmd.pk);
          this.leaveConvoSpot(cmd.pk, cmd.convoId);
          this.convoOf.set(cmd.pk, cmd.convoId);
          const spots = circleSpots(spot.center, cmd.size, spot.sitting ? 0.75 : 0.5);
          const target = spots[cmd.slot % spots.length];
          c.stand();
          this.walkTo(c, target, {
            instant: cmd.instant,
            then: () => {
              c.faceToward(spot.center);
              if (spot.sitting || this.pendingSit.has(cmd.pk)) { this.pendingSit.delete(cmd.pk); c.sit(); }
            },
          });
          break;
        }
        case 'say': this.say(cmd.pk, cmd.msg, cmd.to, cmd.instant); break;
        case 'face': {
          const c = this.people.get(cmd.pk), t = this.people.get(cmd.target);
          if (c && t && !c.path.length) c.faceToward(t.pos);
          break;
        }
        case 'sit': {
          const spot = this.convos.get(cmd.convoId);
          if (!spot) break;
          spot.sitting = true;
          if (!spot.fire) {
            spot.fire = model('nature/campfire_logs');
            spot.fire.position.set(spot.center.x, 0, spot.center.z);
            spot.fire.scale.setScalar(0.01);
            this.scene.add(spot.fire);
            this.grow(spot.fire, 1);
          }
          // Spread out a little to make room for the fire.
          cmd.members.forEach((pk, i) => {
            const c = this.people.get(pk);
            if (!c || this.pinned(pk)) return;
            const spots = circleSpots(spot.center, cmd.members.length, 0.75);
            this.walkTo(c, spots[i], { instant: cmd.instant, then: () => { c.faceToward(spot.center); c.sit(); } });
          });
          break;
        }
        case 'convo-end': {
          const spot = this.convos.get(cmd.convoId);
          if (spot?.fire) this.shrinkAndRemove(spot.fire);
          this.convos.delete(cmd.convoId);
          for (const pk of cmd.members) {
            if (this.convoOf.get(pk) === cmd.convoId) this.convoOf.delete(pk);
            const c = this.people.get(pk);
            if (c && !this.pinned(pk)) { c.stand(); c.idleFor = 2 + this.wanderRng() * 6; }
          }
          break;
        }
        case 'react': {
          const from = this.people.get(cmd.from), to = this.people.get(cmd.to);
          if (cmd.instant) break;
          from?.cheer();
          this.pulseLandmarks();
          if (from && to && !from.path.length) from.faceToward(to.pos);
          if (to) this.overlay.pop(this.headAnchor(cmd.to, 0.3), cmd.emoji);
          this.pets.get(cmd.to)?.dance();
          break;
        }
        case 'zap': {
          if (cmd.instant) break;
          this.zapEffect(cmd.from, cmd.to, cmd.sats);
          this.pets.get(cmd.to)?.dance(3.5);
          break;
        }
      }
    }
  }

  private convoSpot(id: number, groupId: string): ConvoSpot {
    let s = this.convos.get(id);
    if (s) {
      // A circle that includes you gathers where you stand.
      const me = this.playerPk ? this.people.get(this.playerPk) : null;
      if (me && this.convoOf.get(this.playerPk!) === id) s.center = this.grid.nearestWalkable(me.pos) ?? me.pos;
      return s;
    }
    const others = [...this.convos.values()].filter((c) => c.groupId === groupId).length;
    const slot = this.slotFor(groupId);
    let base = slot ? slot.yard : this.plan.plaza.c;
    if (others > 0 && slot) {
      // Second and later conversations at the same channel spread sideways.
      const side = { x: Math.cos(slot.rot), z: -Math.sin(slot.rot) };
      const k = (others % 2 ? 1 : -1) * Math.ceil(others / 2) * 2.0;
      base = { x: base.x + side.x * k, z: base.z + side.z * k };
    }
    const center = this.grid.nearestWalkable(base) ?? base;
    s = { center, groupId, members: [], fire: null, sitting: false };
    this.convos.set(id, s);
    return s;
  }

  private leaveConvoSpot(pk: string, except?: number): void {
    const prev = this.convoOf.get(pk);
    if (prev === undefined || prev === except) return;
    const s = this.convos.get(prev);
    if (s) s.members = s.members.filter((m) => m !== pk);
    this.convoOf.delete(pk);
  }

  headAnchor(pk: string, extra = 0): { get(): THREE.Vector3 | null } {
    return {
      get: () => {
        const c = this.people.get(pk);
        if (!c || !c.root.visible) return null;
        // Over the head itself, so bubbles rise with a jump or a pull-up.
        return c.headTop(new THREE.Vector3()).add(new THREE.Vector3(0, 0.18 + extra, 0));
      },
    };
  }

  private say(pk: string, msg: WireMessage, to: string | null, instant: boolean): void {
    const { groupId, text } = msg;
    this.hooks.onSay?.(pk, groupId, text, to, instant);
    if (instant) return;
    this.pulse = 1;
    const c = this.people.get(pk);
    if (!c) return;
    c.targetOpacity = 1;
    this.homeward.delete(pk);
    const seconds = Math.min(9, 3.5 + [...text].length * 0.05);
    c.talk(seconds);
    const g = this.groups.get(groupId);
    const header = `${this.nameOf(pk)} · ${g?.name ?? ''}`.toUpperCase();
    this.overlay.say(pk, this.headAnchor(pk), header, text, {
      accent: pubkeyColor(pk),
      seconds,
      reply: to ? this.nameOf(to) : null,
      render: (el) => renderContent(el, msg.content ?? text, { nameOf: (p) => this.nameOf(p), images: msg.images, emojis: msg.emojis }),
      headerOf: () => `${this.nameOf(pk)} · ${g?.name ?? ''}`.toUpperCase(),
      replyOf: () => (to ? this.nameOf(to) : null),
      onClick: () => this.hooks.onBubbleClick?.(msg.id),
    });
    const pts = [c.root.position.clone()];
    const partner = to ? this.people.get(to) : null;
    if (partner) pts.push(partner.root.position.clone());
    this.cam.interest(pts);
  }

  // ── effects ───────────────────────────────────────────────────────────

  private grow(obj: THREE.Object3D, to: number): void {
    this.effects.push({ obj, age: 0, life: 0.6, tick: (e) => obj.scale.setScalar(Math.max(0.01, to * easeOutBack(e.age / e.life))) });
  }

  private shrinkAndRemove(obj: THREE.Object3D): void {
    const s0 = obj.scale.x;
    this.effects.push({
      obj, age: 0, life: 0.5,
      tick: (e) => {
        obj.scale.setScalar(Math.max(0.001, s0 * (1 - e.age / e.life)));
        if (e.age >= e.life) obj.removeFromParent();
      },
    });
  }

  private balloon(c: Character): void {
    c.lift = 7;
    const g = new THREE.Group();
    const color = new THREE.Color(pubkeyColor(c.pk));
    const envelope = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), new THREE.MeshStandardMaterial({ color, flatShading: true }));
    envelope.scale.y = 1.15;
    envelope.position.y = 1.45;
    const basket = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.34), new THREE.MeshStandardMaterial({ color: 0x8a5a33, flatShading: true }));
    basket.position.y = -0.05;
    const ropeMat = new THREE.LineBasicMaterial({ color: 0x5a4030 });
    for (const [x, z] of [[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]]) {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, 0.05, z), new THREE.Vector3(x * 2, 1.15, z * 2)]);
      g.add(new THREE.Line(geo, ropeMat));
    }
    g.add(envelope, basket);
    envelope.castShadow = true;
    this.scene.add(g);
    let released = false;
    this.effects.push({
      obj: g, age: 0, life: 12,
      tick: (e, dt) => {
        if (!released) {
          g.position.set(c.root.position.x, c.lift, c.root.position.z);
          if (c.lift <= 0) { released = true; c.cheer(1.4); }
        } else {
          g.position.y += dt * 1.4;
          g.position.x += dt * 0.6;
          g.rotation.y += dt * 0.3;
          if (e.age > e.life - 0.1) g.removeFromParent();
        }
      },
    });
  }

  private zapEffect(from: string | null, to: string, sats: number): void {
    const t = this.people.get(to);
    if (!t) return;
    const end = t.root.position.clone().setY(CHAR_HEIGHT + 0.2);
    const f = from ? this.people.get(from) : null;
    const start = f ? f.root.position.clone().setY(CHAR_HEIGHT + 0.4) : end.clone().add(new THREE.Vector3(1.5, 8, 0.5));
    f?.cheer();
    this.pulseLandmarks();
    // Jagged bolt.
    const pts: THREE.Vector3[] = [];
    const N = 12;
    for (let i = 0; i <= N; i++) {
      const p = start.clone().lerp(end, i / N);
      if (i > 0 && i < N) p.add(new THREE.Vector3((Math.random() - 0.5) * 0.35, (Math.random() - 0.5) * 0.35 + Math.sin((i / N) * Math.PI) * 0.8, (Math.random() - 0.5) * 0.35));
      pts.push(p);
    }
    const bolt = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.035, 4),
      new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true }),
    );
    this.scene.add(bolt);
    this.effects.push({
      obj: bolt, age: 0, life: 0.7,
      tick: (e) => {
        (bolt.material as THREE.MeshBasicMaterial).opacity = (1 - e.age / e.life) * (Math.random() > 0.2 ? 1 : 0.3);
        if (e.age >= e.life) bolt.removeFromParent();
      },
    });
    // Coin burst.
    const coinGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.015, 10);
    const coinMat = new THREE.MeshStandardMaterial({ color: 0xffc83d, emissive: 0xffa000, emissiveIntensity: 0.6, metalness: 0.6, roughness: 0.3 });
    const count = Math.min(24, 6 + Math.round(Math.log10(Math.max(sats, 1)) * 5));
    for (let i = 0; i < count; i++) {
      const coin = new THREE.Mesh(coinGeo, coinMat);
      coin.position.copy(end);
      const v = new THREE.Vector3((Math.random() - 0.5) * 2.2, 2 + Math.random() * 2, (Math.random() - 0.5) * 2.2);
      this.scene.add(coin);
      this.effects.push({
        obj: coin, age: 0, life: 1.6,
        tick: (e, dt) => {
          v.y -= 7 * dt;
          coin.position.addScaledVector(v, dt);
          if (coin.position.y < 0.02) { coin.position.y = 0.02; v.multiplyScalar(0.4); v.y = Math.abs(v.y) * 0.5; }
          coin.rotation.x += dt * 9;
          if (e.age >= e.life) coin.removeFromParent();
        },
      });
    }
    t.cheer(2);
    this.overlay.pop(this.headAnchor(to, 0.35), `⚡ ${sats.toLocaleString()} sats`, 'pop zap');
    this.cam.interest([end], true);
    this.hooks.onZap?.();
  }

  // ── idle life ─────────────────────────────────────────────────────────

  private idleLife(c: Character, dt: number): void {
    if (c.pk === this.playerPk || this.pinned(c.pk)) return;
    const inside = this.homeward.get(c.pk);
    if (inside !== undefined) {
      const left = inside - dt;
      if (left <= 0) {
        this.homeward.delete(c.pk);
        c.targetOpacity = 1;
        const g = this.homeGroup(c.pk);
        if (g) this.walkTo(c, this.yardSpot(g));
      } else this.homeward.set(c.pk, left);
      return;
    }
    const until = this.seatedUntil.get(c.pk);
    if (until !== undefined) {
      if (this.elapsed > until) { this.stand(c.pk); c.idleFor = 0; }
      return;
    }
    const trainEnd = this.trainUntil.get(c.pk);
    if (trainEnd !== undefined) {
      if (this.elapsed > trainEnd) { this.stopTraining(c.pk); c.idleFor = 0; }
      return;
    }
    if (this.convoOf.has(c.pk) || c.path.length || c.talkingFor > 0 || c.activity === 'sit') return;
    const threshold = 7 + (hashStr(c.pk) % 13);
    if (c.idleFor < threshold) return;
    c.idleFor = 0;
    const home = this.homeGroup(c.pk);
    const roll = this.wanderRng();
    // By day, a coffee at the café now and then.
    if (1 - this.sky.day < 0.3 && roll >= 0.6 && roll < 0.68) {
      const seat = this.seats.find((x) => x.landmark === 'coffee' && !x.taken);
      if (seat) {
        this.reserve(c.pk, seat);
        this.walkTo(c, seat.pos, {
          then: () => {
            this.releasePending(c.pk);
            this.sit(c.pk, seat);
            this.seatedUntil.set(c.pk, this.elapsed + 25 + this.wanderRng() * 35);
          },
        });
        return;
      }
    }
    // Evenings at the parrilla: some neighbours take a place at the table.
    if (1 - this.sky.day > 0.3 && roll >= 0.35 && roll < 0.55) {
      const seat = this.seats.find((x) => x.landmark === 'parrilla' && !x.taken);
      if (seat) {
        this.reserve(c.pk, seat);
        this.walkTo(c, seat.pos, {
          then: () => {
            this.releasePending(c.pk);
            this.sit(c.pk, seat);
            this.seatedUntil.set(c.pk, this.elapsed + 40 + this.wanderRng() * 60);
          },
        });
        return;
      }
    }
    // At night most idle folk head indoors for a while.
    if (this.sky.night && home && roll < 0.35) {
      this.walkTo(c, this.doorOf(home), {
        then: () => { c.targetOpacity = 0; this.homeward.set(c.pk, 40 + this.wanderRng() * 80); },
      });
      return;
    }
    // Sports folk jog a lap of the track.
    if (home && this.districtFor(home) === 'sports' && this.track && roll < 0.4) {
      const lap = trackLap(this.track, 24);
      let k = 0;
      for (let i = 1; i < lap.length; i++) if (dist(lap[i], c.pos) < dist(lap[k], c.pos)) k = i;
      const route = [...lap.slice(k), ...lap.slice(0, k + 1)];
      this.walkTo(c, route[0], { then: () => c.walk(route.slice(1), true) });
      return;
    }
    // Sports folk also do a set in the park.
    if (home && this.districtFor(home) === 'sports' && roll >= 0.4 && roll < 0.6) {
      const st = this.stations.find((x) => !x.taken);
      if (st) {
        this.reserve(c.pk, st);
        const kind = st.kinds[Math.floor(this.wanderRng() * st.kinds.length)];
        this.walkTo(c, this.stationApproach(st), {
          then: () => {
            this.releasePending(c.pk);
            if (this.train(c.pk, st, kind)) this.trainUntil.set(c.pk, this.elapsed + 10 + this.wanderRng() * 14);
          },
        });
        return;
      }
    }
    // Some sit down with a mate for a while.
    if (roll > 0.88) {
      const seat = this.nearestFreeSeat(c.pos, 9, true);
      if (seat) {
        this.reserve(c.pk, seat);
        this.walkTo(c, seat.pos, {
          then: () => {
            this.releasePending(c.pk);
            this.sit(c.pk, seat);
            this.seatedUntil.set(c.pk, this.elapsed + 25 + this.wanderRng() * 40);
          },
        });
        return;
      }
    }
    let target: Vec2;
    if (roll < 0.5 && home) target = this.yardSpot(home, 2.2);
    else if (roll < 0.68) target = this.spotNear(this.plan.plaza.c, this.plan.plaza.r - 0.4, 1.2);
    else if (roll < 0.78) target = this.spotNear(this.plan.pond.c, this.plan.pond.r + 0.6, 0.4);
    else if (roll < 0.86) target = this.spotNear(this.plan.campfire, 1.1, 0.2);
    else {
      const slots = this.usedSlots();
      target = slots.length ? this.yardSpot(this.groupAtSlot(slots[Math.floor(this.wanderRng() * slots.length)].index) ?? '', 1.5) : this.plan.plaza.c;
    }
    this.walkTo(c, target, { run: false });
  }

  private spotNear(c: Vec2, r: number, jitter: number): Vec2 {
    const a = this.wanderRng() * 6.28;
    const rr = r + (this.wanderRng() - 0.5) * jitter;
    const p = { x: c.x + Math.cos(a) * rr, z: c.z + Math.sin(a) * rr };
    return this.grid.nearestWalkable(p) ?? p;
  }

  private groupAtSlot(i: number): string | null {
    for (const [g, s] of this.slotOf) if (s === i) return g;
    return null;
  }

  homeOf = new Map<string, string>();
  private homeGroup(pk: string): string | null {
    return this.homeOf.get(pk) ?? null;
  }

  // ── avatars and pets ──────────────────────────────────────────────────

  /** Someone's chosen look (or a live preview of yours in the creator). */
  setAvatar(pk: string, a: Avatar): void {
    this.avatars.set(pk, a);
    const c = this.people.get(pk);
    if (c) this.applyAvatar(c);
  }

  private applyAvatar(c: Character): void {
    const a = this.avatars.get(c.pk);
    if (!a) return;
    if (a.look) c.setLook(a.look);
    else c.setSkin(a.skin);
    c.setHat(buildHat(a.hat, a.hatColor));
    const pet = this.pets.get(c.pk);
    if (pet && (!a.pet || pet.kind !== a.pet.kind || pet.name !== a.pet.name)) { pet.dispose(); this.pets.delete(c.pk); }
    if (a.pet && !this.pets.has(c.pk)) {
      const p = new Pet(a.pet.kind, a.pet.name, c);
      this.pets.set(c.pk, p);
      this.scene.add(p.root);
    }
  }

  // ── voice ─────────────────────────────────────────────────────────────

  private speakRings = new Map<string, THREE.Mesh>();
  private ringMat = new THREE.MeshBasicMaterial({ color: 0xb4f953, transparent: true, opacity: 0.85, depthWrite: false });

  /** Lime rings under whoever is talking in the call. */
  setSpeaking(pks: Set<string>): void {
    for (const [pk, ring] of this.speakRings) if (!pks.has(pk)) { ring.removeFromParent(); this.speakRings.delete(pk); }
    for (const pk of pks) {
      if (this.speakRings.has(pk)) continue;
      const c = this.people.get(pk);
      if (!c) continue;
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.36, 28), this.ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.03;
      c.root.add(ring);
      this.speakRings.set(pk, ring);
    }
  }

  /** People in a channel's call gather in its pavilion. */
  gatherForCall(channelId: string, pks: string[]): void {
    const slot = this.slotFor(channelId);
    if (!slot) return;
    const others = pks.filter((pk) => pk !== this.playerPk && this.people.has(pk) && !this.pinned(pk));
    const spots = circleSpots(slot.pos, Math.max(2, others.length), 0.7);
    others.forEach((pk, i) => {
      const c = this.people.get(pk)!;
      if (dist(c.pos, slot.pos) < 1.2) return;
      this.stand(pk);
      this.walkTo(c, spots[i], { then: () => c.faceToward(slot.pos) });
    });
  }

  // ── game tables ───────────────────────────────────────────────────────

  /**
   * Live tables (waiting or in play) stand in their channel's yard: a round
   * table with the board painted on top, seat colours and all.
   */
  setGameTables(tables: { gameId: string; channelId: string; board: { rows: number; cols: number; cells: { count: number; owner: number | null }[] } | null; waiting: boolean }[]): void {
    this.gameRoot.clear();
    const perChannel = new Map<string, number>();
    for (const t of tables) {
      const slot = this.slotFor(t.channelId);
      if (!slot) continue;
      const k = perChannel.get(t.channelId) ?? 0;
      if (k >= 2) continue;
      perChannel.set(t.channelId, k + 1);
      const side = { x: Math.cos(slot.rot), z: -Math.sin(slot.rot) };
      const fwd = { x: Math.sin(slot.rot), z: Math.cos(slot.rot) };
      const at = { x: slot.yard.x + side.x * (k ? -0.9 : 0.9) + fwd.x * 0.9, z: slot.yard.z + side.z * (k ? -0.9 : 0.9) + fwd.z * 0.9 };
      const table = buildGameTable(t.board, t.waiting);
      table.position.set(at.x, 0, at.z);
      table.rotation.y = slot.rot;
      table.traverse((o) => { o.userData.gameId = t.gameId; });
      this.gameRoot.add(table);
    }
  }

  // ── sitting and mate ──────────────────────────────────────────────────

  private seatedUntil = new Map<string, number>();

  nearestFreeSeat(p: Vec2, within: number, npc = false): Seat | null {
    let best: Seat | null = null;
    const inside = !npc && this.insideWalkable(p);
    for (const s of this.seats) {
      if (s.taken) continue;
      // Sofas indoors are for players, and only offered from inside the room.
      if (s.indoor && !inside) continue;
      const d = dist(s.pos, p);
      // A landmark's tables stand on its terrace, which you can't walk onto:
      // they count as near from the path in front.
      const reach = s.landmark ? within + 1 : within;
      if (d <= reach && (!best || d < dist(best.pos, p))) best = s;
    }
    return best;
  }

  isSeated(pk: string): boolean {
    return this.seatOf.has(pk);
  }

  /** Sit `pk` on `seat` with a mate in hand. */
  sit(pk: string, seat: Seat): void {
    const c = this.people.get(pk);
    if (!c || seat.taken) return;
    this.stand(pk);
    seat.taken = pk;
    this.seatOf.set(pk, seat);
    // The sitting clip draws the hips back about 25 cm: stand the person a
    // little forward so the hips land on the seat and the legs hang in front.
    c.place({ x: seat.pos.x + Math.sin(seat.face) * 0.1, z: seat.pos.z + Math.cos(seat.face) * 0.1 });
    c.body.rotation.y = seat.face;
    c.faceToward({ x: seat.pos.x + Math.sin(seat.face), z: seat.pos.z + Math.cos(seat.face) });
    // The sitting clip lowers the pelvis to a 45 cm seat: raise or sink the
    // whole person so that lands on this seat.
    c.seatY = seat.y - SIT_SEAT_HEIGHT;
    // Sitting replaces any jump, run or standing-on-furniture state.
    c.resetDrive();
    c.sit();
    if (!c.mate) {
      // A mate, a coffee or a choripán: the character keeps it in the left
      // hand and lifts it to sip or bite (Character.update).
      const prop = seat.prop ?? 'mate';
      if (prop !== 'none') {
        c.mate = prop === 'coffee' ? buildCup() : prop === 'asado' ? buildChoripan() : buildMate();
        // A little larger than life so it reads at village distance.
        c.mate.scale.setScalar(0.75);
        c.body.add(c.mate);
      }
    }
    // At the café, a laptop opens on the table in front of you (a prop only).
    if (seat.laptop && !this.laptops.has(pk)) {
      const lap = buildLaptop();
      const ahead = 0.17;
      lap.position.set(seat.pos.x + Math.sin(seat.face) * ahead, 0.322, seat.pos.z + Math.cos(seat.face) * ahead);
      lap.rotation.y = seat.face;
      this.staticRoot.add(lap);
      this.laptops.set(pk, lap);
    }
  }

  /**
   * Where you stand up to: the nearest spot you can walk from, clear of
   * furniture (seats on a café terrace or under the quincho are inside a
   * building's footprint, and the seat itself is solid).
   */
  exitSpot(from: Vec2, prefer?: number): Vec2 {
    const clear = (p: Vec2) => (this.grid.isWalkable(p) || this.insideWalkable(p))
      && !this.solids.some((b) => p.x > b.minX - 0.2 && p.x < b.maxX + 0.2 && p.z > b.minZ - 0.2 && p.z < b.maxZ + 0.2);
    for (let r = 0.35; r <= 3.5; r += 0.15) {
      const n = Math.max(8, Math.round(r * 16));
      for (let i = 0; i < n; i++) {
        // Try straight back from the table first, then around.
        const a = (prefer ?? 0) + Math.PI + ((i % 2 ? 1 : -1) * Math.ceil(i / 2) * 2 * Math.PI) / n;
        const p = { x: from.x + Math.sin(a) * r, z: from.z + Math.cos(a) * r };
        if (clear(p)) return p;
      }
    }
    return this.grid.nearestWalkable(from) ?? from;
  }

  // ── training (calisthenics park) ──────────────────────────────────────

  private trainUntil = new Map<string, number>();

  /** A walkable spot just outside the park, in front of a station. */
  stationApproach(st: Station): Vec2 {
    const out = { x: st.pos.x - Math.sin(st.face) * 1.3, z: st.pos.z - Math.cos(st.face) * 1.3 };
    return this.grid.isWalkable(out) ? out : this.grid.nearestWalkable?.(out) ?? out;
  }

  nearestStation(p: Vec2, radius: number): Station | null {
    let best: Station | null = null, bd = radius;
    for (const st of this.stations) {
      if (st.taken && st.taken !== this.playerPk) continue;
      const d = dist(p, st.pos);
      if (d < bd) { bd = d; best = st; }
    }
    return best;
  }

  isTraining(pk: string): boolean {
    return this.trainingAt.has(pk);
  }

  /** What `pk` is training and how many reps so far. */
  training(pk: string): { kind: ExerciseKind; reps: number } | null {
    const t = this.trainingAt.get(pk);
    return t ? { kind: t.kind, reps: repsDone(t.kind, this.elapsed - t.since) } : null;
  }

  /** Start a looping exercise at a station (false if its clip can't be built yet). */
  train(pk: string, st: Station, kind: ExerciseKind): boolean {
    const c = this.people.get(pk);
    if (!c) return false;
    this.stand(pk);
    this.stopTraining(pk);
    const name = `${kind}@${st.grip.toFixed(2)}/${st.half ?? 0}:${c.look.body}`;
    if (!this.builtClips.has(name)) {
      const model = buildPerson(c.look)?.root;
      if (!model) return false;
      registerClip(buildExerciseClip(kind, model, st.grip / PERSON_SCALE, name, st.half ? st.half / PERSON_SCALE : undefined));
      this.builtClips.add(name);
    }
    st.taken = pk;
    c.resetDrive();
    c.place(st.pos);
    c.body.rotation.y = st.face;
    c.faceToward({ x: st.pos.x + Math.sin(st.face), z: st.pos.z + Math.cos(st.face) });
    c.exercise = name;
    this.trainingAt.set(pk, { station: st, kind, since: this.elapsed });
    return true;
  }

  stopTraining(pk: string): void {
    const t = this.trainingAt.get(pk);
    this.trainUntil.delete(pk);
    if (!t) return;
    this.trainingAt.delete(pk);
    if (t.station.taken === pk) t.station.taken = null;
    const c = this.people.get(pk);
    if (c) {
      c.exercise = null;
      // Step off the equipment.
      if (c.pos.x === t.station.pos.x && c.pos.z === t.station.pos.z) c.place(this.stationApproach(t.station));
    }
  }

  private builtClips = new Set<string>();

  stand(pk: string): void {
    this.releasePending(pk);
    const seat = this.seatOf.get(pk);
    if (seat) seat.taken = null;
    this.seatOf.delete(pk);
    this.seatedUntil.delete(pk);
    const c = this.people.get(pk);
    if (!c) return;
    c.seatY = 0;
    c.stand();
    if (c.mate) { c.mate.removeFromParent(); c.mate = null; }
    this.laptops.get(pk)?.removeFromParent();
    this.laptops.delete(pk);
  }

  // ── live activities (nostr/activity.ts) ───────────────────────────────

  /** Spots held for someone on their way to them (an NPC's coffee, a claim). */
  private pendingOf = new Map<string, Seat | Station>();

  private reserve(pk: string, place: Seat | Station): void {
    this.releasePending(pk);
    place.taken = `pending:${pk}`;
    this.pendingOf.set(pk, place);
  }

  private releasePending(pk: string): void {
    const place = this.pendingOf.get(pk);
    this.pendingOf.delete(pk);
    if (place?.taken === `pending:${pk}`) place.taken = null;
  }

  /** People placed by a live activity event rather than by their local life. */
  private claims = new Map<string, Claim & { place: Seat | Station | null }>();
  /** Spawned only for a claim (they haven't posted): they leave when it ends. */
  private claimSpawned = new Set<string>();
  /** The Director let them go while they were pinned. */
  private despawnLater = new Set<string>();
  /** Fading out to reappear elsewhere: runs once the character is invisible. */
  private blinks = new Map<string, () => void>();

  /** Steered from elsewhere (a live claim or live movement): local life and the Director leave them be. */
  private pinned(pk: string): boolean {
    return !!this.claims.get(pk)?.place || this.movers.has(pk);
  }

  /** What `pk` is doing, named the way it is published. */
  activityOf(pk: string): Activity | null {
    const seat = this.seatOf.get(pk);
    if (seat) return { spot: seatSpotId(seat.pos), kind: 'sit' };
    const t = this.trainingAt.get(pk);
    if (t) return { spot: stationSpotId(this.stations.indexOf(t.station)), kind: t.kind };
    return null;
  }

  /** The seat or station a spot id names in this village, if any. */
  spotPlace(id: string): Seat | Station | null {
    const s = parseSpot(id);
    if (!s) return null;
    if (s.type === 'station') return this.stations[s.index] ?? null;
    let best: Seat | null = null, bd = 0.5;
    for (const seat of this.seats) {
      if (seatSpotId(seat.pos) === id) return seat;
      const d = dist(seat.pos, s.pos);
      if (d < bd) { bd = d; best = seat; }
    }
    return best;
  }

  /** Whoever holds a live claim on a seat or station near `p`. */
  claimedNear(p: Vec2, within: number): string | null {
    for (const [pk, c] of this.claims) if (c.held && c.place && dist(c.place.pos, p) <= within) return pk;
    return null;
  }

  /**
   * Everyone's live activities (ActivityStore.live): each person runs, or
   * fades across, to their spot and stays there; whoever drops out goes back
   * to their own life.
   */
  syncClaims(list: Claim[]): void {
    const next = new Map(list.filter((c) => c.pk !== this.playerPk && !this.residents.has(c.pk)).map((c) => [c.pk, c]));
    for (const pk of [...this.claims.keys()]) if (!next.has(pk)) this.releaseClaim(pk);
    for (const c of next.values()) {
      const cur = this.claims.get(c.pk);
      if (cur && cur.spot === c.spot && cur.kind === c.kind && cur.held === c.held) continue;
      this.applyClaim(c);
    }
  }

  private applyClaim(cl: Claim): void {
    const pk = cl.pk;
    if (this.claims.has(pk)) this.releaseClaim(pk, true);
    const place = this.spotPlace(cl.spot);
    const station = place && 'kinds' in place ? place : null;
    const seat = place && !station ? (place as Seat) : null;
    if (!place || (station && !station.kinds.includes(cl.kind as ExerciseKind)) || (seat && cl.kind !== 'sit')) {
      // A spot this village doesn't have (a yard stool of another channel set).
      this.claims.set(pk, { ...cl, place: null });
      if (this.claimSpawned.delete(pk)) this.despawn(pk);
      return;
    }
    this.claims.set(pk, { ...cl, place });
    let c = this.people.get(pk);
    const fresh = !c;
    if (!c) { c = this.makePerson(pk); this.claimSpawned.add(pk); }
    this.stand(pk);
    this.stopTraining(pk);
    this.leaveConvoSpot(pk);
    this.convoOf.delete(pk);
    this.homeward.delete(pk);
    if (cl.held) {
      if (place.taken && place.taken !== pk) this.evict(place.taken);
      this.reserve(pk, place);
    }
    // The winner goes to the equipment; someone who lost the race waits beside it.
    const dest = station ? this.stationApproach(station) : cl.held ? seat!.pos : this.exitSpot(seat!.pos, seat!.face);
    const arrive = () => {
      const ch = this.people.get(pk);
      if (!ch || this.claims.get(pk)?.place !== place) return;
      if (!cl.held) { ch.faceToward(place.pos); return; }
      this.releasePending(pk);
      if (seat) this.sit(pk, seat);
      // No clip yet (the body is still loading): the next sync tries again.
      else if (!this.train(pk, station!, cl.kind as ExerciseKind)) this.claims.delete(pk);
    };
    if (fresh) {
      // New in the village: fade in right there.
      c.place(this.grid.nearestWalkable(dest) ?? dest);
      arrive();
      return;
    }
    const path = c.opacity > 0.5 && dist(c.pos, dest) < CLAIM_RUN_RANGE ? this.grid.findPath(c.pos, dest) : null;
    if (path) { c.targetOpacity = 1; c.walk(path, true, arrive); }
    else this.blink(c, dest, arrive);
  }

  /** Fade out, reappear at `to`, fade back in: a soft teleport. */
  private blink(c: Character, to: Vec2, then: () => void): void {
    c.halt();
    c.targetOpacity = 0;
    this.blinks.set(c.pk, () => {
      c.place(this.grid.nearestWalkable(to) ?? to);
      c.targetOpacity = 1;
      then();
    });
  }

  /** Move a villager off a seat or station (or out of its reservation) for a live claim. */
  private evict(holder: string): void {
    const pending = holder.startsWith('pending:');
    const pk = pending ? holder.slice('pending:'.length) : holder;
    if (pk === this.playerPk) return;
    const c = this.people.get(pk);
    if (pending) { this.releasePending(pk); c?.halt(); }
    else {
      const seat = this.seatOf.get(pk);
      this.stand(pk);
      this.stopTraining(pk);
      if (c && seat) c.place(this.exitSpot(seat.pos, seat.face));
    }
    // Off they go, somewhere else.
    if (c) c.idleFor = 99;
  }

  private releaseClaim(pk: string, reapply = false): void {
    const cl = this.claims.get(pk);
    this.claims.delete(pk);
    this.blinks.delete(pk);
    if (!cl?.place || pk === this.playerPk) return;
    const c = this.people.get(pk);
    const seat = this.seatOf.get(pk);
    this.stand(pk);
    this.stopTraining(pk);
    if (c) {
      c.halt();
      c.targetOpacity = 1;
      if (seat) c.place(this.exitSpot(seat.pos, seat.face));
      c.idleFor = 0;
    }
    if (reapply || this.movers.has(pk)) return;
    const spawned = this.claimSpawned.delete(pk);
    if (this.despawnLater.delete(pk) || spawned) this.despawn(pk);
  }

  // ── live movement (nostr/motion.ts) ───────────────────────────────────

  /** People walking live in another browser → when their motion goes stale (elapsed s). */
  private movers = new Map<string, number>();

  /**
   * Someone's latest movement, `ageS` seconds old: walk them where they are
   * going at their own pace, or fade them across when this screen has them
   * far from where they really are. A live claim (sitting, training) wins.
   */
  applyMotion(pk: string, m: Motion, ageS: number): void {
    if (pk === this.playerPk || this.residents.has(pk)) return;
    this.movers.set(pk, this.elapsed + MOVER_STALE_S);
    if (this.claims.get(pk)?.place) return;
    const age = THREE.MathUtils.clamp(ageS, 0, 1.5);
    const speeds = { walk: PLAYER_WALK, run: PLAYER_RUN };
    const now = this.walkable(extrapolate(m, age, speeds));
    // Keys: keep walking a little past the next correction; a click: its destination.
    const target = m.moving ? this.walkable(m.dest ?? this.straightAhead(m.p, extrapolate(m, age + MOVER_LEAD_S, speeds))) : now;
    let c = this.people.get(pk);
    if (!c) {
      c = this.makePerson(pk);
      this.claimSpawned.add(pk);
      c.place(now);
    }
    c.pace = speeds;
    if (this.seatOf.has(pk)) this.stand(pk);
    this.stopTraining(pk);
    this.releasePending(pk);
    this.leaveConvoSpot(pk);
    this.convoOf.delete(pk);
    this.homeward.delete(pk);
    this.blinks.delete(pk);
    const go = () => {
      const ch = this.people.get(pk);
      if (!ch) return;
      const far = dist(ch.pos, target) > 0.05;
      let path = far ? this.grid.findPath(ch.pos, target) : null;
      // Inside a building the grid stops at its door (it ends on the nearest
      // cell it knows): walk the rest straight in, or straight out of the room.
      if (far && this.insideWalkable(target) && !this.grid.isWalkable(target)) path = [...(path ?? []), target];
      else if (far && !path && this.insideWalkable(ch.pos)) path = [target];
      if (path) ch.walk(path, m.run);
      else ch.halt();
    };
    if (c.opacity < 0.5 && c.targetOpacity === 1) { go(); return; }
    if (dist(c.pos, now) > MOVER_BLINK_M) this.blink(c, now, go);
    else { c.targetOpacity = 1; go(); }
  }

  /** Forget movers whose movement went quiet: back to local life, or gone if they only came to move. */
  expireMotion(): void {
    for (const [pk, until] of this.movers) {
      if (until > this.elapsed) continue;
      this.movers.delete(pk);
      const c = this.people.get(pk);
      if (c) { c.pace = null; c.idleFor = 0; }
      if (this.claims.get(pk)?.place) continue;
      const spawned = this.claimSpawned.delete(pk);
      if (this.despawnLater.delete(pk) || spawned) this.despawn(pk);
    }
  }

  private walkable(p: Vec2): Vec2 {
    return this.grid.isWalkable(p) || this.insideWalkable(p) ? p : this.grid.nearestWalkable(p) ?? p;
  }

  /** As far towards `to` as the ground allows in a straight line (keys don't walk through walls). */
  private straightAhead(from: Vec2, to: Vec2): Vec2 {
    const d = dist(from, to);
    const steps = Math.ceil(d / 0.25);
    let last = from;
    for (let i = 1; i <= steps; i++) {
      const p = { x: from.x + ((to.x - from.x) * i) / steps, z: from.z + ((to.z - from.z) * i) / steps };
      if (!this.grid.isWalkable(p) && !this.insideWalkable(p)) break;
      last = p;
    }
    return last;
  }

  // ── picking ───────────────────────────────────────────────────────────

  private installPicking(): void {
    let down: { x: number; y: number } | null = null;
    this.canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
    this.canvas.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
      // In first person a click grabs the mouse for looking around.
      if (this.cam.firstPerson) return;
      const rect = this.canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      this.raycaster.setFromCamera(ndc, this.camera);
      const ground = this.staticRoot.getObjectByName('ground');
      const targets: THREE.Object3D[] = [...[...this.people.values()].map((c) => c.root), this.gameRoot, this.buildingRoot, ...[...this.landmarks.values()].map((b) => b.group), ...(ground ? [ground] : [])];
      const hit = this.raycaster.intersectObjects(targets, true)[0];
      if (!hit) return;
      if (hit.object === ground) { this.hooks.onGroundClick?.({ x: hit.point.x, z: hit.point.z }); return; }
      let o: THREE.Object3D | null = hit.object;
      while (o) {
        if (o.userData.pk) { this.hooks.onPersonClick?.(o.userData.pk); return; }
        if (o.userData.gameId) { this.hooks.onGameClick?.(o.userData.gameId); return; }
        if (o.userData.landmark) { this.hooks.onLandmarkClick?.(o.userData.landmark as LandmarkId); return; }
        if (o.userData.groupId) { this.hooks.onGroupClick?.(o.userData.groupId); return; }
        o = o.parent;
      }
    });
  }

  /** First person: hide your own body (you are its eyes). */
  setFirstPerson(on: boolean): void {
    const c = this.playerPk ? this.people.get(this.playerPk) : null;
    if (!c) { this.cam.setFirstPerson(false); return; }
    this.cam.setFirstPerson(on, c.body.rotation.y);
    c.body.visible = !on;
    c.badge.visible = !on;
  }

  /** Make `pk` the viewer's character (or none), spawning it at the plaza. */
  setPlayer(pk: string | null): void {
    const prev = this.playerPk ? this.people.get(this.playerPk) : null;
    if (prev) prev.external = null;
    // Your own activity from another tab doesn't steer you here.
    if (pk) this.releaseClaim(pk);
    this.playerPk = pk;
    if (!pk) return;
    if (!this.people.has(pk)) this.spawn(pk, '', 'instant');
    const c = this.people.get(pk)!;
    c.targetOpacity = 1;
    this.homeward.delete(pk);
  }

  playerSpawnPoint(): Vec2 {
    const c = this.plan.plaza.c;
    return this.grid.nearestWalkable({ x: c.x, z: c.z + this.plan.plaza.r - 0.6 }) ?? c;
  }

  navGrid(): NavGrid {
    return this.grid;
  }

  /** Channel yards, for place detection. */
  yards(): { groupId: string; yard: Vec2 }[] {
    const out: { groupId: string; yard: Vec2 }[] = [];
    for (const id of this.groups.keys()) {
      const s = this.slotFor(id);
      if (s) out.push({ groupId: id, yard: s.yard });
    }
    return out;
  }

  /** Camera yaw (look direction on the ground, atan2(dx, dz)). */
  cameraYaw(): number {
    if (this.cam.firstPerson) return this.cam.fpYaw;
    const t = this.cam.controls.target, p = this.camera.position;
    return Math.atan2(t.x - p.x, t.z - p.z);
  }

  personAnchor(pk: string): () => THREE.Vector3 | null {
    return () => {
      const c = this.people.get(pk);
      // Half a metre above the floor under them (raised floors, upstairs). Not
      // groundY: your own character's height arrives through drive() instead.
      return c ? c.root.position.clone().setY(this.groundAt(c.pos) + ANCHOR_Y) : null;
    };
  }

  groupAnchor(groupId: string): () => THREE.Vector3 | null {
    return () => {
      const s = this.slotFor(groupId);
      return s ? new THREE.Vector3((s.pos.x + s.yard.x) / 2, 0.8, (s.pos.z + s.yard.z) / 2) : null;
    };
  }

  // ── frame ─────────────────────────────────────────────────────────────

  frame(): number {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    this.elapsed += dt;
    this.sky.update(dt, this.elapsed);
    const night01 = 1 - this.sky.day;
    for (const m of this.island?.water ?? []) {
      m.uniforms.uTime.value = this.elapsed;
      m.uniforms.uDay.value = this.sky.day;
    }
    this.swayUniform.value = this.elapsed;
    this.lampGlow.emissiveIntensity = night01 * 3;
    for (const l of this.lampLights) l.intensity = night01 * 6;
    this.pulse = Math.max(0, this.pulse - dt * 0.8);
    this.obelisk?.setGlow(night01, this.pulse + (Math.sin(this.elapsed * 2) * 0.5 + 0.5) * 0.08);
    for (const b of this.landmarks.values()) { b.setNight(night01, this.elapsed); b.update?.(dt, this.elapsed); }
    this.updateInteriors();
    this.mill?.setNight(night01);
    this.mill?.update(dt, this.elapsed);
    for (const b of this.buildings.values()) for (const w of b.windows) w.visible = night01 > 0.4;
    if (this.fireflies) {
      (this.fireflies.material as THREE.PointsMaterial).opacity = night01 * (0.7 + Math.sin(this.elapsed * 3) * 0.3);
      this.fireflies.rotation.y = this.elapsed * 0.01;
    }
    this.post.setNight(night01);

    for (const p of this.pets.values()) p.update(dt);
    for (const [pk, then] of [...this.blinks]) {
      const c = this.people.get(pk);
      if (!c) this.blinks.delete(pk);
      else if (c.opacity === 0) { this.blinks.delete(pk); then(); }
    }
    for (const c of this.people.values()) {
      // The viewer's own height comes with drive(); seats carry their own height.
      c.groundY = c.external || this.seatOf.has(c.pk) ? 0 : this.groundAt(c.pos);
      c.update(dt);
      if (!this.residents.has(c.pk)) this.idleLife(c, dt);
    }
    for (const c of [...this.leaving]) {
      if (!c.update(dt)) { c.dispose(); this.leaving.delete(c); }
    }
    for (const e of [...this.effects]) {
      e.age += dt;
      e.tick(e, dt);
      if (e.age >= e.life) this.effects = this.effects.filter((x) => x !== e);
    }
    this.cam.update(dt);
    this.post.setTiltAmount(this.cam.introProgress);
    this.overlay.update();
    this.post.render(dt);
    return dt;
  }
}

function easeOutBack(t: number): number {
  const c1 = 1.70158, c3 = c1 + 1;
  const x = Math.min(1, t);
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

function trackLapPoints(site: { c: Vec2; rot: number }): Vec2[] {
  return trackLap(site, 48);
}

const SEAT_HEX = [0xff4d5e, 0xb4f953, 0x38bdf8, 0xfbbf24, 0xc084fc, 0xf472b6, 0xfb923c, 0x2dd4bf];

/** A round table with a Chain Reaction board painted on its top. */
function buildGameTable(board: { rows: number; cols: number; cells: { count: number; owner: number | null }[] } | null, waiting: boolean): THREE.Group {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a33, flatShading: true });
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 16), wood);
  top.position.y = 0.42;
  top.castShadow = true;
  g.add(top);
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.42, 8), wood);
  leg.position.y = 0.21;
  g.add(leg);
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#121212';
  ctx.fillRect(0, 0, 128, 128);
  if (board) {
    const cell = Math.min(120 / board.cols, 120 / board.rows);
    const ox = (128 - cell * board.cols) / 2, oy = (128 - cell * board.rows) / 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    for (let r = 0; r < board.rows; r++) for (let q = 0; q < board.cols; q++) {
      ctx.strokeRect(ox + q * cell, oy + r * cell, cell, cell);
      const v = board.cells[r * board.cols + q];
      if (!v || !v.count || v.owner === null) continue;
      ctx.fillStyle = `#${SEAT_HEX[v.owner % SEAT_HEX.length].toString(16).padStart(6, '0')}`;
      for (let k = 0; k < Math.min(v.count, 3); k++) {
        ctx.beginPath();
        ctx.arc(ox + q * cell + cell / 2 + (k - (Math.min(v.count, 3) - 1) / 2) * cell * 0.22, oy + r * cell + cell / 2, cell * 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else {
    ctx.fillStyle = waiting ? '#b4f953' : '#555';
    ctx.font = 'bold 22px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(waiting ? 'JOIN' : '…', 64, 72);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.38, 24), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35 }));
  face.rotation.x = -Math.PI / 2;
  face.position.y = 0.447;
  g.add(face);
  if (waiting) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.015, 6, 32), new THREE.MeshBasicMaterial({ color: 0xb4f953 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.45;
    g.add(ring);
  }
  return g;
}

/**
 * One tuft of grass: five curved, tapered blades fanned around a point, each
 * three segments tall, dark at the root and light at the tip (vertex colour,
 * multiplied by the instance's tint). Bend grows toward the tip, so the
 * wind sway (which scales with height) reads as a real blade flexing.
 */
function grassTuft(): THREE.BufferGeometry {
  const pos: number[] = [];
  const colr: number[] = [];
  const idx: number[] = [];
  const BLADES = 5, SEG = 3;
  const r = rng(77);
  for (let b = 0; b < BLADES; b++) {
    const yaw = (b / BLADES) * Math.PI * 2 + r() * 0.8;
    const h = 0.12 + r() * 0.09, w = 0.022 + r() * 0.01, lean = 0.03 + r() * 0.06;
    const ox = (r() - 0.5) * 0.05, oz = (r() - 0.5) * 0.05;
    const dir = { x: Math.sin(yaw), z: Math.cos(yaw) };
    const side = { x: dir.z, z: -dir.x };
    const base = pos.length / 3;
    for (let i = 0; i <= SEG; i++) {
      const f = i / SEG;
      const half = (w / 2) * (1 - f * 0.92);
      const bend = lean * f * f;
      const cx = ox + dir.x * bend, cz = oz + dir.z * bend, y = h * f;
      pos.push(cx - side.x * half, y, cz - side.z * half, cx + side.x * half, y, cz + side.z * half);
      const shade = 0.42 + f * 0.62;
      colr.push(shade * 0.92, shade, shade * 0.8, shade * 0.92, shade, shade * 0.8);
      if (i > 0) {
        const k = base + i * 2;
        idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  g.setIndex(idx);
  // Lit like the lawn it grows from: thin blades with sideways normals go
  // black on their shadow side.
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length / 3).fill(0).flatMap(() => [0, 1, 0]), 3));
  return g;
}
