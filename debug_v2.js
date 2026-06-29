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

// Debug the specific position
const fp = 'components/ThreadCalculator.tsx';
const b = fs.readFileSync(fp);
const c = b.toString('utf-8');

const startIdx = 3900;
console.log('Original text around 3936:', JSON.stringify(c.substring(startIdx, startIdx + 100)));
console.log('Hex:', b.slice(startIdx, startIdx + 100).toString('hex'));

// Check each character in this range
for (let i = startIdx; i < startIdx + 100; i++) {
  const ch = c[i];
  const g = isGarbled(ch);
  const cp = ch.charCodeAt(0);
  if (g) {
    console.log(`  Garbled at ${i}: U+${cp.toString(16).toUpperCase()} '${ch}' context: '${c.substring(Math.max(0,i-5), i+5)}'`);
  }
}
