// A voice call in a channel's pavilion: obelisk-dex's own mesh VoiceClient
// (vendored, loaded on first join), so people in the village and in the app
// are in the same call. Remote voices are placed in 3D: each one comes from
// where that person stands, heard from where you stand and face.
//
// Robustness: a leave (or a relay switch) mid-join cancels that join; a
// dropped call reconnects a few times with backoff; a blocked microphone
// leaves you listening, and says so; voices of people who aren't on the
// island play from where you stand instead of a stale spot.

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
}

type JoinOpts = { open: boolean; signer: 'nsec' | 'nip07' | 'bunker' };

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

interface Voice { pubkey: string; el: HTMLAudioElement; panner: PannerNode | null; src: MediaStreamAudioSourceNode | null }

export class CallRoom {
  state: CallState = { channelId: null, joining: false, participants: [], speaking: new Set(), micOn: false, micBlocked: false, reconnecting: 0, error: null };
  private client: VoiceClientT | null = null;
  private voices = new Map<string, Voice>();
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
        expectSfu: false,
        originRelayUrl: this.relay,
        signer: opts.signer,
        uiSink: sink,
        events: {
          onParticipantsChange: (pks) => this.set({ participants: pks }),
          onRemoteTracksChange: (tracks) => this.syncTracks(tracks),
          onLocalTracksChange: (l) => this.set({ micOn: l.mic }),
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
      try {
        await client.setMicEnabled(true);
        this.set({ micBlocked: false });
      } catch (e) {
        this.set({ micBlocked: true, micOn: false, error: micMessage(e) });
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
      this.set({ channelId: null, joining: false, participants: [], speaking: new Set(), micOn: false, reconnecting: 0 });
      return;
    }
    this.set({ joining: true, participants: [], speaking: new Set(), reconnecting: retry + 1 });
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
    const audio = tracks.filter((t) => t.kind === 'audio' || t.stream.getAudioTracks().length > 0);
    const keep = new Set(audio.map((t) => t.pubkey));
    for (const [pk, v] of this.voices) if (!keep.has(pk)) { this.dropVoice(v); this.voices.delete(pk); }
    for (const t of audio) {
      if (this.voices.has(t.pubkey)) continue;
      // Chrome only feeds a remote WebRTC stream into Web Audio while a media
      // element is playing it; the element stays muted, the panner speaks.
      const el = new Audio();
      el.srcObject = t.stream;
      el.autoplay = true;
      let panner: PannerNode | null = null;
      let src: MediaStreamAudioSourceNode | null = null;
      try {
        this.ctx ??= newAudioContext();
        if (!this.ctx) throw new Error('no Web Audio');
        src = this.ctx.createMediaStreamSource(t.stream);
        panner = new PannerNode(this.ctx, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 2, maxDistance: 40, rolloffFactor: 0.8 });
        src.connect(panner).connect(this.ctx.destination);
        el.muted = true;
      } catch {
        el.muted = false; // no Web Audio: plain playback
      }
      void el.play().catch(() => {});
      this.voices.set(t.pubkey, { pubkey: t.pubkey, el, panner, src });
    }
  }

  private dropVoice(v: Voice): void {
    try { v.src?.disconnect(); v.panner?.disconnect(); } catch { /* already gone */ }
    v.el.srcObject = null;
  }

  private releaseVoices(): void {
    for (const v of this.voices.values()) this.dropVoice(v);
    this.voices.clear();
  }

  private cleanup(): void {
    this.releaseVoices();
    // The audio graph goes with the call; the next join makes a fresh one.
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.set({ channelId: null, joining: false, participants: [], speaking: new Set(), micOn: false, micBlocked: false, reconnecting: 0 });
  }

  private set(patch: Partial<CallState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }
}

function newAudioContext(): AudioContext | null {
  try { return typeof AudioContext === 'undefined' ? null : new AudioContext(); } catch { return null; }
}
