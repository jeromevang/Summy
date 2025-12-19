/**
 * Test Engine
 * Runs tool capability tests against models and scores results
 */

import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { capabilities, ModelProfile, ALL_TOOLS } from './capabilities.js';
import { getToolSchemas, TOOL_PROMPTS, TOOL_SCHEMAS } from './tool-prompts.js';
import { notifications } from '../../services/notifications.js';
import { wsBroadcast } from '../../services/ws-broadcast.js';
import { modelManager } from '../../services/lmstudio-model-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================
// TOOL DISCOVERY & SEMANTIC MATCHING
// ============================================================

/**
 * Common synonyms for matching native tool names to MCP tools
 */
const TOOL_SYNONYMS: Record<string, string[]> = {
  'file_read': ['read_file', 'get_file', 'cat', 'load_file', 'read', 'file_get', 'get_file_content', 'read_content'],
  'file_write': ['write_file', 'save_file', 'put_file', 'write', 'file_put', 'save', 'create_file'],
  'file_patch': ['patch_file', 'edit_file', 'modify_file', 'update_file', 'patch', 'edit'],
  'file_list': ['list_files', 'ls', 'dir', 'list_directory', 'list', 'directory_list'],
  'file_search': ['search_files', 'grep', 'find', 'search', 'find_in_files'],
  'create_new_file': ['new_file', 'create_file', 'touch', 'make_file'],
  'folder_create': ['create_folder', 'mkdir', 'make_directory', 'create_directory'],
  'folder_delete': ['delete_folder', 'rmdir', 'remove_directory', 'rm_folder'],
  'git_status': ['status', 'git_stat', 'repo_status'],
  'git_diff': ['diff', 'git_changes', 'show_diff'],
  'git_log': ['log', 'git_history', 'commit_history'],
  'git_commit': ['commit', 'git_save', 'save_changes'],
  'git_add': ['add', 'stage', 'git_stage'],
  'git_branch_create': ['create_branch', 'new_branch', 'branch'],
  'git_branch_list': ['list_branches', 'branches', 'show_branches'],
  'npm_run': ['run_npm', 'npm', 'run_script', 'execute_npm'],
  'npm_install': ['install', 'npm_add', 'add_package'],
  'npm_uninstall': ['uninstall', 'npm_remove', 'remove_package'],
  'http_request': ['fetch', 'get_url', 'fetch_url', 'fetch_url_content', 'web_request', 'curl', 'request', 'http', 'get', 'post', 'api_call', 'fetch_content'],
  'browser_navigate': ['browse', 'open_url', 'visit_page', 'web_browse', 'search_web', 'open_browser', 'navigate', 'browser', 'web'],
  'run_python': ['execute_python', 'python', 'exec_code', 'execute_code', 'run_code', 'python_exec', 'code', 'execute'],
  'mcp_rules': ['rules', 'get_rules', 'project_rules']
};

/**
 * Extract keywords from a tool name for fuzzy matching
 */
function extractKeywords(toolName: string): string[] {
  return toolName
    .toLowerCase()
    .replace(/[_-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2);
}

/**
 * Calculate similarity score between two tool names
 */
function calculateSimilarity(nativeTool: string, mcpTool: string): number {
  const normalizedNative = nativeTool.toLowerCase().replace(/[_-]/g, '');
  const normalizedMcp = mcpTool.toLowerCase().replace(/[_-]/g, '');
  
  // Exact match
  if (normalizedNative === normalizedMcp) return 100;
  
  // Check synonyms
  const synonyms = TOOL_SYNONYMS[mcpTool] || [];
  const normalizedSynonyms = synonyms.map(s => s.toLowerCase().replace(/[_-]/g, ''));
  if (normalizedSynonyms.includes(normalizedNative)) return 95;
  
  // Check if one contains the other
  if (normalizedNative.includes(normalizedMcp) || normalizedMcp.includes(normalizedNative)) return 80;
  
  // Keyword overlap
  const nativeKeywords = extractKeywords(nativeTool);
  const mcpKeywords = extractKeywords(mcpTool);
  const overlap = nativeKeywords.filter(k => mcpKeywords.includes(k)).length;
  const maxKeywords = Math.max(nativeKeywords.length, mcpKeywords.length);
  if (maxKeywords > 0 && overlap > 0) {
    return Math.round((overlap / maxKeywords) * 70);
  }
  
  return 0;
}

/**
 * Find the best matching MCP tool for a native tool name
 */
function findBestMatch(nativeTool: string, mcpTools: string[]): { tool: string; confidence: number } | null {
  let bestMatch: { tool: string; confidence: number } | null = null;
  
  for (const mcpTool of mcpTools) {
    const score = calculateSimilarity(nativeTool, mcpTool);
    if (score > 0 && (!bestMatch || score > bestMatch.confidence)) {
      bestMatch = { tool: mcpTool, confidence: score };
    }
  }
  
  return bestMatch;
}

/**
 * Perform semantic matching of discovered native tools to MCP tools
 * Returns a map of MCP tool -> array of native aliases
 */
function semanticMatchTools(discoveredTools: string[], mcpTools: string[]): Record<string, string[]> {
  const aliases: Record<string, string[]> = {};
  
  // Initialize empty arrays for all MCP tools
  for (const mcpTool of mcpTools) {
    aliases[mcpTool] = [];
  }
  
  // Match each discovered tool to an MCP tool
  for (const nativeTool of discoveredTools) {
    // Skip if it's already an exact MCP tool name
    if (mcpTools.includes(nativeTool)) {
      continue;
    }
    
    const match = findBestMatch(nativeTool, mcpTools);
    if (match && match.confidence >= 50) {
      aliases[match.tool].push(nativeTool);
      console.log(`[TestEngine] Matched native tool "${nativeTool}" -> "${match.tool}" (${match.confidence}% confidence)`);
    } else {
      console.log(`[TestEngine] No match found for native tool "${nativeTool}"`);
    }
  }
  
  return aliases;
}

export interface ToolDiscoveryResult {
  discoveredTools: string[];
  aliases: Record<string, string[]>;
  unmappedTools: string[];
}

// ============================================================
// BEHAVIOR-BASED ALIAS REFINEMENT
// ============================================================

/**
 * Score how well given arguments match a tool's parameter schema
 * Returns a score from 0-100
 */
function scoreArgsAgainstSchema(args: Record<string, any>, toolName: string): number {
  const schema = TOOL_SCHEMAS[toolName];
  if (!schema) return 0;
  
  const params = schema.function?.parameters;
  if (!params || !params.properties) return 0;
  
  const schemaProps = Object.keys(params.properties);
  const requiredProps = params.required || [];
  const argKeys = Object.keys(args);
  
  if (schemaProps.length === 0) {
    // Tool has no parameters - if args is also empty, it's a match
    return argKeys.length === 0 ? 100 : 50;
  }
  
  let score = 0;
  let maxScore = 0;
  
  // Check required parameters (weighted more heavily)
  for (const reqProp of requiredProps) {
    maxScore += 40;
    if (args[reqProp] !== undefined) {
      score += 40;
    }
  }
  
  // Check optional parameters
  const optionalProps = schemaProps.filter(p => !requiredProps.includes(p));
  for (const optProp of optionalProps) {
    maxScore += 20;
    if (args[optProp] !== undefined) {
      score += 20;
    }
  }
  
  // Penalty for extra unknown parameters
  const unknownArgs = argKeys.filter(k => !schemaProps.includes(k));
  const penalty = unknownArgs.length * 10;
  
  // Calculate final score
  const rawScore = maxScore > 0 ? (score / maxScore) * 100 : 0;
  const finalScore = Math.max(0, rawScore - penalty);
  
  return Math.round(finalScore);
}

/**
 * Find the best matching MCP tool based on actual arguments used
 * This is behavior-based matching (not just name matching)
 */
function findBestToolByArgs(args: Record<string, any>, mcpTools: string[]): { tool: string; score: number } | null {
  let bestMatch: { tool: string; score: number } | null = null;
  
  for (const tool of mcpTools) {
    const score = scoreArgsAgainstSchema(args, tool);
    if (score > 0 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { tool, score };
    }
  }
  
  return bestMatch;
}

/**
 * Alias refinement result from a single test
 */
export interface AliasRefinement {
  nativeToolName: string;       // What the model called
  originalMapping: string;      // What we initially thought it mapped to
  refinedMapping: string;       // What it actually behaves like
  confidence: number;           // How confident we are (0-100)
  reason: string;               // Why we made this refinement
}

// ============================================================
// TYPES
// ============================================================

export interface TestDefinition {
  id: string;
  tool: string;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  prompt: string;
  setupFiles?: Record<string, string>;
  expected: {
    tool: string;
    params: Record<string, ParamCondition>;
  };
}

export interface ParamCondition {
  equals?: any;
  contains?: string;
  oneOf?: any[];
  exists?: boolean;
}

export interface TestResult {
  testId: string;
  tool: string;                    // The expected tool
  passed: boolean;
  score: number;
  latency: number;
  checks: CheckResult[];
  response?: any;
  error?: string;
  calledTool?: string;             // What tool name the model actually called
  calledArgs?: Record<string, any>; // What arguments the model actually passed
}

export interface CheckResult {
  name: string;
  passed: boolean;
  expected?: any;
  actual?: any;
}

export interface TestRunResult {
  modelId: string;
  startedAt: string;
  completedAt: string;
  totalTests: number;
  passed: number;
  failed: number;
  overallScore: number;
  results: TestResult[];
}

export type TestMode = 'quick' | 'keep_on_success' | 'manual';

export interface TestOptions {
  mode?: TestMode;
  unloadOthersBefore?: boolean;  // Default: true for LM Studio
  unloadAfterTest?: boolean;     // Default: false
  unloadOnlyOnFail?: boolean;    // Default: false (used with keep_on_success)
  contextLength?: number;        // Context length for model loading (default: 8192)
}

// ============================================================
// TEST DEFINITIONS
// ============================================================

export const TEST_DEFINITIONS: TestDefinition[] = [
  // ========== FILE OPERATIONS ==========
  {
    id: 'file_read_basic',
    tool: 'file_read',
    category: 'file_operations',
    difficulty: 'easy',
    prompt: 'Read the contents of the file named "config.json" in the current directory.',
    setupFiles: { 'config.json': '{"port": 3000, "debug": true}' },
    expected: {
      tool: 'file_read',
      params: { path: { contains: 'config.json' } }
    }
  },
  {
    id: 'file_read_nested',
    tool: 'file_read',
    category: 'file_operations',
    difficulty: 'medium',
    prompt: 'I need to see what\'s in the file located at src/utils/helpers.ts',
    setupFiles: { 'src/utils/helpers.ts': 'export const helper = () => {}' },
    expected: {
      tool: 'file_read',
      params: { path: { contains: 'helpers.ts' } }
    }
  },
  {
    id: 'file_write_basic',
    tool: 'file_write',
    category: 'file_operations',
    difficulty: 'easy',
    prompt: 'Create a new file called "hello.js" with the content: console.log("Hello World")',
    expected: {
      tool: 'file_write',
      params: {
        path: { contains: 'hello.js' },
        content: { contains: 'console.log' }
      }
    }
  },
  {
    id: 'file_patch_basic',
    tool: 'file_patch',
    category: 'file_operations',
    difficulty: 'medium',
    prompt: 'In the file "app.js", change the port number from 3000 to 8080',
    setupFiles: { 'app.js': 'const port = 3000;\napp.listen(port);' },
    expected: {
      tool: 'file_patch',
      params: {
        path: { contains: 'app.js' },
        find: { contains: '3000' },
        replace: { contains: '8080' }
      }
    }
  },
  {
    id: 'file_list_basic',
    tool: 'file_list',
    category: 'file_operations',
    difficulty: 'easy',
    prompt: 'Show me all files in the src directory',
    expected: {
      tool: 'file_list',
      params: { folder: { oneOf: ['src', 'src/', './src', undefined] } }
    }
  },
  {
    id: 'file_search_basic',
    tool: 'file_search',
    category: 'file_operations',
    difficulty: 'medium',
    prompt: 'Search for all occurrences of "TODO" in the project files',
    expected: {
      tool: 'file_search',
      params: { query: { contains: 'TODO' } }
    }
  },

  // ========== GIT OPERATIONS ==========
  {
    id: 'git_status_basic',
    tool: 'git_status',
    category: 'git_operations',
    difficulty: 'easy',
    prompt: 'Check the current git status of this repository',
    expected: {
      tool: 'git_status',
      params: {}
    }
  },
  {
    id: 'git_diff_basic',
    tool: 'git_diff',
    category: 'git_operations',
    difficulty: 'easy',
    prompt: 'Show me the git diff for the file "index.js"',
    expected: {
      tool: 'git_diff',
      params: { file: { contains: 'index.js' } }
    }
  },
  {
    id: 'git_log_basic',
    tool: 'git_log',
    category: 'git_operations',
    difficulty: 'easy',
    prompt: 'Show me the last 5 commits',
    expected: {
      tool: 'git_log',
      params: { count: { oneOf: [5, '5', undefined] } }
    }
  },
  {
    id: 'git_commit_basic',
    tool: 'git_commit',
    category: 'git_operations',
    difficulty: 'medium',
    prompt: 'Commit all changes with the message "Fix login bug"',
    expected: {
      tool: 'git_commit',
      params: { message: { contains: 'Fix login bug' } }
    }
  },
  {
    id: 'git_branch_create_basic',
    tool: 'git_branch_create',
    category: 'git_operations',
    difficulty: 'medium',
    prompt: 'Create a new branch called "feature/user-auth"',
    expected: {
      tool: 'git_branch_create',
      params: { name: { contains: 'user-auth' } }
    }
  },

  // ========== NPM OPERATIONS ==========
  {
    id: 'npm_run_basic',
    tool: 'npm_run',
    category: 'npm_operations',
    difficulty: 'easy',
    prompt: 'Run the "build" npm script',
    expected: {
      tool: 'npm_run',
      params: { script: { oneOf: ['build', '"build"'] } }
    }
  },
  {
    id: 'npm_install_basic',
    tool: 'npm_install',
    category: 'npm_operations',
    difficulty: 'medium',
    prompt: 'Install the lodash package',
    expected: {
      tool: 'npm_install',
      params: { package: { contains: 'lodash' } }
    }
  },

  // ========== HTTP/BROWSER ==========
  {
    id: 'http_request_get',
    tool: 'http_request',
    category: 'http_operations',
    difficulty: 'easy',
    prompt: 'Fetch the data from https://api.example.com/users',
    expected: {
      tool: 'http_request',
      params: {
        url: { contains: 'api.example.com/users' },
        method: { oneOf: ['GET', 'get', undefined] }
      }
    }
  },
  {
    id: 'browser_navigate_basic',
    tool: 'browser_navigate',
    category: 'browser_operations',
    difficulty: 'medium',
    prompt: 'Open the website https://github.com and get the page title',
    expected: {
      tool: 'browser_navigate',
      params: {
        url: { contains: 'github.com' }
      }
    }
  },

  // ========== ADDITIONAL FILE OPERATIONS ==========
  {
    id: 'create_new_file_basic',
    tool: 'create_new_file',
    category: 'file_operations',
    difficulty: 'easy',
    prompt: 'Create a new empty file called "README.md"',
    expected: {
      tool: 'create_new_file',
      params: {
        path: { contains: 'README.md' }
      }
    }
  },
  {
    id: 'folder_create_basic',
    tool: 'folder_create',
    category: 'file_operations',
    difficulty: 'easy',
    prompt: 'Create a new folder called "components"',
    expected: {
      tool: 'folder_create',
      params: {
        path: { oneOf: ['components', 'components/', './components'] }
      }
    }
  },
  {
    id: 'folder_delete_basic',
    tool: 'folder_delete',
    category: 'file_operations',
    difficulty: 'medium',
    prompt: 'Delete the folder named "temp"',
    expected: {
      tool: 'folder_delete',
      params: {
        path: { contains: 'temp' }
      }
    }
  },

  // ========== ADDITIONAL GIT OPERATIONS ==========
  {
    id: 'git_add_basic',
    tool: 'git_add',
    category: 'git_operations',
    difficulty: 'easy',
    prompt: 'Stage the file "index.js" for commit',
    expected: {
      tool: 'git_add',
      params: {
        file: { contains: 'index.js' }
      }
    }
  },
  {
    id: 'git_add_all',
    tool: 'git_add',
    category: 'git_operations',
    difficulty: 'easy',
    prompt: 'Stage all changes for commit',
    expected: {
      tool: 'git_add',
      params: {
        file: { oneOf: ['.', '*', '-A', '--all', undefined] }
      }
    }
  },
  {
    id: 'git_branch_list_basic',
    tool: 'git_branch_list',
    category: 'git_operations',
    difficulty: 'easy',
    prompt: 'Show me all the branches in this repository',
    expected: {
      tool: 'git_branch_list',
      params: {}
    }
  },

  // ========== ADDITIONAL NPM OPERATIONS ==========
  {
    id: 'npm_uninstall_basic',
    tool: 'npm_uninstall',
    category: 'npm_operations',
    difficulty: 'medium',
    prompt: 'Remove the axios package from the project',
    expected: {
      tool: 'npm_uninstall',
      params: {
        package: { contains: 'axios' }
      }
    }
  },

  // ========== PYTHON ==========
  {
    id: 'run_python_basic',
    tool: 'run_python',
    category: 'other_operations',
    difficulty: 'medium',
    prompt: 'Run a Python script that prints "Hello World"',
    expected: {
      tool: 'run_python',
      params: {
        code: { contains: 'print' }
      }
    }
  }
];

// ============================================================
// TEST ENGINE
// ============================================================

class TestEngine {
  private sandboxDir: string;

  constructor() {
    this.sandboxDir = path.join(__dirname, '../../../data/test-sandbox');
  }

  /**
   * Discover native tools that the model claims to support
   * Returns list of tool names the model reports having
   */
  async discoverNativeTools(
    modelId: string,
    provider: 'lmstudio' | 'openai' | 'azure',
    settings: any
  ): Promise<string[]> {
    console.log(`[TestEngine] Starting tool discovery for ${modelId}...`);
    
    const discoveryPrompt = `List all the tools or functions you have access to.
For each tool, provide just the function name (e.g., "read_file", "search_web").
Output ONLY a JSON array of tool names, nothing else.
Example: ["tool1", "tool2", "tool3"]`;

    const messages = [
      { role: 'system', content: 'You are a helpful assistant. Answer precisely and concisely.' },
      { role: 'user', content: discoveryPrompt }
    ];

    try {
      const response = await this.callLLM(modelId, provider, messages, [], settings);
      
      // Extract content from response
      let content = '';
      if (response?.choices?.[0]?.message?.content) {
        content = response.choices[0].message.content;
      } else if (typeof response === 'string') {
        content = response;
      }
      
      // Try to parse JSON array from response
      const jsonMatch = content.match(/\[[\s\S]*?\]/);
      if (jsonMatch) {
        const tools = JSON.parse(jsonMatch[0]);
        if (Array.isArray(tools)) {
          const toolNames = tools
            .map((t: any) => typeof t === 'string' ? t : t.name || t.function)
            .filter((t: any) => typeof t === 'string' && t.length > 0);
          
          console.log(`[TestEngine] Discovered ${toolNames.length} native tools: ${toolNames.join(', ')}`);
          return toolNames;
        }
      }
      
      console.log('[TestEngine] Could not parse tool list from model response');
      return [];
    } catch (error: any) {
      console.log(`[TestEngine] Tool discovery failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Run tool discovery and semantic matching, returns aliases per MCP tool
   */
  async discoverAndMatchTools(
    modelId: string,
    provider: 'lmstudio' | 'openai' | 'azure',
    settings: any
  ): Promise<ToolDiscoveryResult> {
    // Discover what tools the model claims to have
    const discoveredTools = await this.discoverNativeTools(modelId, provider, settings);
    
    if (discoveredTools.length === 0) {
      console.log('[TestEngine] No native tools discovered, skipping semantic matching');
      return {
        discoveredTools: [],
        aliases: {},
        unmappedTools: []
      };
    }
    
    // Get list of MCP tools
    const mcpTools = ALL_TOOLS;
    
    // Perform semantic matching
    const aliases = semanticMatchTools(discoveredTools, mcpTools);
    
    // Find unmapped tools (native tools that didn't match any MCP tool)
    const mappedNativeTools = Object.values(aliases).flat();
    const unmappedTools = discoveredTools.filter(t => 
      !mcpTools.includes(t) && !mappedNativeTools.includes(t)
    );
    
    if (unmappedTools.length > 0) {
      console.log(`[TestEngine] Unmapped native tools (no MCP equivalent): ${unmappedTools.join(', ')}`);
    }
    
    // Broadcast discovery results
    wsBroadcast.broadcast('tool_discovery', {
      modelId,
      discoveredTools,
      aliases,
      unmappedTools
    });
    
    return {
      discoveredTools,
      aliases,
      unmappedTools
    };
  }

  // Model loading/unloading is now handled by the centralized modelManager service
  // See: server/src/services/lmstudio-model-manager.ts

  /**
   * Run all tests for a model
   */
  async runAllTests(
    modelId: string,
    provider: 'lmstudio' | 'openai' | 'azure',
    settings: {
      lmstudioUrl?: string;
      openaiApiKey?: string;
      azureResourceName?: string;
      azureApiKey?: string;
      azureDeploymentName?: string;
      azureApiVersion?: string;
    },
    options: TestOptions = {}
  ): Promise<TestRunResult> {
    const startedAt = new Date().toISOString();
    notifications.modelTestStarted(modelId);

    // Parse test mode options
    const mode = options.mode || 'manual';
    const unloadOthersBefore = options.unloadOthersBefore ?? (mode !== 'manual');
    const unloadAfterTest = options.unloadAfterTest ?? (mode === 'quick');
    const unloadOnlyOnFail = options.unloadOnlyOnFail ?? (mode === 'keep_on_success');
    
    // Get context length: explicit option > profile > default
    // Explicit options take priority to allow tests to override saved profile values
    let contextLength = 8192;
    let contextSource = 'default';
    
    if (options.contextLength) {
      // Explicit test option takes highest priority
      contextLength = options.contextLength;
      contextSource = 'test options';
    } else {
      // Fall back to profile's saved context length
      try {
        const profile = await capabilities.getProfile(modelId);
        if (profile?.contextLength) {
          contextLength = profile.contextLength;
          contextSource = 'model profile';
        }
      } catch {
        // Use default if profile not found
      }
    }
    console.log(`[TestEngine] Using context length ${contextLength} from ${contextSource}`);

    console.log(`[TestEngine] Starting tests for model: ${modelId} (mode: ${mode}, context: ${contextLength})`);

    // For LM Studio: ensure model is loaded with correct context via centralized manager
    if (provider === 'lmstudio') {
      try {
        await modelManager.ensureLoaded(modelId, contextLength);
      } catch (error: any) {
        console.error(`[TestEngine] Failed to load model: ${error.message}`);
        // Continue anyway - model might already be loaded
      }
    }

    // Step 1: Tool Discovery - Try to discover native tools and match to MCP tools
    let discoveryResult: ToolDiscoveryResult = { discoveredTools: [], aliases: {}, unmappedTools: [] };
    try {
      wsBroadcast.broadcastProgress('tools', modelId, {
        current: 0,
        total: TEST_DEFINITIONS.length + 1,
        currentTest: 'Discovering native tools...',
        score: 0,
        status: 'running'
      });
      
      discoveryResult = await this.discoverAndMatchTools(modelId, provider, settings);
      console.log(`[TestEngine] Tool discovery complete: ${discoveryResult.discoveredTools.length} tools found`);
    } catch (error: any) {
      console.log(`[TestEngine] Tool discovery failed, continuing with tests: ${error.message}`);
      // Continue without discovery - this is a graceful fallback
    }

    const results: TestResult[] = [];
    const totalTests = TEST_DEFINITIONS.length;
    let completedTests = 0;
    let runningScore = 0;
    
    // Collect alias refinements based on actual model behavior
    const aliasRefinements: AliasRefinement[] = [];

    // Broadcast initial progress
    wsBroadcast.broadcastProgress('tools', modelId, {
      current: 0,
      total: totalTests,
      currentTest: TEST_DEFINITIONS[0]?.tool || 'Starting...',
      score: 0,
      status: 'running'
    });
    
    for (const test of TEST_DEFINITIONS) {
      try {
        const result = await this.runSingleTest(test, modelId, provider, settings);
        results.push(result);
        completedTests++;
        runningScore = Math.round(results.reduce((sum, r) => sum + r.score, 0) / completedTests);
        
        console.log(`[TestEngine] ${test.id}: ${result.passed ? '✅ PASS' : '❌ FAIL'} (${result.score}%)`);
        
        // === ALIAS REFINEMENT LOGIC ===
        // If the model called a different tool name, check if args match another MCP tool better
        if (result.calledTool && result.calledArgs && result.calledTool !== test.tool) {
          const refinement = this.analyzeAliasRefinement(
            result.calledTool,
            result.calledArgs,
            test.tool,
            discoveryResult.aliases
          );
          if (refinement) {
            aliasRefinements.push(refinement);
            console.log(`[TestEngine] Alias refinement: "${refinement.nativeToolName}" → "${refinement.refinedMapping}" (was: "${refinement.originalMapping}", confidence: ${refinement.confidence}%)`);
          }
        }

        // Broadcast progress
        wsBroadcast.broadcastProgress('tools', modelId, {
          current: completedTests,
          total: totalTests,
          currentTest: test.tool,
          score: runningScore,
          status: 'running'
        });
      } catch (error: any) {
        results.push({
          testId: test.id,
          tool: test.tool,
          passed: false,
          score: 0,
          latency: 0,
          checks: [],
          error: error.message
        });
        completedTests++;
        runningScore = Math.round(results.reduce((sum, r) => sum + r.score, 0) / completedTests);
        console.error(`[TestEngine] ${test.id}: ❌ ERROR - ${error.message}`);

        // Broadcast progress even on error
        wsBroadcast.broadcastProgress('tools', modelId, {
          current: completedTests,
          total: totalTests,
          currentTest: test.tool,
          score: runningScore,
          status: 'running'
        });
      }
    }
    
    // Log summary of alias refinements
    if (aliasRefinements.length > 0) {
      console.log(`[TestEngine] ${aliasRefinements.length} alias refinement(s) detected based on behavior`);
    }

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    const overallScore = results.length > 0
      ? Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length)
      : 0;

    const runResult: TestRunResult = {
      modelId,
      startedAt,
      completedAt: new Date().toISOString(),
      totalTests: results.length,
      passed,
      failed,
      overallScore,
      results
    };

    // Update model profile with test results, discovered aliases, and behavior-based refinements
    await this.updateModelProfile(modelId, provider, runResult, discoveryResult, aliasRefinements);

    // For LM Studio: optionally unload after test
    if (provider === 'lmstudio') {
      const shouldUnload = unloadAfterTest || (unloadOnlyOnFail && overallScore < 50);
      if (shouldUnload) {
        try {
          await modelManager.unloadModel(modelId);
          console.log(`[TestEngine] Unloaded model ${modelId} after test (score: ${overallScore}%)`);
        } catch (error: any) {
          console.error(`[TestEngine] Failed to unload model: ${error.message}`);
        }
      }
    }

    notifications.modelTestCompleted(modelId, overallScore);

    // Broadcast completion
    wsBroadcast.broadcastProgress('tools', modelId, {
      current: totalTests,
      total: totalTests,
      currentTest: 'Complete',
      score: overallScore,
      status: 'completed'
    });

    return runResult;
  }

  /**
   * Run a single test
   */
  async runSingleTest(
    test: TestDefinition,
    modelId: string,
    provider: 'lmstudio' | 'openai' | 'azure',
    settings: any
  ): Promise<TestResult> {
    const startTime = Date.now();

    // Setup sandbox if needed
    if (test.setupFiles) {
      await this.setupSandbox(test.setupFiles);
    }

    try {
      // Build request
      const messages = [
        { role: 'system', content: 'You are a helpful assistant with access to tools. Use tools when appropriate.' },
        { role: 'user', content: test.prompt }
      ];

      const tools = getToolSchemas([test.tool]);

      // Call LLM
      const response = await this.callLLM(modelId, provider, messages, tools, settings);
      const latency = Date.now() - startTime;

      // Evaluate response (includes the tool name and args the model actually used)
      const { score, checks, passed, calledTool, calledArgs } = this.evaluateResponse(response, test.expected);

      return {
        testId: test.id,
        tool: test.tool,
        passed,
        score,
        latency,
        checks,
        response,
        calledTool,
        calledArgs
      };

    } finally {
      // Cleanup sandbox
      await this.cleanupSandbox();
    }
  }

  /**
   * Call LLM with tool schema
   */
  private async callLLM(
    modelId: string,
    provider: 'lmstudio' | 'openai' | 'azure',
    messages: any[],
    tools: any[],
    settings: any
  ): Promise<any> {
    let url: string;
    let headers: Record<string, string> = { 'Content-Type': 'application/json' };
    let body: any = {
      messages,
      tools,
      tool_choice: 'auto',
      temperature: 0,
      max_tokens: 500  // Limit output to prevent runaway generation
    };

    switch (provider) {
      case 'lmstudio':
        url = `${settings.lmstudioUrl}/v1/chat/completions`;
        body.model = modelId;
        // Add stop strings to prevent loops and leaked control tokens
        body.stop = [
          '<|im_end|>', '<|im_start|>', '<|stop|>', '<|end|>',
          '<|recipient|>', '<|from|>', '<|eot_id|>', '<|end_header_id|>',
          '</s>', '[/INST]', '<|endoftext|>',
          '\n\nUser:', '\n\nHuman:', '\nuser:', '\nhuman:'
        ];
        break;

      case 'openai':
        url = 'https://api.openai.com/v1/chat/completions';
        headers['Authorization'] = `Bearer ${settings.openaiApiKey}`;
        body.model = modelId;
        break;

      case 'azure':
        const { azureResourceName, azureDeploymentName, azureApiKey, azureApiVersion } = settings;
        url = `https://${azureResourceName}.openai.azure.com/openai/deployments/${azureDeploymentName}/chat/completions?api-version=${azureApiVersion || '2024-02-01'}`;
        headers['api-key'] = azureApiKey;
        break;

      default:
        throw new Error(`Unknown provider: ${provider}`);
    }

    const response = await axios.post(url, body, {
      headers,
      timeout: 60000
    });

    return response.data;
  }

  /**
   * Evaluate LLM response against expected values
   */
  private evaluateResponse(
    response: any,
    expected: TestDefinition['expected']
  ): { score: number; checks: CheckResult[]; passed: boolean; calledTool?: string; calledArgs?: Record<string, any> } {
    const checks: CheckResult[] = [];
    let score = 0;

    // Check 1: Has tool_calls (20 points)
    const toolCalls = response?.choices?.[0]?.message?.tool_calls;
    const hasToolCalls = Array.isArray(toolCalls) && toolCalls.length > 0;
    checks.push({
      name: 'has_tool_calls',
      passed: hasToolCalls,
      expected: 'tool_calls array',
      actual: hasToolCalls ? `${toolCalls.length} tool calls` : 'none'
    });
    if (hasToolCalls) score += 20;

    if (!hasToolCalls) {
      return { score, checks, passed: false };
    }

    const toolCall = toolCalls[0];
    const functionName = toolCall?.function?.name;
    let args: Record<string, any> = {};

    try {
      args = JSON.parse(toolCall?.function?.arguments || '{}');
    } catch {
      // Invalid JSON
    }

    // Check 2: Correct tool name (25 points)
    const correctTool = functionName === expected.tool;
    checks.push({
      name: 'correct_tool',
      passed: correctTool,
      expected: expected.tool,
      actual: functionName
    });
    if (correctTool) score += 25;

    // Check 3-N: Parameters (remaining points split among params)
    const paramCount = Object.keys(expected.params).length;
    const pointsPerParam = paramCount > 0 ? Math.floor(55 / paramCount) : 0;

    for (const [paramName, condition] of Object.entries(expected.params)) {
      const actualValue = args[paramName];
      const passed = this.evaluateCondition(actualValue, condition);
      
      checks.push({
        name: `param_${paramName}`,
        passed,
        expected: JSON.stringify(condition),
        actual: JSON.stringify(actualValue)
      });
      
      if (passed) score += pointsPerParam;
    }

    // Passed if score >= 70
    const passed = score >= 70;
    
    // Return the called tool and args for alias refinement
    return { score: Math.min(score, 100), checks, passed, calledTool: functionName, calledArgs: args };
  }

  /**
   * Evaluate a parameter condition
   */
  private evaluateCondition(value: any, condition: ParamCondition): boolean {
    if (condition.equals !== undefined) {
      return value === condition.equals;
    }

    if (condition.contains !== undefined) {
      return typeof value === 'string' && value.includes(condition.contains);
    }

    if (condition.oneOf !== undefined) {
      return condition.oneOf.includes(value);
    }

    if (condition.exists !== undefined) {
      return condition.exists ? value !== undefined : value === undefined;
    }

    // No condition = always pass
    return true;
  }

  /**
   * Analyze if an alias should be refined based on actual model behavior
   * Returns a refinement if the args match a different tool better than expected
   */
  private analyzeAliasRefinement(
    calledToolName: string,
    calledArgs: Record<string, any>,
    expectedTool: string,
    currentAliases: Record<string, string[]>
  ): AliasRefinement | null {
    // Get all MCP tools to score against
    const mcpTools = ALL_TOOLS;
    
    // Score the args against all MCP tool schemas
    const bestMatch = findBestToolByArgs(calledArgs, mcpTools);
    
    if (!bestMatch || bestMatch.score < 40) {
      // No confident match found
      return null;
    }
    
    // Find what tool the calledToolName is currently aliased to
    let currentMapping: string | null = null;
    for (const [mcpTool, aliases] of Object.entries(currentAliases)) {
      if (aliases.includes(calledToolName)) {
        currentMapping = mcpTool;
        break;
      }
    }
    
    // If no current mapping, it might be a direct MCP tool name or unmapped
    if (!currentMapping) {
      currentMapping = mcpTools.includes(calledToolName) ? calledToolName : expectedTool;
    }
    
    // If the best match is different from the current mapping and has higher confidence
    if (bestMatch.tool !== currentMapping) {
      // Score the args against the current mapping too
      const currentScore = scoreArgsAgainstSchema(calledArgs, currentMapping);
      
      // Only refine if the new match is significantly better (at least 20% better)
      if (bestMatch.score > currentScore + 20) {
        return {
          nativeToolName: calledToolName,
          originalMapping: currentMapping,
          refinedMapping: bestMatch.tool,
          confidence: bestMatch.score,
          reason: `Args match "${bestMatch.tool}" (${bestMatch.score}%) better than "${currentMapping}" (${currentScore}%)`
        };
      }
    }
    
    return null;
  }

  /**
   * Setup test sandbox
   */
  private async setupSandbox(files: Record<string, string>): Promise<void> {
    await fs.ensureDir(this.sandboxDir);
    
    for (const [filePath, content] of Object.entries(files)) {
      const fullPath = path.join(this.sandboxDir, filePath);
      await fs.ensureDir(path.dirname(fullPath));
      await fs.writeFile(fullPath, content, 'utf-8');
    }
  }

  /**
   * Cleanup test sandbox
   */
  private async cleanupSandbox(): Promise<void> {
    try {
      await fs.remove(this.sandboxDir);
    } catch {
      // Ignore cleanup errors
    }
  }

  /**
   * Update model profile with test results and alias refinements
   */
  private async updateModelProfile(
    modelId: string,
    provider: 'lmstudio' | 'openai' | 'azure',
    runResult: TestRunResult,
    discoveryResult?: ToolDiscoveryResult,
    aliasRefinements?: AliasRefinement[]
  ): Promise<void> {
    let profile = await capabilities.getProfile(modelId);
    
    if (!profile) {
      profile = capabilities.createEmptyProfile(modelId, modelId, provider);
    }

    // Convert test results to format expected by capabilities
    const testResultsForCapabilities = runResult.results.map(r => ({
      testId: r.testId,
      tool: r.tool,
      passed: r.passed,
      score: r.score,
      latency: r.latency,
      response: r.response ? JSON.stringify(r.response).slice(0, 500) : undefined,
      error: r.error
    }));

    profile = capabilities.updateProfileWithResults(profile, testResultsForCapabilities);
    
    // Save ALL discovered native tools (not just matched ones)
    if (discoveryResult) {
      // Store all discovered tools
      if (discoveryResult.discoveredTools.length > 0) {
        profile.discoveredNativeTools = discoveryResult.discoveredTools;
        console.log(`[TestEngine] Saved ${discoveryResult.discoveredTools.length} discovered native tools`);
      }
      
      // Store unmapped tools (tools with no MCP equivalent)
      if (discoveryResult.unmappedTools.length > 0) {
        profile.unmappedNativeTools = discoveryResult.unmappedTools;
        console.log(`[TestEngine] Saved ${discoveryResult.unmappedTools.length} unmapped native tools`);
      }
      
      // Add native tool aliases from discovery (matched tools)
      if (Object.keys(discoveryResult.aliases).length > 0) {
        for (const [mcpTool, nativeAliases] of Object.entries(discoveryResult.aliases)) {
          if (profile.capabilities[mcpTool] && nativeAliases.length > 0) {
            profile.capabilities[mcpTool].nativeAliases = nativeAliases;
          }
        }
        console.log(`[TestEngine] Saved native aliases for ${Object.keys(discoveryResult.aliases).filter(k => discoveryResult.aliases[k].length > 0).length} MCP tools`);
      }
    }
    
    // Apply alias refinements based on actual behavior
    if (aliasRefinements && aliasRefinements.length > 0) {
      for (const refinement of aliasRefinements) {
        // Remove the alias from the old mapping
        if (profile.capabilities[refinement.originalMapping]?.nativeAliases) {
          profile.capabilities[refinement.originalMapping].nativeAliases = 
            profile.capabilities[refinement.originalMapping].nativeAliases!.filter(
              a => a !== refinement.nativeToolName
            );
        }
        
        // Add the alias to the new mapping
        if (profile.capabilities[refinement.refinedMapping]) {
          if (!profile.capabilities[refinement.refinedMapping].nativeAliases) {
            profile.capabilities[refinement.refinedMapping].nativeAliases = [];
          }
          // Only add if not already present
          if (!profile.capabilities[refinement.refinedMapping].nativeAliases!.includes(refinement.nativeToolName)) {
            profile.capabilities[refinement.refinedMapping].nativeAliases!.push(refinement.nativeToolName);
          }
        }
        
        console.log(`[TestEngine] Applied refinement: "${refinement.nativeToolName}" moved from "${refinement.originalMapping}" to "${refinement.refinedMapping}"`);
      }
      
      // Broadcast refinements for UI notification
      wsBroadcast.broadcast('alias_refinements', {
        modelId,
        refinements: aliasRefinements
      });
    }
    
    await capabilities.saveProfile(profile);
  }

  /**
   * Get all test definitions
   */
  getTestDefinitions(): TestDefinition[] {
    return TEST_DEFINITIONS;
  }

  /**
   * Get tests for a specific tool
   */
  getTestsForTool(tool: string): TestDefinition[] {
    return TEST_DEFINITIONS.filter(t => t.tool === tool);
  }

  /**
   * Run tests for specific tools only
   */
  async runTestsForTools(
    modelId: string,
    provider: 'lmstudio' | 'openai' | 'azure',
    tools: string[],
    settings: any,
    options: TestOptions = {}
  ): Promise<TestRunResult> {
    const tests = TEST_DEFINITIONS.filter(t => tools.includes(t.tool));
    
    // Parse test mode options
    const mode = options.mode || 'manual';
    const unloadOthersBefore = options.unloadOthersBefore ?? (mode !== 'manual');
    const unloadAfterTest = options.unloadAfterTest ?? (mode === 'quick');
    const unloadOnlyOnFail = options.unloadOnlyOnFail ?? (mode === 'keep_on_success');

    // Get context length: explicit option > profile > default
    let contextLength = 8192;
    if (options.contextLength) {
      contextLength = options.contextLength;
    } else {
      try {
        const profile = await capabilities.getProfile(modelId);
        if (profile?.contextLength) {
          contextLength = profile.contextLength;
        }
      } catch {
        // Use default if profile not found
      }
    }

    // For LM Studio: ensure model is loaded with correct context via centralized manager
    if (provider === 'lmstudio') {
      try {
        await modelManager.ensureLoaded(modelId, contextLength);
      } catch (error: any) {
        console.error(`[TestEngine] Failed to load model: ${error.message}`);
      }
    }

    // Create a temporary engine state with filtered tests
    const startedAt = new Date().toISOString();
    const results: TestResult[] = [];

    for (const test of tests) {
      try {
        const result = await this.runSingleTest(test, modelId, provider, settings);
        results.push(result);
      } catch (error: any) {
        results.push({
          testId: test.id,
          tool: test.tool,
          passed: false,
          score: 0,
          latency: 0,
          checks: [],
          error: error.message
        });
      }
    }

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    const overallScore = results.length > 0
      ? Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length)
      : 0;

    // For LM Studio: optionally unload after test
    if (provider === 'lmstudio') {
      const shouldUnload = unloadAfterTest || (unloadOnlyOnFail && overallScore < 50);
      if (shouldUnload) {
        try {
          await modelManager.unloadModel(modelId);
          console.log(`[TestEngine] Unloaded model ${modelId} after test (score: ${overallScore}%)`);
        } catch (error: any) {
          console.error(`[TestEngine] Failed to unload model: ${error.message}`);
        }
      }
    }

    return {
      modelId,
      startedAt,
      completedAt: new Date().toISOString(),
      totalTests: results.length,
      passed,
      failed,
      overallScore,
      results
    };
  }
}

// Export singleton
export const testEngine = new TestEngine();

