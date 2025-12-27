/**
 * Model Capabilities Database
 * Manages model profiles and tool capabilities
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================
// TYPES
// ============================================================

export interface ToolCapability {
  supported: boolean;
  score: number;           // 0-100
  testsPassed: number;
  testsFailed: number;
  avgLatency?: number;
  lastTested?: string;
  notes?: string;
  nativeAliases?: string[];  // Model's native tool names that map to this MCP tool
  
  // Self-improving agentic system: Native vs Trained tracking
  nativeScore?: number;      // Score without prosthetic (out of the box)
  trainedScore?: number;     // Score after prosthetic applied
  trainable?: boolean | null; // true = can learn, false = blocked, null = untested
}

/**
 * Capability status for a tool/skill
 * Used by the self-improving agentic system
 */
export interface CapabilityStatus {
  nativeScore: number;       // Works out of the box (0-100)
  trainedScore: number | null; // After prosthetic applied
  trainable: boolean | null;  // Can be improved with prosthetic
  blocked: boolean;          // Should route to different model
  lastTested?: string;
}

export interface ProbeTestResult {
  passed: boolean;
  score: number;
  details: string;
}

export interface ReasoningProbeResults {
  intentExtraction: ProbeTestResult;
  multiStepPlanning: ProbeTestResult;
  conditionalReasoning: ProbeTestResult;
  contextContinuity: ProbeTestResult;
  logicalConsistency: ProbeTestResult;
  explanation: ProbeTestResult;
  edgeCaseHandling: ProbeTestResult;
}

export interface ProbeResults {
  testedAt: string;
  // Core tool behavior probes (1.1-1.4)
  emitTest: ProbeTestResult;
  schemaTest: ProbeTestResult;
  selectionTest: ProbeTestResult;
  suppressionTest: ProbeTestResult;
  // Enhanced tool behavior probes (1.5-1.8)
  nearIdenticalSelectionTest?: ProbeTestResult;
  multiToolEmitTest?: ProbeTestResult;
  argumentValidationTest?: ProbeTestResult;
  schemaReorderTest?: ProbeTestResult;
  // Reasoning probes (2.x)
  reasoningProbes?: ReasoningProbeResults;
  // Scores
  toolScore: number;
  reasoningScore: number;
  overallScore: number;
}

export interface ContextLatencyData {
  testedContextSizes: number[];
  latencies: Record<number, number>;
  maxUsableContext: number;
  recommendedContext: number;
}

export interface AgenticReadinessStatus {
  certified: boolean;
  score: number;
  assessedAt?: string;
  certifiedAt?: string;
  categoryScores: {
    tool: number;
    rag: number;
    reasoning: number;
    intent: number;
    browser: number;
  };
  failedTests: string[];
  prostheticApplied: boolean;
  prostheticLevel?: 1 | 2 | 3 | 4;
  // Qualifying gate & dual-model support
  qualifyingGatePassed?: boolean;
  disqualifiedAt?: string;
  mode?: 'single' | 'dual';
  executorModelId?: string;
  testResults?: Array<{
    testId: string;
    testName: string;
    category: string;
    passed: boolean;
    score: number;
    details: string;
    latency: number;
    attribution?: 'main' | 'executor' | 'loop';
  }>;
}

export interface ModelProfile {
  modelId: string;
  displayName: string;
  provider: 'lmstudio' | 'openai' | 'azure';
  testedAt: string;
  testVersion: number;
  score: number;           // Overall score 0-100
  toolFormat: 'openai_tools' | 'function_calling' | 'xml' | 'none';
  systemPrompt?: string;   // Custom system prompt for this model
  avgLatency?: number;
  contextLength?: number;  // Custom context length override for this model
  isBaseline?: boolean;    // Whether this model is considered a ground truth baseline
  teachingResults?: any;   // Saved teaching results for persistence

  // Role assignment from probe tests
  role?: 'main' | 'executor' | 'both' | 'none';

  // Probe test results
  probeResults?: ProbeResults;

  // Context latency profiling
  contextLatency?: ContextLatencyData;

  // Native tool discovery results
  discoveredNativeTools?: string[];  // ALL tools the model claims to support
  unmappedNativeTools?: string[];    // Tools that couldn't be matched to any MCP tool

  // Agentic Readiness (certification status for agentic coding)
  agenticReadiness?: AgenticReadinessStatus;

  // Whether a prosthetic prompt is applied to this model
  prostheticApplied?: boolean;

  // Trainability scores from agentic readiness assessment
  trainabilityScores?: {
    systemPromptCompliance: number;
    instructionPersistence: number;
    correctionAcceptance: number;
    overallTrainability: number;
  };

  capabilities: Record<string, ToolCapability>;
  enabledTools: string[];

  testResults?: Array<{
    testId: string;
    passed: boolean;
    score: number;
    response?: string;
    error?: string;
  }>;

  // ============================================================
  // SELF-IMPROVING AGENTIC SYSTEM
  // ============================================================

  /**
   * Capability map for the self-improving system
   * Tracks native vs trained scores per capability
   */
  capabilityMap?: Record<string, CapabilityStatus>;

  /**
   * Capabilities that work natively (no prosthetic needed)
   */
  nativeStrengths?: string[];

  /**
   * Capabilities that were learned via prosthetic
   */
  learnedCapabilities?: string[];

  /**
   * Capabilities that should be routed to a different model
   * (trainable: false, or consistently failing)
   */
  blockedCapabilities?: string[];

  /**
   * Recommended fallback model for blocked capabilities
   */
  fallbackModelId?: string;

  /**
   * Smoke test results (quick 8-test assessment)
   */
  smokeTestResults?: {
    testedAt: string;
    passed: boolean;
    score: number;
    nativeCapabilities: string[];
    trainableCapabilities: string[];
    blockedCapabilities: string[];
  };
}

// ============================================================
// PATHS
// ============================================================

const MODEL_PROFILES_DIR = path.join(__dirname, '../../../data/model-profiles');

// ============================================================
// DEFAULT TOOLS
// ============================================================

export const ALL_TOOLS = [
  // RAG - Semantic Code Search (Use FIRST for code understanding)
  'rag_query',
  'rag_status',
  'rag_index',

  // File Operations (Official MCP Filesystem Server names)
  'read_file',
  'read_multiple_files',
  'write_file',
  'edit_file',
  'delete_file',
  'copy_file',
  'move_file',
  'get_file_info',
  'list_directory',
  'search_files',
  'create_directory',
  'delete_directory',
  'list_allowed_directories',

  // Git Operations
  'git_status',
  'git_diff',
  'git_log',
  'git_init',
  'git_add',
  'git_commit',
  'git_push',
  'git_pull',
  'git_checkout',
  'git_stash',
  'git_stash_pop',
  'git_reset',
  'git_clone',
  'git_branch_create',
  'git_branch_list',
  'git_blame',
  'git_show',

  // NPM Operations
  'npm_run',
  'npm_install',
  'npm_uninstall',
  'npm_init',
  'npm_test',
  'npm_build',
  'npm_list',

  // HTTP/Search
  'http_request',
  'url_fetch_content',
  'web_search',

  // Browser (Playwright MCP-compatible)
  'browser_navigate',
  'browser_go_back',
  'browser_go_forward',
  'browser_click',
  'browser_type',
  'browser_hover',
  'browser_select_option',
  'browser_press_key',
  'browser_snapshot',
  'browser_fetch_content',
  'browser_take_screenshot',
  'browser_wait',
  'browser_resize',
  'browser_handle_dialog',
  'browser_drag',
  'browser_tabs',
  'browser_evaluate',
  'browser_console_messages',
  'browser_network_requests',

  // Code Execution
  'shell_exec',
  'run_python',
  'run_node',
  'run_typescript',

  // Memory
  'memory_store',
  'memory_retrieve',
  'memory_list',
  'memory_delete',

  // Text
  'text_summarize',
  'diff_files',

  // Process
  'process_list',
  'process_kill',

  // Archive
  'zip_create',
  'zip_extract',

  // Utility
  'mcp_rules',
  'env_get',
  'env_set',
  'json_parse',
  'base64_encode',
  'base64_decode'
];

// Deprecated tools that have been merged or removed
export const REMOVED_TOOLS = [
  // Old file tool names (now using official MCP names)
  'file_read',        // Now: read_file
  'file_write',       // Now: write_file  
  'file_patch',       // Now: edit_file
  'file_delete',      // Now: delete_file
  'file_copy',        // Now: copy_file
  'file_move',        // Now: move_file
  'file_info',        // Now: get_file_info
  'file_list',        // Now: list_directory
  'file_search',      // Now: search_files
  'folder_create',    // Now: create_directory
  'folder_delete',    // Now: delete_directory
  'create_new_file',  // Merged into write_file
  'git_merge',        // Complex, can cause conflicts
  'git_rm',           // Use delete_file instead
];

export const TOOL_CATEGORIES: Record<string, string[]> = {
  'RAG - Semantic Search': ['rag_query', 'rag_status', 'rag_index'],
  'File Operations': ['read_file', 'read_multiple_files', 'write_file', 'edit_file', 'delete_file', 'copy_file', 'move_file', 'get_file_info', 'list_directory', 'search_files', 'create_directory', 'delete_directory', 'list_allowed_directories'],
  'Git Operations': ['git_status', 'git_diff', 'git_log', 'git_init', 'git_add', 'git_commit', 'git_push', 'git_pull', 'git_checkout', 'git_stash', 'git_stash_pop', 'git_reset', 'git_clone', 'git_branch_create', 'git_branch_list', 'git_blame', 'git_show'],
  'NPM Operations': ['npm_run', 'npm_install', 'npm_uninstall', 'npm_init', 'npm_test', 'npm_build', 'npm_list'],
  'Browser': ['browser_navigate', 'browser_go_back', 'browser_go_forward', 'browser_click', 'browser_type', 'browser_hover', 'browser_select_option', 'browser_press_key', 'browser_snapshot', 'browser_fetch_content', 'browser_take_screenshot', 'browser_wait', 'browser_resize', 'browser_handle_dialog', 'browser_drag', 'browser_tabs', 'browser_evaluate', 'browser_console_messages', 'browser_network_requests'],
  'HTTP/Search': ['http_request', 'url_fetch_content', 'web_search'],
  'Code Execution': ['shell_exec', 'run_python', 'run_node', 'run_typescript'],
  'Memory': ['memory_store', 'memory_retrieve', 'memory_list', 'memory_delete'],
  'Text': ['text_summarize', 'diff_files'],
  'Process': ['process_list', 'process_kill'],
  'Archive': ['zip_create', 'zip_extract'],
  'Utility': ['mcp_rules', 'env_get', 'env_set', 'json_parse', 'base64_encode', 'base64_decode']
};

export const TOOL_RISK_LEVELS: Record<string, 'low' | 'medium' | 'high'> = {
  // Low risk - read-only
  read_file: 'low',
  read_multiple_files: 'low',
  list_directory: 'low',
  search_files: 'low',
  get_file_info: 'low',
  list_allowed_directories: 'low',
  git_status: 'low',
  git_diff: 'low',
  git_log: 'low',
  git_branch_list: 'low',
  git_blame: 'low',
  git_show: 'low',
  http_request: 'low',
  web_search: 'low',
  mcp_rules: 'low',
  memory_retrieve: 'low',
  memory_list: 'low',
  text_summarize: 'low',
  diff_files: 'low',
  env_get: 'low',
  json_parse: 'low',
  base64_encode: 'low',
  base64_decode: 'low',
  process_list: 'low',
  browser_snapshot: 'low',
  browser_console_messages: 'low',
  browser_network_requests: 'low',

  // Medium risk - writes/modifies
  write_file: 'medium',
  edit_file: 'medium',
  copy_file: 'medium',
  move_file: 'medium',
  create_directory: 'medium',
  git_commit: 'medium',
  git_add: 'medium',
  git_branch_create: 'medium',
  git_stash: 'medium',
  git_stash_pop: 'medium',
  memory_store: 'medium',
  memory_delete: 'medium',
  env_set: 'medium',
  browser_navigate: 'medium',
  browser_click: 'medium',
  browser_type: 'medium',
  browser_tabs: 'medium',
  zip_create: 'medium',
  zip_extract: 'medium',

  // High risk - destructive/system changes
  delete_file: 'high',
  delete_directory: 'high',
  git_reset: 'high',
  git_push: 'high',
  git_pull: 'high',
  git_checkout: 'high',
  git_clone: 'high',
  npm_run: 'high',
  npm_install: 'high',
  npm_uninstall: 'high',
  npm_init: 'high',
  npm_test: 'high',
  npm_build: 'high',
  shell_exec: 'high',
  run_python: 'high',
  run_node: 'high',
  run_typescript: 'high',
  process_kill: 'high',
  browser_evaluate: 'high'
};

// ============================================================
// CAPABILITIES SERVICE
// ============================================================

class CapabilitiesService {
  private cache: Map<string, ModelProfile> = new Map();

  constructor() {
    // Ensure profiles directory exists
    fs.ensureDirSync(MODEL_PROFILES_DIR);
  }

  /**
   * Get all model profiles
   */
  async getAllProfiles(): Promise<ModelProfile[]> {
    const files = await fs.readdir(MODEL_PROFILES_DIR);
    const profiles: ModelProfile[] = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const profile = await fs.readJson(path.join(MODEL_PROFILES_DIR, file));
          profiles.push(profile);
          this.cache.set(profile.modelId, profile);
        } catch (e) {
          console.error(`[Capabilities] Failed to load profile ${file}:`, e);
        }
      }
    }

    return profiles;
  }

  /**
   * Get a specific model profile
   */
  async getProfile(modelId: string): Promise<ModelProfile | null> {
    // Check cache first
    if (this.cache.has(modelId)) {
      return this.cache.get(modelId)!;
    }

    const safeName = this.sanitizeFileName(modelId);
    const profilePath = path.join(MODEL_PROFILES_DIR, `${safeName}.json`);

    try {
      if (await fs.pathExists(profilePath)) {
        const profile = await fs.readJson(profilePath);

        // Filter out removed dangerous tools from old profiles
        if (profile.enabledTools) {
          profile.enabledTools = profile.enabledTools.filter(
            (t: string) => !REMOVED_TOOLS.includes(t)
          );
        }
        if (profile.capabilities) {
          for (const tool of REMOVED_TOOLS) {
            delete profile.capabilities[tool];
          }
        }

        this.cache.set(modelId, profile);
        return profile;
      }
    } catch (e) {
      console.error(`[Capabilities] Failed to load profile for ${modelId}:`, e);
    }

    return null;
  }

  /**
   * Save a model profile
   */
  async saveProfile(profile: ModelProfile): Promise<void> {
    const safeName = this.sanitizeFileName(profile.modelId);
    const profilePath = path.join(MODEL_PROFILES_DIR, `${safeName}.json`);

    await fs.writeJson(profilePath, profile, { spaces: 2 });
    this.cache.set(profile.modelId, profile);

    console.log(`[Capabilities] Saved profile for ${profile.modelId}`);
  }

  /**
   * Delete a model profile
   */
  async deleteProfile(modelId: string): Promise<boolean> {
    const safeName = this.sanitizeFileName(modelId);
    const profilePath = path.join(MODEL_PROFILES_DIR, `${safeName}.json`);

    try {
      if (await fs.pathExists(profilePath)) {
        await fs.remove(profilePath);
        this.cache.delete(modelId);
        console.log(`[Capabilities] Deleted profile for ${modelId}`);
        return true;
      }
    } catch (e) {
      console.error(`[Capabilities] Failed to delete profile for ${modelId}:`, e);
    }

    return false;
  }

  /**
   * Create a new empty profile for a model
   */
  createEmptyProfile(modelId: string, displayName: string, provider: 'lmstudio' | 'openai' | 'azure'): ModelProfile {
    const capabilities: Record<string, ToolCapability> = {};

    for (const tool of ALL_TOOLS) {
      capabilities[tool] = {
        supported: false,
        score: 0,
        testsPassed: 0,
        testsFailed: 0
      };
    }

    return {
      modelId,
      displayName,
      provider,
      testedAt: new Date().toISOString(),
      testVersion: 1,
      score: 0,
      toolFormat: 'openai_tools',
      capabilities,
      enabledTools: [],
      testResults: []
    };
  }

  /**
   * Update profile with test results
   */
  updateProfileWithResults(
    profile: ModelProfile,
    results: Array<{
      testId: string;
      tool: string;
      passed: boolean;
      score: number;
      latency?: number;
      response?: string;
      error?: string;
    }>
  ): ModelProfile {
    // Group results by tool
    const toolResults: Record<string, typeof results> = {};
    for (const result of results) {
      if (!toolResults[result.tool]) {
        toolResults[result.tool] = [];
      }
      toolResults[result.tool].push(result);
    }

    // Update capabilities
    for (const [tool, tests] of Object.entries(toolResults)) {
      const passed = tests.filter(t => t.passed).length;
      const failed = tests.filter(t => !t.passed).length;
      const avgScore = tests.reduce((sum, t) => sum + t.score, 0) / tests.length;
      const avgLatency = tests.filter(t => t.latency).reduce((sum, t) => sum + (t.latency || 0), 0) / tests.length;

      profile.capabilities[tool] = {
        supported: avgScore >= 70,
        score: Math.round(avgScore),
        testsPassed: passed,
        testsFailed: failed,
        avgLatency: avgLatency || undefined,
        lastTested: new Date().toISOString()
      };
    }

    // Update enabled tools (score >= 70)
    profile.enabledTools = Object.entries(profile.capabilities)
      .filter(([_, cap]) => cap.supported && cap.score >= 70)
      .map(([tool, _]) => tool);

    // Calculate overall score
    const testedTools = Object.values(profile.capabilities).filter(c => c.testsPassed + c.testsFailed > 0);
    if (testedTools.length > 0) {
      profile.score = Math.round(
        testedTools.reduce((sum, c) => sum + c.score, 0) / testedTools.length
      );
    }

    // Store test results
    profile.testResults = results.map(r => ({
      testId: r.testId,
      passed: r.passed,
      score: r.score,
      response: r.response,
      error: r.error
    }));

    profile.testedAt = new Date().toISOString();
    profile.testVersion += 1;

    return profile;
  }

  /**
   * Get enabled tools for a model
   */
  async getEnabledTools(modelId: string): Promise<string[]> {
    const profile = await this.getProfile(modelId);
    return profile?.enabledTools || [];
  }

  /**
   * Toggle a tool for a model
   */
  async toggleTool(modelId: string, tool: string, enabled: boolean): Promise<void> {
    const profile = await this.getProfile(modelId);
    if (!profile) {
      throw new Error(`Profile not found for model: ${modelId}`);
    }

    if (enabled && !profile.enabledTools.includes(tool)) {
      profile.enabledTools.push(tool);
    } else if (!enabled) {
      profile.enabledTools = profile.enabledTools.filter(t => t !== tool);
    }

    await this.saveProfile(profile);
  }

  /**
   * Update custom system prompt
   */
  async updateSystemPrompt(modelId: string, systemPrompt: string): Promise<void> {
    const profile = await this.getProfile(modelId);
    if (!profile) {
      throw new Error(`Profile not found for model: ${modelId}`);
    }

    profile.systemPrompt = systemPrompt;
    await this.saveProfile(profile);
  }

  /**
   * Update custom context length for a model
   */
  async updateContextLength(modelId: string, contextLength: number): Promise<void> {
    const profile = await this.getProfile(modelId);
    if (!profile) {
      throw new Error(`Profile not found for model: ${modelId}`);
    }

    profile.contextLength = contextLength;
    await this.saveProfile(profile);
    console.log(`[Capabilities] Updated context length for ${modelId} to ${contextLength}`);
  }

  /**
   * Remove custom context length (revert to global default)
   */
  async removeContextLength(modelId: string): Promise<void> {
    const profile = await this.getProfile(modelId);
    if (!profile) {
      throw new Error(`Profile not found for model: ${modelId}`);
    }

    delete profile.contextLength;
    await this.saveProfile(profile);
    console.log(`[Capabilities] Removed custom context length for ${modelId}`);
  }

  /**
   * Update profile with partial updates
   */
  async updateProfile(modelId: string, updates: Partial<ModelProfile>): Promise<void> {
    const profile = await this.getProfile(modelId);
    if (!profile) {
      throw new Error(`Profile not found for model: ${modelId}`);
    }

    // Merge updates into profile
    Object.assign(profile, updates);
    await this.saveProfile(profile);
    console.log(`[Capabilities] Updated profile for ${modelId}`);
  }

  /**
   * Update agentic readiness status
   */
  async updateAgenticReadiness(modelId: string, readiness: AgenticReadinessStatus, trainabilityScores?: { systemPromptCompliance: number; instructionPersistence: number; correctionAcceptance: number; overallTrainability: number }): Promise<void> {
    const profile = await this.getProfile(modelId);
    if (!profile) {
      throw new Error(`Profile not found for model: ${modelId}`);
    }

    profile.agenticReadiness = readiness;
    profile.score = readiness.score; // Also update the top-level score field
    if (trainabilityScores) {
      profile.trainabilityScores = trainabilityScores;
    }
    await this.saveProfile(profile);
    console.log(`[Capabilities] Updated agentic readiness for ${modelId}: certified=${readiness.certified}, score=${readiness.score}`);
  }

  /**
   * Get all certified models (agentic ready)
   */
  async getCertifiedModels(): Promise<ModelProfile[]> {
    const allProfiles = await this.getAllProfiles();
    return allProfiles.filter(p => p.agenticReadiness?.certified === true);
  }

  /**
   * Get tool categories with status for a model
   */
  async getToolCategories(modelId: string): Promise<Array<{
    category: string;
    tools: Array<{
      name: string;
      enabled: boolean;
      score: number;
      riskLevel: 'low' | 'medium' | 'high';
    }>;
    supported: number;
    total: number;
  }>> {
    const profile = await this.getProfile(modelId);
    const result = [];

    for (const [category, tools] of Object.entries(TOOL_CATEGORIES)) {
      const categoryTools = tools.map(tool => ({
        name: tool,
        enabled: profile?.enabledTools.includes(tool) || false,
        score: profile?.capabilities[tool]?.score || 0,
        riskLevel: TOOL_RISK_LEVELS[tool] || 'medium'
      }));

      result.push({
        category,
        tools: categoryTools,
        supported: categoryTools.filter(t => t.score >= 70).length,
        total: tools.length
      });
    }

    return result;
  }

  /**
   * Sanitize model ID for use as filename
   */
  private sanitizeFileName(id: string): string {
    return id
      .toLowerCase()
      .replace(/[^a-z0-9-_.]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Update probe results and role assignment
   */
  async updateProbeResults(
    modelId: string,
    probeResults: ProbeResults,
    role: 'main' | 'executor' | 'both' | 'none',
    contextLatency?: ContextLatencyData,
    scoreBreakdown?: {
      toolScore?: number;
      reasoningScore?: number;
      ragScore?: number;
      bugDetectionScore?: number;
      architecturalScore?: number;
      navigationScore?: number;
      helicopterScore?: number;
      proactiveScore?: number;
      intentScore?: number;
      overallScore?: number;
      isBaseline?: boolean;
    }
  ): Promise<void> {
    let profile = await this.getProfile(modelId);
    if (!profile) {
      // Create a basic profile if it doesn't exist
      profile = this.createEmptyProfile(modelId, modelId, 'lmstudio');
    }

    profile.probeResults = probeResults;
    profile.role = role;

    // Update overall score from probe results
    if (probeResults.overallScore) {
      profile.score = probeResults.overallScore;
    }

    if (contextLatency) {
      profile.contextLatency = contextLatency;
      // Auto-set recommended context if not manually overridden
      if (!profile.contextLength) {
        profile.contextLength = contextLatency.recommendedContext;
      }
    }

    // Store scoreBreakdown if provided
    if (scoreBreakdown) {
      (profile as any).scoreBreakdown = scoreBreakdown;
      if (scoreBreakdown.isBaseline !== undefined) {
        profile.isBaseline = scoreBreakdown.isBaseline;
      }
    }

    await this.saveProfile(profile);
    console.log(`[Capabilities] Updated probe results for ${modelId}: role=${role}, score=${probeResults.overallScore || 'N/A'}`);
  }

  /**
   * Get models by role
   */
  async getModelsByRole(role: 'main' | 'executor' | 'both' | 'none'): Promise<ModelProfile[]> {
    const allProfiles = await this.getAllProfiles();
    return allProfiles.filter(p => p.role === role || (role === 'main' && p.role === 'both') || (role === 'executor' && p.role === 'both'));
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  // ============================================================
  // SELF-IMPROVING AGENTIC SYSTEM METHODS
  // ============================================================

  /**
   * Update capability map with smoke test results
   */
  async updateCapabilityMap(
    modelId: string,
    capabilityResults: Array<{
      capability: string;
      nativeScore: number;
      trainedScore?: number;
      trainable?: boolean;
    }>
  ): Promise<void> {
    const profile = await this.getProfile(modelId);
    if (!profile) {
      throw new Error(`Profile not found for model: ${modelId}`);
    }

    // Initialize capability map if needed
    if (!profile.capabilityMap) {
      profile.capabilityMap = {};
    }

    const nativeStrengths: string[] = [];
    const learnedCapabilities: string[] = [];
    const blockedCapabilities: string[] = [];

    for (const result of capabilityResults) {
      profile.capabilityMap[result.capability] = {
        nativeScore: result.nativeScore,
        trainedScore: result.trainedScore ?? null,
        trainable: result.trainable ?? null,
        blocked: result.trainable === false || (result.nativeScore < 50 && result.trainedScore !== undefined && result.trainedScore < 60),
        lastTested: new Date().toISOString()
      };

      // Categorize
      if (result.nativeScore >= 70) {
        nativeStrengths.push(result.capability);
      } else if (result.trainedScore !== undefined && result.trainedScore >= 70) {
        learnedCapabilities.push(result.capability);
      } else if (result.trainable === false) {
        blockedCapabilities.push(result.capability);
      }
    }

    profile.nativeStrengths = nativeStrengths;
    profile.learnedCapabilities = learnedCapabilities;
    profile.blockedCapabilities = blockedCapabilities;

    await this.saveProfile(profile);
    console.log(`[Capabilities] Updated capability map for ${modelId}: native=${nativeStrengths.length}, learned=${learnedCapabilities.length}, blocked=${blockedCapabilities.length}`);
  }

  /**
   * Update smoke test results
   */
  async updateSmokeTestResults(
    modelId: string,
    results: {
      passed: boolean;
      score: number;
      nativeCapabilities: string[];
      trainableCapabilities: string[];
      blockedCapabilities: string[];
    }
  ): Promise<void> {
    const profile = await this.getProfile(modelId);
    if (!profile) {
      throw new Error(`Profile not found for model: ${modelId}`);
    }

    profile.smokeTestResults = {
      testedAt: new Date().toISOString(),
      ...results
    };

    // Also update the convenience arrays
    profile.nativeStrengths = results.nativeCapabilities;
    profile.learnedCapabilities = results.trainableCapabilities;
    profile.blockedCapabilities = results.blockedCapabilities;

    await this.saveProfile(profile);
    console.log(`[Capabilities] Updated smoke test results for ${modelId}: passed=${results.passed}, score=${results.score}`);
  }

  /**
   * Check if a capability is blocked for a model
   */
  async isCapabilityBlocked(modelId: string, capability: string): Promise<boolean> {
    const profile = await this.getProfile(modelId);
    if (!profile) return false;

    // Check blockedCapabilities array
    if (profile.blockedCapabilities?.includes(capability)) {
      return true;
    }

    // Check capability map
    const capStatus = profile.capabilityMap?.[capability];
    if (capStatus?.blocked) {
      return true;
    }

    return false;
  }

  /**
   * Get the fallback model for blocked capabilities
   */
  async getFallbackModel(modelId: string, capability: string): Promise<string | null> {
    const profile = await this.getProfile(modelId);
    if (!profile) return null;

    // If specific fallback is set, use it
    if (profile.fallbackModelId) {
      return profile.fallbackModelId;
    }

    // Find a model that has this capability as a native strength
    const allProfiles = await this.getAllProfiles();
    for (const p of allProfiles) {
      if (p.modelId !== modelId && p.nativeStrengths?.includes(capability)) {
        return p.modelId;
      }
    }

    return null;
  }

  /**
   * Set fallback model for a profile
   */
  async setFallbackModel(modelId: string, fallbackModelId: string): Promise<void> {
    const profile = await this.getProfile(modelId);
    if (!profile) {
      throw new Error(`Profile not found for model: ${modelId}`);
    }

    profile.fallbackModelId = fallbackModelId;
    await this.saveProfile(profile);
    console.log(`[Capabilities] Set fallback model for ${modelId}: ${fallbackModelId}`);
  }

  /**
   * Get models with specific capability as native strength
   */
  async getModelsWithNativeCapability(capability: string): Promise<ModelProfile[]> {
    const allProfiles = await this.getAllProfiles();
    return allProfiles.filter(p => p.nativeStrengths?.includes(capability));
  }

  /**
   * Get capability summary for a model
   */
  async getCapabilitySummary(modelId: string): Promise<{
    native: string[];
    learned: string[];
    blocked: string[];
    untested: string[];
    fallbackModel: string | null;
  }> {
    const profile = await this.getProfile(modelId);
    if (!profile) {
      return { native: [], learned: [], blocked: [], untested: [], fallbackModel: null };
    }

    const allCapabilities = ['rag_query', 'read_file', 'write_file', 'search_files', 'shell_exec', 'web_search', 'browser_navigate', 'multi_step'];
    const tested = new Set([
      ...(profile.nativeStrengths || []),
      ...(profile.learnedCapabilities || []),
      ...(profile.blockedCapabilities || [])
    ]);

    const untested = allCapabilities.filter(c => !tested.has(c));

    return {
      native: profile.nativeStrengths || [],
      learned: profile.learnedCapabilities || [],
      blocked: profile.blockedCapabilities || [],
      untested,
      fallbackModel: profile.fallbackModelId || null
    };
  }
}

// Export singleton instance
export const capabilities = new CapabilitiesService();

// Export types
export { CapabilitiesService };

