import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { textResult, errorResult } from "../utils/helpers.js";

const mcpRules = {
  tool_use_policy: "prefer_tools",
  security: "only operate on files within the project directory",
  search_strategy: {
    priority: "ALWAYS use rag_query FIRST for any code search, understanding, or exploration task",
    guidance: [
      "Use rag_query for: 'find X', 'where is Y handled', 'how does Z work', 'search for', 'look for'",
      "rag_query uses semantic AI search - finds code by meaning, not just exact text matches",
      "A single rag_query call replaces multiple grep/search calls - much more efficient",
      "Only use grep/search_files AFTER rag_query if you need exact regex patterns"
    ]
  },
  rag_tools: {
    rag_query: "PREFERRED: Semantic AI code search - finds relevant code in one call",
    rag_status: "Check RAG indexing status and statistics",
    rag_index: "Index a project directory for semantic search"
  },
  code_aware_tools: {
    find_symbol: "Find functions, classes, interfaces by name",
    get_callers: "Get all functions that call a specific function",
    get_file_interface: "Get exports, imports, and dependents of a file",
    get_dependencies: "Get what files import/depend on a specific file",
    get_code_stats: "Get codebase statistics (modules, symbols, relationships)"
  },
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
    file_search: "search for text in files (use rag_query first for semantic search)",
    folder_create: "create directories",
    folder_delete: "delete directories"
  }
};

const sessionEnv: Record<string, string> = {};

export function registerUtilityTools(server: McpServer) {
  server.registerTool("mcp_rules", { description: "Get tool policies and rules" }, async () =>
    textResult(JSON.stringify(mcpRules, null, 2))
  );

  server.registerTool("env_get", {
    description: "Get an environment variable value",
    inputSchema: { name: z.string().describe("Environment variable name") }
  }, async ({ name }: { name: string }) => {
    console.error(`[MCP] env_get: ${name}`);
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
    console.error(`[MCP] env_set: ${name}=${value}`);
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
    console.error(`[MCP] json_parse: path=${jsonPath || 'root'}`);
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
}
