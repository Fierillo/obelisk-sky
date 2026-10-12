// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { nip19, generateSecretKey, getPublicKey } from 'nostr-tools';
import { renderContent } from './content';

describe('a mention in a bubble', () => {
  it('opens the person, not the bubble around it', () => {
    const pk = getPublicKey(generateSecretKey());
    const bubble = document.createElement('div');
    const body = document.createElement('div');
    bubble.append(body);
    const reply = vi.fn(), person = vi.fn();
    bubble.addEventListener('click', reply);
    renderContent(body, `hey nostr:${nip19.npubEncode(pk)}`, { nameOf: () => 'Ana', onMention: person });
    const chip = body.querySelector('.mention') as HTMLButtonElement;
    expect(chip.textContent).toBe('@Ana');
    chip.click();
    expect(person).toHaveBeenCalledWith(pk);
    expect(reply).not.toHaveBeenCalled();
  });
});
