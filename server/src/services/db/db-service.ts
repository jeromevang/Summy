/**
 * Database Service
 * Main database service that combines all database functionality
 */

import { dbManager } from './connection.js';
import { DatabaseOperations } from './operations.js';
import { addDebugEntry } from '../logger.js';

// Re-export common operations for convenience
export const db = {
  query: (..._args: any[]) => DatabaseOperations.query(..._args),
  get: (..._args: any[]) => DatabaseOperations.get(..._args),
  insert: (..._args: any[]) => DatabaseOperations.insert(..._args),
  update: (..._args: any[]) => DatabaseOperations.update(..._args),
  delete: (..._args: any[]) => DatabaseOperations.delete(..._args),
  transaction: (..._args: any[]) => DatabaseOperations.transaction(..._args),
  getTableStats: (..._args: any[]) => DatabaseOperations.getTableStats(..._args),
  getHealthCheck: (..._args: any[]) => DatabaseOperations.getHealthCheck(..._args),
  cleanupOldRecords: (..._args: any[]) => DatabaseOperations.cleanupOldRecords(..._args),
  optimize: (..._args: any[]) => DatabaseOperations.optimize(..._args),
  getRecentActivity: (..._args: any[]) => DatabaseOperations.getRecentActivity(..._args)
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
