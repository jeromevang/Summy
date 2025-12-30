import React, { useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Message,
  SourceMessage,
  AgenticResponseCard,
  SystemPromptCard,
  ToolCallCard,
  CompressionStepper,
  TurnCard
} from './ContextEditor/components';
import {
  useSession,
  useCompression,
  useKeywords
} from './ContextEditor/hooks';
import {
  getEffectiveTurnIndex,
  getRawSourceMessages,
  getAllMessages,
  groupToolCallsWithResults,
  getUserMessage,
  getAssistantMessage
} from './ContextEditor/utils';
import { ToolCallInfo, CompressionVersions } from './ContextEditor/types';

const COMPRESSION_MODES = [
  { value: 0, label: 'None', description: 'Original - no compression', color: 'gray' },
  { value: 1, label: 'Light', description: 'Summarize text, preserve tools', color: 'green' },
  { value: 2, label: 'Medium', description: 'Summarize text, truncate tools', color: 'yellow' },
  { value: 3, label: 'Aggressive', description: 'Convert everything to summaries', color: 'red' },
];

const ContextEditor: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  
  const {
    session,
    loading,
    lmstudioConnected,
    wsConnected,
    lastUpdate,
    turnStatus
  } = useSession(sessionId, navigate);

  const {
    compressionMode,
    handleCompressionModeChange,
    keepRecent,
    setKeepRecent,
    compressionVersions,
    loadingVersions,
    recompressing,
    handleRecompress,
    saveCompressionSettings
  } = useCompression(sessionId, session);

  const { keywords, keywordMap } = useKeywords(session);

  const leftPanelRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);
  const [syncScroll, setSyncScroll] = useState(true);
  const [showSystemMessages, setShowSystemMessages] = useState(true);
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
  const [viewMode, setViewMode] = useState<'messages' | 'timeline' | 'data'>('timeline');
  const [selectedTurn, setSelectedTurn] = useState<number>(0);

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

  const effectiveTurnIdx = getEffectiveTurnIndex(session, selectedTurn);
  const allMessages = getAllMessages(session, effectiveTurnIdx);
  const groupedMessages = groupToolCallsWithResults(allMessages);

  const modeKeys = ['none', 'light', 'medium', 'aggressive'];
  const currentModeKey = modeKeys[compressionMode] as keyof CompressionVersions;
  const selectedMessages = compressionVersions?.[currentModeKey]?.messages || getAllMessages(session);
  const groupedSelectedMessages = groupToolCallsWithResults(selectedMessages);

  return (
    <div className="h-screen overflow-hidden bg-[#0d0d0d] text-white flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#0d0d0d] border-b border-[#2d2d2d] px-4 py-3">
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
              onClick={() => handleRecompress(systemPrompt)}
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
        
        <div className="mt-4">
          <CompressionStepper
            value={compressionMode}
            onChange={handleCompressionModeChange}
            versions={compressionVersions}
            disabled={loadingVersions || recompressing}
          />
        </div>
        
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
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-4 mt-3 px-8">
          <div className="flex items-center gap-1 bg-[#1a1a1a] rounded-lg p-1">
            <button
              onClick={() => setViewMode('timeline')}
              className={`px-3 py-1 text-xs rounded ${viewMode === 'timeline' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              💬 IDE View
            </button>
            <button
              onClick={() => setViewMode('messages')}
              className={`px-3 py-1 text-xs rounded ${viewMode === 'messages' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              📄 Source View
            </button>
            <button
              onClick={() => setViewMode('data')}
              className={`px-3 py-1 text-xs rounded ${viewMode === 'data' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              🔍 Source Data
            </button>
          </div>
          
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showSystemMessages}
              onChange={(e) => setShowSystemMessages(e.target.checked)}
              className="w-4 h-4 rounded border-gray-600 bg-[#0d0d0d] text-yellow-500"
            />
            <span className="text-sm text-gray-300">Show System Prompts</span>
          </label>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel */}
        <div className="flex-1 flex flex-col border-r border-[#2d2d2d]">
          <div className="sticky top-0 z-10 px-4 py-2 bg-[#1a1a1a] border-b border-[#2d2d2d]">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-gray-300">
                  {viewMode === 'timeline' ? '📝 Original' : viewMode === 'messages' ? '📄 Raw Context' : '🔍 Source Data (JSON)'}
                </span>
                <span className="text-xs text-gray-500 ml-2">
                  Turn {effectiveTurnIdx} of {session.conversations.length}
                </span>
              </div>
              
              {session.conversations.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">Turn:</span>
                  <input
                    type="range"
                    min="1"
                    max={session.conversations.length}
                    value={effectiveTurnIdx}
                    onChange={(e) => setSelectedTurn(parseInt(e.target.value))}
                    className="w-24 h-1 bg-[#2d2d2d] rounded-lg appearance-none cursor-pointer accent-purple-500"
                  />
                </div>
              )}
            </div>
          </div>
          <div 
            ref={leftPanelRef}
            className="flex-1 overflow-y-auto p-4 scrollbar-thin"
            onScroll={() => handleScroll('left')}
          >
            {viewMode === 'timeline' && groupedMessages
              .filter((m: any) => showSystemMessages || m.role !== 'system')
              .map((msg: any, idx: number) => {
                if (msg.role === 'system') return <SystemPromptCard key={idx} content={msg.content} source="Conversation" />;
                if (msg.role === 'tool_group') return (
                  <div key={idx} className="mb-2">
                    {msg.toolCalls.map((tc: ToolCallInfo, tcIdx: number) => (
                      <ToolCallCard key={tcIdx} toolCall={tc} result={msg.toolResults.get(tc.id)} />
                    ))}
                  </div>
                );
                return <Message key={idx} role={msg.role} content={msg.content} />;
              })}

            {viewMode === 'messages' && getRawSourceMessages(session, selectedTurn)
              .filter(m => showSystemMessages || m.role !== 'system')
              .map((msg, idx) => (
                msg.role === 'assistant_agentic' && msg._agenticData ? (
                  <AgenticResponseCard key={idx} agenticData={msg._agenticData} finalResponse={msg.content} />
                ) : (
                  <SourceMessage key={idx} msg={msg} />
                )
              ))}

            {viewMode === 'data' && (() => {
              const turn = session.conversations[effectiveTurnIdx - 1];
              if (!turn) return null;
              return (
                <div className="p-2 bg-[#0d0d0d] rounded border border-blue-500/30">
                  <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap">
                    {JSON.stringify(turn, null, 2)}
                  </pre>
                </div>
              );
            })()}

            {turnStatus && (
              <div className="mt-4 p-2 bg-purple-500/20 border border-purple-500/40 rounded">
                <span className="text-sm text-purple-300">{turnStatus.message}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel */}
        <div className="flex-1 flex flex-col">
          <div className="sticky top-0 z-10 px-4 py-2 bg-[#1a1a1a] border-b border-[#2d2d2d] flex items-center justify-between">
            <span className="text-sm font-medium text-gray-300">
              {compressionMode === 0 ? '📝 None (Original)' : `🗜️ ${COMPRESSION_MODES[compressionMode].label}`}
            </span>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={syncScroll} onChange={(e) => setSyncScroll(e.target.checked)} />
              <span className="text-gray-400">Sync scroll</span>
            </label>
          </div>
          <div 
            ref={rightPanelRef}
            className="flex-1 overflow-y-auto p-4 scrollbar-thin"
            onScroll={() => handleScroll('right')}
          >
            {loadingVersions ? (
              <div className="text-center py-20">Loading...</div>
            ) : (
              groupedSelectedMessages
                .filter((m: any) => showSystemMessages || m.role !== 'system')
                .map((msg: any, idx: number) => {
                  if (msg.role === 'system') return <SystemPromptCard key={idx} content={msg.content} source="Compressed" />;
                  if (msg.role === 'tool_group') return (
                    <div key={idx} className="mb-2">
                      {msg.toolCalls.map((tc: ToolCallInfo, tcIdx: number) => (
                        <ToolCallCard key={tcIdx} toolCall={tc} result={msg.toolResults.get(tc.id)} />
                      ))}
                    </div>
                  );
                  return <Message key={idx} role={msg.role} content={msg.content} keywords={keywords} keywordMap={keywordMap} />;
                })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContextEditor;