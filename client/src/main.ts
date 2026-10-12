import { nip19, type VerifiedEvent } from 'nostr-tools';
import type * as THREE from 'three';
import { renderContent } from './ui/content';
import type { ServerMsg, WireGroup, WireMessage } from './nostr/wire';
import { hexToNpub } from '@nostr-wot/data';
import { Feed, type FeedAccess } from './nostr/feed';
import { deletionTemplate, joinTemplate, messageTemplate, publishToGroup, publishSigned, reactionTemplate } from './nostr/publish';
import type { WireReaction } from './nostr/wire';
import { PlayerController, placeAt } from './player/controller';
import { InputState, isTyping, mountJoystick } from './player/input';
import { ChatPanel } from './ui/chatPanel';
import { ReadState, countUnread } from './nostr/readstate';
import { mentionedPubkeys } from './nostr/sanitize';
import { putProfile, setProfileRequester, clearProfiles } from './nostr/profileStore';
import { setRoofPing } from './world/buildings';
import { ThemeStore, resolveTheme, themesTemplate, type ThemeConfig } from './nostr/themes';
import { openThemeEditor } from './ui/themeEditor';
import { GameBook, createTable, joinTable, startTable, moveOnTable, resignTable, cancelTable, timeoutOnTable, claimableTimeout, gameMarker, type CRSizeKey } from './games/book';
import { GamePanel } from './ui/gamePanel';
import { AvatarStore, DEFAULT_AVATAR, avatarTemplate, type Avatar } from './nostr/avatars';
import { ActivityBeacon, ActivityStore, activityTemplate, type Activity } from './nostr/activity';
import { MotionBeacon, MotionStore, motionTemplate } from './nostr/motion';
import { openCreator } from './ui/creator';
import { CallRoom, RECONNECT_DELAYS, awayCountdown } from './voice/callRoom';
import { openControlsGuide, maybeShowControlsGuide, isTouch } from './ui/controlsGuide';
import { obeliskNoteUrl, obeliskProfileUrl } from './ui/obeliskLinks';
import { onPlaceChange, SETTLE_WALKING } from './ui/chatAuto';
import { SidePanel } from './ui/sidePanel';
import { DmPanel } from './ui/dmPanel';
import { DmStore } from './nostr/dm';
import { PrivateCall } from './voice/privateCall';
import { MembersStore } from './nostr/members';
import { relayIdentity } from './nostr/branding';
import { PresenceTracker, type Presence } from './nostr/presence';
import { SPANS, binCounts, dragRange, peakLabel, spanSeconds, timeToX, topPeaks, type SpanId } from './ui/history';
import { PrefsStore, type Prefs } from './prefs';
import { openSettings } from './ui/settings';
import { openRelayModal } from './ui/relayModal';
import { LoadingScreen } from './ui/loading';
import { installVoiceBridge } from './shims/bridge';
import { hashStr, ISLAND_R } from './world/layout';
import { readBoard } from '@/utils/games/chain-reaction/board-view';
import { activeRelay, DEFAULT_GROUP_RELAY, normalizeRelay, setActiveRelay, SUGGESTED_RELAYS } from './nostr/hub';
import { pageHub } from './nostr/hub';
import { SessionManager, type LoginArgs, type Session } from './nostr/session';
import { registerHost } from './shims/host';
import { Soundscape } from './sound';
import { ALL_MODELS, preload } from './world/assets';
import { defaultLook, preloadPeople } from './people/people';
import type { LandmarkId } from './world/landmarks';
import { NOSTR_WOT_PUBKEY, NOSTR_WOT_SITE } from './world/landmarks/nostrwot';
import { DEFAULT_SOCIAL_RELAYS } from '@/constants/social/relays';
import { pubkeyColor } from './world/character';
import { Director } from './world/director';
import { Player, findEpisodes, type Ev, type PlayerStatus } from './world/player';
import { World, type StationKind } from './world/world';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const nowSec = () => Math.floor(Date.now() / 1000);
/** History mode: the panel under the village, and how far back it shows. */
let historyOn = false;
let historySpan: SpanId = '7d';
const OBELISK_APP = 'https://obelisk.ar/app';

const world = new World($('scene'), $('overlay'));
const director = new Director();
const sound = new Soundscape();
let relayHost = 'public.obelisk.ar';
let groups: WireGroup[] = [];
let ready = false;
let pending: ServerMsg[] = [];

const player = new Player(director, renderStatus, () => {
  // A seek rebuilds the village: flash a soft white wipe so the teleport reads as a cut.
  const w = $('wipe');
  w.classList.add('on');
  requestAnimationFrame(() => requestAnimationFrame(() => w.classList.remove('on')));
  world.overlay.clearBubbles();
});

// ── local preferences ────────────────────────────────────────────────────

const prefs = new PrefsStore();
const timeParam = new URLSearchParams(location.search).get('time');

function applyPrefs(p: Prefs): void {
  world.applyPrefs(timeParam && ['day', 'sunset', 'night'].includes(timeParam) ? { ...p, timeOfDay: timeParam as Prefs['timeOfDay'] } : p);
  document.documentElement.style.setProperty('--chat-alpha', String(p.chatOpacity));
  $('feed').hidden = !p.feed;
  sound.setVolume(p.volume);
  if (soundUnlocked) sound.setEnabled(p.sound);
  const btn = (act: string) => document.querySelector<HTMLButtonElement>(`.controls [data-act="${act}"]`);
  btn('director')?.classList.toggle('on', p.autoDirector);
  btn('signs')?.classList.toggle('on', p.signs);
  btn('tilt')?.classList.toggle('on', p.tiltShift);
  const time = btn('time');
  if (time) { time.classList.toggle('on', p.timeOfDay !== 'auto'); time.title = `Time of day: ${p.timeOfDay === 'auto' ? 'Buenos Aires time' : p.timeOfDay}`; }
  const snd = btn('sound');
  if (snd) {
    snd.classList.toggle('on', p.sound);
    (snd.querySelector('.mute') as SVGElement | null)?.style.setProperty('display', p.sound ? 'none' : '');
    (snd.querySelector('.wave') as SVGElement | null)?.style.setProperty('display', p.sound ? '' : 'none');
  }
}

// Browsers only start audio after a gesture: remembered "sound on" waits for one.
let soundUnlocked = false;
window.addEventListener('pointerdown', () => {
  if (soundUnlocked) return;
  soundUnlocked = true;
  sound.setEnabled(prefs.get().sound);
}, { once: true });

prefs.onChange(applyPrefs);

// ── relays (one village per relay) ───────────────────────────────────────

const urlRelay = normalizeRelay(new URLSearchParams(location.search).get('relay') ?? '');
setActiveRelay(urlRelay ?? (prefs.get().relay || DEFAULT_GROUP_RELAY));

function knownRelays(): string[] {
  return [...new Set([...SUGGESTED_RELAYS, ...prefs.get().customRelays, activeRelay()])];
}

/** The relay switcher shows the relay as it presents itself: its operator's
 *  branding or NIP-11 name and icon (nostr/branding.ts); the domain until then. */
let relayShown = '';
function renderRelayName(): void {
  const relay = activeRelay();
  const host = relay.replace(/^wss?:\/\//, '').replace(/\/$/, '');
  const btn = $('relay-btn');
  btn.title = `Switch relay · ${host}`;
  if (relayShown === relay) return;
  relayShown = relay;
  ($('relay-name') as HTMLElement).textContent = host;
  btn.querySelector('.relay-ico img')?.remove();
  btn.classList.remove('has-icon');
  // Deferred: this first runs during start-up, before the hub exists.
  setTimeout(() => void relayIdentity(hub, relay).then((id) => {
    if (relayShown !== relay) return;
    if (id.name) ($('relay-name') as HTMLElement).textContent = id.name;
    // The first icon that actually loads (a dead branding link falls back).
    const tryIcon = (i: number): void => {
      if (i >= id.icons.length || relayShown !== relay) return;
      const img = document.createElement('img');
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.onload = () => {
        if (relayShown !== relay) return;
        btn.querySelector('.relay-ico img')?.remove();
        btn.querySelector('.relay-ico')?.prepend(img);
        btn.classList.add('has-icon');
      };
      img.onerror = () => tryIcon(i + 1);
      img.src = id.icons[i];
    };
    tryIcon(0);
  }), 0);
}

/** Go to another relay's village: new subscriptions, AUTH only there. */
function switchRelay(url: string): void {
  if (url === activeRelay()) return;
  void call.leave();
  setActiveRelay(url);
  prefs.set({ relay: url });
  renderRelayName();
  session.setRelay();
  const u = new URL(location.href);
  u.searchParams.set('relay', url.replace(/^wss:\/\//, ''));
  history.replaceState(null, '', u);
  if (session.current) { startReadState(); startFeed(); }
  toast(`Now in ${url.replace(/^wss?:\/\//, '')}`);
}

$('relay-btn').addEventListener('click', () => openRelayModal($('app'), {
  active: activeRelay,
  relays: knownRelays,
  custom: () => prefs.get().customRelays,
  addRelay: (url) => prefs.set({ customRelays: [...prefs.get().customRelays, url] }),
  removeRelay: (url) => prefs.set({ customRelays: prefs.get().customRelays.filter((r) => r !== url) }),
  switchTo: switchRelay,
  groups: () => [...groups].sort((a, b) => a.name.localeCompare(b.name)),
  categories: () => ({ names: themes?.categoryNames ?? {}, of: themes?.categoryOf ?? {} }),
  unread: (id) => (readState && session.current ? countUnread(msgsOf(id), readState.cursorFor(id), session.current.pubkey) : 0),
  goTo: (id) => {
    const slot = world.slotFor(id);
    if (controller && slot) { controller.walkTo(slot.yard); world.cam.played(); }
    else showGroup(id);
  },
}));

// The village opens LIVE and stays live: replays only play when asked for
// (the replay button, or a click on the timeline).
player.autoStory = false;

world.hooks = {
  onSay: (pk, groupId, text, to, instant) => {
    if (instant) return;
    addFeed(pk, groupId, text, to);
    sound.blip(pk);
  },
  onPersonClick: (pk) => showPerson(pk),
  onGroupClick: (id) => {
    const slot = world.slotFor(id);
    if (controller && slot) { controller.walkTo(slot.yard); world.cam.played(); return; }
    showGroup(id);
  },
  onZap: () => sound.coin(),
  onArrive: () => sound.whoosh(),
};

// Handy for poking at the scene from the console.
(window as unknown as { __sky: unknown }).__sky = {
  world: () => world, player: () => player, director: () => director, session: () => session, chat: () => chat, groups: () => groups, controller: () => controller, activity: () => activity, motion: () => motion,
  dm: () => ({ open: openDm, panel: dmPanel, store: dms, call: pcall }),
  /** What the last frame cost: draw calls, triangles, lights in the scene, the quality level, recent fps. */
  perf: async () => {
    // Count one whole frame (every pass of the post chain), not just the last draw.
    const info = world.renderer.info;
    info.autoReset = false;
    info.reset();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const out = { calls: info.render.calls, triangles: info.render.triangles };
    info.autoReset = true;
    let lights = 0, lightsOn = 0;
    world.scene.traverse((o) => { if ((o as THREE.Light).isLight && !(o as THREE.Light & { isAmbientLight?: boolean }).isAmbientLight) { lights++; if (o.visible) lightsOn++; } });
    const avg = frameTimes.length ? frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length : 0;
    return { ...out, programs: info.programs?.length ?? 0, lights, lightsOn, level: world.post.level, fps: avg ? Math.round(1 / avg) : 0 };
  },
};
if (import.meta.env.DEV) {
  // Dev server only (never in a production build): log in with a hex key
  // so headless checks can exercise the signed-in path.
  (window as unknown as { __skyDevLogin: unknown }).__skyDevLogin = async (skHex: string) => {
    const { PrivateKeySigner } = await import('@nostr-wot/signers');
    const signer = new PrivateKeySigner(skHex);
    await session.login({ signer, pubkey: await signer.getPublicKey(), method: 'import' });
  };
}

// ── boot ─────────────────────────────────────────────────────────────────

void (async () => {
  // The island from straight above: a map from the plan at once, then the
  // real ground (no models needed) behind the same view while the town and
  // nature kits load, then the people (bodies, outfits, hair, animations).
  const loading = new LoadingScreen($('loading'), world.plan);
  renderRelayName();
  applyPrefs(prefs.get());
  world.post.holdLevel(true);
  world.buildGround();
  world.cam.holdTopDown(ISLAND_R);
  // The preview renders until the frame loop takes over (it keeps going
  // through the warm-up below, so the island never freezes behind the bar).
  let looping = false;
  const preview = (): void => {
    if (looping) return;
    world.frame();
    requestAnimationFrame(preview);
  };
  requestAnimationFrame(() => { preview(); loading.showWorld(); });
  await preload(ALL_MODELS, (d, t) => loading.setProgress((d / t) * 0.7));
  world.setGroups([], new Map()); // the empty island, before any relay data
  applyPrefs(prefs.get()); // again: grass needs the island built
  await preloadPeople((d, t) => loading.setProgress(0.7 + (d / t) * 0.3));
  ready = true;
  // Everything that arrived while loading (houses, people) is built and its
  // shaders compiled while the loading screen still covers it: otherwise the
  // first frames of the swing stall and it jumps.
  for (const m of pending) handle(m);
  pending = [];
  await world.renderer.compileAsync(world.scene, world.camera).catch(() => {});
  looping = true;
  requestAnimationFrame(loop);
  $('app').classList.remove('booting');
  await loading.done();
  world.cam.playIntro();
})();

// ── session + feed ───────────────────────────────────────────────────────
// No server keys: the browser reads the relay as the signed-in user, through
// the same RelayHub obelisk-dex uses. Logged out, the island stays empty.

const hub = pageHub();
const session = new SessionManager(hub);
let feed: Feed | null = null;

// ── districts (sky-only theme config, operator-authored) ─────────────────

let themes: ThemeStore | null = null;

function applyDistricts(): void {
  if (!themes) return;
  const map = new Map(groups.map((g) => [g.id, resolveTheme(g, themes!.config, themes!.categoryOf)] as const));
  world.setDistricts(map);
  const btn = document.querySelector<HTMLButtonElement>('.controls [data-act="districts"]');
  if (btn) btn.hidden = !session.current || session.current.pubkey !== themes.operator;
}

async function saveThemes(cfg: ThemeConfig): Promise<string | null> {
  const out = await publishToGroup(hub, (t) => session.sign(t), themesTemplate(activeRelay(), cfg, themes?.config.updatedAt ?? 0));
  return out.ok ? null : out.reason;
}

function startFeed(): void {
  feed?.stop();
  themes?.stop();
  themes = new ThemeStore(hub, activeRelay());
  themes.onChange(applyDistricts);
  void themes.start();
  resetVillage();
  avatars = new AvatarStore(hub);
  avatars.onChange((pk, a) => world.setAvatar(pk, a));
  // Your look and pet follow you: the cached copy shows at once, and a relay
  // that doesn't have it (or has an older one) gets the same signed event.
  const me = session.current?.pubkey;
  if (me) {
    void avatars.syncOwn(me, async (ev) => (await publishSigned(hub, ev as VerifiedEvent)).ok)
      .then((r) => { if (r === 'republished') console.info('[sky] look copied to', activeRelay()); });
  }
  startActivity();
  book = new GameBook();
  book.onChange((id) => { gamePanel.refresh(id); scheduleTables(); });
  feed = new Feed(hub, {
    onMsg: (m) => (ready ? handle(m) : pending.push(m)),
    onAccess: (a, reason) => renderAccess(a, reason),
    onGame: (ev) => book.ingest(ev),
  });
  feed.start();
  const f = feed;
  clearProfiles();
  setProfileRequester((pk) => f.state.watch(pk));
  // Your own picture and name, from the profile relays, even before you post.
  if (session.current) f.state.watch(session.current.pubkey);
}

function resetVillage(): void {
  pending = [];
  groups = [];
  player.events = [];
  player.seek(nowSec(), false);
  if (ready) world.clearGroups();
}

let readState: ReadState | null = null;

/** Read cursors live on the group relay (per relay, as in the app). */
function startReadState(): void {
  readState?.stop();
  readState = null;
  const s = session.current;
  if (!s) return;
  const sg = s.signer;
  readState = new ReadState(hub, {
    pubkey: s.pubkey,
    sign: (t) => session.sign(t),
    // Without NIP-44 on the signer, cursors stay on this device only.
    encrypt: (pt) => (sg.nip44Encrypt ? sg.nip44Encrypt(s.pubkey, pt) : Promise.reject(new Error('no nip44'))),
    decrypt: (ct) => (sg.nip44Decrypt ? sg.nip44Decrypt(s.pubkey, ct) : Promise.reject(new Error('no nip44'))),
  });
  readState.onChange(() => { signTimer = 0; renderBell(); });
  readState.start();
}

session.onChange((s) => {
  renderAccount(s);
  // Logged in, the relay's own branding can be read: look again.
  relayShown = '';
  renderRelayName();
  startReadState();
  renderBell();
  if (world.cam.firstPerson) toggleFirstPerson();
  world.setPlayer(null);
  controller = null;
  chat.close();
  void call.leave();
  if (s) startFeed();
  startDms();
  if (!s) pcall.hangup();
  if (!s) { dmPanel.close(); }
  if (!s) { feed?.stop(); feed = null; activity.stop(); motion.stop(); world.syncClaims([]); resetVillage(); renderAccess('logged-out'); }
});

void session.restore().then((ok) => { if (!ok) { renderAccount(null); renderAccess('logged-out'); } });

// The re-hosted obelisk-dex login modal reaches sky through this host.
registerHost({
  login: (args) => session.login(args as LoginArgs),
  sign: (t) => session.sign(t),
  pubkey: () => session.current?.pubkey ?? null,
});

$('login').addEventListener('click', async () => {
  const { openLogin } = await import('./login/LoginMount');
  openLogin();
});
$('logout').addEventListener('click', () => session.logout());
$('gate-login').addEventListener('click', () => $('login').click());

function renderAccount(s: Session | null): void {
  $('login').hidden = !!s;
  $('account').hidden = !s;
  (document.querySelector('.controls [data-act="logout"]') as HTMLElement).hidden = !s;
  if (!s) return;
  const prof = world.profiles.get(s.pubkey);
  ($('account-name') as HTMLElement).textContent = prof?.name ?? shortKey(s.pubkey);
  ($('account-nip') as HTMLElement).textContent = prof?.nip05?.replace(/^_@/, '') ?? '';
  // Your picture, else your initial on your colour.
  const av = $('account-avatar');
  const src = prof?.avatar ?? null;
  if (av.dataset.src !== (src ?? '')) {
    av.dataset.src = src ?? '';
    av.replaceChildren();
    if (src) {
      const img = document.createElement('img');
      img.src = src;
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      av.append(img);
      av.style.background = '';
    } else {
      av.textContent = ([...(prof?.name ?? '?')][0] ?? '?').toUpperCase();
      av.style.background = pubkeyColor(s.pubkey);
    }
  }
}

/** Keys are never labels: a short npub, as obelisk-dex's shortNpubLabel. */
function shortKey(pk: string): string {
  const npub = hexToNpub(pk);
  return `${npub.slice(0, 9)}…${npub.slice(-4)}`;
}

function renderAccess(a: FeedAccess | 'logged-out', reason?: string): void {
  $('relay-btn').dataset.state = a;
  const gate = $('gate');
  gate.dataset.state = a;
  gate.hidden = a === 'open' || a === 'connecting';
  const text = gate.querySelector('.gate-text') as HTMLElement;
  if (a === 'logged-out') {
    text.textContent = 'Log in with your Nostr key to see who lives here and join the conversations.';
    setStatus('connecting', 'Logged out');
  } else if (a === 'refused') {
    text.textContent = 'public.obelisk.ar is invite-only and has not admitted this key yet. Ask in Obelisk to be let in.';
    setStatus('connecting', 'Not admitted');
    if (reason) console.info('[sky] relay refused:', reason);
  } else if (a === 'offline') {
    setStatus('connecting', 'Reconnecting…');
    gate.hidden = true;
  }
  ($('gate-login') as HTMLElement).hidden = a !== 'logged-out';
}

function handle(m: ServerMsg): void {
  switch (m.t) {
    case 'snapshot': {
      relayHost = m.relay.replace(/^wss?:\/\//, '').replace(/\/$/, '');
      for (const p of m.profiles) { world.setProfile(p); putProfile(p); }
      renderAccount(session.current);
      groups = m.groups;
      const events: Ev[] = [
        ...m.messages.map((x): Ev => ({ k: 'msg', at: x.createdAt, m: x })),
        ...m.reactions.map((x): Ev => ({ k: 'react', at: x.createdAt, r: x })),
        ...m.zaps.map((x): Ev => ({ k: 'zap', at: x.createdAt, z: x })),
      ];
      applyDistricts();
      world.setGroups(groups, activityOf(events));
      player.load(events, nowSec());
      drawTimeline();
      enterAsPlayer();
      placeOfficial();
      if (session.current) maybeShowControlsGuide($('app'));
      maybeWelcome();
      break;
    }
    case 'profile':
      world.setProfile(m.profile);
      putProfile(m.profile);
      scheduleChatRefresh();
      if (m.profile.pubkey === session.current?.pubkey) renderAccount(session.current);
      break;
    case 'group': {
      groups = [...groups.filter((g) => g.id !== m.group.id), m.group];
      world.setGroups(groups, activityOf(player.events));
      break;
    }
    case 'group-removed': {
      groups = groups.filter((g) => g.id !== m.id);
      // Forget everything from that channel, then rebuild the present.
      player.events = player.events.filter((e) => groupOfEv(e) !== m.id);
      world.setGroups(groups, activityOf(player.events));
      player.seek(nowSec(), true);
      if (historyOn) drawTimeline(); else player.goLive(nowSec());
      break;
    }
    case 'msg': {
      notePost(m.msg.pubkey, m.msg.createdAt * 1000);
      const me = session.current?.pubkey;
      const why = me ? pingReason(m.msg, me) : null;
      if (why && nowSec() - m.msg.createdAt < 120) {
        const msg = m.msg;
        toast(`${world.nameOf(msg.pubkey)} ${why === 'reply' ? 'replied to you' : 'mentioned you'}`, () => goToMessage(msg));
      }
      renderBell();
    }
      player.push({ k: 'msg', at: m.msg.createdAt, m: m.msg }, nowSec());
      chat.refresh(m.msg.groupId);
      drawTimeline();
      break;
    case 'reaction':
      player.push({ k: 'react', at: m.reaction.createdAt, r: m.reaction }, nowSec());
      chat.refresh(m.reaction.groupId);
      break;
    case 'msg-removed':
      player.events = player.events.filter((e) => !(e.k === 'msg' && e.m.id === m.id));
      chat.refresh(m.groupId);
      break;
    case 'reaction-removed':
      player.events = player.events.filter((e) => !(e.k === 'react' && e.r.id === m.id));
      chat.refresh();
      break;
    case 'zap': player.push({ k: 'zap', at: m.zap.createdAt, z: m.zap }, nowSec()); break;
  }
}

let chatRefreshTimer: ReturnType<typeof setTimeout> | null = null;
/** Names arrive in bursts: repaint the open channel at most twice a second. */
function scheduleChatRefresh(): void {
  if (chatRefreshTimer) return;
  chatRefreshTimer = setTimeout(() => { chatRefreshTimer = null; chat.refresh(); }, 500);
}

function groupOfEv(e: Ev): string {
  return e.k === 'msg' ? e.m.groupId : e.k === 'react' ? e.r.groupId : e.z.groupId;
}

function activityOf(events: Ev[]): Map<string, number> {
  const a = new Map<string, number>();
  for (const e of events) if (e.k === 'msg') a.set(e.m.groupId, (a.get(e.m.groupId) ?? 0) + 1);
  return a;
}

// ── you ──────────────────────────────────────────────────────────────────
// Your own character: WASD / arrows (Shift runs), click the ground to walk,
// a thumb stick on touch screens. Standing in a building's yard puts you in
// that channel: its chat opens and what you type is posted there.

const input = new InputState();
mountJoystick($('app'), input);
let controller: PlayerController | null = null;
let place: string | null = null;
let candidate: string | null = null;
let candidateFor = 0;

function enterAsPlayer(): void {
  const s = session.current;
  if (!s) return;
  world.setPlayer(s.pubkey);
  controller = new PlayerController(() => world.navGrid(), world.playerSpawnPoint(), () => world.solids, (p) => world.insideWalkable(p), (p) => world.groundAt(p));
  world.cam.followPlayer(world.personAnchor(s.pubkey));
}

function stepPlayer(dt: number): void {
  const pk = world.playerPk;
  const c = pk ? world.people.get(pk) : undefined;
  if (!controller || !c) return;
  // In first person, step out to watch yourself train or sit (running laps stays in your eyes).
  world.setSelfView((world.isTraining(pk!) && world.laneOf(pk!) === null) || world.isSeated(pk!));
  const mv = input.read();
  // Walking off gets you up from your seat.
  if (world.isSeated(pk!) && (Math.hypot(mv.x, mv.y) > 0.05 || controller.path.length || mv.jump)) {
    const path = controller.path;
    standPlayer();
    controller.path = path;
  }
  // Steering by keys: the walk-to pin goes.
  if (Math.hypot(mv.x, mv.y) > 0.05) world.clearWalkTarget();
  // Running laps: round your lane at a run until you steer or jump off it.
  const lane = world.laneOf(pk!);
  let mvNow = mv;
  if (lane !== null) {
    if (Math.hypot(mv.x, mv.y) > 0.05 || mv.jump) { world.stopTraining(pk!); controller.path = []; }
    else {
      if (!controller.path.length) controller.path = world.lanePath(lane, controller.pos);
      mvNow = { ...mv, run: true };
    }
  }
  // Walking off ends a set (and steps you off the equipment).
  else if (world.isTraining(pk!)) {
    if (Math.hypot(mv.x, mv.y) > 0.05 || controller.path.length || mv.jump) { world.stopTraining(pk!); controller.pos = { ...c.pos }; }
    else { world.cam.played(); return; }
  }
  if (world.isSeated(pk!)) { world.cam.played(); return; }
  const before = { ...controller.pos };
  const vyBefore = controller.vy;
  controller.step(dt, mvNow, world.cameraYaw());
  // Took off this frame: tell the others (nostr/motion.ts `j`).
  if (controller.vy > 0 && vyBefore <= 0) pendingJump = performance.now();
  c.drive(controller.pos.x, controller.pos.z, controller.heading, controller.moving, controller.running, controller.height, controller.airborne);
  world.cam.setFeel({
    speed: dt > 0 ? Math.hypot(controller.pos.x - before.x, controller.pos.z - before.z) / dt : 0,
    running: controller.running && controller.moving,
    airborne: controller.airborne,
    landed: controller.landed,
    strafe: Math.max(-1, Math.min(1, mvNow.x)),
  });
  if (controller.moving && performance.now() - input.lastInput < 200) world.cam.played();
  if (controller.moving && pk) presence.activity(pk, Date.now());
  // Enter a channel when you stop in its yard or linger there; walking past
  // a yard doesn't count. What the chat does then is ui/chatAuto.ts.
  const here = placeAt(controller.pos, world.yards());
  if (here !== candidate) { candidate = here; candidateFor = 0; }
  else candidateFor += dt;
  const settled = !controller.moving || candidateFor > SETTLE_WALKING;
  if (settled && candidate !== place) {
    place = candidate;
    const act = onPlaceChange(place, { open: chat.groupId, openedBy: chat.openedBy }, prefs.get().chatOpen);
    chatHint = act.kind === 'hint' ? act.id : null;
    if (act.kind === 'open') { const g = groups.find((x) => x.id === act.id); if (g) chat.open(g, 'auto'); }
    else if (act.kind === 'close') chat.close();
    renderCall();
  }
}

/** The channel whose chat the "open chat" button offers (you're in its yard). */
let chatHint: string | null = null;
let chatHintShown = '';
function renderChatHint(): void {
  const el = $('chat-hint') as HTMLButtonElement;
  const g = chatHint && chatHint === place && chat.groupId !== chatHint ? groups.find((x) => x.id === chatHint) : null;
  const text = g ? (isTouch() ? `💬 Open the ${g.name} chat` : `💬 Press C to open the ${g.name} chat`) : '';
  if (text === chatHintShown) return;
  chatHintShown = text;
  el.hidden = !text;
  el.textContent = text;
}
function openHintedChat(): void {
  const g = chatHint ? groups.find((x) => x.id === chatHint) : null;
  if (g) chat.open(g, 'user');
  chatHint = null;
}
$('chat-hint').addEventListener('click', () => openHintedChat());

world.hooks.onBubbleClick = (msgId) => {
  const m = player.events.find((e): e is Extract<Ev, { k: 'msg' }> => e.k === 'msg' && e.m.id === msgId)?.m;
  if (!m || !session.current) return;
  const g = groups.find((x) => x.id === m.groupId);
  if (g) chat.open(g);
  chat.setReply(m);
  const slot = world.slotFor(m.groupId);
  if (controller && slot && place !== m.groupId) { controller.walkTo(slot.yard); world.cam.played(); }
};

// A tap on the world puts an open card away first (on a phone that's all a
// tap on the ground does then: the card covers half the screen, walking off
// is a surprise). A tap on someone or something opens theirs right after.
world.hooks.onTap = () => {
  if ($('card').hidden) return false;
  $('card').hidden = true;
  return isTouch();
};

world.hooks.onGroundClick = (p) => {
  if (!controller) return;
  // Walking somewhere else ends your laps.
  if (world.playerPk && world.laneOf(world.playerPk) !== null) world.stopTraining(world.playerPk);
  const ok = controller.walkTo(p);
  // A pin where you're going (red if there's no way there).
  world.showWalkTarget(ok ? controller.path[controller.path.length - 1] ?? p : p, ok);
  world.cam.played();
};

function toggleFirstPerson(): void {
  const on = !world.cam.firstPerson;
  world.setFirstPerson(on);
  world.camera.fov = on ? world.fpFov : (innerWidth < innerHeight ? 46 : 32);
  world.camera.updateProjectionMatrix();
  document.querySelector('.controls [data-act="firstperson"]')?.classList.toggle('on', world.cam.firstPerson);
  if (on) toast(isTouch() ? 'First person: drag to look, the stick to walk. Tap the eye to leave.' : 'First person: click to look with the mouse, WASD to walk, V or Esc to leave.');
}

const EX_LABEL: Record<StationKind, string> = {
  pullup: 'pull-ups', muscleup: 'muscle-ups', dip: 'dips', pushup: 'push-ups',
  benchpress: 'bench press', squat: 'squats', curl: 'curls', run: 'laps',
};

/** At the park: start (or stop) a set. `pick` chooses among the station's exercises. */
function toggleTraining(pick = 0): boolean {
  const pk = world.playerPk;
  if (!controller || !pk) return false;
  const now = world.training(pk);
  // Off a lane: just stop running.
  if (now?.kind === 'run') { world.stopTraining(pk); controller.path = []; return true; }
  const st = world.nearestStation(controller.pos, 1.9) ?? world.nearestLane(controller.pos);
  if (now && (!st || pick === 0 || st.kinds[pick] === now.kind)) { world.stopTraining(pk); controller.pos = { ...world.people.get(pk)!.pos }; return true; }
  if (!st || !st.kinds[pick]) return false;
  if (st.lane !== undefined) {
    // Into the lane: the laps start from where you are.
    if (world.train(pk, st, 'run')) controller.path = world.lanePath(st.lane, controller.pos);
    return true;
  }
  if (world.train(pk, st, st.kinds[pick])) { controller.pos = { ...st.pos }; controller.path = []; }
  return true;
}

/** Get up and step clear of the chair (and out of any terrace or quincho). */
function standPlayer(): void {
  const pk = world.playerPk;
  if (!controller || !pk || !world.isSeated(pk)) return;
  const face = world.people.get(pk)?.body.rotation.y ?? 0;
  world.stand(pk);
  const out = world.exitSpot(controller.pos, face);
  controller.pos = { ...out };
  controller.height = world.groundAt(out);
  controller.vy = 0;
  world.people.get(pk)?.place(out);
}

function toggleSeat(): void {
  if (!controller || !world.playerPk) return;
  if (toggleTraining()) return;
  if (world.isSeated(world.playerPk)) { standPlayer(); return; }
  const seat = world.nearestFreeSeat(controller.pos, 1.8);
  if (seat) { world.sit(world.playerPk, seat); controller.pos = { ...seat.pos }; controller.path = []; controller.height = world.groundAt(seat.pos); controller.vy = 0; }
  else toast('No free seat nearby. Benches are around the plaza, by the pond and at the campfire.');
}

/** "Press E to sit" (or a Sit / Stand up button on touch) near a free seat. */
function renderSeatHint(): void {
  // Written only when it changes (this runs every frame).
  const real = $('seat-hint') as HTMLButtonElement;
  const hint = { hidden: real.hidden, textContent: real.textContent ?? '' };
  seatHintCompute(hint);
  if (real.hidden !== hint.hidden) real.hidden = hint.hidden;
  if (!hint.hidden && real.textContent !== hint.textContent) real.textContent = hint.textContent;
}
function seatHintCompute(hint: { hidden: boolean; textContent: string }): void {
  const pk = world.playerPk;
  if (!controller || !pk) { hint.hidden = true; return; }
  const touch = isTouch();
  const t = world.training(pk);
  if (t) {
    hint.hidden = false;
    hint.textContent = t.kind === 'run'
      ? `Running laps · ${t.reps} lap${t.reps === 1 ? '' : 's'} · ${touch ? 'tap or steer to stop' : 'E or steer to stop'}`
      : `${EX_LABEL[t.kind][0].toUpperCase()}${EX_LABEL[t.kind].slice(1)} · ${t.reps} rep${t.reps === 1 ? '' : 's'} · ${touch ? 'tap to stop' : 'E to stop'}`;
    return;
  }
  const lane = world.nearestStation(controller.pos, 1.9) ? null : world.nearestLane(controller.pos);
  if (lane) {
    hint.hidden = false;
    const name = ['inside', 'middle', 'outside'][lane.lane!] ?? String(lane.lane! + 1);
    hint.textContent = touch ? `Run laps (${name} lane)` : `Press E to run laps in the ${name} lane`;
    return;
  }
  const st = world.nearestStation(controller.pos, 1.9);
  if (st) {
    hint.hidden = false;
    hint.textContent = touch
      ? `Do ${EX_LABEL[st.kinds[0]]}`
      : st.kinds.map((k, i) => `${i === 0 ? 'E' : String(i + 1)}: ${EX_LABEL[k]}`).join(' · ');
    return;
  }
  const seated = world.isSeated(pk);
  const seat = seated ? null : world.nearestFreeSeat(controller.pos, 1.8);
  if (!seated && !seat) {
    // Someone online is using it.
    const who = world.claimedNear(controller.pos, 1.8);
    hint.hidden = !who;
    if (who) hint.textContent = `${world.nameOf(who)} is using this spot`;
    return;
  }
  hint.hidden = false;
  if (seat?.prop && seat.prop !== 'mate') {
    const what = seat.prop === 'coffee' ? 'work with a coffee' : seat.prop === 'asado' ? 'eat asado' : seat.prop === 'marshmallow' ? 'roast marshmallows by the fire' : 'join the table';
    hint.textContent = touch ? `Sit and ${what}` : `Press E to sit and ${what}`;
    return;
  }
  hint.textContent = seated ? (touch ? 'Stand up' : 'Press E to stand up') : (touch ? 'Sit and drink mate' : 'Press E to sit and drink mate');
}

$('seat-hint').addEventListener('click', () => { toggleSeat(); renderSeatHint(); });

window.addEventListener('keydown', (e) => {
  if (isTyping(e.target)) return;
  if (e.key === 'Enter' && chat.groupId) { e.preventDefault(); chat.focusComposer(); }
  // E: sit down for a mate on the nearest bench or stool (or stand up).
  if (e.key.toLowerCase() === 'e' && controller && world.playerPk) toggleSeat();
  // 2, 3: the station's other exercises (at the pull-up bar, 2 is muscle-ups).
  if ((e.key === '2' || e.key === '3') && controller && world.playerPk) toggleTraining(Number(e.key) - 1);
  if (e.key === '?' || (e.key === '/' && e.shiftKey)) openControlsGuide($('app'));
  if (e.key.toLowerCase() === 'v' && world.playerPk) toggleFirstPerson();
  if (e.key.toLowerCase() === 'c' && chatHint) openHintedChat();
  if (e.key.toLowerCase() === 'm' && nearPk) { e.preventDefault(); openDm(nearPk); }
  // Esc releases the mouse first (the browser does that); a second Esc leaves first person.
  if (e.key === 'Escape' && world.cam.firstPerson && !document.pointerLockElement) toggleFirstPerson();
});

// ── presence, channels and members (the left drawer) ─────────────────────

/** Online (live and active, or posting lately), AFK (live but idle), offline. */
const presence = new PresenceTracker();
/** When each pubkey last posted (ms): obelisk-dex counts 15 minutes as online. */
const lastPost = new Map<string, number>();
let liveClaimers = new Set<string>();
const POSTED_ONLINE_MS = 15 * 60_000;
function notePost(pk: string, at: number): void {
  if (at > (lastPost.get(pk) ?? 0)) lastPost.set(pk, at);
  presence.activity(pk, Math.min(Date.now(), at));
}
function presenceOf(pk: string): Presence {
  const now = Date.now();
  const posted = now - (lastPost.get(pk) ?? 0) < POSTED_ONLINE_MS;
  const live = pk === session.current?.pubkey || !!motion.get(pk) || liveClaimers.has(pk);
  if (!live) return posted ? 'online' : 'offline';
  const p = presence.of(pk, true, now);
  return p === 'afk' && posted ? 'online' : p;
}

const members = new MembersStore(hub, () => themes?.operator ?? null);
const side = new SidePanel($('app'), {
  channels: () => groups.map((g) => {
    const me = session.current?.pubkey ?? null;
    const msgs = msgsOf(g.id);
    const cursor = readState?.cursorFor(g.id) ?? 0;
    const here = [...world.people.values()].filter((c) => { const s = world.slotFor(g.id); return s && Math.hypot(c.pos.x - s.yard.x, c.pos.z - s.yard.z) < 2.6; }).length;
    return {
      id: g.id, name: g.name, kind: g.kind, here,
      unread: me && readState ? countUnread(msgs, cursor, me) : 0,
      mention: pinged.has(g.id),
    };
  }),
  defaultChannel: () => place ?? chat.groupId ?? groups[0]?.id ?? null,
  loadMembers: (id) => members.load(id),
  posters: (id) => [...new Set(msgsOf(id).map((m) => m.pubkey))],
  loadRanks: () => members.loadRoles(),
  presenceOf,
  profile: (pk) => { const p = world.profiles.get(pk); return { name: p?.name ?? world.nameOf(pk), avatar: p?.avatar ?? null, nip05: p?.nip05 ?? null }; },
  colorOf: (pk) => pubkeyColor(pk),
  me: () => session.current?.pubkey ?? null,
  // Show its house and open its chat right here: no need to walk over.
  onChannel: (id) => openChannel(id),
  onMember: (pk) => showPerson(pk),
});
const renderTabs = (): void => {
  $('tab-channels').classList.toggle('on', side.tab === 'channels');
  $('tab-members').classList.toggle('on', side.tab === 'members');
};
$('tab-channels').addEventListener('click', () => { side.toggle('channels'); renderTabs(); });
$('tab-members').addEventListener('click', () => { side.toggle('members'); renderTabs(); });
side.el.querySelector('.chat-min')?.addEventListener('click', renderTabs);

/** Open a channel from a list: the camera goes to its house and its chat
 *  opens on the right, fully usable, wherever your character is. */
function openChannel(id: string): void {
  const g = groups.find((x) => x.id === id);
  if (!g) return;
  if (dmPanel.isOpen) dmPanel.close();
  chat.el.hidden = false;
  chat.open(g, 'user');
  chat.setMinimised(false);
  chatHint = null;
  $('card').hidden = true;
  world.cam.focus(world.groupAnchor(id), 9);
}

// ── private messages and calls (obelisk-dex's NIP-17 DMs and 1:1 calls) ──

let dms: DmStore | null = null;
const pcall = new PrivateCall(() => dms, () => session.current?.pubkey ?? null, async () => { await call.leave(); });
const dmPanel = new DmPanel($('app'), {
  me: () => session.current?.pubkey ?? null,
  thread: (peer) => dms?.thread(peer) ?? [],
  send: async (peer, text) => (dms ? dms.send(peer, text) : 'Log in to send private messages.'),
  profile: (pk) => { const p = world.profiles.get(pk); return { name: p?.name ?? world.nameOf(pk), avatar: p?.avatar ?? null, nip05: p?.nip05 ?? null }; },
  colorOf: (pk) => pubkeyColor(pk),
  call: (peer) => void pcall.start(peer),
  presence: (pk) => { const p = presenceOf(pk); return p === 'online' ? 'online' : p === 'afk' ? 'away (AFK)' : 'offline'; },
});
dmPanel.onClose = () => { if (!chat.groupId) document.body.classList.remove('chat-open'); else chat.el.hidden = false; };

/** Open a private conversation with `pk` (it takes the chat panel's place). */
function openDm(pk: string): void {
  if (!session.current || pk === session.current.pubkey) return;
  if (chat.groupId) chat.el.hidden = true;
  dmPanel.open(pk);
}

function startDms(): void {
  dms?.stop();
  dms = null;
  const s = session.current;
  if (!s) return;
  const store = new DmStore(hub, s.pubkey, s.signer);
  dms = store;
  store.onMessage((peer, m, fresh) => {
    dmPanel.refresh(peer);
    if (fresh && m.from !== s.pubkey && dmPanel.peer !== peer) {
      toast(`💬 ${world.nameOf(peer)}: ${m.text.slice(0, 80)}`, () => openDm(peer));
    }
  });
  store.onCall((m) => pcall.handle(m));
  void store.start();
}

/** The private call bar: ringing, connecting, the call's timer, its end. */
function renderPCall(): void {
  const st = pcall.state;
  const bar = $('pcall');
  bar.hidden = st.status === 'idle';
  bar.dataset.status = st.status;
  if (bar.hidden) return;
  const name = st.peer ? world.nameOf(st.peer) : '';
  $('pcall-title').textContent = st.status === 'incoming' ? `📞 ${name} is calling` : `📞 ${name}`;
  const secs = st.connectedAt ? Math.floor((Date.now() - st.connectedAt) / 1000) : 0;
  const END: Record<string, string> = {
    'local-hangup': 'Call ended', 'remote-hangup': 'They hung up', declined: 'Declined', busy: 'Busy on another call',
    'no-answer': 'No answer', missed: 'Missed call', cancelled: 'Cancelled', 'answered-elsewhere': 'Answered on another device',
    'connect-failed': "Couldn't connect", 'connection-lost': 'Connection lost', error: st.error ?? 'Call failed',
  };
  $('pcall-sub').textContent = st.status === 'outgoing' ? 'Ringing…'
    : st.status === 'incoming' ? 'Private voice call'
    : st.status === 'connecting' ? 'Connecting…'
    : st.status === 'reconnecting' ? 'Reconnecting…'
    : st.status === 'active' ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}${st.micOn ? '' : ' · muted'}`
    : END[st.endReason ?? 'error'] ?? 'Call ended';
  $('pcall-accept').hidden = st.status !== 'incoming';
  $('pcall-mic').hidden = !(st.status === 'active' || st.status === 'reconnecting' || st.status === 'connecting');
  $('pcall-mic').textContent = st.micOn ? 'Mute' : 'Unmute';
  $('pcall-end').hidden = st.status === 'ended';
  $('pcall-end').textContent = st.status === 'incoming' ? 'Decline' : st.status === 'outgoing' ? 'Cancel' : 'Hang up';
}
pcall.onChange(renderPCall);
$('pcall-accept').addEventListener('click', () => void pcall.accept());
$('pcall-end').addEventListener('click', () => pcall.hangup());
$('pcall-mic').addEventListener('click', () => pcall.setMic(!pcall.state.micOn));
setInterval(() => { if (pcall.state.status === 'active') renderPCall(); }, 1000);

/** Someone connected right next to you: offer a private message or call. */
let nearPk: string | null = null;
function renderNearHint(): void {
  const el = $('near-hint');
  const me = world.playerPk;
  let best: string | null = null, bd = 2.2;
  if (me && controller && session.current) {
    for (const c of world.people.values()) {
      if (c.pk === me) continue;
      const d = Math.hypot(c.pos.x - controller.pos.x, c.pos.z - controller.pos.z);
      if (d >= bd) continue;
      // Connected: live in the village (moving or sitting), online or AFK.
      if (!motion.get(c.pk) && !liveClaimers.has(c.pk)) continue;
      if (presenceOf(c.pk) === 'offline') continue;
      bd = d;
      best = c.pk;
    }
  }
  if (best === nearPk) return;
  nearPk = best;
  el.hidden = !best;
  if (best) $('near-name').textContent = `${presenceOf(best) === 'afk' ? '💤 ' : '🟢 '}${world.nameOf(best)}`;
}
$('near-dm').addEventListener('click', () => { if (nearPk) openDm(nearPk); });
$('near-call').addEventListener('click', () => { if (nearPk) void pcall.start(nearPk); });

// ── the chat panel and publishing ────────────────────────────────────────

const msgsOf = (groupId: string) =>
  player.events.filter((e): e is Extract<Ev, { k: 'msg' }> => e.k === 'msg' && e.m.groupId === groupId).map((e) => e.m);
const reactionsOf = (msgId: string) =>
  player.events.filter((e): e is Extract<Ev, { k: 'react' }> => e.k === 'react' && e.r.targetId === msgId).map((e) => e.r);

async function publish(template: Parameters<typeof publishToGroup>[2]): Promise<string | null> {
  const out = await publishToGroup(hub, (t) => session.sign(t), template);
  if (!out.ok) return out.reason;
  // Show it now; the relay's echo is deduplicated by id.
  const st = feed?.state;
  if (st) {
    if (out.event.kind === 9) st.ingestMessage(out.event);
    else if (out.event.kind === 7) st.ingestReaction(out.event);
    else if (out.event.kind === 5) st.ingestDeletion(out.event);
  }
  return null;
}

const chat = new ChatPanel($('app'), {
  onProfile: (pk) => showPerson(pk),
  me: () => session.current?.pubkey ?? null,
  nameOf: (pk) => world.nameOf(pk),
  avatarOf: (pk) => world.profiles.get(pk)?.avatar ?? null,
  messages: msgsOf,
  reactions: reactionsOf,
  send: (g, text, reply) => publish(messageTemplate(g, text, reply ? { id: reply.id, pubkey: reply.pubkey } : null)),
  react: (m, emoji) => { void publish(reactionTemplate(m.groupId, { id: m.id, pubkey: m.pubkey }, emoji)); },
  unreact: (r: WireReaction) => { void publish(deletionTemplate(r.groupId, r.id, 7)); },
  remove: (m) => { void publish(deletionTemplate(m.groupId, m.id, 9)); },
  join: (g) => publish(joinTemplate(g)),
  onGame: (id) => openGame(id),
  newGame: (g) => { if (session.current) newGameDialog(g); },
  onReplyPick: (m) => {
    // Walk over to the person you're answering.
    const other = world.people.get(m.pubkey);
    if (controller && other && m.pubkey !== session.current?.pubkey) controller.walkTo(other.pos);
  },
});
// Closed with ×: the button offers it again while you're still in its yard.
chat.onClose = () => { if (place) chatHint = place; };


// ── mentions and replies ─────────────────────────────────────────────────
// A ping is an explicit @you or a reply to you (obelisk-dex classifyGroupPing);
// ordinary traffic never pings. Read once its channel has been open, or with
// "Mark all read" (which sets the synced mentionsReadAt).

function pingReason(m: WireMessage, me: string): 'reply' | 'mention' | null {
  if (m.pubkey === me) return null;
  if (m.replyTo === me) return 'reply';
  if (m.content && mentionedPubkeys(m.content).includes(me)) return 'mention';
  return null;
}

function openPings(): { m: WireMessage; reason: 'reply' | 'mention' }[] {
  const me = session.current?.pubkey;
  if (!me || !readState) return [];
  const since = readState.cursors.mentionsReadAt;
  const out: { m: WireMessage; reason: 'reply' | 'mention' }[] = [];
  for (const e of player.events) {
    if (e.k !== 'msg' || e.m.createdAt * 1000 <= since) continue;
    if (e.m.createdAt * 1000 <= readState.cursorFor(e.m.groupId)) continue;
    const r = pingReason(e.m, me);
    if (r) out.push({ m: e.m, reason: r });
  }
  return out.reverse();
}

function goToMessage(m: WireMessage): void {
  const g = groups.find((x) => x.id === m.groupId);
  if (g) chat.open(g);
  const slot = world.slotFor(m.groupId);
  if (controller && slot) { controller.walkTo(slot.yard); world.cam.played(); }
  const sender = world.people.get(m.pubkey);
  if (sender && controller) sender.faceToward(controller.pos);
  sender?.cheer(1.2);
}

function renderBell(): void {
  const bell = $('bell');
  bell.hidden = !session.current;
  const pings = openPings();
  const count = $('bell-count');
  count.hidden = !pings.length;
  count.textContent = pings.length > 9 ? '9+' : String(pings.length);
  const list = $('bell-list');
  list.replaceChildren();
  if (!pings.length) {
    const empty = document.createElement('div');
    empty.className = 'bell-empty';
    empty.textContent = 'Nothing new for you.';
    list.append(empty);
  }
  for (const { m, reason } of pings.slice(0, 30)) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'bell-item';
    const head = document.createElement('div');
    head.className = 'bell-item-head';
    const g = groups.find((x) => x.id === m.groupId);
    head.textContent = `${world.nameOf(m.pubkey)} ${reason === 'reply' ? 'replied to you' : 'mentioned you'} in ${g?.name ?? 'a channel'}`;
    const text = document.createElement('div');
    text.className = 'bell-item-text';
    text.textContent = m.text;
    row.append(head, text);
    row.addEventListener('click', () => { $('bell-panel').hidden = true; goToMessage(m); });
    list.append(row);
  }
}

$('bell').addEventListener('click', () => { renderBell(); $('bell-panel').hidden = !$('bell-panel').hidden; });
$('bell-read').addEventListener('click', () => { readState?.markMentionsRead(); $('bell-panel').hidden = true; });

function toast(text: string, onClick?: () => void): void {
  const t = document.createElement('button');
  t.type = 'button';
  t.className = 'toast';
  t.textContent = text;
  if (onClick) t.addEventListener('click', () => { onClick(); t.remove(); });
  $('toasts').append(t);
  setTimeout(() => t.classList.add('out'), 6000);
  setTimeout(() => t.remove(), 6600);
}

// ── your look (kind 30078 obelisk:avatar3d:v1) ───────────────────────────

let avatars = new AvatarStore(hub);
const LOOK_ASKED = 'obelisk-sky/look-asked';

function myLook(): Avatar {
  const pk = session.current?.pubkey;
  if (!pk) return DEFAULT_AVATAR;
  // Nothing saved yet: the look your pubkey already gives your character.
  const saved = avatars.get(pk);
  if (saved?.look) return saved;
  const look = world.people.get(pk)?.look ?? defaultLook(hashStr(pk));
  return { ...(saved ?? DEFAULT_AVATAR), v: 2, look: { ...look } };
}

function openLook(first = false): void {
  const pk = session.current?.pubkey;
  if (!pk) return;
  const before = myLook();
  openCreator($('app'), {
    current: myLook,
    preview: (a) => world.setAvatar(pk, a),
    cancel: () => world.setAvatar(pk, before),
    save: async (a) => {
      const out = await publishToGroup(hub, (t) => session.sign(t), avatarTemplate(a, avatars.createdAt(pk)));
      if (!out.ok) return out.reason;
      avatars.ingest(out.event);
      return null;
    },
  }, first);
}

$('account-look').addEventListener('click', () => openLook());

// Ask for the avatars of everyone in the village, a batch at a time.
setInterval(() => { if (session.current) avatars.want([...world.people.keys()]); }, 3000);

// ── live activities (kind 30078 obelisk-sky:activity:v1) ─────────────────
// What you're doing (a bench, dips at the bars) goes to the relay, and what
// everyone else is doing comes back: they run over and hold the spot.

let activity = new ActivityStore(hub);
const beacon = new ActivityBeacon();
let activitySend: Promise<void> = Promise.resolve();
let claimsDirty = true;
let claimsAt = 0;

// Live movement (ephemeral kind 20390, nostr/motion.ts): where you walk.
let motion = new MotionStore(hub);
const motionBeacon = new MotionBeacon();
let motionBusy = false;

/** Send your movement when the beacon says so (one publish in flight at a time). */
/** When you last took off (performance.now()), until the jump is sent. */
let pendingJump = 0;

function tickMotion(): void {
  const s = session.current;
  const pk = world.playerPk;
  // A remote signer (bunker) can't sign this often; it still shares activities.
  if (!s || !pk || !controller || motionBusy || s.method === 'nip46' || !prefs.get().shareMotion) return;
  const path = controller.path;
  // A jump is sent while it's fresh (within ~0.6 s of take-off), else dropped.
  if (pendingJump && performance.now() - pendingJump > 600) pendingJump = 0;
  const send = motionBeacon.update({
    p: controller.pos,
    moving: controller.moving,
    run: controller.running,
    dest: path.length ? path[path.length - 1] : null,
    heading: controller.heading,
    jumped: pendingJump > 0,
  }, Date.now());
  if (!send) return;
  if (send.jump) pendingJump = 0;
  motionBusy = true;
  publishToGroup(hub, (t) => session.sign(t), motionTemplate(send))
    .then((out) => (out.ok ? motionBeacon.ok() : motionBeacon.fail()))
    .catch(() => motionBeacon.fail())
    .finally(() => { motionBusy = false; });
}

function startActivity(): void {
  activity.stop();
  activity = new ActivityStore(hub);
  activity.onChange(() => { claimsDirty = true; });
  activity.start();
  motion.stop();
  motion = new MotionStore(hub);
  motion.onChange((pk) => {
    const r = motion.get(pk);
    if (r) world.applyMotion(pk, r.m, r.ageMs / 1000);
    if (r?.m.moving) presence.activity(pk, Date.now());
  });
  motion.start();
  motionBeacon.reset();
  // A start on the old relay expires by itself.
  beacon.reset();
  world.syncClaims([]);
  claimsDirty = true;
}

function publishActivity(a: Activity | null, since: number): void {
  activitySend = activitySend.then(async () => {
    const pk = session.current?.pubkey;
    if (!pk) return;
    const out = await publishToGroup(hub, (t) => session.sign(t), activityTemplate(a, since, activity.createdAt(pk)));
    if (out.ok) activity.ingest(out.event);
  }).catch(() => {});
}

/** Someone claimed your spot before you did: get up and let them have it. */
function yieldSpot(to: string): void {
  const pk = world.playerPk;
  if (!pk || !controller) return;
  if (world.isSeated(pk)) standPlayer();
  if (world.isTraining(pk)) { world.stopTraining(pk); controller.pos = { ...world.people.get(pk)!.pos }; }
  toast(`${world.nameOf(to)} got there first.`);
}

function tickActivity(): void {
  if (!session.current) return;
  const pk = world.playerPk;
  let mine = pk ? world.activityOf(pk) : null;
  if (pk) {
    const send = beacon.update(mine, Date.now());
    if (send) publishActivity(send.activity, send.since);
  }
  tickMotion();
  const now = performance.now();
  if (!claimsDirty && now - claimsAt < 1000) return;
  claimsDirty = false;
  claimsAt = now;
  world.expireMotion();
  const local = pk ? { pk, activity: mine, since: beacon.since } : null;
  let claims = activity.live(nowSec(), local);
  liveClaimers = new Set(claims.map((c) => c.pk));
  const lost = pk && claims.find((c) => c.pk === pk && !c.held);
  if (lost && pk) {
    const winner = claims.find((c) => c.held && c.spot === lost.spot);
    yieldSpot(winner?.pk ?? '');
    mine = world.activityOf(pk);
    claims = activity.live(nowSec(), { pk, activity: mine, since: beacon.since });
  }
  world.syncClaims(claims);
}

// Best effort: tell the others you left (the expiration covers a lost one).
window.addEventListener('pagehide', () => { if (beacon.published) publishActivity(null, 0); });

/** First visit with no saved look: offer the creator once. */
function maybeWelcome(): void {
  const pk = session.current?.pubkey;
  if (!pk) return;
  let asked = false;
  try { asked = localStorage.getItem(`${LOOK_ASKED}/${pk}`) === '1'; } catch { /* private mode */ }
  if (asked) return;
  setTimeout(() => {
    if (avatars.get(pk) || session.current?.pubkey !== pk) return;
    if (document.querySelector('.guide')) { maybeWelcome(); return; }
    try { localStorage.setItem(`${LOOK_ASKED}/${pk}`, '1'); } catch { /* private mode */ }
    openLook(true);
  }, 6000);
}

// ── games (obelisk-dex tables, kind 2390) ────────────────────────────────

let book = new GameBook();
let tablesTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleTables(): void {
  if (tablesTimer) return;
  tablesTimer = setTimeout(() => {
    tablesTimer = null;
    const list = groups.flatMap((g) => book.liveTables(g.id).map((s) => ({
      gameId: s.id,
      channelId: s.channelId,
      waiting: s.status === 'waiting',
      board: s.game === 'chain-reaction' && s.state ? readBoard(s) : null,
    })));
    world.setGameTables(list);
  }, 300);
}

async function gameOp(template: Parameters<typeof publishToGroup>[2]): Promise<void> {
  const out = await publishToGroup(hub, (t) => session.sign(t), template);
  if (!out.ok) { toast(`Game: ${out.reason}`); return; }
  book.ingest(out.event);
}

const gamePanel = new GamePanel($('app'), {
  me: () => session.current?.pubkey ?? null,
  nameOf: (pk) => world.nameOf(pk),
  session: (id) => book.session(id),
  join: (s) => void gameOp(joinTable(s)),
  start: (s) => void gameOp(startTable(s)),
  move: (s, cell, seat) => void gameOp(moveOnTable(s, { cell }, seat ?? undefined)),
  resign: (s, seat) => void gameOp(resignTable(s, seat)),
  cancel: (s) => void gameOp(cancelTable(s)),
  claimTimeout: (s) => void gameOp(timeoutOnTable(s)),
  appLink: (s) => `${OBELISK_APP}?relay=${encodeURIComponent(relayHost)}&c=${encodeURIComponent(s.channelId)}`,
});

// Every client watching a table helps enforce its clock (as the app does).
setInterval(() => {
  const id = gamePanel.openId;
  const s = id ? book.session(id) : null;
  if (s && session.current && claimableTimeout(s)) void gameOp(timeoutOnTable(s));
}, 2000);

/** Open a table; one older than the live window is fetched by id, as the app's
 *  services/games/resolve.ts does (the create, plus every op that roots on it). */
function openGame(id: string): void {
  gamePanel.open(id);
  if (book.session(id)) return;
  void hub.query({
    relays: [activeRelay()],
    filters: [{ ids: [id] }, { kinds: [2390], '#e': [id] }],
    maxWaitMs: 6000,
    label: 'sky-game-resolve',
  }).then((r) => { for (const ev of r.events) book.ingest(ev); gamePanel.refresh(id); }).catch(() => {});
}

world.hooks.onGameClick = (id) => openGame(id);

/** nostrwot.com's own link preview (its og:image). */
const NOSTR_WOT_BANNER = 'https://nostrwot.com/social-preview.png?title=Nostr+WoT+Extension+-+Identity%2C+Signer+%26+Lightning+Wallet&description=The+Nostr+browser+extension+with+a+NIP-07+signer%2C+encrypted+key+vault%2C+Lightning+wallet%2C+and+profile%2C+relay+and+mute-list+management.+Find+out+more.&locale=en&art=home';

/** A wide picture across the top of a card. */
function cardBanner(src: string, alt: string): HTMLImageElement {
  const img = el('img', 'card-banner') as HTMLImageElement;
  img.src = src;
  img.alt = alt;
  img.referrerPolicy = 'no-referrer';
  img.addEventListener('error', () => img.remove());
  return img;
}

const LANDMARK_CARDS: Record<Exclude<LandmarkId, 'nostrwot'>, { title: string; sub: string; about: string; link?: [string, string]; banner?: string }> = {
  lacrypta: {
    banner: 'https://r2a.primal.net/uploads2/5/9e/25/59e25f02b7cf6e54394b3f1a39d6182c345cb3eb3b63c44a80e41988c536a09c.png',
    title: 'La Crypta', sub: 'Bitcoin and Nostr hub · Buenos Aires',
    about: 'The house where Obelisk is built. The glowing ₿ ball on the lawn means you found it: walk up the steps, the living room is open.',
    link: ['Visit lacrypta.ar', 'https://lacrypta.ar'],
  },
  coffee: {
    title: 'Café', sub: 'Coffee on the corner of the plaza',
    about: 'Grab a table outside: press E by a chair to sit with a cortado. Medialunas on the house.',
  },
  parrilla: {
    title: 'Parrilla', sub: 'Asado under the quincho',
    about: 'Chorizos, morcilla and a tira de asado on the grill. Neighbours gather here in the evening: press E on the bench to join them.',
  },
  liberture: {
    title: 'Liberture', sub: 'Master your biology. Unlock your potential.',
    about: 'The house of the six pillars: work, sleep, nutrition, mind, exercise and finance, glowing over the roof. Step inside: the pillar tower turns in the middle, there is a desk to work at, a daybed and two cushions to meditate on. Press E by one to sit.',
    link: ['Visit liberture.com', 'https://liberture.com'],
  },
};

world.hooks.onLandmarkClick = (id) => {
  if (id === 'nostrwot') { showOfficial(); return; }
  const c = LANDMARK_CARDS[id];
  openCard((body) => {
    if (c.banner) body.append(cardBanner(c.banner, c.title));
    body.append(el('h2', '', c.title));
    body.append(el('div', 'sub', c.sub));
    body.append(el('div', 'about', c.about));
    if (c.link) {
      const actions = el('div', 'actions');
      const a = el('a', 'pill primary', c.link[0]) as HTMLAnchorElement;
      a.href = c.link[1];
      a.target = '_blank';
      a.rel = 'noopener';
      actions.append(a);
      body.append(actions);
    }
  });
  const s = world.landmarkSlot(id);
  if (s && controller) { controller.walkTo(s.yard); world.cam.played(); }
};

// ── nostr-wot: its HQ on the plaza and its official account ──────────────

/** The official account's kind 0 and latest notes, read from the public
 *  social relays (never the group relay; no AUTH is answered there). */
let officialCache: { about: string | null; notes: { id: string; content: string; at: number }[]; at: number } | null = null;

async function loadOfficial(): Promise<NonNullable<typeof officialCache>> {
  if (officialCache && Date.now() - officialCache.at < 5 * 60_000) return officialCache;
  const r = await hub.query({
    relays: [...DEFAULT_SOCIAL_RELAYS],
    filters: [{ kinds: [0], authors: [NOSTR_WOT_PUBKEY], limit: 1 }, { kinds: [1], authors: [NOSTR_WOT_PUBKEY], limit: 6 }],
    maxWaitMs: 5000,
    label: 'sky-nostrwot',
  }).catch(() => ({ events: [] as { kind: number; content: string; created_at: number; id: string; tags: string[][] }[] }));
  let about: string | null = null;
  const k0 = r.events.filter((e) => e.kind === 0).sort((a, b) => b.created_at - a.created_at)[0];
  if (k0) {
    // The village's own profile lookup only knows group relays' copies;
    // the official account lives on the public ones, so use this kind 0.
    feed?.state.ingestProfile(k0 as Parameters<SkyStateLike['ingestProfile']>[0]);
    try { const j = JSON.parse(k0.content); if (typeof j.about === 'string') about = j.about.slice(0, 400); } catch { /* not JSON */ }
  }
  const notes = r.events
    .filter((e) => e.kind === 1 && !e.tags.some((t) => t[0] === 'e'))
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, 4)
    .map((e) => ({ id: e.id, content: e.content.slice(0, 600), at: e.created_at }));
  officialCache = { about, notes, at: Date.now() };
  return officialCache;
}

function showOfficial(): void {
  const pk = NOSTR_WOT_PUBKEY;
  const prof = world.profiles.get(pk);
  openCard((body) => {
    body.append(cardBanner(NOSTR_WOT_BANNER, 'Nostr WoT'));
    if (prof?.avatar) {
      const img = el('img', 'avatar') as HTMLImageElement;
      img.src = prof.avatar;
      img.alt = '';
      img.style.borderColor = '#6366f1';
      body.append(img);
    } else {
      const a = el('img', 'avatar') as HTMLImageElement;
      a.src = '/brand/nostr-wot.svg';
      a.alt = '';
      body.append(a);
    }
    body.append(el('h2', '', prof?.name ?? 'nostr-wot'));
    const badge = el('div', 'official-badge', 'Official nostr-wot account');
    body.append(badge);
    if (prof?.nip05) body.append(el('div', 'sub', prof.nip05));
    const about = el('div', 'about', 'Web of Trust for Nostr: the SDK, the browser extension and the relays Obelisk is built on. Their headquarters is the glass building on the plaza.');
    body.append(about);
    const notesBox = el('div', 'official-notes');
    notesBox.append(el('div', 'game-note', 'Loading their latest notes…'));
    body.append(notesBox);
    const actions = el('div', 'actions');
    const site = el('a', 'pill primary', 'nostr-wot.com') as HTMLAnchorElement;
    site.href = NOSTR_WOT_SITE;
    site.target = '_blank';
    site.rel = 'noopener';
    const profile = el('a', 'pill', 'Interact on Obelisk ↗') as HTMLAnchorElement;
    profile.href = obeliskProfileUrl(pk);
    profile.title = 'Follow, like, repost and reply on Obelisk';
    profile.target = '_blank';
    profile.rel = 'noopener';
    const follow = el('button', 'pill', 'Follow with camera');
    follow.addEventListener('click', () => world.cam.focus(world.personAnchor(pk), 6));
    actions.append(site, profile, follow);
    body.append(actions);
    void loadOfficial().then((o) => {
      if (o.about) about.textContent = o.about;
      notesBox.replaceChildren();
      if (!o.notes.length) { notesBox.append(el('div', 'game-note', 'No recent notes reached us.')); return; }
      notesBox.append(el('div', 'themes-section', 'Latest notes'));
      for (const n of o.notes) {
        const row = el('div', 'official-note');
        const text = el('div', 'chat-text');
        renderContent(text, n.content, { nameOf: (p) => world.nameOf(p), images: [], emojis: {} });
        const open = el('a', 'note-open', 'Open on Obelisk ↗') as HTMLAnchorElement;
        open.href = obeliskNoteUrl(n.id, pk, DEFAULT_SOCIAL_RELAYS);
        open.target = '_blank';
        open.rel = 'noopener';
        open.title = 'Like, repost or reply on Obelisk';
        row.append(el('div', 'chat-when', new Date(n.at * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })), text, open);
        notesBox.append(row);
      }
    });
  });
  world.cam.focus(world.personAnchor(pk), 7);
  const s = world.landmarkSlot('nostrwot');
  if (s && controller) { controller.walkTo(s.yard); world.cam.played(); }
}

/** The account lives at its HQ: there whenever the village is. */
function placeOfficial(): void {
  // The account publishes notes but no kind 0 on the public relays: name it
  // and give it the nostr-wot mark until (unless) a profile turns up.
  if (!world.profiles.get(NOSTR_WOT_PUBKEY)?.loaded) {
    world.setProfile({ pubkey: NOSTR_WOT_PUBKEY, name: 'nostr-wot', avatar: '/brand/nostr-wot.svg', nip05: null, loaded: false });
  }
  world.addResident(NOSTR_WOT_PUBKEY, 'nostrwot', '#6366f1');
  feed?.state.watch(NOSTR_WOT_PUBKEY);
  void loadOfficial();
}

type SkyStateLike = NonNullable<typeof feed>['state'];

/** "Game" in a channel: open a table, then post its marker so the app shows it too. */
function newGameDialog(groupId: string): void {
  document.querySelector('.newgame')?.remove();
  const el = document.createElement('div');
  el.className = 'themes newgame';
  const title = document.createElement('div');
  title.className = 'themes-head';
  title.innerHTML = '';
  const t = document.createElement('div');
  t.className = 'themes-title';
  t.textContent = 'Start a game';
  const sub = document.createElement('div');
  sub.className = 'themes-sub';
  sub.textContent = 'Opens a table in this channel. People join from the village or from Obelisk.';
  title.append(t, sub);
  const body = document.createElement('div');
  body.className = 'themes-body';
  const choices: { label: string; game: string; opts: Record<string, unknown> }[] = [
    ...(['small', 'medium', 'large'] as CRSizeKey[]).map((size) => ({ label: `Chain Reaction · ${size}`, game: 'chain-reaction', opts: { size } })),
    { label: 'Vesta (plays in Obelisk)', game: 'vesta', opts: { seed: String(Math.floor(Date.now() / 1000) % 100000) } },
    { label: 'Stacker (plays in Obelisk)', game: 'stacker', opts: { seed: String(Math.floor(Date.now() / 1000) % 100000) } },
  ];
  for (const ch of choices) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'bell-item';
    b.textContent = ch.label;
    b.addEventListener('click', async () => {
      el.remove();
      const out = await publishToGroup(hub, (tpl) => session.sign(tpl), createTable(groupId, ch.game, ch.opts, ch.game === 'chain-reaction' ? 45 : 0));
      if (!out.ok) { toast(`Game: ${out.reason}`); return; }
      book.ingest(out.event);
      await publish(messageTemplate(groupId, gameMarker(out.event.id), null));
      gamePanel.open(out.event.id);
    });
    body.append(b);
  }
  const foot = document.createElement('div');
  foot.className = 'themes-foot';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'account-btn';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', () => el.remove());
  foot.append(document.createElement('span'), cancel);
  el.append(title, body, foot);
  $('app').append(el);
}

// ── voice (obelisk-dex mesh calls in the pavilions) ──────────────────────

installVoiceBridge({ hub, relay: activeRelay, pubkey: () => session.current?.pubkey ?? null, sign: (t) => session.sign(t) });
const call = new CallRoom(hub, activeRelay);

const VOICE_SIGNER = { nsec: 'nsec', nip07: 'nip07', nip46: 'bunker' } as const;

/** Walking out of the call's yard: how long you've been away, and whether you chose to stay. */
let awayFor = 0;
let stayInCall = false;
let awayShown: number | null = null;
function renderCall(): void {
  const s = call.state;
  const here = place ? groups.find((g) => g.id === place) : null;
  const voiceHere = here && (here.kind === 'voice' || here.kind === 'voice-sfu') ? here : null;
  const inCall = !!s.channelId;
  const bar = $('callbar');
  bar.hidden = !session.current || (!inCall && !voiceHere);
  if (bar.hidden) return;
  const callGroup = inCall ? groups.find((g) => g.id === s.channelId) : voiceHere;
  ($('call-title') as HTMLElement).textContent = callGroup?.name ?? 'Voice';
  const names = s.participants.map((pk) => world.nameOf(pk));
  const left = awayCountdown(inCall, place, s.channelId, awayFor, stayInCall);
  ($('call-who') as HTMLElement).textContent = inCall
    ? s.reconnecting ? `Reconnecting… (${s.reconnecting}/${RECONNECT_DELAYS.length})`
      : s.joining ? 'Joining…'
      : left !== null ? `Walked away: leaving in ${left} s`
      : s.micBlocked && s.error ? s.error
      : names.length ? names.join(', ') : 'Just you so far'
    : s.error ? `Couldn't join: ${s.error}` : 'Walk in and talk';
  const sfu = !inCall && voiceHere?.kind === 'voice-sfu';
  $('call-join').hidden = inCall || sfu;
  $('call-stay').hidden = left === null;
  $('call-mic').hidden = !inCall || s.joining;
  // A blocked microphone: the button retries asking for it.
  $('call-mic').textContent = s.micBlocked ? 'Allow mic' : s.micOn ? 'Mute' : 'Unmute';
  $('call-leave').hidden = !inCall;
  const app = $('call-app') as HTMLAnchorElement;
  app.hidden = !sfu;
  if (sfu && voiceHere) app.href = `${OBELISK_APP}?relay=${encodeURIComponent(relayHost)}&c=${encodeURIComponent(voiceHere.id)}`;
}

call.onChange(() => {
  renderCall();
  world.setSpeaking(call.state.speaking);
  if (call.state.channelId) world.gatherForCall(call.state.channelId, call.state.participants);
});

$('call-join').addEventListener('click', () => {
  const g = place ? groups.find((x) => x.id === place) : null;
  const s = session.current;
  if (!g || !s) return;
  void call.join(g.id, { open: g.open !== false, signer: VOICE_SIGNER[s.method] });
});
$('call-mic').addEventListener('click', () => void call.setMic(call.state.micBlocked || !call.state.micOn));
$('call-leave').addEventListener('click', () => void call.leave());
$('call-stay').addEventListener('click', () => { stayInCall = true; renderCall(); });

function tickCallAway(dt: number): void {
  const s = call.state;
  if (!s.channelId || s.joining) { awayFor = 0; stayInCall = false; awayShown = null; return; }
  if (place === s.channelId) { awayFor = 0; awayShown = null; return; }
  awayFor += dt;
  const left = awayCountdown(true, place, s.channelId, awayFor, stayInCall);
  if (left !== awayShown) { awayShown = left; renderCall(); }
  if (left === 0) { void call.leave(); toast('You walked away from the call, so you left it.'); }
}
window.addEventListener('beforeunload', () => { void call.leave(); });

// ── frame loop ───────────────────────────────────────────────────────────

let signTimer = 0;
const pinged = new Set<string>();
const roofLit = new Set<string>();
let placeDwell = 0;
let qualityHeld = true;
let lastFrame = performance.now();
const frameTimes: number[] = [];
function loop(): void {
  // Your character moves first, then the world draws it: no frame of lag.
  const now = performance.now();
  const dt = Math.min((now - lastFrame) / 1000, 0.1);
  lastFrame = now;
  frameTimes.push(dt);
  if (frameTimes.length > 120) frameTimes.shift();
  stepPlayer(dt);
  tickCallAway(dt);
  world.frame(dt);
  // "auto" quality waits until the intro has landed: a step down mid-swing recompiles and stutters.
  if (qualityHeld && !world.cam.inIntro) { qualityHeld = false; world.post.holdLevel(false); }
  tickActivity();
  renderSeatHint();
  renderChatHint();
  renderNearHint();
  if (call.state.channelId && controller) {
    call.updatePositions({ x: controller.pos.x, z: controller.pos.z, yaw: world.cameraYaw() }, (pk) => world.people.get(pk)?.pos ?? null);
  }
  player.update(dt, nowSec());
  const cmds = director.take();
  if (cmds.length) world.apply(cmds);
  for (const p of director.people.values()) world.homeOf.set(p.pk, p.groupId);
  sound.night = world.sky.night;
  signTimer -= dt;
  if (signTimer <= 0) { signTimer = 1; refreshSigns(); }
  // Only roofs that glow (or just stopped) are touched.
  for (const [id, b] of world.buildings) {
    const on = pinged.has(id);
    if (on || roofLit.has(id)) setRoofPing(b, on, performance.now() / 1000);
    if (on) roofLit.add(id); else roofLit.delete(id);
  }
  // A channel's chat open (and not folded) for a second reads it, wherever
  // you stand: opened from the channel list counts as much as walking in.
  const reading = chat.groupId && !chat.el.hidden && !chat.minimised ? chat.groupId : null;
  if (reading && readState) {
    placeDwell += dt;
    if (placeDwell > 1) {
      const latest = msgsOf(reading).at(-1);
      if (latest) readState.markRead(reading, latest.createdAt * 1000);
    }
  } else placeDwell = 0;
  requestAnimationFrame(loop);
}

/** Pips: green when a channel spoke in the last 15 min (of the time being
 *  shown), count = messages in the 24 h before it. */
function refreshSigns(): void {
  const at = player.at || nowSec();
  const last = new Map<string, number>();
  const day = new Map<string, number>();
  for (const e of player.events) {
    if (e.k !== 'msg' || e.at > at) continue;
    last.set(e.m.groupId, e.at);
    if (at - e.at < 86400) day.set(e.m.groupId, (day.get(e.m.groupId) ?? 0) + 1);
  }
  const me = session.current?.pubkey ?? null;
  pinged.clear();
  for (const g of groups) {
    world.overlay.setSignActivity(g.id, at - (last.get(g.id) ?? 0) < 900, day.get(g.id) ?? 0);
    if (!readState || !me) continue;
    const msgs = msgsOf(g.id);
    const cursor = readState.cursorFor(g.id);
    const ping = msgs.some((m) => m.createdAt * 1000 > cursor && pingReason(m, me) !== null);
    if (ping) pinged.add(g.id);
    world.overlay.setSignUnread(g.id, countUnread(msgs, cursor, me), ping);
  }
  $('tab-channels-n').textContent = String(groups.length);
  // Online now: live in the village or active in the last minutes (AFK not counted).
  const online = new Set<string>([...motion.livePks(), ...liveClaimers, ...[...lastPost.keys()].filter((pk) => presenceOf(pk) === 'online')]);
  if (session.current) online.add(session.current.pubkey);
  let n = 0;
  for (const pk of online) if (presenceOf(pk) === 'online') n++;
  $('tab-members-n').textContent = String(n);
  for (const c of world.people.values()) world.setPresence(c.pk, presenceOf(c.pk));
  side.refresh();
  if (historyOn) {
    const span = spanSeconds(historySpan);
    $('timeline-cursor').style.left = `calc(8px + (100% - 16px) * ${Math.max(0, 1 - (nowSec() - at) / span)})`;
  }
}

// ── status / feed / timeline ─────────────────────────────────────────────

function setStatus(mode: string, text: string): void {
  const s = $('status');
  s.dataset.mode = mode;
  s.title = `${text}: tap to switch between Live and History`;
  // "HISTORY · pick a moment": the word, then the detail (dropped on a phone).
  const [word, ...more] = text.split(' · ');
  const t = s.querySelector('.status-text') as HTMLElement;
  t.replaceChildren(word);
  if (more.length) {
    const m = document.createElement('span');
    m.className = 'status-more';
    m.textContent = ` · ${more.join(' · ')}`;
    t.append(m);
  }
}

function renderStatus(s: PlayerStatus): void {
  const missed = s.missed ? ` · ${s.missed} new` : '';
  if (s.mode === 'live') { setStatus(s.history ? 'replay' : 'live', s.history ? `HISTORY · pick a moment${missed}` : 'LIVE'); return; }
  const d = new Date(s.at * 1000);
  const when = d.toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  const g = s.episode ? groups.find((x) => x.id === s.episode!.groupId) : null;
  setStatus('replay', `REPLAY · ${when}${g ? ` · ${g.name}` : ''}${missed}`);
}

/** Live: the village now. History: the panel below opens to pick a stretch of the past. */
function setHistory(on: boolean): void {
  historyOn = on;
  player.history = on;
  $('timeline-panel').hidden = !on;
  document.querySelector('.controls [data-act="story"]')?.classList.toggle('on', on);
  $('status').setAttribute('aria-pressed', String(on));
  if (on) { drawTimeline(); player.status(); }
  else { player.seek(nowSec(), true); player.goLive(nowSec()); }
}
// The status pill is the switch: Live ⇄ History.
$('status').addEventListener('click', () => setHistory(!historyOn));

function addFeed(pk: string, groupId: string, text: string, to: string | null): void {
  const feed = $('feed');
  const line = document.createElement('div');
  line.className = 'feed-line';
  const who = document.createElement('span');
  who.className = 'who';
  who.style.color = pubkeyColor(pk);
  who.textContent = world.nameOf(pk);
  const ch = document.createElement('span');
  ch.className = 'ch';
  const g = groups.find((x) => x.id === groupId);
  ch.textContent = ` ${to ? `→ ${world.nameOf(to)} ` : ''}· ${g?.name ?? ''}`;
  const body = document.createElement('div');
  body.textContent = text;
  line.append(who, ch, body);
  feed.appendChild(line);
  while (feed.children.length > 5) feed.firstElementChild!.remove();
  setTimeout(() => line.classList.add('old'), 14_000);
  setTimeout(() => line.remove(), 15_500);
}

/** The history panel: messages over the span, the busiest stretches marked and listed. */
function drawTimeline(): void {
  if (!historyOn) return;
  const c = $('timeline-canvas') as HTMLCanvasElement;
  const w = (c.width = c.clientWidth * devicePixelRatio);
  const h = (c.height = c.clientHeight * devicePixelRatio);
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, w, h);
  const now = nowSec();
  const span = spanSeconds(historySpan);
  const from = now - span;
  const times = player.events.filter((e) => e.k === 'msg').map((e) => e.at);
  const counts = binCounts(times, from, now, Math.max(24, Math.floor(w / (3 * devicePixelRatio))));
  const peaks = topPeaks(findEpisodes(player.events), from, now, 5);
  // The busiest stretches, shaded behind the bars.
  g.fillStyle = 'rgba(255, 200, 61, 0.16)';
  for (const p of peaks) {
    const x0 = timeToX(p.start, from, now) * w, x1 = timeToX(p.end, from, now) * w;
    g.fillRect(x0 - 2 * devicePixelRatio, 0, Math.max(4 * devicePixelRatio, x1 - x0 + 4 * devicePixelRatio), h);
  }
  const max = Math.max(1, ...counts);
  const bw = w / counts.length;
  for (let i = 0; i < counts.length; i++) {
    if (!counts[i]) continue;
    const bh = Math.max(2 * devicePixelRatio, (Math.sqrt(counts[i]) / Math.sqrt(max)) * h);
    g.fillStyle = 'rgba(180, 249, 83, 0.75)';
    g.fillRect(i * bw + 0.5, h - bh, Math.max(1, bw - 1), bh);
  }
  // Day ticks (hours, over a day).
  g.fillStyle = 'rgba(255,255,255,0.12)';
  const tick = span <= 86400 ? 3600 * 3 : 86400;
  for (let t = Math.ceil(from / tick) * tick; t < now; t += tick) g.fillRect(timeToX(t, from, now) * w, 0, devicePixelRatio, h);
  $('tl-start').textContent = SPANS.find((s) => s.id === historySpan)!.label + ' ago';
  renderHistoryChips(peaks);
}
window.addEventListener('resize', drawTimeline);

function renderHistoryChips(peaks: ReturnType<typeof topPeaks>): void {
  const spans = $('tl-spans');
  spans.replaceChildren(...SPANS.map((s) => {
    const b = el('button', `tl-chip${s.id === historySpan ? ' on' : ''}`, s.label);
    b.addEventListener('click', () => { historySpan = s.id; drawTimeline(); });
    return b;
  }));
  const list = $('tl-peaks');
  list.replaceChildren(...peaks.map((p) => {
    const g = groups.find((x) => x.id === p.groupId);
    const b = el('button', 'tl-chip peak');
    b.append(el('b', undefined, `${p.count}`), ` · ${peakLabel(p.start)}${g ? ` · ${g.name}` : ''}`);
    b.title = `Replay the ${p.count} messages from then`;
    b.addEventListener('click', () => player.playFrom(p.start - 1, p.end, nowSec(), p));
    return b;
  }));
  if (!peaks.length) list.append(el('span', 'tl-chip', 'Nothing busy in this span yet'));
}

// Drag across the panel to replay that stretch; a click plays the hour after it.
{
  const tl = $('timeline');
  const sel = $('timeline-sel');
  let x0: number | null = null;
  const xOf = (e: PointerEvent) => { const r = tl.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left - 8) / (r.width - 16))); };
  const show = (a: number, b: number) => {
    sel.hidden = false;
    sel.style.left = `calc(8px + (100% - 16px) * ${Math.min(a, b)})`;
    sel.style.width = `calc((100% - 16px) * ${Math.abs(b - a)})`;
  };
  tl.addEventListener('pointerdown', (e) => { x0 = xOf(e); tl.setPointerCapture(e.pointerId); show(x0, x0); });
  tl.addEventListener('pointermove', (e) => { if (x0 !== null) show(x0, xOf(e)); });
  tl.addEventListener('pointerup', (e) => {
    if (x0 === null) return;
    const now = nowSec();
    const { start, end } = dragRange(x0, xOf(e), now - spanSeconds(historySpan), now);
    x0 = null;
    setTimeout(() => { sel.hidden = true; }, 1200);
    // Start a little before the first message so the scene has context.
    const first = player.events.find((ev) => ev.k === 'msg' && ev.at >= start && ev.at <= end);
    if (!first) { toast('Nobody wrote anything then. Try a shaded stretch.'); return; }
    player.playFrom(first.at - 2, end, now);
  });
}

// ── cards ────────────────────────────────────────────────────────────────

function openCard(build: (body: HTMLElement) => void): void {
  const card = $('card');
  const body = card.querySelector('.card-body') as HTMLElement;
  body.replaceChildren();
  build(body);
  card.hidden = false;
  // On a phone the chat is a bottom sheet the card would sit under: fold it.
  if (window.matchMedia('(max-width: 720px)').matches) chat.setMinimised(true);
}
($('card').querySelector('.card-close') as HTMLElement).addEventListener('click', () => { $('card').hidden = true; });
// On a phone the card is a bottom sheet: drag its grip down to put it away.
{
  const card = $('card'), head = card.querySelector('.card-head') as HTMLElement;
  let from: number | null = null;
  head.addEventListener('pointerdown', (e) => { from = e.clientY; head.setPointerCapture(e.pointerId); });
  head.addEventListener('pointermove', (e) => {
    if (from === null) return;
    card.style.transform = `translateY(${Math.max(0, e.clientY - from)}px)`;
  });
  const end = (e: PointerEvent) => {
    if (from === null) return;
    const dy = e.clientY - from;
    from = null;
    card.style.transform = '';
    if (dy > 70) card.hidden = true;
  };
  head.addEventListener('pointerup', end);
  head.addEventListener('pointercancel', end);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function messageList(msgs: WireMessage[], showWho: boolean): HTMLElement {
  const list = el('div', 'msgs');
  for (const m of msgs.slice(-5).reverse()) {
    const row = el('div', 'm');
    const g = groups.find((x) => x.id === m.groupId);
    const when = new Date(m.createdAt * 1000).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    row.append(el('div', 'meta', `${showWho ? `${world.nameOf(m.pubkey)} · ` : ''}${g?.name ?? ''} · ${when}`), el('div', '', m.text));
    list.append(row);
  }
  if (!msgs.length) list.append(el('div', 'meta', 'Nothing in the last 30 days.'));
  return list;
}

function showPerson(pk: string): void {
  if (pk === NOSTR_WOT_PUBKEY) { showOfficial(); return; }
  const prof = world.profiles.get(pk);
  const msgs = player.events.filter((e): e is Extract<Ev, { k: 'msg' }> => e.k === 'msg' && e.m.pubkey === pk).map((e) => e.m);
  openCard((body) => {
    const color = pubkeyColor(pk);
    if (prof?.avatar) {
      const img = el('img', 'avatar') as HTMLImageElement;
      img.src = prof.avatar;
      img.alt = '';
      img.style.borderColor = color;
      body.append(img);
    } else {
      const a = el('div', 'avatar', ([...(prof?.name ?? '?')][0] ?? '?').toUpperCase());
      a.style.borderColor = color;
      a.style.background = color;
      body.append(a);
    }
    body.append(el('h2', '', prof?.name ?? 'someone'));
    // Their NIP-05 (e.g. name@domain), whether they're here, and how much they wrote.
    if (prof?.nip05) body.append(el('div', 'sub nip', `✓ ${prof.nip05.replace(/^_@/, '')}`));
    const pres = presenceOf(pk);
    body.append(el('div', 'sub', `${pres === 'online' ? '🟢 Online' : pres === 'afk' ? '💤 Away (AFK)' : '⚪ Offline'} · ${msgs.length} message${msgs.length === 1 ? '' : 's'} in 30 days`));
    body.append(messageList(msgs, false));
    const actions = el('div', 'actions');
    if (session.current && pk !== session.current.pubkey) {
      const msg = el('button', 'pill primary', '💬 Message');
      msg.addEventListener('click', () => { $('card').hidden = true; openDm(pk); });
      const ring = el('button', 'pill', '📞 Call');
      ring.addEventListener('click', () => { $('card').hidden = true; void pcall.start(pk); });
      actions.append(msg, ring);
    }
    const follow = el('button', 'pill', 'Follow with camera');
    follow.addEventListener('click', () => world.cam.focus(world.personAnchor(pk), 6));
    const profile = el('a', 'pill', 'Profile on Obelisk ↗') as HTMLAnchorElement;
    profile.href = obeliskProfileUrl(pk);
    profile.target = '_blank';
    profile.rel = 'noopener';
    profile.title = 'Follow them, see their notes, like and reply on Obelisk';
    actions.append(follow, profile);
    body.append(actions);
  });
  world.cam.focus(world.personAnchor(pk), 7);
}

function showGroup(id: string): void {
  const g = groups.find((x) => x.id === id);
  if (!g) return;
  const msgs = player.events.filter((e): e is Extract<Ev, { k: 'msg' }> => e.k === 'msg' && e.m.groupId === id).map((e) => e.m);
  openCard((body) => {
    body.append(el('h2', '', g.name));
    const kind = g.kind === 'forum' ? 'Publication' : g.kind.startsWith('voice') ? 'Voice channel' : 'Text channel';
    body.append(el('div', 'sub', `${kind} · ${msgs.length} message${msgs.length === 1 ? '' : 's'} in 30 days`));
    if (g.about) body.append(el('div', 'about', g.about));
    body.append(messageList(msgs, true));
    const actions = el('div', 'actions');
    const open = el('a', 'pill primary', 'Open in Obelisk') as HTMLAnchorElement;
    open.href = `${OBELISK_APP}?relay=${encodeURIComponent(relayHost)}&c=${encodeURIComponent(id)}`;
    open.target = '_blank';
    open.rel = 'noopener';
    actions.append(open);
    body.append(actions);
  });
  world.cam.focus(world.groupAnchor(id), 9);
}

// ── controls ─────────────────────────────────────────────────────────────


// On a phone the bottom bar folds into the header's menu button: a sheet of
// the same buttons, labelled. Toggles leave it open; anything else closes it.
function setMenu(open: boolean): void {
  document.body.classList.toggle('menu-open', open);
  $('menu-btn').setAttribute('aria-expanded', String(open));
}
$('menu-btn').addEventListener('click', () => setMenu(!document.body.classList.contains('menu-open')));
document.addEventListener('pointerdown', (e) => {
  if (!document.body.classList.contains('menu-open')) return;
  const t = e.target as Element;
  if (!t.closest('.controls') && !t.closest('#menu-btn')) setMenu(false);
});
const MENU_TOGGLES = new Set(['director', 'time', 'signs', 'tilt', 'sound']);

document.querySelectorAll<HTMLButtonElement>('.controls button').forEach((b) => {
  b.addEventListener('click', () => {
    if (!MENU_TOGGLES.has(b.dataset.act ?? '')) setMenu(false);
    switch (b.dataset.act) {
      case 'about':
        window.open('/', '_blank', 'noopener');
        break;
      case 'logout':
        void session.logout();
        break;
      case 'director':
        prefs.set({ autoDirector: !prefs.get().autoDirector });
        break;
      case 'story':
        // A toggle: on, the latest conversation plays in history mode (so it
        // isn't cut short); off, back to live and the panel closes.
        if (historyOn) setHistory(false);
        else { setHistory(true); player.playStory(nowSec()); }
        break;
      case 'time': {
        const order = ['auto', 'day', 'sunset', 'night'] as const;
        prefs.set({ timeOfDay: order[(order.indexOf(prefs.get().timeOfDay) + 1) % order.length] });
        break;
      }
      case 'signs':
        prefs.set({ signs: !prefs.get().signs });
        break;
      case 'tilt': {
        const on = !prefs.get().tiltShift;
        prefs.set({ tiltShift: on });
        toast(on ? 'Toy-town view on: the edges blur so the island looks like a tiny model' : 'Toy-town view off: the whole picture is sharp');
        break;
      }
      case 'sound':
        prefs.set({ sound: !prefs.get().sound });
        break;
      case 'settings': {
        // Pressed again: close it.
        const open = $('app').querySelector('.settings');
        if (open) open.remove();
        else openSettings($('app'), prefs, () => world.post.level);
        break;
      }
      case 'districts':
        if (!themes) break;
        openThemeEditor($('app'), {
          config: () => themes!.config,
          categoryNames: () => themes!.categoryNames,
          categoryOf: () => themes!.categoryOf,
          groups: () => groups,
          resolved: (g) => resolveTheme(g, { channels: {}, categories: themes!.config.categories, updatedAt: 0 }, themes!.categoryOf),
          save: saveThemes,
        });
        break;
      case 'home':
        $('card').hidden = true;
        world.cam.home();
        break;
      case 'firstperson':
        if (world.playerPk) toggleFirstPerson();
        else toast('Log in to walk around as yourself.');
        break;
      case 'help': {
        const open = $('app').querySelector('.guide');
        if (open) open.remove();
        else openControlsGuide($('app'));
        break;
      }
      case 'fullscreen':
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen?.();
        break;
    }
  });
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { $('card').hidden = true; setMenu(false); }
});
