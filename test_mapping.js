const iconv = require('iconv-lite');

// Test the specific garbled sequence that produces replacement chars
const testCases = [
  // The different garbled markers
  'â€™',       // Should be em dash or apostrophe
  'â€œ',       // Should be open quote
  'â€',        // Should be close quote  
  'â€”',       // Should be em dash
  'â€“',       // Should be en dash
  'â€¢',       // Should be bullet
  'â€¦',       // Should be ellipsis
];

for (const tc of testCases) {
  try {
    const buf = iconv.encode(tc, 'win1252');
    const fixed = buf.toString('utf-8');
    console.log(`'${tc}' (${tc.length} chars) -> '${fixed}' (${fixed.length} chars)`);
    console.log(`  bytes: ${buf.toString('hex')}`);
    console.log(`  has replacement: ${fixed.includes('\uFFFD')}`);
  } catch(e) {
    console.log(`'${tc}' ERROR: ${e.message}`);
  }
}

// Also test with the full context around the problem area
const garbledFragment = 'Ã¨le (catÃ©gorie de la fiche technique) â€” sert d';
try {
  const buf = iconv.encode(garbledFragment, 'win1252');
  const fixed = buf.toString('utf-8');
  console.log(`\nFragment: '${garbledFragment}'`);
  console.log(`Fixed:    '${fixed}'`);
  console.log(`Has replacement: ${fixed.includes('\uFFFD')}`);
} catch(e) {
  console.log(`Fragment ERROR: ${e.message}`);
}

// Check what characters iconv fails on in the ThreadCalculator file
const fs = require('fs');
const b = fs.readFileSync('components/ThreadCalculator.tsx');
const c = b.toString('utf-8');

// Find problem chars
const problemChars = [];
for (let i = 0; i < c.length; i++) {
  const code = c.charCodeAt(i);
  // Characters > 127 that might not be mappable
  if (code > 0x7F && code < 0xFF) continue; // Latin-1 supplement is fine
  if (code >= 0xFF) {
    try {
      iconv.encode(c[i], 'win1252');
    } catch(e) {
      problemChars.push({ index: i, char: c[i], code: code, context: c.substring(Math.max(0,i-10), i+10) });
    }
  }
}

if (problemChars.length > 0) {
  console.log(`\n${problemChars.length} unmappable chars:`);
  for (const p of problemChars.slice(0, 10)) {
    console.log(`  U+${p.code.toString(16)} at ${p.index}: "${p.char}" ctx: ${JSON.stringify(p.context)}`);
  }
} else {
  console.log('\nAll chars mappable in win1252');
}
