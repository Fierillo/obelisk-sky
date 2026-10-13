// The "Edit profile" sheet: obelisk-dex's desktop editor
// (src/app/[locale]/app/settings/EditProfileForm.tsx: clickable banner and
// avatar, URL fields, the five kind 0 fields, Save/Cancel) in a centred dark
// card with its own header, a close × and Esc. Saving goes through the
// session shim's updateProfile (shims/session/useSession.ts).

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { EditProfileForm } from '@/app/[locale]/app/settings/EditProfileForm';
import Button from '@/components/ui/buttons/Button';
import { CloseIcon } from '@/assets/icons';
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
  const t = useTranslations();
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
      <div className="profile-sheet" role="dialog" aria-modal="true" aria-labelledby="profile-sheet-title" data-testid="profile-sheet">
        <div className="profile-sheet-head">
          <div className="min-w-0">
            <h2 id="profile-sheet-title" className="text-lc-white text-lg font-semibold">{t('settings.section.profile.label')}</h2>
            <p className="text-lc-muted mt-0.5 text-xs">{t('settings.section.profile.desc')}</p>
          </div>
          <Button variant="bare" type="button" className="profile-sheet-close" onClick={onClose} aria-label={t('common.close')} data-testid="profile-sheet-close">
            <CloseIcon size={18} />
          </Button>
        </div>
        <div className="profile-sheet-body" ref={body}>
          <EditProfileForm initial={current} onCancel={onClose} onSaved={onSaved} />
        </div>
      </div>
    </div>
  );
}
