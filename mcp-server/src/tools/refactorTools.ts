import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
// @ts-ignore - database package doesn't emit declarations properly
import { FileSplitter } from "@summy/database";
import { textResult, errorResult } from "../utils/helpers.js";
import { resolvePath, isPathInProject } from "../utils/fs.js";
import path from "path";

export function registerRefactorTools(server: McpServer) {
  server.registerTool("refactor_split_file", {
    description: "Automatically refactor a large file by splitting its functions and classes into separate, focused modules.",
    inputSchema: {
      path: z.string().describe("Path to the file to split"),
      outputDir: z.string().optional().describe("Directory where the new modules should be created. Defaults to a folder named after the file."),
      minLines: z.number().optional().default(100).describe("Minimum lines required to trigger a split."),
      createBarrel: z.boolean().optional().default(true).describe("Whether to create an index.ts (barrel) file.")
    }
  }, async ({ path: filePath, outputDir, minLines, createBarrel }: { 
    path: string; 
    outputDir?: string; 
    minLines?: number; 
    createBarrel?: boolean 
  }) => {
    const fullPath = resolvePath(filePath);
    if (!isPathInProject(fullPath)) return errorResult("Access denied: Path outside project root");

    // Default output directory: folder with the same name as the file (without extension)
    const fileName = path.basename(fullPath, path.extname(fullPath));
    const targetDir = outputDir 
      ? resolvePath(outputDir) 
      : path.join(path.dirname(fullPath), fileName);

    if (outputDir && !isPathInProject(targetDir)) {
      return errorResult("Access denied: Output directory outside project root");
    }

    try {
      const splitter = new FileSplitter();
      await splitter.splitFile(fullPath, targetDir, {
        minLines,
        createBarrel,
        dryRun: false
      });

      return textResult(`Successfully refactored ${filePath}. 
New modules created in: ${path.relative(process.cwd(), targetDir)}
${createBarrel ? 'Barrel export (index.ts) generated.' : ''}`);
    } catch (err: any) {
      console.error(`[MCP] refactor_split_file failed: ${err.message}`);
      return errorResult(`Refactoring failed: ${err.message}`);
    }
  });
}
