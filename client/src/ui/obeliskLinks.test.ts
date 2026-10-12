import { describe, it, expect } from 'vitest';
import { nip19 } from 'nostr-tools';
import { obeliskNoteUrl, obeliskProfileUrl } from './obeliskLinks';

const id = 'a'.repeat(64), pk = 'b'.repeat(64);

describe('links into Obelisk', () => {
  it('opens a note by its nevent, with the author and two relays', () => {
    const url = obeliskNoteUrl(id, pk, ['wss://one', 'wss://two', 'wss://three']);
    expect(url.startsWith('https://obelisk.ar/notes/nevent1')).toBe(true);
    const d = nip19.decode(url.split('/').pop()!);
    expect(d.type).toBe('nevent');
    const data = d.data as nip19.EventPointer;
    expect(data.id).toBe(id);
    expect(data.author).toBe(pk);
    expect(data.relays).toEqual(['wss://one', 'wss://two']);
  });

  it('opens a profile by its npub', () => {
    expect(obeliskProfileUrl(pk)).toBe(`https://obelisk.ar/p/${nip19.npubEncode(pk)}`);
  });
});
