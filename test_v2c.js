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

function testFile(fp) {
  const b = fs.readFileSync(fp);
  const c = b.toString('utf-8');
  const fixed = fixContent(c);
  
  console.log(`\n=== ${fp} ===`);
  console.log(`Size: ${c.length} -> ${fixed.length} (${fixed.length - c.length} chars)`);
  
  // Check specific known-garbled strings are fixed
  if (fp.includes('PlanningHeader')) {
    const checks = [
      ['More', 'More'],
      ['Ø§Ù„Ù…Ø²ÙŠØ¯', 'More'], // Should NOT have garbled Arabic anymore
    ];
    for (const [garbled, expected] of checks) {
      const foundGarbled = fixed.includes(garbled);
      const foundExpected = fixed.includes(expected);
      console.log(`  "${garbled}": ${foundGarbled ? 'STILL GARBLED!' : 'FIXED'}`);
    }
  }
  
  if (fp.includes('ThreadCalculator')) {
    // Check french fixes
    const checks = [
      ['catÃ©gorie', 'catégorie'],
      ['MÃ©thode', 'Méthode'],
      ['modÃ¨le', 'modèle'],
    ];
    for (const [garbled, expected] of checks) {
      const hasGarbled = fixed.includes(garbled);
      const hasExpected = fixed.includes(expected);
      console.log(`  "${garbled}" -> "${expected}": ${hasGarbled ? 'FAIL' : hasExpected ? 'OK' : 'MISSING'}`);
    }
  }
  
  // Verify no replacement chars
  if (fixed.includes('\uFFFD')) console.log('  WARNING: Has replacement chars!');
  
  // Check that key ASCII structures survived
  const asciiChecks = ['toLocaleString', 'import', 'export', 'function', 'className', 'return'];
  for (const check of asciiChecks) {
    if (!fixed.includes(check)) {
      console.log(`  MISSING ASCII: "${check}"`);
    }
  }
}

testFile('components/planning/header/PlanningHeader.tsx');
testFile('components/ThreadCalculator.tsx');
