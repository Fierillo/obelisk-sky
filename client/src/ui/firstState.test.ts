import { describe, it, expect, vi, afterEach } from 'vitest';
import { FirstState } from './firstState';

afterEach(() => { vi.useRealTimers(); });

describe("waiting for the village's first state", () => {
  it('goes on at once when no feed is running (logged out)', async () => {
    const s = new FirstState();
    expect(await s.wait(() => false)).toBe('none');
  });

  it('goes on as soon as a snapshot arrives, whichever feed sent it', async () => {
    vi.useFakeTimers();
    const s = new FirstState();
    const done = s.wait(() => true, 6000);
    await vi.advanceTimersByTimeAsync(1200);
    s.arrived();
    expect(await done).toBe('arrived');
    // Later waits don't wait at all.
    expect(await s.wait(() => true)).toBe('arrived');
    expect(s.has).toBe(true);
  });

  it('notices a snapshot queued without passing through `arrived`', async () => {
    vi.useFakeTimers();
    const s = new FirstState();
    let queued = false;
    const done = s.wait(() => { if (queued) s.arrived(); return true; }, 6000);
    await vi.advanceTimersByTimeAsync(300);
    queued = true;
    await vi.advanceTimersByTimeAsync(150);
    expect(await done).toBe('arrived');
  });

  it('stops waiting when the feed goes away (refused, logged out) and gives up at the cap', async () => {
    vi.useFakeTimers();
    let feed = true;
    const a = new FirstState().wait(() => feed, 6000);
    await vi.advanceTimersByTimeAsync(500);
    feed = false;
    await vi.advanceTimersByTimeAsync(150);
    expect(await a).toBe('none');
    const b = new FirstState().wait(() => true, 6000);
    await vi.advanceTimersByTimeAsync(6200);
    expect(await b).toBe('timeout');
  });
});
