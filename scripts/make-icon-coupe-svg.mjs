// Génère l'icône BERACOUPE à partir de la source vectorielle
// electron/build/beracoupe.svg — même pipeline que scripts/make-icon.mjs
// (BERAMETHODE) : @resvg/resvg-js pour le rendu SVG→PNG, png-to-ico pour le
// conteneur .ico. Ni l'un ni l'autre n'est dans node_modules sur cette
// machine (vérifié : aucun des deux n'est listé dans package.json ni
// présent sur disque) — installer une fois, sans le committer :
//
//   npm install --no-save @resvg/resvg-js png-to-ico
//   node scripts/make-icon-coupe-svg.mjs
//
// Pour changer le dessin : éditer electron/build/beracoupe.svg (viewBox
// 0 0 500 500, marque seule, fond transparent) puis relancer cette commande.
// En attendant l'installation de ces deux paquets, scripts/make-icon-coupe.mjs
// (zéro dépendance) produit un résultat immédiat mais NE LIT PAS ce fichier
// SVG — son dessin est codé en dur en JS. Une fois les paquets installés,
// ce script-ci devient la source de vérité et peut remplacer l'autre.
import { Resvg } from '@resvg/resvg-js';
import pngToIco from 'png-to-ico';
import fs from 'fs';

// 1) Rendre la marque BERACOUPE sur fond transparent, haute déf.
const markSvg = fs.readFileSync('electron/build/beracoupe.svg');
const mark = new Resvg(markSvg, {
  fitTo: { mode: 'width', value: 384 },
  background: 'rgba(0,0,0,0)',
}).render().asPng();
const markB64 = Buffer.from(mark).toString('base64');

// 2) Composer un carré arrondi blanc (coins ~22 %) + marque centrée avec marge
//    (même composition que make-icon.mjs pour BERAMETHODE).
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
fs.writeFileSync('build/icon-coupe-256.png', finalPng);

const ico = await pngToIco(['build/icon-coupe-256.png']);
fs.writeFileSync('build/icon-coupe.ico', ico);

// 3) Copier aussi à côté de electron/main.js : c'est de là que main.ts lit
//    l'icône de fenêtre en runtime (electron/icon-coupe.{ico,png}), séparément
//    de build/icon-coupe.ico qui sert uniquement à electron-builder (win.icon).
fs.writeFileSync('electron/icon-coupe.png', finalPng);
fs.writeFileSync('electron/icon-coupe.ico', ico);

console.log('✓ build/icon-coupe.ico —', fs.statSync('build/icon-coupe.ico').size, 'bytes');
console.log('✓ build/icon-coupe-256.png —', fs.statSync('build/icon-coupe-256.png').size, 'bytes');
console.log('✓ electron/icon-coupe.ico + electron/icon-coupe.png copiés.');
