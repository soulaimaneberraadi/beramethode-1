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
  if (cp >= 0x80 && cp <= 0xFF) return cp; // Latin-1: direct byte
  if (CP1252[cp] !== undefined) return CP1252[cp]; // CP-1252 special
  return null; // Not a garbled char - pass through
}

function fixContent(content) {
  const bytes = [];
  let nonLatinBuffer = [];

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    const byte = toByte(ch);

    if (byte !== null) {
      bytes.push(byte);
    } else {
      // Not a garbled char - this is a correct non-Latin character
      // Flush any pending garbled bytes as UTF-8 decode
      if (bytes.length > 0) {
        try {
          const decoded = Buffer.from(bytes).toString('utf-8');
          if (!decoded.includes('\uFFFD')) {
            nonLatinBuffer.push(decoded);
          } else {
            // Invalid UTF-8 - try with latin1 encoding
            // This handles the U+0081 case (Latin-1 only)
            const fixed = Buffer.concat([Buffer.from(bytes)]).toString('utf-8');
            if (!fixed.includes('\uFFFD')) {
              nonLatinBuffer.push(fixed);
            } else {
              // Keep original binary
              nonLatinBuffer.push(Buffer.from(bytes).toString('latin1'));
            }
          }
        } catch (e) {
          nonLatinBuffer.push(Buffer.from(bytes).toString('latin1'));
        }
        bytes.length = 0;
      }
      nonLatinBuffer.push(ch);
    }
  }

  // Flush remaining bytes
  if (bytes.length > 0) {
    try {
      const decoded = Buffer.from(bytes).toString('utf-8');
      if (!decoded.includes('\uFFFD')) {
        nonLatinBuffer.push(decoded);
      } else {
        nonLatinBuffer.push(Buffer.from(bytes).toString('latin1'));
      }
    } catch (e) {
      nonLatinBuffer.push(Buffer.from(bytes).toString('latin1'));
    }
  }

  return nonLatinBuffer.join('');
}

// Test
const b = fs.readFileSync('components/ThreadCalculator.tsx');
const c = b.toString('utf-8');
const fixed = fixContent(c);
console.log('Has replacement:', fixed.includes('\uFFFD'));
if (!fixed.includes('\uFFFD')) {
  console.log('CLEAN!');
} else {
  const idx = fixed.indexOf('\uFFFD');
  console.log('Still has replacement at', idx);
}

// Also check the 5 already-fixed files
for (const f of ['CostPartials', 'MaterialAssignment', 'planning/header/DateNavigator', 'planning/header/ViewSwitcher', 'planning/header/ZoomSwitcher']) {
  const fp = `components/${f}.tsx`;
  try {
    const cb = fs.readFileSync(fp);
    const cc = cb.toString('utf-8');
    const fx = fixContent(cc);
    const hasRep = fx.includes('\uFFFD');
    const hasGarble = /[ØÙÃ¨Ã©]/.test(fx);
    console.log(`${f}: replacement=${hasRep}, garbled=${hasGarble}`);
  } catch(e) {
    // skip
  }
}
