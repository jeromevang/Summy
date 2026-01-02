/**
 * Manual Database Migration Script
 * Applies the 4 new tables: teams, prosthetics, failures, test_results
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, '../data/summy.db');
const MIGRATION_SQL_PATH = path.join(__dirname, 'drizzle/0000_omniscient_lake.sql');

console.log('📊 Database Migration Script');
console.log('============================\n');

// Read migration SQL
const fullMigrationSQL = fs.readFileSync(MIGRATION_SQL_PATH, 'utf-8');

// Extract only the 4 new tables we need
const extractTableSQL = (tableName) => {
  const regex = new RegExp(
    `CREATE TABLE \`${tableName}\`[\\s\\S]*?;[\\s\\S]*?(?=CREATE TABLE|CREATE INDEX \`idx_${tableName}|$)`,
    'g'
  );
  const matches = fullMigrationSQL.match(regex);
  if (!matches) return null;

  let sql = matches[0];

  // Extract associated indexes
  const indexRegex = new RegExp(`CREATE INDEX \`idx_${tableName}[^;]+;`, 'g');
  const indexes = fullMigrationSQL.match(indexRegex) || [];

  return sql + '\n' + indexes.join('\n');
};

const newTables = [
  { name: 'teams', sql: extractTableSQL('teams') },
  { name: 'prosthetics', sql: extractTableSQL('prosthetics') },
  { name: 'failures', sql: extractTableSQL('failures') },
  { name: 'test_results', sql: extractTableSQL('test_results') }
];

// Connect to database
console.log(`📁 Connecting to: ${DB_PATH}\n`);
const db = new Database(DB_PATH);

// Check existing tables
const existingTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
const existingTableNames = existingTables.map(t => t.name);

console.log('✅ Existing tables:', existingTableNames.join(', '));
console.log();

// Apply migrations for new tables only
let applied = 0;
let skipped = 0;

for (const table of newTables) {
  if (existingTableNames.includes(table.name)) {
    console.log(`⏭️  Skipping ${table.name} (already exists)`);
    skipped++;
    continue;
  }

  if (!table.sql) {
    console.log(`⚠️  Could not extract SQL for ${table.name}`);
    continue;
  }

  try {
    console.log(`📝 Creating table: ${table.name}`);

    // Split by statement-breakpoint or semicolons
    const statements = table.sql
      .split(/-->[\s]*statement-breakpoint/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    for (const statement of statements) {
      if (statement.startsWith('CREATE')) {
        db.exec(statement);
      }
    }

    console.log(`✅ ${table.name} created successfully`);
    applied++;
  } catch (error) {
    console.error(`❌ Error creating ${table.name}:`, error.message);
  }
}

console.log();
console.log('============================');
console.log(`✅ Tables created: ${applied}`);
console.log(`⏭️  Tables skipped: ${skipped}`);
console.log();

// Verify all tables exist now
const finalTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
const finalTableNames = finalTables.map(t => t.name);

console.log('📊 Final database tables:');
finalTableNames.forEach(name => {
  const isNew = newTables.some(t => t.name === name) && !existingTableNames.includes(name);
  console.log(`   ${isNew ? '🆕' : '  '} ${name}`);
});

db.close();

console.log();
console.log('✅ Migration complete!');
console.log();
console.log('🚀 Next steps:');
console.log('   1. Restart the server: npm run dev');
console.log('   2. Test endpoints: curl http://localhost:3001/health');
console.log('   3. Test Teams API: curl http://localhost:3001/api/teams');
