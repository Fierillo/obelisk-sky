import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PrivateCall, RING_TIMEOUT_MS } from './privateCall';
import type { DmCallMessage } from '@/services/call/protocol';

const ME = 'a'.repeat(64), THEM = 'b'.repeat(64);

function rig() {
  const sent: { to: string; msg: DmCallMessage; self?: boolean }[] = [];
  const sessions: Fake[] = [];
  class Fake {
    selfEph = 'e'.repeat(64);
    ended: string | null = null;
    accepted: string | null = null;
    answered: string | null = null;
    constructor(readonly opts: { role: string; onPhase: (p: string, r?: string) => void }) { sessions.push(this); }
    async acquireMedia() {}
    listen() {}
    peerAccepted(eph: string) { this.accepted = eph; }
    async answer(eph: string) { this.answered = eph; }
    hangup() {}
    end(r: string) { this.ended = r; }
  }
  const call = new PrivateCall(
    () => ({ sendCall: async (to, msg, self) => { sent.push({ to, msg, self }); } }),
    () => ME,
    async () => {},
    async () => Fake as never,
    () => () => {},
  );
  return { call, sent, sessions };
}
const invite = (callId = 'c'.repeat(64)) => ({ type: 'invite' as const, callId, eph: 'f'.repeat(64), relays: ['wss://relay.damus.io'], video: false, from: THEM, sentAt: 0, peer: THEM });

describe('private calls', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('calls: invites, connects on accept, hangs up with a hangup message', async () => {
    const { call, sent, sessions } = rig();
    await call.start(THEM);
    expect(call.state.status).toBe('outgoing');
    expect(sent[0].msg).toMatchObject({ type: 'invite', eph: sessions[0].selfEph });
    call.handle({ type: 'accept', callId: call.state.callId!, eph: '9'.repeat(64), from: THEM, sentAt: 0, peer: THEM });
    expect(call.state.status).toBe('connecting');
    expect(sessions[0].accepted).toBe('9'.repeat(64));
    sessions[0].opts.onPhase('connected');
    expect(call.state.status).toBe('active');
    call.hangup();
    expect(sent.at(-1)!.msg.type).toBe('hangup');
    expect(call.state).toMatchObject({ status: 'ended', endReason: 'local-hangup' });
  });

  it('rings when invited, answers on accept and tells its other devices', async () => {
    const { call, sent, sessions } = rig();
    call.handle(invite());
    expect(call.state).toMatchObject({ status: 'incoming', peer: THEM });
    await call.accept();
    expect(sessions[0].opts.role).toBe('callee');
    expect(sessions[0].answered).toBe('f'.repeat(64));
    expect(sent.at(-1)).toMatchObject({ to: THEM, msg: { type: 'accept' }, self: true });
  });

  it('is busy for a second caller, and misses a call nobody answers', () => {
    const { call, sent } = rig();
    call.handle(invite('1'.repeat(64)));
    call.handle({ ...invite('2'.repeat(64)) });
    expect(sent.at(-1)!.msg).toMatchObject({ type: 'busy', callId: '2'.repeat(64) });
    vi.advanceTimersByTime(RING_TIMEOUT_MS + 10);
    expect(call.state).toMatchObject({ status: 'ended', endReason: 'missed' });
  });

  it('stops ringing when answered on another device', () => {
    const { call } = rig();
    call.handle(invite());
    call.handle({ type: 'accept', callId: 'c'.repeat(64), from: ME, sentAt: 0, peer: THEM });
    expect(call.state.endReason).toBe('answered-elsewhere');
  });

  it('cancels an unanswered call it placed', async () => {
    const { call, sent } = rig();
    await call.start(THEM);
    vi.advanceTimersByTime(RING_TIMEOUT_MS + 10);
    expect(sent.at(-1)!.msg.type).toBe('cancel');
    expect(call.state.endReason).toBe('no-answer');
  });
});
