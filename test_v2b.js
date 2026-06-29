const fs = require('fs');

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

const fp = 'components/ThreadCalculator.tsx';
const b = fs.readFileSync(fp);
const c = b.toString('utf-8');
const fixed = fixContent(c);

// Check that key substrings survive
const checks = [
  "toLocaleString('fr-FR'",
  "minimumFractionDigits",
  "maximumFractionDigits",
  ".r",
  "import React",
  "export function",
  "fr: 'M",
  "en: \"More\"",
  "ar: ",
  "es: 'M"
];

console.log('=== Survival checks ===');
for (const check of checks) {
  const found = fixed.includes(check);
  if (!found) {
    console.log(`  MISSING: "${check}" in fixed output`);
    // Find closest match
    for (let i = 0; i < check.length; i++) {
      for (let j = i + 2; j <= check.length; j++) {
        const sub = check.substring(i, j);
        if (fixed.includes(sub)) {
          console.log(`  Closest: "${sub}" at approx position ${fixed.indexOf(sub)}`);
          console.log(`  Original had: "${check}" at ${c.indexOf(check)}`);
          break;
        }
      }
    }
  } else {
    console.log(`  OK: "${check}"`);
  }
}

// Check first fix area
for (let i = 0; i < Math.min(c.length, fixed.length); i++) {
  if (c[i] !== fixed[i]) {
    console.log(`\n=== First change at position ${i} ===`);
    console.log('Orig:', JSON.stringify(c.substring(i, i+40)));
    console.log('Fixed:', JSON.stringify(fixed.substring(i, i+40)));
    break;
  }
}

// Count changes
let changes = 0;
let minLen = Math.min(c.length, fixed.length);
for (let i = 0; i < minLen; i++) {
  if (c[i] !== fixed[i]) changes++;
}
console.log(`\nTotal character changes in overlapping range: ${changes}`);
console.log(`Original length: ${c.length}, Fixed length: ${fixed.length}`);
