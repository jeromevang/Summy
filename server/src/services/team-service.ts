import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { workspaceService } from './workspace-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEAMS_FILE = path.join(__dirname, '../../data/teams.json');

export interface AgentConfig {
  id: string;
  name: string;
  role: string;
  model: string;
}

export interface TeamConfig {
  mainModelId: string;
  executorEnabled: boolean;
  executorModelId: string;
  agents: AgentConfig[];
  updatedAt: string;
}

interface TeamsDatabase {
  [projectPath: string]: TeamConfig;
}

class TeamService {
  private db: TeamsDatabase;

  constructor() {
    this.db = this.loadDb();
  }

  private loadDb(): TeamsDatabase {
    try {
      if (fs.existsSync(TEAMS_FILE)) {
        return fs.readJsonSync(TEAMS_FILE);
      }
    } catch (e) {
      console.error('[TeamService] Failed to load DB:', e);
    }
    return {};
  }

  private saveDb() {
    try {
      fs.ensureDirSync(path.dirname(TEAMS_FILE));
      fs.writeJsonSync(TEAMS_FILE, this.db, { spaces: 2 });
    } catch (e) {
      console.error('[TeamService] Failed to save DB:', e);
    }
  }

  /**
   * Get team config for the current workspace
   */
  getCurrentTeam(): TeamConfig | null {
    const currentPath = workspaceService.getCurrentWorkspace();
    return this.db[currentPath] || null;
  }

  /**
   * Save team config for the current workspace
   */
  saveCurrentTeam(config: Omit<TeamConfig, 'updatedAt'>): TeamConfig {
    const currentPath = workspaceService.getCurrentWorkspace();
    
    const newConfig: TeamConfig = {
      ...config,
      updatedAt: new Date().toISOString()
    };

    this.db[currentPath] = newConfig;
    this.saveDb();
    
    console.log(`[TeamService] Saved team for ${currentPath}`);
    return newConfig;
  }
}

export const teamService = new TeamService();
