import { describe, it, expect } from 'vitest';
import { avatarTarget, rasterType } from './avatarProxy';

describe('the avatar fallback', () => {
  it('fetches only plain http(s) picture URLs', () => {
    expect(avatarTarget('https://nostr.build/i/abc.jpg')?.hostname).toBe('nostr.build');
    for (const bad of [null, '', 'file:///etc/passwd', 'data:image/png;base64,AA', 'javascript:alert(1)', 'https://u:p@host/x.png', 'http://host:6379/', 'not a url', `https://h/${'x'.repeat(2100)}`]) {
      expect(avatarTarget(bad), String(bad)).toBeNull();
    }
  });
  it('passes only raster images on, never SVG or HTML', () => {
    expect(rasterType('image/png')).toBe('image/png');
    expect(rasterType('image/JPEG; charset=binary')).toBe('image/jpeg');
    expect(rasterType('image/webp')).toBe('image/webp');
    for (const bad of ['image/svg+xml', 'text/html', '', null, 'application/octet-stream']) expect(rasterType(bad)).toBeNull();
  });
});
