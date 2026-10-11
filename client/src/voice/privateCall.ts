// A private voice call with one person, interoperable with obelisk-dex's
// 1:1 calls: its control messages (invite, accept, decline, cancel, hangup,
// busy) travel gift-wrapped (nostr/dm.ts), the audio is negotiated by its own
// `DmCallSession` (services/call/session.ts) on the call relays. This is the
// same state machine as its store/call/dm-call-store.ts, without React.

import type { DmCallSession } from '@/services/call/session';
import type { DmCallMediaState, DmCallPhase } from '@/services/call/session-config';
import { newCallId, type DmCallMessage, type IncomingDmCallMessage } from '@/services/call/protocol';
import { generateSecretKey } from 'nostr-tools';

export type CallStatus = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'active' | 'reconnecting' | 'ended';
export type CallEnd = 'local-hangup' | 'remote-hangup' | 'declined' | 'busy' | 'no-answer' | 'missed' | 'cancelled' | 'answered-elsewhere' | 'connect-failed' | 'connection-lost' | 'error';

export interface PrivateCallState {
  status: CallStatus;
  peer: string | null;
  callId: string | null;
  micOn: boolean;
  connectedAt: number | null;
  endReason: CallEnd | null;
  error: string | null;
}

/** obelisk-dex's default call relays (constants/preferences/defaults.ts). */
export const CALL_RELAYS = ['wss://relay.damus.io', 'wss://nos.lol'];
/** Ringing gives up after this (its CALL_RING_TIMEOUT_MS). */
export const RING_TIMEOUT_MS = 45_000;
/** "Call ended" stays up this long before the bar clears. */
const ENDED_LINGER_MS = 2500;

type Session = Pick<DmCallSession, 'selfEph' | 'acquireMedia' | 'listen' | 'peerAccepted' | 'answer' | 'hangup' | 'end'> & { setMic?(on: boolean): void };
type SessionCtor = new (opts: ConstructorParameters<typeof DmCallSession>[0]) => Session;

export interface CallSignals {
  sendCall(peer: string, msg: DmCallMessage, selfNotice?: boolean): Promise<void>;
}

export class PrivateCall {
  state: PrivateCallState = { status: 'idle', peer: null, callId: null, micOn: true, connectedAt: null, endReason: null, error: null };
  private listeners = new Set<() => void>();
  private session: Session | null = null;
  private invite: (IncomingDmCallMessage & { peer: string }) | null = null;
  private ringTimer: ReturnType<typeof setTimeout> | null = null;
  private lingerTimer: ReturnType<typeof setTimeout> | null = null;
  private stopRing: (() => void) | null = null;
  private audio: HTMLAudioElement | null = null;

  constructor(
    private signals: () => CallSignals | null,
    private me: () => string | null,
    /** Leave any channel call first (one call at a time). */
    private beforeCall: () => Promise<void> = async () => {},
    private load: () => Promise<SessionCtor> = async () => {
      await import('./node-globals');
      return (await import('@/services/call/session')).DmCallSession as unknown as SessionCtor;
    },
    private ring: (kind: 'in' | 'out') => () => void = ringTone,
  ) {}

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  get busy(): boolean {
    return this.state.status !== 'idle' && this.state.status !== 'ended';
  }

  /** Call `peer`. */
  async start(peer: string): Promise<void> {
    if (this.busy || !this.signals()) return;
    if (this.lingerTimer) clearTimeout(this.lingerTimer);
    const callId = newCallId();
    this.set({ status: 'outgoing', peer, callId, micOn: true, connectedAt: null, endReason: null, error: null });
    await this.beforeCall();
    let Ctor: SessionCtor;
    try { Ctor = await this.load(); } catch { return this.fail(callId, 'Could not load the call'); }
    if (this.state.callId !== callId || this.state.status !== 'outgoing') return;
    const s = this.makeSession(Ctor, 'caller', callId, CALL_RELAYS, peer);
    this.session = s;
    try { await s.acquireMedia(); } catch { return this.fail(callId, 'Microphone blocked: allow it to call.'); }
    if (this.session !== s) return;
    s.listen();
    this.stopRing = this.ring('out');
    this.ringTimer = setTimeout(() => {
      if (this.session !== s || this.state.status !== 'outgoing') return;
      void this.signals()?.sendCall(peer, { type: 'cancel', callId }).catch(() => {});
      this.finish('no-answer');
    }, RING_TIMEOUT_MS);
    try {
      await this.signals()!.sendCall(peer, { type: 'invite', callId, eph: s.selfEph, relays: CALL_RELAYS, video: false });
    } catch { this.fail(callId, 'Could not reach them'); }
  }

  async accept(): Promise<void> {
    const inv = this.invite;
    if (!inv || this.state.status !== 'incoming' || !inv.eph || !inv.relays) return;
    this.clearRinging();
    await this.beforeCall();
    let Ctor: SessionCtor;
    try { Ctor = await this.load(); } catch {
      void this.signals()?.sendCall(inv.from, { type: 'decline', callId: inv.callId }, true).catch(() => {});
      return this.fail(inv.callId, 'Could not load the call');
    }
    if (this.invite !== inv || this.state.status !== 'incoming') return;
    const s = this.makeSession(Ctor, 'callee', inv.callId, inv.relays, inv.from);
    this.session = s;
    this.set({ status: 'connecting' });
    try { await s.acquireMedia(); } catch {
      void this.signals()?.sendCall(inv.from, { type: 'decline', callId: inv.callId }, true).catch(() => {});
      return this.fail(inv.callId, 'Microphone blocked: allow it to talk.');
    }
    if (this.session !== s) return;
    // Two paths to the caller, raced: the hello on the call relay and the
    // gift-wrapped accept (which also stops our other devices ringing).
    void s.answer(inv.eph);
    void this.signals()?.sendCall(inv.from, { type: 'accept', callId: inv.callId, eph: s.selfEph }, true).catch(() => {});
  }

  decline(): void {
    const inv = this.invite;
    if (!inv || this.state.status !== 'incoming') return;
    void this.signals()?.sendCall(inv.from, { type: 'decline', callId: inv.callId }, true).catch(() => {});
    this.finish('declined');
  }

  hangup(): void {
    const { status, peer, callId } = this.state;
    if (!peer || !callId) return;
    if (status === 'incoming') { this.decline(); return; }
    if (status === 'outgoing') {
      if (this.session) void this.signals()?.sendCall(peer, { type: 'cancel', callId }).catch(() => {});
      this.finish('cancelled');
      return;
    }
    if (status === 'connecting' || status === 'active' || status === 'reconnecting') {
      this.session?.hangup();
      void this.signals()?.sendCall(peer, { type: 'hangup', callId }).catch(() => {});
      this.finish('local-hangup');
    }
  }

  setMic(on: boolean): void {
    this.session?.setMic?.(on);
    this.set({ micOn: on });
  }

  /** A control message from nostr/dm.ts (obelisk-dex handleDmCallMessage). */
  handle(msg: IncomingDmCallMessage & { peer: string }): void {
    const me = this.me();
    const fromMe = msg.from === me;
    const { status, callId, peer } = this.state;
    if (msg.type === 'invite') {
      if (fromMe || callId === msg.callId) return;
      if (this.busy) { void this.signals()?.sendCall(msg.from, { type: 'busy', callId: msg.callId }).catch(() => {}); return; }
      if (this.lingerTimer) clearTimeout(this.lingerTimer);
      this.invite = msg;
      this.set({ status: 'incoming', peer: msg.from, callId: msg.callId, micOn: true, connectedAt: null, endReason: null, error: null });
      this.stopRing = this.ring('in');
      this.ringTimer = setTimeout(() => {
        if (this.state.callId === msg.callId && this.state.status === 'incoming') this.finish('missed');
      }, RING_TIMEOUT_MS);
      return;
    }
    if (msg.callId !== callId || msg.peer !== peer) return;
    switch (msg.type) {
      case 'accept':
        if (fromMe) { if (status === 'incoming') this.finish('answered-elsewhere'); return; }
        if ((status !== 'outgoing' && status !== 'connecting') || !this.session || !msg.eph) return;
        this.clearRinging();
        if (status === 'outgoing') this.set({ status: 'connecting' });
        this.session.peerAccepted(msg.eph);
        return;
      case 'decline':
        if (fromMe) { if (status === 'incoming') this.finish('answered-elsewhere'); return; }
        if (status === 'outgoing') this.finish('declined');
        return;
      case 'busy':
        if (!fromMe && status === 'outgoing') this.finish('busy');
        return;
      case 'cancel':
        if (!fromMe && status === 'incoming') this.finish('missed');
        return;
      case 'hangup':
        if (!fromMe && (status === 'connecting' || status === 'active' || status === 'reconnecting' || status === 'outgoing')) this.finish('remote-hangup');
        return;
    }
  }

  private makeSession(Ctor: SessionCtor, role: 'caller' | 'callee', callId: string, relays: readonly string[], peer: string): Session {
    const s: Session = new Ctor({
      role, callId, selfSk: generateSecretKey(), relays, video: false, iceTransportPolicy: 'all',
      onMedia: (m: DmCallMediaState) => { if (this.session === s) this.playRemote(m.remoteAudio); },
      onPeerJoined: () => {
        if (this.session !== s || this.state.status !== 'outgoing') return;
        this.clearRinging();
        this.set({ status: 'connecting' });
      },
      onPhase: (phase: DmCallPhase, reason?: string) => {
        if (this.session !== s) return;
        if (phase === 'connected') this.set({ status: 'active', connectedAt: this.state.connectedAt ?? Date.now() });
        else if (phase === 'reconnecting') this.set({ status: 'reconnecting' });
        else if (phase === 'ended') {
          const known: CallEnd[] = ['local-hangup', 'remote-hangup', 'connect-failed', 'connection-lost'];
          const r = (known as string[]).includes(reason ?? '') ? (reason as CallEnd) : 'error';
          if (r === 'connect-failed' || r === 'connection-lost') void this.signals()?.sendCall(peer, { type: 'hangup', callId }).catch(() => {});
          this.finish(r);
        }
      },
    } as ConstructorParameters<typeof DmCallSession>[0]);
    return s;
  }

  private playRemote(stream: MediaStream | null): void {
    if (!stream) return;
    if (typeof Audio === 'undefined') return;
    this.audio ??= new Audio();
    if (this.audio.srcObject !== stream) {
      this.audio.srcObject = stream;
      this.audio.autoplay = true;
      void this.audio.play().catch(() => {});
    }
  }

  private fail(callId: string, error: string): void {
    if (this.state.callId !== callId) return;
    this.set({ error });
    this.finish('error');
  }

  private clearRinging(): void {
    if (this.ringTimer) clearTimeout(this.ringTimer);
    this.ringTimer = null;
    this.stopRing?.();
    this.stopRing = null;
  }

  private finish(reason: CallEnd): void {
    this.clearRinging();
    const s = this.session;
    this.session = null;
    this.invite = null;
    if (s) try { s.end(reason); } catch { /* already gone */ }
    if (this.audio) { this.audio.srcObject = null; this.audio = null; }
    this.set({ status: 'ended', endReason: reason });
    this.lingerTimer = setTimeout(() => {
      if (this.state.status !== 'ended') return;
      this.set({ status: 'idle', peer: null, callId: null, connectedAt: null, endReason: null, error: null });
    }, ENDED_LINGER_MS);
  }

  private set(patch: Partial<PrivateCallState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }
}

/** A soft ring: two tones every two seconds (incoming), one (ringback). */
function ringTone(kind: 'in' | 'out'): () => void {
  if (typeof AudioContext === 'undefined') return () => {};
  let ctx: AudioContext | null = null;
  try { ctx = new AudioContext(); } catch { return () => {}; }
  const beep = (f: number, at: number) => {
    const o = ctx!.createOscillator(), g = ctx!.createGain();
    o.frequency.value = f;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.08, at + 0.03);
    g.gain.linearRampToValueAtTime(0, at + 0.35);
    o.connect(g).connect(ctx!.destination);
    o.start(at);
    o.stop(at + 0.4);
  };
  const tick = () => {
    if (!ctx) return;
    const t = ctx.currentTime;
    beep(kind === 'in' ? 880 : 440, t);
    if (kind === 'in') beep(660, t + 0.45);
  };
  tick();
  const id = setInterval(tick, 2000);
  return () => { clearInterval(id); void ctx?.close(); ctx = null; };
}
