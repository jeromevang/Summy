export const TOOL_PROMPTS: Record<string, string> = {
  // ========== RAG - SEMANTIC CODE SEARCH (Use FIRST for code understanding) ==========
  rag_query: `### rag_query
**PREFERRED FOR CODE SEARCH** - Use this FIRST for any code search or understanding task.
Semantic AI-powered search that finds relevant code by meaning in a single call.
Use for: "find X", "where is Y handled", "how does Z work", "search for", "look for"
Much more efficient than multiple grep/search calls.
Parameters:
- query (required): Natural language query - ask like you would ask a colleague
- limit (optional): Maximum results to return (default: 5)
- fileTypes (optional): Filter by file types (e.g., ['ts', 'js', 'py'])
- paths (optional): Filter by path patterns (e.g., ['src/', 'lib/'])
Returns: Code snippets with file paths, line numbers, symbols, and relevance scores`,

  rag_status: `### rag_status
Get the status of the RAG indexing system.
Parameters: none
Returns: Project path, indexing status, file count, chunk count`,

  rag_index: `### rag_index
Start indexing a project directory for semantic search.
Parameters:
- projectPath (required): Absolute path to the project directory to index`,

  // ========== GPS - CODE NAVIGATION (Surgical Precision) ==========
  find_symbol: `### find_symbol
**SURGICAL PRECISION** - Use this to find the EXACT location of a function, class, or variable.
Once you have a symbol name from RAG or other files, use this to jump straight to its definition.
Parameters:
- name (required): Name of the symbol to find (e.g., "authMiddleware", "User")
- type (optional): Filter by type (function, class, interface)
Returns: List of exact file paths and line numbers where the symbol is defined`,

  get_callers: `### get_callers
**TRACE USAGE** - Find where a specific function or method is called.
Use this to understand the impact of a change or trace data flow.
Parameters:
- symbolName (required): Name of the function/method
- filePath (optional): Filter results to a specific file
Returns: List of files and line numbers where the symbol is invoked`,

  get_file_interface: `### get_file_interface
**EXPLORE MODULE** - Get a summary of what a file exports and imports.
Use this to understand a new file's "public API" without reading its entire content.
Parameters:
- filePath (required): Path to the file
Returns: List of exported functions/classes and imported dependencies`,

  // ========== FILE OPERATIONS (Official MCP Filesystem Server) ==========
  read_file: `### read_file
Read the complete contents of a file from the file system.
Parameters:
- path (required): Path to the file to read`,

  read_multiple_files: `### read_multiple_files
Read the contents of multiple files simultaneously.
Parameters:
- paths (required): Array of file paths to read`,

  write_file: `### write_file
Create a new file or completely overwrite an existing file with new content.
Parameters:
- path (required): Path where the file will be created or overwritten
- content (required): Content to write to the file`,

  edit_file: `### edit_file
Make selective edits to a file using pattern matching.
Parameters:
- path (required): Path to the file to edit
- edits (required): Array of {oldText, newText} edit operations
- dryRun (optional): If true, show changes without applying`,

  delete_file: `### delete_file
Delete a file from the file system.
Parameters:
- path (required): Path to the file to delete`,

  copy_file: `### copy_file
Copy a file to a new location.
Parameters:
- source (required): Source file path
- destination (required): Destination file path`,

  move_file: `### move_file
Move or rename a file or directory.
Parameters:
- sourcePath (required): Current path of the file or directory
- destinationPath (required): New path for the file or directory`,

  get_file_info: `### get_file_info
Retrieve detailed metadata about a file or directory.
Parameters:
- path (required): Path to the file or directory`,

  list_directory: `### list_directory
Get a detailed listing of files and directories in a specified path.
Parameters:
- path (required): Path to the directory to list`,

  search_files: `### search_files
Recursively search for files and directories matching a pattern.
NOTE: For semantic code understanding, use rag_query first - it's more efficient.
Use search_files only for exact pattern/regex matching.
Parameters:
- directory (required): Starting directory for the search
- pattern (required): Search pattern (glob like *.ts or regex)`,

  create_directory: `### create_directory
Create a new directory or ensure a directory exists.
Parameters:
- path (required): Path of the directory to create`,

  delete_directory: `### delete_directory
Delete a directory and all its contents.
Parameters:
- path (required): Path of the directory to delete`,

  list_allowed_directories: `### list_allowed_directories
List all directories that this server is allowed to access.
Parameters: none`,

  // ========== GIT OPERATIONS ==========
  git_status: `### git_status
Check the current git repository status.
Parameters: none
Returns:
- Staged, unstaged, and untracked files
- Current branch info`,

  git_diff: `### git_diff
View differences in files.
Parameters:
- file (optional): Specific file to diff
- staged (optional): Show staged changes only`,

  git_log: `### git_log
View commit history.
Parameters:
- count (optional): Number of commits (default: 10)
- format (optional): oneline, short, full, graph`,

  git_init: `### git_init
Initialize a new git repository.
Parameters: none`,

  git_add: `### git_add
Stage files for commit.
Parameters:
- file (optional): File to stage (default: all)`,

  git_commit: `### git_commit
Commit staged changes.
Parameters:
- message (required): The commit message`,

  git_push: `### git_push
Push commits to remote.
Parameters:
- remote (optional): Remote name (default: origin)
- branch (optional): Branch name
- force (optional): Force push`,

  git_pull: `### git_pull
Pull changes from remote.
Parameters:
- remote (optional): Remote name (default: origin)
- branch (optional): Branch name`,

  git_checkout: `### git_checkout
Switch branches or restore files.
Parameters:
- target (required): Branch name or file path
- create (optional): Create new branch`,

  git_stash: `### git_stash
Stash current changes.
Parameters:
- message (optional): Stash message`,

  git_stash_pop: `### git_stash_pop
Apply and remove the latest stash.
Parameters: none`,

  git_reset: `### git_reset
Reset HEAD to a specified state.
Parameters:
- target (optional): Commit hash (default: HEAD)
- mode (optional): soft, mixed, or hard`,

  git_clone: `### git_clone
Clone a repository.
Parameters:
- url (required): Repository URL
- directory (optional): Target directory`,

  git_branch_create: `### git_branch_create
Create and switch to a new branch.
Parameters:
- name (required): The branch name`,

  git_branch_list: `### git_branch_list
List all branches.
Parameters:
- all (optional): Include remote branches`,

  // ========== NPM OPERATIONS ==========
  npm_run: `### npm_run
Run an npm script.
Parameters:
- script (required): The script name to run`,

  npm_install: `### npm_install
Install npm packages.
Parameters:
- package (optional): Package name (omit for all)
- dev (optional): Install as dev dependency`,

  npm_uninstall: `### npm_uninstall
Uninstall an npm package.
Parameters:
- package (required): The package name`,

  npm_init: `### npm_init
Initialize a new package.json.
Parameters:
- yes (optional): Use default values`,

  npm_test: `### npm_test
Run npm test.
Parameters: none`,

  npm_build: `### npm_build
Run npm build.
Parameters: none`,

  npm_list: `### npm_list
List installed packages.
Parameters:
- depth (optional): Dependency depth`,

  // ========== HTTP ==========
  http_request: `### http_request
Make an HTTP request.
Parameters:
- url (required): The URL to request
- method (optional): GET, POST, PUT, DELETE, etc.
- headers (optional): Request headers object
- body (optional): Request body
- timeout (optional): Timeout in milliseconds`,

  url_fetch_content: `### url_fetch_content
Fetch the content of a URL and return readable text. Best for fetching webpage content.
Parameters:
- url (required): The URL to fetch content from
- extractText (optional): Extract readable text from HTML (default: true)`,

  // ========== BROWSER (Playwright MCP-compatible) ==========
  browser_navigate: `### browser_navigate
Navigate to a URL in the browser.
Parameters:
- url (required): The URL to navigate to`,

  browser_go_back: `### browser_go_back
Go back in browser history.
Parameters: none`,

  browser_go_forward: `### browser_go_forward
Go forward in browser history.
Parameters: none`,

  browser_click: `### browser_click
Click an element on the page.
Parameters:
- selector (required): CSS selector or text to click
- button (optional): left, right, or middle
- clickCount (optional): 1 or 2 for double-click`,

  browser_type: `### browser_type
Type text into an editable element.
Parameters:
- selector (required): CSS selector of the input
- text (required): Text to type
- clear (optional): Clear existing text first
- submit (optional): Press Enter after typing`,

  browser_hover: `### browser_hover
Hover over an element.
Parameters:
- selector (required): CSS selector to hover over`,

  browser_select_option: `### browser_select_option
Select an option in a dropdown.
Parameters:
- selector (required): CSS selector of the select
- value (required): Value or label to select`,

  browser_press_key: `### browser_press_key
Press a keyboard key.
Parameters:
- key (required): Key name (Enter, Escape, ArrowDown, etc.)`,

  browser_snapshot: `### browser_snapshot
Get accessibility snapshot of the current page.
Parameters: none
Returns: Page structure for understanding content`,

  browser_fetch_content: `### browser_fetch_content
Navigate to a URL using the browser, handle cookie/consent popups automatically, and return the page text content. Best for dynamic pages or sites with consent gates.
Parameters:
- url (required): URL to fetch content from
- waitTime (optional): Time to wait for page load in ms (default: 2000)
- dismissPopups (optional): Try to dismiss cookie/consent popups (default: true)`,

  browser_take_screenshot: `### browser_take_screenshot
Take a screenshot of the current page.
Parameters:
- path (optional): File path to save
- fullPage (optional): Capture full scrollable page
- selector (optional): CSS selector for specific element`,

  browser_wait: `### browser_wait
Wait for a condition.
Parameters:
- selector (optional): CSS selector to wait for
- state (optional): attached, visible, hidden, detached
- timeout (optional): Timeout in milliseconds
- time (optional): Fixed time to wait in ms`,

  browser_resize: `### browser_resize
Resize the browser window.
Parameters:
- width (required): Width in pixels
- height (required): Height in pixels`,

  browser_handle_dialog: `### browser_handle_dialog
Handle browser dialogs (alert, confirm, prompt).
Parameters:
- accept (required): Accept or dismiss
- promptText (optional): Text for prompt dialogs`,

  browser_drag: `### browser_drag
Drag and drop between two elements.
Parameters:
- sourceSelector (required): CSS selector of source
- targetSelector (required): CSS selector of target`,

  browser_tabs: `### browser_tabs
Manage browser tabs.
Parameters:
- action (required): list, new, close, or select
- index (optional): Tab index for close/select`,

  browser_evaluate: `### browser_evaluate
Execute JavaScript in the browser.
Parameters:
- script (required): JavaScript code to execute
- selector (optional): Element to pass to script`,

  browser_console_messages: `### browser_console_messages
Get console messages from the browser.
Parameters: none`,

  browser_network_requests: `### browser_network_requests
Get network requests made by the browser.
Parameters: none`,

  // ========== CODE EXECUTION ==========
  shell_exec: `### shell_exec
Execute a shell command.
Parameters:
- command (required): Command to execute
- cwd (optional): Working directory
- timeout (optional): Timeout in milliseconds
Rules:
- Some dangerous commands are blocked`,

  run_python: `### run_python
Execute Python code.
Parameters:
- code (required): Python code to execute`,

  run_node: `### run_node
Execute JavaScript/Node.js code.
Parameters:
- code (required): JavaScript code to execute`,

  run_typescript: `### run_typescript
Execute TypeScript code.
Parameters:
- code (required): TypeScript code to execute`,

  // ========== UTILITY ==========
  mcp_rules: `### mcp_rules
Get tool policies and rules.
Parameters: none`,

  env_get: `### env_get
Get an environment variable value.
Parameters:
- name (required): Environment variable name`,

  env_set: `### env_set
Set a session environment variable (not persisted).
Parameters:
- name (required): Environment variable name
- value (required): Value to set`,

  json_parse: `### json_parse
Parse JSON and optionally extract a value.
Parameters:
- json (required): JSON string to parse
- path (optional): Dot notation path to extract`,

  base64_encode: `### base64_encode
Encode text to base64.
Parameters:
- text (required): Text to encode`,

  base64_decode: `### base64_decode
Decode base64 to text.
Parameters:
- encoded (required): Base64 string to decode`,

  // ========== GIT (additional) ==========
  git_blame: `### git_blame
Show what revision and author last modified each line of a file.
Parameters:
- file (required): File to blame
- startLine (optional): Start line number
- endLine (optional): End line number`,

  git_show: `### git_show
Show details of a commit.
Parameters:
- ref (optional): Commit hash, tag, or branch (default: HEAD)
- stat (optional): Show diffstat only`,

  // ========== MEMORY ==========
  memory_store: `### memory_store
Store a value in persistent memory with a key.
Parameters:
- key (required): Unique key to store the value under
- value (required): Value to store (string, number, object, array)`,

  memory_retrieve: `### memory_retrieve
Retrieve a value from memory by key.
Parameters:
- key (required): Key to retrieve`,

  memory_list: `### memory_list
List all keys stored in memory.
Parameters: none`,

  memory_delete: `### memory_delete
Delete a key from memory.
Parameters:
- key (required): Key to delete`,

  // ========== TEXT ==========
  text_summarize: `### text_summarize
Summarize text by extracting key sentences.
Parameters:
- text (required): Text to summarize
- maxSentences (optional): Maximum sentences (default: 3)`,

  diff_files: `### diff_files
Compare two files and show differences.
Parameters:
- file1 (required): Path to first file
- file2 (required): Path to second file`,

  // ========== SEARCH ==========
  web_search: `### web_search
Search the web using DuckDuckGo.
Parameters:
- query (required): Search query
- maxResults (optional): Maximum results (default: 5)`,

  // ========== PROCESS ==========
  process_list: `### process_list
List running processes.
Parameters:
- filter (optional): Filter processes by name`,

  process_kill: `### process_kill
Kill a process by PID or name.
Parameters:
- target (required): Process ID or name to kill
- force (optional): Force kill (SIGKILL)`,

  // ========== ARCHIVE ==========
  zip_create: `### zip_create
Create a zip archive from files or directories.
Parameters:
- output (required): Output zip file path
- sources (required): Array of files/directories to include`,

  zip_extract: `### zip_extract
Extract a zip archive.
Parameters:
- archive (required): Path to zip file
- destination (optional): Destination directory`
};
