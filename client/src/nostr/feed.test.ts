import { describe, it, expect } from 'vitest';
import { isAccessRefusal, nextProfileRetry } from './feed';

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
  it('backs off 30 s, 2 min, then every 10 min', () => {
    expect(nextProfileRetry(1, 0)).toBe(30_000);
    expect(nextProfileRetry(2, 0)).toBe(120_000);
    expect(nextProfileRetry(3, 0)).toBe(600_000);
    expect(nextProfileRetry(9, 1000)).toBe(601_000);
  });
});
