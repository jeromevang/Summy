import React, { useState } from 'react';
import { ToolyPhase } from '../types';

interface TimelinePhaseProps {
  phase: ToolyPhase;
  isExpanded?: boolean;
}

export const TimelinePhase: React.FC<TimelinePhaseProps> = ({ 
  phase, 
  isExpanded: defaultExpanded = false 
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
      <div className="absolute left-5 w-3 h-3 rounded-full bg-[#2d2d2d] border-2 border-purple-500 -translate-x-1/2" />
      
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
