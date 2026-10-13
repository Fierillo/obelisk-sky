// The "Edit profile" sheet: sky's face on obelisk-dex's editor logic
// (SkyProfileForm.tsx: banner and picture previews you tap, name and npub,
// the five kind 0 fields, Save/Cancel) in a centred cloud card with a close ×
// and Esc. Saving goes through the session shim's updateProfile
// (shims/session/useSession.ts).

import { useEffect, useRef, useState } from 'react';
import { SkyProfileForm, PROFILE_WORDS } from './SkyProfileForm';
import { lang } from '../i18n/lang';
import type { ProfileEditorInitial } from '@/types/session/profile';

export interface ProfilePanelProps {
  /** What sky already knows (shown at once). */
  initial: ProfileEditorInitial | null;
  /** The relays' newest kind 0, adopted when it lands unless you've typed. */
  load?: () => Promise<ProfileEditorInitial | null>;
  onClose: () => void;
  onSaved: () => void;
}

export function ProfilePanel({ initial, load, onClose, onSaved }: ProfilePanelProps) {
  const [current, setCurrent] = useState(initial);
  const body = useRef<HTMLDivElement>(null);

  // The form focuses the name field, which scrolls a short sheet (a phone
  // held sideways) past the banner and avatar: start at the top.
  useEffect(() => { body.current?.scrollTo?.({ top: 0 }); }, []);

  useEffect(() => {
    let live = true;
    load?.().then((p) => { if (live && p) setCurrent(p); }).catch(() => {});
    return () => { live = false; };
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div className="profile-overlay" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="profile-sheet" role="dialog" aria-modal="true" aria-label={PROFILE_WORDS[lang].title} data-testid="profile-sheet">
        <div className="profile-sheet-body" ref={body}>
          <SkyProfileForm initial={current} onCancel={onClose} onSaved={onSaved} />
        </div>
      </div>
    </div>
  );
}
