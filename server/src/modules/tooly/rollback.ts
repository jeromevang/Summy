/**
 * Rollback System
 * Manages file backups and restoration for tool operations
 */

import fs from 'fs-extra';
import path from 'path';
import { db, FileBackup } from '../../services/database.js';
import { notifications } from '../../services/notifications.js';

// ============================================================
// TYPES
// ============================================================

export interface RollbackResult {
  success: boolean;
  filePath: string;
  message: string;
}

// ============================================================
// TOOLS THAT SUPPORT ROLLBACK
// ============================================================

export const ROLLBACK_SUPPORTED_TOOLS = [
  'file_write',
  'file_patch',
  'create_new_file'
];

// ============================================================
// ROLLBACK SERVICE
// ============================================================

class RollbackService {
  private retentionHours: number = 24;

  /**
   * Create a backup before a file operation
   * Returns backup ID if successful, null if file doesn't exist
   */
  async createBackup(
    filePath: string,
    executionLogId: string
  ): Promise<string | null> {
    try {
      // Check if file exists
      const absolutePath = path.resolve(filePath);
      
      if (!await fs.pathExists(absolutePath)) {
        // File doesn't exist (new file), no backup needed
        return null;
      }

      // Read original content
      const originalContent = await fs.readFile(absolutePath, 'utf-8');

      // Calculate expiration
      const expiresAt = new Date(Date.now() + this.retentionHours * 60 * 60 * 1000).toISOString();

      // Create backup in database
      const backupId = db.createBackup({
        executionLogId,
        filePath: absolutePath,
        originalContent,
        expiresAt
      });

      console.log(`[Rollback] Created backup ${backupId} for ${filePath}`);
      return backupId;

    } catch (error: any) {
      console.error(`[Rollback] Failed to create backup for ${filePath}:`, error.message);
      return null;
    }
  }

  /**
   * Restore a file from backup
   */
  async restore(backupId: string): Promise<RollbackResult> {
    try {
      // Get backup from database
      const backup = db.getBackup(backupId);
      
      if (!backup) {
        return {
          success: false,
          filePath: '',
          message: 'Backup not found'
        };
      }

      // Restore file content
      await fs.writeFile(backup.filePath, backup.originalContent, 'utf-8');

      // Mark backup as restored
      db.markBackupRestored(backupId);

      console.log(`[Rollback] Restored ${backup.filePath} from backup ${backupId}`);
      
      notifications.success(
        '↩️ File restored',
        `Restored ${path.basename(backup.filePath)} to previous state`
      );

      return {
        success: true,
        filePath: backup.filePath,
        message: 'File restored successfully'
      };

    } catch (error: any) {
      console.error(`[Rollback] Failed to restore backup ${backupId}:`, error.message);
      return {
        success: false,
        filePath: '',
        message: `Restore failed: ${error.message}`
      };
    }
  }

  /**
   * Get backup info for an execution log
   */
  getBackupsForExecution(executionLogId: string): FileBackup[] {
    return db.getBackupsForLog(executionLogId);
  }

  /**
   * Check if a backup can be restored
   */
  canRestore(backupId: string): boolean {
    const backup = db.getBackup(backupId);
    if (!backup) return false;
    
    // Check if not expired
    const expiresAt = new Date(backup.expiresAt || 0);
    return expiresAt > new Date();
  }

  /**
   * Get time remaining before backup expires
   */
  getTimeRemaining(backupId: string): number | null {
    const backup = db.getBackup(backupId);
    if (!backup || !backup.expiresAt) return null;
    
    const expiresAt = new Date(backup.expiresAt).getTime();
    const now = Date.now();
    
    return Math.max(0, expiresAt - now);
  }

  /**
   * Format time remaining as human-readable string
   */
  formatTimeRemaining(ms: number): string {
    if (ms <= 0) return 'Expired';
    
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m remaining`;
    }
    return `${minutes}m remaining`;
  }

  /**
   * Run cleanup of expired backups
   */
  runCleanup(): { deleted: number } {
    const deleted = db.cleanupExpiredBackups();
    if (deleted > 0) {
      console.log(`[Rollback] Cleaned up ${deleted} expired backups`);
    }
    return { deleted };
  }

  /**
   * Set retention period
   */
  setRetentionHours(hours: number): void {
    this.retentionHours = hours;
    console.log(`[Rollback] Retention period set to ${hours} hours`);
  }

  /**
   * Get current retention period
   */
  getRetentionHours(): number {
    return this.retentionHours;
  }

  /**
   * Check if a tool supports rollback
   */
  toolSupportsRollback(toolName: string): boolean {
    return ROLLBACK_SUPPORTED_TOOLS.includes(toolName);
  }
}

// Export singleton
export const rollback = new RollbackService();

// ============================================================
// ROLLBACK MIDDLEWARE
// ============================================================

/**
 * Wrapper function to execute a tool with automatic backup
 */
export async function executeWithBackup<T>(
  toolName: string,
  filePath: string | undefined,
  executionLogId: string,
  operation: () => Promise<T>
): Promise<{ result: T; backupId: string | null }> {
  let backupId: string | null = null;

  // Create backup if this is a file-modifying tool
  if (filePath && rollback.toolSupportsRollback(toolName)) {
    backupId = await rollback.createBackup(filePath, executionLogId);
  }

  try {
    const result = await operation();
    return { result, backupId };
  } catch (error) {
    // If operation failed and we have a backup, we could auto-restore
    // For now, just keep the backup available for manual restore
    throw error;
  }
}

/**
 * Schedule periodic cleanup of expired backups
 */
export function scheduleBackupCleanup(intervalMs: number = 60 * 60 * 1000): NodeJS.Timeout {
  return setInterval(() => {
    rollback.runCleanup();
  }, intervalMs);
}

