// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { ProfilePanel } from './ProfilePanel';
import { registerHost } from '../shims/host';
import type { ProfileEdit } from '../nostr/ownProfile';

const pk = 'a'.repeat(64);
let edits: ProfileEdit[] = [];
let fail: Error | null = null;

beforeEach(() => {
  edits = [];
  fail = null;
  registerHost({
    login: async () => {},
    sign: async () => { throw new Error('no signer in tests'); },
    pubkey: () => pk,
    generation: () => 1,
    editProfile: async (edit) => { if (fail) throw fail; edits.push(edit); },
  });
});
afterEach(cleanup);

const initial = { displayName: 'Ana', name: 'ana', about: 'hola', picture: 'https://img.example/a.png', banner: '', nip05: 'ana@example.com', lud16: 'ana@wallet.com', website: '' };

describe('ProfilePanel (obelisk-dex EditProfileForm)', { timeout: 20_000 }, () => {
  it('shows the profile in dex\'s editor: banner and avatar to tap, URL fields, the five fields', () => {
    render(<ProfilePanel initial={initial} onClose={() => {}} onSaved={() => {}} />);
    expect(screen.getByTestId('profile-sheet')).toBeTruthy();
    expect(screen.getByTestId('edit-banner-tap')).toBeTruthy();
    expect(screen.getByTestId('edit-avatar-tap')).toBeTruthy();
    expect(screen.getByDisplayValue('Ana')).toBeTruthy();
    expect(screen.getByDisplayValue('hola')).toBeTruthy();
    expect(screen.getByDisplayValue('ana@example.com')).toBeTruthy();
    expect(screen.getByDisplayValue('ana@wallet.com')).toBeTruthy();
    expect(screen.getByDisplayValue('https://img.example/a.png')).toBeTruthy();
  });

  it('saves the edited values through updateProfile, then reports saved', async () => {
    const onSaved = vi.fn();
    render(<ProfilePanel initial={initial} onClose={() => {}} onSaved={onSaved} />);
    fireEvent.change(screen.getByDisplayValue('Ana'), { target: { value: ' Ana B ' } });
    fireEvent.change(screen.getByDisplayValue('hola'), { target: { value: 'chau' } });
    fireEvent.click(screen.getByTestId('save-profile-button'));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(edits).toEqual([{
      name: 'Ana B', displayName: 'Ana B', about: 'chau', picture: 'https://img.example/a.png', banner: '',
      nip05: 'ana@example.com', lud16: 'ana@wallet.com', website: '',
    }]);
  });

  it('shows the error and stays open when the save fails', async () => {
    fail = Object.assign(new Error('x'), { code: 'profile-load-failed' });
    const onSaved = vi.fn();
    render(<ProfilePanel initial={initial} onClose={() => {}} onSaved={onSaved} />);
    fireEvent.change(screen.getByDisplayValue('Ana'), { target: { value: 'Ana C' } });
    fireEvent.click(screen.getByTestId('save-profile-button'));
    await screen.findByText(/Could not load your current profile/);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('adopts the relays\' profile when it lands', async () => {
    render(<ProfilePanel initial={null} load={async () => ({ ...initial, displayName: 'Loaded' })} onClose={() => {}} onSaved={() => {}} />);
    await screen.findByDisplayValue('Loaded');
  });

  it('closes with the ×, Cancel and Esc', () => {
    const onClose = vi.fn();
    render(<ProfilePanel initial={initial} onClose={onClose} onSaved={() => {}} />);
    fireEvent.click(screen.getByTestId('profile-sheet-close'));
    fireEvent.click(screen.getByText('Cancel'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
