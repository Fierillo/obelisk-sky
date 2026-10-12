import { describe, it, expect } from 'vitest';
import { audible, clusterDancers, loopBars, musicFor, emoteSounds, SELF_SHOT_GAIN, SHOT_GAIN } from './emoteMusic';
import { barSeconds, nextBar } from './synthLoops';

describe('emote music', () => {
  it('only dances, workouts and the lotus play music', () => {
    expect(musicFor('groove')).toBe('dance');
    expect(musicFor('dance')).toBe('dance2');
    expect(musicFor('jacks')).toBe('workout');
    expect(musicFor('pushup')).toBe('workout');
    expect(musicFor('lotus')).toBe('zen');
    expect(musicFor('yes')).toBeNull();
    expect(musicFor('sangre')).toBeNull();
    // You, training at the park or the gym (world.ts dancers adds only your own).
    expect(musicFor('train')).toBe('workout');
  });

  it('a track loops on whole bars, so its beat stays on the grid', () => {
    // 2:54 at 128 BPM (1.875 s a bar): 92 whole bars.
    expect(loopBars('workout', 173.98)).toBeCloseTo(92 * 1.875);
    expect(loopBars('dance', 64)).toBeCloseTo(64);
  });

  it('Sangreee... plays its sound near, round after round, from where the round is', () => {
    const ds = [
      { pk: 'a', x: 2, z: 0, kind: 'sangre' as const, since: 1000 },
      { pk: 'b', x: 40, z: 0, kind: 'sangre' as const, since: 1000 },
      { pk: 'c', x: 1, z: 0, kind: 'groove' as const, since: 1000 },
    ];
    const s = emoteSounds(ds, { x: 0, z: 0 }, 3500);
    expect(s).toEqual([{ key: 'sangre.mp3:a:1000', pks: ['a'], file: 'sangre.mp3', x: 2, z: 0, every: 7, offset: 2.5 }]);
    // Two rounds and a half in: half a second into the third.
    expect(emoteSounds(ds, { x: 0, z: 0 }, 1000 + 14_500)[0].offset).toBeCloseTo(0.5);
    // Two in step (one anchor) are one sound, from the nearer, counted from the anchor.
    const pair = emoteSounds([
      { pk: 'a', x: 4, z: 0, kind: 'sangre', since: 2000, anchor: 1000 },
      { pk: 'b', x: 1, z: 0, kind: 'sangre', since: 1000, anchor: 1000 },
    ], { x: 0, z: 0 }, 4500);
    expect(pair).toHaveLength(1);
    expect(pair[0]).toMatchObject({ pks: ['a', 'b'], x: 1, offset: 3.5 });
    // Louder than the music bus (0.45), loudest for the one doing it.
    expect(SHOT_GAIN).toBeGreaterThan(0.45);
    expect(SELF_SHOT_GAIN).toBeGreaterThan(SHOT_GAIN);
    // Not dancers: they keep playing music, not a one-shot.
    expect(clusterDancers(ds)).toHaveLength(1);
  });

  it('dancers near each other share one song: the first one\'s', () => {
    const cs = clusterDancers([
      { pk: 'b', x: 0, z: 0, kind: 'jacks', since: 20 },
      { pk: 'a', x: 3, z: 0, kind: 'groove', since: 10 },
      { pk: 'c', x: 7, z: 0, kind: 'dance', since: 30 }, // near a: chained in
      { pk: 'd', x: 40, z: 0, kind: 'lotus', since: 5 },
      { pk: 'e', x: 1, z: 1, kind: 'yes', since: 1 }, // no music
    ]);
    expect(cs).toHaveLength(2);
    const near = cs.find((c) => c.members.includes('a'))!;
    expect(near.members).toEqual(['a', 'b', 'c']);
    expect(near.leader).toBe('a');
    expect(near.music).toBe('dance');
    expect(near.x).toBeCloseTo(10 / 3);
  });

  it('is heard only nearby, the nearest groups first', () => {
    const cs = clusterDancers([
      { pk: 'a', x: 2, z: 0, kind: 'groove', since: 1 },
      { pk: 'b', x: -4.5, z: 0, kind: 'groove', since: 1 },
      { pk: 'c', x: 0, z: 5.5, kind: 'groove', since: 1 },
      { pk: 'd', x: 12, z: 0, kind: 'groove', since: 1 },
    ]);
    expect(audible(cs, { x: 0, z: 0 }).map((c) => c.leader)).toEqual(['a', 'b']);
    // Not from across the plaza: past HEAR_M (6 m) there's nothing.
    expect(audible(cs, { x: 0, z: -7 })).toEqual([]);
    expect(audible(cs, { x: 100, z: 0 })).toEqual([]);
  });

  it('starts every loop on a shared bar grid', () => {
    expect(barSeconds('dance')).toBe(2);
    expect(nextBar('dance', 3.1)).toBe(4);
    expect(nextBar('dance', 4)).toBe(4);
    expect(nextBar('workout', 0.1) % barSeconds('workout')).toBeCloseTo(0);
  });
});
