import React from 'react';
import { ConversationTurn } from '../types';
import { ProcessingTimeline } from './ProcessingTimeline';

interface TurnCardProps {
  turn: ConversationTurn;
  turnIndex: number;
  isExpanded: boolean;
  onToggle: () => void;
  getUserMessage: (turn: ConversationTurn) => string;
  getAssistantMessage: (turn: ConversationTurn) => string;
}

export const TurnCard: React.FC<TurnCardProps> = ({ 
  turn,
  turnIndex,
  isExpanded,
  onToggle,
  getUserMessage: getUserMsg,
  getAssistantMessage: getAssistantMsg
}) => {
  const userMessage = getUserMsg(turn);
  const assistantMessage = getAssistantMsg(turn);
  
  // Get toolyMeta from turn or response
  const toolyMeta = turn.toolyMeta || (turn.response as any)?.toolyMeta;
  
  // Check for agentic loop
  const hasAgenticLoop = toolyMeta?.agenticLoop && toolyMeta?.toolExecutions?.length > 0;
  const agenticToolCount = toolyMeta?.toolExecutions?.length || 0;
  
  // Check if this turn has tool calls (regular or agentic)
  const hasToolCalls = turn.request?.messages?.some(m => m.role === 'assistant' && m.tool_calls?.length > 0) ||
                       toolyMeta?.toolCalls?.length || hasAgenticLoop;
  const toolCallCount = agenticToolCount || toolyMeta?.toolCalls?.length || 
                        turn.request?.messages?.filter(m => m.role === 'assistant' && m.tool_calls)
                          .flatMap(m => m.tool_calls || []).length || 0;
  
  const mode = toolyMeta?.mode;
  
  return (
    <div className="mb-3 rounded-lg border border-[#2d2d2d] overflow-hidden bg-[#1a1a1a]">
      {/* Header */}
      <div 
        className="flex items-center justify-between px-4 py-2 bg-[#1a1a1a] cursor-pointer hover:bg-[#252525]"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-gray-400">Turn {turnIndex + 1}</span>
          {hasAgenticLoop && (
            <span className="text-xs px-2 py-0.5 rounded bg-green-500/20 text-green-400">
              🔄 Agentic ({toolyMeta?.iterations} iter)
            </span>
          )}
          {hasToolCalls && (
            <span className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-400">
              🔧 {toolCallCount} tool{toolCallCount !== 1 ? 's' : ''}
            </span>
          )}
          {mode && mode !== 'passthrough' && (
            <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-400">
              {mode === 'dual' ? '🔀 Dual' : '📍 Single'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {new Date(turn.timestamp).toLocaleTimeString()}
          </span>
          <span className="text-xs text-gray-500">{isExpanded ? '▼' : '▶'}</span>
        </div>
      </div>
      
      {/* User Message */}
      <div className="px-4 py-3 border-t border-[#2d2d2d] bg-blue-600/10">
        <div className="text-xs text-blue-400 mb-1">👤 User</div>
        <div className="text-sm text-gray-200 whitespace-pre-wrap break-words">
          {userMessage.length > 500 && !isExpanded 
            ? userMessage.substring(0, 500) + '...' 
            : userMessage}
        </div>
      </div>
      
      {/* Expanded Details (Processing Timeline) */}
      {isExpanded && (
        <ProcessingTimeline turn={turn} />
      )}
      
      {/* Assistant Response */}
      {assistantMessage && (
        <div className="px-4 py-3 border-t border-[#2d2d2d]">
          <div className="text-xs text-purple-400 mb-1">✨ Assistant</div>
          <div className="text-sm text-gray-200 whitespace-pre-wrap break-words">
            {assistantMessage.length > 500 && !isExpanded 
              ? assistantMessage.substring(0, 500) + '...' 
              : assistantMessage}
          </div>
        </div>
      )}
    </div>
  );
};
