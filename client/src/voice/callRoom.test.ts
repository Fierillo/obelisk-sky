import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AWAY_LEAVE_S, CallRoom, awayCountdown, micMessage, RECONNECT_DELAYS, screenMessage } from './callRoom';

/** A stand-in for obelisk-dex's VoiceClient: records calls, fails on demand. */
function fakeVoice(opts: { joinDelay?: number; joinFails?: number; micError?: Error; screenError?: Error; camError?: Error } = {}) {
  const made: Fake[] = [];
  let joinFails = opts.joinFails ?? 0;
  class Fake {
    left = false;
    mic: boolean[] = [];
    screen: boolean[] = [];
    events: { onLeft: () => void; onParticipantsChange: (p: string[]) => void; onRemoteTracksChange: (t: unknown[]) => void };
    constructor(readonly channel: string, readonly o: { events: Fake['events']; expectSfu?: boolean }) { this.events = o.events; made.push(this); }
    async setScreenShareEnabled(on: boolean) { if (opts.screenError && on) throw opts.screenError; this.screen.push(on); }
    cam: boolean[] = [];
    async setCameraEnabled(on: boolean) { if (opts.camError && on) throw opts.camError; this.cam.push(on); }
    getLocalTracks() { return { mic: null, camera: null, screen: null }; }
    async join() {
      if (opts.joinDelay) await new Promise((r) => setTimeout(r, opts.joinDelay));
      if (joinFails > 0) { joinFails--; throw new Error('relay said no'); }
    }
    async leave() { this.left = true; }
    async setMicEnabled(on: boolean) { if (opts.micError) throw opts.micError; this.mic.push(on); }
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

  it('names screen-share problems', () => {
    expect(screenMessage(new Error('screenTaken'))).toMatch(/already sharing/);
    expect(screenMessage(Object.assign(new Error(), { name: 'NotAllowedError' }))).toMatch(/cancelled/);
  });
});

describe('the theater in a call', () => {
  /** A stream with `audio` and `video` track stubs. */
  const stream = (audio: number, video: number) => ({ getAudioTracks: () => Array(audio).fill({}), getVideoTracks: () => Array(video).fill({}) });
  beforeEach(() => {
    vi.stubGlobal('Audio', class { srcObject: unknown = null; autoplay = false; muted = false; play() { return Promise.resolve(); } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('goes through the SFU for voice-sfu channels, and joins quiet when asked', async () => {
    const f = fakeVoice();
    const r = room(f.load);
    await r.join('big', { ...signer, sfu: true, mic: false });
    expect(f.made[0].o.expectSfu).toBe(true);
    expect(f.made[0].mic).toEqual([]);
    await r.join('small', signer);
    expect(f.made[1].o.expectSfu).toBe(false);
    expect(f.made[1].mic).toEqual([true]);
  });

  it('keeps the shared screen and its sound, and the gate mutes and hides what the host has not allowed', async () => {
    const f = fakeVoice();
    const r = room(f.load);
    await r.join('cine', signer);
    const film = stream(0, 1), filmSound = stream(1, 0);
    f.made[0].events.onRemoteTracksChange([
      { pubkey: 'host', kind: 'audio', stream: stream(1, 0) },
      { pubkey: 'host', kind: 'screen', stream: film },
      { pubkey: 'host', kind: 'screen-audio', stream: filmSound },
      { pubkey: 'viewer', kind: 'audio', stream: stream(1, 0) },
      { pubkey: 'viewer', kind: 'camera', stream: stream(0, 1) },
    ]);
    expect(r.state.screen).toEqual({ pubkey: 'host', stream: film, kind: 'screen' });
    expect(r.audible('host')).toBe(true);
    expect(r.audible('host', 'screen-audio')).toBe(true);
    expect(r.audible('viewer')).toBe(true);
    r.setGate((pk) => pk === 'host');
    expect(r.audible('viewer')).toBe(false);
    expect(r.audible('host')).toBe(true);
    r.setGate((pk, kind) => kind === 'mic');
    // The viewer's camera isn't allowed either: nothing on screen, and the host's screen is listed as waiting.
    expect(r.state.screen).toBeNull();
    expect(r.state.refusedScreens).toEqual(['host']);
    expect(r.audible('host', 'screen-audio')).toBe(false);
    r.setGate(null);
    expect(r.state.screen?.pubkey).toBe('host');
  });

  it('shares your screen, and says why when it cannot', async () => {
    const f = fakeVoice({ screenError: new Error('screenTaken') });
    const r = room(f.load);
    await r.join('cine', signer);
    await r.setScreenShare(true);
    expect(r.state.sharing).toBe(false);
    expect(r.state.error).toMatch(/already sharing/);
    const g = fakeVoice();
    const r2 = room(g.load);
    await r2.join('cine', signer);
    await r2.setScreenShare(true);
    expect(g.made[0].screen).toEqual([true]);
    expect(r2.state.sharing).toBe(true);
  });

  it('shows a camera when nobody shares a screen', async () => {
    const f = fakeVoice();
    const r = room(f.load);
    await r.join('cine', signer);
    const cam = stream(0, 1);
    f.made[0].events.onRemoteTracksChange([{ pubkey: 'bob', kind: 'camera', stream: cam }]);
    expect(r.state.screen).toEqual({ pubkey: 'bob', stream: cam, kind: 'camera' });
  });

  it('turns the camera on and off, and says why when it cannot', async () => {
    const f = fakeVoice();
    const r = room(f.load);
    await r.join('cine', signer);
    await r.setCamera(true);
    expect(f.made[0].cam).toEqual([true]);
    expect(r.state.camOn).toBe(true);
    await r.setCamera(false);
    expect(r.state.camOn).toBe(false);
    const g = fakeVoice({ camError: Object.assign(new Error(), { name: 'NotAllowedError' }) });
    const r2 = room(g.load);
    await r2.join('cine', signer);
    await r2.setCamera(true);
    expect(r2.state).toMatchObject({ camOn: false });
    expect(r2.state.error).toMatch(/Camera blocked/);
  });
});
