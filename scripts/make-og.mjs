// The link preview card (Open Graph / Twitter): a render of the village with
// the cloud-and-Obelisk mark and the title on a sky band. Input: a 1200×630 screenshot of the island with
// the UI hidden; output: client/public/og.jpg.
//
//   node scripts/make-og.mjs <screenshot.png>

import sharp from 'sharp';
import { readFileSync } from 'node:fs';

const src = process.argv[2];
if (!src) throw new Error('usage: node scripts/make-og.mjs <screenshot.png>');
// The cloud with the Obelisk (client/public/brand/sky-mark.svg), inlined.
const markSvg = readFileSync('client/public/brand/sky-mark.svg', 'utf8')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace('<svg ', '<svg x="540" y="58" width="120" height="120" ');
// Everything that must be read sits in the middle 630×630: WhatsApp (and
// other small previews) crop a wide card to a centred square, and a card
// laid out from the left lost its title there. The island shows either side.
const T = 'font-family="Inter, DejaVu Sans, sans-serif" text-anchor="middle"';
const svg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0.12" stop-color="#cfeaff" stop-opacity="0"/>
      <stop offset="0.3" stop-color="#cfeaff" stop-opacity="0.88"/>
      <stop offset="0.7" stop-color="#cfeaff" stop-opacity="0.88"/>
      <stop offset="0.88" stop-color="#cfeaff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  ${markSvg}
  <text x="600" y="280" ${T} font-size="76" font-weight="800" fill="#0f2a44">Obelisk <tspan fill="#3f7f12">Sky</tspan></text>
  <text x="600" y="338" ${T} font-size="30" font-weight="600" fill="#0f2a44">Walk into Nostr conversations.</text>
  <text x="600" y="388" ${T} font-size="24" fill="#4b6a88">A 3D village of Obelisk channels:</text>
  <text x="600" y="420" ${T} font-size="24" fill="#4b6a88">chat, calls, games and mate.</text>
  <text x="600" y="540" ${T} font-size="26" font-weight="700" fill="#3f7f12">sky.obelisk.ar</text>
</svg>`;
await sharp(src).resize(1200, 630, { fit: 'cover' })
  .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
  .jpeg({ quality: 86, mozjpeg: true })
  .toFile('client/public/og.jpg');
console.log('wrote client/public/og.jpg');
