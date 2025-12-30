import React from 'react';
import { ConversationTurn, ToolyToolCallMeta } from '../types';
import { TimelinePhase } from './TimelinePhase';
import { TimelineToolCall } from './TimelineToolCall';

interface ProcessingTimelineProps {
  turn: ConversationTurn;
}

export const ProcessingTimeline: React.FC<ProcessingTimelineProps> = ({ 
  turn 
}) => {
  const toolyMeta = turn.toolyMeta || (turn.response as any)?.toolyMeta;
  
  // Check for agentic loop executions first
  const agenticExecutions = toolyMeta?.toolExecutions || [];
  const hasAgenticLoop = toolyMeta?.agenticLoop && agenticExecutions.length > 0;
  
  // Also extract tool calls from the request messages if toolyMeta not available
  const requestToolCalls = turn.request?.messages
    ?.filter(m => m.role === 'assistant' && m.tool_calls)
    ?.flatMap(m => m.tool_calls || []) || [];
  
  const toolResults = turn.request?.messages
    ?.filter(m => m.role === 'tool') || [];
  
  // Convert agentic executions to ToolyToolCallMeta format
  const agenticToolCalls: ToolyToolCallMeta[] = agenticExecutions.map(exec => ({
    id: exec.toolCallId || 'agentic',
    name: `${exec.toolName} → ${exec.mcpTool}`,
    arguments: exec.args,
    result: exec.result,
    status: exec.isError ? 'failed' as const : 'success' as const,
    latencyMs: undefined
  }));
  
  // Merge tool calls with results (for non-agentic calls)
  const mergedToolCalls: ToolyToolCallMeta[] = toolyMeta?.toolCalls || requestToolCalls.map(tc => {
    const result = toolResults.find(tr => tr.tool_call_id === tc.id);
    
    // Only mark as error if there's an explicit error object from MCP
    const isError = (() => {
      if (!result) return false;
      if ((result as any).isError === true) return true;
      try {
        const parsed = JSON.parse(result.content);
        if (parsed.isError === true || parsed.error === true) return true;
      } catch { /* not JSON */ }
      return false;
    })();
    
    return {
      id: tc.id || 'unknown',
      name: tc.function?.name || tc.name || 'unknown',
      arguments: typeof tc.function?.arguments === 'string' 
        ? (() => { try { return JSON.parse(tc.function.arguments); } catch { return { raw: tc.function.arguments }; } })()
        : tc.function?.arguments || tc.arguments || {},
      result: result?.content,
      status: result ? (isError ? 'failed' : 'success') : 'pending',
      latencyMs: undefined
    } as ToolyToolCallMeta;
  });
  
  // Combine all tool calls
  const allToolCalls = [...agenticToolCalls, ...mergedToolCalls];
  
  const hasPhases = toolyMeta?.phases && toolyMeta.phases.length > 0;
  const hasToolCalls = allToolCalls.length > 0;
  
  if (!hasPhases && !hasToolCalls && !hasAgenticLoop) {
    // Extract system prompt from request if available
    const systemPrompt = turn.request?.messages?.find(m => m.role === 'system')?.content;
    if (!systemPrompt) {
      return null;
    }
    
    // Show just the system prompt as a simple phase
    return (
      <div className="border-t border-[#2d2d2d] bg-[#0d0d0d]">
        <div className="px-4 py-2 border-b border-[#2d2d2d]">
          <span className="text-xs font-medium text-gray-400">📋 Processing Details</span>
        </div>
        <div className="relative px-4 py-3">
          <div className="absolute left-7 top-3 bottom-3 w-0.5 bg-[#2d2d2d]" />
          <TimelinePhase 
            phase={{
              phase: 'response',
              systemPrompt: systemPrompt,
              model: turn.request?.model || 'unknown',
              latencyMs: 0
            }}
          />
        </div>
      </div>
    );
  }
  
  return (
    <div className="border-t border-[#2d2d2d] bg-[#0d0d0d]">
      {/* Timeline header */}
      <div className="px-4 py-2 border-b border-[#2d2d2d] flex items-center gap-2">
        <span className="text-xs font-medium text-gray-400">📋 Processing Steps</span>
        <span className="text-xs text-gray-600">
          {hasAgenticLoop && (
            <span className="text-green-400">🔄 Agentic Loop ({toolyMeta?.iterations} iterations)</span>
          )}
          {toolyMeta?.mode && ` (${toolyMeta.mode} mode)`}
          {hasPhases && ` • ${toolyMeta?.phases?.length} phases`}
          {hasToolCalls && ` • ${allToolCalls.length} tool calls`}
        </span>
      </div>
      
      {/* Timeline items */}
      <div className="relative px-4 py-3">
        {/* Vertical line */}
        <div className="absolute left-7 top-3 bottom-3 w-0.5 bg-[#2d2d2d]" />
        
        {/* Agentic loop indicator */}
        {hasAgenticLoop && (
          <div className="mb-3 ml-6 p-2 rounded bg-green-500/10 border border-green-500/30">
            <div className="flex items-center gap-2 text-xs text-green-400">
              <span>🔄</span>
              <span className="font-medium">Agentic Tool Execution</span>
              <span className="text-green-300/70">
                • {agenticExecutions.length} tool{agenticExecutions.length !== 1 ? 's' : ''} executed via MCP
                • {toolyMeta?.iterations} LLM iteration{toolyMeta?.iterations !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        )}
        
        {/* Phases */}
        {toolyMeta?.phases?.map((phase, idx) => (
          <TimelinePhase 
            key={`phase-${idx}`}
            phase={phase}
          />
        ))}
        
        {/* Tool calls */}
        {allToolCalls.map((tc, idx) => (
          <TimelineToolCall 
            key={`tc-${tc.id}-${idx}`}
            toolCall={tc}
          />
        ))}
      </div>
    </div>
  );
};
