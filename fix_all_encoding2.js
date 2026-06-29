const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');

let totalChecked = 0;
let totalFixed = 0;
let totalErrors = 0;

function hasGarbledText(content) {
  return /[ØÙÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖÙÚÛÜÝÞ]/u.test(content);
}

function fixContent(content) {
  try {
    const buf = iconv.encode(content, 'win1252');
    const fixed = buf.toString('utf-8');
    if (fixed.includes('\uFFFD')) return null;
    return fixed;
  } catch (e) {
    return null;
  }
}

function processFile(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    const original = buf.toString('utf-8');

    if (!hasGarbledText(original)) return false;

    const fixed = fixContent(original);
    if (fixed === null || fixed === original) return false;

    fs.writeFileSync(filePath, fixed, 'utf-8');
    return true;
  } catch (e) {
    console.error(`  ERROR ${path.relative(process.cwd(), filePath)}: ${e.message}`);
    return false;
  }
}

const dirs = ['components', 'app', 'lib', 'src', 'server'];
const exts = ['.ts', '.tsx'];

for (const dir of dirs) {
  if (!fs.existsSync(dir)) continue;
  function walk(dirPath) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const e of entries) {
      const fullPath = path.join(dirPath, e.name);
      if (e.isDirectory() && e.name !== 'node_modules' && e.name !== '.git') walk(fullPath);
      else if (e.isFile() && exts.includes(path.extname(e.name).toLowerCase())) {
        totalChecked++;
        if (processFile(fullPath)) {
          totalFixed++;
          console.log(`  FIXED: ${path.relative(process.cwd(), fullPath)}`);
        }
      }
    }
  }
  walk(dir);
}

console.log(`\nChecked: ${totalChecked}, Fixed: ${totalFixed}, Errors: ${totalErrors}`);
