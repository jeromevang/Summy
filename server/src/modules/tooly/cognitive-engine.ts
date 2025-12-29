import { contextPrism } from './context/context-prism.js';
import { decisionEngine } from './context/decision-engine.js';
import { verificationLoop } from './context/verification.js';
import { swarmRouter } from './orchestrator/swarm-router.js';
import { wsBroadcast } from '../../services/ws-broadcast.js';
import { ragClient } from '../../services/rag-client.js';
import { failureLog } from '../../services/failure-log.js';
import fs from 'fs/promises';
import path from 'path';

// ============================================================
// TOOL EXECUTOR - Handles actual tool execution
// ============================================================

interface ToolResult {
    toolCallId: string;
    name: string;
    result: string;
    success: boolean;
}

// ============================================================
// SPAN-LEVEL OBSERVABILITY
// ============================================================

interface Span {
    spanId: string;
    parentSpanId?: string;
    traceId: string;
    operation: string;
    startTime: number;
    endTime?: number;
    durationMs?: number;
    status: 'running' | 'success' | 'error';
    attributes: Record<string, any>;
}

interface Trace {
    traceId: string;
    requestId: string;
    modelId: string;
    startTime: number;
    endTime?: number;
    spans: Span[];
}

let activeTraces: Map<string, Trace> = new Map();

function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function startTrace(requestId: string, modelId: string): string {
    const traceId = generateId();
    const trace: Trace = {
        traceId,
        requestId,
        modelId,
        startTime: Date.now(),
        spans: []
    };
    activeTraces.set(traceId, trace);
    wsBroadcast.broadcast('trace_start', { traceId, requestId, modelId, startTime: trace.startTime });
    return traceId;
}

export function startSpan(traceId: string, operation: string, parentSpanId?: string, attributes: Record<string, any> = {}): string {
    const trace = activeTraces.get(traceId);
    if (!trace) {
        console.warn(`[Observability] No trace found for ${traceId}`);
        return '';
    }
    
    const spanId = generateId();
    const span: Span = {
        spanId,
        parentSpanId,
        traceId,
        operation,
        startTime: Date.now(),
        status: 'running',
        attributes
    };
    
    trace.spans.push(span);
    wsBroadcast.broadcast('span_start', { traceId, spanId, operation, parentSpanId, attributes });
    return spanId;
}

export function endSpan(traceId: string, spanId: string, status: 'success' | 'error' = 'success', attributes: Record<string, any> = {}): void {
    const trace = activeTraces.get(traceId);
    if (!trace) return;
    
    const span = trace.spans.find(s => s.spanId === spanId);
    if (!span) return;
    
    span.endTime = Date.now();
    span.durationMs = span.endTime - span.startTime;
    span.status = status;
    span.attributes = { ...span.attributes, ...attributes };
    
    wsBroadcast.broadcast('span_end', { 
        traceId, 
        spanId, 
        operation: span.operation,
        durationMs: span.durationMs, 
        status, 
        attributes: span.attributes 
    });
}

export function endTrace(traceId: string): Trace | undefined {
    const trace = activeTraces.get(traceId);
    if (!trace) return undefined;
    
    trace.endTime = Date.now();
    const totalDuration = trace.endTime - trace.startTime;
    
    wsBroadcast.broadcast('trace_end', { 
        traceId, 
        requestId: trace.requestId,
        modelId: trace.modelId,
        totalDurationMs: totalDuration,
        spanCount: trace.spans.length,
        spans: trace.spans.map(s => ({
            operation: s.operation,
            durationMs: s.durationMs,
            status: s.status
        }))
    });
    
    activeTraces.delete(traceId);
    return trace;
}

export function getActiveTrace(traceId: string): Trace | undefined {
    return activeTraces.get(traceId);
}

async function executeToolCall(toolCall: any, modelId: string = 'unknown', traceId?: string, parentSpanId?: string): Promise<ToolResult> {
    const name = toolCall.function?.name || toolCall.name;
    const toolCallId = toolCall.id || `tool_${Date.now()}`;
    
    let args: any = {};
    try {
        const argsStr = toolCall.function?.arguments || toolCall.arguments || '{}';
        args = typeof argsStr === 'string' ? JSON.parse(argsStr) : argsStr;
    } catch (e) {
        return {
            toolCallId,
            name,
            result: `Failed to parse tool arguments: ${e}`,
            success: false
        };
    }

    // Start span for tool execution
    const spanId = traceId ? startSpan(traceId, `tool:${name}`, parentSpanId, { 
        tool: name, 
        args: Object.keys(args) 
    }) : '';
    
    console.log(`[AgenticLoop] Executing tool: ${name}`, args);

    try {
        switch (name) {
            // ============================================================
            // RAG TOOLS
            // ============================================================
            case 'rag_query': {
                const queryResult = await ragClient.query(args.query, {
                    limit: args.limit || args.topK || 5,
                    fileTypes: args.fileTypes,
                    paths: args.paths
                });

                if (!queryResult || queryResult.results.length === 0) {
                    return {
                        toolCallId,
                        name,
                        result: 'No relevant code found for your query.',
                        success: true
                    };
                }

                // Format results like the MCP server does
                let output = `Found ${queryResult.results.length} relevant code snippets (latency: ${queryResult.latency}ms):\n\n`;
                for (let i = 0; i < queryResult.results.length; i++) {
                    const r = queryResult.results[i];
                    output += `--- Result ${i + 1} (score: ${(r.score * 100).toFixed(1)}%) ---\n`;
                    output += `File: ${r.filePath}:${r.startLine}-${r.endLine}\n`;
                    if (r.symbolName) {
                        output += `Symbol: ${r.symbolName} (${r.symbolType})\n`;
                    }
                    output += `\`\`\`${r.language}\n${r.snippet}\n\`\`\`\n\n`;
                }

                return { toolCallId, name, result: output, success: true };
            }

            case 'rag_status': {
                const stats = await ragClient.getStats();
                if (!stats) {
                    return { toolCallId, name, result: 'RAG server not available', success: false };
                }
                return {
                    toolCallId,
                    name,
                    result: JSON.stringify(stats, null, 2),
                    success: true
                };
            }

            case 'rag_index': {
                const projectPath = args.projectPath || args.path;
                if (!projectPath) {
                    return { toolCallId, name, result: 'projectPath is required', success: false };
                }
                const indexResult = await ragClient.startIndexing(projectPath);
                return {
                    toolCallId,
                    name,
                    result: indexResult.message,
                    success: indexResult.success
                };
            }

            // ============================================================
            // FILE TOOLS (basic support)
            // ============================================================
            case 'read_file': {
                const filePath = args.path || args.file_path || args.filePath;
                if (!filePath) {
                    return { toolCallId, name, result: 'path is required', success: false };
                }
                try {
                    const content = await fs.readFile(filePath, 'utf-8');
                    return { toolCallId, name, result: content, success: true };
                } catch (e: any) {
                    return { toolCallId, name, result: `Failed to read file: ${e.message}`, success: false };
                }
            }

            // Aliases for list_directory
            case 'ls':
            case 'list_dir':
            case 'list_files':
            case 'list_directory': {
                const dirPath = args.path || args.directory || args.dirPath || '.';
                try {
                    const entries = await fs.readdir(dirPath, { withFileTypes: true });
                    const formatted = entries.map(e =>
                        `${e.isDirectory() ? '[DIR]' : '[FILE]'} ${e.name}`
                    ).join('\n');
                    return { toolCallId, name, result: formatted, success: true };
                } catch (e: any) {
                    return { toolCallId, name, result: `Failed to list directory: ${e.message}`, success: false };
                }
            }

            // Aliases for search_files
            case 'file_glob_search':
            case 'glob_search':
            case 'find_files':
            case 'grep':
            case 'search_files': {
                const pattern = args.pattern || args.query || args.glob;
                const searchPath = args.path || args.directory || '.';
                // Basic grep-like search using find
                try {
                    const { exec } = await import('child_process');
                    const { promisify } = await import('util');
                    const execAsync = promisify(exec);
                    
                    // Use findstr on Windows, grep on Unix
                    const isWindows = process.platform === 'win32';
                    const cmd = isWindows
                        ? `findstr /S /I /N "${pattern}" "${searchPath}\\*"`
                        : `grep -r -n -i "${pattern}" "${searchPath}" 2>/dev/null | head -50`;
                    
                    const { stdout } = await execAsync(cmd, { maxBuffer: 1024 * 1024 });
                    return { toolCallId, name, result: stdout || 'No matches found', success: true };
                } catch (e: any) {
                    return { toolCallId, name, result: e.stdout || 'No matches found', success: true };
                }
            }

            // ============================================================
            // GIT TOOLS
            // ============================================================
            case 'extra_tools_git_status':
            case 'git_status': {
                try {
                    const { exec } = await import('child_process');
                    const { promisify } = await import('util');
                    const execAsync = promisify(exec);
                    
                    const { stdout } = await execAsync('git status --porcelain', { maxBuffer: 1024 * 1024 });
                    if (!stdout.trim()) {
                        return { toolCallId, name, result: 'Working directory clean - no uncommitted changes.', success: true };
                    }
                    
                    // Parse git status output
                    const lines = stdout.trim().split('\n');
                    const modified: string[] = [];
                    const added: string[] = [];
                    const deleted: string[] = [];
                    const untracked: string[] = [];
                    
                    for (const line of lines) {
                        const status = line.substring(0, 2);
                        const file = line.substring(3);
                        if (status.includes('M')) modified.push(file);
                        else if (status.includes('A')) added.push(file);
                        else if (status.includes('D')) deleted.push(file);
                        else if (status === '??') untracked.push(file);
                    }
                    
                    let result = `Git Status:\n`;
                    if (modified.length) result += `\nModified (${modified.length}):\n${modified.map(f => `  - ${f}`).join('\n')}`;
                    if (added.length) result += `\nAdded (${added.length}):\n${added.map(f => `  - ${f}`).join('\n')}`;
                    if (deleted.length) result += `\nDeleted (${deleted.length}):\n${deleted.map(f => `  - ${f}`).join('\n')}`;
                    if (untracked.length) result += `\nUntracked (${untracked.length}):\n${untracked.map(f => `  - ${f}`).join('\n')}`;
                    
                    return { toolCallId, name, result, success: true };
                } catch (e: any) {
                    return { toolCallId, name, result: `Git error: ${e.message}`, success: false };
                }
            }

            case 'extra_tools_git_diff':
            case 'git_diff': {
                try {
                    const { exec } = await import('child_process');
                    const { promisify } = await import('util');
                    const execAsync = promisify(exec);
                    
                    const file = args.file || args.path || '';
                    const cmd = file ? `git diff --stat ${file}` : 'git diff --stat';
                    const { stdout } = await execAsync(cmd, { maxBuffer: 1024 * 1024 });
                    return { toolCallId, name, result: stdout || 'No differences', success: true };
                } catch (e: any) {
                    return { toolCallId, name, result: `Git error: ${e.message}`, success: false };
                }
            }

            case 'extra_tools_git_log':
            case 'git_log': {
                try {
                    const { exec } = await import('child_process');
                    const { promisify } = await import('util');
                    const execAsync = promisify(exec);
                    
                    const limit = args.limit || args.count || 10;
                    const { stdout } = await execAsync(`git log --oneline -n ${limit}`, { maxBuffer: 1024 * 1024 });
                    return { toolCallId, name, result: stdout || 'No commits found', success: true };
                } catch (e: any) {
                    return { toolCallId, name, result: `Git error: ${e.message}`, success: false };
                }
            }

            // ============================================================
            // FALLBACK - Try MCP/Continue-Tools server for unknown tools
            // ============================================================
            default: {
                // Try to call the continue-tools MCP server for unknown tools
                try {
                    const axios = (await import('axios')).default;
                    const continueToolsUrl = 'http://localhost:3006';
                    
                    // Strip 'extra_tools_' prefix if present
                    const mcpToolName = name.replace(/^extra_tools_/, '');
                    
                    console.log(`[AgenticLoop] Forwarding unknown tool '${name}' to continue-tools as '${mcpToolName}'`);
                    
                    const response = await axios.post(
                        `${continueToolsUrl}/tools/${mcpToolName}`,
                        args,
                        { timeout: 30000 }
                    );
                    
                    // Extract text from MCP response format
                    const content = response.data?.content;
                    let result = '';
                    if (Array.isArray(content)) {
                        result = content.map((c: any) => c.text || c).join('\n');
                    } else if (typeof content === 'string') {
                        result = content;
                    } else {
                        result = JSON.stringify(response.data, null, 2);
                    }
                    
                    console.log(`[AgenticLoop] Tool '${mcpToolName}' executed via continue-tools`);
                    return { toolCallId, name, result, success: true };
                    
                } catch (mcpError: any) {
                    // MCP call failed - log as failure
                    const errorMsg = `Tool '${name}' not available. Tried agentic loop and continue-tools server. Error: ${mcpError.message}`;
                    console.log(`[AgenticLoop] ${errorMsg}`);
                    
                    failureLog.logFailure({
                        modelId,
                        category: 'tool',
                        tool: name,
                        error: errorMsg,
                        query: JSON.stringify(args),
                        expectedBehavior: 'Tool should be available in agentic loop or MCP server',
                        actualBehavior: `Tool ${name} not found anywhere`
                    });
                    
                    return {
                        toolCallId,
                        name,
                        result: errorMsg,
                        success: false
                    };
                }
            }
        }
    } catch (error: any) {
        console.error(`[AgenticLoop] Tool ${name} failed:`, error);
        // Log failure to failure log
        failureLog.logFailure({
            modelId,
            category: 'tool',
            tool: name,
            error: error.message,
            query: JSON.stringify(args),
            expectedBehavior: 'Tool should execute successfully',
            actualBehavior: `Tool execution failed: ${error.message}`
        });
        // End span with error
        if (traceId && spanId) {
            endSpan(traceId, spanId, 'error', { error: error.message });
        }
        return {
            toolCallId,
            name,
            result: `Tool execution failed: ${error.message}`,
            success: false
        };
    }
}

// Helper to wrap tool result with span end
function toolResultWithSpan(
    traceId: string | undefined, 
    spanId: string, 
    toolCallId: string, 
    name: string, 
    result: string, 
    success: boolean
): ToolResult {
    if (traceId && spanId) {
        endSpan(traceId, spanId, success ? 'success' : 'error', { 
            resultLength: result.length,
            success 
        });
    }
    return { toolCallId, name, result, success };
}

// ============================================================
// SHOULD EXECUTE AGENTICALLY
// ============================================================

export const shouldExecuteAgentically = (response: any, ideConfig: any, mcpToolsToAdd: any[]): boolean => {
    // Check if any tool calls are present in the response
    const toolCalls = response.choices?.[0]?.message?.tool_calls || response.tool_calls;
    if (!toolCalls || !Array.isArray(toolCalls) || toolCalls.length === 0) return false;

    // Execute agentically for ANY tool call - we handle all tools in our agentic loop
    // The MCP tools list is used for other purposes (like tool prompting), but execution
    // should happen for any tool the model requests
    return true;
};

export const parseStreamingResponse = (fullContent: string): any => {
    // Basic SSE parsing for OpenAI format
    const lines = fullContent.split('\n');
    let content = '';
    const toolCalls: any[] = [];

    for (const line of lines) {
        if (line.startsWith('data: ')) {
            const dataStr = line.substring(6);
            if (dataStr === '[DONE]') continue;
            try {
                const data = JSON.parse(dataStr);
                const delta = data.choices?.[0]?.delta;
                if (delta?.content) content += delta.content;
                if (delta?.tool_calls) {
                    for (const tc of delta.tool_calls) {
                        if (!toolCalls[tc.index]) toolCalls[tc.index] = { id: tc.id, function: { name: '', arguments: '' } };
                        if (tc.id) toolCalls[tc.index].id = tc.id;
                        if (tc.function?.name) toolCalls[tc.index].function.name += tc.function.name;
                        if (tc.function?.arguments) toolCalls[tc.index].function.arguments += tc.function.arguments;
                    }
                }
            } catch (e) { }
        }
    }

    return {
        choices: [{
            message: {
                content: content || null,
                tool_calls: toolCalls.length > 0 ? toolCalls : undefined
            }
        }]
    };
};

export const executeAgenticLoop = async (
    initialResponse: any,
    initialMessages: any[],
    llmCallFn: (messages: any[]) => Promise<any>,
    ideConfig: any,
    sessionId: string,
    maxIterations: number = 10,
    res?: any,
    modelId: string = 'unknown',
    streamingLlmCallFn?: (messages: any[]) => Promise<any>
): Promise<any> => {
    console.log('[AgenticLoop] Starting agentic execution loop');
    
    // Start trace for full loop
    const traceId = startTrace(sessionId, modelId);
    const loopSpanId = startSpan(traceId, 'agentic_loop', undefined, { maxIterations });
    
    let currentResponse = initialResponse;
    let messages = [...initialMessages];
    const toolExecutions: any[] = [];
    let iterations = 0;
    
    // Get initial tool calls
    let toolCalls = currentResponse.choices?.[0]?.message?.tool_calls || [];
    
    // Determine initial intent from first tool call
    const initialIntent = toolCalls[0]?.function?.name || 'unknown';
    
    // Stream immediate feedback to IDE (headers already set in openai-proxy.ts)
    const streamToIDE = (message: string) => {
        if (res) {
            try {
                res.write(`data: ${JSON.stringify({
                    choices: [{ delta: { content: message }, index: 0 }]
                })}\n\n`);
            } catch (e) {
                console.log('[AgenticLoop] Stream closed, cannot write');
            }
        }
    };

    // Tool descriptions for user-friendly feedback
    const toolDescriptions: Record<string, string> = {
        'rag_query': '🔍 Searching codebase...',
        'read_file': '📄 Reading file...',
        'list_directory': '📁 Listing directory...',
        'search_files': '🔎 Searching files...',
        'git_status': '📊 Checking git status...',
        'extra_tools_git_status': '📊 Checking git status...',
        'git_diff': '📝 Checking git diff...',
        'git_log': '📜 Checking git log...',
        'git_branch': '🌿 Checking branches...',
        'git_commit': '💾 Making commit...',
        'http_get': '🌐 Fetching URL...',
        'http_post': '📤 Sending request...',
        'clipboard_read': '📋 Reading clipboard...',
        'clipboard_write': '📋 Writing to clipboard...',
        'env_get': '⚙️ Getting environment...',
        'find_symbol': '🔎 Finding symbol...',
        'get_callers': '📞 Finding callers...',
        'get_file_interface': '📜 Getting file interface...',
        'get_dependencies': '📦 Getting dependencies...',
    };
    
    while (toolCalls.length > 0 && iterations < maxIterations) {
        iterations++;
        const toolNames = toolCalls.map((tc: any) => tc.function?.name || 'unknown').join(', ');
        console.log(`[AgenticLoop] Iteration ${iterations}: executing ${toolCalls.length} tool(s): ${toolNames}`);
        
        // Start iteration span
        const iterSpanId = startSpan(traceId, `iteration:${iterations}`, loopSpanId, {
            toolCount: toolCalls.length,
            tools: toolNames
        });

        // Stream detailed tool execution to IDE as content
        if (res) {
            for (const tc of toolCalls) {
                const toolName = tc.function?.name || 'unknown';
                const args = tc.function?.arguments || '{}';
                let parsedArgs;
                try {
                    parsedArgs = JSON.parse(args);
                } catch (e) {
                    parsedArgs = { raw: args };
                }

                // Stream tool execution details
                const toolDetails = `\n🔧 Executing: ${toolName}\n`;
                const argsDetails = `📝 Arguments: ${JSON.stringify(parsedArgs, null, 2)}\n\n`;
                const detailsWords = (toolDetails + argsDetails).match(/\S+\s*|\n+/g) || [toolDetails + argsDetails];

                for (const word of detailsWords) {
                    res.write(`data: ${JSON.stringify({
                        choices: [{ delta: { content: word }, index: 0 }]
                    })}\n\n`);
                }
            }
        }

        // Add assistant message with tool_calls to conversation
        const assistantMessage = {
            role: 'assistant',
            content: currentResponse.choices?.[0]?.message?.content || null,
            tool_calls: toolCalls
        };
        messages.push(assistantMessage);
        
        // Execute all tool calls
        const toolResults: ToolResult[] = [];
        for (const toolCall of toolCalls) {
            const result = await executeToolCall(toolCall, modelId, traceId, iterSpanId);
            toolResults.push(result);
            toolExecutions.push({
                iteration: iterations,
                tool: result.name,
                args: toolCall.function?.arguments,
                result: result.result.substring(0, 500), // Truncate for logging
                success: result.success
            });

            // Stream tool results to IDE
            if (res && result.success) {
                let resultPreview = '';
                if (result.name === 'rag_query') {
                    // Show RAG results summary
                    const lines = result.result.split('\n');
                    const resultCount = (result.result.match(/--- Result \d+:/g) || []).length;
                    resultPreview = `📊 Found ${resultCount} relevant code snippets\n\n`;
                } else if (result.name === 'read_file') {
                    // Show file content summary
                    const lines = result.result.split('\n').length;
                    resultPreview = `📄 Read ${lines} lines from file\n\n`;
                } else if (result.name === 'search_files') {
                    // Show search results summary
                    const matchCount = (result.result.match(/Found \d+ matches/g) || []).length;
                    resultPreview = `🔎 Found ${matchCount} file matches\n\n`;
                } else {
                    // Generic success
                    resultPreview = `✅ ${result.name} completed\n\n`;
                }

                const resultWords = resultPreview.match(/\S+\s*|\n+/g) || [resultPreview];
                for (const word of resultWords) {
                    res.write(`data: ${JSON.stringify({
                        choices: [{ delta: { content: word }, index: 0 }]
                    })}\n\n`);
                }
            } else if (res && !result.success) {
                // Stream tool failure
                const failureText = `❌ ${result.name} failed: ${result.result.substring(0, 100)}\n\n`;
                const failureWords = failureText.match(/\S+\s*|\n+/g) || [failureText];

                for (const word of failureWords) {
                    res.write(`data: ${JSON.stringify({
                        choices: [{ delta: { content: word }, index: 0 }]
                    })}\n\n`);
                }
            }

            // Stream tool completion for multi-iteration loops
            if (iterations > 1) {
                streamToIDE(`*✓ ${result.name} complete*\n`);
            }
        }
        
        // Add tool results as tool messages
        for (const result of toolResults) {
            messages.push({
                role: 'tool',
                tool_call_id: result.toolCallId,
                content: result.result
            });
        }
        

        // Stream analysis phase start to IDE
        if (res) {
            const analysisText = `🧠 Analyzing tool results...\n\n`;
            const analysisWords = analysisText.match(/\S+\s*|\n+/g) || [analysisText];

            for (const word of analysisWords) {
                res.write(`data: ${JSON.stringify({
                    choices: [{ delta: { content: word }, index: 0 }]
                })}\n\n`);
            }
        }

        // Call LLM again with tool results - STREAM THIS IF WE HAVE A RESPONSE STREAM
        const llmSpanId = startSpan(traceId, 'llm_call', iterSpanId, { messageCount: messages.length });
        try {
            if (streamingLlmCallFn) {
                // Use streaming version that shows detailed analysis
                currentResponse = await streamingLlmCallFn(messages);
            } else {
                // Regular call
                currentResponse = await llmCallFn(messages);
            }
            endSpan(traceId, llmSpanId, 'success', { hasToolCalls: !!(currentResponse.choices?.[0]?.message?.tool_calls?.length) });
        } catch (error: any) {
            console.error('[AgenticLoop] LLM call failed:', error.message);
            endSpan(traceId, llmSpanId, 'error', { error: error.message });
            endSpan(traceId, iterSpanId, 'error');
            endSpan(traceId, loopSpanId, 'error', { iterations });
            endTrace(traceId);
            // Return what we have so far
            return {
                finalResponse: currentResponse,
                toolExecutions,
                iterations,
                agenticMessages: messages,
                initialIntent,
                error: error.message,
                traceId
            };
        }
        
        // End iteration span
        endSpan(traceId, iterSpanId, 'success');
        
        // Check for new tool calls
        toolCalls = currentResponse.choices?.[0]?.message?.tool_calls || [];
        
        // If model responded with content and no more tool calls, we're done
        if (toolCalls.length === 0) {
            const content = currentResponse.choices?.[0]?.message?.content;
            console.log(`[AgenticLoop] Complete after ${iterations} iterations. Final response length: ${content?.length || 0}`);
        }
    }
    
    if (iterations >= maxIterations) {
        console.warn(`[AgenticLoop] Hit max iterations (${maxIterations})`);
        
        // If we hit max iterations and still have tool calls (no content), 
        // force the LLM to give a final response
        const lastContent = currentResponse.choices?.[0]?.message?.content;
        if (!lastContent || lastContent.length < 50) {
            console.log('[AgenticLoop] Forcing final response after max iterations');
            try {
                // Add a system message asking for a final summary
                messages.push({
                    role: 'user',
                    content: 'Please provide a final summary response based on what you have learned so far. Do not call any more tools.'
                });
                currentResponse = await llmCallFn(messages);
            } catch (e) {
                // If this fails, construct a fallback response
                currentResponse = {
                    choices: [{
                        message: {
                            role: 'assistant',
                            content: 'I was unable to complete the analysis within the allowed iterations. Please try a more specific query.'
                        }
                    }]
                };
            }
        }
    }
    
    // End the loop span and trace
    endSpan(traceId, loopSpanId, 'success', { iterations, toolExecutionCount: toolExecutions.length });
    const trace = endTrace(traceId);
    
    return {
        finalResponse: currentResponse,
        toolExecutions,
        iterations,
        agenticMessages: messages,
        initialIntent,
        traceId,
        trace
    };
};

export class CognitiveEngine {
    /**
     * Execute the 6-Step Cognitive Loop
     */
    async executeLoop(query: string, projectPath: string, openFiles: string[] = []) {
        try {
            // 1. SEARCH
            wsBroadcast.broadcastCognitiveTrace('search', { log: `Initiating search for: "${query}"` });
            const context = await contextPrism.scan(query, projectPath, openFiles);
            wsBroadcast.broadcastCognitiveTrace('search', { log: `Found ${context.relevantFiles.length} relevant files from RAG + Open Context.` });

            // 2. UNDERSTAND
            wsBroadcast.broadcastCognitiveTrace('understand', { log: 'Distilling context into Mental Model...' });
            const mentalModel = await contextPrism.distill(context, query);
            wsBroadcast.broadcastCognitiveTrace('understand', {
                log: `Mental Model built. Identified ${mentalModel.affectedComponents.length} affected components.`,
                mentalModelSummary: {
                    constraints: mentalModel.constraints,
                    relevantFiles: mentalModel.relevantFiles.length
                }
            });

            // 3. DECIDE
            wsBroadcast.broadcastCognitiveTrace('decide', { log: 'Calculating intent and strategy...' });
            const intent = decisionEngine.decide(mentalModel, query);
            wsBroadcast.broadcastCognitiveTrace('decide', {
                log: `Decision: ${intent.strategy.toUpperCase()} - Risk: ${intent.riskLevel.toUpperCase()}`,
                intent // Send full intent for the UI Card
            });

            // 4. ACT
            wsBroadcast.broadcastCognitiveTrace('act', { log: `Routing task to Swarm (Strategy: ${intent.strategy})...` });

            // In a real run, this would actually call the LLM. 
            // For now, we mock the output or route it if we had a live Swarm.
            // We will assume SwarmRouter returns a result string or ID.
            const assignedModel = await swarmRouter.executeIntent(intent);

            let output = '';
            let exitCode = 0;

            if (assignedModel) {
                wsBroadcast.broadcastCognitiveTrace('act', { log: `Task assigned to model: ${assignedModel}. Executing...` });
                // SIMULATION: In reality this calls mcpOrchestrator.execute(...)
                // We will simulate a delay and output for the UI Demo
                await new Promise(r => setTimeout(r, 2000));
                output = "Simulation: Changes applied successfully.";
                exitCode = 0;
            } else {
                wsBroadcast.broadcastCognitiveTrace('act', { log: 'CRITICAL: No model qualified for this task.' });
                return;
            }

            // 5. VERIFY
            wsBroadcast.broadcastCognitiveTrace('verify', { log: 'Verifying execution results...' });
            const verification = await verificationLoop.verify(intent, output, exitCode);

            if (verification.success) {
                wsBroadcast.broadcastCognitiveTrace('verify', { log: `Verification PASSED (Score: ${verification.score}).` });
            } else {
                wsBroadcast.broadcastCognitiveTrace('verify', { log: `Verification FAILED. Deviations: ${verification.deviations.join(', ')}` });
            }

            // 6. PERSIST
            wsBroadcast.broadcastCognitiveTrace('persist', { log: 'Persisting memory and patterns...' });
            await verificationLoop.persist(intent, verification, query);
            wsBroadcast.broadcastCognitiveTrace('idle', { log: 'Cognitive Loop complete. Waiting for next task.' });

        } catch (error: any) {
            wsBroadcast.broadcastCognitiveTrace('idle', { log: `CRITICAL ERROR: ${error.message}` });
            console.error('Cognitive Loop Error:', error);
        }
    }
}

export const cognitiveEngine = new CognitiveEngine();
