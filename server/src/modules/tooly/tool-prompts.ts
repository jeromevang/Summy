/**
 * Tool Prompts
 * Per-tool system prompt snippets that get merged into the final system prompt
 */

// ============================================================
// PER-TOOL SYSTEM PROMPTS
// ============================================================

export const TOOL_PROMPTS: Record<string, string> = {
  // ========== FILE OPERATIONS ==========
  file_read: `### file_read
Read the contents of a file. Use this to inspect file contents before making changes.
Parameters:
- path (required): The file path to read, relative to project root
Rules:
- Always use relative paths from project root
- Check if file exists before attempting to read
- Use for inspecting code, configs, or any text file`,

  file_write: `### file_write
Create a new file or completely overwrite an existing file.
Parameters:
- path (required): The file path to write
- content (required): The full content to write to the file
Rules:
- Use for creating new files or complete rewrites
- For small changes to existing files, use file_patch instead
- Always include the complete file content`,

  file_patch: `### file_patch
Modify specific content in an existing file. Use for surgical edits.
Parameters:
- path (required): The file path to modify
- find (required): The exact text to find (case-sensitive)
- replace (required): The text to replace it with
Rules:
- The find text must match exactly, including whitespace
- Use for targeted changes rather than full rewrites
- Verify the file exists and contains the find text`,

  file_list: `### file_list
List files and directories in a folder.
Parameters:
- folder (optional): The directory to list, defaults to current directory
Rules:
- Returns file and folder names
- Use to explore project structure
- Combine with file_read to inspect specific files`,

  file_search: `### file_search
Search for text within files using grep.
Parameters:
- query (required): The text pattern to search for
- path (optional): Directory to search in, defaults to current
Rules:
- Returns matching lines with file paths
- Use for finding code, TODOs, or specific patterns
- Supports basic grep patterns`,

  create_new_file: `### create_new_file
Create a new file with content.
Parameters:
- filepath (required): The path for the new file
- content (required): The content to write
Rules:
- Use for creating new files
- Will overwrite if file already exists
- Create parent directories if needed`,

  folder_create: `### folder_create
Create a new directory.
Parameters:
- path (required): The directory path to create
Rules:
- Creates nested directories if needed
- No error if directory already exists`,

  folder_delete: `### folder_delete
Delete a directory and all its contents.
Parameters:
- path (required): The directory path to delete
Rules:
- CAUTION: Deletes recursively
- Only use when sure about the target
- Cannot be undone`,

  // ========== GIT OPERATIONS ==========
  git_status: `### git_status
Check the current git repository status.
Parameters: none
Rules:
- Shows staged, unstaged, and untracked files
- Use before committing to verify changes
- Returns current branch info`,

  git_diff: `### git_diff
View differences in files.
Parameters:
- file (optional): Specific file to diff, or all changes if omitted
Rules:
- Shows line-by-line changes
- Use to review modifications before committing`,

  git_log: `### git_log
View commit history.
Parameters:
- count (optional): Number of commits to show, default 5
Rules:
- Returns commit hashes and messages
- Useful for reviewing recent changes`,

  git_commit: `### git_commit
Commit staged changes with a message.
Parameters:
- message (required): The commit message
Rules:
- Automatically stages all changes before committing
- Use clear, descriptive commit messages
- Follow conventional commit format when appropriate`,

  git_add: `### git_add
Stage a specific file for commit.
Parameters:
- file (required): The file path to stage
Rules:
- Stage before committing
- Use git_status to verify staged files`,

  git_branch_create: `### git_branch_create
Create and switch to a new branch.
Parameters:
- name (required): The branch name
Rules:
- Use kebab-case for branch names (e.g., feature/user-auth)
- Switches to the new branch after creation`,

  git_branch_list: `### git_branch_list
List all branches.
Parameters: none
Rules:
- Shows local branches
- Current branch is marked`,

  git_checkout: `### git_checkout
Switch to an existing branch.
Parameters:
- branch (required): The branch name to switch to
Rules:
- Branch must exist
- Stash or commit changes first`,

  git_merge: `### git_merge
Merge a branch into the current branch.
Parameters:
- branch (required): The branch to merge from
Rules:
- May result in merge conflicts
- Verify you're on the correct target branch`,

  git_rm: `### git_rm
Remove a file from git tracking.
Parameters:
- file (required): The file to remove
Rules:
- Removes from git and filesystem
- Use with caution`,

  // ========== NPM OPERATIONS ==========
  npm_run: `### npm_run
Execute an npm script defined in package.json.
Parameters:
- script (required): The script name to run
Rules:
- Common scripts: build, test, start, dev, lint
- Check package.json for available scripts`,

  npm_install: `### npm_install
Install an npm package.
Parameters:
- package (required): The package name to install
Rules:
- Adds to dependencies in package.json
- Use -D suffix for dev dependencies if needed`,

  npm_uninstall: `### npm_uninstall
Remove an npm package.
Parameters:
- package (required): The package name to remove
Rules:
- Removes from dependencies and node_modules`,

  // ========== BROWSER/HTTP ==========
  http_request: `### http_request
Make an HTTP request to fetch data.
Parameters:
- url (required): The URL to request
- method (optional): GET, POST, etc. Default is GET
- body (optional): Request body for POST/PUT
Rules:
- Use for API calls and fetching data
- Returns response text`,

  browser_navigate: `### browser_navigate
Navigate to a webpage and optionally interact.
Parameters:
- url (required): The URL to navigate to
- clickSelector (optional): CSS selector to click
- getContent (optional): Whether to return page content
Rules:
- Opens a real browser instance
- Can capture page content for analysis`,

  // ========== OTHER ==========
  run_python: `### run_python
Execute Python code and return the output.
Parameters:
- code (required): The Python code to execute
Rules:
- Python must be installed
- Use for data processing or scripting tasks
- Output is captured and returned`,

  mcp_rules: `### mcp_rules
Get tool policies and usage rules.
Parameters: none
Rules:
- Returns the MCP configuration
- Useful for understanding tool capabilities`
};

// ============================================================
// SYSTEM PROMPT BUILDER
// ============================================================

export interface PromptBuildOptions {
  enabledTools: string[];
  customHeader?: string;
  customRules?: string[];
  includeRiskWarnings?: boolean;
}

export function buildSystemPrompt(options: PromptBuildOptions): string {
  const {
    enabledTools,
    customHeader,
    customRules,
    includeRiskWarnings = true
  } = options;

  // Header
  const header = customHeader || `You are a helpful coding assistant with access to tools.

When you need to perform an action, use the appropriate tool. Only use tools from the list below.`;

  // Build tool sections
  const toolSections = enabledTools
    .filter(tool => TOOL_PROMPTS[tool])
    .map(tool => TOOL_PROMPTS[tool])
    .join('\n\n');

  // Default rules
  const defaultRules = [
    'Only use the tools listed above - do not hallucinate other tools',
    'Always verify file paths exist before writing',
    'Use file_patch for small changes, file_write for new files',
    'Check git_status before committing',
    'Be precise with tool parameters - they are case-sensitive',
    'If a tool fails, explain the error and suggest alternatives'
  ];

  // Risk warnings
  const riskWarnings = includeRiskWarnings ? [
    'CAUTION: npm_install, npm_uninstall, run_python, and folder_delete are high-risk operations - use with care'
  ] : [];

  // Combine rules
  const allRules = [
    ...defaultRules,
    ...(customRules || []),
    ...riskWarnings
  ];

  const rulesSection = allRules.map((rule, i) => `${i + 1}. ${rule}`).join('\n');

  // Build final prompt
  return `${header}

## Available Tools

${toolSections}

## Important Rules

${rulesSection}`;
}

// ============================================================
// OPENAI TOOLS SCHEMA GENERATOR
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
  file_read: {
    type: 'function',
    function: {
      name: 'file_read',
      description: 'Read the contents of a file',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The file path to read' }
        },
        required: ['path']
      }
    }
  },
  file_write: {
    type: 'function',
    function: {
      name: 'file_write',
      description: 'Write content to a file (creates or overwrites)',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The file path to write' },
          content: { type: 'string', description: 'The content to write' }
        },
        required: ['path', 'content']
      }
    }
  },
  file_patch: {
    type: 'function',
    function: {
      name: 'file_patch',
      description: 'Modify specific content in a file',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The file path to modify' },
          find: { type: 'string', description: 'The text to find' },
          replace: { type: 'string', description: 'The text to replace with' }
        },
        required: ['path', 'find', 'replace']
      }
    }
  },
  file_list: {
    type: 'function',
    function: {
      name: 'file_list',
      description: 'List files in a directory',
      parameters: {
        type: 'object',
        properties: {
          folder: { type: 'string', description: 'The directory to list (default: current)' }
        },
        required: []
      }
    }
  },
  file_search: {
    type: 'function',
    function: {
      name: 'file_search',
      description: 'Search for text in files',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The text to search for' },
          path: { type: 'string', description: 'The directory to search in' }
        },
        required: ['query']
      }
    }
  },
  git_status: {
    type: 'function',
    function: {
      name: 'git_status',
      description: 'Check git repository status',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  git_diff: {
    type: 'function',
    function: {
      name: 'git_diff',
      description: 'View git differences',
      parameters: {
        type: 'object',
        properties: {
          file: { type: 'string', description: 'Specific file to diff (optional)' }
        },
        required: []
      }
    }
  },
  git_log: {
    type: 'function',
    function: {
      name: 'git_log',
      description: 'View commit history',
      parameters: {
        type: 'object',
        properties: {
          count: { type: 'number', description: 'Number of commits to show' }
        },
        required: []
      }
    }
  },
  git_commit: {
    type: 'function',
    function: {
      name: 'git_commit',
      description: 'Commit changes with a message',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'The commit message' }
        },
        required: ['message']
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
          name: { type: 'string', description: 'The branch name' }
        },
        required: ['name']
      }
    }
  },
  npm_run: {
    type: 'function',
    function: {
      name: 'npm_run',
      description: 'Run an npm script',
      parameters: {
        type: 'object',
        properties: {
          script: { type: 'string', description: 'The script name to run' }
        },
        required: ['script']
      }
    }
  },
  npm_install: {
    type: 'function',
    function: {
      name: 'npm_install',
      description: 'Install an npm package',
      parameters: {
        type: 'object',
        properties: {
          package: { type: 'string', description: 'The package name' }
        },
        required: ['package']
      }
    }
  },
  http_request: {
    type: 'function',
    function: {
      name: 'http_request',
      description: 'Make an HTTP request',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL to request' },
          method: { type: 'string', description: 'HTTP method (GET, POST, etc.)' },
          body: { type: 'string', description: 'Request body' }
        },
        required: ['url']
      }
    }
  },
  browser_navigate: {
    type: 'function',
    function: {
      name: 'browser_navigate',
      description: 'Navigate to a webpage',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL to navigate to' },
          clickSelector: { type: 'string', description: 'CSS selector to click' },
          getContent: { type: 'boolean', description: 'Return page content' }
        },
        required: ['url']
      }
    }
  }
};

/**
 * Get OpenAI-format tool schemas for enabled tools
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
  return Object.keys(TOOL_PROMPTS);
}

