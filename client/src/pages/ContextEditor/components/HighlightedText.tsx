import React from 'react';

export const KEYWORD_COLORS = [
  'text-blue-400 bg-blue-400/20',
  'text-green-400 bg-green-400/20',
  'text-yellow-400 bg-yellow-400/20',
  'text-pink-400 bg-pink-400/20',
  'text-cyan-400 bg-cyan-400/20',
  'text-orange-400 bg-orange-400/20',
  'text-purple-400 bg-purple-400/20',
  'text-red-400 bg-red-400/20',
];

interface HighlightedTextProps {
  text: string;
  keywords: string[];
  keywordMap: Map<string, string>;
}

export const HighlightedText: React.FC<HighlightedTextProps> = ({ text, keywords, keywordMap }) => {
  if (!keywords.length || !text) return <span>{text}</span>;
  
  // Create regex pattern
  const pattern = new RegExp(`(${keywords.map(k => k.replace(/[.*+?^${}()|[\\]/g, '\\$&')).join('|')})`, 'gi');
  const parts = text.split(pattern);
  
  return (
    <span>
      {parts.map((part, i) => {
        const lowerPart = part.toLowerCase();
        const matchedKeyword = keywords.find(k => k.toLowerCase() === lowerPart);
        if (matchedKeyword) {
          const colorClass = keywordMap.get(matchedKeyword.toLowerCase()) || KEYWORD_COLORS[0];
          return (
            <span key={i} className={`${colorClass} px-1 rounded`}>
              {part}
            </span>
          );
        }
        return part;
      })}
    </span>
  );
};
