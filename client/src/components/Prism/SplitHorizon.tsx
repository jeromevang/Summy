import React, { useRef, useCallback, useState } from 'react';
import { Message as MessageComponent } from '@/pages/ContextEditor/components';
import { ConversationTurn } from '@/pages/ContextEditor/types';
import { groupToolCallsWithResults, getUserMessage, getAssistantMessage, getRawSourceMessages } from '@/pages/ContextEditor/utils';
import { PrismState } from '@/hooks/useContextPrism';
import { SystemPromptCard, AgenticResponseCard, ToolCallCard } from '@/pages/ContextEditor/components';

interface SplitHorizonProps {
  prism: PrismState;
  showSystemMessages: boolean;
  selectedTurnIdx: number;
}

export const SplitHorizon: React.FC<SplitHorizonProps> = ({
  prism,
  showSystemMessages,
  selectedTurnIdx
}) => {
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);
  const [syncScroll, setSyncScroll] = useState(true);

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

  if (!prism.session) return null;

  const rawMessages = getRawSourceMessages(prism.session, selectedTurnIdx)
    .filter(m => showSystemMessages || m.role !== 'system');
  const surgicalMessages = prism.surgicalMessages
    .filter((m: any) => showSystemMessages || m.role !== 'system');

  return (
    <div className="flex flex-1 overflow-hidden border border-white/5 rounded-xl shadow-2xl">
      {/* Left Panel: Raw Traffic */}
      <div className="flex-1 flex flex-col border-r border-white/5 bg-obsidian-panel">
        <div className="px-4 py-2 bg-white/[0.02] border-b border-white/5 flex items-center justify-between">
          <span className="text-sm font-medium text-white/70">IDE Raw Traffic</span>
          <span className="text-xs text-white/40">{rawMessages.length} messages</span>
        </div>
        <div 
          ref={leftPanelRef}
          className="flex-1 overflow-y-auto p-4 custom-scrollbar"
          onScroll={() => handleScroll('left')}
        >
          {rawMessages.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No raw messages to display.</p>
          ) : (
            rawMessages.map((msg, idx) => (
              msg.role === 'assistant_agentic' && msg._agenticData ? (
                <AgenticResponseCard key={idx} agenticData={msg._agenticData} finalResponse={msg.content} />
              ) : (
                <MessageComponent key={idx} role={msg.role} content={msg.content} />
              )
            ))
          )}
        </div>
      </div>

      {/* Right Panel: Summy's Surgical Version */}
      <div className="flex-1 flex flex-col bg-obsidian-panel">
        <div className="px-4 py-2 bg-white/[0.02] border-b border-white/5 flex items-center justify-between">
          <span className="text-sm font-medium text-white/70">Summy's Surgical Context</span>
          <label className="flex items-center gap-2 text-xs text-white/40">
            <input type="checkbox" checked={syncScroll} onChange={(e) => setSyncScroll(e.target.checked)} className="form-checkbox text-cyber-purple rounded-sm bg-white/10 border-white/20 focus:ring-cyber-purple" />
            Sync scroll
          </label>
        </div>
        <div 
          ref={rightPanelRef}
          className="flex-1 overflow-y-auto p-4 custom-scrollbar"
          onScroll={() => handleScroll('right')}
        >
          {surgicalMessages.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No surgical messages to display for this compression mode.</p>
          ) : (
            surgicalMessages.map((msg: any, idx: number) => {
                if (msg.role === 'system') return <SystemPromptCard key={idx} content={msg.content} source="Compressed" />;
                if (msg.role === 'tool_group') return (
                  <div key={idx} className="mb-2">
                    {msg.toolCalls.map((tc: any, tcIdx: number) => ( // Cast to any as ToolCallInfo might not have all props
                      <ToolCallCard key={tcIdx} toolCall={tc} result={msg.toolResults.get(tc.id)} />
                    ))}
                  </div>
                );
                return <MessageComponent key={idx} role={msg.role} content={msg.content} />;
              })
          )}
        </div>
      </div>
    </div>
  );
};
