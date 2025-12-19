/**
 * MCP Server for Tooly
 * Provides tool execution capabilities via Model Context Protocol
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { chromium, Browser } from "playwright";
import { execSync } from "child_process";

// ============================================================
// CONFIGURATION
// ============================================================

// Project root for security checks
const projectRoot = process.cwd();

// Browser instance for Playwright tools
let browserInstance: Browser | null = null;

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

async function getBrowser(): Promise<Browser> {
  if (!browserInstance) {
    browserInstance = await chromium.launch({ headless: true });
  }
  return browserInstance;
}

process.on('exit', async () => {
  if (browserInstance) {
    await browserInstance.close();
  }
});

// ============================================================
// MCP RULES
// ============================================================

const mcpRules = {
  tool_use_policy: "prefer_tools",
  security: "only operate on files within the project directory",
  tools: {
    file_read: "use for any local file content requests within project",
    file_patch: "use to modify specific content in project files",
    file_write: "use to write or create files within project",
    http_request: "use for API calls and fetching web content",
    browser_navigate: "use to navigate to URLs and get page content",
    git_status: "use to check git repository status",
    npm_run: "use to run npm scripts",
  }
};

// ============================================================
// TOOL RESULT HELPER
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

const server = new McpServer({ name: "summy-mcp-server", version: "1.0.0" });

// ============================================================
// TOOL REGISTRATIONS
// ============================================================

// --- MCP Rules ---
server.registerTool("mcp_rules", { description: "Get tool policies and rules" }, async () => 
  textResult(JSON.stringify(mcpRules, null, 2))
);

// --- File Read ---
server.registerTool("file_read", {
  description: "Read the contents of a file",
  inputSchema: { path: z.string().describe("File path to read") }
}, async ({ path: filePath }: { path: string }) => {
  console.log(`[MCP] file_read: ${filePath}`);
  const fullPath = resolvePath(filePath);
  if (!isPathInProject(fullPath)) return errorResult("Access denied: Path outside project directory");
  try {
    return textResult(fs.readFileSync(fullPath, "utf-8"));
  } catch (err: any) {
    return errorResult(`File not found: ${filePath}`);
  }
});

// --- File Write ---
server.registerTool("file_write", {
  description: "Write content to a file",
  inputSchema: {
    path: z.string().describe("File path to write"),
    content: z.string().describe("Content to write")
  }
}, async ({ path: filePath, content }: { path: string; content: string }) => {
  console.log(`[MCP] file_write: ${filePath}`);
  const fullPath = resolvePath(filePath);
  if (!isPathInProject(fullPath)) return errorResult("Access denied: Path outside project directory");
  try {
    fs.writeFileSync(fullPath, content, "utf-8");
    return textResult(`File "${filePath}" written successfully`);
  } catch (err: any) {
    return errorResult(`Failed to write "${filePath}": ${err.message}`);
  }
});

// --- File Patch ---
server.registerTool("file_patch", {
  description: "Patch a file by replacing text",
  inputSchema: {
    path: z.string().describe("File path to patch"),
    find: z.string().describe("Text to find"),
    replace: z.string().describe("Text to replace with")
  }
}, async ({ path: filePath, find, replace }: { path: string; find: string; replace: string }) => {
  console.log(`[MCP] file_patch: ${filePath}`);
  const fullPath = resolvePath(filePath);
  if (!isPathInProject(fullPath)) return errorResult("Access denied: Path outside project directory");
  if (!fs.existsSync(fullPath)) return errorResult(`File not found: ${fullPath}`);
  try {
    let content = fs.readFileSync(fullPath, "utf-8");
    if (!content.includes(find)) return errorResult(`Pattern not found: ${find}`);
    const updated = content.replace(new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "g"), replace);
    fs.writeFileSync(fullPath, updated, "utf-8");
    return textResult(`Successfully patched "${filePath}"`);
  } catch (err: any) {
    return errorResult(`Patch failed: ${err.message}`);
  }
});

// --- Create New File ---
server.registerTool("create_new_file", {
  description: "Create a new file with content",
  inputSchema: {
    filepath: z.string().describe("File path to create"),
    content: z.string().describe("Content for the new file")
  }
}, async ({ filepath, content }: { filepath: string; content: string }) => {
  console.log(`[MCP] create_new_file: ${filepath}`);
  const fullPath = resolvePath(filepath);
  if (!isPathInProject(fullPath)) return errorResult("Access denied: Path outside project directory");
  try {
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, content, "utf-8");
    return textResult(`File "${filepath}" created`);
  } catch (err: any) {
    return errorResult(`Failed to create "${filepath}": ${err.message}`);
  }
});

// --- File List ---
server.registerTool("file_list", {
  description: "List files in a directory",
  inputSchema: { folder: z.string().optional().describe("Folder path (default: current directory)") }
}, async ({ folder = "." }: { folder?: string }) => {
  console.log(`[MCP] file_list: ${folder}`);
  const fullPath = resolvePath(folder);
  if (!isPathInProject(fullPath)) return errorResult("Access denied: Path outside project directory");
  try {
    return textResult(fs.readdirSync(fullPath).join("\n"));
  } catch (err: any) {
    return errorResult(`File list failed: ${err.message}`);
  }
});

// --- File Search ---
server.registerTool("file_search", {
  description: "Search for text in files",
  inputSchema: {
    query: z.string().describe("Search query"),
    path: z.string().optional().describe("Path to search in")
  }
}, async ({ query, path: searchPath = "." }: { query: string; path?: string }) => {
  console.log(`[MCP] file_search: ${query} in ${searchPath}`);
  const fullPath = resolvePath(searchPath);
  if (!isPathInProject(fullPath)) return errorResult("Access denied: Path outside project directory");
  try {
    const output = execSync(`grep -r "${query}" "${fullPath}"`, { encoding: 'utf-8' });
    return textResult(output || "No matches found.");
  } catch (err: any) {
    return errorResult(`File search failed: ${err.message}`);
  }
});

// --- Folder Create ---
server.registerTool("folder_create", {
  description: "Create a new directory",
  inputSchema: { path: z.string().describe("Folder path to create") }
}, async ({ path: folderPath }: { path: string }) => {
  console.log(`[MCP] folder_create: ${folderPath}`);
  const fullPath = resolvePath(folderPath);
  if (!isPathInProject(fullPath)) return errorResult("Access denied: Path outside project directory");
  try {
    fs.mkdirSync(fullPath, { recursive: true });
    return textResult(`Folder "${folderPath}" created`);
  } catch (err: any) {
    return errorResult(`Folder create failed: ${err.message}`);
  }
});

// --- Folder Delete ---
server.registerTool("folder_delete", {
  description: "Delete a directory",
  inputSchema: { path: z.string().describe("Folder path to delete") }
}, async ({ path: folderPath }: { path: string }) => {
  console.log(`[MCP] folder_delete: ${folderPath}`);
  const fullPath = resolvePath(folderPath);
  if (!isPathInProject(fullPath)) return errorResult("Access denied: Path outside project directory");
  try {
    fs.rmSync(fullPath, { recursive: true });
    return textResult(`Folder "${folderPath}" deleted`);
  } catch (err: any) {
    return errorResult(`Folder delete failed: ${err.message}`);
  }
});

// --- HTTP Request ---
server.registerTool("http_request", {
  description: "Make an HTTP request",
  inputSchema: {
    url: z.string().describe("URL to request"),
    method: z.string().optional().describe("HTTP method (default: GET)"),
    body: z.string().optional().describe("Request body for POST/PUT")
  }
}, async ({ url, method = "GET", body }: { url: string; method?: string; body?: string }) => {
  console.log(`[MCP] http_request: ${method} ${url}`);
  try {
    const res = await fetch(url, {
      method,
      body: body || undefined,
      headers: body ? { 'Content-Type': 'application/json' } : undefined
    });
    return textResult(await res.text());
  } catch (err: any) {
    return errorResult(`HTTP request failed: ${err.message}`);
  }
});

// --- Browser Navigate ---
server.registerTool("browser_navigate", {
  description: "Navigate to a URL and optionally get page content",
  inputSchema: {
    url: z.string().describe("URL to navigate to"),
    clickSelector: z.string().optional().describe("CSS selector to click"),
    getContent: z.boolean().optional().describe("Whether to return page content")
  }
}, async ({ url, clickSelector, getContent = false }: { url: string; clickSelector?: string; getContent?: boolean }) => {
  console.log(`[MCP] browser_navigate: ${url}`);
  if (!url) return errorResult("URL is required");
  try {
    const browser = await getBrowser();
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded" });
    if (clickSelector) {
      await page.click(clickSelector);
      await page.waitForLoadState('domcontentloaded');
    }
    let result = `Page Title: ${await page.title()}`;
    if (getContent) {
      const bodyText = await page.textContent('body');
      result += `\n\nContent:\n${(bodyText || '').slice(0, 5000)}`;
    }
    await page.close();
    return textResult(result);
  } catch (err: any) {
    return errorResult(`Navigation failed: ${err.message}`);
  }
});

// --- Git Status ---
server.registerTool("git_status", { description: "Get git repository status" }, async () => {
  console.log(`[MCP] git_status`);
  try {
    return textResult(execSync("git status", { encoding: 'utf-8' }));
  } catch (err: any) {
    return errorResult(`Git status failed: ${err.message}`);
  }
});

// --- Git Diff ---
server.registerTool("git_diff", {
  description: "Show git differences",
  inputSchema: { file: z.string().optional().describe("Specific file to diff") }
}, async ({ file }: { file?: string }) => {
  console.log(`[MCP] git_diff: ${file || 'all'}`);
  try {
    const output = execSync(`git diff ${file || ""}`, { encoding: 'utf-8' });
    return textResult(output || "No differences found.");
  } catch (err: any) {
    return errorResult(`Git diff failed: ${err.message}`);
  }
});

// --- Git Log ---
server.registerTool("git_log", {
  description: "Show git commit history",
  inputSchema: { count: z.number().optional().describe("Number of commits to show") }
}, async ({ count = 5 }: { count?: number }) => {
  console.log(`[MCP] git_log: ${count} commits`);
  try {
    return textResult(execSync(`git log -n ${count} --oneline`, { encoding: 'utf-8' }));
  } catch (err: any) {
    return errorResult(`Git log failed: ${err.message}`);
  }
});

// --- Git Init ---
server.registerTool("git_init", { description: "Initialize a git repository" }, async () => {
  console.log(`[MCP] git_init`);
  try {
    return textResult(execSync("git init", { encoding: 'utf-8' }));
  } catch (err: any) {
    return errorResult(`Git init failed: ${err.message}`);
  }
});

// --- Git Add ---
server.registerTool("git_add", {
  description: "Stage a file for commit",
  inputSchema: { file: z.string().describe("File to stage") }
}, async ({ file }: { file: string }) => {
  console.log(`[MCP] git_add: ${file}`);
  const fullPath = resolvePath(file);
  if (!isPathInProject(fullPath)) return errorResult("Access denied: Path outside project directory");
  try {
    const output = execSync(`git add "${fullPath}"`, { encoding: 'utf-8' });
    return textResult(output || `Staged: ${file}`);
  } catch (err: any) {
    return errorResult(`Git add failed: ${err.message}`);
  }
});

// --- Git Commit ---
server.registerTool("git_commit", {
  description: "Commit staged changes",
  inputSchema: { message: z.string().describe("Commit message") }
}, async ({ message }: { message: string }) => {
  console.log(`[MCP] git_commit: ${message}`);
  try {
    execSync("git add .", { encoding: 'utf-8' });
    return textResult(execSync(`git commit -m "${message}"`, { encoding: 'utf-8' }));
  } catch (err: any) {
    return errorResult(`Git commit failed: ${err.message}`);
  }
});

// --- Git Branch Create ---
server.registerTool("git_branch_create", {
  description: "Create and switch to a new branch",
  inputSchema: { name: z.string().describe("Branch name") }
}, async ({ name }: { name: string }) => {
  console.log(`[MCP] git_branch_create: ${name}`);
  try {
    const output = execSync(`git checkout -b "${name}"`, { encoding: 'utf-8' });
    return textResult(output || `Created and switched to branch: ${name}`);
  } catch (err: any) {
    return errorResult(`Git branch create failed: ${err.message}`);
  }
});

// --- Git Branch List ---
server.registerTool("git_branch_list", { description: "List all branches" }, async () => {
  console.log(`[MCP] git_branch_list`);
  try {
    return textResult(execSync("git branch", { encoding: 'utf-8' }));
  } catch (err: any) {
    return errorResult(`Git branch list failed: ${err.message}`);
  }
});

// --- NPM Run ---
server.registerTool("npm_run", {
  description: "Run an npm script",
  inputSchema: { script: z.string().describe("Script name to run") }
}, async ({ script }: { script: string }) => {
  console.log(`[MCP] npm_run: ${script}`);
  try {
    return textResult(execSync(`npm run ${script}`, { encoding: 'utf-8' }));
  } catch (err: any) {
    return errorResult(`npm run failed: ${err.message}`);
  }
});

// --- NPM Install ---
server.registerTool("npm_install", {
  description: "Install an npm package",
  inputSchema: { package: z.string().describe("Package name to install") }
}, async ({ package: pkg }: { package: string }) => {
  console.log(`[MCP] npm_install: ${pkg}`);
  try {
    return textResult(execSync(`npm install ${pkg}`, { encoding: 'utf-8' }));
  } catch (err: any) {
    return errorResult(`npm install failed: ${err.message}`);
  }
});

// --- NPM Uninstall ---
server.registerTool("npm_uninstall", {
  description: "Uninstall an npm package",
  inputSchema: { package: z.string().describe("Package name to uninstall") }
}, async ({ package: pkg }: { package: string }) => {
  console.log(`[MCP] npm_uninstall: ${pkg}`);
  try {
    return textResult(execSync(`npm uninstall ${pkg}`, { encoding: 'utf-8' }));
  } catch (err: any) {
    return errorResult(`npm uninstall failed: ${err.message}`);
  }
});

// --- Run Python ---
server.registerTool("run_python", {
  description: "Execute Python code",
  inputSchema: { code: z.string().describe("Python code to execute") }
}, async ({ code }: { code: string }) => {
  console.log(`[MCP] run_python`);
  try {
    const tempFile = path.join(projectRoot, 'temp_script.py');
    fs.writeFileSync(tempFile, code, 'utf-8');
    const output = execSync(`python3 "${tempFile}"`, { encoding: 'utf-8' });
    fs.unlinkSync(tempFile);
    return textResult(output);
  } catch (err: any) {
    return errorResult(`Python execution failed: ${err.message}`);
  }
});

// ============================================================
// START SERVER
// ============================================================

console.log("[MCP] Starting MCP server...");
console.log(`[MCP] Project root: ${projectRoot}`);

try {
  await server.connect(new StdioServerTransport());
  console.log("[MCP] Server ready with full toolset!");
} catch (err: any) {
  console.error("[MCP] Failed to start server:", err.message);
  process.exit(1);
}
