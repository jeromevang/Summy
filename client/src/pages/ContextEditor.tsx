import React, { useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useContextPrism } from '@/hooks/useContextPrism';
import { PrismVisualizer } from '@/components/Prism/PrismVisualizer';
import { SplitHorizon } from '@/components/Prism/SplitHorizon';

import { CompressionStepper } from './ContextEditor/components';

const ContextEditor: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  
  const prism = useContextPrism(sessionId);
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
  
  if (prism.loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-obsidian">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyber-purple"></div>
      </div>
    );
  }

  if (!prism.session) {
    return (
      <div className="text-center py-12 bg-obsidian min-h-screen">
        <p className="text-gray-400">Session not found.</p>
        <button
          onClick={() => navigate('/sessions')}
          className="mt-4 px-4 py-2 bg-cyber-purple hover:bg-cyber-purple/80 text-white rounded-lg"
        >
          Back to Sessions
        </button>
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden bg-obsidian text-white flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-obsidian border-b border-white/5 px-4 pt-3 pb-2 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/sessions')}
              className="p-2 hover:bg-white/5 rounded-lg text-white/60 hover:text-white transition-colors"
            >
              ←
            </button>
            <div>
              <h1 className="text-base font-semibold text-white">{prism.session.name}</h1>
              <p className="text-xs text-white/40">
                {prism.session.ide} • {prism.session.conversations.length} turns
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Compression Mode Selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/40">Keep recent:</span>
              <input
                type="number"
                value={prism.keepRecent}
                onChange={(e) => prism.setKeepRecent(Math.max(1, parseInt(e.target.value) || 5))}
                onBlur={(e) => {
                  const value = Math.max(1, parseInt(e.target.value) || 5);
                  // TODO: Save compression settings - this needs to be moved to useContextPrism
                }}
                className="w-12 bg-white/[0.03] border border-white/10 rounded px-2 py-1 text-sm text-white focus:border-cyber-purple focus:outline-none"
                min={1}
                max={20}
              />
            </div>
            
            <button
              onClick={() => prism.recompress()} // Pass systemPrompt from state or context
              disabled={prism.isRecompressing}
              className="px-4 py-1.5 bg-cyber-purple/10 border border-cyber-purple/30 text-cyber-purple hover:bg-cyber-purple/20 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium flex items-center gap-2 transition-all"
            >
              {prism.isRecompressing ? (
                <>
                  <span className="animate-spin text-lg">⚙️</span>
                  Re-compressing...
                </>
              ) : (
                <>🔄 Re-compress</>
              )}
            </button>
          </div>
        </div>
        
        <div className="flex items-start justify-between mt-4">
          <div className="flex items-center gap-4">
            <div className="w-64">
              <CompressionStepper
                value={prism.compressionMode}
                onChange={prism.setCompressionMode}
                versions={null} // Handled by useContextPrism
                disabled={prism.isRecompressing}
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer text-white/70 hover:text-white transition-colors">
              <input
                type="checkbox"
                checked={showSystemMessages}
                onChange={(e) => setShowSystemMessages(e.target.checked)}
                className="form-checkbox text-cyber-purple rounded-sm bg-white/10 border-white/20 focus:ring-cyber-purple"
              />
              <span className="text-sm">Show System Prompts</span>
            </label>
            
            <div className="flex items-center gap-2 text-white/70 hover:text-white transition-colors cursor-pointer"
                 onClick={() => setShowPromptEditor(!showPromptEditor)}>
              <span>{showPromptEditor ? '▼' : '▶'}</span>
              <span className="text-sm">System Prompt</span>
            </div>
          </div>
          
          <div className="w-1/2">
            <PrismVisualizer stats={prism.windowStats} />
          </div>
        </div>
        
        {showPromptEditor && (
          <div className="mt-2 p-3 bg-white/[0.02] border border-white/10 rounded-lg">
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="w-full h-24 bg-transparent border-none focus:outline-none text-sm text-white/80 font-mono resize-y"
              placeholder="Enter system prompt for summarization..."
            />
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden p-6 pt-0">
        <SplitHorizon
          prism={prism}
          showSystemMessages={showSystemMessages}
          selectedTurnIdx={prism.selectedTurnIdx}
        />
      </div>
    </div>
  );
};

export default ContextEditor;