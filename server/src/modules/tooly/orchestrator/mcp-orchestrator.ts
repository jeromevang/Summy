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
import type {
  MCPModelConfig,
  ModelOptimalSettings,
  ContextBudget,
  RAGSettings,
  TOOL_TIERS,
  ProbeRunResult,
  ProstheticConfig,
  ModelProfile // Import ModelProfile
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
    profile: ModelProfile
  ): MCPModelConfig {
    const modelId = profile.modelId;
    const {
      agenticReadiness,
      failureProfile,
      statefulProfile,
      precedenceMatrix,
      efficiencyMetrics,
      calibration,
      contextLatency
    } = profile;

    // --- Tool Selection Logic ---
    let enabledTools: string[];
    let disabledTools: string[] = [];

    // Initial tier based on overall score
    if (agenticReadiness?.overallScore && agenticReadiness.overallScore >= 80) {
      enabledTools = [...FULL_TOOLS];
    } else if (agenticReadiness?.overallScore && agenticReadiness.overallScore >= 50) {
      enabledTools = [...STANDARD_TOOLS];
    } else {
      enabledTools = [...ESSENTIAL_TOOLS];
    }

    // Refine tool set based on specific failure modes, calibration, and precedence
    // 1. Hallucination/Tool Failure
    if (failureProfile?.hallucinationType === 'tool' || failureProfile?.failureType === 'silent' || failureProfile?.failureType === 'partial') {
        // If model frequently hallucinates or fails tools silently/partially, restrict to safer/essential tools
        if (enabledTools.length > ESSENTIAL_TOOLS.length) {
            enabledTools = [...ESSENTIAL_TOOLS]; // Fallback to essential tools
            disabledTools.push(...STANDARD_TOOLS.filter(t => !ESSENTIAL_TOOLS.includes(t)));
            disabledTools.push(...FULL_TOOLS.filter(t => !STANDARD_TOOLS.includes(t) && !ESSENTIAL_TOOLS.includes(t)));
        }
    }
    // 2. Overconfidence/High Error Rate
    if (calibration?.overconfidenceRatio && calibration.overconfidenceRatio > 0.6) {
        // If overconfident and wrong, use a stricter/safer tool set
        if (enabledTools.length > STANDARD_TOOLS.length) { // If currently FULL_TOOLS
            enabledTools = [...STANDARD_TOOLS];
            disabledTools.push(...FULL_TOOLS.filter(t => !STANDARD_TOOLS.includes(t)));
        }
    }
    // 3. Hidden Errors
    if (failureProfile?.detectability === 'hidden') {
        // If errors are hidden, be extremely cautious and prune more aggressively
        if (enabledTools.length > ESSENTIAL_TOOLS.length) {
            enabledTools = [...ESSENTIAL_TOOLS];
            disabledTools.push(...STANDARD_TOOLS.filter(t => !ESSENTIAL_TOOLS.includes(t)));
            disabledTools.push(...FULL_TOOLS.filter(t => !STANDARD_TOOLS.includes(t) && !ESSENTIAL_TOOLS.includes(t)));
        }
    }
    // 4. Precedence Matrix (Safety)
    if (precedenceMatrix?.safetyVsExecution === 'execution') {
        // If safety is often sacrificed for execution, explicitly disable risky tools.
        // This requires a mapping of risky tools, which is not yet available.
        // For now, we add a general system prompt warning.
    }
    // 5. Blocked Capabilities
    if (profile.blockedCapabilities && profile.blockedCapabilities.length > 0) {
        enabledTools = enabledTools.filter(tool => !profile.blockedCapabilities!.includes(tool));
        disabledTools.push(...profile.blockedCapabilities.filter(t => !disabledTools.includes(t)));
    }
    // Ensure no duplicates and clean up disabledTools list
    enabledTools = [...new Set(enabledTools)];
    disabledTools = [...new Set(disabledTools)];


    // --- System Prompt Additions ---
    const systemPromptAdditions: string[] = [];

    // General guidance based on overall performance
    if (agenticReadiness?.overallScore && agenticReadiness.overallScore < 50) {
      systemPromptAdditions.push('WARNING: You have limited capabilities. Stick to simple tasks and use tools cautiously.');
    }

    // Add guidance from failure profile
    if (failureProfile?.failureType === 'silent' || failureProfile?.failureType === 'recovery_failure') {
      systemPromptAdditions.push('CRITICAL: Always question assumptions. Never provide answers without verification. Admit when you cannot find information or recover from errors.');
    }
    if (failureProfile?.hallucinationType !== 'none') {
        systemPromptAdditions.push('WARNING: Do NOT hallucinate facts, code, or tool calls. If uncertain, state your uncertainty clearly.');
    }
    if (failureProfile?.detectability === 'hidden') {
        systemPromptAdditions.push('CRITICAL: Be extremely cautious and verify all facts. Your errors are hard to detect. Prioritize verifiable information.');
    }

    // Add guidance from stateful profile
    if (statefulProfile?.instructionDecayTurn && statefulProfile.instructionDecayTurn < 15) { // Shorter decay is more critical
      systemPromptAdditions.push(`REMEMBER: Pay extremely close attention to instructions, especially over long conversations. Your instruction adherence degrades rapidly around turn ${statefulProfile.instructionDecayTurn}.`);
    }

    // Add guidance from precedence matrix
    if (precedenceMatrix?.systemVsDeveloper === 'developer') {
        systemPromptAdditions.push('NOTE: Prioritize developer notes over general system instructions if they conflict.');
    } else if (precedenceMatrix?.systemVsDeveloper === 'system') {
        systemPromptAdditions.push('NOTE: Prioritize system instructions over developer notes if they conflict.');
    }
    if (precedenceMatrix?.safetyVsExecution === 'execution') {
        systemPromptAdditions.push('CRITICAL: Always prioritize safety constraints. Never execute commands that could harm the system without explicit confirmation.');
    } else if (precedenceMatrix?.safetyVsExecution === 'safety') {
        systemPromptAdditions.push('NOTE: Safety constraints are paramount; however, attempt to complete tasks if a safe execution path is clear.');
    }

    // Add guidance from efficiency metrics
    if (efficiencyMetrics?.ragWasteRatio && efficiencyMetrics.ragWasteRatio > 0.3) {
        systemPromptAdditions.push(`OPTIMIZE: Be more precise with RAG queries. Your RAG usage is inefficient (${(efficiencyMetrics.ragWasteRatio * 100).toFixed(0)}% waste).`);
    }
    if (efficiencyMetrics?.planningVerbosity && efficiencyMetrics.planningVerbosity > 1.5) {
        systemPromptAdditions.push('OPTIMIZE: Be more concise in planning phases. Get to the point faster.');
    }
    if (efficiencyMetrics?.redundantToolCalls && efficiencyMetrics.redundantToolCalls > 3) {
        systemPromptAdditions.push(`DEBUG: You tend to make redundant tool calls (${efficiencyMetrics.redundantToolCalls} instances detected). Analyze previous outputs carefully before calling a tool again.`);
    }

    // --- Tool Format and Description Style ---
    const toolFormat = profile.toolFormat || DEFAULT_OPTIMAL_SETTINGS.toolFormat;
    let descriptionStyle = profile.descriptionStyle || DEFAULT_OPTIMAL_SETTINGS.descriptionStyle;

    // Adjust description style based on planning verbosity or tool errors
    if (efficiencyMetrics?.planningVerbosity && efficiencyMetrics.planningVerbosity > 2.0) {
        descriptionStyle = 'concise'; // If planning is too verbose, use concise tool descriptions
    } else if (profile.blockedCapabilities && profile.blockedCapabilities.length > 0) {
        descriptionStyle = 'verbose'; // If certain tools are blocked, be more verbose about the ones available
    }

    // --- RAG Settings ---
    const ragSettings: RAGSettings = { ...DEFAULT_RAG_SETTINGS }; // Start with default
    if (efficiencyMetrics?.ragWasteRatio && efficiencyMetrics.ragWasteRatio > 0.3) {
        ragSettings.chunkSize = Math.max(200, DEFAULT_RAG_SETTINGS.chunkSize * 0.7); // Reduce chunk size
        ragSettings.resultCount = Math.max(2, DEFAULT_RAG_SETTINGS.resultCount - 2); // Reduce result count
    } else if (profile.probeResults?.ragScore && profile.probeResults.ragScore > 80) {
        // If RAG is efficient AND performs well, slightly increase settings
        ragSettings.chunkSize = 1500;
        ragSettings.resultCount = 7;
        ragSettings.includeSummaries = true;
        ragSettings.includeGraph = true; // Enable graph if RAG is very strong
    } else if (profile.probeResults?.ragScore && profile.probeResults.ragScore > 60) {
        ragSettings.includeSummaries = true; // Ensure summaries if RAG is decent
    }

    // --- Context Budget ---
    let optimalTotal = DEFAULT_CONTEXT_BUDGET.total;
    if (profile.contextLength) { // profile.contextLength is our recommended context length from testing
        optimalTotal = profile.contextLength;
    } else if (contextLatency?.recommendedContext) {
        optimalTotal = contextLatency.recommendedContext;
    } else if (statefulProfile?.maxReliableContext) {
        optimalTotal = statefulProfile.maxReliableContext;
    }
    // Ensure budget doesn't exceed LLM's actual context window if known (e.g. from LLM_MAX_CONTEXT_WINDOW)
    // This is a placeholder; actual LLM max context would need to be passed or inferred.
    const LLM_MAX_CONTEXT_WINDOW = 32768; // Example: for models like GPT-4 Turbo

    optimalTotal = Math.min(optimalTotal, LLM_MAX_CONTEXT_WINDOW);

    const contextBudget: ContextBudget = {
      total: optimalTotal,
      systemPrompt: Math.min(2000, optimalTotal * 0.06),
      toolSchemas: Math.min(4000, optimalTotal * 0.12),
      memory: Math.min(1000, optimalTotal * 0.03),
      ragResults: Math.min(8000, optimalTotal * 0.25),
      history: Math.min(12000, optimalTotal * 0.38),
      reserve: Math.min(5000, optimalTotal * 0.16)
    };

    // --- Tool Overrides and Prosthetic ---
    // Tool overrides would be based on specific tool test results or explicit tuning.
    // For now, this remains empty.
    const toolOverrides = {};

    // Prosthetic intelligence is handled separately by addProstheticIntelligence later.

    return {
      modelId,
      toolFormat,
      enabledTools,
      disabledTools,
      toolOverrides,
      systemPromptAdditions,
      contextBudget,
      optimalSettings: {
        maxToolsPerCall: profile.toolScore ? (profile.toolScore > 80 ? 12 : DEFAULT_OPTIMAL_SETTINGS.maxToolsPerCall) : DEFAULT_OPTIMAL_SETTINGS.maxToolsPerCall,
        descriptionStyle,
        ragChunkSize: ragSettings.chunkSize,
        ragResultCount: ragSettings.resultCount
      },
      prosthetic: { // Default prosthetic info, will be enriched later
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

