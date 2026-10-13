// The relay operator's district editor: assign channels, or whole categories
// from the app's channel layout, to a themed part of the island. Saved as
// sky's own kind 30078 (nostr/themes.ts); obelisk-dex never reads it.

import { THEMES, THEME_LABEL, type ThemeConfig, type ThemeId } from '../nostr/themes';
import type { WireGroup } from '../nostr/wire';
import { vw } from '../i18n/village';

export interface ThemeEditorDeps {
  config: () => ThemeConfig;
  categoryNames: () => Record<string, string>;
  categoryOf: () => Record<string, string>;
  groups: () => WireGroup[];
  resolved: (g: WireGroup) => ThemeId;
  save: (cfg: ThemeConfig) => Promise<string | null>;
}

export function openThemeEditor(parent: HTMLElement, deps: ThemeEditorDeps): void {
  parent.querySelector('.themes')?.remove();
  const cfg: ThemeConfig = {
    channels: { ...deps.config().channels },
    categories: { ...deps.config().categories },
    updatedAt: deps.config().updatedAt,
  };
  const el = document.createElement('div');
  el.className = 'themes';
  const head = document.createElement('div');
  head.className = 'themes-head';
  const title = document.createElement('div');
  title.className = 'themes-title';
  title.textContent = vw.districts;
  const sub = document.createElement('div');
  sub.className = 'themes-sub';
  sub.textContent = vw.districtsSub;
  head.append(title, sub);
  const body = document.createElement('div');
  body.className = 'themes-body';

  const select = (value: ThemeId | '', onChange: (v: ThemeId | '') => void, autoLabel: string) => {
    const s = document.createElement('select');
    s.className = 'themes-select';
    const auto = document.createElement('option');
    auto.value = '';
    auto.textContent = vw.automatic(autoLabel);
    s.append(auto);
    for (const th of THEMES) {
      const o = document.createElement('option');
      o.value = th;
      o.textContent = THEME_LABEL[th];
      s.append(o);
    }
    s.value = value;
    s.addEventListener('change', () => onChange(s.value as ThemeId | ''));
    return s;
  };

  const cats = deps.categoryNames();
  if (Object.keys(cats).length) {
    const h = document.createElement('div');
    h.className = 'themes-section';
    h.textContent = vw.categories;
    body.append(h);
    for (const [id, name] of Object.entries(cats)) {
      const row = document.createElement('label');
      row.className = 'themes-row';
      const n = document.createElement('span');
      n.textContent = name || vw.untitledCategory;
      row.append(n, select(cfg.categories[id] ?? '', (v) => { if (v) cfg.categories[id] = v; else delete cfg.categories[id]; }, vw.byChannel));
      body.append(row);
    }
  }
  const h2 = document.createElement('div');
  h2.className = 'themes-section';
  h2.textContent = vw.channels;
  body.append(h2);
  for (const g of deps.groups()) {
    const row = document.createElement('label');
    row.className = 'themes-row';
    const n = document.createElement('span');
    n.textContent = g.name;
    const cat = deps.categoryOf()[g.id];
    if (cat && cats[cat]) {
      const c = document.createElement('small');
      c.textContent = ` · ${cats[cat]}`;
      n.append(c);
    }
    row.append(n, select(cfg.channels[g.id] ?? '', (v) => { if (v) cfg.channels[g.id] = v; else delete cfg.channels[g.id]; }, THEME_LABEL[deps.resolved(g)]));
    body.append(row);
  }

  const foot = document.createElement('div');
  foot.className = 'themes-foot';
  const status = document.createElement('span');
  status.className = 'themes-status';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'account-btn';
  cancel.textContent = vw.cancel;
  cancel.addEventListener('click', () => el.remove());
  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'account-btn primary';
  save.textContent = vw.saveDistricts;
  save.addEventListener('click', async () => {
    save.disabled = true;
    status.textContent = vw.saving;
    const err = await deps.save(cfg);
    save.disabled = false;
    if (err) status.textContent = vw.notSaved(err);
    else el.remove();
  });
  foot.append(status, cancel, save);
  el.append(head, body, foot);
  parent.append(el);
}
