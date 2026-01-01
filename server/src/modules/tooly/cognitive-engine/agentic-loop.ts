import { executeToolCall } from './tool-executor.js';
import { startTrace, startSpan, endSpan, endTrace } from './utils/tracing.js';
import { ToolResult } from './utils/types.js';

export const shouldExecuteAgentically = (response: any): boolean => {
  const toolCalls = response.choices?.[0]?.message?.tool_calls || response.tool_calls;
  return !!(toolCalls && Array.isArray(toolCalls) && toolCalls.length > 0);
};

export const executeAgenticLoop = async (
  initialResponse: any,
  initialMessages: any[],
  llmCallFn: (messages: any[]) => Promise<any>,
  sessionId: string,
  maxIterations: number = 10,
  res?: any,
  modelId: string = 'unknown',
  streamingLlmCallFn?: (messages: any[]) => Promise<any>
): Promise<any> => {
  const traceId = startTrace(sessionId, modelId);
  const loopSpanId = startSpan(traceId, 'agentic_loop', undefined, { maxIterations });
  
  let currentResponse = initialResponse;
  let messages = [...initialMessages];
  const toolExecutions: any[] = [];
  let iterations = 0;
  let toolCalls = currentResponse.choices?.[0]?.message?.tool_calls || [];
  const initialIntent = toolCalls[0]?.function?.name || 'unknown';
  
  while (toolCalls.length > 0 && iterations < maxIterations) {
    iterations++;
    const iterSpanId = startSpan(traceId, `iteration:${iterations}`, loopSpanId, { toolCount: toolCalls.length });

    if (res) {
      for (const tc of toolCalls) {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: `\n🔧 Executing: ${tc.function?.name}\n` }, index: 0 }] })}\n\n`);
      }
    }

    messages.push({ role: 'assistant', content: currentResponse.choices?.[0]?.message?.content || null, tool_calls: toolCalls });
    
    const toolResults: ToolResult[] = [];
    for (const toolCall of toolCalls) {
      const result = await executeToolCall(toolCall, modelId, traceId, iterSpanId);
      toolResults.push(result);
      toolExecutions.push({ iteration: iterations, tool: result.name, args: toolCall.function?.arguments, success: result.success });
      if (res) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: `\n✅ ${result.name} complete\n` }, index: 0 }] })}\n\n`);
    }
    
    for (const result of toolResults) {
      messages.push({ role: 'tool', tool_call_id: result.toolCallId, content: result.result });
    }

    try {
      currentResponse = streamingLlmCallFn ? await streamingLlmCallFn(messages) : await llmCallFn(messages);
    } catch (error: any) {
      endTrace(traceId);
      return { finalResponse: currentResponse, toolExecutions, iterations, agenticMessages: messages, initialIntent, error: error.message, traceId };
    }
    
    endSpan(traceId, iterSpanId, 'success');
    toolCalls = currentResponse.choices?.[0]?.message?.tool_calls || [];
  }
  
  endSpan(traceId, loopSpanId, 'success', { iterations });
  return { finalResponse: currentResponse, toolExecutions, iterations, agenticMessages: messages, initialIntent, traceId, trace: endTrace(traceId) };
};
