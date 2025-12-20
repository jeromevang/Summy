import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import ReconnectingWebSocket from 'reconnecting-websocket';

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
  systemPrompt?: string | null;
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

// Tooly phase information
interface ToolyPhase {
  phase: 'planning' | 'execution' | 'response';
  systemPrompt: string;
  model: string;
  latencyMs: number;
  reasoning?: string;
}

interface ToolyToolCallMeta {
  id: string;
  name: string;
  arguments: any;
  result?: any;
  status: 'success' | 'failed' | 'timeout' | 'pending';
  latencyMs?: number;
  error?: string;
}

interface ToolyMeta {
  mode?: 'single' | 'dual' | 'passthrough';
  phases?: ToolyPhase[];
  toolCalls?: ToolyToolCallMeta[];
  totalLatencyMs?: number;
  // Agentic loop fields
  agenticLoop?: boolean;
  toolExecutions?: Array<{
    toolName: string;
    mcpTool: string;
    args: any;
    result: string;
    toolCallId: string;
  }>;
  iterations?: number;
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
  toolyMeta?: ToolyMeta;
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

// ============================================================
// TOOL CALL CARD COMPONENT
// ============================================================

interface ToolCallInfo {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

interface ToolResultInfo {
  tool_call_id: string;
  content: string;
  name?: string;
}

// Parse tool calls from assistant message
const parseToolCalls = (msg: any): ToolCallInfo[] => {
  if (!msg.tool_calls || !Array.isArray(msg.tool_calls)) return [];
  
  return msg.tool_calls.map((tc: any) => ({
    id: tc.id || 'unknown',
    name: tc.function?.name || tc.name || 'unknown_tool',
    arguments: typeof tc.function?.arguments === 'string' 
      ? (() => { try { return JSON.parse(tc.function.arguments); } catch { return { raw: tc.function.arguments }; } })()
      : tc.function?.arguments || tc.arguments || {}
  }));
};

// Tool Call Card - Shows tool execution with args and results
const ToolCallCard = ({ 
  toolCall, 
  result,
  isExpanded: defaultExpanded = false 
}: { 
  toolCall: ToolCallInfo; 
  result?: ToolResultInfo;
  isExpanded?: boolean;
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [copiedArgs, setCopiedArgs] = useState(false);
  const [copiedResult, setCopiedResult] = useState(false);
  
  // Determine status based on result
  // Only mark as error if there's an explicit error object from MCP, not based on content text
  const hasResult = !!result;
  const isError = (() => {
    if (!result) return false;
    // Only check for explicit error objects from MCP server
    if (result.isError === true) return true;
    try {
      const parsed = JSON.parse(result.content);
      if (parsed.isError === true || parsed.error === true) return true;
    } catch { /* not JSON or no error field */ }
    return false;
  })();
  const status = !hasResult ? 'pending' : isError ? 'failed' : 'success';
  
  const statusColors = {
    success: { border: 'border-green-500/40', bg: 'bg-green-500/5', icon: '✅', text: 'text-green-400' },
    failed: { border: 'border-red-500/40', bg: 'bg-red-500/5', icon: '❌', text: 'text-red-400' },
    pending: { border: 'border-yellow-500/40', bg: 'bg-yellow-500/5', icon: '⏳', text: 'text-yellow-400' }
  };
  
  const colors = statusColors[status];
  
  // Format arguments for display
  const formatArgs = (args: Record<string, any>): string => {
    try {
      return JSON.stringify(args, null, 2);
    } catch {
      return String(args);
    }
  };
  
  // Truncate long content
  const truncateContent = (content: string, maxLength: number = 500): string => {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '\n... (truncated)';
  };
  
  // Get a preview of the arguments
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
      {/* Header */}
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
      
      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-[#2d2d2d]">
          {/* Arguments Section */}
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
          
          {/* Result Section */}
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
              
              {/* Error hints for failed tool calls */}
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
          
          {/* No result yet */}
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

// ============================================================
// SYSTEM PROMPT CARD COMPONENT  
// ============================================================

const SystemPromptCard = ({ 
  content, 
  source,
  isExpanded: defaultExpanded = false 
}: { 
  content: string;
  source?: string;
  isExpanded?: boolean;
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [copied, setCopied] = useState(false);
  
  const truncatedContent = content.length > 150 
    ? content.substring(0, 150) + '...' 
    : content;
  
  return (
    <div className="mb-4 rounded-lg border border-yellow-500/30 bg-yellow-500/5 overflow-hidden">
      {/* Header */}
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
      
      {/* Content */}
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

// ============================================================
// TIMELINE COMPONENTS FOR TURN VISUALIZATION
// ============================================================

// Timeline Phase Component - shows a processing phase (planning/execution/response)
const TimelinePhase = ({ 
  phase, 
  isExpanded: defaultExpanded = false 
}: { 
  phase: ToolyPhase; 
  isExpanded?: boolean;
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [copied, setCopied] = useState(false);
  
  const phaseConfig = {
    planning: { icon: '🧠', label: 'Planning', colors: 'text-blue-400 border-blue-500/30 bg-blue-500/5' },
    execution: { icon: '⚡', label: 'Execution', colors: 'text-orange-400 border-orange-500/30 bg-orange-500/5' },
    response: { icon: '💬', label: 'Response', colors: 'text-green-400 border-green-500/30 bg-green-500/5' }
  };
  
  const config = phaseConfig[phase.phase] || phaseConfig.response;
  
  return (
    <div className="relative pl-8 pb-3">
      {/* Timeline dot */}
      <div className="absolute left-5 w-3 h-3 rounded-full bg-[#2d2d2d] border-2 border-purple-500 -translate-x-1/2" />
      
      {/* Phase card */}
      <div className={`rounded-lg border ${config.colors}`}>
        <div 
          className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-white/5"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2">
            <span>{config.icon}</span>
            <span className="text-xs font-medium">{config.label}</span>
            <span className="text-xs text-gray-500 font-mono">{phase.model}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">{phase.latencyMs}ms</span>
            <span className="text-xs text-gray-500">{isExpanded ? '▼' : '▶'}</span>
          </div>
        </div>
        
        {isExpanded && (
          <div className="px-3 pb-3 border-t border-[#2d2d2d] space-y-2">
            {/* System Prompt */}
            <div className="mt-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-yellow-400">⚙️ System Prompt</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(phase.systemPrompt);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="text-xs text-gray-400 hover:text-white px-1.5 py-0.5 rounded bg-[#2d2d2d] hover:bg-[#3d3d3d]"
                >
                  {copied ? '✓' : 'Copy'}
                </button>
              </div>
              <pre className="text-xs text-gray-400 bg-[#0a0a0a] p-2 rounded max-h-48 overflow-y-auto scrollbar-thin whitespace-pre-wrap font-mono">
                {phase.systemPrompt || '(No system prompt)'}
              </pre>
            </div>
            
            {/* Reasoning (for planning phase) */}
            {phase.reasoning && (
              <div className="mt-2">
                <div className="text-xs text-blue-400 mb-1">💭 AI Reasoning</div>
                <pre className="text-xs text-gray-400 bg-[#0a0a0a] p-2 rounded max-h-48 overflow-y-auto scrollbar-thin whitespace-pre-wrap font-mono">
                  {phase.reasoning}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Timeline Tool Call Component - shows a tool execution with status
const TimelineToolCall = ({ 
  toolCall 
}: { 
  toolCall: ToolyToolCallMeta;
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
      {/* Timeline dot */}
      <div className={`absolute left-5 w-3 h-3 rounded-full ${config.dot} -translate-x-1/2`} />
      
      {/* Tool call card */}
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
            {/* Arguments */}
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
            
            {/* Result */}
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
            
            {/* Error message */}
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

// Processing Timeline - shows all phases and tool calls in a turn
const ProcessingTimeline = ({ 
  turn 
}: { 
  turn: ConversationTurn;
}) => {
  const toolyMeta = turn.toolyMeta || (turn.response as any)?.toolyMeta;
  
  // Check for agentic loop executions first
  const agenticExecutions = toolyMeta?.toolExecutions || [];
  const hasAgenticLoop = toolyMeta?.agenticLoop && agenticExecutions.length > 0;
  
  // Also extract tool calls from the request messages if toolyMeta not available
  const requestToolCalls = turn.request?.messages
    ?.filter(m => m.role === 'assistant' && m.tool_calls)
    ?.flatMap(m => m.tool_calls || []) || [];
  
  const toolResults = turn.request?.messages
    ?.filter(m => m.role === 'tool') || [];
  
  // Convert agentic executions to ToolyToolCallMeta format
  const agenticToolCalls: ToolyToolCallMeta[] = agenticExecutions.map(exec => ({
    id: exec.toolCallId || 'agentic',
    name: `${exec.toolName} → ${exec.mcpTool}`,
    arguments: exec.args,
    result: exec.result,
    status: 'success' as const,
    latencyMs: undefined
  }));
  
  // Merge tool calls with results (for non-agentic calls)
  const mergedToolCalls: ToolyToolCallMeta[] = toolyMeta?.toolCalls || requestToolCalls.map(tc => {
    const result = toolResults.find(tr => tr.tool_call_id === tc.id);
    
    // Only mark as error if there's an explicit error object from MCP
    const isError = (() => {
      if (!result) return false;
      if ((result as any).isError === true) return true;
      try {
        const parsed = JSON.parse(result.content);
        if (parsed.isError === true || parsed.error === true) return true;
      } catch { /* not JSON */ }
      return false;
    })();
    
    return {
      id: tc.id || 'unknown',
      name: tc.function?.name || tc.name || 'unknown',
      arguments: typeof tc.function?.arguments === 'string' 
        ? (() => { try { return JSON.parse(tc.function.arguments); } catch { return { raw: tc.function.arguments }; } })()
        : tc.function?.arguments || tc.arguments || {},
      result: result?.content,
      status: result ? (isError ? 'failed' : 'success') : 'pending',
      latencyMs: undefined
    } as ToolyToolCallMeta;
  });
  
  // Combine all tool calls
  const allToolCalls = [...agenticToolCalls, ...mergedToolCalls];
  
  const hasPhases = toolyMeta?.phases && toolyMeta.phases.length > 0;
  const hasToolCalls = allToolCalls.length > 0;
  
  if (!hasPhases && !hasToolCalls && !hasAgenticLoop) {
    // Extract system prompt from request if available
    const systemPrompt = turn.request?.messages?.find(m => m.role === 'system')?.content;
    if (!systemPrompt) {
      return null;
    }
    
    // Show just the system prompt as a simple phase
    return (
      <div className="border-t border-[#2d2d2d] bg-[#0d0d0d]">
        <div className="px-4 py-2 border-b border-[#2d2d2d]">
          <span className="text-xs font-medium text-gray-400">📋 Processing Details</span>
        </div>
        <div className="relative px-4 py-3">
          <div className="absolute left-7 top-3 bottom-3 w-0.5 bg-[#2d2d2d]" />
          <TimelinePhase 
            phase={{
              phase: 'response',
              systemPrompt: systemPrompt,
              model: turn.request?.model || 'unknown',
              latencyMs: 0
            }}
          />
        </div>
      </div>
    );
  }
  
  return (
    <div className="border-t border-[#2d2d2d] bg-[#0d0d0d]">
      {/* Timeline header */}
      <div className="px-4 py-2 border-b border-[#2d2d2d] flex items-center gap-2">
        <span className="text-xs font-medium text-gray-400">📋 Processing Steps</span>
        <span className="text-xs text-gray-600">
          {hasAgenticLoop && (
            <span className="text-green-400">🔄 Agentic Loop ({toolyMeta?.iterations} iterations)</span>
          )}
          {toolyMeta?.mode && ` (${toolyMeta.mode} mode)`}
          {hasPhases && ` • ${toolyMeta?.phases?.length} phases`}
          {hasToolCalls && ` • ${allToolCalls.length} tool calls`}
        </span>
      </div>
      
      {/* Timeline items */}
      <div className="relative px-4 py-3">
        {/* Vertical line */}
        <div className="absolute left-7 top-3 bottom-3 w-0.5 bg-[#2d2d2d]" />
        
        {/* Agentic loop indicator */}
        {hasAgenticLoop && (
          <div className="mb-3 ml-6 p-2 rounded bg-green-500/10 border border-green-500/30">
            <div className="flex items-center gap-2 text-xs text-green-400">
              <span>🔄</span>
              <span className="font-medium">Agentic Tool Execution</span>
              <span className="text-green-300/70">
                • {agenticExecutions.length} tool{agenticExecutions.length !== 1 ? 's' : ''} executed via MCP
                • {toolyMeta?.iterations} LLM iteration{toolyMeta?.iterations !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        )}
        
        {/* Phases */}
        {toolyMeta?.phases?.map((phase, idx) => (
          <TimelinePhase 
            key={`phase-${idx}`}
            phase={phase}
          />
        ))}
        
        {/* Tool calls */}
        {allToolCalls.map((tc, idx) => (
          <TimelineToolCall 
            key={`tc-${tc.id}-${idx}`}
            toolCall={tc}
          />
        ))}
      </div>
    </div>
  );
};

// Turn Card - wraps a complete conversation turn with expandable details
const TurnCard = ({ 
  turn,
  turnIndex,
  isExpanded,
  onToggle,
  getUserMessage: getUserMsg,
  getAssistantMessage: getAssistantMsg
}: { 
  turn: ConversationTurn;
  turnIndex: number;
  isExpanded: boolean;
  onToggle: () => void;
  getUserMessage: (turn: ConversationTurn) => string;
  getAssistantMessage: (turn: ConversationTurn) => string;
}) => {
  const userMessage = getUserMsg(turn);
  const assistantMessage = getAssistantMsg(turn);
  
  // Get toolyMeta from turn or response
  const toolyMeta = turn.toolyMeta || (turn.response as any)?.toolyMeta;
  
  // Check for agentic loop
  const hasAgenticLoop = toolyMeta?.agenticLoop && toolyMeta?.toolExecutions?.length > 0;
  const agenticToolCount = toolyMeta?.toolExecutions?.length || 0;
  
  // Check if this turn has tool calls (regular or agentic)
  const hasToolCalls = turn.request?.messages?.some(m => m.role === 'assistant' && m.tool_calls?.length > 0) ||
                       toolyMeta?.toolCalls?.length || hasAgenticLoop;
  const toolCallCount = agenticToolCount || toolyMeta?.toolCalls?.length || 
                        turn.request?.messages?.filter(m => m.role === 'assistant' && m.tool_calls)
                          .flatMap(m => m.tool_calls || []).length || 0;
  
  const mode = toolyMeta?.mode;
  
  return (
    <div className="mb-3 rounded-lg border border-[#2d2d2d] overflow-hidden bg-[#1a1a1a]">
      {/* Header */}
      <div 
        className="flex items-center justify-between px-4 py-2 bg-[#1a1a1a] cursor-pointer hover:bg-[#252525]"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-gray-400">Turn {turnIndex + 1}</span>
          {hasAgenticLoop && (
            <span className="text-xs px-2 py-0.5 rounded bg-green-500/20 text-green-400">
              🔄 Agentic ({toolyMeta?.iterations} iter)
            </span>
          )}
          {hasToolCalls && (
            <span className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-400">
              🔧 {toolCallCount} tool{toolCallCount !== 1 ? 's' : ''}
            </span>
          )}
          {mode && mode !== 'passthrough' && (
            <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-400">
              {mode === 'dual' ? '🔀 Dual' : '📍 Single'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {new Date(turn.timestamp).toLocaleTimeString()}
          </span>
          <span className="text-xs text-gray-500">{isExpanded ? '▼' : '▶'}</span>
        </div>
      </div>
      
      {/* User Message */}
      <div className="px-4 py-3 border-t border-[#2d2d2d] bg-blue-600/10">
        <div className="text-xs text-blue-400 mb-1">👤 User</div>
        <div className="text-sm text-gray-200 whitespace-pre-wrap break-words">
          {userMessage.length > 500 && !isExpanded 
            ? userMessage.substring(0, 500) + '...' 
            : userMessage}
        </div>
      </div>
      
      {/* Expanded Details (Processing Timeline) */}
      {isExpanded && (
        <ProcessingTimeline turn={turn} />
      )}
      
      {/* Assistant Response */}
      {assistantMessage && (
        <div className="px-4 py-3 border-t border-[#2d2d2d]">
          <div className="text-xs text-purple-400 mb-1">✨ Assistant</div>
          <div className="text-sm text-gray-200 whitespace-pre-wrap break-words">
            {assistantMessage.length > 500 && !isExpanded 
              ? assistantMessage.substring(0, 500) + '...' 
              : assistantMessage}
          </div>
        </div>
      )}
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

// Source Message component - shows raw message data for Source View
const SourceMessage = ({ msg }: { msg: any }) => {
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
  
  // IDE messages (user + assistant without tool calls) get plain text, others get code block styling
  const isIDEMessage = msg.role === 'user' || (msg.role === 'assistant' && !hasToolCalls);
  
  // Format content for display
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
      {/* Header */}
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
      
      {/* Content */}
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
      
      {/* Tool Calls */}
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
      
      {/* Tool Result metadata */}
      {isToolResult && msg.tool_call_id && (
        <div className="text-xs text-gray-500 font-mono mt-1">
          tool_call_id: {msg.tool_call_id}
        </div>
      )}
      
      {/* Agentic Execution Args */}
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

// Compression mode names
const COMPRESSION_MODES = [
  { value: 0, label: 'None', description: 'Original - no compression', color: 'gray' },
  { value: 1, label: 'Light', description: 'Summarize text, preserve tools', color: 'green' },
  { value: 2, label: 'Medium', description: 'Summarize text, truncate tools', color: 'yellow' },
  { value: 3, label: 'Aggressive', description: 'Convert everything to summaries', color: 'red' },
];

// Compression versions interface
interface CompressionVersion {
  messages: any[];
  stats: { originalTokens: number; compressedTokens: number; ratio: number };
}

interface CompressionVersions {
  none: CompressionVersion;
  light: CompressionVersion;
  medium: CompressionVersion;
  aggressive: CompressionVersion;
}

// Compression Stepper Component (panels with border style)
const CompressionStepper = ({ 
  value, 
  onChange, 
  versions,
  disabled 
}: { 
  value: 0 | 1 | 2 | 3; 
  onChange: (v: 0 | 1 | 2 | 3) => void;
  versions: CompressionVersions | null;
  disabled?: boolean;
}) => {
  const steps = [
    { value: 0, label: 'None', description: 'Original messages', key: 'none' },
    { value: 1, label: 'Light', description: 'Summarize text only', key: 'light' },
    { value: 2, label: 'Medium', description: 'Truncate tool outputs', key: 'medium' },
    { value: 3, label: 'Aggressive', description: 'Full compression', key: 'aggressive' },
  ];

  const getStats = (key: string) => {
    if (!versions) return null;
    return versions[key as keyof CompressionVersions]?.stats;
  };

  return (
    <div className="w-full">
      <div className="flex items-stretch">
        {steps.map((step, idx) => {
          const stats = getStats(step.key);
          const isActive = value === step.value;
          const isPast = value > step.value;
          const isFirst = idx === 0;
          const isLast = idx === steps.length - 1;
          
          return (
            <button
              key={step.value}
              onClick={() => !disabled && onChange(step.value as 0 | 1 | 2 | 3)}
              disabled={disabled}
              className={`
                relative flex-1 flex items-center gap-3 px-4 py-3
                border-y border-r first:border-l first:rounded-l-lg last:rounded-r-lg
                transition-all duration-200
                ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}
                ${isActive 
                  ? 'bg-[#1a1a2e] border-purple-500/50' 
                  : 'bg-[#0d0d12] border-[#2d2d3d] hover:bg-[#151520]'
                }
                ${isFirst ? 'rounded-l-lg' : ''}
                ${isLast ? 'rounded-r-lg' : ''}
              `}
            >
              {/* Step indicator */}
              <div className={`
                flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center
                font-medium text-sm transition-all duration-200
                ${isPast 
                  ? 'bg-purple-500 text-white' 
                  : isActive 
                    ? 'border-2 border-purple-500 text-purple-400 bg-transparent' 
                    : 'border border-[#3d3d4d] text-gray-500 bg-transparent'
                }
              `}>
                {isPast ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span>{String(idx).padStart(2, '0')}</span>
                )}
              </div>
              
              {/* Step content */}
              <div className="flex flex-col items-start min-w-0">
                <span className={`text-sm font-medium truncate ${
                  isActive ? 'text-white' : isPast ? 'text-purple-300' : 'text-gray-400'
                }`}>
                  {step.label}
                </span>
                <span className="text-xs text-gray-500 truncate">
                  {stats && step.value > 0 
                    ? `${Math.round(stats.ratio * 100)}% saved` 
                    : step.description
                  }
                </span>
              </div>
              
              {/* Active indicator bar */}
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-500" />
              )}
              
              {/* Arrow connector (except last) */}
              {!isLast && (
                <div className="absolute -right-2 top-1/2 -translate-y-1/2 z-10">
                  <div className={`w-4 h-4 rotate-45 border-t border-r ${
                    isActive || isPast ? 'border-purple-500/50 bg-[#1a1a2e]' : 'border-[#2d2d3d] bg-[#0d0d12]'
                  }`} />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

const ContextEditor: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<ContextSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [recompressing, setRecompressing] = useState(false);
  const [compressionMode, setCompressionMode] = useState<0 | 1 | 2 | 3>(0);
  const [keepRecent, setKeepRecent] = useState(5);
  const [compressionVersions, setCompressionVersions] = useState<CompressionVersions | null>(null);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordMap, setKeywordMap] = useState<Map<string, string>>(new Map());
  const [lmstudioConnected, setLmstudioConnected] = useState<boolean | null>(null);
  
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);
  const [syncScroll, setSyncScroll] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [showSystemMessages, setShowSystemMessages] = useState(true);
  const [systemPromptExpanded, setSystemPromptExpanded] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState(
    `You are a context summarizer. Condense the conversation into a brief summary that preserves key information.

Output format:
[CONVERSATION SUMMARY]
Goal: <main objective or topic>
Key Points: <important details, decisions, or facts>
Current State: <where things stand>
[END SUMMARY]

Rules:
- ONLY use information from the conversation
- Be concise (under 150 words)
- Preserve technical terms, names, and specifics exactly
- Output ONLY the summary block, nothing else`
  );
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  
  // View mode: 'timeline' = turn-based, 'messages' = source view, 'data' = raw JSON
  const [viewMode, setViewMode] = useState<'messages' | 'timeline' | 'data'>('timeline');
  const [expandedTurns, setExpandedTurns] = useState<Set<string>>(new Set());
  
  // Selected turn for Source View (1-indexed, 0 = latest)
  const [selectedTurn, setSelectedTurn] = useState<number>(0);
  
  // Toggle turn expansion
  const toggleTurn = (turnId: string) => {
    setExpandedTurns(prev => {
      const next = new Set(prev);
      if (next.has(turnId)) {
        next.delete(turnId);
      } else {
        next.add(turnId);
      }
      return next;
    });
  };

  // Load compression versions
  const loadCompressionVersions = async () => {
    if (!sessionId) return;
    setLoadingVersions(true);
    try {
      const response = await axios.get(`http://localhost:3001/api/sessions/${sessionId}/compressions`);
      setCompressionVersions(response.data);
    } catch (error) {
      console.error('Failed to load compression versions:', error);
    } finally {
      setLoadingVersions(false);
    }
  };

  // Save compression settings to server
  const saveCompressionSettings = async (mode: 0 | 1 | 2 | 3, keepRecentValue: number) => {
    if (!sessionId) return;
    try {
      await axios.post(`http://localhost:3001/api/sessions/${sessionId}/compression`, {
        mode,
        keepRecent: keepRecentValue,
        enabled: true
      });
      console.log(`Saved compression settings: mode=${mode}, keepRecent=${keepRecentValue}`);
    } catch (error) {
      console.error('Failed to save compression settings:', error);
    }
  };

  // Handle compression mode change
  const handleCompressionModeChange = (newMode: 0 | 1 | 2 | 3) => {
    setCompressionMode(newMode);
    saveCompressionSettings(newMode, keepRecent);
  };

  // Re-compress all versions
  const handleRecompress = async () => {
    if (!sessionId) return;
    setRecompressing(true);
    try {
      const response = await axios.post(`http://localhost:3001/api/sessions/${sessionId}/recompress`, {
        keepRecent,
        systemPrompt
      });
      if (response.data) {
        setCompressionVersions(response.data);
        setLastUpdate(new Date());
      }
    } catch (error: any) {
      console.error('Recompression failed:', error);
      alert(`Recompression failed: ${error.response?.data?.message || error.message}`);
    } finally {
      setRecompressing(false);
    }
  };

  // Load session and setup WebSocket
  useEffect(() => {
    if (sessionId) {
      loadSession();
      checkLMStudioConnection();
      loadCompressionVersions();

      // WebSocket for real-time updates
      const ws = new ReconnectingWebSocket('ws://localhost:3001');

      ws.onopen = () => {
        console.log('[WS] Connected to server');
        setWsConnected(true);
      };

      ws.onclose = () => {
        console.log('[WS] Disconnected from server');
        setWsConnected(false);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'session_updated' && message.data?.id === sessionId) {
            // Update session in real-time
            setSession(message.data);
            setLastUpdate(new Date());
            
            // Reload compression versions when session changes
            loadCompressionVersions();
            
            // Auto-scroll to bottom
            setTimeout(() => {
              if (leftPanelRef.current) {
                leftPanelRef.current.scrollTop = leftPanelRef.current.scrollHeight;
              }
            }, 100);
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('[WS] Error:', error);
        setWsConnected(false);
      };

      return () => {
        ws.close();
      };
    }
  }, [sessionId]);

  // Load persisted systemPrompt when session loads
  useEffect(() => {
    if (session?.compression?.systemPrompt) {
      setSystemPrompt(session.compression.systemPrompt);
    }
  }, [session?.compression?.systemPrompt]);
  

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
        if (session.compression.mode !== undefined) {
          setCompressionMode(session.compression.mode);
        }
        if (session.compression.keepRecent !== undefined) {
          setKeepRecent(session.compression.keepRecent);
        }
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

  // Get the effective turn index (0 means latest)
  const getEffectiveTurnIndex = (): number => {
    if (!session?.conversations.length) return 0;
    return selectedTurn === 0 ? session.conversations.length : selectedTurn;
  };
  
  // Get RAW source messages for a specific turn
  const getRawSourceMessages = (): any[] => {
    if (!session?.conversations.length) return [];
    
    const turnIdx = getEffectiveTurnIndex();
    const turn = session.conversations[turnIdx - 1]; // Convert to 0-indexed
    if (!turn) return [];
    
    const messages: any[] = [];
    
    // Add ALL request messages exactly as they are
    if (turn.request?.messages) {
      for (const msg of turn.request.messages) {
        // Determine descriptive source based on role
        let source = '→ to LLM';
        
        if (msg.role === 'tool') {
          source = '→ tool result to LLM';
        } else if (msg.role === 'system') {
          source = '→ system to LLM';
        } else if (msg.role === 'user') {
          source = '→ user to LLM';
        } else if (msg.role === 'assistant' && msg.tool_calls) {
          source = '→ context to LLM';
        }
        
        messages.push({
          ...msg,
          _source: source,
          _turnId: turn.id,
          _turnNumber: turnIdx,
          _timestamp: turn.timestamp
        });
      }
    }
    
    // Add response message if it has content
    if (turn.response) {
      const responseMsg = turn.response.choices?.[0]?.message;
      if (responseMsg) {
        messages.push({
          ...responseMsg,
          _source: '← from LLM',
          _turnId: turn.id,
          _turnNumber: turnIdx,
          _timestamp: turn.timestamp
        });
      } else if (turn.response.content) {
        // Streaming response
        messages.push({
          role: 'assistant',
          content: turn.response.content,
          _source: '← from LLM',
          _turnId: turn.id,
          _turnNumber: turnIdx,
          _timestamp: turn.timestamp
        });
      }
      
      // Add agentic loop tool executions if present
      const toolyMeta = (turn.response as any)?.toolyMeta || turn.toolyMeta;
      if (toolyMeta?.agenticLoop && toolyMeta?.toolExecutions?.length > 0) {
        // Add a marker for the agentic loop
        messages.push({
          role: 'agentic',
          content: `🔄 Agentic Loop Executed (${toolyMeta.iterations} iterations)`,
          _source: '⚡ middleware agentic execution',
          _turnId: turn.id,
          _turnNumber: turnIdx,
          _timestamp: turn.timestamp,
          _isAgenticHeader: true
        });
        
        // Add each tool execution
        for (const exec of toolyMeta.toolExecutions) {
          messages.push({
            role: 'tool',
            content: exec.result,
            tool_call_id: exec.toolCallId,
            _source: `⚡ MCP: ${exec.toolName} → ${exec.mcpTool}`,
            _turnId: turn.id,
            _turnNumber: turnIdx,
            _timestamp: turn.timestamp,
            _agenticExecution: {
              toolName: exec.toolName,
              mcpTool: exec.mcpTool,
              args: exec.args
            }
          });
        }
      }
    }
    
    return messages;
  };

  const getAllMessages = (upToTurn?: number): any[] => {
    if (!session) return [];
    const messages: any[] = [];
    let seenSystemPrompts = new Set<string>();
    
    // Limit to specific turn if provided (1-indexed)
    const turnsToProcess = upToTurn 
      ? session.conversations.slice(0, upToTurn)
      : session.conversations;
    
    for (const turn of turnsToProcess) {
      // Extract system message (usually first in request messages)
      if (turn.request?.messages) {
        const systemMsg = turn.request.messages.find(m => m.role === 'system');
        if (systemMsg && systemMsg.content) {
          // Create a hash to avoid duplicates (system prompts often repeat)
          const promptHash = systemMsg.content.substring(0, 200);
          if (!seenSystemPrompts.has(promptHash)) {
            seenSystemPrompts.add(promptHash);
            messages.push({ 
              role: 'system', 
              content: systemMsg.content,
              _meta: { turnId: turn.id, timestamp: turn.timestamp }
            });
          }
        }
      }
      
      // Add user message
      const userMsg = getUserMessage(turn);
      if (userMsg) {
        messages.push({ 
          role: 'user', 
          content: userMsg,
          _meta: { turnId: turn.id, timestamp: turn.timestamp }
        });
      }
      
      // Add assistant message with tool calls (keep full structure for ToolCallCard)
      if (turn.request?.messages) {
        const assistantWithTools = turn.request.messages.find(m => m.role === 'assistant' && m.tool_calls);
        if (assistantWithTools) {
          messages.push({
            ...assistantWithTools,
            _meta: { turnId: turn.id, timestamp: turn.timestamp, hasToolCalls: true }
          });
        }
      }
      
      // Add tool responses (keep full structure for matching with tool calls)
      if (turn.request?.messages) {
        const toolMessages = turn.request.messages.filter(m => m.role === 'tool');
        for (const toolMsg of toolMessages) {
          messages.push({
            ...toolMsg,
            _meta: { turnId: turn.id, timestamp: turn.timestamp }
          });
        }
      }
      
      // Add assistant response
      const assistantMsg = getAssistantMessage(turn);
      if (assistantMsg) {
        messages.push({ 
          role: 'assistant', 
          content: assistantMsg,
          _meta: { turnId: turn.id, timestamp: turn.timestamp }
        });
      }
    }
    
    return messages;
  };
  
  // Group tool calls with their results for display
  const groupToolCallsWithResults = (messages: any[]): any[] => {
    const grouped: any[] = [];
    let i = 0;
    
    while (i < messages.length) {
      const msg = messages[i];
      
      // If this is an assistant message with tool_calls, group with following tool results
      if (msg.role === 'assistant' && msg.tool_calls && Array.isArray(msg.tool_calls)) {
        const toolCalls = parseToolCalls(msg);
        const toolResults: Map<string, ToolResultInfo> = new Map();
        
        // Look ahead for tool results
        let j = i + 1;
        while (j < messages.length && messages[j].role === 'tool') {
          const toolResult = messages[j];
          if (toolResult.tool_call_id) {
            toolResults.set(toolResult.tool_call_id, {
              tool_call_id: toolResult.tool_call_id,
              content: toolResult.content || '',
              name: toolResult.name
            });
          }
          j++;
        }
        
        // Create grouped tool call entry
        grouped.push({
          role: 'tool_group',
          toolCalls,
          toolResults,
          _meta: msg._meta
        });
        
        i = j; // Skip past the tool results we just processed
      } else if (msg.role === 'tool') {
        // Orphan tool result (no preceding assistant with tool_calls)
        // This can happen, so we'll show it as a standalone
        grouped.push({
          role: 'tool_result_orphan',
          content: msg.content,
          tool_call_id: msg.tool_call_id,
          name: msg.name,
          _meta: msg._meta
        });
        i++;
      } else {
        // Regular message - skip assistant messages that have no meaningful content
        // (these are messages where the LLM only made tool calls with no text)
        const hasNoContent = msg.role === 'assistant' && 
          (!msg.content || msg.content.trim() === '' || msg.content === 'null');
        
        if (!hasNoContent) {
          grouped.push(msg);
        }
        i++;
      }
    }
    
    return grouped;
  };

  // Get messages for the selected compression mode
  const getSelectedMessages = (): any[] => {
    if (!compressionVersions) return getAllMessages();
    
    const modeKeys = ['none', 'light', 'medium', 'aggressive'];
    const key = modeKeys[compressionMode] as keyof CompressionVersions;
    return compressionVersions[key]?.messages || getAllMessages();
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
          onClick={() => navigate('/sessions')}
          className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg"
        >
          Back to Sessions
        </button>
      </div>
    );
  }

  const allMessages = getAllMessages();
  const groupedMessages = groupToolCallsWithResults(allMessages);

  const selectedMessages = getSelectedMessages();
  const groupedSelectedMessages = groupToolCallsWithResults(selectedMessages);

  return (
    <div className="h-screen overflow-hidden bg-[#0d0d0d] text-white flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#0d0d0d] border-b border-[#2d2d2d] px-4 py-3">
        {/* Top row: navigation and controls */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/sessions')}
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
          
          {/* Controls */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Keep recent:</span>
              <input
                type="number"
                value={keepRecent}
                onChange={(e) => setKeepRecent(Math.max(1, parseInt(e.target.value) || 5))}
                onBlur={(e) => {
                  const value = Math.max(1, parseInt(e.target.value) || 5);
                  saveCompressionSettings(compressionMode, value);
                }}
                className="w-12 bg-[#1a1a1a] border border-[#3d3d3d] rounded px-2 py-1 text-sm"
                min={1}
                max={20}
              />
            </div>
            
            <button
              onClick={handleRecompress}
              disabled={recompressing || !lmstudioConnected}
              className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium flex items-center gap-2"
            >
              {recompressing ? (
                <>
                  <span className="animate-spin">⏳</span>
                  Re-compressing...
                </>
              ) : (
                <>🔄 Re-compress</>
              )}
            </button>
            
            <div className={`w-2 h-2 rounded-full ${lmstudioConnected ? 'bg-green-500' : 'bg-red-500'}`} 
                 title={lmstudioConnected ? 'LMStudio connected' : 'LMStudio not connected'} />
          </div>
        </div>
        
        {/* Compression Stepper */}
        <div className="mt-4">
          <CompressionStepper
            value={compressionMode}
            onChange={handleCompressionModeChange}
            versions={compressionVersions}
            disabled={loadingVersions || recompressing}
          />
        </div>
        
        {/* System Prompt Editor */}
        <div className="mt-3 px-4">
          <button
            onClick={() => setShowPromptEditor(!showPromptEditor)}
            className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1"
          >
            <span>{showPromptEditor ? '▼' : '▶'}</span>
            <span>System Prompt</span>
          </button>
          {showPromptEditor && (
            <div className="mt-2">
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                className="w-full h-24 bg-[#1a1a1a] border border-[#3d3d3d] rounded-lg px-3 py-2 text-sm text-gray-300 font-mono resize-y focus:border-purple-500 focus:outline-none"
                placeholder="Enter system prompt for summarization..."
              />
              <p className="text-xs text-gray-600 mt-1">
                This prompt tells the LLM how to summarize. Click Re-compress to apply changes.
              </p>
            </div>
          )}
        </div>
        
        {/* Keywords - only show when compression active */}
        {keywords.length > 0 && compressionMode > 0 && compressionVersions && (
          <div className="flex items-center gap-2 mt-3 flex-wrap px-8">
            <span className="text-xs text-gray-500">Keywords:</span>
            {keywords.map((keyword, i) => (
              <span key={i} className={`text-xs px-2 py-0.5 rounded ${KEYWORD_COLORS[i % KEYWORD_COLORS.length]}`}>
                {keyword}
              </span>
            ))}
          </div>
        )}
        
        {/* View Options */}
        <div className="flex items-center gap-4 mt-3 px-8">
          {/* View Mode Toggle */}
          <div className="flex items-center gap-1 bg-[#1a1a1a] rounded-lg p-1">
            <button
              onClick={() => setViewMode('timeline')}
              className={`px-3 py-1 text-xs rounded ${
                viewMode === 'timeline' 
                  ? 'bg-purple-600 text-white' 
                  : 'text-gray-400 hover:text-white hover:bg-[#2d2d2d]'
              }`}
            >
              💬 IDE View
            </button>
            <button
              onClick={() => setViewMode('messages')}
              className={`px-3 py-1 text-xs rounded ${
                viewMode === 'messages' 
                  ? 'bg-purple-600 text-white' 
                  : 'text-gray-400 hover:text-white hover:bg-[#2d2d2d]'
              }`}
            >
              📄 Source View
            </button>
            <button
              onClick={() => setViewMode('data')}
              className={`px-3 py-1 text-xs rounded ${
                viewMode === 'data' 
                  ? 'bg-purple-600 text-white' 
                  : 'text-gray-400 hover:text-white hover:bg-[#2d2d2d]'
              }`}
            >
              🔍 Source Data
            </button>
          </div>
          
          <div className="w-px h-5 bg-[#2d2d2d]" />
          
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showSystemMessages}
              onChange={(e) => setShowSystemMessages(e.target.checked)}
              className="w-4 h-4 rounded border-gray-600 bg-[#0d0d0d] text-yellow-500 focus:ring-yellow-500"
            />
            <span className="text-sm text-gray-300">Show System Prompts</span>
          </label>
        </div>
      </div>

      {/* Main Content - Side by Side */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel - Original (always) */}
        <div className="flex-1 flex flex-col border-r border-[#2d2d2d]">
          <div className="sticky top-0 z-10 px-4 py-2 bg-[#1a1a1a] border-b border-[#2d2d2d]">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-gray-300">
                  {viewMode === 'timeline' ? '📝 Original' : viewMode === 'messages' ? '📄 Raw Context' : '🔍 Source Data (JSON)'}
                </span>
            <span className="text-xs text-gray-500 ml-2">
              {viewMode === 'timeline' 
                ? `Turn ${getEffectiveTurnIndex()} of ${session?.conversations.length || 0}`
                : viewMode === 'messages'
                  ? `Turn ${getEffectiveTurnIndex()} of ${session?.conversations.length || 0} • ${getRawSourceMessages().filter(m => showSystemMessages || m.role !== 'system').length} messages`
                  : `Turn ${getEffectiveTurnIndex()} of ${session?.conversations.length || 0}`}
              {' '}• ~{Math.round(JSON.stringify(allMessages).length / 4).toLocaleString()} tokens
            </span>
              </div>
              
              {/* Turn slider for all views */}
              {session?.conversations.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">Turn:</span>
                  <input
                    type="range"
                    min="1"
                    max={session.conversations.length}
                    value={getEffectiveTurnIndex()}
                    onChange={(e) => setSelectedTurn(parseInt(e.target.value))}
                    className="w-24 h-1 bg-[#2d2d2d] rounded-lg appearance-none cursor-pointer accent-purple-500"
                  />
                  <span className="text-xs text-purple-400 font-mono w-8">
                    {getEffectiveTurnIndex()}/{session.conversations.length}
                  </span>
                </div>
              )}
            </div>
          </div>
          <div 
            ref={leftPanelRef}
            className="flex-1 overflow-y-auto p-4 scrollbar-thin"
            onScroll={() => handleScroll('left')}
          >
            {/* IDE View - Show chat history up to selected turn */}
            {viewMode === 'timeline' && session?.conversations.length > 0 && (() => {
              const turnIdx = getEffectiveTurnIndex();
              const messagesUpToTurn = getAllMessages(turnIdx);
              const groupedUpToTurn = groupToolCallsWithResults(messagesUpToTurn);
              
              return groupedUpToTurn
                .filter((m: any) => showSystemMessages || m.role !== 'system')
                .map((msg: any, idx: number) => {
                  // System Prompt
                  if (msg.role === 'system') {
                    return (
                      <SystemPromptCard
                        key={`system-${idx}`}
                        content={msg.content}
                        source="Conversation"
                      />
                    );
                  }
                  
                  // Tool Group - show tool calls with results
                  if (msg.role === 'tool_group') {
                    return (
                      <div key={`toolgroup-${idx}`} className="mb-2">
                        {msg.toolCalls.map((tc: ToolCallInfo, tcIdx: number) => (
                          <ToolCallCard
                            key={`tc-${idx}-${tcIdx}`}
                            toolCall={tc}
                            result={msg.toolResults.get(tc.id)}
                          />
                        ))}
                      </div>
                    );
                  }
                  
                  // Orphan tool result
                  if (msg.role === 'tool_result_orphan') {
                    return (
                      <div key={`orphan-${idx}`} className="mb-2 p-3 rounded-lg border border-orange-500/30 bg-orange-500/5">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm">🔧</span>
                          <span className="text-xs font-medium text-orange-400">
                            Tool Result {msg.name ? `(${msg.name})` : ''}
                          </span>
                        </div>
                        <pre className="text-xs text-gray-300 bg-[#0d0d0d] p-2 rounded overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto scrollbar-thin">
                          {msg.content}
                        </pre>
                      </div>
                    );
                  }
                  
                  // Regular message (user/assistant)
                  return (
                    <Message
                      key={idx}
                      role={msg.role || 'assistant'}
                      content={msg.content || ''}
                      isCompressed={false}
                      isTool={false}
                      keywords={[]}
                      keywordMap={new Map()}
                    />
                  );
                });
            })()}
            
            {/* Source View - Raw context messages for selected turn */}
            {viewMode === 'messages' && getRawSourceMessages()
              .filter(m => showSystemMessages || (m.role !== 'system'))
              .map((msg, idx) => (
                <SourceMessage key={`source-${idx}`} msg={msg} />
              ))}
            
            {/* Source Data View - Raw JSON for selected turn */}
            {viewMode === 'data' && session?.conversations.length > 0 && (() => {
              const turnIdx = getEffectiveTurnIndex();
              const turn = session.conversations[turnIdx - 1];
              if (!turn) return null;
              return (
                <div className="mb-4">
                  {/* Turn header */}
                  <div className="flex items-center gap-2 mb-2 px-2">
                    <div className="flex-1 h-px bg-orange-500/30"></div>
                    <span className="text-xs text-orange-400 font-medium px-2">
                      Turn {turnIdx} of {session.conversations.length} • {new Date(turn.timestamp).toLocaleTimeString()}
                    </span>
                    <div className="flex-1 h-px bg-orange-500/30"></div>
                  </div>
                  
                  {/* Request section */}
                  <div className="mb-2 p-2 bg-[#0d0d0d] rounded border border-blue-500/30">
                    <div className="text-xs text-blue-400 font-medium mb-1">📤 Request ({turn.request?.messages?.length || 0} messages)</div>
                    <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap overflow-x-auto max-h-[60vh] overflow-y-auto scrollbar-thin">
                      {JSON.stringify(turn.request, null, 2)}
                    </pre>
                  </div>
                  
                  {/* Response section */}
                  <div className="p-2 bg-[#0d0d0d] rounded border border-green-500/30">
                    <div className="text-xs text-green-400 font-medium mb-1">📥 Response</div>
                    <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap overflow-x-auto max-h-[40vh] overflow-y-auto scrollbar-thin">
                      {JSON.stringify(turn.response, null, 2)}
                    </pre>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Right Panel - Selected Compression Mode */}
        <div className="flex-1 flex flex-col">
          <div className="sticky top-0 z-10 px-4 py-2 bg-[#1a1a1a] border-b border-[#2d2d2d] flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div>
                <span className="text-sm font-medium text-gray-300">
                  {compressionMode === 0 ? '📝 None (Original)' : `🗜️ ${COMPRESSION_MODES[compressionMode].label}`}
                </span>
                <span className="text-xs text-gray-500 ml-2">
                  {selectedMessages.length} messages
                  {compressionMode > 0 && compressionVersions && (
                    <> • <span className="text-green-400">
                      -{Math.round((compressionVersions[['none', 'light', 'medium', 'aggressive'][compressionMode] as keyof CompressionVersions]?.stats?.ratio || 0) * 100)}%
                    </span></>
                  )}
                </span>
              </div>
              {/* Turn slider for right pane */}
              {session?.conversations.length > 0 && (
                <div className="flex items-center gap-2 ml-4 pl-4 border-l border-[#2d2d2d]">
                  <span className="text-xs text-gray-400">Turn:</span>
                  <input
                    type="range"
                    min="1"
                    max={session.conversations.length}
                    value={getEffectiveTurnIndex()}
                    onChange={(e) => setSelectedTurn(parseInt(e.target.value))}
                    className="w-20 h-1 bg-[#2d2d2d] rounded-lg appearance-none cursor-pointer accent-purple-500"
                  />
                  <span className="text-xs text-purple-400 font-mono">
                    {getEffectiveTurnIndex()}/{session.conversations.length}
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-4">
              {compressionMode > 0 && lmstudioConnected && (
                <span className="text-xs text-gray-500">
                  via LMStudio
                </span>
              )}
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
          </div>
          <div 
            ref={rightPanelRef}
            className="flex-1 overflow-y-auto p-4 scrollbar-thin"
            onScroll={() => handleScroll('right')}
          >
            {loadingVersions ? (
              <div className="text-center py-20">
                <div className="animate-spin text-4xl mb-4">⏳</div>
                <p className="text-gray-400">Loading compression versions...</p>
              </div>
            ) : !compressionVersions && compressionMode > 0 ? (
              <div className="text-center py-20">
                <div className="text-4xl mb-4">🗜️</div>
                <p className="text-gray-400">No compressed versions available.</p>
                <p className="text-gray-500 text-sm mt-2">
                  {lmstudioConnected 
                    ? 'Click "Re-compress" to generate compressed versions.'
                    : 'Connect LMStudio to enable compression.'}
                </p>
              </div>
            ) : (
              <>
                {groupedSelectedMessages
                  .filter((m: any) => showSystemMessages || m.role !== 'system')
                  .map((msg: any, idx: number) => {
                    // System Prompt - use new SystemPromptCard
                    if (msg.role === 'system') {
                      return (
                        <SystemPromptCard
                          key={`system-${idx}`}
                          content={msg.content}
                          source={compressionMode > 0 ? 'Compressed' : 'Conversation'}
                        />
                      );
                    }
                    
                    // Tool Group - show tool calls with results using ToolCallCard
                    if (msg.role === 'tool_group') {
                      return (
                        <div key={`toolgroup-${idx}`} className="mb-2">
                          {msg.toolCalls.map((tc: ToolCallInfo, tcIdx: number) => (
                            <ToolCallCard
                              key={`tc-${idx}-${tcIdx}`}
                              toolCall={tc}
                              result={msg.toolResults.get(tc.id)}
                            />
                          ))}
                        </div>
                      );
                    }
                    
                    // Orphan tool result
                    if (msg.role === 'tool_result_orphan') {
                      return (
                        <div key={`orphan-${idx}`} className="mb-2 p-3 rounded-lg border border-orange-500/30 bg-orange-500/5">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-sm">🔧</span>
                            <span className="text-xs font-medium text-orange-400">
                              Tool Result {msg.name ? `(${msg.name})` : ''}
                            </span>
                            {compressionMode > 0 && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">PRESERVED</span>
                            )}
                          </div>
                          <pre className="text-xs text-gray-300 bg-[#0d0d0d] p-2 rounded overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto scrollbar-thin">
                            {msg.content}
                          </pre>
                        </div>
                      );
                    }
                    
                    // Regular message
                    const isSummary = msg.content?.includes('[SUMMARY]') || msg.content?.includes('[CONVERSATION SUMMARY]');
                    
                    return (
                      <Message
                        key={idx}
                        role={msg.role || 'assistant'}
                        content={msg.content || ''}
                        isCompressed={isSummary}
                        isTool={false}
                        keywords={compressionMode > 0 ? keywords : []}
                        keywordMap={keywordMap}
                      />
                    );
                  })}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#0d0d0d] border-t border-[#2d2d2d] px-4 py-2">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-4">
            <span>Viewing: <span className="text-white">{COMPRESSION_MODES[compressionMode].label}</span></span>
            <span>Keep recent: {keepRecent}</span>
            {session?.conversations?.[session.conversations.length - 1]?.request?.model && (
              <span>Model: <span className="text-purple-400">{session.conversations[session.conversations.length - 1].request.model}</span></span>
            )}
            {recompressing && <span className="text-yellow-400">● Re-compressing...</span>}
          </div>
          <div className="flex items-center gap-4">
            {lastUpdate && (
              <span className="text-gray-400">
                Updated: {lastUpdate.toLocaleTimeString()}
              </span>
            )}
            <span className={wsConnected ? 'text-green-400' : 'text-yellow-400'}>
              {wsConnected ? '● Live' : '○ Connecting...'}
            </span>
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
