import { describe, it, expect, vi } from 'vitest';
import { putProfile, getProfile, subscribeProfile, setProfileRequester, clearProfiles } from './profileStore';

const pk = 'a'.repeat(64);

describe('profileStore', () => {
  it('asks for an unknown profile once, then notifies when it lands', async () => {
    clearProfiles();
    const ask = vi.fn();
    setProfileRequester(ask);
    expect(getProfile(pk)).toBeNull();
    expect(getProfile(pk)).toBeNull();
    await Promise.resolve();
    expect(ask).toHaveBeenCalledTimes(1);
    const cb = vi.fn();
    const off = subscribeProfile(pk, cb);
    putProfile({ pubkey: pk, name: 'npub1aaaa…aaaa', avatar: null, nip05: null, loaded: false });
    expect(cb).not.toHaveBeenCalled();
    putProfile({ pubkey: pk, name: 'Alice', avatar: null, nip05: null, loaded: true });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(getProfile(pk)?.displayName).toBe('Alice');
    off();
  });
});
