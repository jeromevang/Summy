import React, { useState } from 'react';

interface SourceMessageProps {
  msg: any;
}

export const SourceMessage: React.FC<SourceMessageProps> = ({ msg }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const roleConfig: Record<string, { icon: string; color: string; bg: string; border: string }> = {
    system: { icon: '⚙️', color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' },
    user: { icon: '👤', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30' },
    assistant: { icon: '✨', color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/30' },
    tool: { icon: '🔧', color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/30' },
    agentic: { icon: '🔄', color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/30' },
  };
  
  const config = roleConfig[msg.role] || { icon: '📄', color: 'text-gray-400', bg: 'bg-gray-500/10', border: 'border-gray-500/30' };
  const hasToolCalls = msg.tool_calls && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0;
  const isToolResult = msg.role === 'tool';
  
  const isIDEMessage = msg.role === 'user' || (msg.role === 'assistant' && !hasToolCalls);
  
  const formatContent = (content: any): string => {
    if (!content) return '';
    if (typeof content === 'string') return content;
    return JSON.stringify(content, null, 2);
  };
  
  const content = formatContent(msg.content);
  const maxLength = 500;
  const isTruncated = content.length > maxLength;
  const displayContent = isExpanded ? content : content.substring(0, maxLength);
  
  return (
    <div className={`mb-2 p-3 rounded-lg border ${config.border} ${config.bg}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${config.color}`}>
            {config.icon} {msg.role}
          </span>
          {msg._source && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">
              {msg._source}
            </span>
          )}
          {hasToolCalls && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400">
              {msg.tool_calls.length} tool call{msg.tool_calls.length > 1 ? 's' : ''}
            </span>
          )}
          {isToolResult && msg.tool_call_id && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 font-mono">
              {msg.name || 'tool'}
            </span>
          )}
        </div>
      </div>
      
      {content && (
        <div className="mb-2">
          {isIDEMessage ? (
            <div className="text-sm text-gray-200 whitespace-pre-wrap break-words">
              {displayContent}
              {isTruncated && !isExpanded && '...'}
            </div>
          ) : (
            <pre className="text-sm text-gray-200 whitespace-pre-wrap break-words font-mono bg-[#0d0d0d] p-2 rounded max-h-64 overflow-y-auto scrollbar-thin">
              {displayContent}
              {isTruncated && !isExpanded && '...'}
            </pre>
          )}
          {isTruncated && (
            <button 
              onClick={() => setIsExpanded(!isExpanded)}
              className="mt-1 text-xs text-purple-400 hover:text-purple-300"
            >
              {isExpanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      )}
      
      {hasToolCalls && (
        <div className="space-y-2">
          {msg.tool_calls.map((tc: any, idx: number) => (
            <div key={tc.id || idx} className="p-2 rounded bg-[#0d0d0d] border border-orange-500/20">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-orange-400 font-medium">🔧 {tc.function?.name || tc.name}</span>
                <span className="text-xs text-gray-500 font-mono">{tc.id}</span>
              </div>
              <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap">
                {typeof tc.function?.arguments === 'string' 
                  ? (() => { try { return JSON.stringify(JSON.parse(tc.function.arguments), null, 2); } catch { return tc.function.arguments; } })()
                  : JSON.stringify(tc.function?.arguments || tc.arguments, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      )}
      
      {isToolResult && msg.tool_call_id && (
        <div className="text-xs text-gray-500 font-mono mt-1">
          tool_call_id: {msg.tool_call_id}
        </div>
      )}
      
      {msg._agenticExecution && (
        <div className="mt-2 p-2 rounded bg-cyan-500/5 border border-cyan-500/20">
          <div className="text-xs text-cyan-400 font-medium mb-1">
            📥 MCP Tool Arguments
          </div>
          <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap">
            {JSON.stringify(msg._agenticExecution.args, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};
