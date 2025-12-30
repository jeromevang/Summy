import fs from 'fs/promises';
import { ragClient } from '../../../services/rag-client.js';
import { failureLog } from '../../../services/failure-log.js';
import { startSpan, endSpan } from './utils/tracing.js';
import { ToolResult } from './utils/types.js';

export async function executeToolCall(toolCall: any, modelId: string = 'unknown', traceId?: string, parentSpanId?: string): Promise<ToolResult> {
  const name = toolCall.function?.name || toolCall.name;
  const toolCallId = toolCall.id || `tool_${Date.now()}`;
  
  let args: any = {};
  try {
    const argsStr = toolCall.function?.arguments || toolCall.arguments || '{}';
    args = typeof argsStr === 'string' ? JSON.parse(argsStr) : argsStr;
  } catch (e) {
    return { toolCallId, name, result: `Failed to parse tool arguments: ${e}`, success: false };
  }

  const spanId = traceId ? startSpan(traceId, `tool:${name}`, parentSpanId, { tool: name, args: Object.keys(args) }) : '';
  
  try {
    let result: string = '';
    let success = true;

    switch (name) {
      case 'rag_query': {
        const res = await ragClient.query(args.query, { limit: args.limit || args.topK || 5, fileTypes: args.fileTypes, paths: args.paths });
        if (!res || res.results.length === 0) result = 'No relevant code found.';
        else {
          result = `Found ${res.results.length} relevant code snippets:\n\n`;
          for (const r of res.results) result += `--- Result ---
File: ${r.filePath}

\`\`\`
${r.snippet}
\`\`\`

`;
        }
        break;
      }
      case 'read_file': {
        const path = args.path || args.file_path || args.filePath;
        if (!path) return { toolCallId, name, result: 'path is required', success: false };
        result = await fs.readFile(path, 'utf-8');
        break;
      }
      case 'list_directory': {
        const path = args.path || args.directory || '.';
        const entries = await fs.readdir(path, { withFileTypes: true });
        result = entries.map(e => `${e.isDirectory() ? '[DIR]' : '[FILE]'} ${e.name}`).join('\n');
        break;
      }
      // Add other cases as needed or use MCP fallback
      default: {
        const axios = (await import('axios')).default;
        const mcpName = name.replace(/^extra_tools_/, '');
        const response = await axios.post(`http://localhost:3006/tools/${mcpName}`, args, { timeout: 30000 });
        const content = response.data?.content;
        result = Array.isArray(content) ? content.map((c: any) => c.text || c).join('\n') : (typeof content === 'string' ? content : JSON.stringify(response.data));
      }
    }

    if (traceId && spanId) endSpan(traceId, spanId, 'success', { resultLength: result.length });
    return { toolCallId, name, result, success };
  } catch (error: any) {
    failureLog.logFailure({ modelId, category: 'tool', tool: name, error: error.message, query: JSON.stringify(args) });
    if (traceId && spanId) endSpan(traceId, spanId, 'error', { error: error.message });
    return { toolCallId, name, result: `Tool execution failed: ${error.message}`, success: false };
  }
}
