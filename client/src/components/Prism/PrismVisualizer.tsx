import React from 'react';

interface WindowStats {
  system: number;
  rag: number;
  memory: number;
  history: number;
  total: number;
  limit: number;
}

interface PrismVisualizerProps {
  stats: WindowStats;
}

export const PrismVisualizer: React.FC<PrismVisualizerProps> = ({ stats }) => {
  const getPercent = (val: number) => Math.min((val / stats.limit) * 100, 100);
  
  // Calculate segments
  const systemW = getPercent(stats.system);
  const ragW = getPercent(stats.rag);
  const memoryW = getPercent(stats.memory);
  const historyW = getPercent(stats.history);
  const freeW = 100 - (systemW + ragW + memoryW + historyW);

  return (
    <div className="bg-obsidian-panel border border-white/5 rounded-xl p-6 shadow-2xl">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-white tracking-widest uppercase">Context Prism</h3>
        <div className="text-xs font-mono text-white/40">
          <span className="text-white font-bold">{stats.total.toLocaleString()}</span> / {stats.limit.toLocaleString()} tokens
        </div>
      </div>

      {/* The Bar */}
      <div className="h-4 bg-white/5 rounded-full overflow-hidden flex mb-6 relative">
        <div style={{ width: `${systemW}%` }} className="h-full bg-cyber-purple shadow-[0_0_10px_rgba(139,92,246,0.5)] z-10 transition-all duration-500" title={`System: ${stats.system}`} />
        <div style={{ width: `${ragW}%` }} className="h-full bg-cyber-emerald shadow-[0_0_10px_rgba(16,185,129,0.5)] z-10 transition-all duration-500" title={`RAG: ${stats.rag}`} />
        <div style={{ width: `${memoryW}%` }} className="h-full bg-cyber-amber shadow-[0_0_10px_rgba(245,158,11,0.5)] z-10 transition-all duration-500" title={`Memory: ${stats.memory}`} />
        <div style={{ width: `${historyW}%` }} className="h-full bg-cyber-cyan shadow-[0_0_10px_rgba(6,182,212,0.5)] z-10 transition-all duration-500" title={`History: ${stats.history}`} />
        {/* Remaining space is implicit */}
        
        {/* Fill marker if full */}
        {stats.total >= stats.limit && (
           <div className="absolute inset-0 border-2 border-red-500 animate-pulse z-20 pointer-events-none rounded-full" />
        )}
      </div>

      {/* Legend */}
      <div className="grid grid-cols-4 gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-cyber-purple" />
            <span className="text-[10px] uppercase font-bold text-white/40 tracking-wider">System</span>
          </div>
          <span className="text-xs font-mono text-cyber-purple pl-4">{stats.system.toLocaleString()}</span>
        </div>
        
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-cyber-emerald" />
            <span className="text-[10px] uppercase font-bold text-white/40 tracking-wider">RAG</span>
          </div>
          <span className="text-xs font-mono text-cyber-emerald pl-4">{stats.rag.toLocaleString()}</span>
        </div>
        
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-cyber-amber" />
            <span className="text-[10px] uppercase font-bold text-white/40 tracking-wider">Memory</span>
          </div>
          <span className="text-xs font-mono text-cyber-amber pl-4">{stats.memory.toLocaleString()}</span>
        </div>
        
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-cyber-cyan" />
            <span className="text-[10px] uppercase font-bold text-white/40 tracking-wider">History</span>
          </div>
          <span className="text-xs font-mono text-cyber-cyan pl-4">{stats.history.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
};
