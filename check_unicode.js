const fs = require('fs');

// Check for non-Latin characters in the files that are NOT garbled text
const files = [
  'components/planning/header/PlanningHeader.tsx',
  'components/ThreadCalculator.tsx'
];

for (const file of files) {
  console.log('\n===', file, '===');
  const buf = fs.readFileSync(file);
  const content = buf.toString('utf-8');
  
  // Find characters outside the Latin-1 + CP-1252 special range
  // These would be > U+02FF or specific chars we haven't mapped
  let charCodes = [];
  for (let i = 0; i < content.length; i++) {
    const code = content.charCodeAt(i);
    if (code > 0x02FF) {
      charCodes.push({ index: i, code, char: content[i], context: content.substring(Math.max(0, i-20), i+20) });
    }
  }
  
  console.log('Characters > U+02FF:', charCodes.length);
  for (const c of charCodes) {
    console.log(`  U+${c.code.toString(16).toUpperCase()} at ${c.index}: "${c.char}" ctx: ${JSON.stringify(c.context)}`);
  }
}
