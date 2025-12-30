import { db } from '../src/services/database.js';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCHEMA_SQL = `
-- File metadata
CREATE TABLE IF NOT EXISTS code_index (
    file_path TEXT PRIMARY KEY,
    scope TEXT,
    exports TEXT,
    inputs TEXT,
    outputs TEXT,
    libraries TEXT,
    category TEXT,
    tags TEXT,
    complexity TEXT,
    lines_count INTEGER,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Function-level chunks (from AST parsing)
CREATE TABLE IF NOT EXISTS code_chunks (
    id TEXT PRIMARY KEY,
    file_path TEXT NOT NULL,
    symbol_name TEXT NOT NULL,
    symbol_type TEXT NOT NULL,
    content TEXT,
    inputs TEXT,
    outputs TEXT,
    start_line INTEGER,
    end_line INTEGER,
    dependencies TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (file_path) REFERENCES code_index(file_path)
);

-- Dependency relationships
CREATE TABLE IF NOT EXISTS code_dependencies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_chunk_id TEXT,
    target_chunk_id TEXT,
    dependency_type TEXT NOT NULL,
    metadata TEXT,
    FOREIGN KEY (source_chunk_id) REFERENCES code_chunks(id),
    FOREIGN KEY (target_chunk_id) REFERENCES code_chunks(id)
);
`;

async function run() {
  console.log('🛠️ RESETTING CODE INDEX TABLES...');
  const connection = db.getConnection();
  connection.exec('DROP TABLE IF EXISTS code_dependencies');
  connection.exec('DROP TABLE IF EXISTS code_chunks');
  connection.exec('DROP TABLE IF EXISTS code_index');
  connection.exec(SCHEMA_SQL);
  console.log('✅ Tables created successfully with updated schema.');
}

run().catch(err => {
  console.error('❌ Initialization failed:', err.message);
});
