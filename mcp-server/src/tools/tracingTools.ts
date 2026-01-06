import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { textResult, errorResult } from "../utils/helpers.js";
// @ts-ignore - database package doesn't emit declarations properly
import { codeIndexService } from "@summy/database";

export function registerTracingTools(server: McpServer) {
  
  server.registerTool("find_components", {
    description: "Find UI components or hooks by functionality or name. Uses the code index for fast lookups.",
    inputSchema: z.object({
      query: z.string().describe("Name or partial name of the component/hook"),
      type: z.enum(['component', 'hook']).optional().describe("Filter by type")
    })
  }, async (args) => {
    try {
      const results = await codeIndexService.searchSymbols(args.query, args.type);
      
      if (!results || results.length === 0) {
        return textResult(`No ${args.type || 'components'} found matching "${args.query}"`);
      }

      let output = `Found ${results.length} matches:\n\n`;
      for (const r of results.slice(0, 10)) { // Limit to 10
        output += `[${r.symbol_type}] ${r.symbol_name} in ${r.file_path}:${r.start_line}\n`;
        if (r.doc_comment) output += `   Doc: ${r.doc_comment.slice(0, 100).replace(/\n/g, ' ')}...\n`;
      }
      
      if (results.length > 10) output += `\n...and ${results.length - 10} more.`;

      return textResult(output);
    } catch (err: any) {
      return errorResult(`Find components error: ${err.message}`);
    }
  });

  server.registerTool("trace_function", {
    description: "Trace a function's dependencies. Shows who calls it (upstream) and what it calls (downstream). Essential for understanding impact analysis.",
    inputSchema: z.object({
      symbolName: z.string().describe("Exact name of the function/symbol"),
      direction: z.enum(['upstream', 'downstream', 'both']).default('both').describe("Direction to trace")
    })
  }, async (args) => {
    try {
      // 1. Find the chunk first
      const chunks = await codeIndexService.searchSymbols(args.symbolName);
      if (!chunks || chunks.length === 0) return textResult(`Symbol "${args.symbolName}" not found in index.`);
      
      // If multiple, just pick first or list them? Let's pick first for now but warn.
      const chunk = chunks[0];
      const chunkId = chunk.id;

      let output = `Tracing "${chunk.symbol_name}" (${chunk.file_path}:${chunk.start_line})\n`;
      if (chunks.length > 1) output += `(Warning: ${chunks.length} symbols matched "${args.symbolName}", using first one)\n`;
      output += `--------------------------------------------------\n`;

      if (args.direction !== 'downstream') {
        const callers = await codeIndexService.getCallers(chunkId);
        output += `\nCalled By (${callers.length}):\n`;
        callers.forEach((c: any) => output += `  <- ${c.symbol_name} (${c.file_path})\n`);
      }

      if (args.direction !== 'upstream') {
        const callees = await codeIndexService.getCallees(chunkId);
        output += `\nCalls (${callees.length}):\n`;
        callees.forEach((c: any) => output += `  -> ${c.symbol_name} (${c.file_path})\n`);
      }

      return textResult(output);
    } catch (err: any) {
      return errorResult(`Trace error: ${err.message}`);
    }
  });

  server.registerTool("read_component", {
    description: "Read a component's code along with its immediate dependencies' signatures. Gives context without reading 10 files.",
    inputSchema: z.object({
      componentName: z.string().describe("Name of the component to read")
    })
  }, async (args) => {
    try {
      const chunks = await codeIndexService.searchSymbols(args.componentName, 'component');
      if (!chunks || chunks.length === 0) return textResult(`Component "${args.componentName}" not found.`);
      
      const chunk = chunks[0];
      let output = `File: ${chunk.file_path}\n`;
      output += `\n${chunk.content}\n`;

      // Get dependencies to add context
      const callees = await codeIndexService.getCallees(chunk.id);
      if (callees.length > 0) {
        output += `\n--- Dependencies ---\n`;
        for (const dep of callees) {
          // Show signature if available, else just name
          const sig = dep.signature || `${dep.symbol_type} ${dep.symbol_name}`;
          output += `${sig} // from ${dep.file_path}\n`;
        }
      }

      return textResult(output);
    } catch (err: any) {
      return errorResult(`Read component error: ${err.message}`);
    }
  });
}
