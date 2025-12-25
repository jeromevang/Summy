/**
 * MCP Extra Tools - Continue (VS Code)
 * Useful tools that complement Continue's built-in capabilities
 * Transport: SSE (for Continue MCP integration)
 */

import express from "express";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import os from "os";

const execAsync = promisify(exec);

// ============================================================
// CONFIGURATION
// ============================================================

const app = express();
const port = process.env.PORT || 3006;
const projectRoot = path.resolve(process.cwd(), '..');

// ============================================================
// HELPERS
// ============================================================

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function errorResult(message: string) {
  return { content: [{ type: "text" as const, text: `Error: ${message}` }] };
}

async function runCommand(cmd: string, cwd?: string): Promise<string> {
  try {
    const { stdout, stderr } = await execAsync(cmd, { 
      cwd: cwd || projectRoot,
      maxBuffer: 10 * 1024 * 1024
    });
    return stdout + (stderr ? `\n${stderr}` : '');
  } catch (err: any) {
    throw new Error(err.message || String(err));
  }
}

// ============================================================
// MCP SERVER
// ============================================================

const server = new McpServer({ 
  name: "continue-extra-tools", 
  version: "1.0.0"
});

// ============================================================
// GIT TOOLS
// ============================================================

server.registerTool("git_status", {
  description: "Get git status of the repository",
  inputSchema: {
    short: z.boolean().optional().describe("Use short format")
  }
}, async ({ short = false }: { short?: boolean }) => {
  console.error("[Git] status");
  try {
    const flag = short ? '-s' : '';
    const result = await runCommand(`git status ${flag}`);
    return textResult(result || "Working tree clean");
  } catch (err: any) {
    return errorResult(err.message);
  }
});

server.registerTool("git_diff", {
  description: "Show git diff",
  inputSchema: {
    staged: z.boolean().optional().describe("Show staged changes"),
    file: z.string().optional().describe("Specific file to diff"),
    commit: z.string().optional().describe("Compare with commit")
  }
}, async ({ staged = false, file, commit }: { staged?: boolean; file?: string; commit?: string }) => {
  console.error("[Git] diff");
  try {
    let cmd = "git diff";
    if (staged) cmd += " --cached";
    if (commit) cmd += ` ${commit}`;
    if (file) cmd += ` -- "${file}"`;
    const result = await runCommand(cmd);
    return textResult(result || "No differences");
  } catch (err: any) {
    return errorResult(err.message);
  }
});

server.registerTool("git_log", {
  description: "Show git commit history",
  inputSchema: {
    count: z.number().optional().describe("Number of commits (default: 10)"),
    oneline: z.boolean().optional().describe("One line per commit"),
    file: z.string().optional().describe("History for specific file")
  }
}, async ({ count = 10, oneline = true, file }: { count?: number; oneline?: boolean; file?: string }) => {
  console.error("[Git] log");
  try {
    let cmd = `git log -${count}`;
    if (oneline) cmd += " --oneline";
    if (file) cmd += ` -- "${file}"`;
    const result = await runCommand(cmd);
    return textResult(result);
  } catch (err: any) {
    return errorResult(err.message);
  }
});

server.registerTool("git_branch", {
  description: "List, create, or switch branches",
  inputSchema: {
    action: z.enum(['list', 'create', 'switch', 'delete']).describe("Branch action"),
    name: z.string().optional().describe("Branch name")
  }
}, async ({ action, name }: { action: 'list' | 'create' | 'switch' | 'delete'; name?: string }) => {
  console.error(`[Git] branch ${action}`);
  try {
    let cmd: string;
    switch (action) {
      case 'list': cmd = "git branch -a"; break;
      case 'create':
        if (!name) return errorResult("Branch name required");
        cmd = `git branch "${name}"`;
        break;
      case 'switch':
        if (!name) return errorResult("Branch name required");
        cmd = `git checkout "${name}"`;
        break;
      case 'delete':
        if (!name) return errorResult("Branch name required");
        cmd = `git branch -d "${name}"`;
        break;
    }
    const result = await runCommand(cmd);
    return textResult(result || `Branch ${action} completed`);
  } catch (err: any) {
    return errorResult(err.message);
  }
});

server.registerTool("git_commit", {
  description: "Create a git commit",
  inputSchema: {
    message: z.string().describe("Commit message"),
    all: z.boolean().optional().describe("Stage all modified files (-a)")
  }
}, async ({ message, all = false }: { message: string; all?: boolean }) => {
  console.error("[Git] commit");
  try {
    const flag = all ? '-a' : '';
    const result = await runCommand(`git commit ${flag} -m "${message.replace(/"/g, '\\"')}"`);
    return textResult(result);
  } catch (err: any) {
    return errorResult(err.message);
  }
});

server.registerTool("git_stash", {
  description: "Stash or restore changes",
  inputSchema: {
    action: z.enum(['push', 'pop', 'list', 'drop']).describe("Stash action"),
    message: z.string().optional().describe("Stash message")
  }
}, async ({ action, message }: { action: 'push' | 'pop' | 'list' | 'drop'; message?: string }) => {
  console.error(`[Git] stash ${action}`);
  try {
    let cmd: string;
    switch (action) {
      case 'push': cmd = message ? `git stash push -m "${message}"` : "git stash push"; break;
      case 'pop': cmd = "git stash pop"; break;
      case 'list': cmd = "git stash list"; break;
      case 'drop': cmd = "git stash drop"; break;
    }
    const result = await runCommand(cmd);
    return textResult(result || `Stash ${action} completed`);
  } catch (err: any) {
    return errorResult(err.message);
  }
});

// ============================================================
// HTTP CLIENT
// ============================================================

server.registerTool("http_request", {
  description: "Make an HTTP request",
  inputSchema: {
    url: z.string().describe("URL to request"),
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD']).optional().describe("HTTP method"),
    headers: z.record(z.string()).optional().describe("Request headers"),
    body: z.string().optional().describe("Request body"),
    timeout: z.number().optional().describe("Timeout in ms")
  }
}, async ({ url, method = 'GET', headers = {}, body, timeout = 30000 }) => {
  console.error(`[HTTP] ${method} ${url}`);
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const response = await fetch(url, {
      method,
      headers: { 'User-Agent': 'MCP-Extra-Tools/1.0', ...headers },
      body: body || undefined,
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    const contentType = response.headers.get('content-type') || '';
    let responseBody: string;
    
    if (contentType.includes('application/json')) {
      responseBody = JSON.stringify(await response.json(), null, 2);
    } else {
      responseBody = await response.text();
    }
    
    if (responseBody.length > 50000) {
      responseBody = responseBody.slice(0, 50000) + '\n... (truncated)';
    }
    
    return textResult(`Status: ${response.status} ${response.statusText}\n\n${responseBody}`);
  } catch (err: any) {
    return errorResult(err.message);
  }
});

// ============================================================
// SYSTEM INFO
// ============================================================

server.registerTool("system_info", {
  description: "Get system information",
  inputSchema: {}
}, async () => {
  console.error("[System] info");
  try {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    const info = {
      platform: os.platform(),
      arch: os.arch(),
      hostname: os.hostname(),
      uptime: `${Math.floor(os.uptime() / 3600)}h ${Math.floor((os.uptime() % 3600) / 60)}m`,
      cpu: { model: cpus[0]?.model, cores: cpus.length },
      memory: {
        total: `${(totalMem / 1024 / 1024 / 1024).toFixed(2)} GB`,
        used: `${(usedMem / 1024 / 1024 / 1024).toFixed(2)} GB`,
        free: `${(freeMem / 1024 / 1024 / 1024).toFixed(2)} GB`
      },
      cwd: projectRoot,
      nodeVersion: process.version
    };
    
    return textResult(JSON.stringify(info, null, 2));
  } catch (err: any) {
    return errorResult(err.message);
  }
});

server.registerTool("disk_usage", {
  description: "Get disk usage information",
  inputSchema: {
    path: z.string().optional().describe("Path to check")
  }
}, async ({ path: checkPath = projectRoot }: { path?: string }) => {
  console.error("[System] disk_usage");
  try {
    const isWindows = os.platform() === 'win32';
    const result = isWindows
      ? await runCommand(`wmic logicaldisk get size,freespace,caption`)
      : await runCommand(`df -h "${checkPath}"`);
    return textResult(result);
  } catch (err: any) {
    return errorResult(err.message);
  }
});

server.registerTool("process_list", {
  description: "List running processes",
  inputSchema: {
    filter: z.string().optional().describe("Filter by name")
  }
}, async ({ filter }: { filter?: string }) => {
  console.error("[System] process_list");
  try {
    const isWindows = os.platform() === 'win32';
    const cmd = isWindows
      ? (filter ? `tasklist /FI "IMAGENAME eq *${filter}*"` : 'tasklist')
      : (filter ? `ps aux | grep -i "${filter}" | head -50` : 'ps aux | head -50');
    const result = await runCommand(cmd);
    return textResult(result);
  } catch (err: any) {
    return errorResult(err.message);
  }
});

// ============================================================
// CLIPBOARD
// ============================================================

server.registerTool("clipboard_read", {
  description: "Read text from clipboard",
  inputSchema: {}
}, async () => {
  console.error("[Clipboard] read");
  try {
    const isWindows = os.platform() === 'win32';
    const isMac = os.platform() === 'darwin';
    const cmd = isWindows ? 'powershell -command "Get-Clipboard"'
      : isMac ? 'pbpaste' : 'xclip -selection clipboard -o';
    const result = await runCommand(cmd);
    return textResult(result.trim() || "(clipboard empty)");
  } catch (err: any) {
    return errorResult(err.message);
  }
});

server.registerTool("clipboard_write", {
  description: "Write text to clipboard",
  inputSchema: {
    text: z.string().describe("Text to copy")
  }
}, async ({ text }: { text: string }) => {
  console.error("[Clipboard] write");
  try {
    const isWindows = os.platform() === 'win32';
    const isMac = os.platform() === 'darwin';
    
    if (isWindows) {
      const tempFile = path.join(os.tmpdir(), 'clipboard_temp.txt');
      fs.writeFileSync(tempFile, text, 'utf-8');
      await runCommand(`powershell -command "Get-Content '${tempFile}' | Set-Clipboard"`);
      fs.unlinkSync(tempFile);
    } else {
      const escaped = text.replace(/'/g, "'\\''");
      await runCommand(isMac ? `echo '${escaped}' | pbcopy` : `echo '${escaped}' | xclip -selection clipboard`);
    }
    
    return textResult(`✓ Copied ${text.length} characters`);
  } catch (err: any) {
    return errorResult(err.message);
  }
});

// ============================================================
// JSON TOOLS
// ============================================================

server.registerTool("json_validate", {
  description: "Validate and format JSON",
  inputSchema: {
    json: z.string().describe("JSON to validate"),
    format: z.boolean().optional().describe("Return formatted")
  }
}, async ({ json, format = true }: { json: string; format?: boolean }) => {
  console.error("[JSON] validate");
  try {
    const parsed = JSON.parse(json);
    return textResult(format ? `✓ Valid JSON\n\n${JSON.stringify(parsed, null, 2)}` : "✓ Valid JSON");
  } catch (err: any) {
    return errorResult(`Invalid JSON: ${err.message}`);
  }
});

server.registerTool("json_query", {
  description: "Query JSON with dot-notation path",
  inputSchema: {
    json: z.string().describe("JSON to query"),
    path: z.string().describe("Path like 'data.items[0].id'")
  }
}, async ({ json, path: queryPath }: { json: string; path: string }) => {
  console.error(`[JSON] query: ${queryPath}`);
  try {
    const parsed = JSON.parse(json);
    const parts = queryPath.replace(/\[(\d+)\]/g, '.$1').split('.');
    let result: any = parsed;
    for (const part of parts) {
      if (result === undefined || result === null) break;
      result = result[part];
    }
    if (result === undefined) return textResult(`Path "${queryPath}" not found`);
    return textResult(typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result));
  } catch (err: any) {
    return errorResult(err.message);
  }
});

// ============================================================
// ENVIRONMENT & DATETIME
// ============================================================

server.registerTool("env_get", {
  description: "Get environment variable",
  inputSchema: {
    name: z.string().describe("Variable name"),
    all: z.boolean().optional().describe("List all (filtered)")
  }
}, async ({ name, all = false }: { name: string; all?: boolean }) => {
  console.error("[Env] get");
  try {
    if (all) {
      const safe = Object.entries(process.env)
        .filter(([k]) => !k.toLowerCase().includes('key') && 
                         !k.toLowerCase().includes('secret') && 
                         !k.toLowerCase().includes('password'))
        .map(([k, v]) => `${k}=${v?.slice(0, 100)}`)
        .join('\n');
      return textResult(safe);
    }
    return textResult(process.env[name] || `"${name}" not set`);
  } catch (err: any) {
    return errorResult(err.message);
  }
});

server.registerTool("datetime", {
  description: "Get current date/time",
  inputSchema: {
    format: z.enum(['iso', 'unix', 'human', 'date', 'time']).optional()
  }
}, async ({ format = 'iso' }: { format?: string }) => {
  console.error("[DateTime]");
  const now = new Date();
  switch (format) {
    case 'unix': return textResult(String(Math.floor(now.getTime() / 1000)));
    case 'human': return textResult(now.toLocaleString());
    case 'date': return textResult(now.toLocaleDateString());
    case 'time': return textResult(now.toLocaleTimeString());
    default: return textResult(now.toISOString());
  }
});

// ============================================================
// VSCODE-SPECIFIC: NPM/NODE TOOLS
// ============================================================

server.registerTool("npm_scripts", {
  description: "List available npm scripts from package.json",
  inputSchema: {
    path: z.string().optional().describe("Path to package.json directory")
  }
}, async ({ path: pkgPath = projectRoot }: { path?: string }) => {
  console.error("[NPM] scripts");
  try {
    const pkgFile = path.join(pkgPath, 'package.json');
    if (!fs.existsSync(pkgFile)) {
      return errorResult("package.json not found");
    }
    const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf-8'));
    const scripts = pkg.scripts || {};
    
    if (Object.keys(scripts).length === 0) {
      return textResult("No scripts defined");
    }
    
    const list = Object.entries(scripts)
      .map(([name, cmd]) => `  ${name}: ${cmd}`)
      .join('\n');
    
    return textResult(`Available scripts:\n${list}`);
  } catch (err: any) {
    return errorResult(err.message);
  }
});

server.registerTool("npm_outdated", {
  description: "Check for outdated npm packages",
  inputSchema: {}
}, async () => {
  console.error("[NPM] outdated");
  try {
    const result = await runCommand("npm outdated --json");
    if (!result.trim()) return textResult("All packages are up to date!");
    const outdated = JSON.parse(result);
    const formatted = Object.entries(outdated)
      .map(([pkg, info]: [string, any]) => 
        `${pkg}: ${info.current} → ${info.latest} (wanted: ${info.wanted})`)
      .join('\n');
    return textResult(formatted || "All packages are up to date!");
  } catch (err: any) {
    // npm outdated returns exit code 1 when there are outdated packages
    if (err.message.includes('Command failed')) {
      try {
        const match = err.message.match(/stdout: "(.+)"/s);
        if (match) {
          const outdated = JSON.parse(match[1]);
          const formatted = Object.entries(outdated)
            .map(([pkg, info]: [string, any]) => 
              `${pkg}: ${info.current} → ${info.latest}`)
            .join('\n');
          return textResult(formatted);
        }
      } catch {}
    }
    return errorResult(err.message);
  }
});

// ============================================================
// RAG - SEMANTIC CODE SEARCH
// ============================================================

const RAG_SERVER_URL = process.env.RAG_SERVER_URL || 'http://localhost:3002';

server.registerTool("rag_query", {
  description: "PREFERRED CODE SEARCH: Semantic AI-powered search that finds relevant code by meaning. Use this FIRST for any code search task like 'find X', 'where is Y', 'how does Z work'. Returns code snippets with file paths, line numbers, and relevance scores.",
  inputSchema: {
    query: z.string().describe("Natural language query - ask like you would ask a colleague"),
    limit: z.number().optional().describe("Maximum results (default: 5)"),
    fileTypes: z.array(z.string()).optional().describe("Filter by file types (e.g., ['ts', 'js'])"),
    paths: z.array(z.string()).optional().describe("Filter by path patterns")
  }
}, async ({ query, limit = 5, fileTypes, paths }) => {
  console.error(`[RAG] query: ${query}`);
  try {
    const response = await fetch(`${RAG_SERVER_URL}/api/rag/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit, filter: { fileTypes, paths } })
    });

    if (!response.ok) {
      const error = await response.text();
      return errorResult(`RAG query failed: ${error}`);
    }

    const data = await response.json();

    if (!data.results || data.results.length === 0) {
      return textResult("No relevant code found for your query.");
    }

    let output = `Found ${data.results.length} relevant code snippets (${data.latency}ms):\n\n`;
    for (let i = 0; i < data.results.length; i++) {
      const r = data.results[i];
      output += `--- Result ${i + 1} (score: ${(r.score * 100).toFixed(1)}%) ---\n`;
      output += `File: ${r.filePath}:${r.startLine}-${r.endLine}\n`;
      if (r.symbolName) output += `Symbol: ${r.symbolName} (${r.symbolType})\n`;
      output += `\`\`\`${r.language}\n${r.snippet}\n\`\`\`\n\n`;
    }
    return textResult(output);
  } catch (err: any) {
    if (err.message?.includes('ECONNREFUSED')) {
      return errorResult("RAG server is not running. Start it with 'npm run dev:rag'");
    }
    return errorResult(`RAG query error: ${err.message}`);
  }
});

server.registerTool("rag_status", {
  description: "Get RAG index status and statistics",
  inputSchema: {}
}, async () => {
  console.error("[RAG] status");
  try {
    const [statsRes, configRes] = await Promise.all([
      fetch(`${RAG_SERVER_URL}/api/rag/stats`),
      fetch(`${RAG_SERVER_URL}/api/rag/config`)
    ]);

    if (!statsRes.ok) return errorResult("Failed to get RAG status");

    const stats = await statsRes.json();
    const config = await configRes.json();

    return textResult(`RAG Index Status:
  Project: ${stats.projectPath || 'Not set'}
  Status: ${stats.status}
  Files indexed: ${stats.totalFiles}
  Chunks: ${stats.totalChunks}
  Vectors: ${stats.totalVectors}
  Embedding model: ${stats.embeddingModel || 'Not set'}
  Model loaded: ${stats.embeddingModelLoaded ? 'Yes' : 'No'}
  File watcher: ${stats.fileWatcherActive ? 'Active' : 'Inactive'}`);
  } catch (err: any) {
    if (err.message?.includes('ECONNREFUSED')) {
      return errorResult("RAG server is not running");
    }
    return errorResult(`RAG status error: ${err.message}`);
  }
});

server.registerTool("rag_index", {
  description: "Index a project directory for semantic search. Use this when switching to a new project or to re-index the current project.",
  inputSchema: {
    projectPath: z.string().describe("Absolute path to the project directory to index")
  }
}, async ({ projectPath }) => {
  console.error(`[RAG] index: ${projectPath}`);
  try {
    // Check if directory exists
    if (!fs.existsSync(projectPath)) {
      return errorResult(`Directory does not exist: ${projectPath}`);
    }

    const response = await fetch(`${RAG_SERVER_URL}/api/rag/index`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectPath })
    });

    if (!response.ok) {
      const error = await response.json();
      return errorResult(`Failed to start indexing: ${error.error}`);
    }

    return textResult(`✓ Indexing started for: ${projectPath}\nUse rag_status to check progress.`);
  } catch (err: any) {
    if (err.message?.includes('ECONNREFUSED')) {
      return errorResult("RAG server is not running. Start it with 'npm run dev:rag'");
    }
    return errorResult(`RAG index error: ${err.message}`);
  }
});

// ============================================================
// SSE SERVER
// ============================================================

const transports = new Map<string, SSEServerTransport>();

app.get("/sse", async (req, res) => {
  console.error("[Extra Tools] New SSE connection");
  const transport = new SSEServerTransport("/messages", res);
  const sessionId = crypto.randomUUID();
  transports.set(sessionId, transport);
  
  res.on("close", () => {
    console.error(`[Extra Tools] SSE closed: ${sessionId}`);
    transports.delete(sessionId);
  });
  
  await server.connect(transport);
});

app.post("/messages", async (req, res) => {
  const sessionId = req.query.sessionId as string;
  let transport: SSEServerTransport | undefined;
  
  if (sessionId && transports.has(sessionId)) {
    transport = transports.get(sessionId);
  } else if (transports.size === 1) {
    transport = transports.values().next().value;
  } else if (transports.size > 0) {
    transport = Array.from(transports.values()).pop();
  }
  
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(400).json({ error: "No active SSE session" });
  }
});

app.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    server: "continue-extra-tools",
    tools: 21,
    activeConnections: transports.size
  });
});

// ============================================================
// START SERVER
// ============================================================

const tools = [
  'git_status', 'git_diff', 'git_log', 'git_branch', 'git_commit', 'git_stash',
  'http_request',
  'system_info', 'disk_usage', 'process_list',
  'clipboard_read', 'clipboard_write',
  'json_validate', 'json_query',
  'env_get', 'datetime',
  'npm_scripts', 'npm_outdated',
  'rag_query', 'rag_status', 'rag_index'
];

app.listen(port, () => {
  console.error(`[Extra Tools - Continue] ═══════════════════════════════════════`);
  console.error(`[Extra Tools - Continue] MCP Server v1.0 (SSE)`);
  console.error(`[Extra Tools - Continue] http://localhost:${port}`);
  console.error(`[Extra Tools - Continue] SSE: http://localhost:${port}/sse`);
  console.error(`[Extra Tools - Continue] Tools: ${tools.length} (${tools.join(', ')})`);
  console.error(`[Extra Tools - Continue] ═══════════════════════════════════════`);
});


