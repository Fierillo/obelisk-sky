// Settings: this browser's preferences (prefs.ts), applied live.

import { CHAT_OPEN_PREFS, QUALITIES, TIMES, type Prefs, type PrefsStore } from '../prefs';

const QUALITY_LABEL: Record<Prefs['quality'], string> = {
  auto: 'Automatic (adapts to your device)', low: 'Low', medium: 'Medium', high: 'High', ultra: 'Ultra',
};
const CHAT_OPEN_LABEL: Record<Prefs['chatOpen'], string> = {
  auto: 'Open it automatically', ask: 'Show a button to open it', off: 'Do nothing',
};
const TIME_LABEL: Record<Prefs['timeOfDay'], string> = {
  auto: 'Buenos Aires time', day: 'Always day', sunset: 'Always sunset', night: 'Always night',
};

export function openSettings(parent: HTMLElement, store: PrefsStore, currentLevel: () => string): void {
  parent.querySelector('.settings')?.remove();
  const el = document.createElement('div');
  el.className = 'themes settings';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Settings');
  const head = document.createElement('div');
  head.className = 'themes-head';
  const title = document.createElement('div');
  title.className = 'themes-title';
  title.textContent = 'Settings';
  const sub = document.createElement('div');
  sub.className = 'themes-sub';
  sub.textContent = 'Saved in this browser only.';
  head.append(title, sub);
  const body = document.createElement('div');
  body.className = 'themes-body';

  const section = (t: string) => {
    const h = document.createElement('div');
    h.className = 'themes-section';
    h.textContent = t;
    body.append(h);
  };
  const row = (label: string, control: HTMLElement, hint?: string) => {
    const r = document.createElement('label');
    r.className = 'themes-row settings-row';
    const l = document.createElement('span');
    l.textContent = label;
    if (hint) {
      const h = document.createElement('small');
      h.textContent = ` ${hint}`;
      l.append(h);
    }
    r.append(l, control);
    body.append(r);
  };
  const toggle = (key: keyof Prefs) => {
    const i = document.createElement('input');
    i.type = 'checkbox';
    i.className = 'settings-toggle';
    i.checked = store.get()[key] as boolean;
    i.addEventListener('change', () => store.set({ [key]: i.checked } as Partial<Prefs>));
    return i;
  };
  const slider = (key: keyof Prefs, min: number, max: number, step: number, fmt: (v: number) => string) => {
    const wrap = document.createElement('span');
    wrap.className = 'settings-slider';
    const i = document.createElement('input');
    i.type = 'range';
    i.min = String(min);
    i.max = String(max);
    i.step = String(step);
    i.value = String(store.get()[key]);
    const out = document.createElement('output');
    out.textContent = fmt(Number(i.value));
    i.addEventListener('input', () => { out.textContent = fmt(Number(i.value)); store.set({ [key]: Number(i.value) } as Partial<Prefs>); });
    wrap.append(i, out);
    return wrap;
  };
  const select = <T extends string>(key: keyof Prefs, options: readonly T[], labels: Record<T, string>) => {
    const s = document.createElement('select');
    s.className = 'themes-select';
    for (const o of options) {
      const opt = document.createElement('option');
      opt.value = o;
      opt.textContent = labels[o];
      s.append(opt);
    }
    s.value = store.get()[key] as string;
    s.addEventListener('change', () => store.set({ [key]: s.value } as Partial<Prefs>));
    return s;
  };

  section('Graphics');
  const levelHint = document.createElement('small');
  row('Quality', select('quality', QUALITIES, QUALITY_LABEL));
  levelHint.className = 'settings-hint';
  levelHint.textContent = `Rendering at: ${currentLevel()}`;
  body.append(levelHint);
  row('Resolution', slider('resolution', 0.5, 1.5, 0.05, (v) => `${Math.round(v * 100)}%`));
  row('Shadows', toggle('shadows'));
  row('Ambient occlusion', toggle('ambientOcclusion'), '(soft contact shadows)');
  row('Glow (bloom)', toggle('bloom'));
  row('Miniature lens', toggle('tiltShift'), '(tilt-shift blur)');
  row('Grass', toggle('grass'));

  section('World');
  row('Time of day', select('timeOfDay', TIMES, TIME_LABEL));
  row('Channel signs', toggle('signs'));
  row('Speech bubbles', toggle('bubbles'));
  row('Message feed', toggle('feed'), '(bottom left)');
  row('Share my movement live', toggle('shareMotion'), '(others see you walk)');

  section('Camera and controls');
  row('Auto camera', toggle('autoDirector'), '(follows conversations)');
  row('First-person field of view', slider('fov', 50, 100, 1, (v) => `${v}°`));
  row('Mouse sensitivity', slider('mouseSensitivity', 0.25, 3, 0.05, (v) => `${v.toFixed(2)}×`));
  row('Invert vertical look', toggle('invertY'));

  section('Chat');
  row('Walking into a channel', select('chatOpen', CHAT_OPEN_PREFS, CHAT_OPEN_LABEL));
  row('Panel opacity', slider('chatOpacity', 0.15, 1, 0.01, (v) => `${Math.round(v * 100)}%`));

  section('Sound');
  row('Ambient sound', toggle('sound'));
  row('Volume', slider('volume', 0, 1, 0.01, (v) => `${Math.round(v * 100)}%`));

  const foot = document.createElement('div');
  foot.className = 'themes-foot';
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'account-btn';
  reset.textContent = 'Reset to defaults';
  reset.addEventListener('click', () => { store.reset(); openSettings(parent, store, currentLevel); });
  const done = document.createElement('button');
  done.type = 'button';
  done.className = 'account-btn primary';
  done.textContent = 'Done';
  const close = () => { el.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  done.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  foot.append(reset, document.createElement('span'), done);
  el.append(head, body, foot);
  parent.append(el);
  const tick = setInterval(() => { if (!el.isConnected) clearInterval(tick); else levelHint.textContent = `Rendering at: ${currentLevel()}`; }, 1000);
}
