import Database from 'better-sqlite3';
import path from 'path';

const db = new Database('data/summy.db');
try {
  console.log('--- CODE INDEX ---');
  const files = db.prepare('SELECT * FROM code_index LIMIT 2').all();
  console.log(JSON.stringify(files, null, 2));

  console.log('--- CODE CHUNKS ---');
  const chunks = db.prepare('SELECT * FROM code_chunks LIMIT 2').all();
  console.log(JSON.stringify(chunks, null, 2));

  console.log('--- CODE DEPENDENCIES ---');
  const deps = db.prepare('SELECT * FROM code_dependencies LIMIT 2').all();
  console.log(JSON.stringify(deps, null, 2));
} catch (err) {
  console.error(err);
} finally {
  db.close();
}
