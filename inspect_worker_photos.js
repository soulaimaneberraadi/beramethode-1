const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new Database(dbPath);

const workers = db.prepare("SELECT id, full_name, photo FROM hr_workers WHERE photo IS NOT NULL AND photo != ''").all();
console.log('Workers with photos:', workers.length);
workers.forEach(w => {
  console.log(`Worker ID: ${w.id}, Name: ${w.full_name}, Photo (truncated):`, w.photo.slice(0, 100));
});

const models = db.prepare("SELECT id, data FROM models").all();
models.forEach(m => {
  const data = JSON.parse(m.data);
  if (data.image && !data.image.startsWith('data:image') && !data.image.startsWith('blob:')) {
    console.log(`Model ID: ${m.id}, Name: ${data.filename}, Image Type:`, data.image.slice(0, 100));
  }
});

db.close();
