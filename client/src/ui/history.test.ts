import { describe, it, expect } from 'vitest';
import { binCounts, dragRange, spanSeconds, timeToX, topPeaks, xToTime } from './history';

describe('history panel helpers', () => {
  it('counts messages into bins over the span, ignoring the rest', () => {
    expect(binCounts([0, 1, 5, 9.9, 10, -1], 0, 10, 2)).toEqual([2, 2]);
    expect(binCounts([], 0, 10, 4)).toEqual([0, 0, 0, 0]);
    expect(binCounts([5], 10, 10, 3)).toEqual([0, 0, 0]);
  });

  it('ranks the busiest stretches in view, newest first on a tie', () => {
    const ep = (start: number, count: number) => ({ start, end: start + 60, count, groupId: 'g' });
    const eps = [ep(100, 5), ep(200, 30), ep(300, 12), ep(400, 30), ep(5000, 99)];
    expect(topPeaks(eps, 0, 1000, 3).map((e) => e.start)).toEqual([400, 200, 300]);
  });

  it('maps panel positions to times and back', () => {
    expect(xToTime(0.5, 100, 200)).toBe(150);
    expect(xToTime(-1, 100, 200)).toBe(100);
    expect(timeToX(150, 100, 200)).toBe(0.5);
  });

  it('turns a drag into a range, and a click into the hour after it', () => {
    expect(dragRange(0.8, 0.2, 0, 1000)).toEqual({ start: 200, end: 800 });
    const now = 10_000;
    expect(dragRange(0.5, 0.501, now - spanSeconds('7d'), now)).toEqual({ start: now - spanSeconds('7d') / 2, end: now - spanSeconds('7d') / 2 + 3600 });
    expect(dragRange(1, 1, 0, 1000).end).toBe(1000); // never past now
  });
});
