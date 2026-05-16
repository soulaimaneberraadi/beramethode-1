import Database from 'better-sqlite3';
const db = new Database('database.sqlite');
try {
    const tableInfo = db.prepare('PRAGMA table_info(magasin_products)').all();
    console.table(tableInfo);
} catch (e) {
    console.error(e);
} finally {
    db.close();
}
