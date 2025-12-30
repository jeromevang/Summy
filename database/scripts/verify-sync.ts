import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../../data/summy.db');

async function verifySync() {
  console.log('🔍 VERIFYING CODE INDEX SYNC');
  console.log('---------------------------');

  if (!fs.existsSync(DB_PATH)) {
    console.error('❌ Database not found at:', DB_PATH);
    return;
  }

  const db = new Database(DB_PATH);
  
  try {
    // 1. Check file count
    const fileCount = db.prepare('SELECT COUNT(*) as count FROM code_index').get() as any;
    console.log(`- Files indexed: ${fileCount.count}`);

    // 2. Check symbol count
    const symbolCount = db.prepare('SELECT COUNT(*) as count FROM code_chunks').get() as any;
    console.log(`- Symbols indexed: ${symbolCount.count}`);

    // 3. Verify specific paths
    const sample = db.prepare('SELECT file_path FROM code_index LIMIT 5').all() as any[];
    console.log('- Sample paths in index:');
    sample.forEach(s => console.log(`  - ${s.file_path}`));

    // 4. Check for orphans
    const rootDir = path.resolve(__dirname, '../../');
    const allFiles = db.prepare('SELECT file_path FROM code_index').all() as any[];
    let orphans = 0;
    allFiles.forEach(f => {
      if (!fs.existsSync(path.resolve(rootDir, f.file_path))) {
        orphans++;
      }
    });

    if (orphans > 0) {
      console.warn(`⚠️  Warning: Found ${orphans} orphaned entries in DB`);
    } else {
      console.log('✅ All DB entries match existing files on disk.');
    }
  } catch (err: any) {
    console.error('❌ Error reading database:', err.message);
  } finally {
    db.close();
  }
}

verifySync();
