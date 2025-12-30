import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { execSync } from "child_process";
import { textResult, errorResult } from "../utils/helpers.js";

export function registerGitTools(server: McpServer) {
  server.registerTool("git_status", { description: "Get git repository status" }, async () => {
    console.error(`[MCP] git_status`);
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
    console.error(`[MCP] git_diff: ${file || 'all'} (staged: ${staged})`);
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
    console.error(`[MCP] git_log: ${count} commits, format: ${format}`);
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
    console.error(`[MCP] git_init`);
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
    console.error(`[MCP] git_add: ${file}`);
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
    console.error(`[MCP] git_commit: ${message}`);
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
    console.error(`[MCP] git_push: ${remote} ${branch || ''}`);
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
    console.error(`[MCP] git_pull: ${remote} ${branch || ''}`);
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
    console.error(`[MCP] git_checkout: ${target} (create: ${create})`);
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
    console.error(`[MCP] git_stash: ${message || 'no message'}`);
    try {
      const msgArg = message ? `-m "${message}"` : "";
      const output = execSync(`git stash ${msgArg}`, { encoding: 'utf-8' });
      return textResult(output || "Changes stashed");
    } catch (err: any) {
      return errorResult(`Git stash failed: ${err.message}`);
    }
  });

  server.registerTool("git_stash_pop", { description: "Apply and remove the latest stash" }, async () => {
    console.error(`[MCP] git_stash_pop`);
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
    console.error(`[MCP] git_reset: ${mode} ${target}`);
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
    console.error(`[MCP] git_clone: ${url}`);
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
    console.error(`[MCP] git_branch_create: ${name}`);
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
    console.error(`[MCP] git_branch_list (all: ${all})`);
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
    console.error(`[MCP] git_blame: ${file}`);
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
    console.error(`[MCP] git_show: ${ref}`);
    try {
      const statFlag = stat ? "--stat" : "";
      return textResult(execSync(`git show ${statFlag} ${ref}`, { encoding: 'utf-8' }));
    } catch (err: any) {
      return errorResult(`Git show failed: ${err.message}`);
    }
  });
}
