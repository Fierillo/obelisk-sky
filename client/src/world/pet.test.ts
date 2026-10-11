import { describe, it, expect } from 'vitest';
import { stepPet, type PetMotion } from './pet';

const pet = (): PetMotion => ({ x: 0, z: -1, yaw: 0, vel: 0, anim: 'idle' });

describe('a pet following its owner', () => {
  it('settles at its owner’s running pace instead of lagging and lunging', () => {
    const m = pet();
    const anims: string[] = [];
    let ownerZ = 0;
    for (let i = 0; i < 600; i++) {
      ownerZ += 2.6 / 60;
      stepPet(m, { x: 0, z: ownerZ }, 1 / 60);
      if (i > 120) anims.push(m.anim);
    }
    expect(Math.abs(m.vel - 2.6)).toBeLessThan(0.1);
    expect(ownerZ - m.z).toBeLessThan(1.2);
    expect(new Set(anims)).toEqual(new Set(['run'])); // no walk/run flicker
  });

  it('walks at a walking owner’s pace, close behind', () => {
    const m = pet();
    let ownerZ = 0;
    for (let i = 0; i < 600; i++) { ownerZ += 0.78 / 60; stepPet(m, { x: 0, z: ownerZ }, 1 / 60); }
    expect(m.anim).toBe('walk');
    expect(ownerZ - m.z).toBeLessThan(0.5);
  });

  it('comes to rest at the heel and turns smoothly, not in a snap', () => {
    const m = pet();
    for (let i = 0; i < 300; i++) stepPet(m, { x: 0, z: 0 }, 1 / 60);
    expect(m.anim).toBe('idle');
    const m2: PetMotion = { x: 0, z: 0, yaw: 0, vel: 0, anim: 'idle' };
    stepPet(m2, { x: -3, z: 0 }, 1 / 60);
    stepPet(m2, { x: -3, z: 0 }, 1 / 60);
    expect(Math.abs(m2.yaw)).toBeLessThan(Math.PI / 2 * 0.5); // still turning toward −x
  });
});
