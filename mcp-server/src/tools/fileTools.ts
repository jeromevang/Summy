import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { textResult, errorResult } from "../utils/helpers.js";
import { resolvePath, isPathInProject, isIgnored } from "../utils/fs.js";

export function registerFileTools(server: McpServer) {
  server.registerTool("read_file", {
    description: "Read the complete contents of a file from the file system",
    inputSchema: { path: z.string().describe("Path to the file to read") }
  }, async ({ path: filePath }: { path: string }) => {
    console.error(`[MCP] read_file: ${filePath}`);
    const fullPath = resolvePath(filePath);
    if (!isPathInProject(fullPath)) return errorResult("Access denied: Path outside allowed directories");
    try {
      return textResult(fs.readFileSync(fullPath, "utf-8"));
    } catch (err: any) {
      return errorResult(`Failed to read file: ${err.message}`);
    }
  });

  server.registerTool("read_multiple_files", {
    description: "Read the contents of multiple files simultaneously",
    inputSchema: {
      paths: z.array(z.string()).describe("Array of file paths to read")
    }
  }, async ({ paths }: { paths: string[] }) => {
    console.error(`[MCP] read_multiple_files: ${paths.length} files`);
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

  server.registerTool("write_file", {
    description: "Create a new file or completely overwrite an existing file with new content",
    inputSchema: {
      path: z.string().describe("Path where the file will be created or overwritten"),
      content: z.string().describe("Content to write to the file")
    }
  }, async ({ path: filePath, content }: { path: string; content: string }) => {
    console.error(`[MCP] write_file: ${filePath}`);
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
    console.error(`[MCP] edit_file: ${filePath} (${edits.length} edits, dryRun: ${dryRun})`);
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
        changes.push(`Replaced: "${edit.oldText.slice(0, 30)}..." -> "${edit.newText.slice(0, 30)}..."`);
      }

      if (dryRun) {
        return textResult(`Dry run - changes that would be made:
${changes.join('\n')}`);
      }

      fs.writeFileSync(fullPath, content, "utf-8");
      return textResult(`Successfully edited ${filePath}
${changes.join('\n')}`);
    } catch (err: any) {
      return errorResult(`Edit failed: ${err.message}`);
    }
  });

  server.registerTool("delete_file", {
    description: "Delete a file from the file system",
    inputSchema: { path: z.string().describe("Path to the file to delete") }
  }, async ({ path: filePath }: { path: string }) => {
    console.error(`[MCP] delete_file: ${filePath}`);
    const fullPath = resolvePath(filePath);
    if (!isPathInProject(fullPath)) return errorResult("Access denied: Path outside allowed directories");
    try {
      fs.unlinkSync(fullPath);
      return textResult(`Successfully deleted ${filePath}`);
    } catch (err: any) {
      return errorResult(`Failed to delete file: ${err.message}`);
    }
  });

  server.registerTool("copy_file", {
    description: "Copy a file to a new location",
    inputSchema: {
      source: z.string().describe("Source file path"),
      destination: z.string().describe("Destination file path")
    }
  }, async ({ source, destination }: { source: string; destination: string }) => {
    console.error(`[MCP] copy_file: ${source} -> ${destination}`);
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

  server.registerTool("move_file", {
    description: "Move or rename a file or directory",
    inputSchema: {
      sourcePath: z.string().describe("Current path of the file or directory"),
      destinationPath: z.string().describe("New path for the file or directory")
    }
  }, async ({ sourcePath, destinationPath }: { sourcePath: string; destinationPath: string }) => {
    console.error(`[MCP] move_file: ${sourcePath} -> ${destinationPath}`);
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

  server.registerTool("get_file_info", {
    description: "Retrieve detailed metadata about a file or directory",
    inputSchema: { path: z.string().describe("Path to the file or directory") }
  }, async ({ path: filePath }: { path: string }) => {
    console.error(`[MCP] get_file_info: ${filePath}`);
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

  server.registerTool("list_directory", {
    description: "Get a detailed listing of files and directories in a specified path (respects .gitignore)",
    inputSchema: {
      path: z.string().describe("Path to the directory to list"),
      showIgnored: z.boolean().optional().describe("Include gitignored files (default: false)")
    }
  }, async ({ path: dirPath, showIgnored = false }: { path: string; showIgnored?: boolean }) => {
    console.error(`[MCP] list_directory: ${dirPath} (showIgnored: ${showIgnored})`);
    const fullPath = resolvePath(dirPath);
    if (!isPathInProject(fullPath)) return errorResult("Access denied: Path outside allowed directories");
    try {
      const entries = fs.readdirSync(fullPath, { withFileTypes: true });
      const results = entries
        .filter(entry => showIgnored || !isIgnored(fullPath, entry.name))
        .map(entry => ({
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file',
          size: entry.isFile() ? fs.statSync(path.join(fullPath, entry.name)).size : undefined
        }));
      return textResult(JSON.stringify(results, null, 2));
    } catch (err: any) {
      return errorResult(`Failed to list directory: ${err.message}`);
    }
  });

  server.registerTool("search_files", {
    description: "Search for text in files across the project (use rag_query first for semantic search)",
    inputSchema: {
      pattern: z.string().describe("Text or regex pattern to search for"),
      directory: z.string().optional().describe("Directory to search in (default: project root)"),
      include: z.string().optional().describe("Glob pattern for files to include")
    }
  }, async ({ pattern, directory = ".", include }: { pattern: string; directory?: string; include?: string }) => {
    console.error(`[MCP] search_files: ${pattern} in ${directory}`);
    const fullPath = resolvePath(directory);
    if (!isPathInProject(fullPath)) return errorResult("Access denied: Path outside allowed directories");
    
    try {
      // Simplified search using grep-like logic or direct fs read
      // In a real implementation, you'd use a faster tool like ripgrep
      const results: string[] = [];
      function walk(dir: string) {
        const files = fs.readdirSync(dir, { withFileTypes: true });
        for (const file of files) {
          const res = path.resolve(dir, file.name);
          if (isIgnored(dir, file.name)) continue;
          if (file.isDirectory()) {
            walk(res);
          } else {
            const content = fs.readFileSync(res, 'utf-8');
            if (content.includes(pattern)) {
              results.push(path.relative(process.cwd(), res));
            }
          }
        }
      }
      walk(fullPath);
      return textResult(JSON.stringify(results, null, 2));
    } catch (err: any) {
      return errorResult(`Search failed: ${err.message}`);
    }
  });

  server.registerTool("create_directory", {
    description: "Create a new directory",
    inputSchema: { path: z.string().describe("Path to the directory to create") }
  }, async ({ path: dirPath }: { path: string }) => {
    const fullPath = resolvePath(dirPath);
    if (!isPathInProject(fullPath)) return errorResult("Access denied: Path outside allowed directories");
    try {
      fs.mkdirSync(fullPath, { recursive: true });
      return textResult(`Successfully created directory ${dirPath}`);
    } catch (err: any) {
      return errorResult(`Failed to create directory: ${err.message}`);
    }
  });

  server.registerTool("delete_directory", {
    description: "Delete a directory and its contents",
    inputSchema: { path: z.string().describe("Path to the directory to delete") }
  }, async ({ path: dirPath }: { path: string }) => {
    const fullPath = resolvePath(dirPath);
    if (!isPathInProject(fullPath)) return errorResult("Access denied: Path outside allowed directories");
    try {
      fs.rmSync(fullPath, { recursive: true, force: true });
      return textResult(`Successfully deleted directory ${dirPath}`);
    } catch (err: any) {
      return errorResult(`Failed to delete directory: ${err.message}`);
    }
  });

  server.registerTool("list_allowed_directories", {
    description: "List the root directory that the server is allowed to access"
  }, async () => {
    return textResult(JSON.stringify([process.cwd()], null, 2));
  });
}
