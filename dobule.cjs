const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('ادخل رقماً: ', (answer) => {
  const num = parseFloat(answer);
  if (isNaN(num)) {
    console.log('الرقم غير صالح');
  } else {
    console.log('الضعف هو:', num * 2);
  }
  rl.close();
});