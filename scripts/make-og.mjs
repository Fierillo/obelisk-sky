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
  .replace('<svg ', '<svg x="40" y="96" width="150" height="150" ');
const svg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#cfeaff" stop-opacity="0.96"/>
      <stop offset="0.42" stop-color="#cfeaff" stop-opacity="0.86"/>
      <stop offset="0.66" stop-color="#cfeaff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  ${markSvg}
  <text x="64" y="320" font-family="Inter, DejaVu Sans, sans-serif" font-size="78" font-weight="800" fill="#0f2a44">Obelisk <tspan fill="#3f7f12">Sky</tspan></text>
  <text x="66" y="376" font-family="Inter, DejaVu Sans, sans-serif" font-size="30" font-weight="600" fill="#0f2a44">Walk into Nostr conversations.</text>
  <text x="66" y="418" font-family="Inter, DejaVu Sans, sans-serif" font-size="24" fill="#4b6a88">A 3D village of Obelisk channels:</text>
  <text x="66" y="450" font-family="Inter, DejaVu Sans, sans-serif" font-size="24" fill="#4b6a88">chat, calls, games and mate.</text>
  <text x="66" y="566" font-family="Inter, DejaVu Sans, sans-serif" font-size="24" font-weight="700" fill="#3f7f12">sky.obelisk.ar</text>
</svg>`;
await sharp(src).resize(1200, 630, { fit: 'cover' })
  .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
  .jpeg({ quality: 86, mozjpeg: true })
  .toFile('client/public/og.jpg');
console.log('wrote client/public/og.jpg');
