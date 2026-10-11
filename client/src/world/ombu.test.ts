// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { buildVoiceTree } from './ombu';

describe('the voice tree and its campfire', () => {
  const t = buildVoiceTree(2, 0x3f6fc4, 7);
  const fire = t.fire.group.position;
  const faces = (p: { x: number; z: number }, face: number, at: { x: number; z: number }) =>
    Math.sin(face) * (at.x - p.x) + Math.cos(face) * (at.z - p.z) > 0;

  it('has a fire in front of the trunk, clear of it', () => {
    expect(fire.z).toBeGreaterThan(t.trunkR + 0.3);
  });

  it('rings the fire with log seats facing it, none on the trunk’s side, each holding a marshmallow', () => {
    expect(t.seats.length).toBeGreaterThanOrEqual(4);
    for (const s of t.seats) {
      expect(faces(s.pos, s.face, { x: fire.x, z: fire.z })).toBe(true);
      expect(Math.hypot(s.pos.x, s.pos.z)).toBeGreaterThan(t.trunkR + 0.15);
      expect(s.prop).toBe('marshmallow');
    }
  });

  it('leaves room for three benches outside the logs, facing the fire', () => {
    expect(t.benchSpots).toHaveLength(3);
    for (const b of t.benchSpots) {
      expect(Math.hypot(b.pos.x - fire.x, b.pos.z - fire.z)).toBeGreaterThan(0.9);
      expect(faces(b.pos, b.face, { x: fire.x, z: fire.z })).toBe(true);
    }
  });

  it('flickers', () => {
    const flame = t.fire.group.children.find((o) => (o as { geometry?: { type?: string } }).geometry?.type === 'ConeGeometry')!;
    t.update(0.1, 1);
    const a = flame.scale.y;
    t.update(0.37, 1);
    expect(flame.scale.y).not.toBeCloseTo(a, 3);
  });
});
