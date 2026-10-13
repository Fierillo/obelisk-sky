import { describe, it, expect, vi, beforeEach } from 'vitest';

const uploads: string[] = [];
vi.mock('../blossom', () => ({
  uploadToBlossom: async (file: File) => { uploads.push(file.name); return `https://blossom.example/${file.name}`; },
}));

import { updateProfile } from './useSession';
import { registerHost } from '../host';
import type { ProfileEdit } from '../../nostr/ownProfile';
import type { ProfileFormValues } from '@/types/session/profile';

const blank: ProfileFormValues = { name: 'Ana', about: '', picture: '', banner: 'https://old/banner.png', nip05: '', lud16: '', website: '', pictureFile: null, bannerFile: null };

let pubkey: string | null = 'a'.repeat(64);
let gen = 1;
let edits: ProfileEdit[] = [];

beforeEach(() => {
  uploads.length = 0;
  edits = [];
  pubkey = 'a'.repeat(64);
  gen = 1;
  registerHost({
    login: async () => {},
    sign: async () => { throw new Error('unused'); },
    pubkey: () => pubkey,
    generation: () => gen,
    editProfile: async (edit, assertCurrent) => { assertCurrent(); edits.push(edit); },
  });
});

describe('updateProfile (dex updateSessionProfile over sky)', () => {
  it('uploads a picked picture first and saves its URL', async () => {
    const seen: (string | null)[] = [];
    const file = new File(['x'], 'me.png', { type: 'image/png' });
    await updateProfile({ ...blank, pictureFile: file }, (w) => seen.push(w));
    expect(uploads).toEqual(['me.png']);
    expect(edits[0]).toMatchObject({ name: 'Ana', displayName: 'Ana', picture: 'https://blossom.example/me.png', banner: 'https://old/banner.png' });
    expect(seen[0]).toBe('picture');
    expect(seen.at(-1)).toBeNull();
  });

  it('refuses when logged out', async () => {
    pubkey = null;
    await expect(updateProfile(blank)).rejects.toMatchObject({ code: 'not-logged-in' });
  });

  it('drops the save when the account changes during an upload', async () => {
    const file = new File(['x'], 'b.png', { type: 'image/png' });
    const save = updateProfile({ ...blank, bannerFile: file }, (w) => { if (w === 'banner') gen = 2; });
    await expect(save).rejects.toThrow(/superseded/);
    expect(edits).toHaveLength(0);
  });
});
