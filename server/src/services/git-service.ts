import { exec } from 'child_process';
import { promisify } from 'util';
import { workspaceService } from './workspace-service.js';

const execAsync = promisify(exec);

export interface GitStatus {
  isRepo: boolean;
  isClean: boolean;
  branch: string;
  modifiedFiles: string[];
  conflicts: boolean;
}

class GitService {
  async getStatus(): Promise<GitStatus> {
    const cwd = workspaceService.getCurrentWorkspace();
    
    try {
      // 1. Check if it's a git repo and get branch
      const { stdout: branchName } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd });
      
      // 2. Check porcelain status
      const { stdout: statusOutput } = await execAsync('git status --porcelain', { cwd });
      
      const lines = statusOutput.trim().split('\n').filter(Boolean);
      const modifiedFiles = lines.map(line => line.slice(3));
      const conflicts = lines.some(line => line.startsWith('UU') || line.startsWith('AA'));

      return {
        isRepo: true,
        isClean: lines.length === 0,
        branch: branchName.trim(),
        modifiedFiles,
        conflicts
      };
    } catch (e) {
      return {
        isRepo: false,
        isClean: true,
        branch: '',
        modifiedFiles: [],
        conflicts: false
      };
    }
  }
}

export const gitService = new GitService();
