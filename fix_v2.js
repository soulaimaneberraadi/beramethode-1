const fs = require('fs');
const path = require('path');

// CP-1252 specials (garbled input only, NOT correct output chars)
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

function isGarbledChar(ch) {
  const cp = ch.charCodeAt(0);
  if (cp < 128) return true; // ASCII is part of garbled sequences
  if (cp >= 0x80 && cp <= 0xFF) return true; // Latin-1 supplement
  if (GARBLED_CP1252.has(cp)) return true; // CP-1252 specials
  return false;
}

function toByte(ch) {
  const cp = ch.charCodeAt(0);
  if (cp < 128) return cp;
  if (cp >= 0x80 && cp <= 0xFF) return cp;
  if (CP1252_REVERSE[cp] !== undefined) return CP1252_REVERSE[cp];
  return null; // non-garbled character
}

function fixContent(content) {
  const result = [];
  let i = 0;

  while (i < content.length) {
    if (!isGarbledChar(content[i])) {
      // Non-garbled char - pass through
      result.push(content[i]);
      i++;
      continue;
    }

    // Count consecutive garbled chars
    const start = i;
    while (i < content.length && isGarbledChar(content[i])) {
      i++;
    }
    const runLength = i - start;

    if (runLength < 2) {
      // Single garbled char - pass through (it's correct)
      result.push(content[start]);
      continue;
    }

    // Convert run of 2+ garbled chars to bytes and decode as UTF-8
    const bytes = [];
    for (let j = start; j < i; j++) {
      const byte = toByte(content[j]);
      if (byte !== null) {
        bytes.push(byte);
      }
    }

    if (bytes.length >= 2) {
      const decoded = Buffer.from(bytes).toString('utf-8');
      if (!decoded.includes('\uFFFD')) {
        result.push(decoded);
        continue;
      }
    }

    // Fallback: try Latin-1
    const latin1 = Buffer.from(bytes).toString('latin1');
    if (!latin1.includes('\uFFFD')) {
      result.push(latin1);
    } else {
      // Keep original
      result.push(content.substring(start, i));
    }
  }

  return result.join('');
}

function hasGarbled(content) {
  // Check for sequences of 2+ chars in Latin-1 supplement range
  // that form classic mojibake patterns
  const patterns = /[ØÙÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖÙÚÛÜÝÞâ€]/u;
  return patterns.test(content);
}

let checked = 0, fixed = 0;

function processFile(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    const original = buf.toString('utf-8');
    if (!hasGarbled(original)) return;

    const fixedContent = fixContent(original);
    if (fixedContent === original) return;
    if (fixedContent.includes('\uFFFD')) {
      console.log(`  SKIP (replacement char): ${path.relative(process.cwd(), filePath)}`);
      return;
    }

    fs.writeFileSync(filePath, fixedContent, 'utf-8');
    fixed++;
    console.log(`  FIXED: ${path.relative(process.cwd(), filePath)}`);
  } catch (e) {
    console.error(`  ERROR ${path.relative(process.cwd(), filePath)}: ${e.message}`);
  }
}

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory() && !e.name.startsWith('.')) walk(full);
    else if (e.isFile() && /\.(ts|tsx)$/i.test(e.name)) {
      checked++;
      processFile(full);
    }
  }
}

for (const d of ['components', 'app', 'lib', 'src', 'server']) {
  walk(d);
}

console.log(`\nChecked: ${checked}, Fixed: ${fixed}`);
