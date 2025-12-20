/**
 * Tool Prompts and Schemas
 * Per-tool system prompt snippets and OpenAI-compatible schemas
 * 
 * Updated: Includes all MCP server tools (~40 tools)
 */

// ============================================================
// PER-TOOL SYSTEM PROMPTS
// ============================================================

export const TOOL_PROMPTS: Record<string, string> = {
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

// ============================================================
// OPENAI-COMPATIBLE TOOL SCHEMAS
// ============================================================

export interface OpenAIToolSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required: string[];
    };
  };
}

export const TOOL_SCHEMAS: Record<string, OpenAIToolSchema> = {
  // ========== FILE OPERATIONS (Official MCP Filesystem Server) ==========
  read_file: {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the complete contents of a file from the file system',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file to read' }
        },
        required: ['path']
      }
    }
  },
  read_multiple_files: {
    type: 'function',
    function: {
      name: 'read_multiple_files',
      description: 'Read the contents of multiple files simultaneously',
      parameters: {
        type: 'object',
        properties: {
          paths: { type: 'array', items: { type: 'string' }, description: 'Array of file paths to read' }
        },
        required: ['paths']
      }
    }
  },
  write_file: {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Create a new file or completely overwrite an existing file with new content',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path where the file will be created or overwritten' },
          content: { type: 'string', description: 'Content to write to the file' }
        },
        required: ['path', 'content']
      }
    }
  },
  edit_file: {
    type: 'function',
    function: {
      name: 'edit_file',
      description: 'Make selective edits to a file using advanced pattern matching',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file to edit' },
          edits: { 
            type: 'array', 
            items: {
              type: 'object',
              properties: {
                oldText: { type: 'string', description: 'Text to search for' },
                newText: { type: 'string', description: 'Text to replace with' }
              },
              required: ['oldText', 'newText']
            },
            description: 'Array of edit operations to perform'
          },
          dryRun: { type: 'boolean', description: 'If true, show changes without applying' }
        },
        required: ['path', 'edits']
      }
    }
  },
  delete_file: {
    type: 'function',
    function: {
      name: 'delete_file',
      description: 'Delete a file from the file system',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file to delete' }
        },
        required: ['path']
      }
    }
  },
  copy_file: {
    type: 'function',
    function: {
      name: 'copy_file',
      description: 'Copy a file to a new location',
      parameters: {
        type: 'object',
        properties: {
          source: { type: 'string', description: 'Source file path' },
          destination: { type: 'string', description: 'Destination file path' }
        },
        required: ['source', 'destination']
      }
    }
  },
  move_file: {
    type: 'function',
    function: {
      name: 'move_file',
      description: 'Move or rename a file or directory',
      parameters: {
        type: 'object',
        properties: {
          sourcePath: { type: 'string', description: 'Current path of the file or directory' },
          destinationPath: { type: 'string', description: 'New path for the file or directory' }
        },
        required: ['sourcePath', 'destinationPath']
      }
    }
  },
  get_file_info: {
    type: 'function',
    function: {
      name: 'get_file_info',
      description: 'Retrieve detailed metadata about a file or directory',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file or directory' }
        },
        required: ['path']
      }
    }
  },
  list_directory: {
    type: 'function',
    function: {
      name: 'list_directory',
      description: 'Get a detailed listing of files and directories in a specified path',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the directory to list' }
        },
        required: ['path']
      }
    }
  },
  search_files: {
    type: 'function',
    function: {
      name: 'search_files',
      description: 'Recursively search for files and directories matching a pattern',
      parameters: {
        type: 'object',
        properties: {
          directory: { type: 'string', description: 'Starting directory for the search' },
          pattern: { type: 'string', description: 'Search pattern (glob or regex)' }
        },
        required: ['directory', 'pattern']
      }
    }
  },
  create_directory: {
    type: 'function',
    function: {
      name: 'create_directory',
      description: 'Create a new directory or ensure a directory exists',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path of the directory to create' }
        },
        required: ['path']
      }
    }
  },
  delete_directory: {
    type: 'function',
    function: {
      name: 'delete_directory',
      description: 'Delete a directory and all its contents',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path of the directory to delete' }
        },
        required: ['path']
      }
    }
  },
  list_allowed_directories: {
    type: 'function',
    function: {
      name: 'list_allowed_directories',
      description: 'List all directories that this server is allowed to access',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },

  // ========== GIT OPERATIONS ==========
  git_status: {
    type: 'function',
    function: {
      name: 'git_status',
      description: 'Check git repository status',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  git_diff: {
    type: 'function',
    function: {
      name: 'git_diff',
      description: 'Show git differences',
      parameters: {
        type: 'object',
        properties: {
          file: { type: 'string', description: 'Specific file to diff' },
          staged: { type: 'boolean', description: 'Show staged changes only' }
        },
        required: []
      }
    }
  },
  git_log: {
    type: 'function',
    function: {
      name: 'git_log',
      description: 'Show git commit history',
      parameters: {
        type: 'object',
        properties: {
          count: { type: 'number', description: 'Number of commits to show' },
          format: { type: 'string', enum: ['oneline', 'short', 'full', 'graph'], description: 'Output format' }
        },
        required: []
      }
    }
  },
  git_init: {
    type: 'function',
    function: {
      name: 'git_init',
      description: 'Initialize a git repository',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  git_add: {
    type: 'function',
    function: {
      name: 'git_add',
      description: 'Stage files for commit',
      parameters: {
        type: 'object',
        properties: {
          file: { type: 'string', description: 'File to stage (default: all)' }
        },
        required: []
      }
    }
  },
  git_commit: {
    type: 'function',
    function: {
      name: 'git_commit',
      description: 'Commit staged changes',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Commit message' }
        },
        required: ['message']
      }
    }
  },
  git_push: {
    type: 'function',
    function: {
      name: 'git_push',
      description: 'Push commits to remote',
      parameters: {
        type: 'object',
        properties: {
          remote: { type: 'string', description: 'Remote name (default: origin)' },
          branch: { type: 'string', description: 'Branch name' },
          force: { type: 'boolean', description: 'Force push' }
        },
        required: []
      }
    }
  },
  git_pull: {
    type: 'function',
    function: {
      name: 'git_pull',
      description: 'Pull changes from remote',
      parameters: {
        type: 'object',
        properties: {
          remote: { type: 'string', description: 'Remote name (default: origin)' },
          branch: { type: 'string', description: 'Branch name' }
        },
        required: []
      }
    }
  },
  git_checkout: {
    type: 'function',
    function: {
      name: 'git_checkout',
      description: 'Switch branches or restore files',
      parameters: {
        type: 'object',
        properties: {
          target: { type: 'string', description: 'Branch name or file path' },
          create: { type: 'boolean', description: 'Create new branch' }
        },
        required: ['target']
      }
    }
  },
  git_stash: {
    type: 'function',
    function: {
      name: 'git_stash',
      description: 'Stash current changes',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Stash message' }
        },
        required: []
      }
    }
  },
  git_stash_pop: {
    type: 'function',
    function: {
      name: 'git_stash_pop',
      description: 'Apply and remove the latest stash',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  git_reset: {
    type: 'function',
    function: {
      name: 'git_reset',
      description: 'Reset HEAD to a specified state',
      parameters: {
        type: 'object',
        properties: {
          target: { type: 'string', description: 'Commit hash (default: HEAD)' },
          mode: { type: 'string', enum: ['soft', 'mixed', 'hard'], description: 'Reset mode' }
        },
        required: []
      }
    }
  },
  git_clone: {
    type: 'function',
    function: {
      name: 'git_clone',
      description: 'Clone a repository',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Repository URL' },
          directory: { type: 'string', description: 'Target directory' }
        },
        required: ['url']
      }
    }
  },
  git_branch_create: {
    type: 'function',
    function: {
      name: 'git_branch_create',
      description: 'Create and switch to a new branch',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Branch name' }
        },
        required: ['name']
      }
    }
  },
  git_branch_list: {
    type: 'function',
    function: {
      name: 'git_branch_list',
      description: 'List all branches',
      parameters: {
        type: 'object',
        properties: {
          all: { type: 'boolean', description: 'Include remote branches' }
        },
        required: []
      }
    }
  },

  // ========== NPM OPERATIONS ==========
  npm_run: {
    type: 'function',
    function: {
      name: 'npm_run',
      description: 'Run an npm script',
      parameters: {
        type: 'object',
        properties: {
          script: { type: 'string', description: 'Script name to run' }
        },
        required: ['script']
      }
    }
  },
  npm_install: {
    type: 'function',
    function: {
      name: 'npm_install',
      description: 'Install npm packages',
      parameters: {
        type: 'object',
        properties: {
          package: { type: 'string', description: 'Package name (omit for all)' },
          dev: { type: 'boolean', description: 'Install as dev dependency' }
        },
        required: []
      }
    }
  },
  npm_uninstall: {
    type: 'function',
    function: {
      name: 'npm_uninstall',
      description: 'Uninstall an npm package',
      parameters: {
        type: 'object',
        properties: {
          package: { type: 'string', description: 'Package name to uninstall' }
        },
        required: ['package']
      }
    }
  },
  npm_init: {
    type: 'function',
    function: {
      name: 'npm_init',
      description: 'Initialize a new package.json',
      parameters: {
        type: 'object',
        properties: {
          yes: { type: 'boolean', description: 'Use default values' }
        },
        required: []
      }
    }
  },
  npm_test: {
    type: 'function',
    function: {
      name: 'npm_test',
      description: 'Run npm test',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  npm_build: {
    type: 'function',
    function: {
      name: 'npm_build',
      description: 'Run npm build',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  npm_list: {
    type: 'function',
    function: {
      name: 'npm_list',
      description: 'List installed packages',
      parameters: {
        type: 'object',
        properties: {
          depth: { type: 'number', description: 'Dependency depth' }
        },
        required: []
      }
    }
  },

  // ========== HTTP/BROWSER ==========
  http_request: {
    type: 'function',
    function: {
      name: 'http_request',
      description: 'Make an HTTP request',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to request' },
          method: { type: 'string', description: 'HTTP method (default: GET)' },
          headers: { type: 'object', description: 'Request headers' },
          body: { type: 'string', description: 'Request body' },
          timeout: { type: 'number', description: 'Timeout in milliseconds' }
        },
        required: ['url']
      }
    }
  },
  url_fetch_content: {
    type: 'function',
    function: {
      name: 'url_fetch_content',
      description: 'Fetch the content of a URL and return readable text. Best for fetching webpage content.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to fetch content from' },
          extractText: { type: 'boolean', description: 'Extract readable text from HTML (default: true)' }
        },
        required: ['url']
      }
    }
  },
  // ========== BROWSER (Playwright MCP-compatible) ==========
  browser_navigate: {
    type: 'function',
    function: {
      name: 'browser_navigate',
      description: 'Navigate to a URL in the browser',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to navigate to' }
        },
        required: ['url']
      }
    }
  },
  browser_go_back: {
    type: 'function',
    function: {
      name: 'browser_go_back',
      description: 'Go back in browser history',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  browser_go_forward: {
    type: 'function',
    function: {
      name: 'browser_go_forward',
      description: 'Go forward in browser history',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  browser_click: {
    type: 'function',
    function: {
      name: 'browser_click',
      description: 'Click an element on the page',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector to click' },
          button: { type: 'string', enum: ['left', 'right', 'middle'], description: 'Mouse button' },
          clickCount: { type: 'number', description: 'Number of clicks' }
        },
        required: ['selector']
      }
    }
  },
  browser_type: {
    type: 'function',
    function: {
      name: 'browser_type',
      description: 'Type text into an editable element',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector of input' },
          text: { type: 'string', description: 'Text to type' },
          clear: { type: 'boolean', description: 'Clear existing text first' },
          submit: { type: 'boolean', description: 'Press Enter after typing' }
        },
        required: ['selector', 'text']
      }
    }
  },
  browser_hover: {
    type: 'function',
    function: {
      name: 'browser_hover',
      description: 'Hover over an element',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector to hover over' }
        },
        required: ['selector']
      }
    }
  },
  browser_select_option: {
    type: 'function',
    function: {
      name: 'browser_select_option',
      description: 'Select an option in a dropdown',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector of select element' },
          value: { type: 'string', description: 'Value to select' }
        },
        required: ['selector', 'value']
      }
    }
  },
  browser_press_key: {
    type: 'function',
    function: {
      name: 'browser_press_key',
      description: 'Press a keyboard key',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Key name (Enter, Escape, etc.)' }
        },
        required: ['key']
      }
    }
  },
  browser_snapshot: {
    type: 'function',
    function: {
      name: 'browser_snapshot',
      description: 'Get accessibility snapshot of the current page',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  browser_fetch_content: {
    type: 'function',
    function: {
      name: 'browser_fetch_content',
      description: 'Navigate to a URL using browser, handle cookie/consent popups, and return page text content',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to fetch content from' },
          waitTime: { type: 'number', description: 'Time to wait for page load in ms (default: 2000)' },
          dismissPopups: { type: 'boolean', description: 'Try to dismiss cookie/consent popups (default: true)' }
        },
        required: ['url']
      }
    }
  },
  browser_take_screenshot: {
    type: 'function',
    function: {
      name: 'browser_take_screenshot',
      description: 'Take a screenshot of the current page',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path to save' },
          fullPage: { type: 'boolean', description: 'Capture full page' },
          selector: { type: 'string', description: 'CSS selector for specific element' }
        },
        required: []
      }
    }
  },
  browser_wait: {
    type: 'function',
    function: {
      name: 'browser_wait',
      description: 'Wait for a condition',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector to wait for' },
          state: { type: 'string', enum: ['attached', 'visible', 'hidden', 'detached'], description: 'State to wait for' },
          timeout: { type: 'number', description: 'Timeout in milliseconds' },
          time: { type: 'number', description: 'Fixed time to wait in ms' }
        },
        required: []
      }
    }
  },
  browser_resize: {
    type: 'function',
    function: {
      name: 'browser_resize',
      description: 'Resize the browser window',
      parameters: {
        type: 'object',
        properties: {
          width: { type: 'number', description: 'Width in pixels' },
          height: { type: 'number', description: 'Height in pixels' }
        },
        required: ['width', 'height']
      }
    }
  },
  browser_handle_dialog: {
    type: 'function',
    function: {
      name: 'browser_handle_dialog',
      description: 'Handle browser dialogs',
      parameters: {
        type: 'object',
        properties: {
          accept: { type: 'boolean', description: 'Accept or dismiss' },
          promptText: { type: 'string', description: 'Text for prompt dialogs' }
        },
        required: ['accept']
      }
    }
  },
  browser_drag: {
    type: 'function',
    function: {
      name: 'browser_drag',
      description: 'Drag and drop between elements',
      parameters: {
        type: 'object',
        properties: {
          sourceSelector: { type: 'string', description: 'Source element selector' },
          targetSelector: { type: 'string', description: 'Target element selector' }
        },
        required: ['sourceSelector', 'targetSelector']
      }
    }
  },
  browser_tabs: {
    type: 'function',
    function: {
      name: 'browser_tabs',
      description: 'Manage browser tabs',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'new', 'close', 'select'], description: 'Tab action' },
          index: { type: 'number', description: 'Tab index' }
        },
        required: ['action']
      }
    }
  },
  browser_evaluate: {
    type: 'function',
    function: {
      name: 'browser_evaluate',
      description: 'Execute JavaScript in the browser',
      parameters: {
        type: 'object',
        properties: {
          script: { type: 'string', description: 'JavaScript code' },
          selector: { type: 'string', description: 'Element to pass to script' }
        },
        required: ['script']
      }
    }
  },
  browser_console_messages: {
    type: 'function',
    function: {
      name: 'browser_console_messages',
      description: 'Get console messages from the browser',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  browser_network_requests: {
    type: 'function',
    function: {
      name: 'browser_network_requests',
      description: 'Get network requests made by the browser',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },

  // ========== CODE EXECUTION ==========
  shell_exec: {
    type: 'function',
    function: {
      name: 'shell_exec',
      description: 'Execute a shell command',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Command to execute' },
          cwd: { type: 'string', description: 'Working directory' },
          timeout: { type: 'number', description: 'Timeout in milliseconds' }
        },
        required: ['command']
      }
    }
  },
  run_python: {
    type: 'function',
    function: {
      name: 'run_python',
      description: 'Execute Python code',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Python code to execute' }
        },
        required: ['code']
      }
    }
  },
  run_node: {
    type: 'function',
    function: {
      name: 'run_node',
      description: 'Execute JavaScript/Node.js code',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'JavaScript code to execute' }
        },
        required: ['code']
      }
    }
  },
  run_typescript: {
    type: 'function',
    function: {
      name: 'run_typescript',
      description: 'Execute TypeScript code',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'TypeScript code to execute' }
        },
        required: ['code']
      }
    }
  },

  // ========== UTILITY ==========
  mcp_rules: {
    type: 'function',
    function: {
      name: 'mcp_rules',
      description: 'Get tool policies and rules',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  env_get: {
    type: 'function',
    function: {
      name: 'env_get',
      description: 'Get an environment variable value',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Environment variable name' }
        },
        required: ['name']
      }
    }
  },
  env_set: {
    type: 'function',
    function: {
      name: 'env_set',
      description: 'Set a session environment variable',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Environment variable name' },
          value: { type: 'string', description: 'Value to set' }
        },
        required: ['name', 'value']
      }
    }
  },
  json_parse: {
    type: 'function',
    function: {
      name: 'json_parse',
      description: 'Parse JSON and optionally extract a value',
      parameters: {
        type: 'object',
        properties: {
          json: { type: 'string', description: 'JSON string to parse' },
          path: { type: 'string', description: 'Dot notation path to extract' }
        },
        required: ['json']
      }
    }
  },
  base64_encode: {
    type: 'function',
    function: {
      name: 'base64_encode',
      description: 'Encode text to base64',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to encode' }
        },
        required: ['text']
      }
    }
  },
  base64_decode: {
    type: 'function',
    function: {
      name: 'base64_decode',
      description: 'Decode base64 to text',
      parameters: {
        type: 'object',
        properties: {
          encoded: { type: 'string', description: 'Base64 string to decode' }
        },
        required: ['encoded']
      }
    }
  },

  // ========== GIT (additional) ==========
  git_blame: {
    type: 'function',
    function: {
      name: 'git_blame',
      description: 'Show what revision and author last modified each line',
      parameters: {
        type: 'object',
        properties: {
          file: { type: 'string', description: 'File to blame' },
          startLine: { type: 'number', description: 'Start line number' },
          endLine: { type: 'number', description: 'End line number' }
        },
        required: ['file']
      }
    }
  },
  git_show: {
    type: 'function',
    function: {
      name: 'git_show',
      description: 'Show details of a commit',
      parameters: {
        type: 'object',
        properties: {
          ref: { type: 'string', description: 'Commit hash, tag, or branch' },
          stat: { type: 'boolean', description: 'Show diffstat only' }
        },
        required: []
      }
    }
  },

  // ========== MEMORY ==========
  memory_store: {
    type: 'function',
    function: {
      name: 'memory_store',
      description: 'Store a value in persistent memory',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Key to store value under' },
          value: { description: 'Value to store' }
        },
        required: ['key', 'value']
      }
    }
  },
  memory_retrieve: {
    type: 'function',
    function: {
      name: 'memory_retrieve',
      description: 'Retrieve a value from memory',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Key to retrieve' }
        },
        required: ['key']
      }
    }
  },
  memory_list: {
    type: 'function',
    function: {
      name: 'memory_list',
      description: 'List all keys in memory',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  memory_delete: {
    type: 'function',
    function: {
      name: 'memory_delete',
      description: 'Delete a key from memory',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Key to delete' }
        },
        required: ['key']
      }
    }
  },

  // ========== TEXT ==========
  text_summarize: {
    type: 'function',
    function: {
      name: 'text_summarize',
      description: 'Summarize text by extracting key sentences',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to summarize' },
          maxSentences: { type: 'number', description: 'Maximum sentences' }
        },
        required: ['text']
      }
    }
  },
  diff_files: {
    type: 'function',
    function: {
      name: 'diff_files',
      description: 'Compare two files and show differences',
      parameters: {
        type: 'object',
        properties: {
          file1: { type: 'string', description: 'Path to first file' },
          file2: { type: 'string', description: 'Path to second file' }
        },
        required: ['file1', 'file2']
      }
    }
  },

  // ========== SEARCH ==========
  web_search: {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web using DuckDuckGo',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          maxResults: { type: 'number', description: 'Maximum results' }
        },
        required: ['query']
      }
    }
  },

  // ========== PROCESS ==========
  process_list: {
    type: 'function',
    function: {
      name: 'process_list',
      description: 'List running processes',
      parameters: {
        type: 'object',
        properties: {
          filter: { type: 'string', description: 'Filter by name' }
        },
        required: []
      }
    }
  },
  process_kill: {
    type: 'function',
    function: {
      name: 'process_kill',
      description: 'Kill a process by PID or name',
      parameters: {
        type: 'object',
        properties: {
          target: { type: 'string', description: 'Process ID or name' },
          force: { type: 'boolean', description: 'Force kill' }
        },
        required: ['target']
      }
    }
  },

  // ========== ARCHIVE ==========
  zip_create: {
    type: 'function',
    function: {
      name: 'zip_create',
      description: 'Create a zip archive',
      parameters: {
        type: 'object',
        properties: {
          output: { type: 'string', description: 'Output zip file path' },
          sources: { type: 'array', items: { type: 'string' }, description: 'Files to include' }
        },
        required: ['output', 'sources']
      }
    }
  },
  zip_extract: {
    type: 'function',
    function: {
      name: 'zip_extract',
      description: 'Extract a zip archive',
      parameters: {
        type: 'object',
        properties: {
          archive: { type: 'string', description: 'Path to zip file' },
          destination: { type: 'string', description: 'Destination directory' }
        },
        required: ['archive']
      }
    }
  }
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Get the OpenAI-compatible schemas for a list of tools
 */
export function getToolSchemas(enabledTools: string[]): OpenAIToolSchema[] {
  return enabledTools
    .filter(tool => TOOL_SCHEMAS[tool])
    .map(tool => TOOL_SCHEMAS[tool]);
}

/**
 * Get a single tool's prompt
 */
export function getToolPrompt(toolName: string): string | null {
  return TOOL_PROMPTS[toolName] || null;
}

/**
 * Get all tool names
 */
export function getAllToolNames(): string[] {
  return Object.keys(TOOL_SCHEMAS);
}

/**
 * Build a combined system prompt from enabled tools
 */
export function buildToolSystemPrompt(enabledTools: string[]): string {
  const prompts = enabledTools
    .filter(tool => TOOL_PROMPTS[tool])
    .map(tool => TOOL_PROMPTS[tool]);
  
  if (prompts.length === 0) return '';
  
  return `## Available Tools\n\n${prompts.join('\n\n')}`;
}

/**
 * Build a full system prompt with custom options
 */
export interface BuildSystemPromptOptions {
  enabledTools: string[];
  customHeader?: string;
  customRules?: string[];
  includeRiskWarnings?: boolean;
}

export function buildSystemPrompt(options: BuildSystemPromptOptions): string {
  const { enabledTools, customHeader, customRules, includeRiskWarnings = true } = options;
  
  const parts: string[] = [];
  
  // Add custom header if provided
  if (customHeader) {
    parts.push(customHeader);
  }
  
  // Add tool prompts
  const toolPrompts = enabledTools
    .filter(tool => TOOL_PROMPTS[tool])
    .map(tool => TOOL_PROMPTS[tool]);
  
  if (toolPrompts.length > 0) {
    parts.push(`## Available Tools\n\n${toolPrompts.join('\n\n')}`);
  }
  
  // Add custom rules
  if (customRules && customRules.length > 0) {
    parts.push(`## Rules\n\n${customRules.map(r => `- ${r}`).join('\n')}`);
  }
  
  // Add risk warnings for dangerous tools
  if (includeRiskWarnings) {
    const dangerousTools = enabledTools.filter(t => 
      ['file_delete', 'folder_delete', 'git_reset', 'shell_exec'].includes(t)
    );
    if (dangerousTools.length > 0) {
      parts.push(`## ⚠️ Risk Warnings\n\nThe following tools can cause data loss: ${dangerousTools.join(', ')}. Use with caution.`);
    }
  }
  
  return parts.join('\n\n');
}
