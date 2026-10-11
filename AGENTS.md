# AGENTS.md: Obelisk Sky

Obelisk Sky (https://sky.obelisk.ar) is a 3D floating-island village that is also a real Obelisk client. Every NIP-29 channel on the selected relay is a house; people walk to the house of the channel they post in, walk over to whoever they reply to, sit and drink mate, train in the park, join voice calls and play games. You log in with your own Nostr key; the server holds no keys and fetches nothing from relays. Everything happens in the browser.

This is the one instruction file for every agent here; `CLAUDE.md` only imports it. When the code moves, fix the sentence here in the same change.

## Stack

- **Three.js 0.180 + Vite 7 + TypeScript**, no framework for the world UI (plain DOM in `client/src/ui/`). React only for islands that re-host obelisk-dex components (login modal, chat message bodies).
- **Relays:** `@nostr-wot/relay/hub` RelayHub, set up like obelisk-dex's page hub. Signers from `@nostr-wot/signers`, profiles from `@nostr-wot/data`, login widget `@nostr-wot/ui`.
- **Vitest** (+ jsdom and Testing Library for the React islands).
- **Server:** `server/index.ts` is a tiny Node HTTP server. It serves `dist/client` (the landing page at `/`, the village at `/app`; old `/?relay=` and `/?time=` links get a 302 to `/app`), `/healthz`, and `/api/link-preview` (the vendored obelisk-dex OpenGraph unfurler, with its SSRF guards). Nothing else; never add relay access or keys to it.

## Commands

```bash
npm install
npx vite client --port 5174 --host 127.0.0.1   # dev (also: npm run dev:client)
npx tsc -p tsconfig.json                        # typecheck (vite build does NOT typecheck)
npm test                                        # vitest run
npm run build                                   # client to dist/client, server to dist/server.js
pm2 restart obelisk-sky                         # deploy: the live site serves this directory's dist on :3024
npm run vendor                                  # re-snapshot obelisk-dex src (see below), then copy-brand and make-icons
node scripts/make-icons.mjs                     # favicon.ico, icon-192/512, maskable, apple-touch from brand/sky-mark-flat.svg
node scripts/build-people.mjs                   # rebuild character assets from _dl/quaternius
node scripts/make-og.mjs <1200x630.png>         # redraw the link-preview card client/public/og.jpg
```

Deploy = `npm run build && pm2 restart obelisk-sky`, then check through the tunnel: `/`, `/app`, `/healthz`, the village's `assets/app-*.js`, and any new asset you added (`curl -I https://sky.obelisk.ar/...`). Run typecheck and the full test suite before every deploy.

## Layout

```
client/
  index.html            the landing page at / (English inline; src/landing/ swaps to Spanish)
  app/index.html        the village at /app: OG/Twitter tags, header, gate, loading screen
  public/               served as-is: models/ (Kenney town+nature, pets, people/), brand/ (sky-mark.svg, sky-mark-flat.svg), landing/, og.jpg, icons
  src/main.ts           wiring: session, feed, world, chat, voice, games, prefs, keyboard, boot order
  src/landing/          the landing page: copy.ts (en/es words), landing.ts (language switch), landing.css
  src/world/            the 3D world
    world.ts              the World: island, buildings, people, seats, stations, landmarks, frame loop
    layout.ts             pure planning: island plan, slots, NavGrid (CELL 0.5), river, millSite, bridges
    island.ts             ground, river/pond/waterfall shaders (river and pond split the surface on one circle), grass detail texture
    bridge.ts             the arched footbridges: archHeight (shared by mesh and walking), buildBridge
    character.ts          a person: model, animation layers, path following, props, badge
    landmarks/            La Crypta, nostr-wot HQ, café, parrilla (registry in index.ts)
    gym.ts                the gym hall a fitness channel gets (machines, interior, ramp), the barbell
    mateRound.ts          sharing one mate along a bench
    nostrich.ts           the purple nostrich (procedural) and the wild flock
    fpFeel.ts             first-person bob, landing dip, roll, run FOV
    anim/exercises.ts     calisthenics clips built from poses at runtime (hands posed for each grip)
    districts.ts          track, calisthenics park + stations, arcade, mate/cup/choripán/laptop props
    mill.ts, obelisk.ts, lacrypta.ts (+ lacryptaInterior.ts, its living room), pet.ts, post.ts (post-processing), cameraman.ts, overlay.ts
  src/people/people.ts  Quaternius humanoids: bodies, outfits, hair, recolouring, defaultLook/parseLook
  src/player/           PlayerController (walk/run/jump, solids, interiors), input (double-tap run)
  src/nostr/            hub, session, feed/state, publish, readstate, avatars, profileStore, themes,
                        activity (live sitting/training), motion (live movement)
  src/chat/             React island rendering obelisk-dex's message components
  src/ui/               chat panel, creator (+ lookPreview, its 3D stage), settings, relay modal, controls guide, content (bubbles), loading (top-down map)
  src/shims/            replacements for obelisk-dex modules (the seam, see below)
server/                 static server + link preview
scripts/                vendor, copy-brand, make-icons, copy-assets, build-people, make-og
vendor/obelisk/         pinned snapshot of obelisk-dex src (COMMIT file says which), aliased as @/
_dl/                    downloaded source packs (Kenney, Quaternius zips), not served
```

## The seam with obelisk-dex

Obelisk-dex code is imported from `vendor/obelisk` as `@/...` (Vite alias and tsconfig `paths`). Modules that would reach the app's bridge, next-intl or Next routing are swapped by `SHIMS` in `client/vite.config.ts`, mirrored in `tsconfig.json` `paths` (`next-intl`, `@/i18n/navigation`, `@/hooks/session/useSession`, clipboard, blossom, `@/services/nostr-bridge`, `@/services/wot/engine`, the media library modal). `vitest.config.ts` uses the same `SHIMS`.

- Re-vendor deliberately (`npm run vendor`), never by editing files under `vendor/`. After re-vendoring, re-run typecheck and tests: shims may need new exports.
- Sky has its own mark (a white cloud with the Obelisk rising out of it, `client/public/brand/sky-mark*.svg`) and palette (`--sky`, `--cloud`, `--ink` in `styles.css`; the landing page and the loading screen, gate and brand pill use it, the in-app panels stay dark). `copy-brand.mjs` no longer copies obelisk-dex's icons; `make-icons.mjs` draws sky's.
- `scripts/copy-brand.mjs` copies `obelisk.stl`, writes the manifest (`start_url: /app`) and generates `client/src/obelisk.generated.css` from the vendored `globals.css` (Tailwind v4 `@source` globs for the components sky renders). Do not edit the generated file.
- Wire formats must match obelisk-dex exactly (kind 9 tags, reactions, deletions, read-state kind 30078 `obelisk:readstate:v1`, games kind 2390).
- Sky-only events:
  - kind 30078 `obelisk:avatar3d:v1`: your look (avatar v2 `{look,...}`; v1 still parses). Your own signed event is cached in localStorage (`obelisk-sky/avatar/<pk>`); on login or a relay switch `AvatarStore.syncOwn` shows it at once and publishes the same signed event to a relay that lacks it or has an older one.
  - kind 30078 `obelisk-sky:themes:<relay>`: operator-only districts.
  - kind 30078 `obelisk-sky:activity:v1` (`nostr/activity.ts`): what you're doing live. Tags `op` start/stop, `spot`, NIP-40 `expiration` (90 s); content `{v,op,spot,kind,since}`. Kinds: the exercises (park and gym), `sit` (seats only) and `run` (track lanes only). Published 0.3 s after you sit or train, re-sent every 45 s, a stop when you get up. Two claims on one spot: the earlier `since` holds it.
  - ephemeral kind 20390 (`nostr/motion.ts`): live movement. Content `{v,t,p,mv?,run?,d?|h?}`: position plus a click's destination (`d`) or a key heading (`h`). Sent on a click, a turn, start/stop running or stopping; a correction every 2 s by keys / 4 s on a path; a 30 s heartbeat standing; never more than 1/s, backing off to 8 s when the relay refuses. Off with the `shareMotion` pref and for remote signers (nip46).
- The group relay (public.obelisk.ar) only accepts events from whitelisted pubkeys after NIP-42 AUTH. Sky-only events are therefore signed with the player's own key (no throwaway session keys), and its per-pubkey rate limit is unknown: keep send rates conservative.

## World rules that are easy to break

- **Chat panel and yards.** `place` (the yard you've settled in) drives the call bar and mark-read whether or not the chat is open. What the panel does on a place change is `ui/chatAuto.ts` `onPlaceChange` and the `chatOpen` pref (`auto` / `ask` (default: a "Press C" button) / `off`): a chat you opened yourself is never swapped or closed by walking.

- **Boot and intro** (`main.ts` boot block). `world.buildGround()` (procedural island, no models) and `cam.holdTopDown()` come first, and a preview loop renders that straight-down view behind `ui/loading.ts`'s SVG map (same framing: `topDownHeight` / `mapViewBox`, world −z up). Then the models load and `setGroups([])` builds the props, then the people. At `ready` the loading screen fades and `cam.playIntro()` swings down to your character or the home view. While the intro runs the camera bypasses OrbitControls and ignores director cuts. Any input or a `flyTo` finishes it quickly, and `Post.holdLevel` keeps "auto" quality from dropping during loading. Tilt-shift follows `cam.introProgress`.
- **Walking.** The NavGrid (0.5 cells) is for residents' pathfinding and coarse blocking. Fine collision is `world.solids` (axis-aligned boxes with a top): furniture you bump into but can jump onto (`top` low), posts you can't (`top` high). Don't use `blockAround` for small props; it blocks whole cells and makes invisible walls.
- **Raised ground** (La Crypta's steps, mound and floor a storey up; the arched footbridges, `world/bridge.ts` `bridgeHeightAt`) is a landmark's `groundAt` (local, a smooth ramp with no ledges) or a bridge's arch, read through `world.groundAt`. The controller climbs and descends ground by the distance moved (`MAX_RAMP_SLOPE`), so keep ground free of ledges; furniture uses `solids`. The player controller stands on it (`floorAt`, a step down sticks to the slope); everyone else the world walks gets it as `Character.groundY` each frame (not while seated: seat heights are absolute; not the viewer: their `jumpY` already has it). Motion events carry no height: every screen derives it from the position.
- **Buildings you can enter** (HQ, café, La Crypta up its steps) keep their footprint blocked on the grid; the player may additionally walk their `interior.rooms` (`world.insideWalkable`). Doors open by distance to the player or a live mover; a mover inside has no grid path and walks straight. The follow camera gets a cutaway (roof hidden, walls see-through), first person does not. Indoor seats (`LandmarkSeat.indoor`, La Crypta's sofas) are for players only, offered from inside; NPCs never pick them (`nearestFreeSeat(…, npc)`), a live claim still can.
- **Landmarks** reserve slots before channels are assigned (`landmarks/index.ts` `LANDMARKS`, `reserveLandmarkSlots`). Each declares its real `footprint` and an optional `lawn` kept free of plaza lamps.
- **Voice channels are trees** (`world/ombu.ts`): an ombú with a ring of chairs (seats with `tree: <channel>`, sharing one mate) instead of a house. Their plot is open ground on the grid (`gridSlots` skips it; only the trunk is blocked), people in the call walk to free chairs (`gatherForCall`), and the plaza's three benches stand round the tree nearest the plaza (`placeBenches`, seats flagged `managed`), or at the plaza when there's none.
- **First person and you.** In first person your body draws nothing (it keeps its shadow), so while you train or sit the camera steps out behind you and the body shows (`World.setSelfView`, `Cameraman.setWatching`); running laps stays in your eyes.
- **Benches and the mate.** Seats with the same `bench` id (plaza benches, La Crypta's sofas: three places each) share one mate once two people sit there: `world/mateRound.ts` (pure: the cebador sits in the middle, every pass is between neighbours) and `World.updateRounds`, which moves the one mate object from hand to hand halfway through a pass (`Character.reach`/`reachK`).
- **The gym and the track.** One channel's house becomes the gym (`world/gym.ts` `pickGymChannel`: a name like gym/fitness, La Crypta's first, else a sports channel; slot ≥ 2 wide). Its interior, floor ramp (`groundAt`), solids and machines (bench press, squat rack, curls, with `Character.heldBar`) are registered by `World.setGym`; enterable buildings are iterated by `World.enterables()`. The track's three lanes (`World.lanes`, `trackLap(site, n, lane)`) are stations of kind `run`: NPCs loop in theirs, your laps are run by the controller in `stepPlayer`.
- **Live and History.** The status pill switches between Live and History (`setHistory` in main.ts). History opens the panel under the village (`ui/history.ts`: spans of 24 h / 7 d / 30 d, the busiest stretches from `findEpisodes`, drag or click to replay) and sets `Player.history`: live messages are counted (`missed`) instead of pulling you back, and a replay that ends stays put.
- **Voice calls** (`voice/callRoom.ts`): a join is cancelled by any later join or leave (token), a dropped call reconnects with backoff (`RECONNECT_DELAYS`), a refused microphone leaves you listening (`micBlocked`), and walking out of the call's yard leaves after `AWAY_LEAVE_S` unless you press Stay.
- **Nostriches** (`world/nostrich.ts`): built from boxes and animated in code. A `Flock` of four roams the island (they scatter from runners), and `nostrich` is a pet kind (no GLB; `Pet` builds it).
- **Characters.** When the world places someone (seat, station), call `resetDrive()` so a stale run or jump state doesn't override the pose. Seats put the person `SIT_SEAT_HEIGHT` below the seat. The badge and speech bubbles follow the head bone.
- **Live activities and movement.** People steered from another browser are *pinned* (`World.pinned`): `idleLife` and the Director's walks, conversations and despawns leave them alone.
  - A live claim (`World.syncClaims`, from `ActivityStore.live`) runs the person to the spot, or fades them across if far or pathless, then sits or trains them. An NPC on the spot is evicted. A claim beats movement.
  - Live movement (`World.applyMotion`) walks them at the player controller's speeds (`Character.pace`), fades them across when more than 4 m off, and goes stale after 75 s (`World.expireMotion`): they return to local life, or leave if they only appeared to move.
  - Spot ids are `station:<index>`, `seat:<x*10>:<z*10>` and `lane:<0..2>`, so moving a bench or reordering `CALISTHENICS_STATIONS` changes ids between builds. Gym machines are appended to `stations` after the park's, so park ids don't move when a gym appears.
  - NPC seat and station reservations go through `reserve`/`releasePending`, never `taken = 'pending:…'` directly.
- **Clothes and skin colour** (`people/people.ts` `tintable`): a garment's texture brightness is divided by its own mean linear luminance (`garmentLuma`), so it shows the chosen colour itself. Without that, trousers (mean ≈ 0.01) render black. Faces use the same dye as the hands at the skin tone, keeping a little of the painted texture (`SKIN_DYE`). Skin textures load with the look (`loadLook`) so they can be measured.
- **Lighting:** the hemisphere fill is what faces, pets' bellies and building sides turned from the sun get. `world/sky.test.ts` keeps day, dusk and night fill above a floor; don't drop it to darken a mood.
- **Exercise clips** are generated per body and grip height; hands are posed per grip (`OVER_BAR`, `ON_BAR`, `ON_PARALLEL`, `FLAT`) and the grip anchor is inside the curled fingers. Keep `exercises.test.ts` passing when changing poses.
- **Assets.** Cloudflare caches `/models/*` and `/assets/*` as immutable for a year: a changed file under the same URL keeps serving the old one (add `?v=`). The server's CSP must keep `blob:` in `connect-src` and `'wasm-unsafe-eval'` in `script-src`, or GLB textures and meshopt fail and bodies don't render.
- **Performance.** `__sky.perf()` (any build) reports one frame's draw calls and triangles (every post pass), lights on and the quality level. Keep it from regressing:
  - Channel houses are merged after building (`world/merge.ts` `mergeStatic`, one mesh per material); the roof (`name: 'roof'`) and `windows` stay separate. Anything you add to a house that moves, hides or changes on its own must be kept out of the merge too.
  - Point and spot lights are budgeted (`world/lightBudget.ts`): only the nearest few are visible, with constant counts so shaders don't recompile. A new lamp is picked up automatically; don't toggle `visible` on lights yourself.
  - People out of view are hidden and not posed (`Character.offscreen`). "Auto" quality starts by device and steps both ways (`world/quality.ts`); grass follows the effective level (`Post.onLevel`).
- **Water shader:** GLSL `smoothstep(a, b, x)` needs a < b.

## Testing

Every change comes with tests next to the code (`*.test.ts`, `*.test.tsx`), and `npx tsc -p tsconfig.json` plus `npm test` must pass before a deploy. Visual changes also get a headless screenshot check. Use the playwright in `/root/obelisk-dex/node_modules` with `--use-angle=swiftshader`. It is slow, so allow minutes. The dev build exposes `window.__sky` (world, player, chat, controller, activity, motion) and `__skyDevLogin(hex)` for a throwaway key. Never log in with a real key in tests, and never post to a relay from tests. A logged-in test page shares movement by default: set `shareMotion: false` in the `obelisk-sky/prefs` localStorage entry first. To test remote people, feed signed events to `__sky.activity().ingest` / `__sky.motion().ingest` instead of publishing. Software rendering runs at about 1 fps (world time crawls), so poll for state rather than sleeping a fixed time; don't edit source files while a headless run is going (Vite reloads the page mid-run); and kill leftover `headless_shell` processes after a timed-out run.

## Secrets and hygiene

- `.env` holds the retired v1 bot key. Never commit it, never print it, never use it in the client. It is due for deletion once the key is un-whitelisted.
- `_dl/` (about 1 GB of source packs), `node_modules/`, `dist/` and the reference photos are not source; keep them out of version control (`.gitignore`).
- Keep files focused; prefer the existing helpers (`dist`, `rng`, `fbm2`, `model()`, `buildPerson`, `landmarkToWorld`) over new ones.
