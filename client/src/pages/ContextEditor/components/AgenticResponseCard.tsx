import React, { useState } from 'react';

interface AgenticResponseCardProps {
  agenticData: {
    iterations: number;
    toolExecutions: Array<{
      toolName: string;
      mcpTool: string;
      args: any;
      result: string;
      toolCallId: string;
      isError?: boolean;
    }>;
    initialIntent?: string;
  };
  finalResponse?: string;
}

export const AgenticResponseCard: React.FC<AgenticResponseCardProps> = ({ 
  agenticData, 
  finalResponse 
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [expandedTools, setExpandedTools] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);
  
  const hasError = agenticData.toolExecutions.some(exec => exec.isError === true);
  const hasNoResponse = !finalResponse || finalResponse.trim() === '';
  
  const statusConfig = hasError 
    ? { border: 'border-red-500/50', bg: 'bg-red-500/10', color: 'text-red-400', icon: '❌' }
    : hasNoResponse
      ? { border: 'border-orange-500/50', bg: 'bg-orange-500/10', color: 'text-orange-400', icon: '⚠️' }
      : { border: 'border-cyan-500/50', bg: 'bg-cyan-500/10', color: 'text-cyan-400', icon: '🔄' };
  
  const toggleTool = (idx: number) => {
    setExpandedTools(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };
  
  const truncateResult = (result: string, maxLen: number = 300): string => {
    if (result.length <= maxLen) return result;
    return result.substring(0, maxLen) + '...';
  };
  
  const copyAgenticData = (e: React.MouseEvent) => {
    e.stopPropagation();
    const sourceData = {
      iterations: agenticData.iterations,
      toolCount: agenticData.toolExecutions.length,
      initialIntent: agenticData.initialIntent || null,
      tools: agenticData.toolExecutions.map(exec => ({
        tool: exec.toolName,
        mcp: exec.mcpTool,
        args: exec.args,
        resultLength: exec.result?.length || 0,
        isError: exec.isError || false,
        resultPreview: exec.result?.substring(0, 200) + (exec.result?.length > 200 ? '...' : '')
      })),
      hasResponse: !!finalResponse && finalResponse.trim() !== ''
    };
    navigator.clipboard.writeText(JSON.stringify(sourceData, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  return (
    <div className="mb-3 p-3 rounded-lg border border-purple-500/30 bg-purple-500/10">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-medium text-purple-400">✨ assistant</span>
        <span className="text-xs px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400">
          agentic
        </span>
        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">
          ← from LLM
        </span>
      </div>
      
      <div className={`mb-3 rounded-lg border ${statusConfig.border} ${statusConfig.bg}`}>
        <div 
          className="flex items-center justify-between p-2 cursor-pointer hover:bg-white/5"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2">
            <span className={`text-sm ${statusConfig.color}`}>{statusConfig.icon}</span>
            <span className={`text-xs font-medium ${statusConfig.color}`}>
              Agentic Processing
            </span>
            <span className="text-xs text-gray-500">
              {agenticData.iterations} iteration{agenticData.iterations !== 1 ? 's' : ''} • {agenticData.toolExecutions.length} tool call{agenticData.toolExecutions.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={copyAgenticData}
              className="text-xs px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
              title="Copy agentic data as JSON"
            >
              {copied ? '✓ Copied' : '📋 Copy'}
            </button>
            <span className="text-xs text-gray-500">{isExpanded ? '▼' : '▶'}</span>
          </div>
        </div>
        
        {isExpanded && (
          <div className="px-2 pb-2 space-y-2">
            {agenticData.initialIntent && (
              <div className="rounded border border-purple-500/30 bg-purple-500/5 p-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-purple-400">💭</span>
                  <span className="text-xs font-medium text-purple-400">Initial Intent</span>
                  <span className="text-xs text-gray-500 italic">(not sent to IDE)</span>
                </div>
                <p className="text-sm text-gray-300">{agenticData.initialIntent}</p>
              </div>
            )}
            
            {agenticData.toolExecutions.map((exec, idx) => {
              const isToolExpanded = expandedTools.has(idx);
              const hasToolError = exec.isError === true;
              
              return (
                <div key={exec.toolCallId || idx} className="rounded border border-gray-700 bg-[#0d0d0d]">
                  <div 
                    className="flex items-center justify-between p-2 cursor-pointer hover:bg-gray-800/50"
                    onClick={() => toggleTool(idx)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-orange-400">🔧</span>
                      <span className="text-xs font-medium text-orange-400">{exec.toolName}</span>
                      {exec.toolName !== exec.mcpTool && (
                        <span className="text-xs text-gray-500">→ {exec.mcpTool}</span>
                      )}
                      {hasToolError && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">error</span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500">{isToolExpanded ? '▼' : '▶'}</span>
                  </div>
                  
                  {isToolExpanded && (
                    <div className="p-2 pt-0 space-y-2">
                      <div className="p-2 rounded bg-gray-800/50">
                        <div className="text-xs text-gray-400 mb-1">📤 Arguments</div>
                        <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap max-h-32 overflow-y-auto scrollbar-thin">
                          {JSON.stringify(exec.args, null, 2)}
                        </pre>
                      </div>
                      
                      <div className={`p-2 rounded ${hasToolError ? 'bg-red-500/10' : 'bg-green-500/10'}`}>
                        <div className={`text-xs mb-1 ${hasToolError ? 'text-red-400' : 'text-green-400'}`}>
                          📥 Result
                        </div>
                        <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap max-h-48 overflow-y-auto scrollbar-thin">
                          {exec.result}
                        </pre>
                      </div>
                    </div>
                  )}
                  
                  {!isToolExpanded && exec.result && (
                    <div className="px-2 pb-2">
                      <pre className="text-xs text-gray-500 font-mono truncate">
                        {truncateResult(exec.result, 100)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      
      {finalResponse ? (
        <div className="text-sm text-gray-200 whitespace-pre-wrap break-words">
          {finalResponse}
        </div>
      ) : (
        <div className="text-sm text-orange-400 italic">
          No text response generated
        </div>
      )}
    </div>
  );
};
