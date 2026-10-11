// The link preview card (Open Graph / Twitter): a render of the village with
// the title on a dark band. Input: a 1200×630 screenshot of the island with
// the UI hidden; output: client/public/og.jpg.
//
//   node scripts/make-og.mjs <screenshot.png>

import sharp from 'sharp';

const src = process.argv[2];
if (!src) throw new Error('usage: node scripts/make-og.mjs <screenshot.png>');
const mark = 'M 256,16 L 291.71,61.58 L 311.61,464 L 200.39,464 L 220.29,61.58 Z M 251.04,37.85 L 230.28,64.27 L 210.53,454.57 L 251.04,454.57 Z';
const svg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#0a0a0a" stop-opacity="0.92"/>
      <stop offset="0.45" stop-color="#0a0a0a" stop-opacity="0.8"/>
      <stop offset="0.7" stop-color="#0a0a0a" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <g transform="translate(64,150) scale(0.2)" fill="#b4f953" fill-rule="evenodd"><path d="${mark}"/></g>
  <text x="64" y="300" font-family="Inter, DejaVu Sans, sans-serif" font-size="78" font-weight="800" fill="#fafafa">Obelisk <tspan fill="#b4f953">Sky</tspan></text>
  <text x="66" y="356" font-family="Inter, DejaVu Sans, sans-serif" font-size="30" font-weight="600" fill="#e5e5e5">Walk into Nostr conversations.</text>
  <text x="66" y="398" font-family="Inter, DejaVu Sans, sans-serif" font-size="24" fill="#a3a3a3">A 3D village of Obelisk channels:</text>
  <text x="66" y="430" font-family="Inter, DejaVu Sans, sans-serif" font-size="24" fill="#a3a3a3">chat, calls, games and mate.</text>
  <text x="66" y="566" font-family="Inter, DejaVu Sans, sans-serif" font-size="24" font-weight="700" fill="#b4f953">sky.obelisk.ar</text>
</svg>`;
await sharp(src).resize(1200, 630, { fit: 'cover' })
  .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
  .jpeg({ quality: 86, mozjpeg: true })
  .toFile('client/public/og.jpg');
console.log('wrote client/public/og.jpg');
