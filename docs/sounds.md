# Sky's sounds

This page lists every sound the village makes or could make, and where each one comes from.

- **Synth:** made in the browser with WebAudio (`client/src/sound.ts`, `client/src/audio/synthLoops.ts`). There's no file to add; a developer writes these in code.
- **Suno:** needs a recorded track. Generate it on suno.com with the prompt below, then add it as in [Adding or replacing a track](#adding-or-replacing-a-track). Until an emote's track exists, its synth loop plays in its place; a place without a track is silent.
- **Clips:** short recorded sounds an emote plays (Sangreee).

All sound is off until the viewer turns it on (Settings → Sound). Under it, Ambient sounds, Footsteps and Emote music each have their own switch. Emote music is heard only near the people playing it (`audio/emoteMusic.ts`):
- Dancers within 6 m share one loop, and the first dancer's music wins.
- A loop fades out by 25 m.
- At most the two nearest groups play.
- Every loop starts on a bar grid kept by the wall clock, so two groups in earshot, and the same group on two screens, keep the same beat; the synced dances move to it.

## Managing the sounds

### What each switch controls

Settings → Sound. Every switch is a pref in `client/src/prefs.ts`, applied in `main.ts` `applyPrefs`.

| Switch | Pref | What it plays | Code |
|---|---|---|---|
| Sound | `sound` | Everything: the master switch. Off by default; the browser only starts audio after a gesture (`Soundscape.wake`). | `sound.ts` |
| Volume | `volume` | The master volume, 0–100 %. | `sound.ts` `setVolume` |
| Ambient sounds | `ambience` | Crickets at night. | `sound.ts` `ambient` |
| Footsteps | `footsteps` | Your own steps. | `sound.ts` `footstep` |
| Emote music | `emoteMusic` | Music near people dancing, training or in the lotus pose. | `audio/emoteMusic.ts` |
| Music at places | `placeMusic` | The parrilla's cumbia, the campfires' guitar. | `audio/placeMusic.ts` |

Emote clips (Sangreee) follow the Sound switch only: they aren't music. Chat blips, zap coins and the arrival whoosh follow Sound too.

### Adding or replacing a track

1. **Keep the master.** Put the file as it came (from Suno or wherever) in `_dl/sounds/`. That folder isn't served or committed.
2. **Encode it** into `client/public/sounds/`: drop the cover art, set the loudness to −16 LUFS, and use 112 kbps (music) or mono 96 kbps (a voice clip):
   ```bash
   ffmpeg -i _dl/sounds/parrilla.mp3 -map 0:a -map_metadata -1 \
     -af "loudnorm=I=-16:TP=-1.5:LRA=11" -ar 44100 -b:a 112k client/public/sounds/parrilla.mp3
   ```
   Every file at the same loudness is what lets the code set relative levels.
3. **Name it in `client/public/sounds/manifest.json`:**
   - under `tracks` for emote music (keys `dance`, `dance2`, `workout`, `zen`; `null` plays the synth loop);
   - under `places` for music at a place (keys `parrilla`, `campfire`).
4. **Replacing a file? Give it a new name** (`parrilla-2.mp3`) and point the manifest at it. Cloudflare keeps an `.mp3` for 4 hours, so a file replaced under the same name keeps playing the old one; `manifest.json` is never cached, so a new name is live at once. Delete the old file in the same change.
5. **Emote music must match its BPM** (the table below) **and start on the beat:** a track loops on whole bars (`emoteMusic.ts` `loopBars`) of the shared wall-clock grid, so the dancers stay on its beat. Place music has no BPM rule.
6. Run `npm test`, then deploy. Check the file answers: `curl -I https://sky.obelisk.ar/sounds/<file>`.

### Tuning how loud and how far

All volumes stack on the master volume. The numbers to change:

| What | Where | Now |
|---|---|---|
| A place's reach (silent past it) and loudness | `audio/placeMusic.ts` `PLACE_TRACKS` | parrilla 3.5 m, 0.6 (the café is 4.5 m away); campfire 5.5 m, 0.45 |
| All music at places | `placeMusic.ts` `bus.gain` | 0.6 |
| How close you must be for full volume at a place | `placeMusic.ts` `refDistance` | 1.5 m |
| Emote music's reach | `audio/emoteMusic.ts` `HEAR_M` | 25 m |
| All emote music | `emoteMusic.ts` `bus.gain` | 0.45 |
| Dancers sharing one loop | `world/emotes.ts` `EMOTE_SYNC_M` | 6 m |
| Nearest dance groups that play | `emoteMusic.ts` `MAX_VOICES` | 2 |
| Emote clips: someone else's, and your own | `emoteMusic.ts` `SHOT_GAIN`, `SELF_SHOT_GAIN` | 1.1, 1.8 |
| Footsteps, walking and running | `sound.ts` `footstep`: `vol` | 0.045, 0.07 |

Only one place plays at a time: the nearest one for its reach (`nearestPlaces` measures distance as a share of each place's reach). If two places sound mixed, shrink their reach; the tests in `audio/placeMusic.test.ts` pin which one wins where.

### Adding a place with music

1. Add its kind to `PlaceKind` and give it a reach and gain in `PLACE_TRACKS` (`audio/placeMusic.ts`).
2. Say where it is in `World.musicPlaces` (`world/world.ts`): a landmark's slot (`landmarkSlots.get(...)`) or an object's world position.
3. Add its file under `places` in the manifest, then a row in the table below and a case in `placeMusic.test.ts`.

### Adding an emote's clip

Give the emote a `sound: { file, every }` in `world/emotes.ts`: the file in `client/public/sounds/` and the seconds of one round. Make the emote's clip the same length (Sangreee: both 7 s), so the sound restarts as the move does. A clip longer than `every` is cut there.

## Synth: made in code

| Event | Status | Where | Notes |
|---|---|---|---|
| Crickets (night) | ✅ exists | `sound.ts` `cricket` | Settings → Ambient sounds. |
| Footsteps | ✅ exists | `sound.ts` `footstep` | Yours only, in time with the walk and run clips (`Character.onStep`): a soft low-passed scuff walking, a little firmer with a faint thump running, kept well under everything else. Settings → Footsteps. |
| Chat blip | ✅ exists | `sound.ts` `blip` | Pitch from the speaker's pubkey. |
| Zap coin | ✅ exists | `sound.ts` `coin` | |
| Arrival whoosh | ✅ exists | `sound.ts` `whoosh` | |
| Call ringtone | ✅ exists | `voice/privateCall.ts` `ringTone` | |
| Dance loop (fallback) | ✅ exists | `audio/synthLoops.ts` `dance` | 120 BPM house; the groove clip is timed to it. |
| Dance 2 loop (fallback) | ✅ exists | `audio/synthLoops.ts` `dance2` | 120 BPM funk in D minor, for Dance 2. |
| Workout loop (fallback) | ✅ exists | `audio/synthLoops.ts` `workout` | 128 BPM, for push-ups and jumping jacks. |
| Zen loop (fallback) | ✅ exists | `audio/synthLoops.ts` `zen` | Slow pad, for the lotus pose. |
| Jump / landing | to do | `sound.ts` | A short rising blip and a soft thud, near you only. |
| Door opening | to do | `sound.ts` | A glass slide for HQ and the gym, a wooden creak for La Crypta. |
| Footsteps by surface | to do | `sound.ts` | Grass, cobbles and bridge planks sounding different. |
| Sitting down | to do | `sound.ts` | A soft cushion thump. |
| Mate sip | to do | `sound.ts` | A short bubbly slurp, through a bandpass filter. |
| Campfire crackle | to do | `sound.ts` | Random noise pops plus a low rumble, positional at each ombú fire. |
| Emote chimes | to do | `sound.ts` | A two-note chime for a nod or a "no" (no music). |

## Suno: needs a track

Every track:
- loops seamlessly (the last bar runs into the first) and starts on the beat;
- is instrumental, with no vocals unless the row says so;
- is encoded as in [Adding or replacing a track](#adding-or-replacing-a-track) (44.1 kHz, 112 kbps, −16 LUFS). Full Suno songs (2–4 min, 2–3 MB) are fine: a file only downloads when someone first hears it.

The BPM matters for the dance: the groove animation is two bars at 120 BPM.

| File (`client/public/sounds/`) | manifest key | BPM | Length | Used for | Suno prompt |
|---|---|---|---|---|---|
| `dance.mp3` | `dance` | 120 | 32 bars (64 s) | Dance emote | `Instrumental feel-good disco house loop, 120 BPM, four-on-the-floor kick, funky slap bass, open hi-hats on the offbeat, short string stabs, bright and playful, seamless loop, no vocals, no intro, no outro` |
| `dance2.mp3` | `dance2` | 120 | 32 bars (64 s) | Dance 2 emote | `Instrumental funky nu-disco loop, 120 BPM, four-on-the-floor kick, claps on 2 and 4, syncopated rubbery synth bass in D minor, choppy wah guitar on the offbeats, short brass stabs, groovy and cheeky, seamless loop, no vocals, no intro, no outro` |
| `dance3.mp3` | (future) | 120 | 64 bars (128 s) | A third dance (no emote yet): Dance's rhythm with more going on | `Instrumental disco house loop with lots of variation, 120 BPM, four-on-the-floor kick that never stops, funky slap bass, open hi-hats on the offbeat; every 8 bars something changes: a filtered breakdown with handclaps, a drum fill into a bigger drop, a key lift up a step, a piano riff, a string swell, a cowbell and conga section, a talkbox-style synth lead; playful, bright and surprising, keeps the same groove throughout, seamless loop, no vocals, no intro, no outro` |
| `workout.mp3` | `workout` ✅ | 128 | 2:54 | Push-ups and jumping jacks emotes | `Instrumental high-energy workout electro loop, 128 BPM, punchy kick on every beat, claps on 2 and 4, driving pumping bassline, sixteenth-note hi-hats, motivating gym vibe, seamless loop, no vocals, no build-up, no drop` |
| `zen.mp3` | `zen` ✅ | 60 | 3:44 | Lotus pose emote | `Instrumental calm meditation ambient loop, 60 BPM, warm evolving synth pad, soft singing bowl hits, gentle airy texture, peaceful and spacious, seamless loop, no drums, no vocals` |
| `campfire.mp3` | `places.campfire` ✅ | 90 | 30 s | Every campfire (the logs by the pond, each voice tree's), heard within 5.5 m | `Instrumental acoustic campfire guitar loop, 90 BPM, fingerpicked nylon guitar, soft and warm, a little folk, evening by the fire, seamless loop, no vocals` |
| `cafe.mp3` | (future) | 80 | 60 s | Inside the café | `Instrumental lo-fi café jazz hop loop, 80 BPM, mellow Rhodes chords, brushed drums, warm upright bass, vinyl crackle, cozy coffee shop, seamless loop, no vocals` |
| `parrilla.mp3` | `places.parrilla` ✅ | 96 | 2:52 | The parrilla, heard within 3.5 m (not at the café next door) | `Instrumental Argentine cumbia loop, 96 BPM, güira and congas, accordion melody, bouncy bass, festive Sunday asado mood, seamless loop, no vocals` |
| `lacrypta.mp3` | (future) | 100 | 60 s | Inside La Crypta | `Instrumental retro synthwave loop, 100 BPM, analog arpeggios, gated reverb snare, warm bass, hacker lounge at night, seamless loop, no vocals` |
| `gym.mp3` | (future) | 130 | 60 s | Inside the gym | `Instrumental gym hip-hop beat loop, 130 BPM, hard-hitting drums, deep 808 bass, confident and energetic, seamless loop, no vocals` |
| `plaza-day.mp3` | (future) | 100 | 90 s | The plaza by day, very quiet | `Instrumental cheerful village theme loop, 100 BPM, ukulele, glockenspiel, light hand percussion, sunny floating island in the sky, seamless loop, no vocals` |
| `night.mp3` | (future) | 70 | 90 s | The village at night, very quiet | `Instrumental gentle night lullaby loop, 70 BPM, soft piano and music box, warm pad, starry sky over a floating island, seamless loop, no vocals` |

Rows marked ✅ are in `client/public/sounds/` (masters in `_dl/sounds/`). Music at a place plays only at the nearest place in reach, crossfading as you walk between them, so places never mix; where it is in the track comes from the wall clock, so everyone there hears the same bar.

Rows marked "(future)" have no player yet: each would become a place (see [Adding a place with music](#adding-a-place-with-music)) or an emote's track.

## Clips: emote sounds

An emote with a `sound` (`world/emotes.ts`) plays that file in rounds, in time with its clip, from where the person stands; it fades out by 25 m. Someone who walks up halfway through hears it from that point on. People doing it in step are one sound. It follows the Sound switch, not Emote music.

| File (`client/public/sounds/`) | Emote | Length | Notes |
|---|---|---|---|
| `sangre.mp3` | Sangreee... | 7 s | The Capusotto clip (master in `_dl/sounds/`), mono 96 kbps, normalised to −16 LUFS. One round of the emote lasts as long as the clip; it repeats until you move. |
