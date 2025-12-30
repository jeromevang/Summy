import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Main project database path
const DB_PATH = path.join(__dirname, '../../../data/summy.db');

export class CodeIndexDatabase {
  private db: Database.Database;

  constructor() {
    // Ensure database file exists (though server should have created it)
    fs.ensureDirSync(path.dirname(DB_PATH));
    
    this.db = new Database(DB_PATH);
    this.configureDatabase();
  }

  private configureDatabase(): void {
    this.db.exec('PRAGMA foreign_keys = ON');
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA busy_timeout = 5000');
  }

  getConnection(): Database.Database {
    return this.db;
  }

  close(): void {
    this.db.close();
  }
}

export const db = new CodeIndexDatabase();
