// "Your look": body, skin, hair, clothes and their colours, a hat and a pet.
// Every choice previews live on your own character; Save publishes it
// (nostr/avatars.ts) so everyone in the village sees the same you.

import { HATS, HAT_COLORS, PETS, cleanPetName, type Avatar, type Hat, type PetKind } from '../nostr/avatars';
import {
  BOTTOM_COLORS, CLOTH_COLORS, HAIRS, HAIR_COLORS, OUTFITS, SHOE_COLORS, SKIN_TONES, defaultLook,
  type Hair, type Outfit, type PersonLook,
} from '../people/people';
import { LookPreview } from './lookPreview';
import { lang, type Lang } from '../i18n/lang';

/** What each skin tone looks like on a face, for the swatches. */
const TONE_PREVIEW = ['#efc3a0', '#e2ae8a', '#cf9a72', '#9a6446', '#80523a', '#5f3d2a'];

const EN = {
  welcome: 'Welcome to the village', yours: 'Your look',
  welcomeSub: 'Pick how you look here. Everyone in the village will see you this way. You can change it any time.',
  yoursSub: 'Changes preview on your character. Save to show everyone.',
  body: 'Body', masculine: 'Masculine', feminine: 'Feminine', hair: 'Hair', beard: 'Beard', clothes: 'Clothes', hood: 'Hood up',
  top: 'Top', trousers: 'Trousers', shoes: 'Shoes', hat: 'Hat', pet: 'Pet', none: 'None', petName: 'Pet name', optional: 'Optional',
  later: 'Later', cancel: 'Cancel', save: 'Save', saving: 'Saving…', notSaved: 'Not saved:',
  hair_: { none: 'None', buzzed: 'Buzzed', simpleparted: 'Parted', long: 'Long', buns: 'Buns', buzzedfemale: 'Short' } as Record<Hair, string>,
  outfit_: { peasant: 'Shirt and trousers', ranger: 'Ranger' } as Record<Outfit, string>,
  hat_: { none: 'No hat', cap: 'Cap', beanie: 'Beanie', tophat: 'Top hat', crown: 'Crown', headband: 'Headband', boina: 'Boina' } as Record<Hat, string>,
};

const ES: typeof EN = {
  welcome: 'Bienvenido a la aldea', yours: 'Tu aspecto',
  welcomeSub: 'Elegí cómo te ves. Todos en la aldea te van a ver así. Podés cambiarlo cuando quieras.',
  yoursSub: 'Los cambios se ven en tu personaje. Guardá para mostrárselos a todos.',
  body: 'Cuerpo', masculine: 'Masculino', feminine: 'Femenino', hair: 'Pelo', beard: 'Barba', clothes: 'Ropa', hood: 'Capucha puesta',
  top: 'Arriba', trousers: 'Pantalón', shoes: 'Zapatos', hat: 'Sombrero', pet: 'Mascota', none: 'Ninguna', petName: 'Nombre de la mascota', optional: 'Opcional',
  later: 'Más tarde', cancel: 'Cancelar', save: 'Guardar', saving: 'Guardando…', notSaved: 'No se guardó:',
  hair_: { none: 'Sin pelo', buzzed: 'Rapado', simpleparted: 'Con raya', long: 'Largo', buns: 'Rodetes', buzzedfemale: 'Corto' },
  outfit_: { peasant: 'Camisa y pantalón', ranger: 'Explorador' },
  hat_: { none: 'Sin sombrero', cap: 'Gorra', beanie: 'Gorro', tophat: 'Galera', crown: 'Corona', headband: 'Vincha', boina: 'Boina' },
};

export const CREATOR_WORDS: Record<Lang, typeof EN> = { en: EN, es: ES };
const W = CREATOR_WORDS[lang];
const HAIR_LABEL = W.hair_;
const OUTFIT_LABEL = W.outfit_;
const HAT_LABEL = W.hat_;

export interface CreatorDeps {
  current: () => Avatar;
  preview: (a: Avatar) => void;
  save: (a: Avatar) => Promise<string | null>;
  cancel: () => void;
}

/** The open panel's close (one at a time: opening again replaces it). */
let closeOpen: (() => void) | null = null;
/** Leave the open panel as Cancel does (the preview goes back); false when none was open. */
let dismissOpen: (() => void) | null = null;

/** Close the look panel as its Cancel / × / Esc do. True if one was open. */
export function closeCreator(): boolean {
  if (!dismissOpen) return false;
  dismissOpen();
  return true;
}

export function openCreator(parent: HTMLElement, deps: CreatorDeps, first = false): void {
  closeOpen?.();
  parent.querySelector('.creator')?.remove();
  const draft: Avatar = JSON.parse(JSON.stringify(deps.current()));
  const el = document.createElement('div');
  el.className = 'creator';
  const stage = new LookPreview();
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss(); };
  const close = () => {
    stage.dispose();
    el.remove();
    window.removeEventListener('keydown', onKey);
    if (closeOpen === close) { closeOpen = null; dismissOpen = null; }
  };
  const dismiss = () => { deps.cancel(); close(); };
  closeOpen = close;
  dismissOpen = dismiss;
  window.addEventListener('keydown', onKey);

  const head = document.createElement('div');
  head.className = 'themes-head';
  const title = document.createElement('div');
  title.className = 'themes-title';
  title.textContent = first ? W.welcome : W.yours;
  const sub = document.createElement('div');
  sub.className = 'themes-sub';
  sub.textContent = first ? W.welcomeSub : W.yoursSub;
  // A × as well as Cancel: on a short screen the foot can be out of reach.
  const x = document.createElement('button');
  x.type = 'button';
  x.className = 'creator-close';
  x.setAttribute('aria-label', W.cancel);
  x.title = W.cancel;
  x.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  x.addEventListener('click', dismiss);
  head.append(title, sub, x);
  const body = document.createElement('div');
  body.className = 'themes-body creator-body';

  const section = (label: string) => {
    const h = document.createElement('div');
    h.className = 'themes-section';
    h.textContent = label;
    body.append(h);
  };
  const grid = (cls: string) => {
    const g = document.createElement('div');
    g.className = `creator-grid ${cls}`;
    body.append(g);
    return g;
  };
  const refresh = () => { deps.preview(draft); stage.set(draft); paint(); };

  draft.v = 2;
  draft.look ??= defaultLook(0);
  const look = (): PersonLook => draft.look!;
  const chips = <T extends string>(cls: string, values: readonly T[], label: (v: T) => string, set: (v: T) => void) => {
    const g = grid(`chips ${cls}`);
    for (const v of values) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'creator-chip';
      b.dataset.v = v;
      b.textContent = label(v);
      b.addEventListener('click', () => { set(v); refresh(); });
      g.append(b);
    }
  };
  const swatches = (cls: string, values: readonly string[], set: (v: string, i: number) => void, preview: (v: string, i: number) => string = (v) => v) => {
    const g = grid(`swatches ${cls}`);
    values.forEach((v, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'creator-swatch';
      b.dataset.v = String(i);
      b.style.background = preview(v, i);
      b.addEventListener('click', () => { set(v, i); refresh(); });
      g.append(b);
    });
  };

  section(W.body);
  chips('body', ['m', 'f'] as const, (v) => (v === 'm' ? W.masculine : W.feminine), (v) => {
    look().body = v;
    if (v === 'f') look().beard = false;
  });
  swatches('tone', TONE_PREVIEW, (_v, i) => { look().skin = SKIN_TONES[i].skin; look().skinTint = SKIN_TONES[i].tint; });

  section(W.hair);
  chips('hair', HAIRS, (v) => HAIR_LABEL[v], (v) => { look().hair = v; });
  const beard = grid('chips beard');
  const beardBtn = document.createElement('button');
  beardBtn.type = 'button';
  beardBtn.className = 'creator-chip';
  beardBtn.textContent = W.beard;
  beardBtn.addEventListener('click', () => { if (look().body === 'm') { look().beard = !look().beard; refresh(); } });
  beard.append(beardBtn);
  swatches('haircolor', HAIR_COLORS, (v) => { look().hairColor = v; });

  section(W.clothes);
  chips('outfit', OUTFITS, (v) => OUTFIT_LABEL[v], (v) => { look().outfit = v; if (v !== 'ranger') look().hood = false; });
  const hood = grid('chips hood');
  const hoodBtn = document.createElement('button');
  hoodBtn.type = 'button';
  hoodBtn.className = 'creator-chip';
  hoodBtn.textContent = W.hood;
  hoodBtn.addEventListener('click', () => { if (look().outfit === 'ranger') { look().hood = !look().hood; refresh(); } });
  hood.append(hoodBtn);
  const label = (t: string) => { const d = document.createElement('div'); d.className = 'creator-sub'; d.textContent = t; body.append(d); };
  label(W.top);
  swatches('sw-top', CLOTH_COLORS, (v) => { look().top = v; });
  label(W.trousers);
  swatches('sw-bottom', BOTTOM_COLORS, (v) => { look().bottom = v; });
  label(W.shoes);
  swatches('sw-shoes', SHOE_COLORS, (v) => { look().shoes = v; });

  section(W.hat);
  const hats = grid('chips');
  for (const h of HATS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'creator-chip';
    b.dataset.v = h;
    b.textContent = HAT_LABEL[h];
    b.addEventListener('click', () => { draft.hat = h; refresh(); });
    hats.append(b);
  }
  const colors = grid('swatches hatcolor');
  for (const c of HAT_COLORS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'creator-swatch';
    b.dataset.v = c;
    b.title = c;
    b.style.background = c;
    b.addEventListener('click', () => { draft.hatColor = c; refresh(); });
    colors.append(b);
  }

  section(W.pet);
  const pets = grid('pets');
  const none = document.createElement('button');
  none.type = 'button';
  none.className = 'creator-pick creator-none';
  none.dataset.v = '';
  none.textContent = W.none;
  none.addEventListener('click', () => { draft.pet = null; refresh(); });
  pets.append(none);
  for (const p of PETS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'creator-pick';
    b.dataset.v = p;
    b.title = p;
    const img = document.createElement('img');
    img.src = `/pets/${p}.png`;
    img.alt = '';
    b.append(img);
    b.addEventListener('click', () => { draft.pet = { kind: p as PetKind, name: draft.pet?.name ?? '' }; refresh(); });
    pets.append(b);
  }
  const nameRow = document.createElement('label');
  nameRow.className = 'themes-row';
  const nameLabel = document.createElement('span');
  nameLabel.textContent = W.petName;
  const name = document.createElement('input');
  name.className = 'themes-select';
  name.maxLength = 24;
  name.placeholder = W.optional;
  name.value = draft.pet?.name ?? '';
  name.addEventListener('input', () => { if (draft.pet) { draft.pet.name = cleanPetName(name.value); deps.preview(draft); } });
  nameRow.append(nameLabel, name);
  body.append(nameRow);

  const foot = document.createElement('div');
  foot.className = 'themes-foot';
  const status = document.createElement('span');
  status.className = 'themes-status';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'account-btn';
  cancel.textContent = first ? W.later : W.cancel;
  cancel.addEventListener('click', dismiss);
  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'account-btn primary';
  save.textContent = W.save;
  save.addEventListener('click', async () => {
    save.disabled = true;
    status.textContent = W.saving;
    const err = await deps.save(draft);
    save.disabled = false;
    if (err) status.textContent = `${W.notSaved} ${err}`;
    else close();
  });
  foot.append(status, cancel, save);
  el.append(head, stage.canvas, body, foot);
  parent.append(el);
  stage.set(draft);

  function paint() {
    const L = look();
    const on = (sel: string, test: (v: string) => boolean) => {
      for (const b of el.querySelectorAll<HTMLElement>(sel)) b.classList.toggle('on', test(b.dataset.v ?? ''));
    };
    on('.body .creator-chip', (v) => v === L.body);
    on('.tone .creator-swatch', (v) => SKIN_TONES[Number(v)].skin === L.skin && SKIN_TONES[Number(v)].tint === L.skinTint);
    on('.hair .creator-chip', (v) => v === L.hair);
    on('.haircolor .creator-swatch', (v) => HAIR_COLORS[Number(v)] === L.hairColor);
    on('.outfit .creator-chip', (v) => v === L.outfit);
    on('.sw-top .creator-swatch', (v) => CLOTH_COLORS[Number(v)] === L.top);
    on('.sw-bottom .creator-swatch', (v) => BOTTOM_COLORS[Number(v)] === L.bottom);
    on('.sw-shoes .creator-swatch', (v) => SHOE_COLORS[Number(v)] === L.shoes);
    beardBtn.classList.toggle('on', L.beard);
    beardBtn.disabled = L.body !== 'm';
    hoodBtn.classList.toggle('on', L.hood);
    hoodBtn.disabled = L.outfit !== 'ranger';
    for (const b of el.querySelectorAll<HTMLElement>('.chips:not(.body):not(.hair):not(.outfit):not(.beard):not(.hood) .creator-chip')) b.classList.toggle('on', b.dataset.v === draft.hat);
    for (const b of el.querySelectorAll<HTMLElement>('.hatcolor .creator-swatch')) b.classList.toggle('on', b.dataset.v === draft.hatColor);
    for (const b of el.querySelectorAll<HTMLElement>('.pets .creator-pick')) b.classList.toggle('on', (b.dataset.v || null) === (draft.pet?.kind ?? null));
    name.disabled = !draft.pet;
  }
  paint();
}
