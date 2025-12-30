import React, { useState } from 'react';
import { HighlightedText } from './HighlightedText';

interface MessageProps {
  role: string;
  content: string;
  isCompressed?: boolean;
  isPreserved?: boolean;
  isTool?: boolean;
  keywords?: string[];
  keywordMap?: Map<string, string>;
}

export const Message: React.FC<MessageProps> = ({ 
  role, 
  content, 
  isCompressed = false,
  isPreserved = false,
  isTool = false,
  keywords = [],
  keywordMap = new Map()
}) => {
  const isUser = role === 'user';
  const isSystem = role === 'system';
  const isSummary = content.includes('[CONVERSATION SUMMARY]') || content.includes('[TOOL SUMMARY]');
  
  // Determine badge
  let badge = null;
  if (isCompressed || isSummary) {
    badge = <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">COMPRESSED</span>;
  } else if (isPreserved) {
    badge = <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">PRESERVED</span>;
  } else if (isTool) {
    badge = <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400">TOOL</span>;
  }
  
  const bgColor = isUser 
    ? 'bg-blue-600/20 border-blue-500/30' 
    : isSystem 
      ? 'bg-yellow-600/10 border-yellow-500/30'
      : 'bg-[#252525] border-[#3d3d3d]';
  
  const roleLabel = isUser ? '👤 User' : isSystem ? '⚙️ System' : '✨ Assistant';
  const roleColor = isUser ? 'text-blue-400' : isSystem ? 'text-yellow-400' : 'text-purple-400';
  
  // Clean content for display
  let displayContent = content;
  if (isSummary) {
    displayContent = content
      .replace('[CONVERSATION SUMMARY]', '')
      .replace('[END SUMMARY]', '')
      .replace('[TOOL SUMMARY]', '')
      .replace('[END TOOL SUMMARY]', '')
      .trim();
  }
  
  // Truncate long content
  const maxLength = 1000;
  const isTruncated = displayContent.length > maxLength;
  const [isExpanded, setIsExpanded] = useState(false);
  const shownContent = isExpanded ? displayContent : displayContent.substring(0, maxLength);
  
  return (
    <div className={`mb-2 p-3 rounded-lg border ${bgColor}`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs font-medium ${roleColor}`}>{roleLabel}</span>
        {badge}
      </div>
      <div className="text-sm text-gray-200 whitespace-pre-wrap break-words">
        {keywords.length > 0 ? (
          <HighlightedText text={shownContent} keywords={keywords} keywordMap={keywordMap} />
        ) : (
          shownContent
        )}
        {isTruncated && !isExpanded && '...'}
      </div>
      {isTruncated && (
        <button 
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-2 text-xs text-purple-400 hover:text-purple-300"
        >
          {isExpanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
};
