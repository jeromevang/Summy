/**
 * Rollback System
 * Manages file backups and restoration for tool operations
 */

import fs from 'fs-extra';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
// Removed DB imports as we are moving to file-based backups
// import { db, FileBackup } from '../../services/database.js';
// Removed DB notifications import
// import { notifications } from '../../services/notifications.js';

// ============================================================ 
// TYPES
// ============================================================ 

export interface RollbackResult {
  success: boolean;
  filePath: string;
  message: string;
}

// Define a simple type for backup map entries
interface BackupInfo {
  originalFilePath: string;
  backupFilePath: string;
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
  // retentionHours is no longer directly used for DB cleanup, but might be relevant for file cleanup logic later
  // retentionHours: number = 24;

  // Constants for file-based backup management
  private readonly TEMP_BASE_DIR: string = 'C:/Users/jvgeu/.gemini/tmp/56da5016ba1b35bedd32c75a0ffca4b1925601bfe2a9beee7b5f170f1f2c6023';
  private readonly BACKUP_SUBDIR: string = 'backups';
  private readonly BACKUP_DIR: string = path.join(this.TEMP_BASE_DIR, this.BACKUP_SUBDIR);
  private readonly BACKUP_MAP_FILE: string = path.join(this.TEMP_BASE_DIR, 'backup_map.json');

  /**
   * Creates a backup of a file to the local file system.
   * Returns the backup ID if successful, null if file doesn't exist or an error occurs.
   */
  async createBackup(
    filePath: string,
    executionLogId: string // Kept for context, though not directly used in file naming/mapping here
  ): Promise<string | null> {
    try {
      const absolutePath = path.resolve(filePath);
      
      // Check if file exists
      if (!await fs.pathExists(absolutePath)) {
        // File doesn't exist (new file), no backup needed
        return null;
      }

      // Read original content
      const originalContent = await fs.readFile(absolutePath, 'utf-8');

      const backupId = uuidv4();
      const backupFileName = `${backupId}-${path.basename(filePath)}`;
      const backupFilePath = path.join(thisD.BACKUP_DIR, backupFileName);

      // Ensure backup directory exists
      await fs.ensureDir(this.BACKUP_DIR);

      // Write the backup file
      await fs.writeFile(backupFilePath, originalContent, 'utf-8');

      // Update the backup map file to store the mapping between backupId and file paths
      let backupMap: Record<string, BackupInfo> = {};
      try {
        if (await fs.pathExists(this.BACKUP_MAP_FILE)) {
          const mapData = await fs.readFile(this.BACKUP_MAP_FILE, 'utf-8');
          backupMap = JSON.parse(mapData);
        }
      } catch (e) {
        console.error(`[Rollback] Error reading backup map ${this.BACKUP_MAP_FILE}:`, e);
        // Proceeding, will overwrite the map if read failed
      }

      backupMap[backupId] = { originalFilePath: absolutePath, backupFilePath: backupFilePath };
      await fs.writeFile(this.BACKUP_MAP_FILE, JSON.stringify(backupMap, null, 2), 'utf-8');

      console.log(`[Rollback] Created file backup ${backupId} for ${filePath} at ${backupFilePath}`);
      return backupId;

    } catch (error: any) {
      console.error(`[Rollback] Failed to create file backup for ${filePath}:`, error.message);
      return null;
    }
  }

  /**
   * Restores a file from a previously created backup.
   */
  async restore(backupId: string): Promise<RollbackResult> {
    try {
      // Read backup map to find file paths
      let backupMap: Record<string, BackupInfo> = {};
      if (!await fs.pathExists(this.BACKUP_MAP_FILE)) {
        return { success: false, filePath: '', message: 'Backup map file not found.' };
      }
      try {
        const mapData = await fs.readFile(this.BACKUP_MAP_FILE, 'utf-utf-8');
        backupMap = JSON.parse(mapData);
      } catch (e) {
        console.error(`[Rollback] Error reading backup map ${this.BACKUP_MAP_FILE}:`, e);
        return { success: false, filePath: '', message: 'Failed to read backup map.' };
      }

      const backupInfo = backupMap[backupId];
      if (!backupInfo) {
        return { success: false, filePath: '', message: `Backup ID ${backupId} not found in map.` };
      }

      const { originalFilePath, backupFilePath } = backupInfo;

      // Check if the backup file exists
      if (!await fs.pathExists(backupFilePath)) {
        return { success: false, filePath: originalFilePath, message: `Backup file not found at ${backupFilePath}` };
      }

      // Read content from backup file
      const originalContent = await fs.readFile(backupFilePath, 'utf-8');

      // Write content back to the original file path
      await fs.writeFile(originalFilePath, originalContent, 'utf-8');

      // Remove the entry from the map after successful restore
      delete backupMap[backupId];
      await fs.writeFile(this.BACKUP_MAP_FILE, JSON.stringify(backupMap, null, 2), 'utf-8');

      console.log(`[Rollback] Restored ${originalFilePath} from backup ${backupId}`);
      
      // Removed database notifications as they are not available in this context
      // notifications.success(
      //   '↩️ File restored',
      //   `Restored ${path.basename(originalFilePath)} to previous state`
      // );

      return {
        success: true,
        filePath: originalFilePath,
        message: 'File restored successfully'
      };

    } catch (error: any) {
      console.error(`[Rollback] Failed to restore backup ${backupId}:`, error.message);
      return {
        success: false,
        filePath: '', // filePath might not be reliably retrieved if map read fails
        message: `Restore failed: ${error.message}`
      };
    }
  }

  // Removed DB-specific methods: getBackupsForExecution, canRestore, getTimeRemaining, runCleanup
  // These would need reimplementation for file-based management if desired.

  /**
   * Checks if a tool supports file modification that would trigger a backup.
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
 * Wrapper function to execute a tool with automatic file backup
 */
export async function executeWithBackup<T>(
  toolName: string,
  filePath: string | undefined,
  executionLogId: string,
  operation: () => Promise<T>
): Promise<{ result: T; backupId: string | null }> {
  let backupId: string | null = null;

  // Create backup if this is a file-modifying tool and filePath is provided
  if (filePath && rollback.toolSupportsRollback(toolName)) {
    // Pass filePath and executionLogId to the new createBackup implementation
    backupId = await rollback.createBackup(filePath, executionLogId);
  }

  try {
    const result = await operation();
    return { result, backupId };
  } catch (error) {
    // If operation failed, we now have a backup file on disk and a map entry.
    // Future implementation could add auto-restore logic here.
    throw error;
  }
}