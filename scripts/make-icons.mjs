// Sky's own icons, drawn from client/public/brand/sky-mark-flat.svg (the
// cloud with the Obelisk on a sky tile): favicon.ico, the PWA icons and the
// apple-touch icon. Run by `npm run vendor` after copy-brand.
//
//   node scripts/make-icons.mjs

import sharp from 'sharp';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';

const OUT = 'client/public';
const svg = readFileSync(`${OUT}/brand/sky-mark-flat.svg`);
const png = (size) => sharp(svg, { density: Math.max(72, (72 * size) / 512 * 4) }).resize(size, size).png().toBuffer();

for (const size of [192, 512]) writeFileSync(`${OUT}/icon-${size}.png`, await png(size));
// Maskable icons are cropped to a circle: keep the mark inside the safe 80%.
const tile = readFileSync(`${OUT}/brand/sky-mark-flat.svg`, 'utf8');
const bleed = tile.replace('rx="112"', 'rx="0"').replace('<g transform="translate(256 262) scale(1.0)', '<g transform="translate(256 262) scale(0.8)');
writeFileSync(`${OUT}/icon-maskable-512.png`, await sharp(Buffer.from(bleed), { density: 288 }).resize(512, 512).png().toBuffer());
// iOS rounds the corners itself.
writeFileSync(`${OUT}/apple-touch-icon.png`, await sharp(Buffer.from(tile.replace('rx="112"', 'rx="0"')), { density: 288 }).resize(180, 180).png().toBuffer());

// favicon.ico: PNG-compressed entries (16, 32, 48), which every browser reads.
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map(png));
const head = Buffer.alloc(6 + 16 * sizes.length);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
let offset = head.length;
sizes.forEach((s, i) => {
  const e = 6 + 16 * i;
  head.writeUInt8(s, e); head.writeUInt8(s, e + 1); head.writeUInt8(0, e + 2); head.writeUInt8(0, e + 3);
  head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
  head.writeUInt32LE(images[i].length, e + 8); head.writeUInt32LE(offset, e + 12);
  offset += images[i].length;
});
writeFileSync(`${OUT}/favicon.ico`, Buffer.concat([head, ...images]));
rmSync(`${OUT}/obelisk-favicon.png`, { force: true });
console.log('wrote favicon.ico, icon-192/512, icon-maskable-512, apple-touch-icon');
