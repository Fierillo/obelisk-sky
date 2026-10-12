// Small painted signs shared by the landmarks: the canvas helper, and the
// "Bitcoin accepted here" plate on the café, the parrilla, the gym and the
// Liberture house (drawn here, after the classic sticker: the orange coin
// with its ₿ above the words).

import * as THREE from 'three';

/** A canvas texture; tests run without a 2D context, so drawing is skipped there. */
export function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  let g: CanvasRenderingContext2D | null = null;
  try { g = c.getContext('2d'); } catch { /* no canvas (tests) */ }
  if (g) draw(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export const BITCOIN_ORANGE = '#f7931a';

/** Paint the plate: white card, orange coin with a white ₿, the words under it. */
export function drawBitcoinAccepted(g: CanvasRenderingContext2D, w: number, h: number): void {
  const r = Math.min(w, h) * 0.06;
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.roundRect(0, 0, w, h, r);
  g.fill();
  g.strokeStyle = BITCOIN_ORANGE;
  g.lineWidth = w * 0.025;
  g.beginPath();
  g.roundRect(w * 0.03, w * 0.03, w * 0.94, h - w * 0.06, r * 0.7);
  g.stroke();
  // The coin, tilted like the logo.
  const cx = w / 2, cy = h * 0.38, cr = Math.min(w * 0.3, h * 0.27);
  g.fillStyle = BITCOIN_ORANGE;
  g.beginPath();
  g.arc(cx, cy, cr, 0, Math.PI * 2);
  g.fill();
  g.save();
  g.translate(cx, cy);
  g.rotate(0.24);
  g.fillStyle = '#ffffff';
  g.font = `900 ${Math.round(cr * 1.45)}px Arial, Helvetica, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('₿', 0, cr * 0.06);
  g.restore();
  // The words.
  g.fillStyle = '#4d4d4d';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `800 ${Math.round(h * 0.1)}px Arial, Helvetica, sans-serif`;
  g.fillText('BITCOIN', cx, h * 0.76);
  g.font = `700 ${Math.round(h * 0.075)}px Arial, Helvetica, sans-serif`;
  g.fillText('ACCEPTED HERE', cx, h * 0.87);
}

let plate: { geo: THREE.PlaneGeometry; mat: THREE.MeshStandardMaterial } | null = null;

/** A "Bitcoin accepted here" plate, 0.2 wide, facing +z; every landmark
 *  shares one geometry, material and texture. */
export function bitcoinSign(): THREE.Mesh {
  if (!plate) {
    const map = canvasTexture(256, 320, (g) => drawBitcoinAccepted(g, 256, 320));
    map.anisotropy = 4;
    plate = {
      geo: new THREE.PlaneGeometry(0.2, 0.25),
      // Lit like the wall it hangs on, with a faint glow so it still reads at night.
      mat: new THREE.MeshStandardMaterial({ map, roughness: 0.55, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.18 }),
    };
  }
  const m = new THREE.Mesh(plate.geo, plate.mat);
  m.name = 'bitcoin-sign';
  return m;
}
