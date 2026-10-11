// Your character's movement: keyboard (camera-relative), click-to-walk and a
// touch joystick, all resolved against the island's NavGrid so you can't
// walk through buildings, water or off the edge. Pure: no three.js, no DOM;
// input.ts feeds it, world.ts reads the position.

import { dist, type NavGrid, type Vec2 } from '../world/layout';

// Matched to the people's walk and jog cycles (feet don't slide).
export const WALK_SPEED = 0.78;
export const RUN_SPEED = 2.6;
/** Take-off speed and gravity: a jump about 0.43 high, 0.53 s in the air. */
export const JUMP_SPEED = 3.2;
export const GRAVITY = 12;
/** You can still jump this long after stepping off an edge… */
export const COYOTE_TIME = 0.1;
/** …and a press this early before landing still counts. */
export const JUMP_BUFFER = 0.12;

/** Solid furniture: blocks walking, but can be jumped onto and stood on. */
export interface Solid { minX: number; maxX: number; minZ: number; maxZ: number; top: number }

/** Getting up to speed and coming to a stop take a moment, not a frame (s). */
export const ACCEL_TAU = 0.09;
export const DECEL_TAU = 0.07;

/** You step onto anything this low without jumping (a kerb, a mat). */
export const STEP_UP = 0.06;
/** Raised ground (a bridge's arch, a ramp) is climbed and descended by the
 *  distance you move, up to this slope, so a long step (a slow frame, a
 *  run) doesn't stall on it or hop off it. */
export const MAX_RAMP_SLOPE = 0.9;

/** The highest solid under p (0 = the ground). */
export function surfaceAt(solids: readonly Solid[], p: Vec2, pad = 0): number {
  let top = 0;
  for (const s of solids) {
    if (p.x >= s.minX - pad && p.x <= s.maxX + pad && p.z >= s.minZ - pad && p.z <= s.maxZ + pad && s.top > top) top = s.top;
  }
  return top;
}

export interface MoveInput {
  /** -1..1 on each axis, in camera space: x = right, y = forward. */
  x: number;
  y: number;
  run: boolean;
  /** Space (or the touch button) went down since the last step. */
  jump?: boolean;
}

export class PlayerController {
  pos: Vec2;
  heading = 0;
  moving = false;
  running = false;
  /** Waypoints from a click-to-walk; any keyboard input cancels them. */
  path: Vec2[] = [];
  /** Height above the ground and vertical speed (jumping). */
  height = 0;
  vy = 0;
  private sinceGrounded = 0;
  private jumpBuffered = 0;
  /** Set on the frame you land, for a landing squash. */
  landed = false;
  /** How far the last step moved you (for following ramps). */
  private lastMove = 0;
  private prevPos: Vec2 | null = null;
  /** Current keyboard speed and direction (eases toward the input). */
  private spd = 0;
  private dir: Vec2 = { x: 0, z: 0 };

  get airborne(): boolean {
    // Just stepped down a stair or a ramp (snapped on the next step): still on your feet.
    const moved = this.prevPos ? dist(this.pos, this.prevPos) : 0;
    const slack = this.sinceGrounded === 0 ? STEP_UP + moved * MAX_RAMP_SLOPE : 1e-4;
    return this.height > this.floorAt(this.pos, 0.02) + slack || this.vy > 0;
  }

  constructor(
    private grid: () => NavGrid, start: Vec2, private solids: () => readonly Solid[] = () => [],
    /** Extra walkable ground the grid doesn't know (inside buildings you can enter). */
    private extraWalkable: (p: Vec2) => boolean = () => false,
    /** Raised ground that isn't furniture (stairs, a raised floor): smooth, so you walk up it. */
    private ground: (p: Vec2) => number = () => 0,
  ) {
    this.pos = { ...start };
  }

  /** What your feet stand on at p: the highest solid or the raised ground. */
  floorAt(p: Vec2, pad = 0): number {
    return Math.max(surfaceAt(this.solids(), p, pad), this.ground(p));
  }

  walkTo(target: Vec2): boolean {
    const p = this.grid().findPath(this.pos, target);
    this.path = p ?? [];
    return !!p;
  }

  /**
   * Advance by `dt` seconds. `cameraYaw` is the camera's azimuth (radians,
   * the direction it looks along, measured like Math.atan2(dx, dz)), so "up"
   * on the keyboard walks away from the camera.
   */
  step(dt: number, input: MoveInput, cameraYaw: number): void {
    this.lastMove = this.prevPos ? dist(this.pos, this.prevPos) : 0;
    this.prevPos = { ...this.pos };
    this.stepVertical(dt, !!input.jump);
    const mag = Math.hypot(input.x, input.y);
    this.running = input.run;
    if (mag > 0.05) {
      this.path = [];
      const nx = input.x / Math.max(1, mag), ny = input.y / Math.max(1, mag);
      // Forward is the camera's look direction on the ground plane.
      // Screen-right of a camera looking along (fx, fz) is (-fz, fx) in this
      // right-handed, y-up world (looking down +z, right is -x).
      const fx = Math.sin(cameraYaw), fz = Math.cos(cameraYaw);
      const rx = -fz, rz = fx;
      const dx = fx * ny + rx * nx, dz = fz * ny + rz * nx;
      const speed = (input.run ? RUN_SPEED : WALK_SPEED) * Math.min(1, mag);
      this.spd = speed + (this.spd - speed) * Math.exp(-dt / ACCEL_TAU);
      const dl = Math.hypot(dx, dz) || 1;
      this.dir = { x: dx / dl, z: dz / dl };
      this.tryMove(dx * this.spd * dt, dz * this.spd * dt);
      this.heading = Math.atan2(dx, dz);
      this.moving = true;
      return;
    }
    if (this.path.length) {
      const t = this.path[0];
      const d = dist(this.pos, t);
      if (d < 0.05) { this.path.shift(); this.moving = this.path.length > 0; return; }
      const speed = (input.run ? RUN_SPEED : WALK_SPEED) * dt;
      const k = Math.min(1, speed / d);
      const dx = (t.x - this.pos.x) * k, dz = (t.z - this.pos.z) * k;
      this.pos = { x: this.pos.x + dx, z: this.pos.z + dz };
      this.heading = Math.atan2(dx, dz);
      this.moving = true;
      this.spd = 0;
      return;
    }
    // Keys let go: a short coast to a stop.
    if (this.spd > 0.05) {
      this.spd *= Math.exp(-dt / DECEL_TAU);
      this.tryMove(this.dir.x * this.spd * dt, this.dir.z * this.spd * dt);
      this.moving = this.spd > 0.2;
      return;
    }
    this.spd = 0;
    this.moving = false;
  }

  /** Gravity, take-off and landing. Horizontal movement keeps working in the air. */
  stepVertical(dt: number, jump: boolean): void {
    this.landed = false;
    if (jump) this.jumpBuffered = JUMP_BUFFER;
    else this.jumpBuffered = Math.max(0, this.jumpBuffered - dt);
    // `height` is your feet's height: the ground is 0, a bench its seat.
    const floor = this.floorAt(this.pos, 0.02);
    // Walking down a slope or stairs keeps your feet on it (no little falls).
    if (this.sinceGrounded === 0 && this.vy <= 0 && this.height > floor && this.height - floor <= STEP_UP + this.lastMove * MAX_RAMP_SLOPE) this.height = floor;
    const grounded = this.height <= floor + 1e-4 && this.vy <= 0;
    this.sinceGrounded = grounded ? 0 : this.sinceGrounded + dt;
    if (this.jumpBuffered > 0 && this.sinceGrounded <= COYOTE_TIME && this.vy <= 0) {
      this.vy = JUMP_SPEED;
      this.jumpBuffered = 0;
      this.sinceGrounded = COYOTE_TIME + 1; // one jump per take-off
    }
    if (this.height > floor + 1e-4 || this.vy > 0) {
      this.vy -= GRAVITY * dt;
      this.height += this.vy * dt;
      if (this.height <= floor) {
        this.height = floor;
        this.vy = 0;
        this.landed = true;
      }
    } else {
      this.height = floor; // stepped onto something low
    }
  }

  /** Move, sliding along walls: try the full step, then each axis alone. */
  private tryMove(dx: number, dz: number): void {
    const g = this.grid();
    const pad = 0.18;
    // Furniture is solid below your feet: walk around it, or jump onto it.
    // (Inside one already, say after a teleport, you can always walk out.)
    // Raised ground is a ramp: each step rises a little, well under STEP_UP.
    const here = this.floorAt(this.pos, 0.12);
    const tooHigh = (p: Vec2) => {
      const t = this.floorAt(p, 0.12);
      if (t <= here) return false;
      // Ground (not furniture) rises with the distance: you walk up it.
      const ramp = this.ground(p) >= t - 1e-6 ? Math.hypot(p.x - this.pos.x, p.z - this.pos.z) * MAX_RAMP_SLOPE : 0;
      return t > this.height + STEP_UP + ramp;
    };
    const walk = (p: Vec2) => g.isWalkable(p) || this.extraWalkable(p);
    const ok = (p: Vec2) => walk(p)
      && walk({ x: p.x + Math.sign(dx) * pad, z: p.z })
      && walk({ x: p.x, z: p.z + Math.sign(dz) * pad })
      && !tooHigh(p);
    const full = { x: this.pos.x + dx, z: this.pos.z + dz };
    if (ok(full)) { this.pos = full; return; }
    const onlyX = { x: this.pos.x + dx, z: this.pos.z };
    if (dx && ok(onlyX)) { this.pos = onlyX; return; }
    const onlyZ = { x: this.pos.x, z: this.pos.z + dz };
    if (dz && ok(onlyZ)) this.pos = onlyZ;
  }
}

/** Which channel's yard you're standing in, if any. */
export function placeAt(pos: Vec2, yards: { groupId: string; yard: Vec2 }[], radius = 2.6): string | null {
  let best: string | null = null;
  let bd = radius;
  for (const y of yards) {
    const d = dist(pos, y.yard);
    if (d < bd) { bd = d; best = y.groupId; }
  }
  return best;
}
