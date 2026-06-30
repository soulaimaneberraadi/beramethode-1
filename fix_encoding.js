const fs = require('fs');
const path = require('path');

function fixFile(filePath) {
  const buf = fs.readFileSync(filePath);
  // Try reading the raw content
  const raw = buf.toString('binary');
  
  // Check if the file has mojibake patterns
  // Arabic garbled pattern: bytes like 0xC3 0x98 
  // French garbled: 0xC3 0xA9 = Ã© should be é
  
  // Method: read raw bytes as Latin-1, then re-interpret as UTF-8
  let hasChanges = false;
  
  try {
    // The trick: if the file was saved as UTF-8 but read as Latin-1,
    // we need to:
    // 1. Get the raw bytes (they ARE the correct UTF-8 bytes)
    // 2. Write them back properly
    
    // Actually, let's check if the file content is valid UTF-8 with garbled chars
    // by looking for the specific garbled byte sequences
    
    const content = buf.toString('utf-8');
    
    // Test if we find the specific patterns seen in grep
    const patterns = ['Ø§Ù„', 'Ã©', 'Ã¨', 'Ã ', 'Ã¹', 'â€™', 'â€”', 'â€“', 'â€¢', 'â€¦', 'Å“', 'Å', 'Ä±', 'ÄŸ', 'ÅŸ', 'Ã¼', 'Ã¶', 'Ã§', 'Ä°'];
    
    let found = false;
    for (const p of patterns) {
      if (content.includes(p)) {
        found = true;
        console.log(`  Found pattern: ${p}`);
      }
    }
    
    if (!found) {
      // Try reading as latin1 and re-interpreting
      const latinContent = buf.toString('latin1');
      for (const p of patterns) {
        if (latinContent.includes(p)) {
          found = true;
          console.log(`  Found pattern (latin1): ${p}`);
        }
      }
    }
    
    return found;
  } catch (e) {
    console.error(`  Error: ${e.message}`);
    return false;
  }
}

// Check specific files
const files = [
  'components/planning/header/PlanningHeader.tsx',
  'components/ThreadCalculator.tsx'
];

for (const f of files) {
  console.log(`\nChecking: ${f}`);
  const fullPath = path.join(process.cwd(), f);
  if (fs.existsSync(fullPath)) {
    fixFile(fullPath);
  } else {
    console.log('  NOT FOUND');
  }
}

console.log('\nDone');
