import db from './server/db.ts';

console.log('db type:', typeof db);
console.log('db keys:', Object.keys(db).join(', '));


const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%invoice%'").all();
console.log('Invoice tables:', JSON.stringify(tables));

const routesMatch = require('fs').readFileSync('./server.ts', 'utf-8').match(/\/api\/invoices\/[^' \n]*/g);
console.log('Invoice routes in server.ts:', routesMatch);

// Try a test insert
const testId = 'TEST_' + Date.now();
db.prepare(`INSERT INTO invoices (id, owner_id, numero, type, source_module, source_id, tiers_nom, date_invoice, total_ht, taux_tva, total_tva, total_ttc, statut)
  VALUES (?, 0, ?, 'VENTE', 'TEST', NULL, 'Test Client', '2026-01-01', 100, 20, 20, 120, 'BROUILLON')`)
  .run(testId, 'FV-TEST-2026-0001');

const saved = db.prepare('SELECT * FROM invoices WHERE id = ?').get(testId);
console.log('Saved invoice:', JSON.stringify(saved));

// Clean up
db.prepare('DELETE FROM invoices WHERE id = ?').run(testId);
console.log('Test passed!');
