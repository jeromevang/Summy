/**
 * Database Service
 * Main database service that combines all database functionality
 */

import { dbManager } from './connection.js';
import { DatabaseOperations } from './operations.js';
import { addDebugEntry } from '../logger.js';

// Re-export common operations for convenience
export const db = {
  query: (...args: any[]) => DatabaseOperations.query(...args),
  get: (...args: any[]) => DatabaseOperations.get(...args),
  insert: (...args: any[]) => DatabaseOperations.insert(...args),
  update: (...args: any[]) => DatabaseOperations.update(...args),
  delete: (...args: any[]) => DatabaseOperations.delete(...args),
  transaction: (...args: any[]) => DatabaseOperations.transaction(...args),
  getTableStats: (...args: any[]) => DatabaseOperations.getTableStats(...args),
  getHealthCheck: (...args: any[]) => DatabaseOperations.getHealthCheck(...args),
  cleanupOldRecords: (...args: any[]) => DatabaseOperations.cleanupOldRecords(...args),
  optimize: (...args: any[]) => DatabaseOperations.optimize(...args),
  getRecentActivity: (...args: any[]) => DatabaseOperations.getRecentActivity(...args)
};

// Re-export connection manager
export { dbManager };

// Re-export schema utilities
export { initializeDatabase, SCHEMA_SQL, DB_PATH } from './schema.js';

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
