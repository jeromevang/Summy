export const ALL_TOOLS = [
  'rag_query', 'rag_status', 'rag_index',
  'read_file', 'read_multiple_files', 'write_file', 'edit_file', 'delete_file', 'copy_file',
  'move_file', 'get_file_info', 'list_directory', 'search_files', 'create_directory',
  'delete_directory', 'list_allowed_directories',
  'git_status', 'git_diff', 'git_log', 'git_init', 'git_add', 'git_commit', 'git_push', 'git_pull',
  'git_checkout', 'git_stash', 'git_stash_pop', 'git_reset', 'git_clone', 'git_branch_create',
  'git_branch_list', 'git_blame', 'git_show',
  'npm_run', 'npm_install', 'npm_uninstall', 'npm_init', 'npm_test', 'npm_build', 'npm_list',
  'http_request', 'url_fetch_content', 'web_search',
  'browser_navigate', 'browser_go_back', 'browser_go_forward', 'browser_click', 'browser_type',
  'browser_hover', 'browser_select_option', 'browser_press_key', 'browser_snapshot',
  'browser_fetch_content', 'browser_take_screenshot', 'browser_wait', 'browser_resize',
  'browser_handle_dialog', 'browser_drag', 'browser_tabs', 'browser_evaluate',
  'browser_console_messages', 'browser_network_requests',
  'shell_exec', 'run_python', 'run_node', 'run_typescript',
  'memory_store', 'memory_retrieve', 'memory_list', 'memory_delete',
  'text_summarize', 'diff_files',
  'process_list', 'process_kill',
  'zip_create', 'zip_extract',
  'mcp_rules', 'env_get', 'env_set', 'json_parse', 'base64_encode', 'base64_decode'
];

export const REMOVED_TOOLS = [
  'file_read', 'file_write', 'file_patch', 'file_delete', 'file_copy', 'file_move',
  'file_info', 'file_list', 'file_search', 'folder_create', 'folder_delete',
  'create_new_file', 'git_merge', 'git_rm'
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
  read_file: 'low', read_multiple_files: 'low', list_directory: 'low', search_files: 'low', get_file_info: 'low',
  list_allowed_directories: 'low', git_status: 'low', git_diff: 'low', git_log: 'low', git_branch_list: 'low',
  git_blame: 'low', git_show: 'low', http_request: 'low', web_search: 'low', mcp_rules: 'low',
  memory_retrieve: 'low', memory_list: 'low', text_summarize: 'low', diff_files: 'low', env_get: 'low',
  json_parse: 'low', base64_encode: 'low', base64_decode: 'low', process_list: 'low', browser_snapshot: 'low',
  browser_console_messages: 'low', browser_network_requests: 'low',
  write_file: 'medium', edit_file: 'medium', copy_file: 'medium', move_file: 'medium', create_directory: 'medium',
  git_commit: 'medium', git_add: 'medium', git_branch_create: 'medium', git_stash: 'medium', git_stash_pop: 'medium',
  memory_store: 'medium', memory_delete: 'medium', env_set: 'medium', browser_navigate: 'medium',
  browser_click: 'medium', browser_type: 'medium', browser_tabs: 'medium', zip_create: 'medium', zip_extract: 'medium',
  delete_file: 'high', delete_directory: 'high', git_reset: 'high', git_push: 'high', git_pull: 'high',
  git_checkout: 'high', git_clone: 'high', npm_run: 'high', npm_install: 'high', npm_uninstall: 'high',
  npm_init: 'high', npm_test: 'high', npm_build: 'high', shell_exec: 'high', run_python: 'high',
  run_node: 'high', run_typescript: 'high', process_kill: 'high', browser_evaluate: 'high'
};
