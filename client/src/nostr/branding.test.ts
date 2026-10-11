import { describe, it, expect } from 'vitest';
import { parseBranding } from './branding';

describe('relay branding', () => {
  it('reads the icon and name tags as obelisk-dex writes them', () => {
    const ev = { kind: 30078, created_at: 1, pubkey: 'p', id: 'i', sig: 's', content: '', tags: [['d', 'obelisk:branding:wss://r'], ['icon', 'https://x/i.png'], ['name', 'Obelisk Público'], ['banner', 'https://x/b.png']] };
    expect(parseBranding(ev)).toEqual({ icon: 'https://x/i.png', name: 'Obelisk Público' });
    expect(parseBranding({ ...ev, tags: [] })).toEqual({ icon: '', name: '' });
  });
});
