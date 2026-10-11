import { describe, it, expect } from 'vitest';
import { methodOf, parseStored } from './session';

const pk = 'a'.repeat(64);
const box = { v: 1, iv: 'x', ct: 'y' };

describe('session record', () => {
  it('maps SDK methods to stored login methods', () => {
    expect(methodOf('nip07')).toBe('nip07');
    expect(methodOf('nip46')).toBe('nip46');
    expect(methodOf('generate')).toBe('nsec');
    expect(methodOf('import')).toBe('nsec');
  });

  it('accepts only well-formed records', () => {
    expect(parseStored(JSON.stringify({ v: 1, pubkey: pk, method: 'nip07' }))?.method).toBe('nip07');
    expect(parseStored(JSON.stringify({ v: 1, pubkey: pk, method: 'nsec', sealed: box }))?.method).toBe('nsec');
    expect(parseStored(null)).toBeNull();
    expect(parseStored('not json')).toBeNull();
    expect(parseStored(JSON.stringify({ v: 2, pubkey: pk, method: 'nip07' }))).toBeNull();
    expect(parseStored(JSON.stringify({ v: 1, pubkey: 'npub1x', method: 'nip07' }))).toBeNull();
    expect(parseStored(JSON.stringify({ v: 1, pubkey: pk, method: 'magic' }))).toBeNull();
  });

  it('never accepts a secret-bearing method without a sealed box', () => {
    expect(parseStored(JSON.stringify({ v: 1, pubkey: pk, method: 'nsec', skHex: 'b'.repeat(64) }))).toBeNull();
    expect(parseStored(JSON.stringify({ v: 1, pubkey: pk, method: 'nip46' }))).toBeNull();
  });
});
