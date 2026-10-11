import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AWAY_LEAVE_S, CallRoom, awayCountdown, micMessage, RECONNECT_DELAYS } from './callRoom';

/** A stand-in for obelisk-dex's VoiceClient: records calls, fails on demand. */
function fakeVoice(opts: { joinDelay?: number; joinFails?: number; micError?: Error } = {}) {
  const made: Fake[] = [];
  let joinFails = opts.joinFails ?? 0;
  class Fake {
    left = false;
    events: { onLeft: () => void; onParticipantsChange: (p: string[]) => void };
    constructor(readonly channel: string, o: { events: Fake['events'] }) { this.events = o.events; made.push(this); }
    async join() {
      if (opts.joinDelay) await new Promise((r) => setTimeout(r, opts.joinDelay));
      if (joinFails > 0) { joinFails--; throw new Error('relay said no'); }
    }
    async leave() { this.left = true; }
    async setMicEnabled(_on: boolean) { if (opts.micError) throw opts.micError; }
  }
  return { made, load: async () => Fake as never };
}
const hub = { query: async () => ({ events: [] }) } as never;
const room = (load: () => Promise<never>) => new CallRoom(hub, () => 'wss://relay.test', load);
const signer = { open: true, signer: 'nsec' as const };

describe('voice calls', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('joins, and leaving mid-join cancels that join instead of leaking a client', async () => {
    const f = fakeVoice({ joinDelay: 1000 });
    const r = room(f.load);
    const joining = r.join('a', signer);
    await vi.advanceTimersByTimeAsync(10);
    expect(r.state.joining).toBe(true);
    await r.leave(); // a relay switch, say
    await vi.advanceTimersByTimeAsync(1500);
    await joining;
    expect(r.state.channelId).toBeNull();
    expect(f.made.every((c) => c.left)).toBe(true);
  });

  it('reconnects with backoff when the call drops, and gives up after a few tries', async () => {
    const f = fakeVoice();
    const r = room(f.load);
    await r.join('a', signer);
    expect(r.state.joining).toBe(false);
    f.made[0].events.onLeft(); // dropped by the relay
    expect(r.state.reconnecting).toBe(1);
    await vi.advanceTimersByTimeAsync(RECONNECT_DELAYS[0] * 1000 + 50);
    expect(f.made).toHaveLength(2);
    expect(r.state).toMatchObject({ channelId: 'a', joining: false, reconnecting: 0 });
  });

  it('stops retrying when joins keep failing', async () => {
    const f = fakeVoice({ joinFails: 99 });
    const r = room(f.load);
    await r.join('a', signer);
    for (const d of RECONNECT_DELAYS) await vi.advanceTimersByTimeAsync(d * 1000 + 50);
    expect(f.made).toHaveLength(RECONNECT_DELAYS.length + 1);
    expect(r.state.channelId).toBeNull();
    expect(r.state.error).toBe('relay said no');
  });

  it('a blocked microphone leaves you listening, and says why', async () => {
    const err = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    const r = room(fakeVoice({ micError: err }).load);
    await r.join('a', signer);
    expect(r.state).toMatchObject({ channelId: 'a', joining: false, micOn: false, micBlocked: true });
    expect(r.state.error).toMatch(/allow it/);
    await r.setMic(true); // still refused: no false "mic on"
    expect(r.state.micOn).toBe(false);
  });

  it('counts down when you walk away from the call, unless you chose to stay', () => {
    expect(awayCountdown(true, 'a', 'a', 99, false)).toBeNull();
    expect(awayCountdown(true, null, 'a', 0, false)).toBe(AWAY_LEAVE_S);
    expect(awayCountdown(true, 'b', 'a', AWAY_LEAVE_S - 3.2, false)).toBe(4);
    expect(awayCountdown(true, null, 'a', AWAY_LEAVE_S + 5, false)).toBe(0);
    expect(awayCountdown(true, null, 'a', 10, true)).toBeNull();
    expect(awayCountdown(false, null, null, 10, false)).toBeNull();
  });

  it('names microphone problems', () => {
    expect(micMessage(Object.assign(new Error(), { name: 'NotFoundError' }))).toMatch(/No microphone/);
    expect(micMessage('?')).toMatch(/unavailable/);
  });
});
