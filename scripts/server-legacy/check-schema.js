import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, '../data/summy.db');

console.log('🔍 Checking database schema...');
console.log(`📁 Database path: ${dbPath}`);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Error opening database:', err.message);
    process.exit(1);
  }
  console.log('✅ Connected to database');
});

// Check the schema of combo_test_results table
db.all("PRAGMA table_info(combo_test_results)", (err, rows) => {
  if (err) {
    console.error('❌ Error checking schema:', err.message);
    return;
  }
  
  console.log('\n📋 combo_test_results table schema:');
  console.log('=====================================');
  rows.forEach(row => {
    console.log(`${row.name} (${row.type}) - ${row.notnull ? 'NOT NULL' : 'NULL'} - default: ${row.dflt_value}`);
  });
  
  // Check if the columns exist
  const hasQualifyingGate = rows.some(row => row.name === 'qualifying_gate_passed');
  const hasDisqualifiedAt = rows.some(row => row.name === 'disqualified_at');
  const hasQualifyingResults = rows.some(row => row.name === 'qualifying_results');
  
  console.log('\n🔍 Column existence check:');
  console.log(`✅ qualifying_gate_passed: ${hasQualifyingGate ? 'EXISTS' : 'MISSING'}`);
  console.log(`✅ disqualified_at: ${hasDisqualifiedAt ? 'EXISTS' : 'MISSING'}`);
  console.log(`✅ qualifying_results: ${hasQualifyingResults ? 'EXISTS' : 'MISSING'}`);
  
  if (!hasQualifyingGate || !hasDisqualifiedAt || !hasQualifyingResults) {
    console.log('\n❌ Some columns are still missing. Running migration again...');
    
    // Run the migration again
    const migrationSQL = `
      ALTER TABLE combo_test_results ADD COLUMN qualifying_gate_passed INTEGER DEFAULT NULL;
      ALTER TABLE combo_test_results ADD COLUMN disqualified_at TEXT DEFAULT NULL;
      ALTER TABLE combo_test_results ADD COLUMN qualifying_results TEXT DEFAULT NULL;
    `;
    
    db.run(migrationSQL, function(err) {
      if (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
      }
      console.log('✅ Migration completed successfully');
      
      // Check schema again
      db.all("PRAGMA table_info(combo_test_results)", (err, rows) => {
        if (err) {
          console.error('❌ Error checking schema:', err.message);
          return;
        }
        
        console.log('\n📋 Updated combo_test_results table schema:');
        console.log('============================================');
        rows.forEach(row => {
          console.log(`${row.name} (${row.type}) - ${row.notnull ? 'NOT NULL' : 'NULL'} - default: ${row.dflt_value}`);
        });
        
        db.close();
      });
    });
  } else {
    console.log('\n✅ All columns exist. Database is ready.');
    db.close();
  }
});
