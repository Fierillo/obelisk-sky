// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, act, waitFor } from '@testing-library/react';
import { nip19 } from 'nostr-tools';
import SkyMessageContent from './SkyMessageContent';
import { putProfile, clearProfiles, setProfileRequester } from '../nostr/profileStore';
import { registerHost } from '../shims/host';

const LAZY_MS = 8000;

registerHost({ login: async () => {}, sign: async () => { throw new Error('no signer'); }, pubkey: () => null });

const pk = 'b'.repeat(64);

afterEach(() => { cleanup(); clearProfiles(); });

describe('SkyMessageContent (obelisk-dex message renderer)', { timeout: 20_000 }, () => {
  it('renders markdown and a code block', async () => {
    render(<SkyMessageContent content={'**bold** text\n\n```\nconst x = 1;\n```'} channelId="g" />);
    // The markdown renderer loads lazily; under a full parallel run that can take over a second.
    await waitFor(() => expect(screen.getByText('bold').tagName).toBe('STRONG'), { timeout: LAZY_MS });
    expect(screen.getByText('const x = 1;')).toBeTruthy();
  });

  it('shows a mention chip that fills in its name when the profile lands', async () => {
    const asked: string[] = [];
    setProfileRequester((p) => asked.push(p));
    render(<SkyMessageContent content={`hi nostr:${nip19.npubEncode(pk)}`} channelId="g" />);
    const chip = await screen.findByTestId('mention-highlight', undefined, { timeout: LAZY_MS });
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

  it("draws a voice note as obelisk-dex's voice player, not a link or a video", async () => {
    const url = 'https://blossom.test/abc.webm';
    render(<SkyMessageContent content={url} channelId="g" voiceNote={{ url, durationSeconds: 7 }} voiceTimestamp={1} />);
    expect(screen.getAllByTestId('voice-message')).toHaveLength(1);
    await new Promise((r) => setTimeout(r, 50));
    expect(document.querySelector('video')).toBeNull();
    expect(document.querySelector(`a[href="${url}"]`)).toBeNull();
  });
});
