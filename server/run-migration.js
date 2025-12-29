import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, '../data/summy.db');

console.log('🔧 Running database migration...');
console.log(`📁 Database path: ${dbPath}`);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Error opening database:', err.message);
    process.exit(1);
  }
  console.log('✅ Connected to database');
});

// Migration SQL to add missing columns
const migrationSQL = `
-- Create migration log table if it doesn't exist
CREATE TABLE IF NOT EXISTS migration_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  migration_name TEXT NOT NULL,
  executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Migration 1: Add qualifying_gate_passed column to combo_test_results
INSERT OR IGNORE INTO migration_log (migration_name) VALUES ('add_qualifying_gate_passed');

-- Add the missing columns
ALTER TABLE combo_test_results ADD COLUMN qualifying_gate_passed INTEGER DEFAULT NULL;
ALTER TABLE combo_test_results ADD COLUMN disqualified_at TEXT DEFAULT NULL;
ALTER TABLE combo_test_results ADD COLUMN qualifying_results TEXT DEFAULT NULL;

-- Verify the columns were added
PRAGMA table_info(combo_test_results);
`;

db.serialize(() => {
  db.run(migrationSQL, function(err) {
    if (err) {
      console.error('❌ Migration failed:', err.message);
      process.exit(1);
    }
    console.log('✅ Migration completed successfully');
  });
});

db.close((err) => {
  if (err) {
    console.error('❌ Error closing database:', err.message);
  } else {
    console.log('✅ Database connection closed');
  }
});
