# Obelisk Sky: sound theme

What the village should sound like, as a brief for producing the audio later.
Today everything is synthesized in `client/src/sound.ts` (wind, birds,
crickets, a blip per message, a coin for zaps, a whoosh on arrival). The
pieces below would replace or join those as files.

**The feel:** a small floating village above the clouds. It's warm, unhurried
and a little magical, and it's Argentine: mate on a bench, a parrilla going,
folk guitar in the distance. Never busy or loud. People leave it on for hours
while they chat, so nothing may grate on the tenth hearing.

**Rules for every piece**
- Music loops seamlessly (the end crossfades into the start) and has no
  vocals with words. Humming and "la-la" are fine, rarely.
- Format: OGG/Opus, 48 kHz, stereo for music and ambience, mono for one-shots
  (they get positioned in 3D). Normalize music to about −20 LUFS, ambience to
  −26 LUFS and one-shots to peak at −6 dBFS.
- One-shots are short (under 1.5 s unless noted) and have a soft attack: no
  clicks.
- Music crossfades by time of day (day, dusk, night) over about 20 s.

## Music (looping beds)

| # | File | Length | Plays | Description |
|---|------|--------|-------|-------------|
| M1 | `music-day.ogg` | 2:30–3:00 | Daytime, anywhere | Sunny and easy. Nylon-string guitar picking over a soft chacarera/zamba lilt in 6/8, about 84 BPM. Light bombo legüero on the off-beats, a charango answering the guitar now and then, a warm upright bass. Major key, no hurry, like a Sunday morning in the yard. |
| M2 | `music-dusk.ogg` | 2:30–3:00 | Sunset | The day theme slowed to about 72 BPM and moved to the relative minor. A bandoneón takes the melody, long breathing notes, and the guitar thins out to chords. Golden-hour nostalgia without sadness. |
| M3 | `music-night.ogg` | 3:00–4:00 | Night | Sparse and dreamy. Solo guitar harmonics and a soft Rhodes or celesta, slow pads underneath like clouds moving, a single far-off bandoneón phrase every minute or so. About 60 BPM, lots of space. It should sit under the crickets, not over them. |
| M4 | `music-plaza.ogg` | 1:30–2:00 | Near the obelisk (blends with M1–M3) | Same key and tempo as the current time-of-day bed, so it can be layered: a gentle shimmering motif (glass bells, a soft lime-coloured synth arpeggio) that hints at the Obelisk mark. |
| M5 | `music-parrilla.ogg` | 1:30–2:00 | Within ~6 m of the parrilla, evenings | A tiny folk combo heard from a radio: guitar strumming a zamba, a bit of lo-fi crackle, mono and band-limited as if from a small speaker. |
| M6 | `music-gym.ogg` | 1:30–2:00 | Inside the gym | Upbeat but not aggressive: a muted electronic beat around 120 BPM with a cumbia-style güira shuffle, a bass line and a simple lime-bright synth hook. Low-passed when you stand outside the glass. |
| M7 | `music-arcade.ogg` | 1:00–1:30 | Near the arcade cabinets | 8-bit chiptune version of the day theme's melody, square waves and noise drums, about 140 BPM. |
| M8 | `music-lacrypta.ogg` | 2:00 | Inside La Crypta | A cosy living room: lo-fi hip-hop, about 80 BPM, warm vinyl texture, a jazzy Rhodes and a soft kick. Hackers working late. |
| M9 | `music-liberture.ogg` | 2:00 | Near the Liberture house | Meditative and bright: a slow pad, a soft handpan or kalimba pattern, a gentle rising feeling, about 70 BPM. It suits the lotus pose. |
| M10 | `music-intro.ogg` | 0:12–0:15, not looped | The loading screen's swing down into the village | A rising swell: wind, a harp or guitar glissando, and the day theme's first phrase landing as the camera arrives. |

## Ambience (looping layers)

| # | File | Length | Plays | Description |
|---|------|--------|-------|-------------|
| A1 | `amb-wind.ogg` | 1:00 | Always, louder at the island's edge | Soft high-altitude wind, airy with no howling. It should feel like being above the clouds. |
| A2 | `amb-birds-day.ogg` | 1:30 | Day | Distant songbirds: horneros, benteveos, a chingolo. Sparse, no single loud bird. |
| A3 | `amb-crickets-night.ogg` | 1:30 | Night | Crickets and the odd frog near the pond, steady and low. |
| A4 | `amb-river.ogg` | 0:45 | Near the river and the mill | Gentle flowing water over stones. |
| A5 | `amb-waterfall.ogg` | 0:45 | Near the waterfall at the rim | Soft, distant falling water: white noise with body. |
| A6 | `amb-mill.ogg` | 0:30 | Near the watermill | A slow wooden wheel creaking, with water dripping off the paddles. |
| A7 | `amb-campfire.ogg` | 0:40 | Near a voice tree's campfire | Crackling wood, the occasional pop, a soft roar. |
| A8 | `amb-parrilla.ogg` | 0:40 | Near the parrilla | Meat sizzling on the grill, the brasero crackling, now and then the scrape of the coals being raked. |
| A9 | `amb-cafe.ogg` | 0:40 | Near and inside the café | Cups on saucers, a milk steamer now and then, low murmur. |
| A10 | `amb-crowd.ogg` | 0:40 | Grows with the number of people nearby | Indistinct friendly murmur in Spanish and English, no words you could pick out. |

## One-shots (events)

| # | File | Triggers | Description |
|---|------|----------|-------------|
| S1 | `sfx-message.ogg` | A message arrives (pitch shifted per speaker, as today) | A soft wooden "tok" or marimba pluck, very short. |
| S2 | `sfx-mention.ogg` | Someone mentions or replies to you | Two rising notes on a glockenspiel, friendly. |
| S3 | `sfx-zap-throw.ogg` | A zap leaves the sender | A quick electric "zip" with a rising pitch. |
| S4 | `sfx-zap-land.ogg` | A zap lands (bigger zaps layer S5) | A bright coin shimmer with a small thunder-crack tail. |
| S5 | `sfx-coins.ogg` | Big zaps (10k sats and up) | A cascade of coins hitting cobbles. |
| S6 | `sfx-reaction.ogg` | A reaction pops over someone | A tiny bubble pop. |
| S7 | `sfx-arrive-balloon.ogg` | Someone arrives by balloon | A burner puff, then a soft landing thump. |
| S8 | `sfx-arrive-door.ogg` | Someone steps out of a house | A wooden door opening and closing. |
| S9 | `sfx-footstep-grass-[1-4].ogg` | Your steps on grass | Soft, four variations. |
| S10 | `sfx-footstep-stone-[1-4].ogg` | Paths, the plaza, the bridges | Four variations. |
| S11 | `sfx-footstep-wood-[1-4].ogg` | Floors inside, the bridges' planks | Four variations. |
| S12 | `sfx-jump.ogg` / `sfx-land.ogg` | Jump and landing | A small cloth whoosh, then a soft thud. |
| S13 | `sfx-sit.ogg` | Sitting on a bench or sofa | Wood creak, or a cushion puff for sofas. |
| S14 | `sfx-mate-sip.ogg` | Someone sips the mate | The bombilla's gurgle at the bottom of the gourd, the unmistakable one. |
| S15 | `sfx-mate-pour.ogg` | The cebador refills the mate | Hot water poured from a termo. |
| S16 | `sfx-door-glass.ogg` | The gym's sliding door | A smooth glass slide. |
| S17 | `sfx-gym-rep.ogg` | A rep in the gym | A barbell clank, light. |
| S18 | `sfx-pullup.ogg` | A rep on the park bars | A soft metallic grip squeak. |
| S19 | `sfx-call-join.ogg` / `sfx-call-leave.ogg` | Joining or leaving a voice call | Two-note up and down chimes. |
| S20 | `sfx-ui-open.ogg` / `sfx-ui-close.ogg` | Panels opening and closing | Paper-light swishes. |
| S21 | `sfx-nostrich.ogg` | A nostrich nearby (rare) | A goofy short honk-chirp. |
| S22 | `sfx-dance-start.ogg` | Someone starts dancing | A short guitar strum flourish. |
| S23 | `sfx-lotus.ogg` | Someone sits in the lotus pose | A single singing-bowl tone, 3–4 s decay. |
| S24 | `sfx-firework.ogg` | Celebrations (a big zap, a game won) | A soft distant firework pop and crackle. |

## Mixing notes

- Music sits about 6 dB under ambience near its source and fades out with
  distance, so walking around the island feels like walking between places.
- Ambience layers are positional (WebAudio panners), with rolloff over
  roughly 4–8 m.
- At night everything is about 3 dB quieter except the crickets and the
  campfire.
- A mute key and the existing volume slider control everything. The default
  stays muted until the viewer opts in, as today.
