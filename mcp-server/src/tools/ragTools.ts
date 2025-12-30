import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { textResult, errorResult } from "../utils/helpers.js";

const RAG_SERVER_URL = process.env.RAG_SERVER_URL || 'http://localhost:3002';

export function registerRagTools(server: McpServer) {
  server.registerTool("rag_query", {
    description: "PREFERRED CODE SEARCH: Semantic AI-powered search that finds relevant code by meaning in a single call. Use this FIRST for any code search task like 'find X', 'where is Y', 'how does Z work'. Returns code snippets with file paths, line numbers, symbols, and relevance scores. Much more efficient than multiple grep calls.",
    inputSchema: z.object({
      query: z.string().describe("Natural language query - ask like you would ask a colleague: 'where is authentication handled', 'how does the database connect'"),
      limit: z.number().optional().describe("Maximum number of results to return (default: 5)"),
      fileTypes: z.array(z.string()).optional().describe("Filter by file types (e.g., ['ts', 'js', 'py'])"),
      paths: z.array(z.string()).optional().describe("Filter by path patterns (e.g., ['src/', 'lib/'])")
    })
  }, async (args) => {
    try {
      const response = await fetch(`${RAG_SERVER_URL}/api/rag/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: args.query,
          limit: args.limit || 5,
          filter: {
            fileTypes: args.fileTypes,
            paths: args.paths
          }
        })
      });

      if (!response.ok) {
        const error = await response.text();
        return errorResult(`RAG query failed: ${error}`);
      }

      const data = await response.json();

      if (!data.results || data.results.length === 0) {
        return textResult("No relevant code found for your query.");
      }

      let output = `Found ${data.results.length} relevant code snippets (latency: ${data.latency}ms):

`;

      for (let i = 0; i < data.results.length; i++) {
        const r = data.results[i];
        output += `--- Result ${i + 1} (score: ${(r.score * 100).toFixed(1)}%) ---
`;
        output += `File: ${r.filePath}:${r.startLine}-${r.endLine}
`;
        if (r.symbolName) {
          output += `Symbol: ${r.symbolName} (${r.symbolType})
`;
        }
        output += `
${r.snippet}

`;
      }

      return textResult(output);
    } catch (err: any) {
      if (err.message.includes('ECONNREFUSED')) {
        return errorResult("RAG server is not running. Start it with 'npm run dev:rag'");
      }
      return errorResult(`RAG query error: ${err.message}`);
    }
  });

  server.registerTool("rag_status", {
    description: "Get the status of the RAG indexing system",
    inputSchema: z.object({})
  }, async () => {
    try {
      const response = await fetch(`${RAG_SERVER_URL}/api/rag/stats`);

      if (!response.ok) {
        return errorResult("Failed to get RAG status");
      }

      const stats = await response.json();

      let output = "RAG System Status:\n";
      output += `  Project: ${stats.projectPath || 'Not configured'}\n`;
      output += `  Status: ${stats.status}\n`;
      output += `  Files indexed: ${stats.totalFiles}\n`;
      output += `  Chunks: ${stats.totalChunks}\n`;
      output += `  Vectors: ${stats.totalVectors}\n`;
      output += `  Embedding model: ${stats.embeddingModel || 'Not configured'}\n`;
      output += `  Model loaded: ${stats.embeddingModelLoaded}\n`;
      output += `  File watcher: ${stats.fileWatcherActive ? 'Active' : 'Inactive'}\n`;

      return textResult(output);
    } catch (err: any) {
      if (err.message.includes('ECONNREFUSED')) {
        return errorResult("RAG server is not running. Start it with 'npm run dev:rag'");
      }
      return errorResult(`RAG status error: ${err.message}`);
    }
  });

  server.registerTool("rag_index", {
    description: "Start indexing a project directory for semantic search",
    inputSchema: z.object({
      projectPath: z.string().describe("Absolute path to the project directory to index")
    })
  }, async (args) => {
    try {
      const response = await fetch(`${RAG_SERVER_URL}/api/rag/index`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath: args.projectPath })
      });

      if (!response.ok) {
        const error = await response.json();
        return errorResult(`Failed to start indexing: ${error.error}`);
      }

      return textResult(`Indexing started for: ${args.projectPath}\nUse rag_status to check progress.`);
    } catch (err: any) {
      if (err.message.includes('ECONNREFUSED')) {
        return errorResult("RAG server is not running. Start it with 'npm run dev:rag'");
      }
      return errorResult(`RAG index error: ${err.message}`);
    }
  });

  server.registerTool("find_symbol", {
    description: "Find functions, classes, interfaces, or other symbols by name. Use this when you need to find a specific function or class definition.",
    inputSchema: z.object({
      name: z.string().describe("Symbol name to search for (partial match)"),
      type: z.enum(['function', 'class', 'interface', 'method', 'type', 'variable']).optional().describe("Filter by symbol type"),
      exported: z.boolean().optional().describe("Only return exported/public symbols"),
      limit: z.number().optional().describe("Maximum results (default: 10)")
    })
  }, async (args) => {
    try {
      const response = await fetch(`${RAG_SERVER_URL}/api/rag/symbols/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: args.name,
          type: args.type,
          exported: args.exported,
          limit: args.limit || 10
        })
      });

      if (!response.ok) {
        return errorResult(`Symbol search failed: ${await response.text()}`);
      }

      const data = await response.json();
      
      if (!data.symbols || data.symbols.length === 0) {
        return textResult(`No symbols found matching "${args.name}"`);
      }

      let output = `Found ${data.symbols.length} symbols:

`;
      for (const sym of data.symbols) {
        output += `${sym.type} ${sym.name}`;
        if (sym.isExported) output += ' (exported)';
        output += `
  File: ${sym.filePath}:${sym.startLine}-${sym.endLine}
`;
        if (sym.signature) output += `  Signature: ${sym.signature}
`;
        if (sym.docComment) output += `  Doc: ${sym.docComment.slice(0, 100)}...
`;
        output += '\n';
      }

      return textResult(output);
    } catch (err: any) {
      if (err.message.includes('ECONNREFUSED')) {
        return errorResult("RAG server is not running.");
      }
      return errorResult(`Symbol search error: ${err.message}`);
    }
  });

  server.registerTool("get_callers", {
    description: "Get all functions/methods that call a specific function. Useful for understanding code impact and dependencies.",
    inputSchema: z.object({
      symbolName: z.string().describe("Name of the function/method to find callers for"),
      filePath: z.string().optional().describe("Narrow down to a specific file if there are multiple symbols with the same name")
    })
  }, async (args) => {
    try {
      const response = await fetch(`${RAG_SERVER_URL}/api/rag/symbols/callers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbolName: args.symbolName,
          filePath: args.filePath
        })
      });

      if (!response.ok) {
        return errorResult(`Get callers failed: ${await response.text()}`);
      }

      const data = await response.json();
      
      if (!data.callers || data.callers.length === 0) {
        return textResult(`No callers found for "${args.symbolName}". This function might not be called anywhere, or call tracking is not yet available.`);
      }

      let output = `Functions that call "${args.symbolName}" (${data.callers.length}):\n\n`;
      for (const caller of data.callers) {
        output += `- ${caller.name} in ${caller.filePath}:${caller.line}\n`;
      }

      return textResult(output);
    } catch (err: any) {
      return errorResult(`Get callers error: ${err.message}`);
    }
  });

  server.registerTool("get_file_interface", {
    description: "Analyze a file to get its exports, imports, and top-level symbols. Helps understand a file's contract without reading all its code.",
    inputSchema: z.object({
      filePath: z.string().describe("Path to the file to analyze")
    })
  }, async (args) => {
    try {
      const response = await fetch(`${RAG_SERVER_URL}/api/rag/symbols/interface`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: args.filePath })
      });

      if (!response.ok) {
        return errorResult(`Get file interface failed: ${await response.text()}`);
      }

      const data = await response.json();
      
      let output = `Interface for ${args.filePath}:\n\n`;
      
      output += `Exports (${data.exports.length}):\n`;
      for (const exp of data.exports) {
        output += `- ${exp.type} ${exp.name}\n`;
      }
      
      output += `\nImports (${data.imports.length}):\n`;
      for (const imp of data.imports) {
        output += `- ${imp.name} from '${imp.source}'\n`;
      }

      return textResult(output);
    } catch (err: any) {
      return errorResult(`Get file interface error: ${err.message}`);
    }
  });
}
