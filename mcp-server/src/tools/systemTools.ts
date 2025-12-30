import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { textResult, errorResult } from "../utils/helpers.js";
import { resolvePath } from "../utils/fs.js";

const projectRoot = process.cwd();
const MEMORY_FILE = path.join(projectRoot, 'data', 'memory.json');

interface MemoryEntry {
  value: any;
  created: string;
  updated: string;
  tags?: string[];
}

interface MemoryStore {
  version: number;
  entries: Record<string, MemoryEntry>;
}

function loadMemoryStore(): MemoryStore {
  try {
    if (fs.existsSync(MEMORY_FILE)) {
      return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf-8'));
    }
  } catch (err) {}
  return { version: 1, entries: {} };
}

function saveMemoryStore(store: MemoryStore): void {
  try {
    fs.ensureDirSync(path.dirname(MEMORY_FILE));
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(store, null, 2), 'utf-8');
  } catch (err) {}
}

let memoryData = loadMemoryStore();

export function registerSystemTools(server: McpServer) {
  // --- Code Execution ---
  server.registerTool("shell_exec", {
    description: "Execute a shell command",
    inputSchema: {
      command: z.string().describe("Command to execute"),
      cwd: z.string().optional().describe("Working directory"),
      timeout: z.number().optional().describe("Timeout in milliseconds")
    }
  }, async ({ command, cwd, timeout = 30000 }: { command: string; cwd?: string; timeout?: number }) => {
    const blocked = ['rm -rf /', 'mkfs', 'dd if=', ':(){'];
    if (blocked.some(b => command.includes(b))) return errorResult(`Command blocked: ${command}`);
    try {
      const output = execSync(command, { encoding: 'utf-8', cwd: cwd ? resolvePath(cwd) : projectRoot, timeout, maxBuffer: 10 * 1024 * 1024 });
      return textResult(output);
    } catch (err: any) {
      return errorResult(`Shell exec failed: ${err.message}`);
    }
  });

  server.registerTool("run_node", {
    description: "Execute JavaScript/Node.js code",
    inputSchema: { code: z.string().describe("JavaScript code to execute") }
  }, async ({ code }: { code: string }) => {
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

  // --- Memory ---
  server.registerTool("memory_store", {
    description: "Store a value in persistent long-term memory",
    inputSchema: {
      key: z.string().describe("Unique key for this memory"),
      value: z.any().describe("Value to store"),
      tags: z.array(z.string()).optional().describe("Optional tags")
    }
  }, async ({ key, value, tags }: { key: string; value: any; tags?: string[] }) => {
    const now = new Date().toISOString();
    const existing = memoryData.entries[key];
    memoryData.entries[key] = { value, created: existing?.created || now, updated: now, tags: tags || existing?.tags };
    saveMemoryStore(memoryData);
    return textResult(`Stored "${key}" in memory`);
  });

  server.registerTool("memory_retrieve", {
    description: "Retrieve a memory by key",
    inputSchema: { key: z.string().describe("Key to retrieve") }
  }, async ({ key }: { key: string }) => {
    const entry = memoryData.entries[key];
    return entry ? textResult(JSON.stringify({ key, ...entry }, null, 2)) : errorResult(`Memory "${key}" not found`);
  });

  server.registerTool("memory_list", {
    description: "List stored memories",
    inputSchema: { tag: z.string().optional() }
  }, async ({ tag }: { tag?: string } = {}) => {
    let entries = Object.entries(memoryData.entries);
    if (tag) entries = entries.filter(([_, e]) => e.tags?.includes(tag));
    const result = entries.map(([key, e]) => ({ key, type: typeof e.value, tags: e.tags || [], updated: e.updated }));
    return textResult(JSON.stringify(result, null, 2));
  });

  server.registerTool("memory_delete", {
    description: "Delete a memory",
    inputSchema: { key: z.string() }
  }, async ({ key }: { key: string }) => {
    if (memoryData.entries[key]) { delete memoryData.entries[key]; saveMemoryStore(memoryData); return textResult(`Deleted "${key}"`); }
    return errorResult(`Memory "${key}" not found`);
  });

  // --- Process ---
  server.registerTool("process_list", {
    description: "List running processes",
    inputSchema: { filter: z.string().optional() }
  }, async ({ filter }: { filter?: string }) => {
    try {
      const cmd = process.platform === 'win32' ? 'tasklist' : 'ps aux';
      let output = execSync(cmd, { encoding: 'utf-8' });
      if (filter) output = output.split('\n').filter(l => l.toLowerCase().includes(filter.toLowerCase())).join('\n');
      return textResult(output || 'No matches');
    } catch (err: any) {
      return errorResult(`Process list failed: ${err.message}`);
    }
  });

  server.registerTool("process_kill", {
    description: "Kill a process",
    inputSchema: { target: z.string(), force: z.boolean().optional() }
  }, async ({ target, force = false }: { target: string; force?: boolean }) => {
    const protected_p = ['init', 'systemd', 'explorer.exe', 'winlogon.exe'];
    if (protected_p.some(p => target.toLowerCase().includes(p))) return errorResult(`Protected process: ${target}`);
    try {
      const isWin = process.platform === 'win32';
      const isPid = /^\d+$/.test(target);
      const cmd = isWin ? `taskkill ${force ? '/F' : ''} /${isPid ? 'PID' : 'IM'} ${target}` : `kill ${force ? '-9' : '-15'} ${target}`;
      execSync(cmd, { encoding: 'utf-8' });
      return textResult(`Killed ${target}`);
    } catch (err: any) {
      return errorResult(`Kill failed: ${err.message}`);
    }
  });

  // --- Text & Archive ---
  server.registerTool("text_summarize", {
    description: "Summarize text",
    inputSchema: { text: z.string(), maxSentences: z.number().optional() }
  }, async ({ text, maxSentences = 3 }: { text: string; maxSentences?: number }) => {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    return textResult(sentences.slice(0, maxSentences).join(' ').trim());
  });

  server.registerTool("zip_create", {
    description: "Create zip archive",
    inputSchema: { output: z.string(), sources: z.array(z.string()) }
  }, async ({ output, sources }: { output: string; sources: string[] }) => {
    const outPath = resolvePath(output);
    if (!isPathInProject(outPath)) return errorResult("Access denied");
    try {
      const cmd = process.platform === 'win32' 
        ? `powershell -Command "Compress-Archive -Path '${sources.map(s => resolvePath(s)).join(",")}' -DestinationPath '${outPath}' -Force"`
        : `zip -r "${outPath}" ${sources.map(s => `"${resolvePath(s)}"`).join(' ')}`;
      execSync(cmd, { encoding: 'utf-8', timeout: 60000 });
      return textResult(`Created ${output}`);
    } catch (err: any) {
      return errorResult(`Zip failed: ${err.message}`);
    }
  });
}
