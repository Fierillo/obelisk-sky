// What makes first person feel like a body rather than a camera on a rail:
// a step bob and sway tied to your stride, a dip when you land, a little
// roll as you strafe or turn, and a wider view when you run. Pure; the
// Cameraman adds the offsets to the eye every frame.

export interface FeelInput {
  /** Horizontal speed (m/s, village units). */
  speed: number;
  running: boolean;
  airborne: boolean;
  /** Touched down this frame. */
  landed: boolean;
  /** −1 (left) … 1 (right): sideways part of the movement. */
  strafe: number;
  /** Yaw change, rad/s (looking around). */
  turn: number;
}

export interface FeelOffsets {
  /** Up (+) / down (−) and sideways (+ right) offsets of the eye, metres. */
  up: number;
  side: number;
  /** Camera roll, radians (+ tilts right). */
  roll: number;
  /** Degrees added to the field of view. */
  fov: number;
}

/** Village people are 0.72 tall: a stride is about 0.33 of a step. */
const STEP_LENGTH = 0.33;
// Kept small: the eye already rides a body that walks (world.ts eyeOf).
const BOB_WALK = 0.003;
const BOB_RUN = 0.007;
const LAND_KICK = 0.35;
const SPRING_K = 170;
const SPRING_DAMP = 2 * Math.sqrt(SPRING_K) * 0.75;
export const RUN_FOV_KICK = 6;

const damp = (a: number, b: number, rate: number, dt: number) => a + (b - a) * (1 - Math.exp(-rate * dt));

export class FpFeel {
  private phase = 0;
  private amp = 0;
  private dip = 0;
  private dipV = 0;
  private roll = 0;
  private fov = 0;

  step(dt: number, i: FeelInput): FeelOffsets {
    // Steps: the phase advances with distance, so the bob matches the feet.
    const onFoot = !i.airborne && i.speed > 0.05;
    this.phase += (i.speed * dt * Math.PI) / STEP_LENGTH;
    const target = onFoot ? (i.running ? BOB_RUN : BOB_WALK) * Math.min(1, i.speed / (i.running ? 2.6 : 0.78)) : 0;
    this.amp = damp(this.amp, target, 10, dt);
    // Landing: a spring pushed down, settling back.
    if (i.landed) this.dipV -= LAND_KICK;
    const acc = -SPRING_K * this.dip - SPRING_DAMP * this.dipV;
    this.dipV += acc * dt;
    this.dip += this.dipV * dt;
    // A slight lean into strafes and turns.
    const lean = Math.max(-0.02, Math.min(0.02, i.strafe * 0.02 + i.turn * 0.004));
    this.roll = damp(this.roll, lean, 8, dt);
    this.fov = damp(this.fov, i.running && i.speed > 1 ? RUN_FOV_KICK : 0, 4, dt);
    return {
      up: -this.amp * (1 - Math.cos(2 * this.phase)) * 0.5 + this.dip,
      side: Math.sin(this.phase) * this.amp * 0.25,
      roll: this.roll,
      fov: this.fov,
    };
  }

  /** Stride phase and bob amplitude now (the hands swing with them). */
  get stride(): { phase: number; amp: number } {
    return { phase: this.phase, amp: this.amp };
  }

  reset(): void {
    this.amp = this.dip = this.dipV = this.roll = this.fov = 0;
  }
}
