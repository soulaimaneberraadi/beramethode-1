const fs = require('fs');
const path = require('path');

const CP1252 = {
  0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84,
  0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88,
  0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C,
  0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93,
  0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B,
  0x0153: 0x9C, 0x0178: 0x9F
};

function toByte(ch) {
  const cp = ch.charCodeAt(0);
  if (cp < 128) return cp;
  if (cp >= 0x80 && cp <= 0xFF) return cp;
  if (CP1252[cp] !== undefined) return CP1252[cp];
  return null;
}

function fixContent(content) {
  const bytes = [];
  const result = [];

  function flush() {
    if (bytes.length === 0) return;
    try {
      const decoded = Buffer.from(bytes).toString('utf-8');
      if (!decoded.includes('\uFFFD')) {
        result.push(decoded);
      } else {
        result.push(Buffer.from(bytes).toString('latin1'));
      }
    } catch {
      result.push(Buffer.from(bytes).toString('latin1'));
    }
    bytes.length = 0;
  }

  let garbledRuns = 0;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    const byte = toByte(ch);
    if (byte !== null) {
      if (bytes.length === 0) garbledRuns++;
      bytes.push(byte);
    } else {
      flush();
      result.push(ch);
    }
  }
  flush();
  
  return { fixed: result.join(''), garbledRuns };
}

// Test
const fp = 'components/planning/header/PlanningHeader.tsx';
const b = fs.readFileSync(fp);
const c = b.toString('utf-8');
const { fixed, garbledRuns } = fixContent(c);

console.log('Garbled runs:', garbledRuns);
console.log('Original length:', c.length, 'Fixed length:', fixed.length);
console.log('Are same:', c === fixed);

// Check first difference
for (let i = 0; i < Math.min(c.length, fixed.length); i++) {
  if (c[i] !== fixed[i]) {
    console.log('\nFirst diff at', i);
    console.log('Orig:', JSON.stringify(c.substring(Math.max(0,i-20), i+30)));
    console.log('Fixed:', JSON.stringify(fixed.substring(Math.max(0,i-20), i+30)));
    break;
  }
}
