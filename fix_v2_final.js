const fs = require('fs');
const path = require('path');

const GARBLED_CP1252 = new Set([
  0x20AC, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021, 0x02C6,
  0x2030, 0x0160, 0x2039, 0x0152, 0x017D, 0x2018, 0x2019, 0x201C,
  0x201D, 0x2022, 0x2013, 0x2014, 0x02DC, 0x2122, 0x0161, 0x203A,
  0x0153, 0x0178
]);

const CP1252_REVERSE = {
  0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84,
  0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88,
  0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C,
  0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93,
  0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B,
  0x0153: 0x9C, 0x0178: 0x9F
};

function isGarbled(ch) {
  const cp = ch.charCodeAt(0);
  if (cp >= 0x80 && cp <= 0xFF) return true;
  if (GARBLED_CP1252.has(cp)) return true;
  return false;
}

function toByte(ch) {
  const cp = ch.charCodeAt(0);
  if (cp >= 0x80 && cp <= 0xFF) return cp;
  if (CP1252_REVERSE[cp] !== undefined) return CP1252_REVERSE[cp];
  return null;
}

function fixContent(content) {
  const out = [];
  let i = 0;
  while (i < content.length) {
    if (!isGarbled(content[i])) { out.push(content[i]); i++; continue; }
    const start = i;
    while (i < content.length && isGarbled(content[i])) i++;
    const len = i - start;
    if (len < 2) { out.push(content[start]); continue; }
    const bytes = [];
    for (let j = start; j < i; j++) {
      const b = toByte(content[j]);
      if (b !== null) bytes.push(b);
    }
    if (bytes.length >= 2) {
      const d = Buffer.from(bytes).toString('utf-8');
      if (!d.includes('\uFFFD')) { out.push(d); continue; }
    }
    out.push(content.substring(start, i));
  }
  return out.join('');
}

function hasGarbled(content) {
  let count = 0;
  let i = 0;
  while (i < content.length) {
    if (isGarbled(content[i])) {
      count++;
      if (count >= 2) return true;
      i++;
      while (i < content.length && isGarbled(content[i])) { count++; i++; }
    } else i++;
  }
  return false;
}

let totalChecked = 0, totalFixed = 0;

function processFile(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    const original = buf.toString('utf-8');
    if (!hasGarbled(original)) return;
    const fixed = fixContent(original);
    if (fixed === original) return;
    if (fixed.includes('\uFFFD')) { return; }
    fs.writeFileSync(filePath, fixed, 'utf-8');
    totalFixed++;
    process.stdout.write('.');
  } catch (e) {
    console.error(`\nERROR ${filePath}: ${e.message}`);
  }
}

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') walk(full);
    else if (e.isFile() && /\.(ts|tsx)$/i.test(e.name)) { totalChecked++; processFile(full); }
  }
}

console.log('Fixing encoding...');
for (const d of ['components', 'app', 'lib', 'src', 'server']) walk(d);
console.log(`\n\nChecked: ${totalChecked}, Fixed: ${totalFixed}`);
