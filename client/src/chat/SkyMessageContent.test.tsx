// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, act, waitFor } from '@testing-library/react';
import { nip19 } from 'nostr-tools';
import SkyMessageContent from './SkyMessageContent';
import { putProfile, clearProfiles, setProfileRequester } from '../nostr/profileStore';
import { registerHost } from '../shims/host';

registerHost({ login: async () => {}, sign: async () => { throw new Error('no signer'); }, pubkey: () => null });

const pk = 'b'.repeat(64);

afterEach(() => { cleanup(); clearProfiles(); });

describe('SkyMessageContent (obelisk-dex message renderer)', () => {
  it('renders markdown and a code block', async () => {
    render(<SkyMessageContent content={'**bold** text\n\n```\nconst x = 1;\n```'} channelId="g" />);
    await waitFor(() => expect(screen.getByText('bold').tagName).toBe('STRONG'));
    expect(screen.getByText('const x = 1;')).toBeTruthy();
  });

  it('shows a mention chip that fills in its name when the profile lands', async () => {
    const asked: string[] = [];
    setProfileRequester((p) => asked.push(p));
    render(<SkyMessageContent content={`hi nostr:${nip19.npubEncode(pk)}`} channelId="g" />);
    const chip = await screen.findByTestId('mention-highlight');
    expect(chip.textContent).not.toContain('Alice');
    await waitFor(() => expect(asked).toContain(pk));
    act(() => putProfile({ pubkey: pk, name: 'Alice', avatar: null, nip05: null, loaded: true }));
    await waitFor(() => expect(screen.getByTestId('mention-highlight').textContent).toBe('@Alice'));
  });

  it("reads obelisk-dex's legacy nostr:npub1<hex> mention", async () => {
    putProfile({ pubkey: pk, name: 'Bob', avatar: null, nip05: null, loaded: true });
    render(<SkyMessageContent content={`yo nostr:npub1${pk}`} channelId="g" />);
    await waitFor(() => expect(screen.getByTestId('mention-highlight').textContent).toBe('@Bob'));
  });
});
