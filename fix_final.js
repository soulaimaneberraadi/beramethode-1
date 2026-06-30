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

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    const byte = toByte(ch);
    if (byte !== null) {
      bytes.push(byte);
    } else {
      flush();
      result.push(ch);
    }
  }
  flush();
  return result.join('');
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
    if (fixedContent === original) return;

    if (fixedContent.includes('\uFFFD')) {
      warned.push(path.relative(process.cwd(), filePath));
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

console.log(`\nChecked: ${checked}, Fixed: ${fixed}, Warned: ${warned.length}`);
if (warned.length) console.log('Files with issues:', warned.join(', '));
