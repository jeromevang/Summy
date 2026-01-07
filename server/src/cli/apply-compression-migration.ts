#!/usr/bin/env tsx
/**
 * Apply Compression Tables Migration
 *
 * Applies the compression_sessions and compression_turns tables to the Summy database.
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database path (same as server)
const DB_PATH = path.join(__dirname, '../../../data/summy.db');

const MIGRATION_SQL = `
-- Compression Sessions Table
CREATE TABLE IF NOT EXISTS compression_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  claude_session_id TEXT UNIQUE,
  transcript_hash TEXT NOT NULL,
  uncompressed_data TEXT NOT NULL,
  compressed_data TEXT,
  compression_enabled INTEGER DEFAULT 1,
  compression_mode TEXT DEFAULT 'conservative',
  llm_provider TEXT DEFAULT 'lmstudio',
  use_rag INTEGER DEFAULT 0,
  decisions TEXT,
  stats TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_compression_sessions_claude_id ON compression_sessions(claude_session_id);
CREATE INDEX IF NOT EXISTS idx_compression_sessions_enabled ON compression_sessions(compression_enabled);
CREATE INDEX IF NOT EXISTS idx_compression_sessions_created ON compression_sessions(created_at);

-- Compression Turns Table
CREATE TABLE IF NOT EXISTS compression_turns (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL,
  turn_number INTEGER NOT NULL,
  message_count INTEGER NOT NULL,
  uncompressed_snapshot TEXT NOT NULL,
  compressed_snapshot TEXT NOT NULL,
  decisions TEXT,
  stats TEXT,
  trigger_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (session_id) REFERENCES compression_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_compression_turns_session ON compression_turns(session_id, turn_number);
CREATE INDEX IF NOT EXISTS idx_compression_turns_created ON compression_turns(created_at);
`;

async function main() {
  console.log('Applying compression tables migration...\n');

  try {
    // Ensure data directory exists
    const dataDir = path.dirname(DB_PATH);
    await fs.ensureDir(dataDir);

    // Connect to database
    const db = new Database(DB_PATH, {
      verbose: (msg) => console.log('[SQL]', msg)
    });

    // Enable foreign keys
    db.exec('PRAGMA foreign_keys = ON');

    console.log(`Database: ${DB_PATH}\n`);

    // Check if tables already exist
    const sessionsExists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='compression_sessions'"
    ).get();

    const turnsExists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='compression_turns'"
    ).get();

    if (sessionsExists && turnsExists) {
      console.log('✓ Compression tables already exist. Skipping migration.');
      db.close();
      return;
    }

    // Apply migration
    console.log('Applying migration...\n');
    db.exec(MIGRATION_SQL);

    // Verify tables were created
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'compression%' ORDER BY name"
    ).all();

    console.log('\n✅ Migration applied successfully!\n');
    console.log('Created tables:');
    tables.forEach((table: any) => {
      console.log(`  - ${table.name}`);

      // Show column count
      const columns = db.prepare(`PRAGMA table_info(${table.name})`).all();
      console.log(`    Columns: ${columns.length}`);
    });

    // Show indexes
    console.log('\nCreated indexes:');
    const indexes = db.prepare(
      "SELECT name, tbl_name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_compression%' ORDER BY tbl_name, name"
    ).all();

    indexes.forEach((index: any) => {
      console.log(`  - ${index.name} (${index.tbl_name})`);
    });

    db.close();
    console.log('\n✓ Database connection closed.');
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

main().catch(console.error);
