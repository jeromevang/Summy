import { exec } from 'child_process';
import { promisify } from 'util';
import { workspaceService } from './workspace-service.js';

const execAsync = promisify(exec);

/**
 * Represents the current status of a Git repository.
 */
export interface GitStatus {
  /** True if the current workspace is a Git repository, false otherwise. */
  isRepo: boolean;
  /** True if there are no uncommitted changes, false otherwise. */
  isClean: boolean;
  /** The name of the current branch. Empty string if not a repo or detached HEAD. */
  branch: string;
  /** A list of files that have been modified (staged or unstaged). */
  modifiedFiles: string[];
  /** True if there are any merge conflicts, false otherwise. */
  conflicts: boolean;
}

/**
 * Service for interacting with Git to retrieve repository status.
 */
class GitService {
  /**
   * Retrieves the Git status of the current workspace.
   * This includes whether it's a repo, if it's clean, the current branch, modified files, and conflicts.
   * @returns A promise that resolves with a `GitStatus` object.
   */
  async getStatus(): Promise<GitStatus> {
    const cwd = workspaceService.getCurrentWorkspace();
    
    try {
      // 1. Check if it's a git repo and get branch
      const { stdout: branchName } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd });
      
      // 2. Check porcelain status to get modified files and conflicts
      const { stdout: statusOutput } = await execAsync('git status --porcelain', { cwd });
      
      const lines = statusOutput.trim().split('\n').filter(Boolean);
      const modifiedFiles = lines.map(line => line.slice(3)); // Remove status codes and spaces
      const conflicts = lines.some(line => line.startsWith('UU') || line.startsWith('AA')); // UU = unmerged, AA = added by both

      return {
        isRepo: true,
        isClean: lines.length === 0,
        branch: branchName.trim(),
        modifiedFiles,
        conflicts
      };
    } catch (e) {
      // If any git command fails, it's likely not a git repository
      return {
        isRepo: false,
        isClean: true, // If not a repo, it's "clean" in a sense (no git changes)
        branch: '',
        modifiedFiles: [],
        conflicts: false
      };
    }
  }
}

/**
 * The singleton instance of the GitService.
 */
export const gitService = new GitService();

