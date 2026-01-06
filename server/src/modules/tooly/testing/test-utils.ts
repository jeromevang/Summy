import { TOOL_SCHEMAS } from '../tool-prompts.js';

export const TOOL_SYNONYMS: Record<string, string[]> = {
    'rag_query': ['semantic_search', 'code_search', 'search_code', 'find_code', 'codebase_search', 'semantic_query', 'rag', 'vector_search', 'ai_search'],
    'rag_status': ['rag_info', 'index_status', 'search_status', 'vector_status'],
    'rag_index': ['index_code', 'index_codebase', 'build_index', 'create_index', 'reindex'],
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
    'npm_run': ['run_npm', 'npm', 'run_script', 'execute_npm'],
    'npm_install': ['install', 'npm_add', 'add_package'],
    'npm_uninstall': ['uninstall', 'npm_remove', 'remove_package'],
    'npm_init': ['init', 'initialize', 'create_package'],
    'npm_test': ['test', 'run_tests', 'unit_test'],
    'npm_build': ['build', 'compile', 'bundle'],
    'npm_list': ['list_packages', 'show_deps', 'dependencies'],
    'http_request': ['fetch', 'get_url', 'fetch_url', 'fetch_url_content', 'web_request', 'curl', 'request', 'http', 'get', 'post', 'api_call', 'fetch_content'],
    'web_search': ['search', 'google', 'lookup', 'find_online', 'internet_search'],
    'browser_navigate': ['browse', 'open_url', 'visit_page', 'web_browse', 'search_web', 'open_browser', 'navigate', 'browser', 'web'],
    'browser_click': ['click', 'click_element', 'press'],
    'browser_type': ['type', 'input', 'enter_text', 'fill'],
    'browser_snapshot': ['snapshot', 'accessibility', 'page_tree'],
    'browser_take_screenshot': ['screenshot', 'capture', 'screen_grab'],
    'shell_exec': ['shell', 'bash', 'terminal', 'command', 'exec'],
    'run_python': ['execute_python', 'python', 'exec_code', 'execute_code', 'run_code', 'python_exec', 'code', 'execute'],
    'run_node': ['node', 'javascript', 'js', 'run_js'],
    'run_typescript': ['typescript', 'ts', 'run_ts'],
    'memory_store': ['store', 'save_memory', 'remember', 'cache', 'set'],
    'memory_retrieve': ['retrieve', 'get_memory', 'recall', 'load'],
    'memory_list': ['list_memory', 'show_memory', 'keys'],
    'memory_delete': ['forget', 'clear_memory', 'remove_memory'],
    'text_summarize': ['summarize', 'summary', 'tldr', 'condense'],
    'diff_files': ['compare', 'file_diff', 'compare_files'],
    'process_list': ['ps', 'list_processes', 'running', 'tasks'],
    'process_kill': ['kill', 'terminate', 'stop_process', 'end_task'],
    'zip_create': ['zip', 'compress', 'archive', 'pack'],
    'zip_extract': ['unzip', 'extract', 'decompress', 'unpack'],
    'mcp_rules': ['rules', 'get_rules', 'project_rules'],
    'env_get': ['getenv', 'get_environment', 'environment'],
    'env_set': ['setenv', 'set_environment'],
    'json_parse': ['parse_json', 'json', 'decode_json'],
    'base64_encode': ['encode', 'to_base64', 'b64_encode'],
    'base64_decode': ['decode', 'from_base64', 'b64_decode']
};

/**
 * Identify the provider for a model ID
 */
export async function getModelProvider(modelId: string, capabilities: any): Promise<string> {
  try {
    const profile = await capabilities.getProfile(modelId);
    if (profile?.provider && profile.provider !== 'unknown') {
      return profile.provider;
    }
  } catch {}

  const openRouterPrefixes = ['allenai/', 'mistral/', 'nvidia/', 'xiaomi/', 'meta/', 'google/', 'anthropic/', 'microsoft/', 'cohere/', 'together/', 'deepseek/', 'tng/', 'arcee/', 'nex/', 'zephyr/', 'moonshot/', 'venice/', 'nous/', 'phind/', 'perplexity/'];
  
  if (openRouterPrefixes.some(prefix => modelId.startsWith(prefix))) {
    if (modelId.startsWith('qwen/') && modelId.includes('coder')) return 'lmstudio';
    return 'openrouter';
  }
  return 'lmstudio';
}

/**
 * Get basic tool schemas for testing
 */
export function getBasicTools(): any[] {
  return [
    {
      type: 'function',
      function: {
        name: 'read_file',
        description: 'Read the contents of a file',
        parameters: {
          type: 'object',
          properties: {
            filepath: { type: 'string', description: 'Path to the file' },
          },
          required: ['filepath'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'rag_query',
        description: 'Search the codebase semantically',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
          },
          required: ['query'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'git_status',
        description: 'Get git status',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'shell_exec',
        description: 'Execute a shell command',
        parameters: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'Command to run' },
          },
          required: ['command'],
        },
      },
    },
  ];
}

export function extractKeywords(toolName: string): string[] {
    return toolName
        .toLowerCase()
        .replace(/[_-]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2);
}

export function calculateSimilarity(nativeTool: string, mcpTool: string): number {
    const normalizedNative = nativeTool.toLowerCase().replace(/[_-]/g, '');
    const normalizedMcp = mcpTool.toLowerCase().replace(/[_-]/g, '');
    if (normalizedNative === normalizedMcp) return 100;
    const synonyms = TOOL_SYNONYMS[mcpTool] || [];
    if (synonyms.map(s => s.toLowerCase().replace(/[_-]/g, '')).includes(normalizedNative)) return 95;
    if (normalizedNative.includes(normalizedMcp) || normalizedMcp.includes(normalizedNative)) return 80;
    const nativeKeywords = extractKeywords(nativeTool);
    const mcpKeywords = extractKeywords(mcpTool);
    const overlap = nativeKeywords.filter(k => mcpKeywords.includes(k)).length;
    const maxKeywords = Math.max(nativeKeywords.length, mcpKeywords.length);
    return maxKeywords > 0 && overlap > 0 ? Math.round((overlap / maxKeywords) * 70) : 0;
}

export function findBestMatch(nativeTool: string, mcpTools: string[]): { tool: string; confidence: number } | null {
    let best: { tool: string; confidence: number } | null = null;
    for (const mcpTool of mcpTools) {
        const score = calculateSimilarity(nativeTool, mcpTool);
        if (score > 0 && (!best || score > best.confidence)) best = { tool: mcpTool, confidence: score };
    }
    return best;
}

export function scoreArgsAgainstSchema(args: Record<string, any>, toolName: string): number {
    const schema = TOOL_SCHEMAS[toolName];
    if (!schema?.function?.parameters?.properties) return 0;
    const props = Object.keys(schema.function.parameters.properties);
    const required = schema.function.parameters.required || [];
    let score = 0, maxScore = 0;
    for (const r of required) { maxScore += 40; if (args[r] !== undefined) score += 40; }
    for (const o of props.filter(p => !required.includes(p))) { maxScore += 20; if (args[o] !== undefined) score += 20; }
    const penalty = Object.keys(args).filter(k => !props.includes(k)).length * 10;
    return Math.max(0, Math.round((maxScore > 0 ? (score / maxScore) * 100 : 0) - penalty));
}

export function findBestToolByArgs(args: Record<string, any>, mcpTools: string[]): { tool: string; score: number } | null {
    let bestMatch: { tool: string; score: number } | null = null;
    for (const tool of mcpTools) {
        const score = scoreArgsAgainstSchema(args, tool);
        if (score > 0 && (!bestMatch || score > bestMatch.score)) {
            bestMatch = { tool, score };
        }
    }
    return bestMatch;
}

export function semanticMatchTools(discoveredTools: string[], mcpTools: string[]): Record<string, string[]> {
    const aliases: Record<string, string[]> = {};
    for (const mcpTool of mcpTools) aliases[mcpTool] = [];
    for (const nativeTool of discoveredTools) {
        if (mcpTools.includes(nativeTool)) continue;
        const match = findBestMatch(nativeTool, mcpTools);
        if (match && match.confidence >= 50 && match.tool) {
            const toolName = match.tool;
            if (aliases[toolName]) {
                aliases[toolName].push(nativeTool);
            }
        }
    }
    return aliases;
}
