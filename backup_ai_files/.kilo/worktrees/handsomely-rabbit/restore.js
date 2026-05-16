const { execSync } = require('child_process');
try {
  execSync('git checkout App.tsx');
  console.log('App.tsx restored.');
} catch (e) {
  console.error(e);
}
