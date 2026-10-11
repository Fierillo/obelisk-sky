import { describe, it, expect } from 'vitest';
import { nip19, generateSecretKey, getPublicKey } from 'nostr-tools';
import { tokenize } from './content';

const pk = getPublicKey(generateSecretKey());

describe('tokenize', () => {
  it('reads every mention form as a mention', () => {
    const npub = nip19.npubEncode(pk);
    const nprofile = nip19.nprofileEncode({ pubkey: pk });
    for (const s of [`nostr:npub1${pk}`, `nostr:${npub}`, npub, `nostr:${nprofile}`]) {
      expect(tokenize(`hi ${s}!`)).toEqual([{ t: 'text', v: 'hi ' }, { t: 'mention', pubkey: pk }, { t: 'text', v: '!' }]);
    }
  });
  it('splits images, video and links', () => {
    const toks = tokenize('a https://x.example/p.png b https://x.example/v.mp4 c https://www.site.example/page.');
    expect(toks.map((t) => t.t)).toEqual(['text', 'image', 'text', 'video', 'text', 'link', 'text']);
    expect(toks[5]).toMatchObject({ host: 'site.example', url: 'https://www.site.example/page' });
  });
  it('treats imeta URLs as images even without an extension', () => {
    expect(tokenize('https://blossom.example/abc', { images: ['https://blossom.example/abc'] })[0]).toEqual({ t: 'image', url: 'https://blossom.example/abc' });
  });
  it('only renders custom emoji that have a tag', () => {
    const toks = tokenize(':pepe: :nope:', { emojis: { pepe: 'https://e/p.png' } });
    expect(toks[0]).toEqual({ t: 'emoji', code: 'pepe', url: 'https://e/p.png' });
    expect(toks.slice(1)).toEqual([{ t: 'text', v: ' :nope:' }]);
  });
  it('event refs become note chips', () => {
    const note = nip19.noteEncode('a'.repeat(64));
    expect(tokenize(`see nostr:${note}`)[1]).toEqual({ t: 'note', ref: note });
  });
  it('reads obelisk-dex game and app markers', () => {
    const id = 'a'.repeat(64);
    expect(tokenize(`[[game:${id}]]`)).toEqual([{ t: 'game', id }]);
    expect(tokenize(`x [[app:${id}]]`)[1]).toEqual({ t: 'app', id });
  });
  it('never makes http media inline', () => {
    expect(tokenize('http://x.example/p.png')[0]).toMatchObject({ t: 'link' });
  });
});
