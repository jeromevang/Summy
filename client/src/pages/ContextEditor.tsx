import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface CompressionConfig {
  mode: 0 | 1 | 2 | 3;
  keepRecent: number;
  enabled: boolean;
  lastCompressed?: string;
  stats?: {
    originalTokens: number;
    compressedTokens: number;
    ratio: number;
  };
}

interface ContextSession {
  id: string;
  name: string;
  ide: string;
  created: string;
  conversations: ConversationTurn[];
  compression?: CompressionConfig;
  compressedConversations?: any[];
}

interface ConversationTurn {
  id: string;
  timestamp: string;
  request: {
    messages: Array<{ role: string; content: string; tool_calls?: any[] }>;
    model?: string;
  };
  response: {
    type?: string;
    content?: string;
    model?: string;
    usage?: { total_tokens?: number };
    finish_reason?: string;
    choices?: Array<{ message?: { content: string }; finish_reason?: string }>;
  };
}

// Keyword colors for highlighting
const KEYWORD_COLORS = [
  'text-blue-400 bg-blue-400/20',
  'text-green-400 bg-green-400/20',
  'text-yellow-400 bg-yellow-400/20',
  'text-pink-400 bg-pink-400/20',
  'text-cyan-400 bg-cyan-400/20',
  'text-orange-400 bg-orange-400/20',
  'text-purple-400 bg-purple-400/20',
  'text-red-400 bg-red-400/20',
];

// Extract keywords from text
const extractKeywords = (text: string): string[] => {
  const keywords: Set<string> = new Set();
  
  // Extract file paths
  const pathMatches = text.match(/[\w\/\\]+\.(ts|tsx|js|jsx|json|md|css|py|go|rs|java|c|cpp|h)/gi);
  if (pathMatches) pathMatches.forEach(k => keywords.add(k));
  
  // Extract technical terms (camelCase, PascalCase)
  const techMatches = text.match(/\b[A-Z][a-z]+[A-Z][a-zA-Z]*\b/g);
  if (techMatches) techMatches.forEach(k => keywords.add(k));
  
  // Extract common programming terms
  const termMatches = text.match(/\b(React|Vue|Angular|TypeScript|JavaScript|Python|Node|Express|API|REST|GraphQL|SQL|JWT|OAuth|HTTP|WebSocket|async|await|function|class|interface|type|const|let|var|import|export)\b/gi);
  if (termMatches) termMatches.forEach(k => keywords.add(k));
  
  return Array.from(keywords).slice(0, 8); // Limit to 8 keywords
};

// Highlight keywords in text
const HighlightedText = ({ text, keywords, keywordMap }: { 
  text: string; 
  keywords: string[]; 
  keywordMap: Map<string, string>;
}) => {
  if (!keywords.length || !text) return <span>{text}</span>;
  
  // Create regex pattern
  const pattern = new RegExp(`(${keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
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

// Code block component
const CodeBlock = ({ language, children }: { language: string; children: string }) => {
  const [copied, setCopied] = useState(false);
  
  return (
    <div className="relative group my-2">
      <div className="flex items-center justify-between bg-[#2d2d2d] px-3 py-1.5 rounded-t-lg border-b border-[#404040]">
        <span className="text-xs text-gray-400 font-mono">{language || 'text'}</span>
        <button
          onClick={() => {
            navigator.clipboard.writeText(children);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="text-xs text-gray-400 hover:text-white transition-colors"
        >
          {copied ? '✓' : 'Copy'}
        </button>
      </div>
      <SyntaxHighlighter
        language={language || 'text'}
        style={oneDark}
        customStyle={{
          margin: 0,
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
          borderBottomLeftRadius: '0.5rem',
          borderBottomRightRadius: '0.5rem',
          fontSize: '12px',
          padding: '0.75rem',
        }}
      >
        {children}
      </SyntaxHighlighter>
    </div>
  );
};

// Message component for both panels
const Message = ({ 
  role, 
  content, 
  isCompressed = false,
  isPreserved = false,
  isTool = false,
  keywords = [],
  keywordMap = new Map()
}: {
  role: string;
  content: string;
  isCompressed?: boolean;
  isPreserved?: boolean;
  isTool?: boolean;
  keywords?: string[];
  keywordMap?: Map<string, string>;
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

// Compression mode names
const COMPRESSION_MODES = [
  { value: 0, label: 'None', description: 'No compression' },
  { value: 1, label: 'Light', description: 'Compress text, preserve tools' },
  { value: 2, label: 'Medium', description: 'Compress text, truncate tool outputs' },
  { value: 3, label: 'Aggressive', description: 'Convert everything to text summaries' },
];

const ContextEditor: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<ContextSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [compressing, setCompressing] = useState(false);
  const [compressionMode, setCompressionMode] = useState<0 | 1 | 2 | 3>(1);
  const [keepRecent, setKeepRecent] = useState(5);
  const [autoCompress, setAutoCompress] = useState(false);
  const [compressedPreview, setCompressedPreview] = useState<any[] | null>(null);
  const [compressionStats, setCompressionStats] = useState<{ originalTokens: number; compressedTokens: number; ratio: number } | null>(null);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordMap, setKeywordMap] = useState<Map<string, string>>(new Map());
  const [lmstudioConnected, setLmstudioConnected] = useState<boolean | null>(null);
  
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);
  const [syncScroll, setSyncScroll] = useState(true);

  // Load session
  useEffect(() => {
    if (sessionId) {
      loadSession();
      checkLMStudioConnection();
    }
  }, [sessionId]);

  // Extract keywords when session loads
  useEffect(() => {
    if (session) {
      const allText = session.conversations.map(t => {
        const userMsg = getUserMessage(t);
        const assistantMsg = getAssistantMessage(t);
        return `${userMsg} ${assistantMsg}`;
      }).join(' ');
      
      const extracted = extractKeywords(allText);
      setKeywords(extracted);
      
      // Create keyword color map
      const map = new Map<string, string>();
      extracted.forEach((keyword, index) => {
        map.set(keyword.toLowerCase(), KEYWORD_COLORS[index % KEYWORD_COLORS.length]);
      });
      setKeywordMap(map);
      
      // Load compression settings from session
      if (session.compression) {
        setCompressionMode(session.compression.mode);
        setKeepRecent(session.compression.keepRecent);
        setAutoCompress(session.compression.enabled);
        if (session.compression.stats) {
          setCompressionStats(session.compression.stats);
        }
      }
      
      // Load compressed preview if available
      if (session.compressedConversations) {
        setCompressedPreview(session.compressedConversations);
      }
    }
  }, [session]);

  // Sync scroll between panels
  const handleScroll = useCallback((source: 'left' | 'right') => {
    if (!syncScroll) return;
    
    const sourceRef = source === 'left' ? leftPanelRef : rightPanelRef;
    const targetRef = source === 'left' ? rightPanelRef : leftPanelRef;
    
    if (sourceRef.current && targetRef.current) {
      const scrollPercentage = sourceRef.current.scrollTop / 
        (sourceRef.current.scrollHeight - sourceRef.current.clientHeight);
      targetRef.current.scrollTop = scrollPercentage * 
        (targetRef.current.scrollHeight - targetRef.current.clientHeight);
    }
  }, [syncScroll]);

  const loadSession = async () => {
    if (!sessionId) return;
    try {
      const response = await axios.get(`http://localhost:3001/api/sessions/${sessionId}`);
      setSession(response.data);
    } catch (error) {
      console.error('Failed to load session:', error);
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const checkLMStudioConnection = async () => {
    try {
      const response = await axios.post('http://localhost:3001/api/test-lmstudio', {});
      setLmstudioConnected(response.data.success);
    } catch {
      setLmstudioConnected(false);
    }
  };

  const getUserMessage = (turn: ConversationTurn): string => {
    const userMessages = turn.request?.messages?.filter(m => m.role === 'user') || [];
    return userMessages.length > 0 ? userMessages[userMessages.length - 1].content : '';
  };

  const getAssistantMessage = (turn: ConversationTurn): string => {
    if (turn.response?.type === 'streaming') {
      return turn.response.content || '';
    }
    return turn.response?.choices?.[0]?.message?.content || '';
  };

  const getAllMessages = (): any[] => {
    if (!session) return [];
    const messages: any[] = [];
    
    for (const turn of session.conversations) {
      // Add user message
      const userMsg = getUserMessage(turn);
      if (userMsg) {
        messages.push({ role: 'user', content: userMsg });
      }
      
      // Add assistant message (check for tool calls)
      if (turn.request?.messages) {
        const assistantWithTools = turn.request.messages.find(m => m.role === 'assistant' && m.tool_calls);
        if (assistantWithTools) {
          messages.push(assistantWithTools);
        }
      }
      
      // Add tool responses
      if (turn.request?.messages) {
        const toolMessages = turn.request.messages.filter(m => m.role === 'tool');
        messages.push(...toolMessages);
      }
      
      // Add assistant response
      const assistantMsg = getAssistantMessage(turn);
      if (assistantMsg) {
        messages.push({ role: 'assistant', content: assistantMsg });
      }
    }
    
    return messages;
  };

  const handleCompress = async () => {
    if (!session || !lmstudioConnected) return;
    
    setCompressing(true);
    try {
      const response = await axios.post(`http://localhost:3001/api/sessions/${session.id}/compress`, {
        mode: compressionMode,
        keepRecent: keepRecent
      });
      
      if (response.data.success) {
        setCompressionStats(response.data.stats);
        // Reload session to get compressed data
        await loadSession();
      }
    } catch (error: any) {
      alert(`Compression failed: ${error.response?.data?.message || error.message}`);
    } finally {
      setCompressing(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!session) return;
    
    try {
      await axios.post(`http://localhost:3001/api/sessions/${session.id}/compression`, {
        mode: compressionMode,
        keepRecent: keepRecent,
        enabled: autoCompress
      });
      await loadSession();
    } catch (error) {
      console.error('Failed to save compression settings:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-[#0d0d0d]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="text-center py-12 bg-[#0d0d0d] min-h-screen">
        <p className="text-gray-400">Session not found.</p>
        <button
          onClick={() => navigate('/')}
          className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg"
        >
          Back to Sessions
        </button>
      </div>
    );
  }

  const allMessages = getAllMessages();

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#0d0d0d] border-b border-[#2d2d2d] px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="p-2 hover:bg-[#2d2d2d] rounded-lg text-gray-400 hover:text-white"
            >
              ←
            </button>
            <div>
              <h1 className="text-base font-semibold">{session.name}</h1>
              <p className="text-xs text-gray-500">
                {session.ide} • {session.conversations.length} turns
              </p>
            </div>
          </div>
          
          {/* Compression Controls */}
          <div className="flex items-center gap-3">
            <select
              value={compressionMode}
              onChange={(e) => setCompressionMode(Number(e.target.value) as 0 | 1 | 2 | 3)}
              className="bg-[#1a1a1a] border border-[#3d3d3d] rounded-lg px-3 py-1.5 text-sm"
            >
              {COMPRESSION_MODES.map(mode => (
                <option key={mode.value} value={mode.value}>
                  {mode.label} - {mode.description}
                </option>
              ))}
            </select>
            
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Keep recent:</span>
              <input
                type="number"
                value={keepRecent}
                onChange={(e) => setKeepRecent(Math.max(1, parseInt(e.target.value) || 5))}
                className="w-12 bg-[#1a1a1a] border border-[#3d3d3d] rounded px-2 py-1 text-sm"
                min={1}
                max={20}
              />
            </div>
            
            <button
              onClick={handleCompress}
              disabled={compressing || !lmstudioConnected || compressionMode === 0}
              className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium"
            >
              {compressing ? 'Compressing...' : '🗜️ Compress'}
            </button>
            
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={autoCompress}
                onChange={(e) => {
                  setAutoCompress(e.target.checked);
                  handleSaveSettings();
                }}
                className="rounded"
              />
              <span className="text-gray-400">Auto</span>
            </label>
            
            <div className={`w-2 h-2 rounded-full ${lmstudioConnected ? 'bg-green-500' : 'bg-red-500'}`} 
                 title={lmstudioConnected ? 'LMStudio connected' : 'LMStudio not connected'} />
          </div>
        </div>
        
        {/* Stats Bar */}
        {compressionStats && (
          <div className="flex items-center gap-4 mt-2 text-xs">
            <span className="text-gray-400">
              Original: <span className="text-white">{compressionStats.originalTokens.toLocaleString()}</span> tokens
            </span>
            <span className="text-gray-400">
              Compressed: <span className="text-green-400">{compressionStats.compressedTokens.toLocaleString()}</span> tokens
            </span>
            <span className="text-gray-400">
              Saved: <span className="text-purple-400">{Math.round(compressionStats.ratio * 100)}%</span>
            </span>
            <div className="flex-1 h-2 bg-[#2d2d2d] rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
                style={{ width: `${Math.round(compressionStats.ratio * 100)}%` }}
              />
            </div>
          </div>
        )}
        
        {/* Keywords */}
        {keywords.length > 0 && (
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="text-xs text-gray-500">Keywords:</span>
            {keywords.map((keyword, i) => (
              <span key={i} className={`text-xs px-2 py-0.5 rounded ${KEYWORD_COLORS[i % KEYWORD_COLORS.length]}`}>
                {keyword}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Main Content - Side by Side */}
      <div className="flex h-[calc(100vh-140px)]">
        {/* Left Panel - Original */}
        <div className="flex-1 flex flex-col border-r border-[#2d2d2d]">
          <div className="px-4 py-2 bg-[#1a1a1a] border-b border-[#2d2d2d]">
            <span className="text-sm font-medium text-gray-300">📝 Original</span>
            <span className="text-xs text-gray-500 ml-2">
              {allMessages.length} messages • ~{Math.round(JSON.stringify(allMessages).length / 4).toLocaleString()} tokens
            </span>
          </div>
          <div 
            ref={leftPanelRef}
            className="flex-1 overflow-y-auto p-4"
            onScroll={() => handleScroll('left')}
          >
            {allMessages.map((msg, idx) => (
              <Message
                key={idx}
                role={msg.role}
                content={msg.content || JSON.stringify(msg.tool_calls || msg, null, 2)}
                isTool={msg.role === 'tool' || !!msg.tool_calls}
                keywords={keywords}
                keywordMap={keywordMap}
              />
            ))}
          </div>
        </div>

        {/* Right Panel - Compressed */}
        <div className="flex-1 flex flex-col">
          <div className="px-4 py-2 bg-[#1a1a1a] border-b border-[#2d2d2d] flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-gray-300">🗜️ Compressed</span>
              {compressedPreview && (
                <span className="text-xs text-gray-500 ml-2">
                  {compressedPreview.length} messages
                </span>
              )}
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={syncScroll}
                onChange={(e) => setSyncScroll(e.target.checked)}
                className="rounded"
              />
              <span className="text-gray-400">Sync scroll</span>
            </label>
          </div>
          <div 
            ref={rightPanelRef}
            className="flex-1 overflow-y-auto p-4"
            onScroll={() => handleScroll('right')}
          >
            {!compressedPreview || compressedPreview.length === 0 ? (
              <div className="text-center py-20">
                <div className="text-4xl mb-4">🗜️</div>
                <p className="text-gray-400">No compressed version yet.</p>
                <p className="text-gray-500 text-sm mt-2">
                  {lmstudioConnected 
                    ? 'Click "Compress" to generate a compressed version.'
                    : 'Connect LMStudio to enable compression.'}
                </p>
              </div>
            ) : (
              compressedPreview.map((turn: any, idx: number) => {
                const msg = turn.request?.messages?.[0] || turn;
                const isSummary = msg.content?.includes('[SUMMARY]') || msg.content?.includes('[CONVERSATION SUMMARY]');
                const isPreserved = msg.role === 'tool' || msg.tool_calls;
                
                return (
                  <Message
                    key={idx}
                    role={msg.role || 'system'}
                    content={msg.content || JSON.stringify(msg, null, 2)}
                    isCompressed={isSummary}
                    isPreserved={isPreserved}
                    isTool={msg.role === 'tool' || !!msg.tool_calls}
                    keywords={keywords}
                    keywordMap={keywordMap}
                  />
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#0d0d0d] border-t border-[#2d2d2d] px-4 py-2">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-4">
            <span>Mode: {COMPRESSION_MODES[compressionMode].label}</span>
            <span>Keep recent: {keepRecent}</span>
            {autoCompress && <span className="text-green-400">● Auto-compress ON</span>}
          </div>
          <div className="flex items-center gap-2">
            <span className={lmstudioConnected ? 'text-green-400' : 'text-red-400'}>
              LMStudio: {lmstudioConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContextEditor;
