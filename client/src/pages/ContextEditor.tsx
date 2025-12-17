import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface ContextSession {
  id: string;
  name: string;
  ide: string;
  created: string;
  conversations: ConversationTurn[];
  originalSize?: number;
  summarizedSize?: number;
  summary?: any;
}

interface ConversationTurn {
  id: string;
  timestamp: string;
  request: {
    messages: Array<{ role: string; content: string }>;
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

// Code block component for syntax highlighting
const CodeBlock = ({ language, children }: { language: string; children: string }) => {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = () => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group my-3">
      <div className="flex items-center justify-between bg-[#2d2d2d] px-4 py-2 rounded-t-lg border-b border-[#404040]">
        <span className="text-xs text-gray-400 font-mono">{language || 'text'}</span>
        <button
          onClick={handleCopy}
          className="text-xs text-gray-400 hover:text-white transition-colors"
        >
          {copied ? '✓ Copied' : 'Copy'}
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
          fontSize: '13px',
        }}
      >
        {children}
      </SyntaxHighlighter>
    </div>
  );
};

// Thinking/reasoning block component
const ThinkingBlock = ({ content }: { content: string }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  return (
    <div className="my-3 border border-[#3d3d3d] rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-4 py-2 bg-[#2a2a2a] hover:bg-[#333] transition-colors text-left"
      >
        <span className={`transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
        <span className="text-purple-400 text-sm font-medium">💭 Thinking</span>
        <span className="text-gray-500 text-xs ml-auto">{isExpanded ? 'Click to collapse' : 'Click to expand'}</span>
      </button>
      {isExpanded && (
        <div className="px-4 py-3 bg-[#1e1e1e] text-gray-300 text-sm whitespace-pre-wrap border-t border-[#3d3d3d]">
          {content}
        </div>
      )}
    </div>
  );
};

// Message bubble component
const MessageBubble = ({ role, content, timestamp, model, tokens }: {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
  model?: string;
  tokens?: number;
}) => {
  const isUser = role === 'user';
  const isSystem = role === 'system';

  // Extract thinking content if present
  const thinkingMatch = content.match(/<thinking>([\s\S]*?)<\/thinking>/);
  const thinking = thinkingMatch ? thinkingMatch[1] : null;
  const displayContent = thinking 
    ? content.replace(/<thinking>[\s\S]*?<\/thinking>/, '').trim()
    : content;

  if (isSystem) {
    return (
      <div className="my-2 px-4 py-2 bg-[#2a2a2a] rounded-lg border border-[#3d3d3d]">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs text-yellow-500 font-medium">⚙️ System</span>
        </div>
        <div className="text-gray-400 text-sm whitespace-pre-wrap">{content.substring(0, 200)}...</div>
      </div>
    );
  }

  return (
    <div className={`my-4 ${isUser ? 'flex justify-end' : ''}`}>
      <div className={`max-w-[85%] ${isUser ? 'order-2' : ''}`}>
        {/* Header */}
        <div className={`flex items-center gap-2 mb-2 ${isUser ? 'justify-end' : ''}`}>
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm ${
            isUser ? 'bg-blue-600' : 'bg-gradient-to-br from-purple-500 to-pink-500'
          }`}>
            {isUser ? '👤' : '✨'}
          </div>
          <span className="text-sm font-medium text-gray-300">
            {isUser ? 'You' : 'Assistant'}
          </span>
          {timestamp && (
            <span className="text-xs text-gray-500">
              {new Date(timestamp).toLocaleTimeString()}
            </span>
          )}
        </div>

        {/* Content */}
        <div className={`rounded-2xl px-4 py-3 ${
          isUser 
            ? 'bg-blue-600 text-white' 
            : 'bg-[#2a2a2a] text-gray-100 border border-[#3d3d3d]'
        }`}>
          {isUser ? (
            <div className="whitespace-pre-wrap">{displayContent}</div>
          ) : (
            <>
              {thinking && <ThinkingBlock content={thinking} />}
              <div className="prose prose-invert prose-sm max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code({ node, className, children, ...props }: any) {
                      const match = /language-(\w+)/.exec(className || '');
                      const isInline = !match && !className;
                      return isInline ? (
                        <code className="bg-[#1e1e1e] px-1.5 py-0.5 rounded text-pink-400 text-sm" {...props}>
                          {children}
                        </code>
                      ) : (
                        <CodeBlock language={match ? match[1] : ''}>
                          {String(children).replace(/\n$/, '')}
                        </CodeBlock>
                      );
                    },
                    p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
                    ul: ({ children }) => <ul className="list-disc list-inside mb-3 space-y-1">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal list-inside mb-3 space-y-1">{children}</ol>,
                    h1: ({ children }) => <h1 className="text-xl font-bold mb-2 mt-4">{children}</h1>,
                    h2: ({ children }) => <h2 className="text-lg font-bold mb-2 mt-3">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-base font-bold mb-2 mt-2">{children}</h3>,
                    a: ({ children, href }) => (
                      <a href={href} className="text-blue-400 hover:underline" target="_blank" rel="noopener noreferrer">
                        {children}
                      </a>
                    ),
                    blockquote: ({ children }) => (
                      <blockquote className="border-l-4 border-gray-500 pl-4 italic text-gray-400 my-3">
                        {children}
                      </blockquote>
                    ),
                  }}
                >
                  {displayContent}
                </ReactMarkdown>
              </div>
            </>
          )}
        </div>

        {/* Footer for assistant */}
        {!isUser && (model || tokens) && (
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
            {model && <span>🤖 {model}</span>}
            {tokens && <span>📊 {tokens} tokens</span>}
          </div>
        )}
      </div>
    </div>
  );
};

const ContextEditor: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<ContextSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    if (sessionId) {
      loadSession();
      const pollInterval = setInterval(checkForUpdates, 10000);
      return () => clearInterval(pollInterval);
    }
  }, [sessionId]);

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

  const checkForUpdates = async () => {
    if (!sessionId) return;
    try {
      const response = await axios.get(`http://localhost:3001/api/sessions/${sessionId}`);
      const latestSession = response.data;
      if (latestSession.conversations.length > (session?.conversations.length || 0)) {
        setSession(latestSession);
        setLastUpdate(new Date());
      }
    } catch (error) {
      console.error('Failed to check for updates:', error);
    }
  };

  // Extract user message (last one in the array)
  const getUserMessage = (turn: ConversationTurn): string => {
    const userMessages = turn.request?.messages?.filter(m => m.role === 'user') || [];
    return userMessages.length > 0 ? userMessages[userMessages.length - 1].content : '';
  };

  // Extract assistant response
  const getAssistantMessage = (turn: ConversationTurn): string => {
    if (turn.response?.type === 'streaming') {
      return turn.response.content || '';
    }
    return turn.response?.choices?.[0]?.message?.content || '';
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64 bg-[#1a1a1a]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="text-center py-12 bg-[#1a1a1a] min-h-screen">
        <p className="text-gray-400">Session not found.</p>
        <button
          onClick={() => navigate('/')}
          className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
        >
          Back to Sessions
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1a1a1a]">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#1a1a1a] border-b border-[#2d2d2d] px-6 py-4">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/')}
              className="p-2 hover:bg-[#2d2d2d] rounded-lg transition-colors text-gray-400 hover:text-white"
            >
              ←
            </button>
            <div>
              <h1 className="text-lg font-semibold text-white">{session.name}</h1>
              <p className="text-xs text-gray-500">
                {session.ide} • {new Date(session.created).toLocaleDateString()}
                {session.conversations.length > 0 && ` • ${session.conversations.length} turns`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={checkForUpdates}
              className="p-2 hover:bg-[#2d2d2d] rounded-lg transition-colors text-gray-400 hover:text-white"
              title="Refresh"
            >
              🔄
            </button>
            {lastUpdate && (
              <span className="text-xs text-gray-500">
                Updated {lastUpdate.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Chat Container */}
      <div className="max-w-4xl mx-auto px-6 py-6">
        {session.conversations.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-4xl mb-4">💬</div>
            <p className="text-gray-400">No conversations yet.</p>
            <p className="text-gray-500 text-sm mt-2">Start chatting in your IDE to see messages here.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {session.conversations.map((turn, index) => {
              const userMsg = getUserMessage(turn);
              const assistantMsg = getAssistantMessage(turn);
              const model = turn.response?.model || turn.request?.model;
              const tokens = turn.response?.usage?.total_tokens;

              return (
                <div key={turn.id || index} className="pb-4 border-b border-[#2d2d2d] last:border-0">
                  {/* Turn indicator */}
                  <div className="flex items-center gap-2 mb-4">
                    <div className="h-px flex-1 bg-[#2d2d2d]"></div>
                    <span className="text-xs text-gray-600 px-2">Turn {index + 1}</span>
                    <div className="h-px flex-1 bg-[#2d2d2d]"></div>
                  </div>

                  {/* User message */}
                  {userMsg && (
                    <MessageBubble
                      role="user"
                      content={userMsg}
                      timestamp={turn.timestamp}
                    />
                  )}

                  {/* Assistant message */}
                  {assistantMsg && (
                    <MessageBubble
                      role="assistant"
                      content={assistantMsg}
                      timestamp={turn.timestamp}
                      model={model}
                      tokens={tokens}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#1a1a1a] border-t border-[#2d2d2d] px-6 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-4">
            <span>📊 {session.conversations.length} conversation turns</span>
            <span>🔄 Auto-refresh every 10s</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2 py-1 rounded bg-[#2d2d2d] text-gray-400">
              View Only
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContextEditor;
