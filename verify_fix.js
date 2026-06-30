const fs = require('fs');

function checkFile(filePath) {
  const b = fs.readFileSync(filePath);
  const c = b.toString('utf-8');
  const idx = c.indexOf('Plus",ar');
  if (idx >= 0) {
    const slice = c.substring(idx, idx + 80);
    console.log('File:', filePath);
    console.log('Text:', JSON.stringify(slice));
    console.log('Hex:', b.slice(idx, idx + 80).toString('hex'));
  }
  
  const remGarbled = c.match(/[ØÙÃ]/g);
  console.log('Remaining garbled (Ø/Ù/Ã):', remGarbled ? remGarbled.length : 0);
  if (remGarbled && remGarbled.length > 0) {
    // Check if these are actually correct characters now
    for (let i = 0; i < Math.min(3, remGarbled.length); i++) {
      // Find context
      const ch = remGarbled[i];
      const pos = c.indexOf(ch, 5000); // Skip import area
      if (pos >= 0) {
        console.log('  Found at', pos, 'context:', JSON.stringify(c.substring(pos-10, pos+10)));
      }
    }
  }
  console.log('');
}

checkFile('components/planning/header/PlanningHeader.tsx');
checkFile('components/ThreadCalculator.tsx');
