/**
 * MCP Server for Tooly
 * Provides tool execution capabilities via Model Context Protocol
 * 
 * Tools: ~70 total
 * 
 * FILE OPERATIONS (13):
 *   read_file, read_multiple_files, write_file, edit_file, delete_file, copy_file,
 *   move_file, get_file_info, list_directory, search_files, create_directory,
 *   delete_directory, list_allowed_directories
 * 
 * GIT OPERATIONS (17):
 *   git_status, git_diff, git_log, git_init, git_add, git_commit, git_push, git_pull,
 *   git_checkout, git_stash, git_stash_pop, git_reset, git_clone, git_branch_create,
 *   git_branch_list, git_blame, git_show
 * 
 * NPM OPERATIONS (7):
 *   npm_run, npm_install, npm_uninstall, npm_init, npm_test, npm_build, npm_list
 * 
 * HTTP/SEARCH (2):
 *   http_request, web_search
 * 
 * BROWSER - Playwright MCP-compatible (17):
 *   browser_navigate, browser_go_back, browser_go_forward, browser_click, browser_type,
 *   browser_hover, browser_select_option, browser_press_key, browser_snapshot,
 *   browser_take_screenshot, browser_wait, browser_resize, browser_handle_dialog,
 *   browser_drag, browser_tabs, browser_evaluate, browser_console_messages, browser_network_requests
 * 
 * CODE EXECUTION (4):
 *   shell_exec, run_python, run_node, run_typescript
 * 
 * MEMORY (4):
 *   memory_store, memory_retrieve, memory_list, memory_delete
 * 
 * TEXT (2):
 *   text_summarize, diff_files
 * 
 * PROCESS (2):
 *   process_list, process_kill
 * 
 * ARCHIVE (2):
 *   zip_create, zip_extract
 * 
 * UTILITY (6):
 *   mcp_rules, env_get, env_set, json_parse, base64_encode, base64_decode
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { chromium, Browser, Page, BrowserContext } from "playwright";
import { execSync } from "child_process";

// ============================================================
// CONFIGURATION
// ============================================================

const projectRoot = process.cwd();

// Session environment variables (not persisted)
const sessionEnv: Record<string, string> = {};

// ============================================================
// BROWSER STATE (Persistent like @playwright/mcp)
// ============================================================

interface BrowserState {
  browser: Browser | null;
  context: BrowserContext | null;
  pages: Page[];
  currentPageIndex: number;
  consoleMessages: Array<{ type: string; text: string; timestamp: string }>;
  networkRequests: Array<{ method: string; url: string; status?: number; timestamp: string }>;
}

const browserState: BrowserState = {
  browser: null,
  context: null,
  pages: [],
  currentPageIndex: 0,
  consoleMessages: [],
  networkRequests: []
};

async function ensureBrowser(): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
  if (!browserState.browser) {
    browserState.browser = await chromium.launch({ headless: true });
    browserState.context = await browserState.browser.newContext();
    const page = await browserState.context.newPage();
    
    // Setup console and network listeners
    page.on('console', msg => {
      browserState.consoleMessages.push({
        type: msg.type(),
        text: msg.text(),
        timestamp: new Date().toISOString()
      });
      // Keep only last 100 messages
      if (browserState.consoleMessages.length > 100) {
        browserState.consoleMessages.shift();
      }
    });
    
    page.on('request', req => {
      browserState.networkRequests.push({
        method: req.method(),
        url: req.url(),
        timestamp: new Date().toISOString()
      });
    });
    
    page.on('response', res => {
      const req = browserState.networkRequests.find(r => r.url === res.url() && !r.status);
      if (req) req.status = res.status();
    });
    
    browserState.pages = [page];
    browserState.currentPageIndex = 0;
  }
  
  return {
    browser: browserState.browser,
    context: browserState.context!,
    page: browserState.pages[browserState.currentPageIndex]
  };
}

function getCurrentPage(): Page | null {
  return browserState.pages[browserState.currentPageIndex] || null;
}

// Cleanup on exit
process.on('exit', async () => {
  if (browserState.browser) {
    await browserState.browser.close();
  }
});

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function isPathInProject(filePath: string): boolean {
  const resolved = path.resolve(filePath);
  return resolved.startsWith(projectRoot);
}

function resolvePath(filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
}

// ============================================================
// MCP RULES
// ============================================================

const mcpRules = {
  tool_use_policy: "prefer_tools",
  security: "only operate on files within the project directory",
  browser_tools: {
    browser_navigate: "navigate to a URL",
    browser_go_back: "go back in history",
    browser_go_forward: "go forward in history",
    browser_click: "click an element",
    browser_type: "type text into an element",
    browser_hover: "hover over an element",
    browser_select_option: "select dropdown option",
    browser_press_key: "press a keyboard key",
    browser_snapshot: "get accessibility snapshot",
    browser_take_screenshot: "capture screenshot",
    browser_wait: "wait for condition",
    browser_resize: "resize browser window",
    browser_handle_dialog: "handle alert/confirm/prompt",
    browser_drag: "drag and drop",
    browser_tabs: "manage browser tabs",
    browser_evaluate: "execute JavaScript",
    browser_console_messages: "get console logs",
    browser_network_requests: "get network requests"
  },
  file_tools: {
    file_read: "read file contents",
    file_write: "write or create files",
    file_patch: "modify specific content",
    file_delete: "delete a file",
    file_copy: "copy a file",
    file_move: "move or rename a file",
    file_info: "get file metadata",
    file_list: "list directory contents",
    file_search: "search for text in files",
    folder_create: "create directories",
    folder_delete: "delete directories"
  }
};

// ============================================================
// TOOL RESULT HELPERS
// ============================================================

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function errorResult(message: string) {
  return { content: [{ type: "text" as const, text: `Error: ${message}` }] };
}

// ============================================================
// MCP SERVER SETUP
// ============================================================

const server = new McpServer({ name: "summy-mcp-server", version: "2.1.0" });

// ============================================================
// UTILITY TOOLS
// ============================================================

server.registerTool("mcp_rules", { description: "Get tool policies and rules" }, async () => 
  textResult(JSON.stringify(mcpRules, null, 2))
);

server.registerTool("env_get", {
  description: "Get an environment variable value",
  inputSchema: { name: z.string().describe("Environment variable name") }
}, async ({ name }: { name: string }) => {
  console.log(`[MCP] env_get: ${name}`);
  const value = sessionEnv[name] || process.env[name];
  return value ? textResult(value) : errorResult(`Environment variable "${name}" not found`);
});

server.registerTool("env_set", {
  description: "Set a session environment variable (not persisted)",
  inputSchema: {
    name: z.string().describe("Environment variable name"),
    value: z.string().describe("Value to set")
  }
}, async ({ name, value }: { name: string; value: string }) => {
  console.log(`[MCP] env_set: ${name}=${value}`);
  sessionEnv[name] = value;
  return textResult(`Set ${name}=${value} (session only)`);
});

server.registerTool("json_parse", {
  description: "Parse JSON and optionally extract a value using dot notation",
  inputSchema: {
    json: z.string().describe("JSON string to parse"),
    path: z.string().optional().describe("Dot notation path to extract")
  }
}, async ({ json, path: jsonPath }: { json: string; path?: string }) => {
  console.log(`[MCP] json_parse: path=${jsonPath || 'root'}`);
  try {
    let parsed = JSON.parse(json);
    if (jsonPath) {
      const parts = jsonPath.replace(/\[(\d+)\]/g, '.$1').split('.');
      for (const part of parts) {
        if (parsed === undefined || parsed === null) break;
        parsed = parsed[part];
      }
    }
    return textResult(JSON.stringify(parsed, null, 2));
  } catch (err: any) {
    return errorResult(`JSON parse failed: ${err.message}`);
  }
});

server.registerTool("base64_encode", {
  description: "Encode text to base64",
  inputSchema: { text: z.string().describe("Text to encode") }
}, async ({ text }: { text: string }) => {
  return textResult(Buffer.from(text).toString('base64'));
});

server.registerTool("base64_decode", {
  description: "Decode base64 to text",
  inputSchema: { encoded: z.string().describe("Base64 string to decode") }
}, async ({ encoded }: { encoded: string }) => {
  try {
    return textResult(Buffer.from(encoded, 'base64').toString('utf-8'));
  } catch (err: any) {
    return errorResult(`Base64 decode failed: ${err.message}`);
  }
});

// ============================================================
// FILE OPERATIONS (Official MCP Filesystem Server compatible)
// ============================================================

// --- read_file (official MCP name) ---
server.registerTool("read_file", {
  description: "Read the complete contents of a file from the file system",
  inputSchema: { path: z.string().describe("Path to the file to read") }
}, async ({ path: filePath }: { path: string }) => {
  console.log(`[MCP] read_file: ${filePath}`);
  const fullPath = resolvePath(filePath);
  if (!isPathInProject(fullPath)) return errorResult("Access denied: Path outside allowed directories");
  try {
    return textResult(fs.readFileSync(fullPath, "utf-8"));
  } catch (err: any) {
    return errorResult(`Failed to read file: ${err.message}`);
  }
});

// --- read_multiple_files (official MCP) ---
server.registerTool("read_multiple_files", {
  description: "Read the contents of multiple files simultaneously",
  inputSchema: { 
    paths: z.array(z.string()).describe("Array of file paths to read") 
  }
}, async ({ paths }: { paths: string[] }) => {
  console.log(`[MCP] read_multiple_files: ${paths.length} files`);
  const results: Array<{ path: string; content?: string; error?: string }> = [];
  
  for (const filePath of paths) {
    const fullPath = resolvePath(filePath);
    if (!isPathInProject(fullPath)) {
      results.push({ path: filePath, error: "Access denied: Path outside allowed directories" });
      continue;
    }
    try {
      const content = fs.readFileSync(fullPath, "utf-8");
      results.push({ path: filePath, content });
    } catch (err: any) {
      results.push({ path: filePath, error: err.message });
    }
  }
  
  return textResult(JSON.stringify(results, null, 2));
});

// --- write_file (official MCP name) ---
server.registerTool("write_file", {
  description: "Create a new file or completely overwrite an existing file with new content",
  inputSchema: {
    path: z.string().describe("Path where the file will be created or overwritten"),
    content: z.string().describe("Content to write to the file")
  }
}, async ({ path: filePath, content }: { path: string; content: string }) => {
  console.log(`[MCP] write_file: ${filePath}`);
  const fullPath = resolvePath(filePath);
  if (!isPathInProject(fullPath)) return errorResult("Access denied: Path outside allowed directories");
  try {
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(fullPath, content, "utf-8");
    return textResult(`Successfully wrote to ${filePath}`);
  } catch (err: any) {
    return errorResult(`Failed to write file: ${err.message}`);
  }
});

// --- edit_file (official MCP name, replaces file_patch) ---
server.registerTool("edit_file", {
  description: "Make selective edits to a file using advanced pattern matching and formatting",
  inputSchema: {
    path: z.string().describe("Path to the file to edit"),
    edits: z.array(z.object({
      oldText: z.string().describe("Text to search for (must match exactly)"),
      newText: z.string().describe("Text to replace with")
    })).describe("Array of edit operations to perform"),
    dryRun: z.boolean().optional().describe("If true, show changes without applying them")
  }
}, async ({ path: filePath, edits, dryRun = false }: { 
  path: string; 
  edits: Array<{ oldText: string; newText: string }>; 
  dryRun?: boolean 
}) => {
  console.log(`[MCP] edit_file: ${filePath} (${edits.length} edits, dryRun: ${dryRun})`);
  const fullPath = resolvePath(filePath);
  if (!isPathInProject(fullPath)) return errorResult("Access denied: Path outside allowed directories");
  if (!fs.existsSync(fullPath)) return errorResult(`File not found: ${filePath}`);
  
  try {
    let content = fs.readFileSync(fullPath, "utf-8");
    const changes: string[] = [];
    
    for (const edit of edits) {
      if (!content.includes(edit.oldText)) {
        return errorResult(`Text not found: "${edit.oldText.slice(0, 50)}..."`);
      }
      content = content.replace(edit.oldText, edit.newText);
      changes.push(`Replaced: "${edit.oldText.slice(0, 30)}..." → "${edit.newText.slice(0, 30)}..."`);
    }
    
    if (dryRun) {
      return textResult(`Dry run - changes that would be made:\n${changes.join('\n')}`);
    }
    
    fs.writeFileSync(fullPath, content, "utf-8");
    return textResult(`Successfully edited ${filePath}\n${changes.join('\n')}`);
  } catch (err: any) {
    return errorResult(`Edit failed: ${err.message}`);
  }
});

// --- delete_file (keeping for completeness) ---
server.registerTool("delete_file", {
  description: "Delete a file from the file system",
  inputSchema: { path: z.string().describe("Path to the file to delete") }
}, async ({ path: filePath }: { path: string }) => {
  console.log(`[MCP] delete_file: ${filePath}`);
  const fullPath = resolvePath(filePath);
  if (!isPathInProject(fullPath)) return errorResult("Access denied: Path outside allowed directories");
  try {
    fs.unlinkSync(fullPath);
    return textResult(`Successfully deleted ${filePath}`);
  } catch (err: any) {
    return errorResult(`Failed to delete file: ${err.message}`);
  }
});

// --- copy_file (keeping for completeness) ---
server.registerTool("copy_file", {
  description: "Copy a file to a new location",
  inputSchema: {
    source: z.string().describe("Source file path"),
    destination: z.string().describe("Destination file path")
  }
}, async ({ source, destination }: { source: string; destination: string }) => {
  console.log(`[MCP] copy_file: ${source} -> ${destination}`);
  const srcPath = resolvePath(source);
  const destPath = resolvePath(destination);
  if (!isPathInProject(srcPath) || !isPathInProject(destPath)) {
    return errorResult("Access denied: Path outside allowed directories");
  }
  try {
    const destDir = path.dirname(destPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    fs.copyFileSync(srcPath, destPath);
    return textResult(`Successfully copied ${source} to ${destination}`);
  } catch (err: any) {
    return errorResult(`Copy failed: ${err.message}`);
  }
});

// --- move_file (official MCP name) ---
server.registerTool("move_file", {
  description: "Move or rename a file or directory",
  inputSchema: {
    sourcePath: z.string().describe("Current path of the file or directory"),
    destinationPath: z.string().describe("New path for the file or directory")
  }
}, async ({ sourcePath, destinationPath }: { sourcePath: string; destinationPath: string }) => {
  console.log(`[MCP] move_file: ${sourcePath} -> ${destinationPath}`);
  const srcPath = resolvePath(sourcePath);
  const destPath = resolvePath(destinationPath);
  if (!isPathInProject(srcPath) || !isPathInProject(destPath)) {
    return errorResult("Access denied: Path outside allowed directories");
  }
  try {
    const destDir = path.dirname(destPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    fs.renameSync(srcPath, destPath);
    return textResult(`Successfully moved ${sourcePath} to ${destinationPath}`);
  } catch (err: any) {
    return errorResult(`Move failed: ${err.message}`);
  }
});

// --- get_file_info (official MCP name) ---
server.registerTool("get_file_info", {
  description: "Retrieve detailed metadata about a file or directory",
  inputSchema: { path: z.string().describe("Path to the file or directory") }
}, async ({ path: filePath }: { path: string }) => {
  console.log(`[MCP] get_file_info: ${filePath}`);
  const fullPath = resolvePath(filePath);
  if (!isPathInProject(fullPath)) return errorResult("Access denied: Path outside allowed directories");
  try {
    const stats = fs.statSync(fullPath);
    const info = {
      path: filePath,
      size: stats.size,
      created: stats.birthtime.toISOString(),
      modified: stats.mtime.toISOString(),
      accessed: stats.atime.toISOString(),
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
      isSymbolicLink: stats.isSymbolicLink(),
      permissions: stats.mode.toString(8)
    };
    return textResult(JSON.stringify(info, null, 2));
  } catch (err: any) {
    return errorResult(`Failed to get file info: ${err.message}`);
  }
});

// --- list_directory (official MCP name) ---
server.registerTool("list_directory", {
  description: "Get a detailed listing of files and directories in a specified path",
  inputSchema: { 
    path: z.string().describe("Path to the directory to list")
  }
}, async ({ path: dirPath }: { path: string }) => {
  console.log(`[MCP] list_directory: ${dirPath}`);
  const fullPath = resolvePath(dirPath);
  if (!isPathInProject(fullPath)) return errorResult("Access denied: Path outside allowed directories");
  try {
    const entries = fs.readdirSync(fullPath, { withFileTypes: true });
    const result = entries.map(entry => ({
      name: entry.name,
      type: entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other'
    }));
    return textResult(JSON.stringify(result, null, 2));
  } catch (err: any) {
    return errorResult(`Failed to list directory: ${err.message}`);
  }
});

// --- search_files (official MCP name) ---
server.registerTool("search_files", {
  description: "Recursively search for files and directories matching a pattern",
  inputSchema: {
    directory: z.string().describe("Starting directory for the search"),
    pattern: z.string().describe("Search pattern (glob pattern like *.ts or regex)")
  }
}, async ({ directory, pattern }: { directory: string; pattern: string }) => {
  console.log(`[MCP] search_files: ${pattern} in ${directory}`);
  const fullPath = resolvePath(directory);
  if (!isPathInProject(fullPath)) return errorResult("Access denied: Path outside allowed directories");
  
  try {
    const matches: string[] = [];
    const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'));
    
    const searchDir = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const entryPath = path.join(dir, entry.name);
        const relativePath = path.relative(fullPath, entryPath);
        
        if (regex.test(entry.name) || regex.test(relativePath)) {
          matches.push(relativePath);
        }
        
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          searchDir(entryPath);
        }
      }
    };
    
    searchDir(fullPath);
    return textResult(matches.length > 0 ? matches.join('\n') : 'No matches found');
  } catch (err: any) {
    return errorResult(`Search failed: ${err.message}`);
  }
});

// --- create_directory (official MCP name) ---
server.registerTool("create_directory", {
  description: "Create a new directory or ensure a directory exists",
  inputSchema: { path: z.string().describe("Path of the directory to create") }
}, async ({ path: dirPath }: { path: string }) => {
  console.log(`[MCP] create_directory: ${dirPath}`);
  const fullPath = resolvePath(dirPath);
  if (!isPathInProject(fullPath)) return errorResult("Access denied: Path outside allowed directories");
  try {
    fs.mkdirSync(fullPath, { recursive: true });
    return textResult(`Successfully created directory ${dirPath}`);
  } catch (err: any) {
    return errorResult(`Failed to create directory: ${err.message}`);
  }
});

// --- delete_directory (keeping for completeness) ---
server.registerTool("delete_directory", {
  description: "Delete a directory and all its contents",
  inputSchema: { path: z.string().describe("Path of the directory to delete") }
}, async ({ path: dirPath }: { path: string }) => {
  console.log(`[MCP] delete_directory: ${dirPath}`);
  const fullPath = resolvePath(dirPath);
  if (!isPathInProject(fullPath)) return errorResult("Access denied: Path outside allowed directories");
  try {
    fs.rmSync(fullPath, { recursive: true });
    return textResult(`Successfully deleted directory ${dirPath}`);
  } catch (err: any) {
    return errorResult(`Failed to delete directory: ${err.message}`);
  }
});

// --- list_allowed_directories (official MCP) ---
server.registerTool("list_allowed_directories", {
  description: "List all directories that this server is allowed to access"
}, async () => {
  console.log(`[MCP] list_allowed_directories`);
  return textResult(JSON.stringify([projectRoot], null, 2));
});

// ============================================================
// GIT OPERATIONS
// ============================================================

server.registerTool("git_status", { description: "Get git repository status" }, async () => {
  console.log(`[MCP] git_status`);
  try {
    return textResult(execSync("git status", { encoding: 'utf-8' }));
  } catch (err: any) {
    return errorResult(`Git status failed: ${err.message}`);
  }
});

server.registerTool("git_diff", {
  description: "Show git differences",
  inputSchema: { 
    file: z.string().optional().describe("Specific file to diff"),
    staged: z.boolean().optional().describe("Show staged changes only")
  }
}, async ({ file, staged = false }: { file?: string; staged?: boolean }) => {
  console.log(`[MCP] git_diff: ${file || 'all'} (staged: ${staged})`);
  try {
    const stagedFlag = staged ? "--staged" : "";
    const output = execSync(`git diff ${stagedFlag} ${file || ""}`, { encoding: 'utf-8' });
    return textResult(output || "No differences found.");
  } catch (err: any) {
    return errorResult(`Git diff failed: ${err.message}`);
  }
});

server.registerTool("git_log", {
  description: "Show git commit history",
  inputSchema: { 
    count: z.number().optional().describe("Number of commits to show"),
    format: z.enum(["oneline", "short", "full", "graph"]).optional().describe("Output format")
  }
}, async ({ count = 10, format = "oneline" }: { count?: number; format?: string }) => {
  console.log(`[MCP] git_log: ${count} commits, format: ${format}`);
  try {
    let cmd = `git log -n ${count}`;
    switch (format) {
      case "oneline": cmd += " --oneline"; break;
      case "short": cmd += " --format=short"; break;
      case "full": cmd += " --format=full"; break;
      case "graph": cmd += " --oneline --graph --all"; break;
    }
    return textResult(execSync(cmd, { encoding: 'utf-8' }));
  } catch (err: any) {
    return errorResult(`Git log failed: ${err.message}`);
  }
});

server.registerTool("git_init", { description: "Initialize a git repository" }, async () => {
  console.log(`[MCP] git_init`);
  try {
    return textResult(execSync("git init", { encoding: 'utf-8' }));
  } catch (err: any) {
    return errorResult(`Git init failed: ${err.message}`);
  }
});

server.registerTool("git_add", {
  description: "Stage files for commit",
  inputSchema: { file: z.string().optional().describe("File to stage (default: all)") }
}, async ({ file = "." }: { file?: string }) => {
  console.log(`[MCP] git_add: ${file}`);
  try {
    const output = execSync(`git add "${file}"`, { encoding: 'utf-8' });
    return textResult(output || `Staged: ${file}`);
  } catch (err: any) {
    return errorResult(`Git add failed: ${err.message}`);
  }
});

server.registerTool("git_commit", {
  description: "Commit staged changes",
  inputSchema: { message: z.string().describe("Commit message") }
}, async ({ message }: { message: string }) => {
  console.log(`[MCP] git_commit: ${message}`);
  try {
    return textResult(execSync(`git commit -m "${message}"`, { encoding: 'utf-8' }));
  } catch (err: any) {
    return errorResult(`Git commit failed: ${err.message}`);
  }
});

server.registerTool("git_push", {
  description: "Push commits to remote",
  inputSchema: { 
    remote: z.string().optional().describe("Remote name (default: origin)"),
    branch: z.string().optional().describe("Branch name"),
    force: z.boolean().optional().describe("Force push")
  }
}, async ({ remote = "origin", branch, force = false }: { remote?: string; branch?: string; force?: boolean }) => {
  console.log(`[MCP] git_push: ${remote} ${branch || ''}`);
  try {
    const forceFlag = force ? "--force" : "";
    const branchArg = branch || "";
    const output = execSync(`git push ${forceFlag} ${remote} ${branchArg}`, { encoding: 'utf-8' });
    return textResult(output || "Push successful");
  } catch (err: any) {
    return errorResult(`Git push failed: ${err.message}`);
  }
});

server.registerTool("git_pull", {
  description: "Pull changes from remote",
  inputSchema: { 
    remote: z.string().optional().describe("Remote name (default: origin)"),
    branch: z.string().optional().describe("Branch name")
  }
}, async ({ remote = "origin", branch }: { remote?: string; branch?: string }) => {
  console.log(`[MCP] git_pull: ${remote} ${branch || ''}`);
  try {
    const branchArg = branch || "";
    const output = execSync(`git pull ${remote} ${branchArg}`, { encoding: 'utf-8' });
    return textResult(output || "Pull successful");
  } catch (err: any) {
    return errorResult(`Git pull failed: ${err.message}`);
  }
});

server.registerTool("git_checkout", {
  description: "Switch branches or restore files",
  inputSchema: { 
    target: z.string().describe("Branch name or file path"),
    create: z.boolean().optional().describe("Create new branch")
  }
}, async ({ target, create = false }: { target: string; create?: boolean }) => {
  console.log(`[MCP] git_checkout: ${target} (create: ${create})`);
  try {
    const createFlag = create ? "-b" : "";
    const output = execSync(`git checkout ${createFlag} "${target}"`, { encoding: 'utf-8' });
    return textResult(output || `Switched to ${target}`);
  } catch (err: any) {
    return errorResult(`Git checkout failed: ${err.message}`);
  }
});

server.registerTool("git_stash", {
  description: "Stash current changes",
  inputSchema: { message: z.string().optional().describe("Stash message") }
}, async ({ message }: { message?: string }) => {
  console.log(`[MCP] git_stash: ${message || 'no message'}`);
  try {
    const msgArg = message ? `-m "${message}"` : "";
    const output = execSync(`git stash ${msgArg}`, { encoding: 'utf-8' });
    return textResult(output || "Changes stashed");
  } catch (err: any) {
    return errorResult(`Git stash failed: ${err.message}`);
  }
});

server.registerTool("git_stash_pop", { description: "Apply and remove the latest stash" }, async () => {
  console.log(`[MCP] git_stash_pop`);
  try {
    return textResult(execSync("git stash pop", { encoding: 'utf-8' }));
  } catch (err: any) {
    return errorResult(`Git stash pop failed: ${err.message}`);
  }
});

server.registerTool("git_reset", {
  description: "Reset current HEAD to a specified state",
  inputSchema: { 
    target: z.string().optional().describe("Commit hash (default: HEAD)"),
    mode: z.enum(["soft", "mixed", "hard"]).optional().describe("Reset mode")
  }
}, async ({ target = "HEAD", mode = "mixed" }: { target?: string; mode?: string }) => {
  console.log(`[MCP] git_reset: ${mode} ${target}`);
  try {
    return textResult(execSync(`git reset --${mode} ${target}`, { encoding: 'utf-8' }));
  } catch (err: any) {
    return errorResult(`Git reset failed: ${err.message}`);
  }
});

server.registerTool("git_clone", {
  description: "Clone a repository",
  inputSchema: { 
    url: z.string().describe("Repository URL"),
    directory: z.string().optional().describe("Target directory")
  }
}, async ({ url, directory }: { url: string; directory?: string }) => {
  console.log(`[MCP] git_clone: ${url}`);
  try {
    const dirArg = directory ? `"${directory}"` : "";
    return textResult(execSync(`git clone "${url}" ${dirArg}`, { encoding: 'utf-8' }));
  } catch (err: any) {
    return errorResult(`Git clone failed: ${err.message}`);
  }
});

server.registerTool("git_branch_create", {
  description: "Create and switch to a new branch",
  inputSchema: { name: z.string().describe("Branch name") }
}, async ({ name }: { name: string }) => {
  console.log(`[MCP] git_branch_create: ${name}`);
  try {
    return textResult(execSync(`git checkout -b "${name}"`, { encoding: 'utf-8' }));
  } catch (err: any) {
    return errorResult(`Git branch create failed: ${err.message}`);
  }
});

server.registerTool("git_branch_list", {
  description: "List all branches",
  inputSchema: { all: z.boolean().optional().describe("Include remote branches") }
}, async ({ all = false }: { all?: boolean }) => {
  console.log(`[MCP] git_branch_list (all: ${all})`);
  try {
    return textResult(execSync(`git branch ${all ? "-a" : ""}`, { encoding: 'utf-8' }));
  } catch (err: any) {
    return errorResult(`Git branch list failed: ${err.message}`);
  }
});

server.registerTool("git_blame", {
  description: "Show what revision and author last modified each line of a file",
  inputSchema: { 
    file: z.string().describe("File to blame"),
    startLine: z.number().optional().describe("Start line number"),
    endLine: z.number().optional().describe("End line number")
  }
}, async ({ file, startLine, endLine }: { file: string; startLine?: number; endLine?: number }) => {
  console.log(`[MCP] git_blame: ${file}`);
  try {
    let cmd = `git blame "${file}"`;
    if (startLine && endLine) {
      cmd = `git blame -L ${startLine},${endLine} "${file}"`;
    }
    return textResult(execSync(cmd, { encoding: 'utf-8' }));
  } catch (err: any) {
    return errorResult(`Git blame failed: ${err.message}`);
  }
});

server.registerTool("git_show", {
  description: "Show details of a commit",
  inputSchema: { 
    ref: z.string().optional().describe("Commit hash, tag, or branch (default: HEAD)"),
    stat: z.boolean().optional().describe("Show diffstat only")
  }
}, async ({ ref = "HEAD", stat = false }: { ref?: string; stat?: boolean }) => {
  console.log(`[MCP] git_show: ${ref}`);
  try {
    const statFlag = stat ? "--stat" : "";
    return textResult(execSync(`git show ${statFlag} ${ref}`, { encoding: 'utf-8' }));
  } catch (err: any) {
    return errorResult(`Git show failed: ${err.message}`);
  }
});

// ============================================================
// NPM OPERATIONS
// ============================================================

server.registerTool("npm_run", {
  description: "Run an npm script",
  inputSchema: { script: z.string().describe("Script name to run") }
}, async ({ script }: { script: string }) => {
  console.log(`[MCP] npm_run: ${script}`);
  try {
    return textResult(execSync(`npm run ${script}`, { encoding: 'utf-8', timeout: 60000 }));
  } catch (err: any) {
    return errorResult(`npm run failed: ${err.message}`);
  }
});

server.registerTool("npm_install", {
  description: "Install npm packages",
  inputSchema: { 
    package: z.string().optional().describe("Package name"),
    dev: z.boolean().optional().describe("Install as dev dependency")
  }
}, async ({ package: pkg, dev = false }: { package?: string; dev?: boolean }) => {
  console.log(`[MCP] npm_install: ${pkg || 'all'}`);
  try {
    const devFlag = dev ? "--save-dev" : "";
    return textResult(execSync(`npm install ${devFlag} ${pkg || ""}`, { encoding: 'utf-8', timeout: 120000 }));
  } catch (err: any) {
    return errorResult(`npm install failed: ${err.message}`);
  }
});

server.registerTool("npm_uninstall", {
  description: "Uninstall an npm package",
  inputSchema: { package: z.string().describe("Package name") }
}, async ({ package: pkg }: { package: string }) => {
  console.log(`[MCP] npm_uninstall: ${pkg}`);
  try {
    return textResult(execSync(`npm uninstall ${pkg}`, { encoding: 'utf-8' }));
  } catch (err: any) {
    return errorResult(`npm uninstall failed: ${err.message}`);
  }
});

server.registerTool("npm_init", {
  description: "Initialize a new package.json",
  inputSchema: { yes: z.boolean().optional().describe("Use default values") }
}, async ({ yes = true }: { yes?: boolean }) => {
  console.log(`[MCP] npm_init`);
  try {
    return textResult(execSync(`npm init ${yes ? "-y" : ""}`, { encoding: 'utf-8' }));
  } catch (err: any) {
    return errorResult(`npm init failed: ${err.message}`);
  }
});

server.registerTool("npm_test", { description: "Run npm test" }, async () => {
  console.log(`[MCP] npm_test`);
  try {
    return textResult(execSync("npm test", { encoding: 'utf-8', timeout: 120000 }));
  } catch (err: any) {
    return errorResult(`npm test failed: ${err.message}`);
  }
});

server.registerTool("npm_build", { description: "Run npm build" }, async () => {
  console.log(`[MCP] npm_build`);
  try {
    return textResult(execSync("npm run build", { encoding: 'utf-8', timeout: 120000 }));
  } catch (err: any) {
    return errorResult(`npm build failed: ${err.message}`);
  }
});

server.registerTool("npm_list", {
  description: "List installed packages",
  inputSchema: { depth: z.number().optional().describe("Dependency depth") }
}, async ({ depth = 0 }: { depth?: number }) => {
  console.log(`[MCP] npm_list (depth: ${depth})`);
  try {
    return textResult(execSync(`npm list --depth=${depth}`, { encoding: 'utf-8' }));
  } catch (err: any) {
    return textResult(err.stdout || err.message);
  }
});

// ============================================================
// HTTP OPERATIONS
// ============================================================

server.registerTool("http_request", {
  description: "Make an HTTP request",
  inputSchema: {
    url: z.string().describe("URL to request"),
    method: z.string().optional().describe("HTTP method (default: GET)"),
    headers: z.record(z.string()).optional().describe("Request headers"),
    body: z.string().optional().describe("Request body"),
    timeout: z.number().optional().describe("Timeout in milliseconds")
  }
}, async ({ url, method = "GET", headers = {}, body, timeout = 30000 }: { 
  url: string; method?: string; headers?: Record<string, string>; body?: string; timeout?: number 
}) => {
  console.log(`[MCP] http_request: ${method} ${url}`);
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const requestHeaders: Record<string, string> = { ...headers };
    if (body && !requestHeaders['Content-Type']) {
      requestHeaders['Content-Type'] = 'application/json';
    }
    
    const res = await fetch(url, {
      method,
      headers: requestHeaders,
      body: body || undefined,
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    const responseText = await res.text();
    
    return textResult(JSON.stringify({
      status: res.status,
      statusText: res.statusText,
      headers: Object.fromEntries(res.headers.entries()),
      body: responseText.slice(0, 10000)
    }, null, 2));
  } catch (err: any) {
    return errorResult(`HTTP request failed: ${err.message}`);
  }
});

// --- url_fetch_content ---
server.registerTool("url_fetch_content", {
  description: "Fetch the content of a URL and return readable text. For simple pages, uses HTTP fetch. For JS-heavy pages, use browser tools instead.",
  inputSchema: {
    url: z.string().describe("URL to fetch content from"),
    extractText: z.boolean().optional().describe("Extract readable text from HTML (default: true)")
  }
}, async ({ url, extractText = true }: { url: string; extractText?: boolean }) => {
  console.log(`[MCP] url_fetch_content: ${url}`);
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!res.ok) {
      return errorResult(`HTTP ${res.status}: ${res.statusText}`);
    }
    
    const contentType = res.headers.get('content-type') || '';
    const body = await res.text();
    
    // For HTML content, optionally extract readable text
    if (extractText && contentType.includes('text/html')) {
      // Simple HTML to text conversion (strip tags, decode entities)
      let text = body
        // Remove script and style blocks
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        // Remove HTML comments
        .replace(/<!--[\s\S]*?-->/g, '')
        // Remove tags
        .replace(/<[^>]+>/g, ' ')
        // Decode common HTML entities
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        // Collapse whitespace
        .replace(/\s+/g, ' ')
        .trim();
      
      // Limit output size
      if (text.length > 15000) {
        text = text.slice(0, 15000) + '\n\n[Content truncated...]';
      }
      
      return textResult(text);
    }
    
    // For non-HTML or if extractText is false, return raw body (limited)
    const result = body.length > 15000 ? body.slice(0, 15000) + '\n\n[Content truncated...]' : body;
    return textResult(result);
  } catch (err: any) {
    return errorResult(`Failed to fetch URL: ${err.message}`);
  }
});

// ============================================================
// BROWSER OPERATIONS (Playwright MCP-compatible)
// ============================================================

// --- browser_navigate ---
server.registerTool("browser_navigate", {
  description: "Navigate to a URL in the browser",
  inputSchema: { url: z.string().describe("URL to navigate to") }
}, async ({ url }: { url: string }) => {
  console.log(`[MCP] browser_navigate: ${url}`);
  try {
    const { page } = await ensureBrowser();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    return textResult(`Navigated to: ${page.url()}\nTitle: ${await page.title()}`);
  } catch (err: any) {
    return errorResult(`Navigation failed: ${err.message}`);
  }
});

// --- browser_go_back ---
server.registerTool("browser_go_back", { description: "Go back in browser history" }, async () => {
  console.log(`[MCP] browser_go_back`);
  try {
    const page = getCurrentPage();
    if (!page) return errorResult("No browser page open");
    await page.goBack();
    return textResult(`Went back to: ${page.url()}`);
  } catch (err: any) {
    return errorResult(`Go back failed: ${err.message}`);
  }
});

// --- browser_go_forward ---
server.registerTool("browser_go_forward", { description: "Go forward in browser history" }, async () => {
  console.log(`[MCP] browser_go_forward`);
  try {
    const page = getCurrentPage();
    if (!page) return errorResult("No browser page open");
    await page.goForward();
    return textResult(`Went forward to: ${page.url()}`);
  } catch (err: any) {
    return errorResult(`Go forward failed: ${err.message}`);
  }
});

// --- browser_click ---
server.registerTool("browser_click", {
  description: "Click an element on the page",
  inputSchema: {
    selector: z.string().describe("CSS selector or text to click"),
    button: z.enum(["left", "right", "middle"]).optional().describe("Mouse button"),
    clickCount: z.number().optional().describe("Number of clicks (1 or 2)")
  }
}, async ({ selector, button = "left", clickCount = 1 }: { selector: string; button?: "left" | "right" | "middle"; clickCount?: number }) => {
  console.log(`[MCP] browser_click: ${selector}`);
  try {
    const page = getCurrentPage();
    if (!page) return errorResult("No browser page open");
    await page.click(selector, { button, clickCount, timeout: 10000 });
    return textResult(`Clicked: ${selector}`);
  } catch (err: any) {
    return errorResult(`Click failed: ${err.message}`);
  }
});

// --- browser_type ---
server.registerTool("browser_type", {
  description: "Type text into an editable element",
  inputSchema: {
    selector: z.string().describe("CSS selector of the input element"),
    text: z.string().describe("Text to type"),
    clear: z.boolean().optional().describe("Clear existing text first"),
    submit: z.boolean().optional().describe("Press Enter after typing")
  }
}, async ({ selector, text, clear = false, submit = false }: { selector: string; text: string; clear?: boolean; submit?: boolean }) => {
  console.log(`[MCP] browser_type: ${selector}`);
  try {
    const page = getCurrentPage();
    if (!page) return errorResult("No browser page open");
    if (clear) {
      await page.fill(selector, "");
    }
    await page.fill(selector, text);
    if (submit) {
      await page.press(selector, "Enter");
    }
    return textResult(`Typed into: ${selector}`);
  } catch (err: any) {
    return errorResult(`Type failed: ${err.message}`);
  }
});

// --- browser_hover ---
server.registerTool("browser_hover", {
  description: "Hover over an element",
  inputSchema: { selector: z.string().describe("CSS selector to hover over") }
}, async ({ selector }: { selector: string }) => {
  console.log(`[MCP] browser_hover: ${selector}`);
  try {
    const page = getCurrentPage();
    if (!page) return errorResult("No browser page open");
    await page.hover(selector, { timeout: 10000 });
    return textResult(`Hovered over: ${selector}`);
  } catch (err: any) {
    return errorResult(`Hover failed: ${err.message}`);
  }
});

// --- browser_select_option ---
server.registerTool("browser_select_option", {
  description: "Select an option in a dropdown",
  inputSchema: {
    selector: z.string().describe("CSS selector of the select element"),
    value: z.string().describe("Value or label to select")
  }
}, async ({ selector, value }: { selector: string; value: string }) => {
  console.log(`[MCP] browser_select_option: ${selector} = ${value}`);
  try {
    const page = getCurrentPage();
    if (!page) return errorResult("No browser page open");
    await page.selectOption(selector, value);
    return textResult(`Selected "${value}" in: ${selector}`);
  } catch (err: any) {
    return errorResult(`Select option failed: ${err.message}`);
  }
});

// --- browser_press_key ---
server.registerTool("browser_press_key", {
  description: "Press a keyboard key",
  inputSchema: { key: z.string().describe("Key to press (e.g., 'Enter', 'Escape', 'ArrowDown')") }
}, async ({ key }: { key: string }) => {
  console.log(`[MCP] browser_press_key: ${key}`);
  try {
    const page = getCurrentPage();
    if (!page) return errorResult("No browser page open");
    await page.keyboard.press(key);
    return textResult(`Pressed key: ${key}`);
  } catch (err: any) {
    return errorResult(`Press key failed: ${err.message}`);
  }
});

// --- browser_snapshot ---
server.registerTool("browser_snapshot", {
  description: "Get accessibility snapshot of the current page (useful for understanding page structure)"
}, async () => {
  console.log(`[MCP] browser_snapshot`);
  try {
    const page = getCurrentPage();
    if (!page) return errorResult("No browser page open");
    
    const url = page.url();
    const title = await page.title();
    
    // Get page structure using aria snapshots
    const snapshot = await page.evaluate(() => {
      function getAccessibleTree(element: Element, depth = 0): any {
        if (depth > 10) return null; // Limit depth
        
        const role = element.getAttribute('role') || element.tagName.toLowerCase();
        const label = element.getAttribute('aria-label') || 
                     element.getAttribute('alt') || 
                     (element as HTMLElement).innerText?.slice(0, 100);
        
        const children: any[] = [];
        for (const child of element.children) {
          const childTree = getAccessibleTree(child, depth + 1);
          if (childTree) children.push(childTree);
        }
        
        return {
          role,
          name: label || undefined,
          children: children.length > 0 ? children : undefined
        };
      }
      
      return getAccessibleTree(document.body);
    });
    
    return textResult(JSON.stringify({
      url,
      title,
      snapshot
    }, null, 2));
  } catch (err: any) {
    return errorResult(`Snapshot failed: ${err.message}`);
  }
});

// --- browser_fetch_content ---
server.registerTool("browser_fetch_content", {
  description: "Navigate to a URL, handle cookie/consent popups, and return the page text content. Best for dynamic pages that require JavaScript or have consent gates.",
  inputSchema: {
    url: z.string().describe("URL to fetch content from"),
    waitTime: z.number().optional().describe("Time to wait for page load in ms (default: 2000)"),
    dismissPopups: z.boolean().optional().describe("Try to dismiss cookie/consent popups (default: true)")
  }
}, async ({ url, waitTime = 2000, dismissPopups = true }: { url: string; waitTime?: number; dismissPopups?: boolean }) => {
  console.log(`[MCP] browser_fetch_content: ${url}`);
  try {
    const { page } = await ensureBrowser();
    
    // Navigate to the URL
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    
    // Wait for initial content
    await page.waitForTimeout(waitTime);
    
    // Try to dismiss common cookie/consent popups
    if (dismissPopups) {
      const consentSelectors = [
        // Common cookie consent buttons (text-based)
        'button:has-text("Accept")',
        'button:has-text("Accept all")',
        'button:has-text("Accept All")',
        'button:has-text("Accepteren")',
        'button:has-text("Akkoord")',
        'button:has-text("Agree")',
        'button:has-text("I agree")',
        'button:has-text("OK")',
        'button:has-text("Got it")',
        'button:has-text("Allow")',
        'button:has-text("Allow all")',
        'button:has-text("Toestaan")',
        // Common class/id patterns
        '[class*="accept"]',
        '[class*="consent"]',
        '[id*="accept"]',
        '[id*="consent"]',
        '.cookie-accept',
        '.accept-cookies',
        '#accept-cookies',
        '.privacy-accept',
        // CMP specific
        '.cmp-accept',
        '[data-testid="accept-button"]',
        '[data-action="accept"]',
      ];
      
      for (const selector of consentSelectors) {
        try {
          const button = await page.$(selector);
          if (button && await button.isVisible()) {
            console.log(`[MCP] Clicking consent button: ${selector}`);
            await button.click();
            await page.waitForTimeout(500); // Wait for popup to close
            break; // Only click one button
          }
        } catch {
          // Selector not found or not clickable, continue
        }
      }
      
      // Also try pressing Escape to dismiss modals
      try {
        await page.keyboard.press('Escape');
      } catch {
        // Ignore errors
      }
    }
    
    // Wait a bit more for content to settle
    await page.waitForTimeout(500);
    
    // Get page text content
    const textContent = await page.evaluate(() => {
      // Remove script and style elements
      const scripts = document.querySelectorAll('script, style, noscript');
      scripts.forEach(el => el.remove());
      
      // Get the main content or body text
      const main = document.querySelector('main, article, [role="main"], .content, #content');
      const contentElement = (main || document.body) as HTMLElement;
      
      // Get text and clean it up
      let text = contentElement.innerText || '';
      text = text.replace(/\s+/g, ' ').trim();
      
      return text;
    });
    
    const title = await page.title();
    const finalUrl = page.url();
    
    // Limit output size
    const maxLength = 15000;
    const truncatedContent = textContent.length > maxLength 
      ? textContent.slice(0, maxLength) + '\n\n[Content truncated...]'
      : textContent;
    
    return textResult(`URL: ${finalUrl}\nTitle: ${title}\n\n${truncatedContent}`);
  } catch (err: any) {
    return errorResult(`Failed to fetch content: ${err.message}`);
  }
});

// --- browser_take_screenshot ---
server.registerTool("browser_take_screenshot", {
  description: "Take a screenshot of the current page",
  inputSchema: {
    path: z.string().optional().describe("File path to save screenshot"),
    fullPage: z.boolean().optional().describe("Capture full scrollable page"),
    selector: z.string().optional().describe("CSS selector to screenshot specific element")
  }
}, async ({ path: savePath, fullPage = false, selector }: { path?: string; fullPage?: boolean; selector?: string }) => {
  console.log(`[MCP] browser_take_screenshot`);
  try {
    const page = getCurrentPage();
    if (!page) return errorResult("No browser page open");
    
    const screenshotPath = savePath || `screenshot_${Date.now()}.png`;
    const fullPath = resolvePath(screenshotPath);
    
    if (selector) {
      const element = await page.$(selector);
      if (!element) return errorResult(`Element not found: ${selector}`);
      await element.screenshot({ path: fullPath });
    } else {
      await page.screenshot({ path: fullPath, fullPage });
    }
    
    return textResult(`Screenshot saved to: ${screenshotPath}`);
  } catch (err: any) {
    return errorResult(`Screenshot failed: ${err.message}`);
  }
});

// --- browser_wait ---
server.registerTool("browser_wait", {
  description: "Wait for a condition",
  inputSchema: {
    selector: z.string().optional().describe("CSS selector to wait for"),
    state: z.enum(["attached", "visible", "hidden", "detached"]).optional().describe("State to wait for"),
    timeout: z.number().optional().describe("Timeout in milliseconds"),
    time: z.number().optional().describe("Fixed time to wait in milliseconds")
  }
}, async ({ selector, state = "visible", timeout = 30000, time }: { selector?: string; state?: string; timeout?: number; time?: number }) => {
  console.log(`[MCP] browser_wait: ${selector || `${time}ms`}`);
  try {
    const page = getCurrentPage();
    if (!page) return errorResult("No browser page open");
    
    if (time) {
      await page.waitForTimeout(time);
      return textResult(`Waited ${time}ms`);
    }
    
    if (selector) {
      await page.waitForSelector(selector, { state: state as any, timeout });
      return textResult(`Element ${state}: ${selector}`);
    }
    
    return errorResult("Specify either 'selector' or 'time'");
  } catch (err: any) {
    return errorResult(`Wait failed: ${err.message}`);
  }
});

// --- browser_resize ---
server.registerTool("browser_resize", {
  description: "Resize the browser window",
  inputSchema: {
    width: z.number().describe("Width in pixels"),
    height: z.number().describe("Height in pixels")
  }
}, async ({ width, height }: { width: number; height: number }) => {
  console.log(`[MCP] browser_resize: ${width}x${height}`);
  try {
    const page = getCurrentPage();
    if (!page) return errorResult("No browser page open");
    await page.setViewportSize({ width, height });
    return textResult(`Resized to: ${width}x${height}`);
  } catch (err: any) {
    return errorResult(`Resize failed: ${err.message}`);
  }
});

// --- browser_handle_dialog ---
server.registerTool("browser_handle_dialog", {
  description: "Handle browser dialogs (alert, confirm, prompt)",
  inputSchema: {
    accept: z.boolean().describe("Accept or dismiss the dialog"),
    promptText: z.string().optional().describe("Text to enter for prompt dialogs")
  }
}, async ({ accept, promptText }: { accept: boolean; promptText?: string }) => {
  console.log(`[MCP] browser_handle_dialog: accept=${accept}`);
  try {
    const page = getCurrentPage();
    if (!page) return errorResult("No browser page open");
    
    page.once('dialog', async dialog => {
      if (accept) {
        await dialog.accept(promptText);
      } else {
        await dialog.dismiss();
      }
    });
    
    return textResult(`Dialog handler set: ${accept ? 'accept' : 'dismiss'}`);
  } catch (err: any) {
    return errorResult(`Dialog handler failed: ${err.message}`);
  }
});

// --- browser_drag ---
server.registerTool("browser_drag", {
  description: "Drag and drop between two elements",
  inputSchema: {
    sourceSelector: z.string().describe("CSS selector of source element"),
    targetSelector: z.string().describe("CSS selector of target element")
  }
}, async ({ sourceSelector, targetSelector }: { sourceSelector: string; targetSelector: string }) => {
  console.log(`[MCP] browser_drag: ${sourceSelector} -> ${targetSelector}`);
  try {
    const page = getCurrentPage();
    if (!page) return errorResult("No browser page open");
    await page.dragAndDrop(sourceSelector, targetSelector);
    return textResult(`Dragged from ${sourceSelector} to ${targetSelector}`);
  } catch (err: any) {
    return errorResult(`Drag failed: ${err.message}`);
  }
});

// --- browser_tabs ---
server.registerTool("browser_tabs", {
  description: "Manage browser tabs",
  inputSchema: {
    action: z.enum(["list", "new", "close", "select"]).describe("Tab action"),
    index: z.number().optional().describe("Tab index for close/select")
  }
}, async ({ action, index }: { action: string; index?: number }) => {
  console.log(`[MCP] browser_tabs: ${action}`);
  try {
    const { context } = await ensureBrowser();
    
    switch (action) {
      case "list":
        const tabs = browserState.pages.map((p, i) => ({
          index: i,
          url: p.url(),
          current: i === browserState.currentPageIndex
        }));
        return textResult(JSON.stringify(tabs, null, 2));
        
      case "new":
        const newPage = await context.newPage();
        browserState.pages.push(newPage);
        browserState.currentPageIndex = browserState.pages.length - 1;
        return textResult(`New tab created (index: ${browserState.currentPageIndex})`);
        
      case "close":
        const closeIdx = index ?? browserState.currentPageIndex;
        if (closeIdx < 0 || closeIdx >= browserState.pages.length) {
          return errorResult(`Invalid tab index: ${closeIdx}`);
        }
        await browserState.pages[closeIdx].close();
        browserState.pages.splice(closeIdx, 1);
        if (browserState.currentPageIndex >= browserState.pages.length) {
          browserState.currentPageIndex = Math.max(0, browserState.pages.length - 1);
        }
        return textResult(`Closed tab ${closeIdx}`);
        
      case "select":
        if (index === undefined) return errorResult("Tab index required");
        if (index < 0 || index >= browserState.pages.length) {
          return errorResult(`Invalid tab index: ${index}`);
        }
        browserState.currentPageIndex = index;
        return textResult(`Switched to tab ${index}: ${browserState.pages[index].url()}`);
        
      default:
        return errorResult(`Unknown action: ${action}`);
    }
  } catch (err: any) {
    return errorResult(`Tab operation failed: ${err.message}`);
  }
});

// --- browser_evaluate ---
server.registerTool("browser_evaluate", {
  description: "Execute JavaScript in the browser context",
  inputSchema: { 
    script: z.string().describe("JavaScript code to execute"),
    selector: z.string().optional().describe("Element to pass to the script")
  }
}, async ({ script, selector }: { script: string; selector?: string }) => {
  console.log(`[MCP] browser_evaluate`);
  try {
    const page = getCurrentPage();
    if (!page) return errorResult("No browser page open");
    
    let result;
    if (selector) {
      result = await page.$eval(selector, (el, code) => {
        return eval(code);
      }, script);
    } else {
      result = await page.evaluate(script);
    }
    
    return textResult(JSON.stringify(result, null, 2));
  } catch (err: any) {
    return errorResult(`Evaluate failed: ${err.message}`);
  }
});

// --- browser_console_messages ---
server.registerTool("browser_console_messages", {
  description: "Get console messages from the browser"
}, async () => {
  console.log(`[MCP] browser_console_messages`);
  return textResult(JSON.stringify(browserState.consoleMessages, null, 2));
});

// --- browser_network_requests ---
server.registerTool("browser_network_requests", {
  description: "Get network requests made by the browser"
}, async () => {
  console.log(`[MCP] browser_network_requests`);
  return textResult(JSON.stringify(browserState.networkRequests.slice(-50), null, 2));
});

// ============================================================
// CODE EXECUTION
// ============================================================

server.registerTool("shell_exec", {
  description: "Execute a shell command",
  inputSchema: {
    command: z.string().describe("Command to execute"),
    cwd: z.string().optional().describe("Working directory"),
    timeout: z.number().optional().describe("Timeout in milliseconds")
  }
}, async ({ command, cwd, timeout = 30000 }: { command: string; cwd?: string; timeout?: number }) => {
  console.log(`[MCP] shell_exec: ${command}`);
  
  const blockedCommands = ['rm -rf /', 'mkfs', 'dd if=', ':(){'];
  for (const blocked of blockedCommands) {
    if (command.includes(blocked)) {
      return errorResult(`Command blocked for security: ${blocked}`);
    }
  }
  
  try {
    const workingDir = cwd ? resolvePath(cwd) : projectRoot;
    const output = execSync(command, { 
      encoding: 'utf-8', 
      cwd: workingDir,
      timeout,
      maxBuffer: 10 * 1024 * 1024
    });
    return textResult(output);
  } catch (err: any) {
    return errorResult(`Shell exec failed: ${err.message}`);
  }
});

server.registerTool("run_python", {
  description: "Execute Python code",
  inputSchema: { code: z.string().describe("Python code to execute") }
}, async ({ code }: { code: string }) => {
  console.log(`[MCP] run_python`);
  try {
    const tempFile = path.join(projectRoot, 'temp_script.py');
    fs.writeFileSync(tempFile, code, 'utf-8');
    const output = execSync(`python3 "${tempFile}"`, { encoding: 'utf-8', timeout: 30000 });
    fs.unlinkSync(tempFile);
    return textResult(output);
  } catch (err: any) {
    return errorResult(`Python execution failed: ${err.message}`);
  }
});

server.registerTool("run_node", {
  description: "Execute JavaScript/Node.js code",
  inputSchema: { code: z.string().describe("JavaScript code to execute") }
}, async ({ code }: { code: string }) => {
  console.log(`[MCP] run_node`);
  try {
    const tempFile = path.join(projectRoot, 'temp_script.js');
    fs.writeFileSync(tempFile, code, 'utf-8');
    const output = execSync(`node "${tempFile}"`, { encoding: 'utf-8', timeout: 30000 });
    fs.unlinkSync(tempFile);
    return textResult(output);
  } catch (err: any) {
    return errorResult(`Node execution failed: ${err.message}`);
  }
});

server.registerTool("run_typescript", {
  description: "Execute TypeScript code",
  inputSchema: { code: z.string().describe("TypeScript code to execute") }
}, async ({ code }: { code: string }) => {
  console.log(`[MCP] run_typescript`);
  try {
    const tempFile = path.join(projectRoot, 'temp_script.ts');
    fs.writeFileSync(tempFile, code, 'utf-8');
    const output = execSync(`npx tsx "${tempFile}"`, { encoding: 'utf-8', timeout: 30000 });
    fs.unlinkSync(tempFile);
    return textResult(output);
  } catch (err: any) {
    return errorResult(`TypeScript execution failed: ${err.message}`);
  }
});

// ============================================================
// MEMORY OPERATIONS (Persistent key-value store)
// ============================================================

const memoryStore: Map<string, { value: any; created: string; updated: string }> = new Map();

server.registerTool("memory_store", {
  description: "Store a value in persistent memory with a key",
  inputSchema: {
    key: z.string().describe("Unique key to store the value under"),
    value: z.any().describe("Value to store (string, number, object, array)")
  }
}, async ({ key, value }: { key: string; value: any }) => {
  console.log(`[MCP] memory_store: ${key}`);
  const now = new Date().toISOString();
  const existing = memoryStore.get(key);
  memoryStore.set(key, {
    value,
    created: existing?.created || now,
    updated: now
  });
  return textResult(`Stored "${key}" successfully`);
});

server.registerTool("memory_retrieve", {
  description: "Retrieve a value from memory by key",
  inputSchema: {
    key: z.string().describe("Key to retrieve")
  }
}, async ({ key }: { key: string }) => {
  console.log(`[MCP] memory_retrieve: ${key}`);
  const entry = memoryStore.get(key);
  if (!entry) {
    return errorResult(`Key "${key}" not found in memory`);
  }
  return textResult(JSON.stringify({
    key,
    value: entry.value,
    created: entry.created,
    updated: entry.updated
  }, null, 2));
});

server.registerTool("memory_list", {
  description: "List all keys stored in memory",
  inputSchema: {}
}, async () => {
  console.log(`[MCP] memory_list`);
  const keys = Array.from(memoryStore.keys());
  const entries = keys.map(key => {
    const entry = memoryStore.get(key)!;
    return {
      key,
      type: typeof entry.value,
      updated: entry.updated
    };
  });
  return textResult(JSON.stringify(entries, null, 2));
});

server.registerTool("memory_delete", {
  description: "Delete a key from memory",
  inputSchema: {
    key: z.string().describe("Key to delete")
  }
}, async ({ key }: { key: string }) => {
  console.log(`[MCP] memory_delete: ${key}`);
  if (memoryStore.delete(key)) {
    return textResult(`Deleted "${key}" from memory`);
  }
  return errorResult(`Key "${key}" not found`);
});

// ============================================================
// TEXT OPERATIONS
// ============================================================

server.registerTool("text_summarize", {
  description: "Summarize text by extracting key sentences",
  inputSchema: {
    text: z.string().describe("Text to summarize"),
    maxSentences: z.number().optional().describe("Maximum number of sentences (default: 3)")
  }
}, async ({ text, maxSentences = 3 }: { text: string; maxSentences?: number }) => {
  console.log(`[MCP] text_summarize`);
  // Simple extractive summarization - get first N sentences
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const summary = sentences.slice(0, maxSentences).join(' ').trim();
  return textResult(JSON.stringify({
    original_length: text.length,
    summary_length: summary.length,
    sentence_count: Math.min(sentences.length, maxSentences),
    summary
  }, null, 2));
});

server.registerTool("diff_files", {
  description: "Compare two files and show differences",
  inputSchema: {
    file1: z.string().describe("Path to first file"),
    file2: z.string().describe("Path to second file")
  }
}, async ({ file1, file2 }: { file1: string; file2: string }) => {
  console.log(`[MCP] diff_files: ${file1} vs ${file2}`);
  const path1 = resolvePath(file1);
  const path2 = resolvePath(file2);
  
  if (!isPathInProject(path1) || !isPathInProject(path2)) {
    return errorResult("Access denied: Path outside allowed directories");
  }
  
  try {
    const content1 = fs.readFileSync(path1, 'utf-8').split('\n');
    const content2 = fs.readFileSync(path2, 'utf-8').split('\n');
    
    const diff: string[] = [];
    const maxLines = Math.max(content1.length, content2.length);
    
    for (let i = 0; i < maxLines; i++) {
      const line1 = content1[i];
      const line2 = content2[i];
      
      if (line1 === undefined) {
        diff.push(`+ ${i + 1}: ${line2}`);
      } else if (line2 === undefined) {
        diff.push(`- ${i + 1}: ${line1}`);
      } else if (line1 !== line2) {
        diff.push(`- ${i + 1}: ${line1}`);
        diff.push(`+ ${i + 1}: ${line2}`);
      }
    }
    
    if (diff.length === 0) {
      return textResult("Files are identical");
    }
    
    return textResult(`Differences:\n${diff.join('\n')}`);
  } catch (err: any) {
    return errorResult(`Diff failed: ${err.message}`);
  }
});

// ============================================================
// WEB SEARCH
// ============================================================

server.registerTool("web_search", {
  description: "Search the web using DuckDuckGo (no API key required)",
  inputSchema: {
    query: z.string().describe("Search query"),
    maxResults: z.number().optional().describe("Maximum results to return (default: 5)")
  }
}, async ({ query, maxResults = 5 }: { query: string; maxResults?: number }) => {
  console.log(`[MCP] web_search: ${query}`);
  try {
    // Use DuckDuckGo HTML version (no API key needed)
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetch(searchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MCPBot/1.0)' }
    });
    const html = await response.text();
    
    // Extract results from HTML (simple regex parsing)
    const results: Array<{ title: string; url: string; snippet: string }> = [];
    const resultRegex = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([^<]+)<\/a>/g;
    
    let match;
    while ((match = resultRegex.exec(html)) !== null && results.length < maxResults) {
      results.push({
        title: match[2].trim(),
        url: match[1],
        snippet: match[3].trim()
      });
    }
    
    if (results.length === 0) {
      // Fallback: try simpler extraction
      const linkRegex = /<a[^>]+class="result__url"[^>]*>([^<]+)<\/a>/g;
      while ((match = linkRegex.exec(html)) !== null && results.length < maxResults) {
        results.push({
          title: 'Result',
          url: match[1].trim(),
          snippet: ''
        });
      }
    }
    
    return textResult(JSON.stringify({ query, results }, null, 2));
  } catch (err: any) {
    return errorResult(`Web search failed: ${err.message}`);
  }
});

// ============================================================
// PROCESS OPERATIONS
// ============================================================

server.registerTool("process_list", {
  description: "List running processes",
  inputSchema: {
    filter: z.string().optional().describe("Filter processes by name")
  }
}, async ({ filter }: { filter?: string }) => {
  console.log(`[MCP] process_list: ${filter || 'all'}`);
  try {
    // Cross-platform process listing
    const isWindows = process.platform === 'win32';
    const cmd = isWindows 
      ? 'tasklist /fo csv /nh'
      : 'ps aux';
    
    let output = execSync(cmd, { encoding: 'utf-8' });
    
    if (filter) {
      const lines = output.split('\n');
      const filtered = lines.filter(line => 
        line.toLowerCase().includes(filter.toLowerCase())
      );
      output = filtered.join('\n');
    }
    
    return textResult(output || 'No matching processes found');
  } catch (err: any) {
    return errorResult(`Process list failed: ${err.message}`);
  }
});

server.registerTool("process_kill", {
  description: "Kill a process by PID or name",
  inputSchema: {
    target: z.string().describe("Process ID (PID) or process name to kill"),
    force: z.boolean().optional().describe("Force kill (SIGKILL)")
  }
}, async ({ target, force = false }: { target: string; force?: boolean }) => {
  console.log(`[MCP] process_kill: ${target} (force: ${force})`);
  
  // Security: prevent killing critical processes
  const protected_processes = ['init', 'systemd', 'kernel', 'explorer.exe', 'csrss.exe', 'winlogon.exe'];
  if (protected_processes.some(p => target.toLowerCase().includes(p))) {
    return errorResult(`Cannot kill protected process: ${target}`);
  }
  
  try {
    const isWindows = process.platform === 'win32';
    const isPid = /^\d+$/.test(target);
    
    let cmd: string;
    if (isWindows) {
      cmd = isPid 
        ? `taskkill ${force ? '/F' : ''} /PID ${target}`
        : `taskkill ${force ? '/F' : ''} /IM ${target}`;
    } else {
      const signal = force ? '-9' : '-15';
      cmd = isPid
        ? `kill ${signal} ${target}`
        : `pkill ${signal} ${target}`;
    }
    
    execSync(cmd, { encoding: 'utf-8' });
    return textResult(`Process ${target} killed successfully`);
  } catch (err: any) {
    return errorResult(`Process kill failed: ${err.message}`);
  }
});

// ============================================================
// ARCHIVE OPERATIONS
// ============================================================

server.registerTool("zip_create", {
  description: "Create a zip archive from files or directories",
  inputSchema: {
    output: z.string().describe("Output zip file path"),
    sources: z.array(z.string()).describe("Array of files/directories to include")
  }
}, async ({ output, sources }: { output: string; sources: string[] }) => {
  console.log(`[MCP] zip_create: ${output}`);
  const outputPath = resolvePath(output);
  
  if (!isPathInProject(outputPath)) {
    return errorResult("Access denied: Output path outside allowed directories");
  }
  
  try {
    const isWindows = process.platform === 'win32';
    const sourcePaths = sources.map(s => `"${resolvePath(s)}"`).join(' ');
    
    let cmd: string;
    if (isWindows) {
      // Use PowerShell Compress-Archive on Windows
      const sourceList = sources.map(s => resolvePath(s)).join("','");
      cmd = `powershell -Command "Compress-Archive -Path '${sourceList}' -DestinationPath '${outputPath}' -Force"`;
    } else {
      cmd = `zip -r "${outputPath}" ${sourcePaths}`;
    }
    
    execSync(cmd, { encoding: 'utf-8', timeout: 60000 });
    return textResult(`Created archive: ${output}`);
  } catch (err: any) {
    return errorResult(`Zip create failed: ${err.message}`);
  }
});

server.registerTool("zip_extract", {
  description: "Extract a zip archive",
  inputSchema: {
    archive: z.string().describe("Path to zip file"),
    destination: z.string().optional().describe("Destination directory (default: current)")
  }
}, async ({ archive, destination = "." }: { archive: string; destination?: string }) => {
  console.log(`[MCP] zip_extract: ${archive}`);
  const archivePath = resolvePath(archive);
  const destPath = resolvePath(destination);
  
  if (!isPathInProject(archivePath) || !isPathInProject(destPath)) {
    return errorResult("Access denied: Path outside allowed directories");
  }
  
  try {
    const isWindows = process.platform === 'win32';
    
    let cmd: string;
    if (isWindows) {
      cmd = `powershell -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${destPath}' -Force"`;
    } else {
      cmd = `unzip -o "${archivePath}" -d "${destPath}"`;
    }
    
    execSync(cmd, { encoding: 'utf-8', timeout: 60000 });
    return textResult(`Extracted to: ${destination}`);
  } catch (err: any) {
    return errorResult(`Zip extract failed: ${err.message}`);
  }
});

// ============================================================
// START SERVER
// ============================================================

console.log("[MCP] Starting MCP server v2.1...");
console.log(`[MCP] Project root: ${projectRoot}`);
console.log(`[MCP] Browser tools: Playwright MCP-compatible`);

try {
  await server.connect(new StdioServerTransport());
  console.log("[MCP] Server ready!");
} catch (err: any) {
  console.error("[MCP] Failed to start server:", err.message);
  process.exit(1);
}
