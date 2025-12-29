/**
 * Database Operations
 * Common database operations and queries
 */

import { dbManager } from './connection.js';
import { addDebugEntry } from '../logger.js';

export class DatabaseOperations {
  /**
   * Execute a query with parameters
   */
  static query<T = any>(sql: string, params: any[] = []): T[] {
    const db = dbManager.getConnection();
    const stmt = db.prepare(sql);
    return stmt.all(...params) as T[];
  }

  /**
   * Execute a single query
   */
  static get<T = any>(sql: string, params: any[] = []): T | undefined {
    const db = dbManager.getConnection();
    const stmt = db.prepare(sql);
    return stmt.get(...params) as T | undefined;
  }

  /**
   * Execute an insert operation
   */
  static insert(sql: string, params: any[] = []): number {
    const db = dbManager.getConnection();
    const stmt = db.prepare(sql);
    const result = stmt.run(...params);
    return result.lastInsertRowid as number;
  }

  /**
   * Execute an update operation
   */
  static update(sql: string, params: any[] = []): number {
    const db = dbManager.getConnection();
    const stmt = db.prepare(sql);
    const result = stmt.run(...params);
    return result.changes;
  }

  /**
   * Execute a delete operation
   */
  static delete(sql: string, params: any[] = []): number {
    const db = dbManager.getConnection();
    const stmt = db.prepare(sql);
    const result = stmt.run(...params);
    return result.changes;
  }

  /**
   * Execute a transaction
   */
  static async transaction<T>(callback: (db: any) => T): Promise<T> {
    return await dbManager.executeTransaction(callback);
  }

  /**
   * Get table statistics
   */
  static getTableStats(tableName: string): { count: number; size: number } {
    try {
      const count = this.get<number>('SELECT COUNT(*) as count FROM ?', [tableName]);
      const size = this.get<number>('SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()', []);
      
      return {
        count: count || 0,
        size: size || 0
      };
    } catch (error) {
      addDebugEntry('error', `Failed to get table stats for ${tableName}: ${error}`);
      return { count: 0, size: 0 };
    }
  }

  /**
   * Get database health check
   */
  static getHealthCheck(): {
    isHealthy: boolean;
    tables: { name: string; count: number }[];
    totalSize: number;
    lastModified: string;
  } {
    const tables = [
      'sessions', 'analytics', 'execution_logs', 'file_backups',
      'notifications', 'model_profiles', 'test_history', 'failure_log',
      'prosthetic_prompts', 'combo_test_results', 'context_sessions'
    ];

    const result = {
      isHealthy: true,
      tables: [] as { name: string; count: number }[],
      totalSize: 0,
      lastModified: new Date().toISOString()
    };

    try {
      for (const table of tables) {
        const count = this.get<number>(`SELECT COUNT(*) as count FROM ${table}`);
        result.tables.push({ name: table, count: count || 0 });
      }

      result.totalSize = dbManager.getFileSize();
    } catch (error) {
      addDebugEntry('error', `Database health check failed: ${error}`);
      result.isHealthy = false;
    }

    return result;
  }

  /**
   * Clean up old records
   */
  static async cleanupOldRecords(daysToKeep: number = 30): Promise<{
    deletedSessions: number;
    deletedLogs: number;
    deletedBackups: number;
    deletedNotifications: number;
  }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    const cutoffStr = cutoffDate.toISOString();

    const result = {
      deletedSessions: 0,
      deletedLogs: 0,
      deletedBackups: 0,
      deletedNotifications: 0
    };

    try {
      await this.transaction((db) => {
        // Delete old sessions
        const deleteSessions = db.prepare('DELETE FROM sessions WHERE created_at < ?');
        result.deletedSessions = deleteSessions.run(cutoffStr).changes;

        // Delete old execution logs
        const deleteLogs = db.prepare('DELETE FROM execution_logs WHERE timestamp < ?');
        result.deletedLogs = deleteLogs.run(cutoffStr).changes;

        // Delete old file backups
        const deleteBackups = db.prepare('DELETE FROM file_backups WHERE created_at < ?');
        result.deletedBackups = deleteBackups.run(cutoffStr).changes;

        // Delete old notifications
        const deleteNotifications = db.prepare('DELETE FROM notifications WHERE timestamp < ?');
        result.deletedNotifications = deleteNotifications.run(cutoffStr).changes;
      });

      addDebugEntry('session', `Cleanup completed: ${JSON.stringify(result)}`);
    } catch (error) {
      addDebugEntry('error', `Cleanup failed: ${error}`);
    }

    return result;
  }

  /**
   * Optimize database
   */
  static async optimize(): Promise<void> {
    try {
      await dbManager.vacuum();
      addDebugEntry('session', 'Database optimization completed');
    } catch (error) {
      addDebugEntry('error', `Database optimization failed: ${error}`);
    }
  }

  /**
   * Get recent activity
   */
  static getRecentActivity(hours: number = 24): {
    sessions: number;
    logs: number;
    errors: number;
    notifications: number;
  } {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - hours);
    const cutoffStr = cutoffDate.toISOString();

    return {
      sessions: this.get<number>(`SELECT COUNT(*) as count FROM sessions WHERE created_at > ?`, [cutoffStr]) || 0,
      logs: this.get<number>(`SELECT COUNT(*) as count FROM execution_logs WHERE timestamp > ?`, [cutoffStr]) || 0,
      errors: this.get<number>(`SELECT COUNT(*) as count FROM execution_logs WHERE status = 'error' AND timestamp > ?`, [cutoffStr]) || 0,
      notifications: this.get<number>(`SELECT COUNT(*) as count FROM notifications WHERE timestamp > ?`, [cutoffStr]) || 0
    };
  }
}
