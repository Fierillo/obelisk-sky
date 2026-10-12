# Sky's sounds

This page lists every sound the village makes or could make, and where each one comes from.

- **Synth:** made in the browser with WebAudio (`client/src/sound.ts`, `client/src/audio/synthLoops.ts`). There's no file to add; a developer writes these in code.
- **Suno:** needs a recorded track. Generate it on suno.com with the prompt below, then:
  1. Trim it to a seamless loop.
  2. Save it under `client/public/sounds/` with the file name given in the table.
  3. Name the file in `client/public/sounds/manifest.json`, under `tracks`.

  Until a track exists, the synth loop plays in its place.

All sound is off until the viewer turns it on (Settings → Sound). Under it, Ambient sounds, Footsteps and Emote music each have their own switch. Emote music is heard only near the people playing it (`audio/emoteMusic.ts`):
- Dancers within 6 m share one loop, and the first dancer's music wins.
- A loop fades out by 25 m.
- At most the two nearest groups play.
- Every loop starts on a bar grid kept by the wall clock, so two groups in earshot, and the same group on two screens, keep the same beat; the synced dances move to it.

## Synth: made in code

| Event | Status | Where | Notes |
|---|---|---|---|
| Crickets (night) | ✅ exists | `sound.ts` `cricket` | Settings → Ambient sounds. |
| Footsteps | ✅ exists | `sound.ts` `footstep` | Yours only, in time with the walk and run clips (`Character.onStep`): a soft scuff walking, a harder slap and thud running. Settings → Footsteps. |
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
- loops seamlessly (the last bar runs into the first);
- is instrumental, with no vocals unless the row says so;
- uses 44.1 kHz stereo, encoded as MP3 at 160 kbps;
- runs 30 to 60 s, so the file stays under about 1 MB.

The BPM matters for the dance: the groove animation is two bars at 120 BPM.

| File (`client/public/sounds/`) | manifest key | BPM | Length | Used for | Suno prompt |
|---|---|---|---|---|---|
| `dance.mp3` | `dance` | 120 | 32 bars (64 s) | Dance emote | `Instrumental feel-good disco house loop, 120 BPM, four-on-the-floor kick, funky slap bass, open hi-hats on the offbeat, short string stabs, bright and playful, seamless loop, no vocals, no intro, no outro` |
| `dance2.mp3` | `dance2` | 120 | 32 bars (64 s) | Dance 2 emote | `Instrumental funky nu-disco loop, 120 BPM, four-on-the-floor kick, claps on 2 and 4, syncopated rubbery synth bass in D minor, choppy wah guitar on the offbeats, short brass stabs, groovy and cheeky, seamless loop, no vocals, no intro, no outro` |
| `dance3.mp3` | (future) | 120 | 64 bars (128 s) | A third dance (no emote yet): Dance's rhythm with more going on | `Instrumental disco house loop with lots of variation, 120 BPM, four-on-the-floor kick that never stops, funky slap bass, open hi-hats on the offbeat; every 8 bars something changes: a filtered breakdown with handclaps, a drum fill into a bigger drop, a key lift up a step, a piano riff, a string swell, a cowbell and conga section, a talkbox-style synth lead; playful, bright and surprising, keeps the same groove throughout, seamless loop, no vocals, no intro, no outro` |
| `workout.mp3` | `workout` ✅ | 128 | 2:54 | Push-ups and jumping jacks emotes | `Instrumental high-energy workout electro loop, 128 BPM, punchy kick on every beat, claps on 2 and 4, driving pumping bassline, sixteenth-note hi-hats, motivating gym vibe, seamless loop, no vocals, no build-up, no drop` |
| `zen.mp3` | `zen` ✅ | 60 | 3:44 | Lotus pose emote | `Instrumental calm meditation ambient loop, 60 BPM, warm evolving synth pad, soft singing bowl hits, gentle airy texture, peaceful and spacious, seamless loop, no drums, no vocals` |
| `campfire.mp3` | `places.campfire` ✅ | 90 | 30 s | Every campfire (the logs by the pond, each voice tree's), heard within 11 m | `Instrumental acoustic campfire guitar loop, 90 BPM, fingerpicked nylon guitar, soft and warm, a little folk, evening by the fire, seamless loop, no vocals` |
| `cafe.mp3` | (future) | 80 | 60 s | Inside the café | `Instrumental lo-fi café jazz hop loop, 80 BPM, mellow Rhodes chords, brushed drums, warm upright bass, vinyl crackle, cozy coffee shop, seamless loop, no vocals` |
| `parrilla.mp3` | `places.parrilla` ✅ | 96 | 2:52 | The parrilla, heard within 16 m | `Instrumental Argentine cumbia loop, 96 BPM, güira and congas, accordion melody, bouncy bass, festive Sunday asado mood, seamless loop, no vocals` |
| `lacrypta.mp3` | (future) | 100 | 60 s | Inside La Crypta | `Instrumental retro synthwave loop, 100 BPM, analog arpeggios, gated reverb snare, warm bass, hacker lounge at night, seamless loop, no vocals` |
| `gym.mp3` | (future) | 130 | 60 s | Inside the gym | `Instrumental gym hip-hop beat loop, 130 BPM, hard-hitting drums, deep 808 bass, confident and energetic, seamless loop, no vocals` |
| `plaza-day.mp3` | (future) | 100 | 90 s | The plaza by day, very quiet | `Instrumental cheerful village theme loop, 100 BPM, ukulele, glockenspiel, light hand percussion, sunny floating island in the sky, seamless loop, no vocals` |
| `night.mp3` | (future) | 70 | 90 s | The village at night, very quiet | `Instrumental gentle night lullaby loop, 70 BPM, soft piano and music box, warm pad, starry sky over a floating island, seamless loop, no vocals` |

## Clips: emote sounds

An emote with a `sound` (`world/emotes.ts`) plays that file in rounds, in time with its clip, from where the person stands; it fades out by 25 m. Someone who walks up halfway through hears it from that point on. People doing it in step are one sound. It follows the Sound switch, not Emote music.

| File (`client/public/sounds/`) | Emote | Length | Notes |
|---|---|---|---|
| `sangre.mp3` | Sangreee... | 7 s | The Capusotto clip (master in `_dl/sounds/`), mono 96 kbps, normalised to −16 LUFS. One round of the emote lasts as long as the clip; it repeats until you move. |

Rows marked ✅ are in: music at a place (`audio/placeMusic.ts`, Settings → Music at places) sounds from the nearest place playing that track, so two campfires never play two guitars at once, and where it is in the track comes from the wall clock, so everyone there hears the same bar. They're named under `places` in `manifest.json`; the masters are in `_dl/sounds/`.

Rows marked "(future)" have no player yet. Each one would get a positional source at its place, like the emote music, and a key in `manifest.json` once it exists.
