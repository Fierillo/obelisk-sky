import { describe, it, expect } from 'vitest';
import { isAccessRefusal, nextProfileRetry, profilesDue, PROFILE_REFRESH_MS, type ProfileAsks } from './feed';

describe('isAccessRefusal', () => {
  it('recognises the relay refusing this key', () => {
    expect(isAccessRefusal('restricted: Access denied: your pubkey is not whitelisted on this relay')).toBe(true);
    expect(isAccessRefusal('restricted: this relay only accepts whitelisted pubkeys')).toBe(true);
  });
  it('does not treat auth or membership closes as a relay-wide refusal', () => {
    expect(isAccessRefusal('auth-required: Authentication required')).toBe(false);
    expect(isAccessRefusal('restricted: not a member of this group')).toBe(false);
  });
});

describe('nextProfileRetry', () => {
  it('backs off 30 s, 1 min, 2 min, then every 5 min (a new account shows up before its kind 0)', () => {
    expect(nextProfileRetry(1, 0)).toBe(30_000);
    expect(nextProfileRetry(2, 0)).toBe(60_000);
    expect(nextProfileRetry(3, 0)).toBe(120_000);
    expect(nextProfileRetry(4, 0)).toBe(300_000);
    expect(nextProfileRetry(9, 1000)).toBe(301_000);
  });
});

describe('profilesDue', () => {
  it('asks for missing profiles on the backoff and refreshes held ones later (a picture added after the name)', () => {
    const asks: ProfileAsks = new Map();
    const held = new Set(['b']);
    const has = (p: string) => held.has(p);
    expect(profilesDue(['b', 'a'], has, asks, 0)).toEqual(['a', 'b']); // missing first
    expect(profilesDue(['a', 'b'], has, asks, 1000)).toEqual([]);
    expect(profilesDue(['a', 'b'], has, asks, 30_000)).toEqual(['a']);
    held.add('a'); // it arrived: from now on refreshed like the rest
    expect(profilesDue(['a', 'b'], has, asks, PROFILE_REFRESH_MS)).toEqual(['a', 'b']);
    expect(profilesDue(['a', 'b'], has, asks, PROFILE_REFRESH_MS * 2 - 1)).toEqual([]);
    expect(profilesDue(['a', 'b'], has, asks, PROFILE_REFRESH_MS * 2)).toEqual(['a', 'b']);
  });
  it('asks for at most a batch at a time', () => {
    const people = Array.from({ length: 200 }, (_, i) => String(i));
    expect(profilesDue(people, () => false, new Map(), 0, 150)).toHaveLength(150);
  });
});
