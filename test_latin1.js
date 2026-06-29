const fs = require('fs');
const iconv = require('iconv-lite');

const file = 'components/ThreadCalculator.tsx';
const buf = fs.readFileSync(file);
const content = buf.toString('utf-8');

// Method 1: Latin-1
try {
  const latBuf = iconv.encode(content, 'latin1');
  const fixed1 = latBuf.toString('utf-8');
  console.log('Latin-1 fix has replacement:', fixed1.includes('\uFFFD'));
  if (fixed1.includes('\uFFFD')) {
    const idx = fixed1.indexOf('\uFFFD');
    console.log('  Replacement at', idx, 'ctx:', fixed1.substring(Math.max(0, idx-30), idx+30));
  } else {
    console.log('  Latin-1 fix WORKS!');
    // Check a sample
    const testIdx = content.indexOf('Ø§Ù„');
    if (testIdx >= 0) {
      console.log('  Before:', content.substring(testIdx, testIdx+20));
      console.log('  After:', fixed1.substring(testIdx, testIdx+20));
    }
  }
} catch(e) {
  console.log('Latin-1 error:', e.message);
}

// Method 2: Win1252
try {
  const winBuf = iconv.encode(content, 'win1252');
  const fixed2 = winBuf.toString('utf-8');
  console.log('\nWin1252 fix has replacement:', fixed2.includes('\uFFFD'));
} catch(e) {
  console.log('Win1252 error:', e.message);
}
