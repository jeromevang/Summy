/**
 * Migration script to move JSON sessions to SQLite.
 * This script reads session data from individual JSON files, converts them to the
 * `Session` format, and then saves them into the SQLite database.
 *
 * To run: `npx tsx src/services/migrate-sessions.ts`
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { db, Session } from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SESSIONS_DIR = path.join(__dirname, '../../../sessions');
const BACKUP_DIR = path.join(__dirname, '../../../sessions_backup');

/**
 * Migrates session data from individual JSON files stored in the `sessions` directory
 * into the SQLite database managed by the `DatabaseService`.
 *
 * This function performs the following steps:
 * 1. Checks for the existence of the `sessions` directory.
 * 2. Iterates through all `.json` files within the `sessions` directory.
 * 3. Reads each JSON file, attempts to convert its content into a `Session` object.
 * 4. Saves the converted `Session` object into the SQLite database using `db.saveSession`.
 * 5. Provides a summary of migrated and failed sessions.
 * 6. Creates a backup of the original JSON session files in a `sessions_backup` directory
 *    after successful migration.
 *
 * @returns A promise that resolves when the migration process is complete.
 */
async function migrateSessionsToSQLite(): Promise<void> {
  console.log('🔄 Starting session migration from JSON to SQLite...\n');

  // Check if sessions directory exists
  if (!await fs.pathExists(SESSIONS_DIR)) {
    console.log('ℹ️  No sessions directory found. Nothing to migrate.');
    return;
  }

  // Get all JSON files
  const files = await fs.readdir(SESSIONS_DIR);
  const jsonFiles = files.filter(f => f.endsWith('.json'));

  if (jsonFiles.length === 0) {
    console.log('ℹ️  No JSON session files found. Nothing to migrate.');
    return;
  }

  console.log(`📁 Found ${jsonFiles.length} session files to migrate.\n`);

  let migrated = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const file of jsonFiles) {
    const filePath = path.join(SESSIONS_DIR, file);
    
    try {
      // Read JSON file
      const data = await fs.readJson(filePath);
      
      // Convert to Session format
      const session: Session = {
        id: data.id || path.basename(file, '.json'),
        name: data.name || data.title || 'Untitled Session',
        createdAt: data.createdAt || data.timestamp || new Date().toISOString(),
        updatedAt: data.updatedAt || data.lastUpdated || new Date().toISOString(),
        model: data.model || data.metadata?.model || '',
        provider: data.provider || data.metadata?.provider || '',
        messages: data.messages || data.conversation || [],
        compression: data.compression || null
      };

      // Save to SQLite
      db.saveSession(session);
      migrated++;
      console.log(`  ✅ Migrated: ${file} (${session.messages.length} messages)`);
      
    } catch (error: any) {
      failed++;
      const errorMsg = `${file}: ${error.message}`;
      errors.push(errorMsg);
      console.log(`  ❌ Failed: ${errorMsg}`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Migration Summary');
  console.log('='.repeat(50));
  console.log(`  ✅ Successfully migrated: ${migrated}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`  📁 Total sessions in DB: ${db.getSessionCount()}`);

  if (migrated > 0) {
    // Create backup of original files
    console.log(`\n🗄️  Creating backup of original JSON files...`);
    await fs.ensureDir(BACKUP_DIR);
    
    for (const file of jsonFiles) {
      const src = path.join(SESSIONS_DIR, file);
      const dest = path.join(BACKUP_DIR, file);
      await fs.copy(src, dest);
    }
    
    console.log(`  ✅ Backup created at: ${BACKUP_DIR}`);
    console.log('\n⚠️  Original JSON files have been backed up.');
    console.log('   You can safely delete the sessions/ directory after verifying the migration.');
  }

  if (errors.length > 0) {
    console.log('\n⚠️  Errors encountered:');
    errors.forEach(e => console.log(`   - ${e}`));
  }

  console.log('\n✨ Migration complete!\n');
}

// Run migration
migrateSessionsToSQLite()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  });

