const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');

// Known mojibake patterns (UTF-8 bytes misinterpreted as win1252)
const GARBLED_CHARS = new Set();
// Generate the common garbled character set:
// These are Latin-1 supplement chars that shouldn't normally appear in source code
// Ø Ù Ê etc. - garbled Arabic/UTF-8 bytes
for (let i = 0x80; i <= 0xFF; i++) {
  GARBLED_CHARS.add(String.fromCharCode(i));
}

function hasGarbledText(str) {
  // Check if the string contains sequences typical of mojibake
  const garbledPatterns = /[ØÙÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿ]/;
  return garbledPatterns.test(str);
}

function fixContent(content) {
  // The fix: encode the content as windows-1252, then decode as UTF-8
  // This reverses the double-encoding: UTF-8 -> win1252 -> UTF-8
  try {
    const buf = iconv.encode(content, 'win1252');
    const fixed = buf.toString('utf-8');
    // Verify the fix didn't produce broken characters
    if (fixed.includes('\uFFFD')) {
      console.warn('  WARNING: Fix produced replacement characters, trying partial fix');
      return null; // Signal that full-file fix isn't safe
    }
    return fixed;
  } catch (e) {
    console.warn(`  ERROR encoding: ${e.message}`);
    return null;
  }
}

function processFile(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    const original = buf.toString('utf-8');
    
    if (!hasGarbledText(original)) {
      return false; // No garbled text
    }
    
    const fixed = fixContent(original);
    if (fixed === null) {
      console.warn(`  Skipping ${filePath} - full-file fix not safe`);
      return false;
    }
    
    if (fixed === original) {
      return false; // No change
    }
    
    // Write the fixed content
    fs.writeFileSync(filePath, fixed, 'utf-8');
    console.log(`  FIXED: ${filePath}`);
    return true;
  } catch (e) {
    console.error(`  ERROR reading ${filePath}: ${e.message}`);
    return false;
  }
}

// Find all ts and tsx files in components/, app/, lib/, src/, server/
const dirs = ['components', 'app', 'lib', 'src', 'server'];
const extensions = ['.ts', '.tsx'];

let totalFiles = 0;
let fixedFiles = 0;

for (const dir of dirs) {
  if (!fs.existsSync(dir)) continue;
  
  function walk(dirPath) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('node_modules') && entry.name !== '.git') {
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (extensions.includes(ext)) {
          totalFiles++;
          const changed = processFile(fullPath);
          if (changed) fixedFiles++;
        }
      }
    }
  }
  
  walk(dir);
}

console.log(`\nTotal files checked: ${totalFiles}`);
console.log(`Files fixed: ${fixedFiles}`);
