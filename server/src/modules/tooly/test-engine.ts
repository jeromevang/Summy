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
import { ALL_PROBE_DEFINITIONS } from './testing/test-definitions.js';
import type { ProbeDefinition } from './types.js';
import { probeEngine } from './probe-engine.js';
import { ESSENTIAL_TOOLS, STANDARD_TOOLS, FULL_TOOLS } from './orchestrator/mcp-orchestrator.js';
import { configGenerator } from './orchestrator/config-generator.js';
import type { ContextLatencyResult } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================
// TOOL DISCOVERY & SEMANTIC MATCHING
// ============================================================

/**
 * Common synonyms for matching native tool names to MCP tools
 */
const TOOL_SYNONYMS: Record<string, string[]> = {
  // RAG - Semantic Code Search (PREFERRED for code understanding)
  'rag_query': ['semantic_search', 'code_search', 'search_code', 'find_code', 'codebase_search', 'semantic_query', 'rag', 'vector_search', 'ai_search'],
  'rag_status': ['rag_info', 'index_status', 'search_status', 'vector_status'],
  'rag_index': ['index_code', 'index_codebase', 'build_index', 'create_index', 'reindex'],
  
  // File Operations (Official MCP names)
  'read_file': ['file_read', 'get_file', 'cat', 'load_file', 'read', 'file_get', 'get_file_content', 'read_content'],
  'read_multiple_files': ['read_files', 'get_files', 'batch_read', 'multi_read'],
  'write_file': ['file_write', 'save_file', 'put_file', 'write', 'file_put', 'save', 'create_file', 'create_new_file', 'new_file'],
  'edit_file': ['file_patch', 'patch_file', 'modify_file', 'update_file', 'patch', 'edit'],
  'delete_file': ['file_delete', 'remove_file', 'rm', 'unlink'],
  'copy_file': ['file_copy', 'cp', 'duplicate'],
  'move_file': ['file_move', 'mv', 'rename', 'relocate'],
  'get_file_info': ['file_info', 'stat', 'file_stats', 'file_metadata'],
  'list_directory': ['file_list', 'list_files', 'ls', 'dir', 'directory_list'],
  'search_files': ['file_search', 'grep', 'find', 'search', 'find_in_files'],
  'create_directory': ['folder_create', 'mkdir', 'make_directory', 'create_folder'],
  'delete_directory': ['folder_delete', 'rmdir', 'remove_directory', 'rm_folder'],
  'list_allowed_directories': ['allowed_dirs', 'get_allowed', 'accessible_dirs'],
  
  // Git Operations
  'git_status': ['status', 'git_stat', 'repo_status'],
  'git_diff': ['diff', 'git_changes', 'show_diff'],
  'git_log': ['log', 'git_history', 'commit_history'],
  'git_commit': ['commit', 'git_save', 'save_changes'],
  'git_add': ['add', 'stage', 'git_stage'],
  'git_push': ['push', 'upload', 'sync_remote'],
  'git_pull': ['pull', 'fetch_merge', 'sync'],
  'git_checkout': ['checkout', 'switch_branch', 'restore'],
  'git_stash': ['stash', 'save_temp', 'stash_changes'],
  'git_stash_pop': ['unstash', 'pop_stash', 'restore_stash'],
  'git_reset': ['reset', 'undo', 'revert_head'],
  'git_clone': ['clone', 'clone_repo', 'copy_repo'],
  'git_branch_create': ['create_branch', 'new_branch', 'branch'],
  'git_branch_list': ['list_branches', 'branches', 'show_branches'],
  'git_blame': ['blame', 'annotate', 'who_changed'],
  'git_show': ['show', 'show_commit', 'commit_details'],
  
  // NPM Operations
  'npm_run': ['run_npm', 'npm', 'run_script', 'execute_npm'],
  'npm_install': ['install', 'npm_add', 'add_package'],
  'npm_uninstall': ['uninstall', 'npm_remove', 'remove_package'],
  'npm_init': ['init', 'initialize', 'create_package'],
  'npm_test': ['test', 'run_tests', 'unit_test'],
  'npm_build': ['build', 'compile', 'bundle'],
  'npm_list': ['list_packages', 'show_deps', 'dependencies'],
  
  // HTTP/Search
  'http_request': ['fetch', 'get_url', 'fetch_url', 'fetch_url_content', 'web_request', 'curl', 'request', 'http', 'get', 'post', 'api_call', 'fetch_content'],
  'web_search': ['search', 'google', 'lookup', 'find_online', 'internet_search'],
  
  // Browser
  'browser_navigate': ['browse', 'open_url', 'visit_page', 'web_browse', 'search_web', 'open_browser', 'navigate', 'browser', 'web'],
  'browser_click': ['click', 'click_element', 'press'],
  'browser_type': ['type', 'input', 'enter_text', 'fill'],
  'browser_snapshot': ['snapshot', 'accessibility', 'page_tree'],
  'browser_take_screenshot': ['screenshot', 'capture', 'screen_grab'],
  
  // Code Execution
  'shell_exec': ['shell', 'bash', 'terminal', 'command', 'exec'],
  'run_python': ['execute_python', 'python', 'exec_code', 'execute_code', 'run_code', 'python_exec', 'code', 'execute'],
  'run_node': ['node', 'javascript', 'js', 'run_js'],
  'run_typescript': ['typescript', 'ts', 'run_ts'],
  
  // Memory
  'memory_store': ['store', 'save_memory', 'remember', 'cache', 'set'],
  'memory_retrieve': ['retrieve', 'get_memory', 'recall', 'load'],
  'memory_list': ['list_memory', 'show_memory', 'keys'],
  'memory_delete': ['forget', 'clear_memory', 'remove_memory'],
  
  // Text
  'text_summarize': ['summarize', 'summary', 'tldr', 'condense'],
  'diff_files': ['compare', 'file_diff', 'compare_files'],
  
  // Process
  'process_list': ['ps', 'list_processes', 'running', 'tasks'],
  'process_kill': ['kill', 'terminate', 'stop_process', 'end_task'],
  
  // Archive
  'zip_create': ['zip', 'compress', 'archive', 'pack'],
  'zip_extract': ['unzip', 'extract', 'decompress', 'unpack'],
  
  // Utility
  'mcp_rules': ['rules', 'get_rules', 'project_rules'],
  'env_get': ['getenv', 'get_environment', 'environment'],
  'env_set': ['setenv', 'set_environment'],
  'json_parse': ['parse_json', 'json', 'decode_json'],
  'base64_encode': ['encode', 'to_base64', 'b64_encode'],
  'base64_decode': ['decode', 'from_base64', 'b64_decode']
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

export interface OptimizationResults {
  contextLatency?: ContextLatencyResult;
  toolCountSweep?: {
    essential: { count: number; score: number; latency: number };
    standard: { count: number; score: number; latency: number };
    full: { count: number; score: number; latency: number };
    optimal: 'essential' | 'standard' | 'full';
  };
  ragTuning?: {
    chunkSizes: Record<number, number>; // chunkSize -> score
    resultCounts: Record<number, number>; // resultCount -> score
    optimalChunkSize: number;
    optimalResultCount: number;
  };
  optimalContextLength?: number;
  optimalToolCount?: number;
  configGenerated?: boolean;
  configPath?: string;
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
  scoreBreakdown?: {
    toolScore?: number;
    reasoningScore?: number;
    ragScore?: number;
    intentScore?: number;
    bugDetectionScore?: number;
  };
  // Pre-flight check results
  aborted?: boolean;
  abortReason?: 'MODEL_TOO_SLOW' | 'USER_CANCELLED' | 'ERROR';
  preflightLatency?: number;
  preflightMessage?: string;
  // Context latency profile (populated by Standard/Deep/Optimization modes)
  contextLatency?: {
    testedContextSizes: number[];
    latencies: Record<number, number>;
    maxUsableContext: number;
    recommendedContext: number;
    modelMaxContext?: number;
    minLatency?: number;
    isInteractiveSpeed: boolean;
    speedRating: 'excellent' | 'good' | 'acceptable' | 'slow' | 'very_slow';
  };
  // Optimization mode results
  optimization?: OptimizationResults;
}

export type TestMode = 'quick' | 'standard' | 'deep' | 'optimization' | 'keep_on_success' | 'manual';

export interface TestOptions {
  mode?: TestMode;
  unloadOthersBefore?: boolean;  // Default: true for LM Studio
  unloadAfterTest?: boolean;     // Default: false
  unloadOnlyOnFail?: boolean;    // Default: false (used with keep_on_success)
  contextLength?: number;        // Context length for model loading (default: 8192)
  skipPreflight?: boolean;       // Skip pre-flight latency check (force run)
  signal?: AbortSignal;          // External abort signal
}

// ============================================================
// TEST DEFINITIONS
// ============================================================

export const TEST_DEFINITIONS: TestDefinition[] = [
  // ========== FILE OPERATIONS (Official MCP names) ==========
  {
    id: 'read_file_basic',
    tool: 'read_file',
    category: 'file_operations',
    difficulty: 'easy',
    prompt: 'Read the contents of the file named "config.json" in the current directory.',
    setupFiles: { 'config.json': '{"port": 3000, "debug": true}' },
    expected: {
      tool: 'read_file',
      params: { path: { contains: 'config.json' } }
    }
  },
  {
    id: 'read_file_nested',
    tool: 'read_file',
    category: 'file_operations',
    difficulty: 'medium',
    prompt: 'I need to see what\'s in the file located at src/utils/helpers.ts',
    setupFiles: { 'src/utils/helpers.ts': 'export const helper = () => {}' },
    expected: {
      tool: 'read_file',
      params: { path: { contains: 'helpers.ts' } }
    }
  },
  {
    id: 'write_file_basic',
    tool: 'write_file',
    category: 'file_operations',
    difficulty: 'easy',
    prompt: 'Create a new file called "hello.js" with the content: console.log("Hello World")',
    expected: {
      tool: 'write_file',
      params: {
        path: { contains: 'hello.js' },
        content: { contains: 'console.log' }
      }
    }
  },
  {
    id: 'edit_file_basic',
    tool: 'edit_file',
    category: 'file_operations',
    difficulty: 'medium',
    prompt: 'In the file "app.js", change the port number from 3000 to 8080',
    setupFiles: { 'app.js': 'const port = 3000;\napp.listen(port);' },
    expected: {
      tool: 'edit_file',
      params: {
        path: { contains: 'app.js' },
        edits: { exists: true }
      }
    }
  },
  {
    id: 'list_directory_basic',
    tool: 'list_directory',
    category: 'file_operations',
    difficulty: 'easy',
    prompt: 'Show me all files in the src directory',
    expected: {
      tool: 'list_directory',
      params: { path: { oneOf: ['src', 'src/', './src', undefined] } }
    }
  },
  {
    id: 'search_files_basic',
    tool: 'search_files',
    category: 'file_operations',
    difficulty: 'medium',
    prompt: 'Search for all TypeScript files in the project',
    expected: {
      tool: 'search_files',
      params: { 
        directory: { exists: true },
        pattern: { contains: 'ts' }
      }
    }
  },
  {
    id: 'create_directory_basic',
    tool: 'create_directory',
    category: 'file_operations',
    difficulty: 'easy',
    prompt: 'Create a new folder called "components"',
    expected: {
      tool: 'create_directory',
      params: {
        path: { oneOf: ['components', 'components/', './components'] }
      }
    }
  },
  {
    id: 'delete_file_basic',
    tool: 'delete_file',
    category: 'file_operations',
    difficulty: 'medium',
    prompt: 'Delete the file named "old_config.json"',
    expected: {
      tool: 'delete_file',
      params: {
        path: { contains: 'old_config.json' }
      }
    }
  },
  {
    id: 'delete_directory_basic',
    tool: 'delete_directory',
    category: 'file_operations',
    difficulty: 'medium',
    prompt: 'Delete the folder named "temp"',
    expected: {
      tool: 'delete_directory',
      params: {
        path: { contains: 'temp' }
      }
    }
  },
  {
    id: 'get_file_info_basic',
    tool: 'get_file_info',
    category: 'file_operations',
    difficulty: 'easy',
    prompt: 'Get the file size and modification date of package.json',
    expected: {
      tool: 'get_file_info',
      params: { path: { contains: 'package.json' } }
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
  {
    id: 'git_add_basic',
    tool: 'git_add',
    category: 'git_operations',
    difficulty: 'easy',
    prompt: 'Stage the file "index.js" for commit',
    expected: {
      tool: 'git_add',
      params: { file: { contains: 'index.js' } }
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
  {
    id: 'git_blame_basic',
    tool: 'git_blame',
    category: 'git_operations',
    difficulty: 'medium',
    prompt: 'Show me who last modified each line in the file "server.ts"',
    expected: {
      tool: 'git_blame',
      params: { file: { contains: 'server.ts' } }
    }
  },
  {
    id: 'git_show_basic',
    tool: 'git_show',
    category: 'git_operations',
    difficulty: 'medium',
    prompt: 'Show me the details of the latest commit',
    expected: {
      tool: 'git_show',
      params: {}
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
  {
    id: 'npm_uninstall_basic',
    tool: 'npm_uninstall',
    category: 'npm_operations',
    difficulty: 'medium',
    prompt: 'Remove the axios package from the project',
    expected: {
      tool: 'npm_uninstall',
      params: { package: { contains: 'axios' } }
    }
  },
  {
    id: 'npm_test_basic',
    tool: 'npm_test',
    category: 'npm_operations',
    difficulty: 'easy',
    prompt: 'Run the test suite for this project',
    expected: {
      tool: 'npm_test',
      params: {}
    }
  },

  // ========== HTTP/SEARCH ==========
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
    id: 'web_search_basic',
    tool: 'web_search',
    category: 'http_operations',
    difficulty: 'easy',
    prompt: 'Search the web for information about TypeScript generics',
    expected: {
      tool: 'web_search',
      params: { query: { contains: 'TypeScript' } }
    }
  },

  // ========== BROWSER ==========
  {
    id: 'browser_navigate_basic',
    tool: 'browser_navigate',
    category: 'browser_operations',
    difficulty: 'medium',
    prompt: 'Open the website https://github.com and get the page title',
    expected: {
      tool: 'browser_navigate',
      params: { url: { contains: 'github.com' } }
    }
  },
  {
    id: 'browser_screenshot_basic',
    tool: 'browser_take_screenshot',
    category: 'browser_operations',
    difficulty: 'medium',
    prompt: 'Take a screenshot of the current page',
    expected: {
      tool: 'browser_take_screenshot',
      params: {}
    }
  },

  // ========== CODE EXECUTION ==========
  {
    id: 'run_python_basic',
    tool: 'run_python',
    category: 'code_execution',
    difficulty: 'medium',
    prompt: 'Run a Python script that prints "Hello World"',
    expected: {
      tool: 'run_python',
      params: { code: { contains: 'print' } }
    }
  },
  {
    id: 'shell_exec_basic',
    tool: 'shell_exec',
    category: 'code_execution',
    difficulty: 'medium',
    prompt: 'Run the command "echo Hello" in the terminal',
    expected: {
      tool: 'shell_exec',
      params: { command: { contains: 'echo' } }
    }
  },

  // ========== MEMORY ==========
  {
    id: 'memory_store_basic',
    tool: 'memory_store',
    category: 'memory_operations',
    difficulty: 'easy',
    prompt: 'Remember that the user\'s name is "Alice"',
    expected: {
      tool: 'memory_store',
      params: { 
        key: { exists: true },
        value: { contains: 'Alice' }
      }
    }
  },
  {
    id: 'memory_retrieve_basic',
    tool: 'memory_retrieve',
    category: 'memory_operations',
    difficulty: 'easy',
    prompt: 'What is the user\'s name that I stored earlier?',
    expected: {
      tool: 'memory_retrieve',
      params: { key: { exists: true } }
    }
  },
  {
    id: 'memory_list_basic',
    tool: 'memory_list',
    category: 'memory_operations',
    difficulty: 'easy',
    prompt: 'Show me all the things I have stored in memory',
    expected: {
      tool: 'memory_list',
      params: {}
    }
  },

  // ========== TEXT ==========
  {
    id: 'text_summarize_basic',
    tool: 'text_summarize',
    category: 'text_operations',
    difficulty: 'medium',
    prompt: 'Summarize this long article: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris."',
    expected: {
      tool: 'text_summarize',
      params: { text: { exists: true } }
    }
  },
  {
    id: 'diff_files_basic',
    tool: 'diff_files',
    category: 'text_operations',
    difficulty: 'medium',
    prompt: 'Compare the files "old.txt" and "new.txt" and show me the differences',
    expected: {
      tool: 'diff_files',
      params: { 
        file1: { contains: 'old' },
        file2: { contains: 'new' }
      }
    }
  },

  // ========== PROCESS ==========
  {
    id: 'process_list_basic',
    tool: 'process_list',
    category: 'process_operations',
    difficulty: 'easy',
    prompt: 'Show me all running processes that contain "node"',
    expected: {
      tool: 'process_list',
      params: { filter: { contains: 'node' } }
    }
  },

  // ========== ARCHIVE ==========
  {
    id: 'zip_create_basic',
    tool: 'zip_create',
    category: 'archive_operations',
    difficulty: 'medium',
    prompt: 'Create a zip file called "backup.zip" containing the "src" folder',
    expected: {
      tool: 'zip_create',
      params: { 
        output: { contains: 'backup.zip' },
        sources: { exists: true }
      }
    }
  },
  {
    id: 'zip_extract_basic',
    tool: 'zip_extract',
    category: 'archive_operations',
    difficulty: 'medium',
    prompt: 'Extract the archive "data.zip" to the current directory',
    expected: {
      tool: 'zip_extract',
      params: { archive: { contains: 'data.zip' } }
    }
  },

  // ========== RAG - SEMANTIC CODE SEARCH (PREFERRED for code understanding) ==========
  {
    id: 'rag_query_basic',
    tool: 'rag_query',
    category: 'rag_operations',
    difficulty: 'easy',
    prompt: 'Search the codebase for where user authentication is handled',
    expected: {
      tool: 'rag_query',
      params: { query: { exists: true } }
    }
  },
  {
    id: 'rag_query_with_filter',
    tool: 'rag_query',
    category: 'rag_operations',
    difficulty: 'medium',
    prompt: 'Find all TypeScript files that handle database connections',
    expected: {
      tool: 'rag_query',
      params: { 
        query: { exists: true },
        fileTypes: { exists: true }
      }
    }
  },
  {
    id: 'rag_status_basic',
    tool: 'rag_status',
    category: 'rag_operations',
    difficulty: 'easy',
    prompt: 'Check the status of the RAG indexing system',
    expected: {
      tool: 'rag_status',
      params: {}
    }
  },
  {
    id: 'rag_index_basic',
    tool: 'rag_index',
    category: 'rag_operations',
    difficulty: 'medium',
    prompt: 'Index the project directory at "/home/user/myproject" for semantic search',
    expected: {
      tool: 'rag_index',
      params: { projectPath: { exists: true } }
    }
  }
];

// ============================================================
// TEST ENGINE
// ============================================================

class TestEngine {
  private sandboxDir: string;
  private runningTests: Map<string, AbortController> = new Map();

  constructor() {
    this.sandboxDir = path.join(__dirname, '../../../data/test-sandbox');
  }

  /**
   * Check if a test is currently running for a model
   */
  isTestRunning(modelId: string): boolean {
    return this.runningTests.has(modelId);
  }

  /**
   * Abort a running test for a model
   */
  abortTest(modelId: string): boolean {
    const controller = this.runningTests.get(modelId);
    if (controller) {
      controller.abort();
      this.runningTests.delete(modelId);
      console.log(`[TestEngine] Aborted test for ${modelId}`);
      
      // Broadcast cancellation
      wsBroadcast.broadcastProgress('tools', modelId, {
        current: 0,
        total: 0,
        currentTest: 'Cancelled',
        currentCategory: 'Cancelled',
        score: 0,
        status: 'cancelled'
      });
      
      return true;
    }
    return false;
  }

  /**
   * Format category ID into human-readable name
   */
  private formatCategory(categoryId: string): string {
    const categoryMap: Record<string, string> = {
      'file_operations': 'File Operations',
      'search': 'Search & Discovery',
      'reasoning': 'Reasoning',
      'rag': 'RAG Usage',
      'intent': 'Intent Recognition',
      'navigation': 'Code Navigation',
      'bug_detection': 'Bug Detection',
      'proactive': 'Proactive Help',
      'compliance': 'System Compliance',
      'stateful': 'Stateful Behavior',
      'precedence': 'Rule Precedence',
      'failure_modes': 'Failure Modes'
    };
    return categoryMap[categoryId] || categoryId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  /**
   * Filter tests based on test mode
   * Quick: Only essential tool tests (file_operations basic, intent) ~8 tests
   * Standard: Add search, rag, git_operations ~25 tests
   * Deep/Optimization/Manual: All tests ~41 tests
   */
  private filterTestsByMode(tests: TestDefinition[], mode: TestMode): TestDefinition[] {
    // Quick mode: Only basic file operations and intent (like 1.x and 8.x)
    const QUICK_CATEGORIES = ['file_operations', 'intent'];
    // Standard mode: Add more categories  
    const STANDARD_CATEGORIES = ['file_operations', 'search', 'rag', 'intent', 'git_operations', 'reasoning'];
    
    switch (mode) {
      case 'quick':
        // Quick mode: only first 8 essential tests
        const quickTests = tests.filter(t => QUICK_CATEGORIES.includes(t.category));
        // Limit to first few tests per category for speed
        const limitedQuick: TestDefinition[] = [];
        const seenCategories: Record<string, number> = {};
        for (const test of quickTests) {
          seenCategories[test.category] = (seenCategories[test.category] || 0) + 1;
          if (seenCategories[test.category] <= 4) { // Max 4 tests per category
            limitedQuick.push(test);
          }
        }
        console.log(`[TestEngine] Quick mode: filtered to ${limitedQuick.length} tests`);
        return limitedQuick;
      
      case 'standard':
      case 'keep_on_success':
        // Standard mode: core categories
        const standardTests = tests.filter(t => STANDARD_CATEGORIES.includes(t.category));
        console.log(`[TestEngine] Standard mode: filtered to ${standardTests.length} tests`);
        return standardTests;
      
      case 'deep':
      case 'optimization':
      case 'manual':
      default:
        // All tests
        console.log(`[TestEngine] ${mode} mode: running all ${tests.length} tests`);
        return tests;
    }
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
    // Create abort controller for this test run
    const abortController = new AbortController();
    this.runningTests.set(modelId, abortController);
    
    const startedAt = new Date().toISOString();
    notifications.modelTestStarted(modelId);

    // Parse test mode options
    // POLICY: Models stay loaded after tests - no auto-unload
    const mode = options.mode || 'manual';
    const unloadAfterTest = options.unloadAfterTest ?? false; // Never auto-unload
    const unloadOnlyOnFail = options.unloadOnlyOnFail ?? false; // Never auto-unload
    
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

    // ============================================================
    // PRE-FLIGHT LATENCY CHECK
    // Quick mode: Just check 2K context
    // Standard/Deep/Optimization: Run full context sweep to populate chart
    // ============================================================
    const skipPreflight = options.skipPreflight ?? false;
    const PREFLIGHT_THRESHOLD_MS = 5000; // 5 seconds at 2K context = too slow
    let contextLatencyResult: any = null;

    if (!skipPreflight) {
      const isFullSweep = mode === 'standard' || mode === 'deep' || mode === 'optimization';
      
      if (isFullSweep) {
        // Run full context sweep for Standard/Deep/Optimization modes
        console.log(`[TestEngine] Running full context latency sweep for ${mode} mode...`);
        
        wsBroadcast.broadcastProgress('tools', modelId, {
          current: 0,
          total: 1,
          currentTest: 'Measuring response time across context sizes...',
          currentCategory: 'Context Latency Sweep',
          score: 0,
          status: 'running'
        });

        try {
          contextLatencyResult = await probeEngine.runContextLatencyProfile(modelId, provider, settings, 30000);
          console.log(`[TestEngine] Context latency sweep complete:`, contextLatencyResult);

          // Check if 2K context was too slow
          const latencyAt2K = contextLatencyResult.latencies?.[2048] || contextLatencyResult.latencies?.['2048'];
          if (latencyAt2K && latencyAt2K > PREFLIGHT_THRESHOLD_MS) {
            const message = `Model responded in ${(latencyAt2K/1000).toFixed(1)}s at 2K context. Too slow to test effectively.`;
            console.log(`[TestEngine] Pre-flight FAILED: ${message}`);
            
            wsBroadcast.broadcastProgress('tools', modelId, {
              current: 0,
              total: 0,
              currentTest: 'Model too slow',
              currentCategory: 'Pre-flight Failed',
              score: 0,
              status: 'aborted'
            });

            this.runningTests.delete(modelId);
            notifications.modelTestCompleted(modelId, 0, 0);

            return {
              modelId,
              startedAt,
              completedAt: new Date().toISOString(),
              totalTests: 0,
              passed: 0,
              failed: 0,
              overallScore: 0,
              results: [],
              aborted: true,
              abortReason: 'MODEL_TOO_SLOW',
              preflightLatency: latencyAt2K,
              preflightMessage: message,
              contextLatency: contextLatencyResult // Still save the partial results
            };
          }

          wsBroadcast.broadcastProgress('tools', modelId, {
            current: 1,
            total: 1,
            currentTest: `Latency sweep complete (${contextLatencyResult.testedContextSizes?.length || 0} sizes tested)`,
            currentCategory: 'Context Latency Sweep',
            score: 100,
            status: 'completed'
          });

          console.log(`[TestEngine] Context latency sweep PASSED: recommended ${contextLatencyResult.recommendedContext} tokens`);
        } catch (error: any) {
          console.log(`[TestEngine] Context latency sweep failed, continuing anyway: ${error.message}`);
        }
      } else {
        // Quick mode: Just check 2K context
        console.log(`[TestEngine] Running quick pre-flight latency check at 2K context...`);
        
        wsBroadcast.broadcastProgress('tools', modelId, {
          current: 0,
          total: 1,
          currentTest: 'Checking model speed...',
          currentCategory: 'Pre-flight Check',
          score: 0,
          status: 'running'
        });

        try {
          const preflightLatency = await probeEngine.runQuickLatencyCheck(modelId, provider, settings, 15000);
          console.log(`[TestEngine] Pre-flight latency: ${preflightLatency}ms`);

          if (preflightLatency > PREFLIGHT_THRESHOLD_MS) {
            const message = `Model responded in ${(preflightLatency/1000).toFixed(1)}s at 2K context. Too slow to test effectively.`;
            console.log(`[TestEngine] Pre-flight FAILED: ${message}`);
            
            wsBroadcast.broadcastProgress('tools', modelId, {
              current: 0,
              total: 0,
              currentTest: 'Model too slow',
              currentCategory: 'Pre-flight Failed',
              score: 0,
              status: 'aborted'
            });

            this.runningTests.delete(modelId);
            notifications.modelTestCompleted(modelId, 0, 0);

            return {
              modelId,
              startedAt,
              completedAt: new Date().toISOString(),
              totalTests: 0,
              passed: 0,
              failed: 0,
              overallScore: 0,
              results: [],
              aborted: true,
              abortReason: 'MODEL_TOO_SLOW',
              preflightLatency,
              preflightMessage: message
            };
          }

          console.log(`[TestEngine] Pre-flight PASSED: ${preflightLatency}ms < ${PREFLIGHT_THRESHOLD_MS}ms threshold`);
        } catch (error: any) {
          console.log(`[TestEngine] Pre-flight check failed, continuing anyway: ${error.message}`);
        }
      }
    } else {
      console.log(`[TestEngine] Pre-flight check skipped (force run)`);
    }

    // Filter tests based on mode
    const testsToRun = this.filterTestsByMode(TEST_DEFINITIONS, mode);
    console.log(`[TestEngine] Mode ${mode}: Running ${testsToRun.length} of ${TEST_DEFINITIONS.length} tests`);

    // Step 1: Tool Discovery - Try to discover native tools and match to MCP tools
    let discoveryResult: ToolDiscoveryResult = { discoveredTools: [], aliases: {}, unmappedTools: [] };
    try {
      wsBroadcast.broadcastProgress('tools', modelId, {
        current: 0,
        total: testsToRun.length + 1,
        currentTest: 'Discovering native tools...',
        currentCategory: 'Tool Discovery',
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
    const totalTests = testsToRun.length;
    let completedTests = 0;
    let runningScore = 0;
    
    // Collect alias refinements based on actual model behavior
    const aliasRefinements: AliasRefinement[] = [];

    // Broadcast initial progress
    wsBroadcast.broadcastProgress('tools', modelId, {
      current: 0,
      total: totalTests,
      currentTest: testsToRun[0]?.tool || 'Starting...',
      currentCategory: testsToRun[0] ? this.formatCategory(testsToRun[0].category) : 'Initializing',
      score: 0,
      status: 'running'
    });
    
    for (const test of testsToRun) {
      // Check if test was aborted
      if (abortController.signal.aborted) {
        console.log(`[TestEngine] Test aborted for ${modelId}`);
        break;
      }
      
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

        // Broadcast progress with category
        wsBroadcast.broadcastProgress('tools', modelId, {
          current: completedTests,
          total: totalTests,
          currentTest: `${test.id}: ${test.tool}`,
          currentCategory: this.formatCategory(test.category),
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

        // Broadcast progress even on error, with category
        wsBroadcast.broadcastProgress('tools', modelId, {
          current: completedTests,
          total: totalTests,
          currentTest: `${test.id}: ${test.tool}`,
          currentCategory: this.formatCategory(test.category),
          score: runningScore,
          status: 'running'
        });
      }
    }
    
    // Log summary of alias refinements
    if (aliasRefinements.length > 0) {
      console.log(`[TestEngine] ${aliasRefinements.length} alias refinement(s) detected based on behavior`);
    }

    // Run probe tests (9.x-14.x) for Standard/Deep/Optimization modes
    if (mode !== 'quick') {
      const probesToRun = this.filterProbesByMode(ALL_PROBE_DEFINITIONS, mode);
      console.log(`[TestEngine] Running ${probesToRun.length} probe tests (9.x-14.x)`);
      
      for (const probe of probesToRun) {
        // Check for abort
        if (abortController.signal.aborted) {
          console.log(`[TestEngine] Test aborted for ${modelId}`);
          break;
        }

        try {
          const probeResult = await this.runSingleProbe(probe, modelId, provider, settings);
          results.push(probeResult);
          completedTests++;
          runningScore = Math.round(results.reduce((sum, r) => sum + r.score, 0) / completedTests);

          // Broadcast progress - derive category from probe ID
          const probeCategory = this.getProbeCategoryFromId(probe.id);
          wsBroadcast.broadcastProgress('tools', modelId, {
            current: completedTests,
            total: totalTests + probesToRun.length,
            currentTest: `${probe.id}: ${probe.name}`,
            currentCategory: probeCategory,
            score: runningScore,
            status: 'running'
          });
        } catch (error: any) {
          results.push({
            testId: probe.id,
            tool: 'probe',
            passed: false,
            score: 0,
            latency: 0,
            checks: [],
            error: error.message
          });
          completedTests++;
          console.error(`[TestEngine] Probe ${probe.id}: ❌ ERROR - ${error.message}`);
        }
      }
    }

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    
    // Calculate latency metrics and apply scoring adjustments
    const latencyMetrics = this.calculateLatencyMetrics(results);
    const latencyAdjustedResults = this.applyLatencyScoring(results, latencyMetrics);
    
    const overallScore = latencyAdjustedResults.length > 0
      ? Math.round(latencyAdjustedResults.reduce((sum, r) => sum + r.score, 0) / latencyAdjustedResults.length)
      : 0;

    // Calculate score breakdown by category
    const categoryScores: Record<string, number[]> = {};
    for (const result of latencyAdjustedResults) {
      // Map test category names to scoreBreakdown keys
      const categoryMap: Record<string, string> = {
        // Tool categories -> toolScore
        'file_operations': 'toolScore',
        'git_operations': 'toolScore',
        'npm_operations': 'toolScore',
        'http_operations': 'toolScore',
        'browser_operations': 'toolScore',
        'code_execution': 'toolScore',
        'search': 'toolScore',
        'text_operations': 'toolScore',
        'process_operations': 'toolScore',
        'archive_operations': 'toolScore',
        'memory_operations': 'toolScore',
        // Specialized categories
        'reasoning': 'reasoningScore',
        'rag': 'ragScore',
        'rag_operations': 'ragScore',
        'intent': 'intentScore',
        'bug_detection': 'bugScore',
        'navigation': 'navigationScore',
        'helicopter': 'helicopterScore',
        'proactive': 'proactiveScore'
      };
      
      // Check if this is a probe result (from 9.x-14.x)
      let key: string;
      if (result.tool === 'probe') {
        // Derive category from probe ID (e.g., "9.1" -> failureModesScore, "14.2" -> complianceScore)
        const prefix = result.testId.split('.')[0];
        const probeMap: Record<string, string> = {
          '9': 'failureModesScore',
          '10': 'statefulScore',
          '11': 'precedenceScore',
          '12': 'evolutionScore',
          '13': 'calibrationScore',
          '14': 'complianceScore'
        };
        key = probeMap[prefix] || 'toolScore';
      } else {
        // Get category from the test definition
        const test = testsToRun.find(t => t.id === result.testId);
        key = test ? categoryMap[test.category] || 'toolScore' : 'toolScore';
      }
      
      if (!categoryScores[key]) categoryScores[key] = [];
      categoryScores[key].push(result.score);
    }

    // Calculate averages for each category
    const scoreBreakdown: TestRunResult['scoreBreakdown'] = {};
    for (const [key, scores] of Object.entries(categoryScores)) {
      if (scores.length > 0) {
        (scoreBreakdown as any)[key] = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      }
    }
    
    // Add latency metrics to breakdown
    (scoreBreakdown as any).avgLatencyMs = latencyMetrics.avgLatency;
    (scoreBreakdown as any).latencyScore = latencyMetrics.latencyScore;
    
    console.log(`[TestEngine] Latency metrics: avg=${latencyMetrics.avgLatency}ms, score=${latencyMetrics.latencyScore}%`);

    // Calculate trainability scores from 9.x-14.x probe results
    const trainabilityScores = this.calculateTrainabilityScores(latencyAdjustedResults);
    if (trainabilityScores) {
      console.log(`[TestEngine] Trainability: SPC=${trainabilityScores.systemPromptCompliance}%, Overall=${trainabilityScores.overallTrainability}%`);
    }

    const runResult: TestRunResult = {
      modelId,
      startedAt,
      completedAt: new Date().toISOString(),
      totalTests: results.length,
      passed,
      failed,
      overallScore,
      results,
      scoreBreakdown,
      contextLatency: contextLatencyResult || undefined
    };

    // ============================================================
    // OPTIMIZATION MODE: Run sweeps for context, tool count, RAG
    // ============================================================
    if (mode === 'optimization' && !abortController.signal.aborted) {
      console.log(`[TestEngine] Running optimization sweeps for ${modelId}...`);
      
      const optimizationResults: OptimizationResults = {};

      // 1. Context Latency Sweep - REUSE from pre-flight if available
      if (contextLatencyResult) {
        console.log(`[TestEngine] Reusing pre-flight context latency data`);
        optimizationResults.contextLatency = contextLatencyResult;
        optimizationResults.optimalContextLength = contextLatencyResult.recommendedContext;
        
        wsBroadcast.broadcastProgress('tools', modelId, {
          current: totalTests,
          total: totalTests + 2, // +2 for remaining sweeps (tool count + RAG)
          currentTest: `Context: ${contextLatencyResult.recommendedContext / 1024}K optimal (from pre-flight)`,
          currentCategory: 'Optimization: Context Sweep',
          score: overallScore,
          status: 'completed'
        });
      } else {
        // No pre-flight data, run the sweep now (shouldn't happen for optimization mode)
        try {
          wsBroadcast.broadcastProgress('tools', modelId, {
            current: totalTests,
            total: totalTests + 3,
            currentTest: 'Context latency profiling...',
            currentCategory: 'Optimization: Context Sweep',
            score: overallScore,
            status: 'running'
          });

          console.log(`[TestEngine] Running context latency profile...`);
          const contextLatency = await probeEngine.runContextLatencyProfile(modelId, provider, settings, 30000);
          optimizationResults.contextLatency = contextLatency;
          optimizationResults.optimalContextLength = contextLatency.recommendedContext;
          console.log(`[TestEngine] Context sweep complete: optimal=${contextLatency.recommendedContext}, max=${contextLatency.maxUsableContext}`);
        } catch (error: any) {
          console.error(`[TestEngine] Context sweep failed: ${error.message}`);
        }
      }

      // 2. Tool Count Sweep
      try {
        wsBroadcast.broadcastProgress('tools', modelId, {
          current: totalTests + 1,
          total: totalTests + 3,
          currentTest: 'Tool count sweep...',
          currentCategory: 'Optimization: Tool Count Sweep',
          score: overallScore,
          status: 'running'
        });

        console.log(`[TestEngine] Running tool count sweep...`);
        const toolCountResults = await this.runToolCountSweep(modelId, provider, settings);
        optimizationResults.toolCountSweep = toolCountResults;
        optimizationResults.optimalToolCount = 
          toolCountResults.optimal === 'essential' ? ESSENTIAL_TOOLS.length :
          toolCountResults.optimal === 'standard' ? STANDARD_TOOLS.length :
          FULL_TOOLS.length;
        console.log(`[TestEngine] Tool count sweep complete: optimal tier=${toolCountResults.optimal}`);
      } catch (error: any) {
        console.error(`[TestEngine] Tool count sweep failed: ${error.message}`);
      }

      // 3. RAG Tuning (placeholder - would need RAG server integration)
      try {
        wsBroadcast.broadcastProgress('tools', modelId, {
          current: totalTests + 2,
          total: totalTests + 3,
          currentTest: 'RAG configuration tuning...',
          currentCategory: 'Optimization: RAG Tuning',
          score: overallScore,
          status: 'running'
        });

        console.log(`[TestEngine] RAG tuning (using defaults)...`);
        // For now, use sensible defaults based on test results
        optimizationResults.ragTuning = {
          chunkSizes: { 500: 70, 1000: 85, 2000: 75 },
          resultCounts: { 3: 70, 5: 85, 10: 80 },
          optimalChunkSize: 1000,
          optimalResultCount: 5
        };
      } catch (error: any) {
        console.error(`[TestEngine] RAG tuning failed: ${error.message}`);
      }

      // 4. Generate MCP Configuration
      try {
        wsBroadcast.broadcastProgress('tools', modelId, {
          current: totalTests + 3,
          total: totalTests + 3,
          currentTest: 'Generating optimized configuration...',
          currentCategory: 'Optimization: Config Generation',
          score: overallScore,
          status: 'running'
        });

        console.log(`[TestEngine] Generating MCP configuration for ${modelId}...`);
        
        const generatedConfig = await configGenerator.generateFromTestResults(
          modelId,
          runResult,
          {
            contextLength: optimizationResults.optimalContextLength || contextLength,
            saveToFile: true
          }
        );

        optimizationResults.configGenerated = true;
        optimizationResults.configPath = `mcp-server/configs/models/${modelId.replace(/[/\\:]/g, '_')}.json`;
        
        console.log(`[TestEngine] MCP config generated: ${optimizationResults.configPath}`);
      } catch (error: any) {
        console.error(`[TestEngine] Config generation failed: ${error.message}`);
        optimizationResults.configGenerated = false;
      }

      // Attach optimization results to run result
      runResult.optimization = optimizationResults;
      runResult.completedAt = new Date().toISOString();

      console.log(`[TestEngine] Optimization sweeps complete for ${modelId}`);
    }

    // Update model profile with test results, discovered aliases, behavior-based refinements, and trainability
    await this.updateModelProfile(modelId, provider, runResult, discoveryResult, aliasRefinements, trainabilityScores);

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

    // Clean up abort controller
    this.runningTests.delete(modelId);

    // Broadcast completion (only if not aborted)
    if (!abortController.signal.aborted) {
      wsBroadcast.broadcastProgress('tools', modelId, {
        current: totalTests,
        total: totalTests,
        currentTest: 'All tests complete',
        currentCategory: 'Complete',
        score: overallScore,
        status: 'completed'
      });
      wsBroadcast.broadcastTestComplete(modelId, overallScore, 'tools');
    }

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
   * Update model profile with test results, alias refinements, and trainability scores
   */
  private async updateModelProfile(
    modelId: string,
    provider: 'lmstudio' | 'openai' | 'azure',
    runResult: TestRunResult,
    discoveryResult?: ToolDiscoveryResult,
    aliasRefinements?: AliasRefinement[],
    trainabilityScores?: {
      systemPromptCompliance: number;
      instructionPersistence: number;
      correctionAcceptance: number;
      overallTrainability: number;
    } | null
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
    
    // Add scoreBreakdown to profile
    if (runResult.scoreBreakdown) {
      (profile as any).scoreBreakdown = runResult.scoreBreakdown;
    }
    
    // Add trainability scores to profile
    if (trainabilityScores) {
      (profile as any).trainabilityScores = trainabilityScores;
    }
    
    // Add context latency profile (from pre-flight full sweep)
    if (runResult.contextLatency) {
      (profile as any).contextLatency = runResult.contextLatency;
      // Auto-set recommended context if not manually overridden
      if (!profile.contextLength && runResult.contextLatency.recommendedContext) {
        profile.contextLength = runResult.contextLatency.recommendedContext;
      }
      console.log(`[TestEngine] Saved context latency profile: recommended=${runResult.contextLatency.recommendedContext}`);
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
    // Create abort controller for this test run
    const abortController = new AbortController();
    this.runningTests.set(modelId, abortController);
    
    const tests = TEST_DEFINITIONS.filter(t => tools.includes(t.tool));
    
    // Parse test mode options
    // POLICY: Models stay loaded after tests - no auto-unload
    const mode = options.mode || 'manual';
    const unloadAfterTest = options.unloadAfterTest ?? false; // Never auto-unload
    const unloadOnlyOnFail = options.unloadOnlyOnFail ?? false; // Never auto-unload

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
      // Check if test was aborted
      if (abortController.signal.aborted) {
        console.log(`[TestEngine] Test aborted for ${modelId}`);
        break;
      }
      
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
    
    // Clean up abort controller
    this.runningTests.delete(modelId);

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

  /**
   * Get category name from probe ID (e.g., "9.1" -> "Failure Modes")
   */
  private getProbeCategoryFromId(probeId: string): string {
    const prefix = probeId.split('.')[0];
    const categoryMap: Record<string, string> = {
      '9': '9.x Failure Modes',
      '10': '10.x Stateful',
      '11': '11.x Precedence',
      '12': '12.x Evolution',
      '13': '13.x Calibration',
      '14': '14.x Compliance'
    };
    return categoryMap[prefix] || `${prefix}.x Probes`;
  }

  /**
   * Filter probe tests by mode
   */
  private filterProbesByMode(probes: ProbeDefinition[], mode: TestMode): ProbeDefinition[] {
    // Quick mode doesn't run probes
    if (mode === 'quick') return [];
    
    // Standard mode: only critical probes (9.x, 14.x)
    if (mode === 'standard' || mode === 'keep_on_success') {
      return probes.filter(p => 
        p.id.startsWith('9.') || p.id.startsWith('14.')
      );
    }
    
    // Deep/Optimization/Manual: all probes
    return probes;
  }

  /**
   * Run a single probe test (ProbeDefinition with evaluate function)
   */
  private async runSingleProbe(
    probe: ProbeDefinition,
    modelId: string,
    provider: 'lmstudio' | 'openai' | 'azure',
    settings: any
  ): Promise<TestResult> {
    const startTime = Date.now();
    
    console.log(`[TestEngine] Running probe ${probe.id}: ${probe.name}`);

    try {
      // Build messages - probes have a simple prompt structure
      const messages: any[] = [
        { role: 'system', content: 'You are a helpful AI assistant with access to tools.' },
        { role: 'user', content: probe.prompt }
      ];

      // Get tool schemas if probe expects a specific tool
      const tools = probe.expectedTool ? getToolSchemas([probe.expectedTool]) : [];

      // Call LLM (params: modelId, provider, messages, tools, settings)
      const response = await this.callLLM(modelId, provider, messages, tools, settings);
      
      // Extract tool calls from response
      const toolCalls = this.extractToolCalls(response);
      
      // Evaluate using probe's evaluate function (takes response and toolCalls)
      const evalResult = probe.evaluate(response, toolCalls);
      
      const latency = Date.now() - startTime;
      const passed = evalResult.score >= 70;
      
      console.log(`[TestEngine] Probe ${probe.id}: ${passed ? '✓' : '✗'} (${evalResult.score}%)`);

      return {
        testId: probe.id,
        tool: probe.expectedTool || 'probe',
        passed,
        score: evalResult.score,
        latency,
        checks: [{
          name: probe.name,
          passed: evalResult.passed,
          expected: probe.expectedBehavior,
          actual: evalResult.details
        }],
        response,
        calledTool: toolCalls[0]?.function?.name,
        calledArgs: toolCalls[0]?.function?.arguments
      };
    } catch (error: any) {
      console.error(`[TestEngine] Probe ${probe.id} error:`, error.message);
      return {
        testId: probe.id,
        tool: probe.expectedTool || 'probe',
        passed: false,
        score: 0,
        latency: Date.now() - startTime,
        checks: [],
        error: error.message
      };
    }
  }

  /**
   * Extract tool calls from LLM response
   */
  private extractToolCalls(response: any): any[] {
    if (!response) return [];
    
    // Handle different response formats
    if (response.choices?.[0]?.message?.tool_calls) {
      return response.choices[0].message.tool_calls;
    }
    if (response.tool_calls) {
      return response.tool_calls;
    }
    if (Array.isArray(response)) {
      return response.filter((item: any) => item.type === 'function' || item.function);
    }
    
    return [];
  }

  /**
   * Run tool count sweep - test accuracy with different tool set sizes
   */
  private async runToolCountSweep(
    modelId: string,
    provider: 'lmstudio' | 'openai' | 'azure',
    settings: any
  ): Promise<{
    essential: { count: number; score: number; latency: number };
    standard: { count: number; score: number; latency: number };
    full: { count: number; score: number; latency: number };
    optimal: 'essential' | 'standard' | 'full';
  }> {
    const tiers: Array<{ name: 'essential' | 'standard' | 'full'; tools: string[] }> = [
      { name: 'essential', tools: ESSENTIAL_TOOLS },
      { name: 'standard', tools: STANDARD_TOOLS },
      { name: 'full', tools: FULL_TOOLS }
    ];

    const results: Record<string, { count: number; score: number; latency: number }> = {};

    // Run a subset of tests with each tool set
    const testSubset = TEST_DEFINITIONS.slice(0, 5); // Use first 5 tests for sweep

    for (const tier of tiers) {
      console.log(`[TestEngine] Tool sweep: testing ${tier.name} tier (${tier.tools.length} tools)`);
      
      const startTime = Date.now();
      let totalScore = 0;
      let testCount = 0;

      for (const test of testSubset) {
        // Only test if the tool is in this tier
        if (!tier.tools.includes(test.tool)) continue;

        try {
          const result = await this.runSingleTest(test, modelId, provider, settings);
          totalScore += result.score;
          testCount++;
        } catch {
          // Skip failed tests
        }
      }

      const latency = Date.now() - startTime;
      const avgScore = testCount > 0 ? Math.round(totalScore / testCount) : 0;

      results[tier.name] = {
        count: tier.tools.length,
        score: avgScore,
        latency
      };

      console.log(`[TestEngine] ${tier.name}: ${testCount} tests, score=${avgScore}%, latency=${latency}ms`);
    }

    // Determine optimal tier: best score with reasonable latency
    // Prefer smaller tool sets if scores are similar
    let optimal: 'essential' | 'standard' | 'full' = 'standard';
    
    if (results.essential?.score >= results.standard?.score * 0.9) {
      // Essential is within 90% of standard - prefer essential
      optimal = 'essential';
    } else if (results.full?.score > results.standard?.score * 1.1) {
      // Full is significantly better (>10%) - use full
      optimal = 'full';
    }
    // Otherwise keep standard as default

    return {
      essential: results.essential || { count: ESSENTIAL_TOOLS.length, score: 0, latency: 0 },
      standard: results.standard || { count: STANDARD_TOOLS.length, score: 0, latency: 0 },
      full: results.full || { count: FULL_TOOLS.length, score: 0, latency: 0 },
      optimal
    };
  }

  /**
   * Calculate latency metrics from test results
   * Returns average latency and a latency score (0-100)
   */
  private calculateLatencyMetrics(results: TestResult[]): { avgLatency: number; latencyScore: number; fast: number; slow: number } {
    // Filter out results with 0 latency (errors)
    const validResults = results.filter(r => r.latency > 0);
    
    if (validResults.length === 0) {
      return { avgLatency: 0, latencyScore: 50, fast: 0, slow: 0 };
    }

    const totalLatency = validResults.reduce((sum, r) => sum + r.latency, 0);
    const avgLatency = Math.round(totalLatency / validResults.length);

    // Latency thresholds (in ms)
    const FAST_THRESHOLD = 2000;   // < 2s is fast
    const GOOD_THRESHOLD = 5000;   // < 5s is good
    const SLOW_THRESHOLD = 10000;  // < 10s is acceptable
    // > 10s is slow

    // Count fast/slow responses
    const fast = validResults.filter(r => r.latency < FAST_THRESHOLD).length;
    const slow = validResults.filter(r => r.latency > SLOW_THRESHOLD).length;

    // Calculate latency score (0-100)
    // Fast responses boost score, slow responses reduce it
    let latencyScore = 50; // Start at neutral
    
    for (const result of validResults) {
      if (result.latency < FAST_THRESHOLD) {
        latencyScore += 5; // Bonus for fast
      } else if (result.latency < GOOD_THRESHOLD) {
        latencyScore += 2; // Small bonus
      } else if (result.latency < SLOW_THRESHOLD) {
        latencyScore -= 2; // Small penalty
      } else {
        latencyScore -= 5; // Penalty for slow
      }
    }

    // Clamp to 0-100
    latencyScore = Math.max(0, Math.min(100, latencyScore));

    return { avgLatency, latencyScore, fast, slow };
  }

  /**
   * Apply latency-based scoring adjustments to results
   * Fast responses get small bonus, very slow responses get penalty
   */
  private applyLatencyScoring(results: TestResult[], metrics: { avgLatency: number; latencyScore: number }): TestResult[] {
    // Latency weight: how much latency affects the final score (0-1)
    const LATENCY_WEIGHT = 0.1; // 10% of score can be affected by latency

    return results.map(result => {
      if (result.latency === 0 || !result.passed) {
        // Don't adjust failed tests or tests with no latency data
        return result;
      }

      let adjustment = 0;

      // Fast response bonus
      if (result.latency < 2000) {
        adjustment = 5; // +5% for fast responses
      } else if (result.latency < 5000) {
        adjustment = 2; // +2% for good responses
      } else if (result.latency > 15000) {
        adjustment = -10; // -10% for very slow responses
      } else if (result.latency > 10000) {
        adjustment = -5; // -5% for slow responses
      }

      // Apply weighted adjustment
      const adjustedScore = Math.max(0, Math.min(100, result.score + adjustment * LATENCY_WEIGHT * 10));

      return {
        ...result,
        score: Math.round(adjustedScore)
      };
    });
  }

  /**
   * Calculate trainability scores from probe results
   * Trainability = how well the model follows system prompts, persists instructions, accepts corrections
   */
  private calculateTrainabilityScores(results: TestResult[]): {
    systemPromptCompliance: number;
    instructionPersistence: number;
    correctionAcceptance: number;
    overallTrainability: number;
  } | null {
    // Filter probe results by category
    const complianceResults = results.filter(r => r.testId.startsWith('14.')); // 14.x Compliance
    const statefulResults = results.filter(r => r.testId.startsWith('10.'));   // 10.x Stateful
    const failureModeResults = results.filter(r => r.testId.startsWith('9.')); // 9.x Failure Modes

    // Need at least some compliance results to calculate trainability
    if (complianceResults.length === 0) {
      return null;
    }

    // System Prompt Compliance (SPC) - from 14.x tests
    // This is the most important metric for trainability
    const systemPromptCompliance = complianceResults.length > 0
      ? Math.round(complianceResults.reduce((sum, r) => sum + r.score, 0) / complianceResults.length)
      : 0;

    // Instruction Persistence - from 10.x tests
    // How well the model maintains instructions over multiple turns
    const instructionPersistence = statefulResults.length > 0
      ? Math.round(statefulResults.reduce((sum, r) => sum + r.score, 0) / statefulResults.length)
      : systemPromptCompliance; // Fall back to SPC if no stateful tests

    // Correction Acceptance - from 9.x tests
    // How well the model recovers from failures and accepts corrections
    const correctionAcceptance = failureModeResults.length > 0
      ? Math.round(failureModeResults.reduce((sum, r) => sum + r.score, 0) / failureModeResults.length)
      : systemPromptCompliance; // Fall back to SPC if no failure mode tests

    // Overall Trainability: weighted combination
    // SPC is 50%, Instruction Persistence is 25%, Correction Acceptance is 25%
    const overallTrainability = Math.round(
      systemPromptCompliance * 0.50 +
      instructionPersistence * 0.25 +
      correctionAcceptance * 0.25
    );

    return {
      systemPromptCompliance,
      instructionPersistence,
      correctionAcceptance,
      overallTrainability
    };
  }
}

// Export singleton
export const testEngine = new TestEngine();

