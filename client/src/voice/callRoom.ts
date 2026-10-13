// A voice call in a channel's pavilion: obelisk-dex's own mesh VoiceClient
// (vendored, loaded on first join), so people in the village and in the app
// are in the same call. Remote voices are placed in 3D: each one comes from
// where that person stands, heard from where you stand and face.
//
// Robustness: a leave (or a relay switch) mid-join cancels that join; a
// dropped call reconnects a few times with backoff; a blocked microphone
// leaves you listening, and says so; voices of people who aren't on the
// island play from where you stand instead of a stale spot.
//
// The theater uses the same room: a shared screen (with its sound) is kept
// for the hall's big screen, a `voice-sfu` channel goes through obelisk's
// SFU so a full audience fits, and a gate (the host's grants) mutes voices
// and hides screens it doesn't allow, here, on the receiving side.

import type { RelayHub } from '@nostr-wot/relay/hub';
import type { RemoteTrack } from '@/services/voice/room-state';
import { silentVoiceUiSink } from '@/services/voice/ui-sink';

type VoiceClientT = import('@/services/voice/client').VoiceClient;
type VoiceClientCtor = typeof import('@/services/voice/client').VoiceClient;

export interface CallState {
  channelId: string | null;
  joining: boolean;
  participants: string[];
  speaking: Set<string>;
  micOn: boolean;
  /** The microphone was refused or is missing: you can listen, not talk. */
  micBlocked: boolean;
  /** Reconnecting after the call dropped (attempt number), or 0. */
  reconnecting: number;
  error: string | null;
  /** The screen being shared in the call (allowed by the gate), else a camera, or null. */
  screen: { pubkey: string; stream: MediaStream; kind: 'screen' | 'camera' } | null;
  /** People sharing a screen the gate refuses (the theater's host can let them on). */
  refusedScreens: string[];
  /** You are sharing your screen. */
  sharing: boolean;
  /** Your camera is on. */
  camOn: boolean;
}

export type JoinOpts = {
  open: boolean;
  signer: 'nsec' | 'nip07' | 'bunker';
  /** A `voice-sfu` channel: through obelisk's SFU (big rooms) instead of the mesh. */
  sfu?: boolean;
  /** Turn the microphone on once in (default true; the theater's viewers join quiet). */
  mic?: boolean;
};

/** What a gate decides on: someone's voice, or their shared screen (and its sound). */
export type GateKind = 'mic' | 'screen';
export type Gate = (pubkey: string, kind: GateKind) => boolean;

/** Out of the call's yard this long (s), you leave the call unless you chose to stay. */
export const AWAY_LEAVE_S = 25;

/** Seconds left before walking away ends the call, or null (you're there, or staying). */
export function awayCountdown(inCall: boolean, place: string | null, callChannel: string | null, awayFor: number, staying: boolean): number | null {
  if (!inCall || staying || !callChannel || place === callChannel) return null;
  return Math.max(0, Math.ceil(AWAY_LEAVE_S - awayFor));
}

/** Waits before each reconnect attempt (s); then it gives up. */
export const RECONNECT_DELAYS = [2, 5, 12];

/** Turn a microphone error into words. */
export function micMessage(e: unknown): string {
  const name = e instanceof Error ? e.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Microphone blocked: allow it in the browser to talk. You can still listen.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No microphone found. You can still listen.';
  return 'Microphone unavailable. You can still listen.';
}

/** Turn a screen-share error into words. */
export function screenMessage(e: unknown): string {
  const msg = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  if (/screenTaken|taken/i.test(msg)) return 'Someone else is already sharing their screen.';
  if (/NotAllowed|denied|Permission/i.test(msg)) return 'Screen sharing was cancelled.';
  if (/NotSupported|getDisplayMedia/i.test(msg)) return 'This browser can’t share its screen.';
  return 'Could not share the screen.';
}

/** A remote sound: a voice (placed where the person stands) or a shared screen's sound (unplaced). */
interface Voice {
  pubkey: string;
  kind: 'audio' | 'screen-audio';
  el: HTMLAudioElement;
  panner: PannerNode | null;
  gain: GainNode | null;
  src: MediaStreamAudioSourceNode | null;
}

const EMPTY_STATE: Omit<CallState, 'micBlocked' | 'error'> = { channelId: null, joining: false, participants: [], speaking: new Set(), micOn: false, reconnecting: 0, screen: null, sharing: false, camOn: false, refusedScreens: [] };

export class CallRoom {
  state: CallState = { ...EMPTY_STATE, speaking: new Set(), micBlocked: false, error: null };
  private client: VoiceClientT | null = null;
  /** Keyed `<pubkey>|<kind>`. */
  private voices = new Map<string, Voice>();
  private tracks: RemoteTrack[] = [];
  private loggedTracks = new Set<string>();
  private gate: Gate = () => true;
  private screenVolume = 1;
  private ctx: AudioContext | null = null;
  private listeners = new Set<() => void>();
  /** Bumped by every join and leave: an older join that wakes up finds it stale and backs out. */
  private attempt = 0;
  /** The call you asked to be in (kept across reconnects; cleared by leave). */
  private wanted: { channelId: string; opts: JoinOpts } | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private hub: RelayHub,
    private relayOf: () => string,
    /** Loads obelisk-dex's VoiceClient (tests pass a fake). */
    private load: () => Promise<VoiceClientCtor> = async () => { await import('./node-globals'); return (await import('@/services/voice/client')).VoiceClient; },
  ) {}

  private get relay(): string {
    return this.relayOf();
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  async join(channelId: string, opts: JoinOpts): Promise<void> {
    if (this.state.channelId === channelId && (this.state.joining || this.client)) return;
    await this.leave();
    this.wanted = { channelId, opts };
    await this.connect(channelId, opts, 0);
  }

  private async connect(channelId: string, opts: JoinOpts, retry: number): Promise<void> {
    const token = ++this.attempt;
    const stale = () => token !== this.attempt;
    this.set({ channelId, joining: true, error: null, participants: [], speaking: new Set(), reconnecting: retry });
    let client: VoiceClientT | null = null;
    try {
      const [VoiceClient, roles] = await Promise.all([this.load(), this.roles(channelId)]);
      if (stale()) return;
      const sink = silentVoiceUiSink();
      sink.setSpeaking = (pk, on) => {
        const s = new Set(this.state.speaking);
        if (on) s.add(pk); else s.delete(pk);
        this.set({ speaking: s });
      };
      sink.setError = (code) => this.set({ error: String(code) });
      client = new VoiceClient(channelId, {
        members: roles.members,
        admins: roles.admins,
        open: opts.open,
        expectSfu: opts.sfu === true,
        originRelayUrl: this.relay,
        signer: opts.signer,
        uiSink: sink,
        events: {
          onParticipantsChange: (pks) => this.set({ participants: pks }),
          onRemoteTracksChange: (tracks) => this.syncTracks(tracks),
          onLocalTracksChange: (l) => { this.set({ micOn: l.mic, sharing: l.screen, camOn: l.camera }); this.pickScreen(); },
          onError: (code) => { if (!stale()) this.set({ error: String(code) }); },
          // Dropped without asking (the relay, the network): try again.
          onLeft: () => { if (!stale()) this.dropped(); },
        },
      });
      this.client = client;
      await client.join();
      if (stale()) { await client.leave().catch(() => {}); return; }
      this.ctx ??= newAudioContext();
      void this.ctx?.resume();
      if (opts.mic !== false) {
        try {
          await client.setMicEnabled(true);
          this.set({ micBlocked: false });
        } catch (e) {
          this.set({ micBlocked: true, micOn: false, error: micMessage(e) });
        }
      }
      if (stale()) return;
      this.set({ joining: false, reconnecting: 0 });
    } catch (e) {
      if (stale()) { await client?.leave().catch(() => {}); return; }
      this.client = null;
      await client?.leave().catch(() => {});
      this.set({ error: e instanceof Error ? e.message : 'could not join' });
      this.dropped(retry);
    }
  }

  /** The call fell over (or a join failed): reconnect a few times, then give up. */
  private dropped(retry = 0): void {
    const w = this.wanted;
    this.client = null;
    this.releaseVoices();
    if (!w || retry >= RECONNECT_DELAYS.length) {
      this.wanted = null;
      this.set({ ...EMPTY_STATE, speaking: new Set() });
      return;
    }
    this.set({ joining: true, participants: [], speaking: new Set(), reconnecting: retry + 1, screen: null, sharing: false, refusedScreens: [] });
    const token = this.attempt;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (token === this.attempt && this.wanted === w) void this.connect(w.channelId, w.opts, retry + 1);
    }, RECONNECT_DELAYS[retry] * 1000);
  }

  async leave(): Promise<void> {
    this.attempt++;
    this.wanted = null;
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
    const c = this.client;
    this.client = null;
    if (c) await c.leave().catch(() => {});
    this.cleanup();
  }

  async setMic(on: boolean): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.setMicEnabled(on);
      this.set({ micOn: on, micBlocked: false, error: null });
    } catch (e) {
      this.set({ micOn: false, micBlocked: true, error: micMessage(e) });
    }
  }

  /** Your camera on or off (in the theater it shows on the big screen when nobody shares one). */
  async setCamera(on: boolean): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.setCameraEnabled(on);
      this.set({ camOn: on, error: null });
    } catch (e) {
      const name = e instanceof Error ? e.name : '';
      this.set({ camOn: false, error: on ? (name === 'NotAllowedError' ? 'Camera blocked: allow it in the browser.' : name === 'NotFoundError' ? 'No camera found.' : 'Camera unavailable.') : null });
    }
  }

  /** Share your screen (with its sound, where the browser offers it), or stop. */
  async setScreenShare(on: boolean): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.setScreenShareEnabled(on);
      this.set({ sharing: on, error: null });
    } catch (e) {
      this.set({ sharing: false, error: on ? screenMessage(e) : null });
    }
  }

  /**
   * Who may be heard and whose screen may be seen (the theater's grants).
   * Applied at once to every sound and to the shared screen.
   */
  setGate(gate: Gate | null): void {
    this.gate = gate ?? (() => true);
    for (const v of this.voices.values()) this.applyGain(v);
    this.pickScreen();
  }

  /** Is `pubkey`'s voice (or their screen's sound) playing now? False when there's none or the gate mutes it. */
  audible(pubkey: string, kind: Voice['kind'] = 'audio'): boolean {
    const v = this.voices.get(`${pubkey}|${kind}`);
    if (!v) return false;
    return v.gain ? v.gain.gain.value > 0 : !v.el.muted;
  }

  /** The shared screen's loudness (0..1). */
  setScreenVolume(v: number): void {
    this.screenVolume = Math.min(1, Math.max(0, v));
    for (const v2 of this.voices.values()) if (v2.kind === 'screen-audio') this.applyGain(v2);
  }

  /** Each frame: you are the listener; everyone's voice comes from their character. */
  updatePositions(me: { x: number; z: number; yaw: number } | null, posOf: (pk: string) => { x: number; z: number } | null): void {
    if (!this.ctx || !me) return;
    const L = this.ctx.listener;
    const t = this.ctx.currentTime;
    if (L.positionX) {
      L.positionX.setTargetAtTime(me.x, t, 0.05);
      L.positionY.setTargetAtTime(1, t, 0.05);
      L.positionZ.setTargetAtTime(me.z, t, 0.05);
      L.forwardX.setTargetAtTime(Math.sin(me.yaw), t, 0.05);
      L.forwardZ.setTargetAtTime(Math.cos(me.yaw), t, 0.05);
    }
    for (const v of this.voices.values()) {
      if (!v.panner) continue;
      // Not on the island (in the app, or out of view): right beside you.
      const p = posOf(v.pubkey) ?? { x: me.x, z: me.z };
      v.panner.positionX.setTargetAtTime(p.x, t, 0.05);
      v.panner.positionY.setTargetAtTime(1, t, 0.05);
      v.panner.positionZ.setTargetAtTime(p.z, t, 0.05);
    }
  }

  /** Members and admins (39002 / 39001), for closed rooms' voice gate. */
  private async roles(channelId: string): Promise<{ members: string[]; admins: string[] }> {
    try {
      const r = await this.hub.query({ relays: [this.relay], filters: [{ kinds: [39001, 39002], '#d': [channelId] }], maxWaitMs: 4000, label: 'sky-voice-roles' });
      const pick = (kind: number) => r.events.filter((e) => e.kind === kind).sort((a, b) => b.created_at - a.created_at)[0]?.tags.filter((t) => t[0] === 'p' && t[1]).map((t) => t[1]) ?? [];
      return { members: pick(39002), admins: pick(39001) };
    } catch {
      return { members: [], admins: [] };
    }
  }

  private syncTracks(tracks: RemoteTrack[]): void {
    // Which video arrived, once each: the first thing to look at when a screen doesn't show.
    for (const t of tracks) {
      if (t.kind === 'audio' || t.kind === 'screen-audio' || this.loggedTracks.has(t.trackId)) continue;
      this.loggedTracks.add(t.trackId);
      console.info('[sky] call video', t.kind, t.pubkey.slice(0, 8), `video tracks: ${t.stream.getVideoTracks().length}`);
    }
    this.tracks = tracks;
    const sounds = new Map<string, { pubkey: string; kind: Voice['kind']; stream: MediaStream }>();
    for (const t of tracks) {
      const kind = t.kind === 'audio' ? 'audio' : t.kind === 'screen-audio' ? 'screen-audio' : null;
      if (kind && t.stream.getAudioTracks().length > 0) sounds.set(`${t.pubkey}|${kind}`, { pubkey: t.pubkey, kind, stream: t.stream });
    }
    for (const [key, v] of this.voices) if (!sounds.has(key)) { this.dropVoice(v); this.voices.delete(key); }
    for (const [key, t] of sounds) {
      if (this.voices.has(key)) continue;
      // Chrome only feeds a remote WebRTC stream into Web Audio while a media
      // element is playing it; the element stays muted, the graph speaks.
      const el = new Audio();
      el.srcObject = t.stream;
      el.autoplay = true;
      let panner: PannerNode | null = null;
      let gain: GainNode | null = null;
      let src: MediaStreamAudioSourceNode | null = null;
      try {
        this.ctx ??= newAudioContext();
        if (!this.ctx) throw new Error('no Web Audio');
        src = this.ctx.createMediaStreamSource(t.stream);
        gain = this.ctx.createGain();
        if (t.kind === 'audio') {
          panner = new PannerNode(this.ctx, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 2, maxDistance: 40, rolloffFactor: 0.8 });
          src.connect(gain).connect(panner).connect(this.ctx.destination);
        } else {
          // The film's sound: the same everywhere in the hall.
          src.connect(gain).connect(this.ctx.destination);
        }
        el.muted = true;
      } catch {
        el.muted = false; // no Web Audio: plain playback
      }
      const v: Voice = { pubkey: t.pubkey, kind: t.kind, el, panner, gain, src };
      this.voices.set(key, v);
      this.applyGain(v);
      void el.play().catch(() => {});
    }
    this.pickScreen();
  }

  /** Mute what the gate refuses; the screen's sound at its volume. */
  private applyGain(v: Voice): void {
    const allowed = this.gate(v.pubkey, v.kind === 'audio' ? 'mic' : 'screen');
    const level = allowed ? (v.kind === 'screen-audio' ? this.screenVolume : 1) : 0;
    if (v.gain) v.gain.gain.value = level;
    else v.el.muted = level === 0;
  }

  /**
   * What the hall's screen shows: your own screen while you share, else the
   * first shared screen the gate allows, else an allowed camera. Screens the
   * gate refuses are listed, so the host can let them on.
   */
  private pickScreen(): void {
    const video = (x: RemoteTrack) => x.stream.getVideoTracks().length > 0;
    const screens = this.tracks.filter((x) => x.kind === 'screen' && video(x));
    const own = this.ownScreen();
    const shown = own
      ?? screens.find((x) => this.gate(x.pubkey, 'screen'))
      ?? this.tracks.find((x) => x.kind === 'camera' && video(x) && this.gate(x.pubkey, 'screen'));
    const pick = shown ? { pubkey: shown.pubkey, stream: shown.stream, kind: shown.kind === 'camera' ? 'camera' as const : 'screen' as const } : null;
    const refused = [...new Set(screens.filter((x) => !this.gate(x.pubkey, 'screen')).map((x) => x.pubkey))].sort();
    const cur = this.state.screen;
    const same = (pick?.stream ?? null) === (cur?.stream ?? null) && (pick?.pubkey ?? null) === (cur?.pubkey ?? null);
    if (same && refused.join() === this.state.refusedScreens.join()) return;
    this.set({ screen: pick, refusedScreens: refused });
  }

  /** Your own shared screen, as a stream for the hall's screen (silent: you hear it already). */
  private ownStream: MediaStream | null = null;
  private ownScreen(): { pubkey: string; stream: MediaStream; kind: 'screen' } | null {
    const track = this.client?.getLocalTracks?.().screen ?? null;
    if (!track || track.readyState === 'ended' || typeof MediaStream === 'undefined') { this.ownStream = null; return null; }
    if (this.ownStream?.getVideoTracks()[0] !== track) this.ownStream = new MediaStream([track]);
    return { pubkey: 'self', stream: this.ownStream, kind: 'screen' };
  }

  private dropVoice(v: Voice): void {
    try { v.src?.disconnect(); v.gain?.disconnect(); v.panner?.disconnect(); } catch { /* already gone */ }
    v.el.srcObject = null;
  }

  private releaseVoices(): void {
    for (const v of this.voices.values()) this.dropVoice(v);
    this.voices.clear();
    this.tracks = [];
  }

  private cleanup(): void {
    this.releaseVoices();
    // The audio graph goes with the call; the next join makes a fresh one.
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.set({ ...EMPTY_STATE, speaking: new Set(), micBlocked: false });
  }

  private set(patch: Partial<CallState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }
}

function newAudioContext(): AudioContext | null {
  try { return typeof AudioContext === 'undefined' ? null : new AudioContext(); } catch { return null; }
}
