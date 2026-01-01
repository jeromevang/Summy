import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { workspaceService } from './workspace-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEAMS_FILE = path.join(__dirname, '../../data/teams.json');

/**
 * Represents the configuration for an individual agent within a team.
 */
export interface AgentConfig {
  /** A unique identifier for the agent. */
  id: string;
  /** The name of the agent. */
  name: string;
  /** The role or function of the agent within the team. */
  role: string;
  /** The model identifier used by this agent. */
  model: string;
}

/**
 * Represents the overall configuration for a team of agents.
 */
export interface TeamConfig {
  /** The model ID used by the main orchestrator or primary agent. */
  mainModelId: string;
  /** Indicates whether an executor agent is enabled. */
  executorEnabled: boolean;
  /** The model ID used by the executor agent. */
  executorModelId: string;
  /** An array of configurations for individual agents in the team. */
  agents: AgentConfig[];
  /** The ISO timestamp of when the team configuration was last updated. */
  updatedAt: string;
}

/**
 * Internal interface for the structure of the teams database JSON file.
 * Keys are project paths, values are TeamConfig objects.
 */
interface TeamsDatabase {
  [projectPath: string]: TeamConfig;
}

/**
 * Manages the creation, retrieval, and persistence of team configurations for different workspaces.
 * This service handles loading and saving team data to a JSON file.
 */
class TeamService {
  private db: TeamsDatabase;

  /**
   * Initializes the TeamService and loads the existing team configurations from storage.
   */
  constructor() {
    this.db = this.loadDb();
  }

  /**
   * Loads the team configurations from the `teams.json` file.
   * If the file does not exist or loading fails, an empty object is returned.
   * @returns The loaded `TeamsDatabase` object.
   */
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

  /**
   * Saves the current in-memory team configurations to the `teams.json` file.
   * Ensures the directory for the file exists before writing.
   */
  private saveDb() {
    try {
      fs.ensureDirSync(path.dirname(TEAMS_FILE));
      fs.writeJsonSync(TEAMS_FILE, this.db, { spaces: 2 });
    } catch (e) {
      console.error('[TeamService] Failed to save DB:', e);
    }
  }

  /**
   * Retrieves the team configuration for the current active workspace.
   * @returns The `TeamConfig` for the current workspace, or null if no configuration exists.
   */
  getCurrentTeam(): TeamConfig | null {
    const currentPath = workspaceService.getCurrentWorkspace();
    return this.db[currentPath] || null;
  }

  /**
   * Saves a new or updates an existing team configuration for the current workspace.
   * Automatically sets the `updatedAt` timestamp.
   * @param config - The team configuration to save, excluding the `updatedAt` field.
   * @returns The newly saved or updated `TeamConfig` object.
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

/**
 * The singleton instance of the TeamService.
 */
export const teamService = new TeamService();
