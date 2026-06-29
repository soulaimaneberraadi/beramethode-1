const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');

// Map of garbled char → original Latin-1 byte
function toByte(ch) {
  const cp = ch.charCodeAt(0);
  if (cp < 128) return cp;
  if (cp <= 0xFF) return cp; // Latin-1 supplement

  // CP-1252 specials
  const cp1252 = {
    0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84,
    0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88,
    0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C,
    0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93,
    0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
    0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B,
    0x0153: 0x9C, 0x0178: 0x9F
  };
  return cp1252[cp] !== undefined ? cp1252[cp] : null;
}

function fixMojibakeSmart(str) {
  const bytes = [];
  const N = str.length;
  let i = 0;
  let hasNonLatin = false;

  while (i < N) {
    const ch = str[i];
    const cp = ch.charCodeAt(0);
    const byte = toByte(ch);

    if (byte !== null) {
      bytes.push(byte);
      i++;
    } else {
      // Check if this is a correct non-Latin char (pass through)
      // Or if pending bytes need decoding first
      if (bytes.length > 0) {
        // Try to decode pending bytes
        try {
          const decoded = Buffer.from(bytes).toString('utf-8');
          // Verify it's valid and doesn't produce replacement chars
          if (!decoded.includes('\uFFFD')) {
            hasNonLatin = hasNonLatin || decoded.length > bytes.length;
            // Use decoded
            bytes.length = 0;
            // We already have the decoded text, but we need to build result
            // This approach won't work inline; let me restructure
          }
        } catch (e) {}
      }
      bytes.push(cp);
      i++;
    }
  }

  // Final decode
  if (bytes.length > 0) {
    try {
      return Buffer.from(bytes).toString('utf-8');
    } catch (e) {
      return str; // Fallback
    }
  }
  return str;
}

function fixContent(content) {
  // Method 1: Full win1252 encode/decode
  try {
    const buf = iconv.encode(content, 'win1252');
    const fixed = buf.toString('utf-8');
    if (!fixed.includes('\uFFFD')) return fixed;
  } catch (e) {}

  // Method 2: Smart byte-level fix for specific garbled sequences
  // Process each character, converting garbled chars back to bytes, then decode as UTF-8
  const bytes = [];
  for (let i = 0; i < content.length; i++) {
    const byte = toByte(content[i]);
    if (byte !== null) {
      bytes.push(byte);
    } else {
      bytes.push(content.charCodeAt(i));
    }
  }
  try {
    return Buffer.from(bytes).toString('utf-8');
  } catch (e) {
    return null;
  }
}

function hasGarbled(content) {
  return /[ØÙÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖÙÚÛÜÝÞ]/u.test(content);
}

let checked = 0, fixed = 0, warned = [];

function processFile(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    const original = buf.toString('utf-8');
    if (!hasGarbled(original)) return;

    const fixedContent = fixContent(original);
    if (!fixedContent || fixedContent === original) return;

    if (fixedContent.includes('\uFFFD')) {
      warned.push(path.relative(process.cwd(), filePath));
      console.log(`  WARN: ${path.relative(process.cwd(), filePath)} has replacement chars after fix`);
      // Still write partial fix
      fs.writeFileSync(filePath, fixedContent, 'utf-8');
      fixed++;
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
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory() && e.name !== 'node_modules') walk(full);
    else if (e.isFile() && /\.(ts|tsx)$/i.test(e.name)) {
      checked++;
      processFile(full);
    }
  }
}

for (const d of ['components', 'app', 'lib', 'src']) {
  if (fs.existsSync(d)) walk(d);
}

console.log(`\nChecked: ${checked}, Fixed: ${fixed}, Warned: ${warned.length}`);
if (warned.length) console.log('Files with replacement chars:', warned.join(', '));
