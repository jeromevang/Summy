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
  
  // Role assignment from probe tests
  role?: 'main' | 'executor' | 'both' | 'none';
  
  // Probe test results
  probeResults?: ProbeResults;
  
  // Context latency profiling
  contextLatency?: ContextLatencyData;
  
  capabilities: Record<string, ToolCapability>;
  enabledTools: string[];
  
  testResults?: Array<{
    testId: string;
    passed: boolean;
    score: number;
    response?: string;
    error?: string;
  }>;
}

// ============================================================
// PATHS
// ============================================================

const MODEL_PROFILES_DIR = path.join(__dirname, '../../../data/model-profiles');

// ============================================================
// DEFAULT TOOLS
// ============================================================

export const ALL_TOOLS = [
  // File Operations
  'file_read',
  'file_write',
  'file_patch',
  'file_list',
  'file_search',
  'create_new_file',
  'folder_create',
  'folder_delete',
  
  // Git Operations (safe subset - checkout/merge/rm removed for safety)
  'git_status',
  'git_diff',
  'git_log',
  'git_commit',
  'git_add',
  'git_branch_create',
  'git_branch_list',
  
  // NPM Operations
  'npm_run',
  'npm_install',
  'npm_uninstall',
  
  // Browser/HTTP
  'http_request',
  'browser_navigate',
  
  // Other
  'run_python',
  'mcp_rules'
];

// Dangerous tools that have been removed (filter these from old profiles)
export const REMOVED_TOOLS = [
  'git_checkout',  // Can lose uncommitted changes
  'git_merge',     // Complex, can cause conflicts
  'git_rm',        // Deletes files from disk
];

export const TOOL_CATEGORIES: Record<string, string[]> = {
  'File Operations': ['file_read', 'file_write', 'file_patch', 'file_list', 'file_search', 'create_new_file', 'folder_create', 'folder_delete'],
  'Git Operations': ['git_status', 'git_diff', 'git_log', 'git_commit', 'git_add', 'git_branch_create', 'git_branch_list'],
  'NPM Operations': ['npm_run', 'npm_install', 'npm_uninstall'],
  'Browser/HTTP': ['http_request', 'browser_navigate'],
  'Other': ['run_python', 'mcp_rules']
};

export const TOOL_RISK_LEVELS: Record<string, 'low' | 'medium' | 'high'> = {
  // Low risk - read-only
  file_read: 'low',
  file_list: 'low',
  file_search: 'low',
  git_status: 'low',
  git_diff: 'low',
  git_log: 'low',
  git_branch_list: 'low',
  http_request: 'low',
  mcp_rules: 'low',
  
  // Medium risk - writes/modifies
  file_write: 'medium',
  file_patch: 'medium',
  create_new_file: 'medium',
  folder_create: 'medium',
  folder_delete: 'medium',
  git_commit: 'medium',
  git_add: 'medium',
  git_branch_create: 'medium',
  
  // High risk - system/package changes
  npm_run: 'high',
  npm_install: 'high',
  npm_uninstall: 'high',
  browser_navigate: 'high',
  run_python: 'high'
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
    contextLatency?: ContextLatencyData
  ): Promise<void> {
    let profile = await this.getProfile(modelId);
    if (!profile) {
      // Create a basic profile if it doesn't exist
      profile = this.createEmptyProfile(modelId, modelId, 'lmstudio');
    }

    profile.probeResults = probeResults;
    profile.role = role;
    
    if (contextLatency) {
      profile.contextLatency = contextLatency;
      // Auto-set recommended context if not manually overridden
      if (!profile.contextLength) {
        profile.contextLength = contextLatency.recommendedContext;
      }
    }

    await this.saveProfile(profile);
    console.log(`[Capabilities] Updated probe results for ${modelId}: role=${role}`);
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
}

// Export singleton instance
export const capabilities = new CapabilitiesService();

// Export types
export { CapabilitiesService };

