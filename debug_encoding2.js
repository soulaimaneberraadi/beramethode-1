const fs = require('fs');
const iconv = require('iconv-lite');

const file = 'components/ThreadCalculator.tsx';
const buf = fs.readFileSync(file);
const content = buf.toString('utf-8');

try {
  const win1252Buf = iconv.encode(content, 'win1252');
  const fixed = win1252Buf.toString('utf-8');
  
  if (fixed.includes('\uFFFD')) {
    console.log('Has replacement character');
    // Find where
    const idx = fixed.indexOf('\uFFFD');
    console.log('  At index', idx, 'context:', fixed.substring(Math.max(0, idx - 50), idx + 50));
  }
  
  if (fixed === content) {
    console.log('Fixed === original - no change');
  } else {
    console.log('Different! Original length:', content.length, 'Fixed length:', fixed.length);
    // Find first difference
    for (let i = 0; i < Math.min(content.length, fixed.length); i++) {
      if (content[i] !== fixed[i]) {
        console.log(`  First diff at ${i}: orig=${content.substring(i, i+30)} vs fixed=${fixed.substring(i, i+30)}`);
        break;
      }
    }
  }
} catch (e) {
  console.log('ERROR:', e.message);
}
