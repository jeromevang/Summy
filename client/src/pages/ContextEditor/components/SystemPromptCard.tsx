import React, { useState } from 'react';

interface SystemPromptCardProps {
  content: string;
  source?: string;
  isExpanded?: boolean;
}

export const SystemPromptCard: React.FC<SystemPromptCardProps> = ({ 
  content, 
  source,
  isExpanded: defaultExpanded = false 
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [copied, setCopied] = useState(false);
  
  const truncatedContent = content.length > 150 
    ? content.substring(0, 150) + '...' 
    : content;
  
  return (
    <div className="mb-4 rounded-lg border border-yellow-500/30 bg-yellow-500/5 overflow-hidden">
      <div 
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-white/5"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">⚙️</span>
          <div>
            <span className="text-xs font-medium text-yellow-400">System Prompt</span>
            {source && (
              <span className="text-xs text-gray-500 ml-2">({source})</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(content);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="text-xs text-gray-400 hover:text-white px-2 py-0.5 rounded bg-[#2d2d2d] hover:bg-[#3d3d3d]"
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
          <span className="text-xs text-gray-500">
            {isExpanded ? '▼' : '▶'}
          </span>
        </div>
      </div>
      
      <div className="px-4 pb-3">
        {isExpanded ? (
          <pre className="text-xs text-gray-300 whitespace-pre-wrap bg-[#0d0d0d] p-3 rounded-lg border border-[#2d2d2d] max-h-96 overflow-y-auto scrollbar-thin font-mono">
            {content}
          </pre>
        ) : (
          <p className="text-xs text-gray-500 truncate">
            {truncatedContent}
          </p>
        )}
        <p className="text-xs text-gray-600 mt-2">
          {content.length.toLocaleString()} characters
        </p>
      </div>
    </div>
  );
};
