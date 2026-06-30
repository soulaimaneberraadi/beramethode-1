// Génère build/icon.ico (style app moderne : carré à coins arrondis + marque).
// Outils prebuilt (pas de compilation): @resvg/resvg-js + png-to-ico.
//   node scripts/make-icon.mjs
import { Resvg } from '@resvg/resvg-js';
import pngToIco from 'png-to-ico';
import fs from 'fs';

// 1) Rendre la marque BERAMETHODE (A vert + B noir) sur fond transparent, haute déf.
const markSvg = fs.readFileSync('electron/build/icon.svg');
const mark = new Resvg(markSvg, {
  fitTo: { mode: 'width', value: 384 },
  background: 'rgba(0,0,0,0)',
}).render().asPng();
const markB64 = Buffer.from(mark).toString('base64');

// 2) Composer un carré arrondi blanc (coins ~22 %) + marque centrée avec marge.
//    Fond blanc → le "B" noir reste visible (sur fond sombre il disparaîtrait).
const ICON = `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#f1f5f9"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="116" ry="116" fill="url(#bg)"/>
  <image x="64" y="64" width="384" height="384" href="data:image/png;base64,${markB64}"/>
</svg>`;

const finalPng = new Resvg(ICON, { fitTo: { mode: 'width', value: 256 } }).render().asPng();

fs.mkdirSync('build', { recursive: true });
fs.writeFileSync('build/icon-256.png', finalPng);

const ico = await pngToIco(['build/icon-256.png']);
fs.writeFileSync('build/icon.ico', ico);

console.log('✓ build/icon.ico —', fs.statSync('build/icon.ico').size, 'bytes');
