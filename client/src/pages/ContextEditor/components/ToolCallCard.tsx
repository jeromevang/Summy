import React, { useState } from 'react';
import { ToolCallInfo, ToolResultInfo } from '../types';

interface ToolCallCardProps {
  toolCall: ToolCallInfo;
  result?: ToolResultInfo;
  isExpanded?: boolean;
}

export const ToolCallCard: React.FC<ToolCallCardProps> = ({ 
  toolCall, 
  result,
  isExpanded: defaultExpanded = false 
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [copiedArgs, setCopiedArgs] = useState(false);
  const [copiedResult, setCopiedResult] = useState(false);
  
  const hasResult = !!result;
  const isError = result?.isError === true;
  const status = !hasResult ? 'pending' : isError ? 'failed' : 'success';
  
  const statusColors = {
    success: { border: 'border-green-500/40', bg: 'bg-green-500/5', icon: '✅', text: 'text-green-400' },
    failed: { border: 'border-red-500/40', bg: 'bg-red-500/5', icon: '❌', text: 'text-red-400' },
    pending: { border: 'border-yellow-500/40', bg: 'bg-yellow-500/5', icon: '⏳', text: 'text-yellow-400' }
  };
  
  const colors = statusColors[status];
  
  const formatArgs = (args: Record<string, any>): string => {
    try {
      return JSON.stringify(args, null, 2);
    } catch {
      return String(args);
    }
  };
  
  const truncateContent = (content: string, maxLength: number = 500): string => {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '\n... (truncated)';
  };
  
  const getArgsPreview = (): string => {
    const entries = Object.entries(toolCall.arguments);
    if (entries.length === 0) return 'No arguments';
    
    return entries
      .slice(0, 2)
      .map(([key, value]) => {
        const strValue = typeof value === 'string' ? value : JSON.stringify(value);
        const truncated = strValue.length > 40 ? strValue.slice(0, 40) + '...' : strValue;
        return `${key}: ${truncated}`;
      })
      .join(', ') + (entries.length > 2 ? `, +${entries.length - 2} more` : '');
  };
  
  return (
    <div className={`mb-3 rounded-lg border ${colors.border} ${colors.bg} overflow-hidden`}>
      <div 
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-white/5"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">{colors.icon}</span>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-white">🔧 {toolCall.name}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded ${colors.bg} ${colors.text} border ${colors.border}`}>
                {status.toUpperCase()}
              </span>
            </div>
            {!isExpanded && (
              <p className="text-xs text-gray-500 mt-0.5 truncate max-w-md">
                {getArgsPreview()}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {isExpanded ? '▼' : '▶'}
          </span>
        </div>
      </div>
      
      {isExpanded && (
        <div className="border-t border-[#2d2d2d]">
          <div className="px-4 py-3 border-b border-[#2d2d2d]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-blue-400">📥 Arguments</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(formatArgs(toolCall.arguments));
                  setCopiedArgs(true);
                  setTimeout(() => setCopiedArgs(false), 2000);
                }}
                className="text-xs text-gray-400 hover:text-white px-2 py-0.5 rounded bg-[#2d2d2d] hover:bg-[#3d3d3d]"
              >
                {copiedArgs ? '✓ Copied' : 'Copy'}
              </button>
            </div>
            <pre className="text-xs text-gray-300 bg-[#0d0d0d] p-3 rounded-lg overflow-x-auto font-mono max-h-48 overflow-y-auto scrollbar-thin">
              {formatArgs(toolCall.arguments)}
            </pre>
          </div>
          
          {result && (
            <div className="px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-medium ${isError ? 'text-red-400' : 'text-green-400'}`}>
                  {isError ? '⚠️ Error' : '📤 Result'}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(result.content);
                    setCopiedResult(true);
                    setTimeout(() => setCopiedResult(false), 2000);
                  }}
                  className="text-xs text-gray-400 hover:text-white px-2 py-0.5 rounded bg-[#2d2d2d] hover:bg-[#3d3d3d]"
                >
                  {copiedResult ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <pre className={`text-xs bg-[#0d0d0d] p-3 rounded-lg overflow-x-auto font-mono max-h-64 overflow-y-auto scrollbar-thin whitespace-pre-wrap ${isError ? 'text-red-300' : 'text-gray-300'}`}>
                {truncateContent(result.content, 2000)}
              </pre>
              
              {isError && (
                <div className="mt-3 p-2 rounded bg-red-500/10 border border-red-500/20">
                  <p className="text-xs text-red-400 font-medium mb-1">💡 Possible causes:</p>
                  <ul className="text-xs text-red-300/80 list-disc list-inside space-y-0.5">
                    {result.content.toLowerCase().includes('enoent') && (
                      <li>File or directory does not exist</li>
                    )}
                    {result.content.toLowerCase().includes('permission') && (
                      <li>Insufficient permissions to access the resource</li>
                    )}
                    {result.content.toLowerCase().includes('timeout') && (
                      <li>Operation timed out - MCP server may be slow or unresponsive</li>
                    )}
                    {result.content.toLowerCase().includes('connection') && (
                      <li>MCP server connection issue - check if server is running</li>
                    )}
                    {!result.content.toLowerCase().includes('enoent') && 
                     !result.content.toLowerCase().includes('permission') &&
                     !result.content.toLowerCase().includes('timeout') &&
                     !result.content.toLowerCase().includes('connection') && (
                      <li>Check tool arguments and MCP server logs for details</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}
          
          {!result && (
            <div className="px-4 py-3 text-xs text-gray-500 italic">
              Awaiting tool result...
            </div>
          )}
        </div>
      )}
    </div>
  );
};
