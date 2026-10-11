// A voice call in a channel's pavilion: obelisk-dex's own mesh VoiceClient
// (vendored, loaded on first join), so people in the village and in the app
// are in the same call. Remote voices are placed in 3D: each one comes from
// where that person stands, heard from where you stand and face.

import type { RelayHub } from '@nostr-wot/relay/hub';
import type { RemoteTrack } from '@/services/voice/room-state';
import { silentVoiceUiSink } from '@/services/voice/ui-sink';

type VoiceClientT = import('@/services/voice/client').VoiceClient;

export interface CallState {
  channelId: string | null;
  joining: boolean;
  participants: string[];
  speaking: Set<string>;
  micOn: boolean;
  error: string | null;
}

interface Voice { pubkey: string; el: HTMLAudioElement; panner: PannerNode | null; src: MediaStreamAudioSourceNode | null }

export class CallRoom {
  state: CallState = { channelId: null, joining: false, participants: [], speaking: new Set(), micOn: false, error: null };
  private client: VoiceClientT | null = null;
  private voices = new Map<string, Voice>();
  private ctx: AudioContext | null = null;
  private listeners = new Set<() => void>();

  constructor(private hub: RelayHub, private relayOf: () => string) {}

  private get relay(): string {
    return this.relayOf();
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  async join(channelId: string, opts: { open: boolean; signer: 'nsec' | 'nip07' | 'bunker' }): Promise<void> {
    if (this.state.channelId === channelId || this.state.joining) return;
    await this.leave();
    this.set({ channelId, joining: true, error: null, participants: [], speaking: new Set() });
    try {
      await import('./node-globals');
      const [{ VoiceClient }, roles] = await Promise.all([import('@/services/voice/client'), this.roles(channelId)]);
      const sink = silentVoiceUiSink();
      sink.setSpeaking = (pk, on) => {
        const s = new Set(this.state.speaking);
        if (on) s.add(pk); else s.delete(pk);
        this.set({ speaking: s });
      };
      sink.setError = (code) => this.set({ error: String(code) });
      this.client = new VoiceClient(channelId, {
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
          onError: (code) => this.set({ error: String(code) }),
          onLeft: () => this.cleanup(),
        },
      });
      await this.client.join();
      this.ctx ??= new AudioContext();
      void this.ctx.resume();
      await this.client.setMicEnabled(true).catch((e) => this.set({ error: e instanceof Error ? e.message : 'microphone unavailable' }));
      this.set({ joining: false });
    } catch (e) {
      this.set({ joining: false, error: e instanceof Error ? e.message : 'could not join' });
      await this.leave();
    }
  }

  async leave(): Promise<void> {
    const c = this.client;
    this.client = null;
    if (c) await c.leave().catch(() => {});
    this.cleanup();
  }

  async setMic(on: boolean): Promise<void> {
    await this.client?.setMicEnabled(on);
    this.set({ micOn: on });
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
      const p = posOf(v.pubkey);
      if (!p || !v.panner) continue;
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
        this.ctx ??= new AudioContext();
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

  private cleanup(): void {
    for (const v of this.voices.values()) this.dropVoice(v);
    this.voices.clear();
    this.set({ channelId: null, joining: false, participants: [], speaking: new Set(), micOn: false });
  }

  private set(patch: Partial<CallState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }
}
