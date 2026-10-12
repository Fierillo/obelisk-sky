import { describe, it, expect } from 'vitest';
import { openPings, pingOpen, pingReason, pingTitle } from './pings';
import type { WireMessage } from './wire';

const ME = 'a'.repeat(64), OTHER = 'b'.repeat(64);
const msg = (p: Partial<WireMessage>): WireMessage => ({ id: 'x', pubkey: OTHER, groupId: 'g', text: '', replyTo: null, replyToId: null, createdAt: 100, ...p });

describe('pings', () => {
  it('a reply to you or your name (content or p tag) pings; your own never does', () => {
    expect(pingReason(msg({ replyTo: ME }), ME)).toBe('reply');
    expect(pingReason(msg({ mentions: [ME] }), ME)).toBe('mention');
    expect(pingReason(msg({ mentions: [OTHER] }), ME)).toBeNull();
    expect(pingReason(msg({ pubkey: ME, mentions: [ME] }), ME)).toBeNull();
    // A reply wins: the more specific story.
    expect(pingReason(msg({ replyTo: ME, mentions: [ME] }), ME)).toBe('reply');
  });

  it('is read once its channel or the mention cursor is past it', () => {
    const c = (channel: number, mentionsReadAt: number) => ({ channel: () => channel, mentionsReadAt });
    expect(pingOpen(msg({ createdAt: 100 }), c(0, 0))).toBe(true);
    expect(pingOpen(msg({ createdAt: 100 }), c(100_000, 0))).toBe(false);
    // "Mark all read" clears it even where the channel was never opened.
    expect(pingOpen(msg({ createdAt: 100 }), c(0, 100_000))).toBe(false);
  });

  it('lists the open ones newest first', () => {
    const list = [msg({ id: '1', createdAt: 1, mentions: [ME] }), msg({ id: '2', createdAt: 3, replyTo: ME }), msg({ id: '3', createdAt: 2 })];
    expect(openPings(list, ME, { channel: () => 0, mentionsReadAt: 0 }).map((p) => p.m.id)).toEqual(['2', '1']);
  });

  it('says who and where', () => {
    expect(pingTitle('Ana', 'mention', 'general')).toBe('Ana mentioned you in #general');
    expect(pingTitle('Ana', 'reply', null)).toBe('Ana replied to you');
  });
});
