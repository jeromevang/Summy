import { useState, useEffect } from 'react';
import { ContextSession, ConversationTurn } from '../types';
import { getUserMessage, getAssistantMessage } from '../utils/messageUtils';

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

export const extractKeywords = (text: string): string[] => {
  const keywords: Set<string> = new Set();
  
  // Extract file paths
  const pathMatches = text.match(/[w/\]+\.(ts|tsx|js|jsx|json|md|css|py|go|rs|java|c|cpp|h)/gi);
  if (pathMatches) pathMatches.forEach(k => keywords.add(k));
  
  // Extract technical terms
  const techMatches = text.match(/\b[A-Z][a-z]+[A-Z][a-zA-Z]*\b/g);
  if (techMatches) techMatches.forEach(k => keywords.add(k));
  
  // Extract common programming terms
  const termMatches = text.match(/\b(React|Vue|Angular|TypeScript|JavaScript|Python|Node|Express|API|REST|GraphQL|SQL|JWT|OAuth|HTTP|WebSocket|async|await|function|class|interface|type|const|let|var|import|export)\b/gi);
  if (termMatches) termMatches.forEach(k => keywords.add(k));
  
  return Array.from(keywords).slice(0, 8);
};

export const useKeywords = (session: ContextSession | null) => {
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordMap, setKeywordMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (session) {
      const allText = session.conversations.map((t: ConversationTurn) => {
        const userMsg = getUserMessage(t);
        const assistantMsg = getAssistantMessage(t);
        return `${userMsg} ${assistantMsg}`;
      }).join(' ');
      
      const extracted = extractKeywords(allText);
      setKeywords(extracted);
      
      const map = new Map<string, string>();
      extracted.forEach((keyword, index) => {
        map.set(keyword.toLowerCase(), KEYWORD_COLORS[index % KEYWORD_COLORS.length]);
      });
      setKeywordMap(map);
    }
  }, [session]);

  return { keywords, keywordMap };
};
