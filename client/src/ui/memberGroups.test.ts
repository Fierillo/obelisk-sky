import { describe, it, expect } from 'vitest';
import { groupMembers, type Rank } from './memberGroups';
import type { Presence } from '../nostr/presence';

describe('member list sections', () => {
  const og: Rank = { id: 'og', name: 'OG', tier: 5, color: '#fff', emoji: '⭐' };
  const mod: Rank = { id: 'mod', name: 'Moderator', tier: 9, color: '#f00', emoji: '' };
  const presence: Record<string, Presence> = { ana: 'online', bob: 'online', cy: 'online', dee: 'afk', eve: 'offline', fin: 'online' };
  const ranks: Record<string, Rank[]> = { bob: [og], cy: [mod, og], dee: [mod] };
  const out = groupMembers(Object.keys(presence), new Set(['ana']), (pk) => ranks[pk], (pk) => presence[pk], (pk) => pk);

  it('puts admins first, then ranks by tier, then plain online members', () => {
    expect(out.map((s) => s.key)).toEqual(['admin', 'rank:mod', 'rank:og', 'member', 'afk', 'offline']);
    expect(out[1].rows.map((r) => r.pk)).toEqual(['cy']);
    expect(out[1].label).toBe('Moderator');
    expect(out[2].label).toBe('⭐ OG');
  });

  it('keeps AFK and offline people apart from the online ones, whatever their rank', () => {
    expect(out.find((s) => s.key === 'afk')!.rows.map((r) => r.pk)).toEqual(['dee']);
    expect(out.find((s) => s.key === 'offline')!.rows.map((r) => r.pk)).toEqual(['eve']);
  });

  it('leaves empty sections out', () => {
    expect(groupMembers(['x'], new Set(), () => undefined, () => 'offline', (p) => p).map((s) => s.key)).toEqual(['offline']);
  });
});
