import React, { useState } from 'react';
import { ToolyToolCallMeta } from '../types';

interface TimelineToolCallProps {
  toolCall: ToolyToolCallMeta;
}

export const TimelineToolCall: React.FC<TimelineToolCallProps> = ({ 
  toolCall 
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copiedArgs, setCopiedArgs] = useState(false);
  const [copiedResult, setCopiedResult] = useState(false);
  
  const statusConfig = {
    success: { icon: '✅', colors: 'text-green-400 border-green-500/30 bg-green-500/5', dot: 'bg-green-500' },
    failed: { icon: '❌', colors: 'text-red-400 border-red-500/30 bg-red-500/5', dot: 'bg-red-500' },
    timeout: { icon: '⏳', colors: 'text-yellow-400 border-yellow-500/30 bg-yellow-500/5', dot: 'bg-yellow-500' },
    pending: { icon: '⏳', colors: 'text-gray-400 border-gray-500/30 bg-gray-500/5', dot: 'bg-gray-500' }
  };
  
  const config = statusConfig[toolCall.status] || statusConfig.pending;
  
  return (
    <div className="relative pl-8 pb-3">
      <div className={`absolute left-5 w-3 h-3 rounded-full ${config.dot} -translate-x-1/2`} />
      
      <div className={`rounded-lg border ${config.colors}`}>
        <div 
          className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-white/5"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2">
            <span>🔧</span>
            <span className="text-xs font-medium">{toolCall.name}</span>
            <span>{config.icon}</span>
          </div>
          <div className="flex items-center gap-2">
            {toolCall.latencyMs && (
              <span className="text-xs text-gray-500">{toolCall.latencyMs}ms</span>
            )}
            <span className="text-xs text-gray-500">{isExpanded ? '▼' : '▶'}</span>
          </div>
        </div>
        
        {isExpanded && (
          <div className="px-3 pb-3 border-t border-[#2d2d2d] space-y-2">
            <div className="mt-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-blue-400">📥 Arguments</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(JSON.stringify(toolCall.arguments, null, 2));
                    setCopiedArgs(true);
                    setTimeout(() => setCopiedArgs(false), 2000);
                  }}
                  className="text-xs text-gray-400 hover:text-white px-1.5 py-0.5 rounded bg-[#2d2d2d] hover:bg-[#3d3d3d]"
                >
                  {copiedArgs ? '✓' : 'Copy'}
                </button>
              </div>
              <pre className="text-xs text-gray-400 bg-[#0a0a0a] p-2 rounded overflow-x-auto font-mono max-h-32 overflow-y-auto scrollbar-thin">
                {JSON.stringify(toolCall.arguments, null, 2)}
              </pre>
            </div>
            
            {toolCall.result !== undefined && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs ${toolCall.status === 'failed' ? 'text-red-400' : 'text-green-400'}`}>
                    {toolCall.status === 'failed' ? '⚠️ Error' : '📤 Result'}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const resultStr = typeof toolCall.result === 'string' 
                        ? toolCall.result 
                        : JSON.stringify(toolCall.result, null, 2);
                      navigator.clipboard.writeText(resultStr);
                      setCopiedResult(true);
                      setTimeout(() => setCopiedResult(false), 2000);
                    }}
                    className="text-xs text-gray-400 hover:text-white px-1.5 py-0.5 rounded bg-[#2d2d2d] hover:bg-[#3d3d3d]"
                  >
                    {copiedResult ? '✓' : 'Copy'}
                  </button>
                </div>
                <pre className={`text-xs p-2 rounded overflow-x-auto max-h-48 overflow-y-auto scrollbar-thin font-mono whitespace-pre-wrap ${
                  toolCall.status === 'failed' ? 'text-red-300 bg-red-500/10' : 'text-gray-400 bg-[#0a0a0a]'
                }`}>
                  {typeof toolCall.result === 'string' 
                    ? toolCall.result 
                    : JSON.stringify(toolCall.result, null, 2)}
                </pre>
              </div>
            )}
            
            {toolCall.error && (
              <div className="p-2 rounded bg-red-500/10 border border-red-500/20">
                <p className="text-xs text-red-400">{toolCall.error}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
