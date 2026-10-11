# AGENTS.md: Obelisk Sky

Obelisk Sky (https://sky.obelisk.ar) is a 3D floating-island village that is also a real Obelisk client. Every NIP-29 channel on the selected relay is a house; people walk to the house of the channel they post in, walk over to whoever they reply to, sit and drink mate, train in the park, join voice calls and play games. You log in with your own Nostr key; the server holds no keys and fetches nothing from relays. Everything happens in the browser.

This is the one instruction file for every agent here; `CLAUDE.md` only imports it. When the code moves, fix the sentence here in the same change.

## Stack

- **Three.js 0.180 + Vite 7 + TypeScript**, no framework for the world UI (plain DOM in `client/src/ui/`). React only for islands that re-host obelisk-dex components (login modal, chat message bodies).
- **Relays:** `@nostr-wot/relay/hub` RelayHub, set up like obelisk-dex's page hub. Signers from `@nostr-wot/signers`, profiles from `@nostr-wot/data`, login widget `@nostr-wot/ui`.
- **Vitest** (+ jsdom and Testing Library for the React islands).
- **Server:** `server/index.ts` is a tiny Node HTTP server. It serves `dist/client`, `/healthz`, and `/api/link-preview` (the vendored obelisk-dex OpenGraph unfurler, with its SSRF guards). Nothing else; never add relay access or keys to it.

## Commands

```bash
npm install
npx vite client --port 5174 --host 127.0.0.1   # dev (also: npm run dev:client)
npx tsc -p tsconfig.json                        # typecheck (vite build does NOT typecheck)
npm test                                        # vitest run
npm run build                                   # client to dist/client, server to dist/server.js
pm2 restart obelisk-sky                         # deploy: the live site serves this directory's dist on :3024
npm run vendor                                  # re-snapshot obelisk-dex src (see below), then copy-brand
node scripts/build-people.mjs                   # rebuild character assets from _dl/quaternius
node scripts/make-og.mjs <1200x630.png>         # redraw the link-preview card client/public/og.jpg
```

Deploy = `npm run build && pm2 restart obelisk-sky`, then check through the tunnel: `/`, `/healthz`, the main `assets/index-*.js`, and any new asset you added (`curl -I https://sky.obelisk.ar/...`). Run typecheck and the full test suite before every deploy.

## Layout

```
client/
  index.html            page, OG/Twitter tags, icons
  public/               served as-is: models/ (Kenney town+nature, pets, people/), brand/, og.jpg, icons
  src/main.ts           wiring: session, feed, world, chat, voice, games, prefs, keyboard
  src/world/            the 3D world
    world.ts              the World: island, buildings, people, seats, stations, landmarks, frame loop
    layout.ts             pure planning: island plan, slots, NavGrid (CELL 0.5), river, millSite, bridges
    island.ts             ground, river/pond/waterfall shaders, grass detail texture
    character.ts          a person: model, animation layers, path following, props, badge
    landmarks/            La Crypta, nostr-wot HQ, café, parrilla (registry in index.ts)
    anim/exercises.ts     calisthenics clips built from poses at runtime (hands posed for each grip)
    districts.ts          track, calisthenics park + stations, arcade, mate/cup/choripán/laptop props
    mill.ts, obelisk.ts, lacrypta.ts, pet.ts, post.ts (post-processing), cameraman.ts, overlay.ts
  src/people/people.ts  Quaternius humanoids: bodies, outfits, hair, recolouring, defaultLook/parseLook
  src/player/           PlayerController (walk/run/jump, solids, interiors), input (double-tap run)
  src/nostr/            hub, session, feed/state, publish, readstate, avatars, profileStore, themes,
                        activity (live sitting/training), motion (live movement)
  src/chat/             React island rendering obelisk-dex's message components
  src/ui/               chat panel, creator (+ lookPreview, its 3D stage), settings, relay modal, controls guide, content (bubbles)
  src/shims/            replacements for obelisk-dex modules (the seam, see below)
server/                 static server + link preview
scripts/                vendor, copy-brand, copy-assets, build-people, make-og
vendor/obelisk/         pinned snapshot of obelisk-dex src (COMMIT file says which), aliased as @/
_dl/                    downloaded source packs (Kenney, Quaternius zips), not served
```

## The seam with obelisk-dex

Obelisk-dex code is imported from `vendor/obelisk` as `@/...` (Vite alias and tsconfig `paths`). Modules that would reach the app's bridge, next-intl or Next routing are swapped by `SHIMS` in `client/vite.config.ts`, mirrored in `tsconfig.json` `paths` (`next-intl`, `@/i18n/navigation`, `@/hooks/session/useSession`, clipboard, blossom, `@/services/nostr-bridge`, `@/services/wot/engine`, the media library modal). `vitest.config.ts` uses the same `SHIMS`.

- Re-vendor deliberately (`npm run vendor`), never by editing files under `vendor/`. After re-vendoring, re-run typecheck and tests: shims may need new exports.
- `scripts/copy-brand.mjs` generates `client/src/obelisk.generated.css` from the vendored `globals.css` (Tailwind v4 `@source` globs for the components sky renders). Do not edit the generated file.
- Wire formats must match obelisk-dex exactly (kind 9 tags, reactions, deletions, read-state kind 30078 `obelisk:readstate:v1`, games kind 2390).
- Sky-only events:
  - kind 30078 `obelisk:avatar3d:v1`: your look (avatar v2 `{look,...}`; v1 still parses).
  - kind 30078 `obelisk-sky:themes:<relay>`: operator-only districts.
  - kind 30078 `obelisk-sky:activity:v1` (`nostr/activity.ts`): what you're doing live. Tags `op` start/stop, `spot`, NIP-40 `expiration` (90 s); content `{v,op,spot,kind,since}`. Published 0.3 s after you sit or train, re-sent every 45 s, a stop when you get up. Two claims on one spot: the earlier `since` holds it.
  - ephemeral kind 20390 (`nostr/motion.ts`): live movement. Content `{v,t,p,mv?,run?,d?|h?}`: position plus a click's destination (`d`) or a key heading (`h`). Sent on a click, a turn, start/stop running or stopping; a correction every 2 s by keys / 4 s on a path; a 30 s heartbeat standing; never more than 1/s, backing off to 8 s when the relay refuses. Off with the `shareMotion` pref and for remote signers (nip46).
- The group relay (public.obelisk.ar) only accepts events from whitelisted pubkeys after NIP-42 AUTH. Sky-only events are therefore signed with the player's own key (no throwaway session keys), and its per-pubkey rate limit is unknown: keep send rates conservative.

## World rules that are easy to break

- **Walking.** The NavGrid (0.5 cells) is for residents' pathfinding and coarse blocking. Fine collision is `world.solids` (axis-aligned boxes with a top): furniture you bump into but can jump onto (`top` low), posts you can't (`top` high). Don't use `blockAround` for small props; it blocks whole cells and makes invisible walls.
- **Buildings you can enter** (HQ, café) keep their footprint blocked on the grid; the player may additionally walk their `interior.rooms` (`world.insideWalkable`). Doors open by distance; the follow camera gets a cutaway (roof hidden, walls see-through), first person does not.
- **Landmarks** reserve slots before channels are assigned (`landmarks/index.ts` `LANDMARKS`, `reserveLandmarkSlots`). Each declares its real `footprint` and an optional `lawn` kept free of plaza lamps.
- **Characters.** When the world places someone (seat, station), call `resetDrive()` so a stale run or jump state doesn't override the pose. Seats put the person `SIT_SEAT_HEIGHT` below the seat. The badge and speech bubbles follow the head bone.
- **Live activities and movement.** People steered from another browser are *pinned* (`World.pinned`): `idleLife` and the Director's walks, conversations and despawns leave them alone.
  - A live claim (`World.syncClaims`, from `ActivityStore.live`) runs the person to the spot, or fades them across if far or pathless, then sits or trains them. An NPC on the spot is evicted. A claim beats movement.
  - Live movement (`World.applyMotion`) walks them at the player controller's speeds (`Character.pace`), fades them across when more than 4 m off, and goes stale after 75 s (`World.expireMotion`): they return to local life, or leave if they only appeared to move.
  - Spot ids are `station:<index>` and `seat:<x*10>:<z*10>`, so moving a bench or reordering `CALISTHENICS_STATIONS` changes ids between builds.
  - NPC seat and station reservations go through `reserve`/`releasePending`, never `taken = 'pending:…'` directly.
- **Clothes and skin colour** (`people/people.ts` `tintable`): a garment's texture brightness is divided by its own mean linear luminance (`garmentLuma`), so it shows the chosen colour itself. Without that, trousers (mean ≈ 0.01) render black. Faces use the same dye as the hands at the skin tone, keeping a little of the painted texture (`SKIN_DYE`). Skin textures load with the look (`loadLook`) so they can be measured.
- **Lighting:** the hemisphere fill is what faces, pets' bellies and building sides turned from the sun get. `world/sky.test.ts` keeps day, dusk and night fill above a floor; don't drop it to darken a mood.
- **Exercise clips** are generated per body and grip height; hands are posed per grip (`OVER_BAR`, `ON_BAR`, `ON_PARALLEL`, `FLAT`) and the grip anchor is inside the curled fingers. Keep `exercises.test.ts` passing when changing poses.
- **Assets.** Cloudflare caches `/models/*` and `/assets/*` as immutable for a year: a changed file under the same URL keeps serving the old one (add `?v=`). The server's CSP must keep `blob:` in `connect-src` and `'wasm-unsafe-eval'` in `script-src`, or GLB textures and meshopt fail and bodies don't render.
- **Water shader:** GLSL `smoothstep(a, b, x)` needs a < b.

## Testing

Every change comes with tests next to the code (`*.test.ts`, `*.test.tsx`), and `npx tsc -p tsconfig.json` plus `npm test` must pass before a deploy. Visual changes also get a headless screenshot check. Use the playwright in `/root/obelisk-dex/node_modules` with `--use-angle=swiftshader`. It is slow, so allow minutes. The dev build exposes `window.__sky` (world, player, chat, controller, activity, motion) and `__skyDevLogin(hex)` for a throwaway key. Never log in with a real key in tests, and never post to a relay from tests. A logged-in test page shares movement by default: set `shareMotion: false` in the `obelisk-sky/prefs` localStorage entry first. To test remote people, feed signed events to `__sky.activity().ingest` / `__sky.motion().ingest` instead of publishing. Software rendering runs at about 1 fps (world time crawls), so poll for state rather than sleeping a fixed time; don't edit source files while a headless run is going (Vite reloads the page mid-run); and kill leftover `headless_shell` processes after a timed-out run.

## Secrets and hygiene

- `.env` holds the retired v1 bot key. Never commit it, never print it, never use it in the client. It is due for deletion once the key is un-whitelisted.
- `_dl/` (about 1 GB of source packs), `node_modules/`, `dist/` and the reference photos are not source; keep them out of version control (`.gitignore`).
- Keep files focused; prefer the existing helpers (`dist`, `rng`, `fbm2`, `model()`, `buildPerson`, `landmarkToWorld`) over new ones.
