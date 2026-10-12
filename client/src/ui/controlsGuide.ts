// "How to play": the controls, from the help button in the bottom bar, and
// once on first login. Touch screens get the touch version.

const SEEN_KEY = 'obelisk-sky/controls-seen';

interface Row { keys: string[]; text: string }

const DESKTOP: { title: string; rows: Row[] }[] = [
  {
    title: 'Move',
    rows: [
      { keys: ['W', 'A', 'S', 'D'], text: 'Walk (arrow keys work too)' },
      { keys: ['Shift'], text: 'Hold to run' },
      { keys: ['W', 'W'], text: 'Double-tap a direction key to run; let go to walk again' },
      { keys: ['Space'], text: 'Jump (works while walking and running too); hold it to keep jumping' },
      { keys: ['Click'], text: 'Click the ground to walk there' },
      { keys: ['Drag'], text: 'Turn the camera; scroll to zoom' },
      { keys: ['V'], text: 'First-person view: click to look with the mouse; V or Esc to leave' },
    ],
  },
  {
    title: 'Talk',
    rows: [
      { keys: ['Walk in'], text: 'Stand in front of a building to open its channel' },
      { keys: ['Enter'], text: 'Type a message in the channel you are in' },
      { keys: ['Click'], text: 'Click a speech bubble to reply; you walk over to them' },
      { keys: ['Click'], text: 'Click a sign or building to walk to that channel' },
    ],
  },
  {
    title: 'Hang out',
    rows: [
      { keys: ['E'], text: 'Sit on a nearby bench or stool and drink mate, at the café for a coffee and a laptop, or at the parrilla for asado; E again to stand' },
      { keys: ['E', '2'], text: 'In the sports park: E trains at the nearest bar (pull-ups, dips, push-ups), 2 does muscle-ups at the pull-up bar; walk off to stop' },
      { keys: ['G'], text: 'Emotes: dance, sit in the lotus pose, nod, fold your arms… then 1–9 or 0 to pick; walk off to stop' },
      { keys: ['Join call'], text: 'In a voice channel’s pavilion, join the call' },
      { keys: ['Game'], text: 'In a channel, start a game; click a table to play' },
      { keys: ['Your name'], text: 'Top right: change your look and your pet' },
    ],
  },
];

const TOUCH: { title: string; rows: Row[] }[] = [
  {
    title: 'Move',
    rows: [
      { keys: ['Stick'], text: 'The thumb stick, bottom left; push all the way to run' },
      { keys: ['Tap'], text: 'Tap the ground to walk there' },
      { keys: ['Drag'], text: 'Turn the camera; pinch to zoom' },
      { keys: ['Eye'], text: 'First-person view: drag to look around' },
    ],
  },
  {
    title: 'Talk',
    rows: [
      { keys: ['Walk in'], text: 'Stand in front of a building to open its channel' },
      { keys: ['Tap'], text: 'Tap a speech bubble to reply; you walk over to them' },
    ],
  },
  {
    title: 'Hang out',
    rows: [
      { keys: ['Sit'], text: 'Near a bench or stool, tap Sit to drink mate' },
      { keys: ['Menu', 'Emotes'], text: 'Dance, sit in the lotus pose, nod…; walk off to stop' },
      { keys: ['Join call'], text: 'In a voice channel’s pavilion, join the call' },
      { keys: ['Your name'], text: 'Top right: change your look and your pet' },
    ],
  },
];

export const isTouch = () => matchMedia('(pointer: coarse)').matches;

export function openControlsGuide(parent: HTMLElement): void {
  parent.querySelector('.guide')?.remove();
  const el = document.createElement('div');
  el.className = 'themes guide';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Controls');
  const head = document.createElement('div');
  head.className = 'themes-head';
  const title = document.createElement('div');
  title.className = 'themes-title';
  title.textContent = 'How to play';
  const sub = document.createElement('div');
  sub.className = 'themes-sub';
  sub.textContent = 'You are the character with your name above it. Walk to a channel’s building to join the conversation there.';
  head.append(title, sub);
  const body = document.createElement('div');
  body.className = 'themes-body';
  for (const sec of isTouch() ? TOUCH : DESKTOP) {
    const h = document.createElement('div');
    h.className = 'themes-section';
    h.textContent = sec.title;
    body.append(h);
    for (const r of sec.rows) {
      const row = document.createElement('div');
      row.className = 'guide-row';
      const keys = document.createElement('div');
      keys.className = 'guide-keys';
      for (const k of r.keys) {
        const kbd = document.createElement('kbd');
        kbd.textContent = k;
        keys.append(kbd);
      }
      const text = document.createElement('div');
      text.className = 'guide-text';
      text.textContent = r.text;
      row.append(keys, text);
      body.append(row);
    }
  }
  const foot = document.createElement('div');
  foot.className = 'themes-foot';
  const hint = document.createElement('span');
  hint.className = 'themes-status';
  hint.textContent = 'Open this again with the ? button.';
  const ok = document.createElement('button');
  ok.type = 'button';
  ok.className = 'account-btn primary';
  ok.textContent = 'Got it';
  const close = () => { el.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  ok.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  foot.append(hint, ok);
  el.append(head, body, foot);
  parent.append(el);
  ok.focus();
}

/** Show the guide once per browser, the first time someone logs in. */
export function maybeShowControlsGuide(parent: HTMLElement): boolean {
  try {
    if (localStorage.getItem(SEEN_KEY) === '1') return false;
    localStorage.setItem(SEEN_KEY, '1');
  } catch { /* private mode: show it anyway */ }
  openControlsGuide(parent);
  return true;
}
