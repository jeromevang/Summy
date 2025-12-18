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
  
  // Git Operations
  'git_status',
  'git_diff',
  'git_log',
  'git_commit',
  'git_add',
  'git_branch_create',
  'git_branch_list',
  'git_checkout',
  'git_merge',
  'git_rm',
  
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

export const TOOL_CATEGORIES: Record<string, string[]> = {
  'File Operations': ['file_read', 'file_write', 'file_patch', 'file_list', 'file_search', 'create_new_file', 'folder_create', 'folder_delete'],
  'Git Operations': ['git_status', 'git_diff', 'git_log', 'git_commit', 'git_add', 'git_branch_create', 'git_branch_list', 'git_checkout', 'git_merge', 'git_rm'],
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
  git_checkout: 'medium',
  git_merge: 'medium',
  git_rm: 'medium',
  
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

