// Génère build/icon.ico (256px) depuis electron/build/icon.svg.
// Outils prebuilt (pas de compilation): @resvg/resvg-js + png-to-ico.
//   node scripts/make-icon.mjs
import { Resvg } from '@resvg/resvg-js';
import pngToIco from 'png-to-ico';
import fs from 'fs';

const svg = fs.readFileSync('electron/build/icon.svg');
const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 256 } });
const png = resvg.render().asPng();

fs.mkdirSync('build', { recursive: true });
fs.writeFileSync('build/icon-256.png', png);

const ico = await pngToIco(['build/icon-256.png']);
fs.writeFileSync('build/icon.ico', ico);

console.log('✓ build/icon.ico —', fs.statSync('build/icon.ico').size, 'bytes');
console.log('✓ build/icon-256.png —', png.length, 'bytes');
