import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { execSync } from "child_process";
import { textResult, errorResult } from "../utils/helpers.js";

export function registerNpmTools(server: McpServer) {
  server.registerTool("npm_run", {
    description: "Run an npm script",
    inputSchema: { script: z.string().describe("Script name to run") }
  }, async ({ script }: { script: string }) => {
    console.error(`[MCP] npm_run: ${script}`);
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
    console.error(`[MCP] npm_install: ${pkg || 'all'}`);
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
    console.error(`[MCP] npm_uninstall: ${pkg}`);
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
    console.error(`[MCP] npm_init`);
    try {
      return textResult(execSync(`npm init ${yes ? "-y" : ""}`, { encoding: 'utf-8' }));
    } catch (err: any) {
      return errorResult(`npm init failed: ${err.message}`);
    }
  });

  server.registerTool("npm_test", { description: "Run npm test" }, async () => {
    console.error(`[MCP] npm_test`);
    try {
      return textResult(execSync("npm test", { encoding: 'utf-8', timeout: 120000 }));
    } catch (err: any) {
      return errorResult(`npm test failed: ${err.message}`);
    }
  });

  server.registerTool("npm_build", { description: "Run npm build" }, async () => {
    console.error(`[MCP] npm_build`);
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
    console.error(`[MCP] npm_list (depth: ${depth})`);
    try {
      return textResult(execSync(`npm list --depth=${depth}`, { encoding: 'utf-8' }));
    } catch (err: any) {
      return textResult(err.stdout || err.message);
    }
  });
}
