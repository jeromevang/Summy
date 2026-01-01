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

// ============================================================
// MCP SERVER SETUP
// ============================================================

// ... (config parsing code) ...

export const server = new McpServer({
  name: "summy-mcp-server",
  version: "2.1.0"
});

// Store config on the server instance for tools to access if needed
(server as any).modelConfig = modelConfig;

// Register all tool categories
registerUtilityTools(server);
registerFileTools(server);
registerGitTools(server);
registerNpmTools(server);
registerHttpTools(server);
registerBrowserTools(server);
registerRagTools(server);
registerTracingTools(server);
registerSystemTools(server);
registerRefactorTools(server);

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