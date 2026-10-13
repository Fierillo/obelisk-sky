// The profile editor as a React island (like login/LoginMount.tsx): one root
// on a host div under <body>, rendered while the sheet is open.

import { createRoot, type Root } from 'react-dom/client';
import '../obelisk.generated.css';
import type { ProfileEditorInitial } from '@/types/session/profile';
import { ProfilePanel } from './ProfilePanel';

let root: Root | null = null;

export interface ProfileEditorOptions {
  initial: ProfileEditorInitial | null;
  load?: () => Promise<ProfileEditorInitial | null>;
  /** After a save went through (the caches are already updated by then). */
  onSaved?: () => void;
}

export function openProfileEditor(opts: ProfileEditorOptions): void {
  if (!root) {
    const host = document.createElement('div');
    host.className = 'profile-host';
    document.body.appendChild(host);
    root = createRoot(host);
  }
  const close = () => root?.render(null);
  root.render(<ProfilePanel initial={opts.initial} load={opts.load} onClose={close} onSaved={() => { close(); opts.onSaved?.(); }} />);
}

/** Logging out: an open editor belongs to the account that left. */
export function closeProfileEditor(): void {
  root?.render(null);
}
