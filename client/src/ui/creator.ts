// "Your look": body, skin, hair, clothes and their colours, a hat and a pet.
// Every choice previews live on your own character; Save publishes it
// (nostr/avatars.ts) so everyone in the village sees the same you.

import { HATS, HAT_COLORS, PETS, cleanPetName, type Avatar, type Hat, type PetKind } from '../nostr/avatars';
import {
  BOTTOM_COLORS, CLOTH_COLORS, HAIRS, HAIR_COLORS, OUTFITS, SHOE_COLORS, SKIN_TONES, defaultLook,
  type Hair, type Outfit, type PersonLook,
} from '../people/people';
import { LookPreview } from './lookPreview';

const HAIR_LABEL: Record<Hair, string> = {
  none: 'None', buzzed: 'Buzzed', simpleparted: 'Parted', long: 'Long', buns: 'Buns', buzzedfemale: 'Short',
};
const OUTFIT_LABEL: Record<Outfit, string> = { peasant: 'Shirt and trousers', ranger: 'Ranger' };
/** What each skin tone looks like on a face, for the swatches. */
const TONE_PREVIEW = ['#efc3a0', '#e2ae8a', '#cf9a72', '#9a6446', '#80523a', '#5f3d2a'];

const HAT_LABEL: Record<Hat, string> = {
  none: 'No hat', cap: 'Cap', beanie: 'Beanie', tophat: 'Top hat', crown: 'Crown', headband: 'Headband', boina: 'Boina',
};

export interface CreatorDeps {
  current: () => Avatar;
  preview: (a: Avatar) => void;
  save: (a: Avatar) => Promise<string | null>;
  cancel: () => void;
}

/** The open panel's close (one at a time: opening again replaces it). */
let closeOpen: (() => void) | null = null;

export function openCreator(parent: HTMLElement, deps: CreatorDeps, first = false): void {
  closeOpen?.();
  parent.querySelector('.creator')?.remove();
  const draft: Avatar = JSON.parse(JSON.stringify(deps.current()));
  const el = document.createElement('div');
  el.className = 'creator';
  const stage = new LookPreview();
  const close = () => {
    stage.dispose();
    el.remove();
    if (closeOpen === close) closeOpen = null;
  };
  closeOpen = close;

  const head = document.createElement('div');
  head.className = 'themes-head';
  const title = document.createElement('div');
  title.className = 'themes-title';
  title.textContent = first ? 'Welcome to the village' : 'Your look';
  const sub = document.createElement('div');
  sub.className = 'themes-sub';
  sub.textContent = first ? 'Pick how you look here. Everyone in the village will see you this way. You can change it any time.' : 'Changes preview on your character. Save to show everyone.';
  head.append(title, sub);
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

  section('Body');
  chips('body', ['m', 'f'] as const, (v) => (v === 'm' ? 'Masculine' : 'Feminine'), (v) => {
    look().body = v;
    if (v === 'f') look().beard = false;
  });
  swatches('tone', TONE_PREVIEW, (_v, i) => { look().skin = SKIN_TONES[i].skin; look().skinTint = SKIN_TONES[i].tint; });

  section('Hair');
  chips('hair', HAIRS, (v) => HAIR_LABEL[v], (v) => { look().hair = v; });
  const beard = grid('chips beard');
  const beardBtn = document.createElement('button');
  beardBtn.type = 'button';
  beardBtn.className = 'creator-chip';
  beardBtn.textContent = 'Beard';
  beardBtn.addEventListener('click', () => { if (look().body === 'm') { look().beard = !look().beard; refresh(); } });
  beard.append(beardBtn);
  swatches('haircolor', HAIR_COLORS, (v) => { look().hairColor = v; });

  section('Clothes');
  chips('outfit', OUTFITS, (v) => OUTFIT_LABEL[v], (v) => { look().outfit = v; if (v !== 'ranger') look().hood = false; });
  const hood = grid('chips hood');
  const hoodBtn = document.createElement('button');
  hoodBtn.type = 'button';
  hoodBtn.className = 'creator-chip';
  hoodBtn.textContent = 'Hood up';
  hoodBtn.addEventListener('click', () => { if (look().outfit === 'ranger') { look().hood = !look().hood; refresh(); } });
  hood.append(hoodBtn);
  const label = (t: string) => { const d = document.createElement('div'); d.className = 'creator-sub'; d.textContent = t; body.append(d); };
  label('Top');
  swatches('sw-top', CLOTH_COLORS, (v) => { look().top = v; });
  label('Trousers');
  swatches('sw-bottom', BOTTOM_COLORS, (v) => { look().bottom = v; });
  label('Shoes');
  swatches('sw-shoes', SHOE_COLORS, (v) => { look().shoes = v; });

  section('Hat');
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

  section('Pet');
  const pets = grid('pets');
  const none = document.createElement('button');
  none.type = 'button';
  none.className = 'creator-pick creator-none';
  none.dataset.v = '';
  none.textContent = 'None';
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
  nameLabel.textContent = 'Pet name';
  const name = document.createElement('input');
  name.className = 'themes-select';
  name.maxLength = 24;
  name.placeholder = 'Optional';
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
  cancel.textContent = first ? 'Later' : 'Cancel';
  cancel.addEventListener('click', () => { deps.cancel(); close(); });
  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'account-btn primary';
  save.textContent = 'Save';
  save.addEventListener('click', async () => {
    save.disabled = true;
    status.textContent = 'Saving…';
    const err = await deps.save(draft);
    save.disabled = false;
    if (err) status.textContent = `Not saved: ${err}`;
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
