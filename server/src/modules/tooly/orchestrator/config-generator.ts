/**
 * Config Generator
 * Generates MCP configurations from test results and tool profiles
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { TestRunResult } from '../testing/test-types.js';
import { ToolProfile, toolProfiler } from './tool-profiler.js';
import {
} from './mcp-orchestrator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================
// TYPES
// ============================================================

export interface GeneratedConfig {
  modelId: string;
  version: number;
  generatedAt: string;
  toolFormat: 'openai' | 'anthropic' | 'native';
  enabledTools: string[];
  disabledTools: string[];
  toolOverrides: Record<string, ToolOverride>;
  systemPromptAdditions: string[];
  contextBudget: {
    total: number;
    systemPrompt: number;
    toolSchemas: number;
    memory: number;
    ragResults: number;
    history: number;
    reserve: number;
  };
  optimalSettings: {
    maxToolsPerCall: number;
    ragChunkSize: number;
    ragResultCount: number;
    descriptionStyle: 'concise' | 'verbose' | 'detailed';
  };
  metadata: {
    basedOnTestScore: number;
    recommendationCount: number;
    tierLevel: string;
  };
}

export interface ToolOverride {
  description?: string;
  priority?: number;
  maxCalls?: number;
  notes?: string;
}

// ============================================================
// CONFIG TEMPLATES
// ============================================================

const SYSTEM_PROMPT_TEMPLATES: Record<string, string[]> = {
  'tool-focused': [
    'Use tools proactively to accomplish tasks',
    'Always verify file operations succeeded',
    'Prefer rag_query before read_file for understanding code'
  ],
  'safety-focused': [
    'Always confirm destructive operations before executing',
    'Create backups before modifying important files',
    'Ask for clarification on ambiguous requests'
  ],
  'agentic-coding': [
    'You are an expert coding assistant with access to tools',
    'Use RAG/search to understand codebase before making changes',
    'Make precise, minimal changes when editing code',
    'Explain your reasoning before taking actions'
  ],
  'minimal': [
    'You have access to tools for file operations and code search',
    'Use tools when needed to accomplish tasks'
  ]
};

// ============================================================
// CONFIG GENERATOR CLASS
// ============================================================

export class ConfigGenerator {
  private configDir: string;

  constructor(configDir?: string) {
    this.configDir = configDir || path.resolve(__dirname, '../../../../../mcp-server/configs/models');
  }

  /**
   * Generate configuration from test results
   */
  async generateFromTestResults(
    modelId: string,
    testResults: TestRunResult,
    options: {
      template?: keyof typeof SYSTEM_PROMPT_TEMPLATES;
      contextLength?: number;
      saveToFile?: boolean;
    } = {}
  ): Promise<GeneratedConfig> {
    // First, analyze tool performance
    const toolProfile = toolProfiler.analyzeTestResults(modelId, testResults);

    // Determine enabled/disabled tools
    const enabledTools = toolProfiler.getEnabledTools(modelId);
    const disabledTools = toolProfiler.getDisabledTools(modelId);

    // Generate tool overrides
    const toolOverrides = this.generateToolOverrides(toolProfile);

    // Get system prompt additions
    const template = options.template || 'agentic-coding';
    const systemPromptAdditions = [...(SYSTEM_PROMPT_TEMPLATES[template] || [])];

    // Add model-specific additions based on test results
    if (testResults.overallScore < 50) {
      systemPromptAdditions.push(
        'Be extra careful with tool parameters - verify before calling'
      );
    }

    // Calculate context budget based on model context length
    const contextLength = options.contextLength || 32000;
    const contextBudget = this.calculateContextBudget(contextLength);

    // Determine optimal settings
    const optimalSettings = this.determineOptimalSettings(toolProfile, testResults);

    const config: GeneratedConfig = {
      modelId,
      version: 1,
      generatedAt: new Date().toISOString(),
      toolFormat: 'openai', // Default to OpenAI format
      enabledTools,
      disabledTools,
      toolOverrides,
      systemPromptAdditions,
      contextBudget,
      optimalSettings,
      metadata: {
        basedOnTestScore: testResults.overallScore,
        recommendationCount: toolProfile.recommendations.length,
        tierLevel: toolProfile.suggestedTier
      }
    };

    // Save to file if requested
    if (options.saveToFile) {
      await this.saveConfig(modelId, config);
    }

    return config;
  }

  /**
   * Generate tool overrides from profile
   */
  private generateToolOverrides(profile: ToolProfile): Record<string, ToolOverride> {
    const overrides: Record<string, ToolOverride> = {};

    for (const rec of profile.recommendations) {
      if (rec.type === 'priority') {
        overrides[rec.tool] = {
          ...overrides[rec.tool],
          priority: 1,
          notes: rec.reason
        };
      }

      if (rec.type === 'description') {
        const perf = profile.toolPerformances[rec.tool];
        if (perf) {
          overrides[rec.tool] = {
            ...overrides[rec.tool],
            description: this.generateImprovedDescription(rec.tool),
            notes: rec.reason
          };
        }
      }
    }

    return overrides;
  }

  /**
   * Generate improved tool description
   */
  private generateImprovedDescription(toolName: string): string {
    const baseDescriptions: Record<string, string> = {
      'read_file': 'Read file contents. Parameters: path (string, required) - the file path to read.',
      'write_file': 'Write content to a file. Parameters: path (string, required), content (string, required).',
      'edit_file': 'Edit a file with changes. Parameters: path (string, required), edits (array of {oldText, newText}).',
      'search_files': 'Search for files or content. Parameters: directory (string), pattern (string, required).',
      'rag_query': 'Query the codebase for context. Parameters: query (string, required) - the search query.',
      'list_directory': 'List directory contents. Parameters: path (string, required) - directory to list.',
    };

    return baseDescriptions[toolName] || `Use ${toolName} tool with appropriate parameters.`;
  }

  /**
   * Calculate context budget based on model context length
   */
  private calculateContextBudget(contextLength: number): GeneratedConfig['contextBudget'] {
    // Reserve 20% for response
    const available = Math.floor(contextLength * 0.8);

    return {
      total: contextLength,
      systemPrompt: Math.floor(available * 0.08),  // 8%
      toolSchemas: Math.floor(available * 0.12),   // 12%
      memory: Math.floor(available * 0.05),        // 5%
      ragResults: Math.floor(available * 0.25),    // 25%
      history: Math.floor(available * 0.35),       // 35%
      reserve: Math.floor(available * 0.15)        // 15%
    };
  }

  /**
   * Determine optimal settings based on profile and test results
   */
  private determineOptimalSettings(
    profile: ToolProfile,
    testResults: TestRunResult
  ): GeneratedConfig['optimalSettings'] {
    // Start with defaults
    let maxToolsPerCall = 10;
    let ragChunkSize = 1000;
    let ragResultCount = 5;
    let descriptionStyle: 'concise' | 'verbose' | 'detailed' = 'verbose';

    // Adjust based on performance
    if (profile.overallScore < 50) {
      // Lower performing models: fewer tools, more description
      maxToolsPerCall = 5;
      descriptionStyle = 'detailed';
      ragResultCount = 3;
    } else if (profile.overallScore >= 80) {
      // High performing models: can handle more
      maxToolsPerCall = 15;
      descriptionStyle = 'concise';
      ragResultCount = 7;
    }

    // Check for slow performance
    const avgLatency = testResults.results.reduce((sum, r) => sum + r.latency, 0) / testResults.results.length;
    if (avgLatency > 5000) {
      // Slow model: reduce complexity
      ragChunkSize = 500;
      ragResultCount = Math.min(ragResultCount, 3);
    }

    return {
      maxToolsPerCall,
      ragChunkSize,
      ragResultCount,
      descriptionStyle
    };
  }

  /**
   * Save config to file
   */
  async saveConfig(modelId: string, config: GeneratedConfig): Promise<string> {
    await fs.ensureDir(this.configDir);

    // Sanitize model ID for filename
    const filename = modelId.replace(/[/\\:*?"<>|]/g, '_') + '.json';
    const filepath = path.join(this.configDir, filename);

    await fs.writeJson(filepath, config, { spaces: 2 });
    console.log(`[ConfigGenerator] Saved config for ${modelId} to ${filepath}`);

    return filepath;
  }

  /**
   * Load config from file
   */
  async loadConfig(modelId: string): Promise<GeneratedConfig | null> {
    const filename = modelId.replace(/[/\\:*?"<>|]/g, '_') + '.json';
    const filepath = path.join(this.configDir, filename);

    if (await fs.pathExists(filepath)) {
      return await fs.readJson(filepath);
    }

    return null;
  }

  /**
   * List all generated configs
   */
  async listConfigs(): Promise<string[]> {
    if (!await fs.pathExists(this.configDir)) {
      return [];
    }

    const files = await fs.readdir(this.configDir);
    return files
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', '').replace(/_/g, '/'));
  }

  /**
   * Delete a config
   */
  async deleteConfig(modelId: string): Promise<boolean> {
    const filename = modelId.replace(/[/\\:*?"<>|]/g, '_') + '.json';
    const filepath = path.join(this.configDir, filename);

    if (await fs.pathExists(filepath)) {
      await fs.remove(filepath);
      return true;
    }

    return false;
  }
}

export const configGenerator = new ConfigGenerator();
export default configGenerator;

