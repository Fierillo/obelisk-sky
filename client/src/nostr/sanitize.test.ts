import { describe, it, expect } from 'vitest';
import { nip19, generateSecretKey, getPublicKey } from 'nostr-tools';
import { sanitizeText, cleanName, mentionedPubkeys, MAX_TEXT } from './sanitize';

const pk = getPublicKey(generateSecretKey());
const npub = nip19.npubEncode(pk);
const names = (p: string) => (p === pk ? 'carol' : 'anon');

describe('sanitizeText', () => {
  it('turns npub mentions into @names', () => {
    expect(sanitizeText(`hi nostr:${npub}!`, names)).toBe('hi @carol!');
    expect(sanitizeText(`hi ${npub}`, names)).toBe('hi @carol');
    expect(mentionedPubkeys(`nostr:${npub}`)).toEqual([pk]);
  });
  it("reads obelisk-dex's legacy nostr:npub1<hex> mentions", () => {
    expect(sanitizeText(`hey nostr:npub1${pk} look`, names)).toBe('hey @carol look');
    expect(mentionedPubkeys(`hey nostr:npub1${pk}`)).toEqual([pk]);
  });
  it('finds bare npub / nprofile mentions and p tags, once each', () => {
    const other = getPublicKey(generateSecretKey());
    const third = getPublicKey(generateSecretKey());
    const nprofile = nip19.nprofileEncode({ pubkey: other, relays: ['wss://r.example'] });
    const found = mentionedPubkeys(`hi ${npub} and ${nprofile} and nostr:${npub}`, [['p', third], ['p', 'nothex'], ['e', 'x']]);
    expect(found.sort()).toEqual([pk, other, third].sort());
  });
  it('replaces event refs, links and media', () => {
    const note = nip19.noteEncode('a'.repeat(64));
    expect(sanitizeText(`see nostr:${note}`, names)).toBe('see [note]');
    expect(sanitizeText('https://www.github.com/foo/bar', names)).toBe('[github.com]');
    expect(sanitizeText('https://b.example/x.mp4', names)).toBe('[video]');
  });
  it('shortens raw hex', () => {
    expect(sanitizeText('a'.repeat(64), names)).toBe('aaaaaa…');
  });
  it('collapses whitespace and truncates', () => {
    expect(sanitizeText('  a \n\n b  ', names)).toBe('a b');
    const long = sanitizeText('x'.repeat(1000), names);
    expect([...long].length).toBe(MAX_TEXT);
    expect(long.endsWith('…')).toBe(true);
  });
  it('never returns empty', () => {
    expect(sanitizeText('   ', names)).toBe('…');
  });
});

describe('cleanName', () => {
  it('strips control and bidi characters and caps length', () => {
    expect(cleanName('a‮b\u0000c')).toBe('abc');
    expect(cleanName('x'.repeat(100))).toHaveLength(32);
    expect(cleanName(42)).toBeNull();
    expect(cleanName('   ')).toBeNull();
  });
});
