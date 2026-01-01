/**
 * Database Connection Manager
 * Manages database connections and provides connection utilities
 */

import Database from 'better-sqlite3';
import { initializeDatabase } from './schema.js';
import { DB_PATH } from './db-base';
import { addDebugEntry } from '../logger.js';

export class DatabaseManager {
  private static instance: DatabaseManager;
  private db: Database.Database | null = null;
  private isInitialized = false;

  private constructor() {}

  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  /**
   * Initialize database connection
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Create database connection
      this.db = new Database(DB_PATH, {
        verbose: process.env.NODE_ENV === 'development' ? console.log : undefined
      });

      // Configure database
      this.configureDatabase();

      // Initialize schema
      initializeDatabase(this.db);

      this.isInitialized = true;
      addDebugEntry('session', `Database initialized at ${DB_PATH}`);
    } catch (error) {
      addDebugEntry('error', `Database initialization failed: ${error}`);
      throw error;
    }
  }

  /**
   * Get database connection
   */
  getConnection(): Database.Database {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  /**
   * Check if database is initialized
   */
  isReady(): boolean {
    return this.isInitialized && this.db !== null;
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.isInitialized = false;
      addDebugEntry('session', 'Database connection closed');
    }
  }

  /**
   * Configure database settings
   */
  private configureDatabase(): void {
    if (!this.db) return;

    // Enable foreign key constraints
    this.db.exec('PRAGMA foreign_keys = ON');

    // Enable WAL mode for better concurrency
    this.db.exec('PRAGMA journal_mode = WAL');

    // Set cache size
    this.db.exec('PRAGMA cache_size = 10000');

    // Set busy timeout
    this.db.exec('PRAGMA busy_timeout = 5000');

    // Enable WAL checkpointing
    this.db.exec('PRAGMA wal_autocheckpoint = 1000');
  }

  /**
   * Execute a transaction
   */
  async executeTransaction<T>(callback: (db: Database.Database) => T): Promise<T> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const transaction = this.db.transaction((callback as any));
    return transaction();
  }

  /**
   * Get database statistics
   */
  getStats(): {
    path: string;
    size: number;
    pageCount: number;
    freePageCount: number;
    schemaVersion: number;
  } {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const stats = {
      path: DB_PATH,
      size: 0,
      pageCount: 0,
      freePageCount: 0,
      schemaVersion: 0
    };

    try {
      const page_size = this.db.prepare('PRAGMA page_size').get() as any;
      const page_count = this.db.prepare('PRAGMA page_count').get() as any;
      const freelist_count = this.db.prepare('PRAGMA freelist_count').get() as any;
      const schema_version = this.db.prepare('PRAGMA schema_version').get() as any;

      stats.size = page_size.page_size * page_count.page_count;
      stats.pageCount = page_count.page_count;
      stats.freePageCount = freelist_count.freelist_count;
      stats.schemaVersion = schema_version.schema_version;
    } catch (error) {
      addDebugEntry('error', `Failed to get database stats: ${error}`);
    }

    return stats;
  }

  /**
   * Backup database
   */
  async backup(targetPath: string): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      const backup = new Database(targetPath);
      this.db.backup(backup);
      backup.close();
      addDebugEntry('session', `Database backed up to ${targetPath}`);
    } catch (error) {
      addDebugEntry('error', `Database backup failed: ${error}`);
      throw error;
    }
  }

  /**
   * Vacuum database
   */
  async vacuum(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      this.db.exec('VACUUM');
      addDebugEntry('session', 'Database vacuum completed');
    } catch (error) {
      addDebugEntry('error', `Database vacuum failed: ${error}`);
      throw error;
    }
  }

  /**
   * Get database file size
   */
  getFileSize(): number {
    try {
      const stats = require('fs').statSync(DB_PATH);
      return stats.size;
    } catch (error) {
      addDebugEntry('error', `Failed to get database file size: ${error}`);
      return 0;
    }
  }
}

// Export singleton instance
export const dbManager = DatabaseManager.getInstance();
