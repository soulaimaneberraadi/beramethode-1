const fs = require('fs');
const iconv = require('iconv-lite');

const file = 'components/ThreadCalculator.tsx';
const buf = fs.readFileSync(file);
const content = buf.toString('utf-8');

// Check if the regex matches
const re = /[ØÙÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖÙÚÛÜÝÞ]/u;
console.log('Regex matches:', re.test(content));

// Check specific characters
const testChars = ['Ø', 'Ã', '©'];
for (const ch of testChars) {
  if (content.includes(ch)) {
    const idx = content.indexOf(ch);
    console.log(`Found '${ch}' (U+${ch.charCodeAt(0).toString(16)}) at index ${idx}`);
  } else {
    console.log(`NOT found '${ch}'`);
  }
}

// Check a sample of the garbled area
const idx = content.indexOf('Plus');
if (idx >= 0) {
  const ctx = content.substring(idx, idx + 200);
  console.log('\nContext at Plus:', JSON.stringify(ctx).substring(0, 300));
}
