import { describe, it, expect } from 'vitest';
import { nearestPlaces, trackOffset, PLACE_TRACKS, type Place } from './placeMusic';

describe('music at places', () => {
  const places: Place[] = [
    { kind: 'campfire', x: 8, z: 0 },
    { kind: 'campfire', x: 3, z: 0 },
    { kind: 'campfire', x: -4, z: 0 },
    { kind: 'parrilla', x: 0, z: 12 },
    { kind: 'parrilla', x: 0, z: 40 },
  ];

  it('only the nearest place plays: places never mix', () => {
    expect(nearestPlaces(places, { x: 0, z: 0 })).toEqual([{ kind: 'campfire', x: 3, z: 0 }]);
    // Halfway between a campfire and the parrilla: whichever is nearer for its reach, alone.
    expect(nearestPlaces(places, { x: 0, z: 8 })).toEqual([{ kind: 'parrilla', x: 0, z: 12 }]);
    expect(nearestPlaces(places, { x: 8, z: 1 })).toEqual([{ kind: 'campfire', x: 8, z: 0 }]);
  });

  it('nothing past a track\'s reach', () => {
    expect(nearestPlaces(places, { x: 0, z: -40 })).toEqual([]);
    const edge = PLACE_TRACKS.campfire.reach;
    expect(nearestPlaces([{ kind: 'campfire', x: edge, z: 0 }], { x: 0, z: 0 })).toEqual([]);
    expect(nearestPlaces([{ kind: 'campfire', x: edge - 0.1, z: 0 }], { x: 0, z: 0 })).toHaveLength(1);
  });

  it('every screen is at the same point in the track at the same wall time', () => {
    expect(trackOffset(1_700_000_010_500, 30)).toBeCloseTo((1_700_000_010.5) % 30);
    expect(trackOffset(45_000, 30)).toBeCloseTo(15);
  });
});
