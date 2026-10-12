import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Soundscape } from './sound';

/** Just enough of an AudioContext to count what gets started. */
class FakeCtx {
  state: 'running' | 'suspended' = 'suspended';
  currentTime = 0;
  sampleRate = 8000;
  destination = {};
  started = { noise: 0, osc: 0 };
  resumes = 0;
  resume() { this.resumes++; this.state = 'running'; return Promise.resolve(); }
  private node() { return { connect: (n: unknown) => n, gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} } }; }
  createGain() { return this.node(); }
  createBiquadFilter() { return { ...this.node(), type: '', frequency: { value: 0 }, Q: { value: 0 } }; }
  createBuffer(_c: number, n: number) { const d = new Float32Array(n); return { getChannelData: () => d }; }
  createBufferSource() { return { ...this.node(), buffer: null, playbackRate: { value: 1 }, start: () => { this.started.noise++; } }; }
  createOscillator() {
    const f = { setValueAtTime() {}, exponentialRampToValueAtTime() {} };
    return { ...this.node(), type: '', frequency: f, start: () => { this.started.osc++; }, stop() {} };
  }
}

describe('the soundscape', () => {
  let ctx: FakeCtx;
  beforeEach(() => {
    vi.useFakeTimers();
    ctx = new FakeCtx();
    vi.stubGlobal('AudioContext', function () { return ctx; });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('wakes audio a browser held, on the next gesture', () => {
    const s = new Soundscape();
    s.setEnabled(true);
    ctx.state = 'suspended';
    const before = ctx.resumes;
    s.wake();
    expect(ctx.resumes).toBe(before + 1);
    s.setEnabled(false);
    ctx.state = 'suspended';
    s.wake();
    expect(ctx.resumes).toBe(before + 1); // sound off: left alone
  });

  it('plays your footsteps, walking and running, unless they are switched off', () => {
    const s = new Soundscape();
    s.setEnabled(true);
    s.footstep(false);
    s.footstep(true);
    expect(ctx.started.noise).toBe(2);
    s.footsteps = false;
    s.footstep(false);
    expect(ctx.started.noise).toBe(2);
  });

  it('crickets follow the ambient switch, not the sound switch alone', () => {
    const s = new Soundscape();
    s.night = true;
    s.ambience = false;
    s.setEnabled(true);
    vi.advanceTimersByTime(900 * 30);
    expect(ctx.started.osc).toBe(0);
    s.ambience = true;
    vi.advanceTimersByTime(900 * 30);
    expect(ctx.started.osc).toBeGreaterThan(0);
  });
});
