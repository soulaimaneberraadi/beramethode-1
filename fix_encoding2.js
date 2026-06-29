const fs = require('fs');
const iconv = require('iconv-lite');

const buf = fs.readFileSync('components/planning/header/PlanningHeader.tsx');
const garbled = buf.toString('utf-8');

const idx = garbled.indexOf('Ø§Ù„');
if (idx >= 0) {
  const snippet = garbled.substring(idx, idx + 40);
  console.log('Garbled:', snippet);

  // Approach 1: iconv-lite encode as win1252 then decode as utf-8
  // The garbled string has characters where each represents a byte from the original UTF-8
  // win1252 encoding converts those characters back to bytes
  const win1252Buf = iconv.encode(snippet, 'win1252');
  const fixed = win1252Buf.toString('utf-8');
  console.log('Fixed (win1252):', fixed);

  // Also try with latin1
  const latin1Buf = iconv.encode(snippet, 'latin1');
  const fixed2 = latin1Buf.toString('utf-8');
  console.log('Fixed (latin1):', fixed2);
}

// Test with French garbled
const frenchIdx = garbled.indexOf('MÃ¡s');
if (frenchIdx >= 0) {
  const snippet = garbled.substring(frenchIdx, frenchIdx + 10);
  console.log('\nFrench garbled:', snippet);
  const buf = iconv.encode(snippet, 'win1252');
  console.log('Fixed (win1252):', buf.toString('utf-8'));
  const buf2 = iconv.encode(snippet, 'latin1');
  console.log('Fixed (latin1):', buf2.toString('utf-8'));
}
