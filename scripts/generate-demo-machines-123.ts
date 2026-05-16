/**
 * Génère public/demo-machines-123.json — 123 machines fictives avec champs inventaire remplis.
 * Exécution : npm run generate:demo-machines
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const brands = ['Juki', 'Brother', 'Pfaff', 'Pegasus', 'Siruba', 'Yamato', 'Durkopp Adler', 'Typical', 'Kingtex', 'Mitsubishi'];
const classes = ['301', '514', '504', '516', '602', '316', '402', '101', '304', '107'];
const categories = [
  'Piqueuse plate',
  'Surjeteuse 4 fils',
  'Surjeteuse 5 fils',
  'Surjeteuse 3 fils',
  'Colleteuse',
  'Double aiguille',
  'Chainette',
  'Point invisible',
];

function isoDate(y: number, m: number, d: number) {
  const mm = Math.min(12, Math.max(1, m));
  const dd = Math.min(28, Math.max(1, d));
  return `${y}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

type DemoMachine = {
  id: string;
  name: string;
  classe: string;
  speed: number;
  speedMajor: number;
  cofs: number;
  active: boolean;
  matricule: string;
  brand: string;
  machineCategory: string;
  purchaseDate: string;
  purchaseCondition: 'NEW' | 'USED';
  status: 'OK' | 'PANNE' | 'MAINT';
};

const fleet: DemoMachine[] = [];
const baseYear = 2019;

for (let i = 0; i < 123; i++) {
  const status: DemoMachine['status'] = i % 23 === 0 ? 'PANNE' : i % 31 === 0 ? 'MAINT' : 'OK';
  fleet.push({
    id: `demo-m123-${i + 1}`,
    name: `Machine démo ${i + 1}`,
    classe: classes[i % classes.length],
    speed: 3800 + (i % 20) * 25,
    speedMajor: 4000,
    cofs: 1,
    active: i % 19 !== 0,
    matricule: `AT-${baseYear}-${String(i + 1).padStart(4, '0')}`,
    brand: brands[i % brands.length],
    machineCategory: categories[i % categories.length],
    purchaseDate: isoDate(baseYear + (i % 6), 1 + (i % 12), 1 + (i % 27)),
    purchaseCondition: i % 4 === 0 ? 'USED' : 'NEW',
    status,
  });
}

const out = path.join(__dirname, '..', 'public', 'demo-machines-123.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(fleet, null, 0), 'utf8');
console.log('OK:', out, fleet.length, 'machines');
