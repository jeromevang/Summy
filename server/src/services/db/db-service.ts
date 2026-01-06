/**
 * Database Service
 * Main database service that combines all database functionality
 */

import { dbManager } from './connection.js';
import { DatabaseOperations } from './operations.js';
import { addDebugEntry } from '../logger.js';

// Re-export common operations for convenience
export const db = {
  query: DatabaseOperations.query.bind(DatabaseOperations),
  get: DatabaseOperations.get.bind(DatabaseOperations),
  insert: DatabaseOperations.insert.bind(DatabaseOperations),
  update: DatabaseOperations.update.bind(DatabaseOperations),
  delete: DatabaseOperations.delete.bind(DatabaseOperations),
  transaction: DatabaseOperations.transaction.bind(DatabaseOperations),
  getTableStats: DatabaseOperations.getTableStats.bind(DatabaseOperations),
  getHealthCheck: DatabaseOperations.getHealthCheck.bind(DatabaseOperations),
  cleanupOldRecords: DatabaseOperations.cleanupOldRecords.bind(DatabaseOperations),
  optimize: DatabaseOperations.optimize.bind(DatabaseOperations),
  getRecentActivity: DatabaseOperations.getRecentActivity.bind(DatabaseOperations)
};

// Re-export connection manager
export { dbManager };

// Re-export schema utilities
export { initializeDatabase, SCHEMA_SQL } from './schema.js';
export { DB_PATH } from './db-base';

/**
 * Database service initialization
 */
export async function initializeDatabaseService(): Promise<void> {
  try {
    await dbManager.initialize();
    addDebugEntry('session', 'Database service initialized successfully');
  } catch (error) {
    addDebugEntry('error', `Database service initialization failed: ${error}`);
    throw error;
  }
}

/**
 * Database service shutdown
 */
export function shutdownDatabaseService(): void {
  try {
    dbManager.close();
    addDebugEntry('session', 'Database service shutdown completed');
  } catch (error) {
    addDebugEntry('error', `Database service shutdown failed: ${error}`);
  }
}

/**
 * Get database status
 */
export function getDatabaseStatus(): {
  isReady: boolean;
  stats: any;
  health: any;
} {
  return {
    isReady: dbManager.isReady(),
    stats: dbManager.isReady() ? dbManager.getStats() : null,
    health: dbManager.isReady() ? DatabaseOperations.getHealthCheck() : null
  };
}
