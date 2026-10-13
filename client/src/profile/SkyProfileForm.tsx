// The profile editor's face, in sky's colours: your banner and picture as
// big previews you tap to change (no URL boxes), your name and npub as
// others will see them, and the kind 0 fields as plain labelled rows. The
// behaviour is obelisk-dex's, through its own hooks: `useProfileEditorForm`
// (late profile adopted until you type, Save validates and publishes through
// the session shim's updateProfile) and `useProfileAppearanceEditor` (a
// picked image is checked, previewed and uploaded only on Save).

import { useRef, useState } from 'react';
import { nip19 } from 'nostr-tools';
import { useProfileEditorForm } from '@/hooks/session/useProfileEditorForm';
import { useProfileAppearanceEditor } from '@/hooks/settings/account/useProfileAppearanceEditor';
import { useMyPubkey } from '@/hooks/session/useSession';
import { profileAppearance, profileAppearancePatch, type ProfileEditorInitial } from '@/utils/chat/profile/profile-form-values';
import { lang, type Lang } from '../i18n/lang';

const EN = {
  title: 'Your profile', sub: 'How everyone on Nostr sees you.',
  cover: 'Change cover', addCover: 'Add a cover', photo: 'Change photo', remove: 'Remove',
  uploadingPhoto: 'Uploading photo…', uploadingCover: 'Uploading cover…',
  copy: 'Copy', copied: 'Copied',
  name: 'Name', namePh: 'How people call you',
  about: 'About you', aboutPh: 'A few words about you',
  lud16: 'Lightning address', lud16Hint: 'Where your zaps arrive', lud16Ph: 'you@walletofsatoshi.com',
  nip05: 'Verified address (NIP-05)', nip05Ph: 'you@example.com',
  website: 'Website', websitePh: 'https://…',
  cancel: 'Cancel', save: 'Save', saving: 'Saving…', close: 'Close',
};
const ES: typeof EN = {
  title: 'Tu perfil', sub: 'Así te ve todo el mundo en Nostr.',
  cover: 'Cambiar portada', addCover: 'Agregar portada', photo: 'Cambiar foto', remove: 'Quitar',
  uploadingPhoto: 'Subiendo foto…', uploadingCover: 'Subiendo portada…',
  copy: 'Copiar', copied: 'Copiado',
  name: 'Nombre', namePh: 'Cómo te llaman',
  about: 'Sobre vos', aboutPh: 'Unas palabras sobre vos',
  lud16: 'Dirección Lightning', lud16Hint: 'Adonde te llegan los zaps', lud16Ph: 'vos@walletofsatoshi.com',
  nip05: 'Dirección verificada (NIP-05)', nip05Ph: 'vos@ejemplo.com',
  website: 'Sitio web', websitePh: 'https://…',
  cancel: 'Cancelar', save: 'Guardar', saving: 'Guardando…', close: 'Cerrar',
};
export const PROFILE_WORDS: Record<Lang, typeof EN> = { en: EN, es: ES };

/** A stable colour per key, for the initial when there's no picture. */
function keyHue(pk: string): number {
  let h = 0;
  for (let i = 0; i < pk.length; i++) h = (h * 31 + pk.charCodeAt(i)) % 360;
  return h;
}

function shortNpub(pk: string | null): { full: string; short: string } | null {
  if (!pk || !/^[0-9a-f]{64}$/i.test(pk)) return null;
  const full = nip19.npubEncode(pk);
  return { full, short: `${full.slice(0, 12)}…${full.slice(-6)}` };
}

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="sp-icon"><path d={d} /></svg>
);
const CAMERA = 'M4 8h3l2-3h6l2 3h3v11H4z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z';
const BOLT = 'M13 2 4 14h7l-1 8 9-12h-7z';
const CHECK = 'M12 2l2.4 2.2 3.2-.4.9 3.1 2.8 1.6-1.2 3 1.2 3-2.8 1.6-.9 3.1-3.2-.4L12 22l-2.4-2.2-3.2.4-.9-3.1-2.8-1.6 1.2-3-1.2-3 2.8-1.6.9-3.1 3.2.4z M8.5 12l2.5 2.5 4.5-5';
const LINK = 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1';
const CLOSE = 'M6 6l12 12M18 6 6 18';

export function SkyProfileForm({ initial, onCancel, onSaved, l = lang }: {
  initial: ProfileEditorInitial | null;
  onCancel: () => void;
  onSaved: () => void;
  l?: Lang;
}) {
  const W = PROFILE_WORDS[l];
  const form = useProfileEditorForm(initial, onSaved);
  const look = useProfileAppearanceEditor(profileAppearance(form.values), (next) => form.setValues(profileAppearancePatch(next)));
  const pubkey = useMyPubkey();
  const npub = shortNpub(pubkey);
  const [copied, setCopied] = useState(false);
  const pictureInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);
  const name = form.values.name.trim();
  const nip05 = form.values.nip05.trim().replace(/^_@/, '');

  const copy = async () => {
    if (!npub) return;
    try { await navigator.clipboard.writeText(npub.full); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* no clipboard: nothing to say */ }
  };

  const field = (key: 'name' | 'about' | 'lud16' | 'nip05' | 'website', label: string, ph: string, icon?: string, hint?: string) => (
    <label className="sp-field">
      <span className="sp-label">{icon && <Icon d={icon} />}{label}{hint && <em>{hint}</em>}</span>
      {key === 'about'
        ? <textarea className="sp-input sp-area" rows={3} placeholder={ph} {...form.field(key)} />
        : <input className="sp-input" placeholder={ph} autoComplete="off" spellCheck={false} {...form.field(key)} />}
    </label>
  );

  return (
    <form className="sp" onSubmit={(e) => void form.submit(e)} noValidate>
      <div className="sp-hero">
        <button type="button" className="sp-banner" onClick={() => bannerInput.current?.click()} aria-label={look.bannerSrc ? W.cover : W.addCover} data-testid="edit-banner-tap">
          {look.bannerSrc ? <img src={look.bannerSrc} alt="" referrerPolicy="no-referrer" /> : <span className="sp-banner-sky" aria-hidden="true"><i /><i /><i /></span>}
          <span className="sp-chip"><Icon d={CAMERA} />{form.uploading === 'banner' ? W.uploadingCover : look.bannerSrc ? W.cover : W.addCover}</span>
        </button>
        {look.bannerSrc && <button type="button" className="sp-remove sp-remove-banner" onClick={() => look.setUrl('banner', '')}>{W.remove}</button>}
        <button type="button" className="sp-close" onClick={onCancel} aria-label={W.close} data-testid="profile-sheet-close"><Icon d={CLOSE} /></button>
        <div className="sp-avatar-wrap">
          <button type="button" className="sp-avatar" onClick={() => pictureInput.current?.click()} aria-label={W.photo} data-testid="edit-avatar-tap"
            style={look.pictureSrc ? undefined : { background: `hsl(${keyHue(pubkey ?? '')} 60% 55%)` }}>
            {look.pictureSrc ? <img src={look.pictureSrc} alt="" referrerPolicy="no-referrer" /> : <span>{([...(name || '?')][0] ?? '?').toUpperCase()}</span>}
            <span className={form.uploading === 'picture' ? 'sp-cam sp-busy' : 'sp-cam'}><Icon d={CAMERA} /></span>
          </button>
          {look.pictureSrc && <button type="button" className="sp-remove" onClick={() => look.setUrl('picture', '')}>{W.remove}</button>}
        </div>
      </div>
      <input ref={bannerInput} type="file" accept="image/*" hidden onChange={(e) => look.picked('banner', e.currentTarget)} />
      <input ref={pictureInput} type="file" accept="image/*" hidden onChange={(e) => look.picked('picture', e.currentTarget)} />

      <div className="sp-who">
        <div className="sp-name">{name || W.title}</div>
        {nip05 && <div className="sp-nip"><Icon d={CHECK} />{nip05}</div>}
        {npub && (
          <button type="button" className="sp-npub" onClick={() => void copy()} title={npub.full}>
            <code>{npub.short}</code><span>{copied ? W.copied : W.copy}</span>
          </button>
        )}
      </div>
      {look.error && <p className="sp-error" role="alert">{look.error}</p>}

      <div className="sp-fields">
        {field('name', W.name, W.namePh)}
        {field('about', W.about, W.aboutPh)}
        {field('lud16', W.lud16, W.lud16Ph, BOLT, W.lud16Hint)}
        {field('nip05', W.nip05, W.nip05Ph, CHECK)}
        {field('website', W.website, W.websitePh, LINK)}
      </div>

      {form.error && <p className="sp-error" role="alert">{form.error}</p>}
      <div className="sp-foot">
        <button type="button" className="sp-btn" onClick={onCancel}>{W.cancel}</button>
        <button type="submit" className="sp-btn sp-primary" disabled={form.busy} data-testid="save-profile-button">
          {form.uploading === 'picture' ? W.uploadingPhoto : form.uploading === 'banner' ? W.uploadingCover : form.submitting ? W.saving : W.save}
        </button>
      </div>
    </form>
  );
}
