/**
 * MCP Server for Tooly
 * Provides tool execution capabilities via Model Context Protocol
 */

import fs from "fs-extra";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { closeBrowser } from "./utils/browser.js";

// Tool registrations
import { registerUtilityTools } from "./tools/utilityTools.js";
import { registerFileTools } from "./tools/fileTools.js";
import { registerGitTools } from "./tools/gitTools.js";
import { registerNpmTools } from "./tools/npmTools.js";
import { registerHttpTools } from "./tools/httpTools.js";
import { registerBrowserTools } from "./tools/browserTools.js";
import { registerRagTools } from "./tools/ragTools.js";
import { registerTracingTools } from "./tools/tracingTools.js";
import { registerSystemTools } from "./tools/systemTools.js";
import { registerRefactorTools } from "./tools/refactorTools.js";
import { TOOLSET_PRESETS, ToolCategory } from "./config/toolset-presets.js";
import { getMCPConfig } from "./utils/settings.js";

// ============================================================
// MCP SERVER SETUP
// ============================================================

// ... (config parsing code) ...

export const server = new McpServer({
  name: "summy-mcp-server",
  version: "2.1.0"
});

// Store config on the server instance for tools to access if needed (placeholder)
const modelConfig = {}; // Config loading logic to be implemented
(server as any).modelConfig = modelConfig;

// ============================================================
// CONDITIONAL TOOL REGISTRATION
// ============================================================

// Read toolset configuration
const mcpConfig = getMCPConfig();
const toolset = mcpConfig.toolset || 'standard';

// Get categories to register
let categories: ToolCategory[] = [];
if (toolset === 'custom') {
  categories = mcpConfig.customCategories || [];
  console.error(`[MCP] Loading custom toolset with ${categories.length} categories`);
} else {
  const preset = TOOLSET_PRESETS[toolset];
  categories = preset.categories;
  console.error(`[MCP] Loading "${toolset}" toolset preset`);
  console.error(`[MCP] Description: ${preset.description}`);
  console.error(`[MCP] Estimated tokens: ${preset.estimatedTokens}`);
}

console.error(`[MCP] Tool categories:`, categories.join(', '));

// Always register utility and HTTP tools (core functionality)
registerUtilityTools(server);
registerHttpTools(server);
registerTracingTools(server); // Internal monitoring, always enabled

// Conditionally register tool categories based on preset
if (categories.includes('file_ops')) {
  console.error('[MCP] ✓ Registering file operations tools');
  registerFileTools(server);
}

if (categories.includes('git')) {
  console.error('[MCP] ✓ Registering git tools');
  registerGitTools(server);
}

if (categories.includes('npm')) {
  console.error('[MCP] ✓ Registering npm tools');
  registerNpmTools(server);
}

if (categories.includes('browser')) {
  console.error('[MCP] ✓ Registering browser automation tools');
  registerBrowserTools(server);
}

if (categories.includes('rag')) {
  console.error('[MCP] ✓ Registering RAG search tools');
  registerRagTools(server);
}

if (categories.includes('refactor')) {
  console.error('[MCP] ✓ Registering refactor tools');
  registerRefactorTools(server);
}

if (categories.includes('system')) {
  console.error('[MCP] ✓ Registering system tools');
  registerSystemTools(server);
}

if (categories.includes('memory')) {
  console.error('[MCP] ✓ Registering memory tools');
  // Memory tools are part of system tools in current implementation
  // If separate, would need registerMemoryTools(server);
}

console.error(`[MCP] Registered toolset with ${categories.length} optional categories`);

// ============================================================
// SERVER START
// ============================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[MCP] Summy MCP Server running on stdio");
}

main().catch((error) => {
  console.error("[MCP] Fatal error in main():", error);
  process.exit(1);
});

// Cleanup on exit
process.on('SIGINT', async () => {
  await closeBrowser();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closeBrowser();
  process.exit(0);
});