/**
 * MCP Orchestrator
 * Generates and manages per-model MCP configurations
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import type {
  MCPModelConfig,
  ModelOptimalSettings,
  ContextBudget,
  RAGSettings,
  TOOL_TIERS,
  ProbeRunResult,
  ProstheticConfig
} from '../types.js';

import { prostheticPromptBuilder } from './prosthetic-prompt-builder.js';
import { prostheticStore } from '../learning/prosthetic-store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Config directory (relative to mcp-server)
const CONFIG_DIR = path.resolve(__dirname, '../../../../../mcp-server/configs');

// ============================================================
// DEFAULT CONFIGURATIONS
// ============================================================

export const DEFAULT_CONTEXT_BUDGET: ContextBudget = {
  total: 32000,
  systemPrompt: 2000,
  toolSchemas: 4000,
  memory: 1000,
  ragResults: 8000,
  history: 12000,
  reserve: 5000
};

export const DEFAULT_RAG_SETTINGS: RAGSettings = {
  chunkSize: 1000,
  chunkOverlap: 200,
  resultCount: 5,
  includeSummaries: true,
  includeGraph: false
};

export const DEFAULT_OPTIMAL_SETTINGS: ModelOptimalSettings = {
  toolFormat: 'openai',
  maxToolsPerCall: 10,
  descriptionStyle: 'verbose',
  systemPromptTemplate: 'agentic-coding',
  contextBudget: DEFAULT_CONTEXT_BUDGET,
  ragSettings: DEFAULT_RAG_SETTINGS
};

// ============================================================
// TOOL TIER DEFINITIONS
// ============================================================

export const ESSENTIAL_TOOLS = [
  'rag_query', 'rag_status',
  'read_file', 'read_multiple_files', 'write_file', 'edit_file',
  'list_directory', 'search_files', 'get_file_info',
  'git_status', 'git_diff', 'git_add', 'git_commit',
  'shell_exec', 'memory_store'
];

export const STANDARD_TOOLS = [
  ...ESSENTIAL_TOOLS,
  'rag_index',
  'delete_file', 'copy_file', 'move_file',
  'create_directory', 'delete_directory', 'list_allowed_directories',
  'git_init', 'git_push', 'git_pull', 'git_checkout',
  'git_stash', 'git_stash_pop', 'git_reset', 'git_clone',
  'git_branch_create', 'git_branch_list', 'git_blame', 'git_show',
  'run_python', 'run_node', 'run_typescript',
  'memory_retrieve', 'memory_list', 'memory_delete'
];

export const FULL_TOOLS = [
  ...STANDARD_TOOLS,
  'npm_run', 'npm_install', 'npm_uninstall', 'npm_init',
  'npm_test', 'npm_build', 'npm_list',
  'http_request', 'url_fetch_content', 'web_search',
  'browser_navigate', 'browser_go_back', 'browser_go_forward',
  'browser_click', 'browser_type', 'browser_hover',
  'browser_select_option', 'browser_press_key', 'browser_snapshot',
  'browser_fetch_content', 'browser_take_screenshot', 'browser_wait',
  'browser_resize', 'browser_handle_dialog', 'browser_drag',
  'browser_tabs', 'browser_evaluate', 'browser_console_messages',
  'browser_network_requests',
  'text_summarize', 'diff_files',
  'process_list', 'process_kill',
  'zip_create', 'zip_extract',
  'mcp_rules', 'env_get', 'env_set',
  'json_parse', 'base64_encode', 'base64_decode'
];

// ============================================================
// ORCHESTRATOR CLASS
// ============================================================

export class MCPOrchestrator {
  private configDir: string;

  constructor() {
    this.configDir = CONFIG_DIR;
  }

  /**
   * Ensure config directories exist
   */
  async ensureDirectories(): Promise<void> {
    await fs.ensureDir(path.join(this.configDir, 'models'));
    await fs.ensureDir(path.join(this.configDir, 'templates'));
  }

  /**
   * Get the config path for a model
   */
  getConfigPath(modelId: string): string {
    // Sanitize model ID for filename
    const safeId = modelId.replace(/[^a-zA-Z0-9-_.]/g, '_');
    return path.join(this.configDir, 'models', `${safeId}.json`);
  }

  /**
   * Load existing config for a model
   */
  async loadConfig(modelId: string): Promise<MCPModelConfig | null> {
    const configPath = this.getConfigPath(modelId);

    try {
      if (await fs.pathExists(configPath)) {
        return await fs.readJson(configPath);
      }
    } catch (error) {
      console.error(`[MCP Orchestrator] Error loading config for ${modelId}:`, error);
    }

    return null;
  }

  /**
   * Save config for a model
   */
  async saveConfig(config: MCPModelConfig): Promise<string> {
    await this.ensureDirectories();
    const configPath = this.getConfigPath(config.modelId);

    await fs.writeJson(configPath, config, { spaces: 2 });
    console.log(`[MCP Orchestrator] Saved config for ${config.modelId}`);

    return configPath;
  }

  /**
   * Generate optimized config from test results
   */
  generateConfigFromResults(
    modelId: string,
    testResults: {
      toolFormat: 'openai' | 'xml';
      optimalToolCount?: number;
      descriptionPreference?: 'verbose' | 'concise';
      ragPerformance?: number;
      contextPerformance?: Record<number, number>;
      failedTools?: string[];
    }
  ): MCPModelConfig {
    // Determine tool set based on success rate
    let enabledTools: string[];
    if (testResults.optimalToolCount && testResults.optimalToolCount <= 15) {
      enabledTools = [...ESSENTIAL_TOOLS];
    } else if (testResults.optimalToolCount && testResults.optimalToolCount <= 35) {
      enabledTools = [...STANDARD_TOOLS];
    } else {
      enabledTools = [...FULL_TOOLS];
    }

    // Remove failed tools
    const disabledTools = testResults.failedTools || [];
    enabledTools = enabledTools.filter(t => !disabledTools.includes(t));

    // Build system prompt additions based on capabilities
    const systemPromptAdditions: string[] = [];

    if (testResults.ragPerformance && testResults.ragPerformance >= 80) {
      // Model is good at RAG, encourage it
      systemPromptAdditions.push('PREFERRED: Use rag_query to search the codebase before reading files directly.');
    } else if (testResults.ragPerformance && testResults.ragPerformance < 50) {
      // Model struggles with RAG, simplify
      systemPromptAdditions.push('NOTE: For code questions, you may read files directly if semantic search is unclear.');
    }

    // Calculate optimal context budget based on context performance
    let optimalTotal = 32000;
    if (testResults.contextPerformance) {
      const contexts = Object.entries(testResults.contextPerformance);
      const bestContext = contexts
        .filter(([_, latency]) => latency < 10000) // Under 10s
        .sort((a, b) => Number(b[0]) - Number(a[0]))[0];

      if (bestContext) {
        optimalTotal = Number(bestContext[0]);
      }
    }

    const contextBudget: ContextBudget = {
      total: optimalTotal,
      systemPrompt: Math.min(2000, optimalTotal * 0.06),
      toolSchemas: Math.min(4000, optimalTotal * 0.12),
      memory: Math.min(1000, optimalTotal * 0.03),
      ragResults: Math.min(8000, optimalTotal * 0.25),
      history: Math.min(12000, optimalTotal * 0.38),
      reserve: Math.min(5000, optimalTotal * 0.16)
    };

    // Determine RAG settings
    const ragSettings: RAGSettings = {
      chunkSize: testResults.ragPerformance && testResults.ragPerformance >= 70 ? 1500 : 800,
      chunkOverlap: 200,
      resultCount: testResults.ragPerformance && testResults.ragPerformance >= 70 ? 7 : 3,
      includeSummaries: testResults.ragPerformance ? testResults.ragPerformance >= 60 : true,
      includeGraph: testResults.ragPerformance ? testResults.ragPerformance >= 80 : false
    };

    return {
      modelId,
      toolFormat: testResults.toolFormat,
      enabledTools,
      disabledTools,
      toolOverrides: {},
      systemPromptAdditions,
      contextBudget,
      optimalSettings: {
        maxToolsPerCall: testResults.optimalToolCount || 8,
        ragChunkSize: ragSettings.chunkSize,
        ragResultCount: ragSettings.resultCount
      },
      prosthetic: {
        modelId,
        level1Prompts: [],
        level2Constraints: [],
        level3Interventions: [],
        level4Disqualifications: []
      }
    };
  }

  /**
   * Enrich config with Prosthetic Intelligence from probe results
   */
  addProstheticIntelligence(config: MCPModelConfig, probeResults: ProbeRunResult): MCPModelConfig {
    const prostheticConfig = prostheticPromptBuilder.build(probeResults);

    // Add Level 1 prompts to system additions dynamically
    prostheticConfig.level1Prompts.forEach(p => {
      if (!config.systemPromptAdditions.includes(p)) {
        config.systemPromptAdditions.push(p);
      }
    });

    config.prosthetic = prostheticConfig;
    return config;
  }

  /**
   * Get tool schema overrides for a model
   */
  getToolSchemaOverrides(config: MCPModelConfig): Record<string, any> {
    const overrides: Record<string, any> = {};

    for (const [toolName, override] of Object.entries(config.toolOverrides)) {
      overrides[toolName] = {
        description: override.description,
        priority: override.priority
      };
    }

    return overrides;
  }

  /**
   * Build complete system prompt for a model
   * Automatically applies prosthetic prompt if one exists for the model
   */
  buildSystemPrompt(
    config: MCPModelConfig,
    basePrompt: string,
    injectedMemories?: string[]
  ): string {
    const parts: string[] = [];

    // Auto-apply prosthetic prompt if certified (prepended for highest priority)
    const prosthetic = prostheticStore.getPrompt(config.modelId);
    if (prosthetic && prosthetic.verified) {
      parts.push('## Agentic Readiness Compensations (Auto-Applied)');
      parts.push(prosthetic.prompt);
      parts.push('');
      
      // Increment successful runs counter
      prostheticStore.incrementSuccess(config.modelId);
    }

    // Base prompt
    parts.push(basePrompt);

    // Model-specific additions
    if (config.systemPromptAdditions.length > 0) {
      parts.push('\n\n## Model-Specific Instructions');
      parts.push(config.systemPromptAdditions.join('\n'));
    }

    // Injected memories
    if (injectedMemories && injectedMemories.length > 0) {
      parts.push('\n\n## Learned Preferences');
      parts.push(injectedMemories.join('\n'));
    }

    return parts.join('\n');
  }

  /**
   * Check if a model has a prosthetic applied
   */
  hasProsthetic(modelId: string): boolean {
    return prostheticStore.hasProsthetic(modelId);
  }

  /**
   * Get prosthetic info for a model
   */
  getProstheticInfo(modelId: string): { level: number; verified: boolean; successfulRuns: number } | null {
    const prosthetic = prostheticStore.getPrompt(modelId);
    if (!prosthetic) return null;
    
    return {
      level: prosthetic.level,
      verified: prosthetic.verified,
      successfulRuns: prosthetic.successfulRuns
    };
  }

  /**
   * List all saved configs
   */
  async listConfigs(): Promise<string[]> {
    await this.ensureDirectories();

    try {
      const files = await fs.readdir(path.join(this.configDir, 'models'));
      return files
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace('.json', ''));
    } catch (error) {
      return [];
    }
  }

  /**
   * Delete config for a model
   */
  async deleteConfig(modelId: string): Promise<boolean> {
    const configPath = this.getConfigPath(modelId);

    try {
      if (await fs.pathExists(configPath)) {
        await fs.remove(configPath);
        console.log(`[MCP Orchestrator] Deleted config for ${modelId}`);
        return true;
      }
    } catch (error) {
      console.error(`[MCP Orchestrator] Error deleting config for ${modelId}:`, error);
    }

    return false;
  }
}

// Export singleton instance
export const mcpOrchestrator = new MCPOrchestrator();

export default mcpOrchestrator;

