// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { badgeCacheKey, loadPicture, proxiedAvatar, setBadgeResolution } from './character';

describe('profile badges', () => {
  afterEach(() => { vi.unstubAllGlobals(); setBadgeResolution(128); });

  it('keys the cache by person too: the ring is their own colour', () => {
    const url = 'https://example.com/a.png';
    expect(badgeCacheKey('aa', url, null)).not.toBe(badgeCacheKey('bb', url, null));
    expect(badgeCacheKey('aa', url, null)).not.toBe(badgeCacheKey('aa', url, '#6366f1'));
    const before = badgeCacheKey('aa', url, null);
    setBadgeResolution(256);
    expect(badgeCacheKey('aa', url, null)).not.toBe(before);
  });

  it('asks sky\'s server when the host refuses the picture, once per URL', async () => {
    const tried: string[] = [];
    class FakeImage {
      crossOrigin = ''; referrerPolicy = ''; decoding = '';
      onload: (() => void) | null = null; onerror: (() => void) | null = null;
      set src(v: string) { tried.push(v); queueMicrotask(() => (v.startsWith('/api/avatar') ? this.onload?.() : this.onerror?.())); }
    }
    vi.stubGlobal('Image', FakeImage);
    const url = 'https://no-cors.example/pic.jpg';
    const [a, b] = await Promise.all([loadPicture(url), loadPicture(url)]);
    expect(a).not.toBeNull();
    expect(a).toBe(b);
    expect(tried).toEqual([url, proxiedAvatar(url)]);
  });
});
