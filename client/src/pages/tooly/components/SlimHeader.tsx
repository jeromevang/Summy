/**
 * Slim Header Component
 * Compact display of active models and system metrics (CPU/GPU/VRAM)
 * Can be expanded to show full Active Model Configuration
 */

import React, { useState } from 'react';

interface SystemMetrics {
  cpu: number;
  gpu: number;
  vramUsedMB?: number;
  vramTotalMB?: number;
  vramPercent?: number;
  gpuName?: string;
}

interface ActiveModelInfo {
  main?: {
    id: string;
    name: string;
    score?: number;
  };
  executor?: {
    id: string;
    name: string;
    score?: number;
  };
}

interface SlimHeaderProps {
  activeModels: ActiveModelInfo;
  systemMetrics?: SystemMetrics;
  metricsHistory?: SystemMetrics[];
  isTestRunning?: boolean;
  onExpandConfig?: () => void;
  onSetMain?: (modelId: string) => void;
  onSetExecutor?: (modelId: string) => void;
}

// Mini sparkline for metrics
const MiniSparkline: React.FC<{ data: number[]; color: string; maxValue?: number }> = ({ 
  data, 
  color, 
  maxValue = 100 
}) => {
  const height = 24;
  const width = 60;
  const points = data.slice(-20).map((v, i, arr) => {
    const x = (i / (arr.length - 1)) * width;
    const y = height - (v / maxValue) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} className="opacity-70">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

// Format VRAM display
const formatVram = (usedMB?: number, totalMB?: number): string => {
  if (!usedMB || !totalMB) return 'N/A';
  const usedGB = (usedMB / 1024).toFixed(1);
  const totalGB = (totalMB / 1024).toFixed(1);
  return `${usedGB}/${totalGB}GB`;
};

export const SlimHeader: React.FC<SlimHeaderProps> = ({
  activeModels,
  systemMetrics,
  metricsHistory = [],
  isTestRunning = false,
  onExpandConfig,
  onSetMain,
  onSetExecutor
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const cpuHistory = metricsHistory.map(m => m.cpu);
  const gpuHistory = metricsHistory.map(m => m.gpu);
  const vramHistory = metricsHistory.map(m => m.vramPercent || 0);

  return (
    <div className="bg-obsidian-panel border border-white/5 rounded-xl shadow-2xl">
      {/* Compact Header */}
      <div 
        className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Left: Active Models */}
        <div className="flex items-center gap-6">
          {/* Main Model */}
          <div className="flex items-center gap-2 group">
            <span className="text-cyber-purple text-sm font-semibold tracking-wide uppercase">🎯 Main:</span>
            {activeModels.main ? (
              <span className="text-white text-sm font-medium">
                {activeModels.main.name}
                {activeModels.main.score && (
                  <span className="text-white/40 ml-1.5 text-xs">({activeModels.main.score}%)</span>
                )}
              </span>
            ) : (
              <span className="text-white/20 text-sm italic">Not set</span>
            )}
          </div>
          
          <div className="h-4 w-[1px] bg-white/5" />

          {/* Executor Model */}
          <div className="flex items-center gap-2 group">
            <span className="text-cyber-cyan text-sm font-semibold tracking-wide uppercase">⚡ Exec:</span>
            {activeModels.executor ? (
              <span className="text-white text-sm font-medium">
                {activeModels.executor.name}
                {activeModels.executor.score && (
                  <span className="text-white/40 ml-1.5 text-xs">({activeModels.executor.score}%)</span>
                )}
              </span>
            ) : (
              <span className="text-white/20 text-sm italic">Not set</span>
            )}
          </div>
        </div>

        {/* Right: System Metrics */}
        <div className="flex items-center gap-6">
          {/* CPU */}
          <div className="flex items-center gap-3">
            <span className="text-white/40 text-[10px] font-bold uppercase tracking-widest">CPU</span>
            <div className="relative">
              <MiniSparkline data={cpuHistory} color="#8b5cf6" />
            </div>
            <span className="text-cyber-purple text-sm font-mono w-10 text-right tabular-nums">
              {systemMetrics?.cpu ?? 0}%
            </span>
          </div>
          
          {/* GPU */}
          <div className="flex items-center gap-3">
            <span className="text-white/40 text-[10px] font-bold uppercase tracking-widest">GPU</span>
            <div className="relative">
              <MiniSparkline data={gpuHistory} color="#10b981" />
            </div>
            <span className="text-cyber-emerald text-sm font-mono w-10 text-right tabular-nums">
              {systemMetrics?.gpu ?? 0}%
            </span>
          </div>
          
          {/* VRAM */}
          <div className="flex items-center gap-3">
            <span className="text-white/40 text-[10px] font-bold uppercase tracking-widest">VRAM</span>
            <div className="relative">
              <MiniSparkline data={vramHistory} color="#f59e0b" />
            </div>
            <span className="text-cyber-amber text-sm font-mono w-20 text-right tabular-nums">
              {formatVram(systemMetrics?.vramUsedMB, systemMetrics?.vramTotalMB)}
            </span>
          </div>

          {/* Test Running Indicator */}
          {isTestRunning && (
            <div className="flex items-center gap-2 px-3 py-1 bg-cyber-purple/10 border border-cyber-purple/20 rounded-full">
              <span className="w-2 h-2 bg-cyber-purple rounded-full animate-pulse" />
              <span className="text-cyber-purple text-[10px] font-bold uppercase tracking-wider">Testing</span>
            </div>
          )}
          
          {/* Expand Icon */}
          <span className={`text-white/20 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
            ▼
          </span>
        </div>
      </div>

      {/* Expanded Configuration */}
      {isExpanded && (
        <div className="px-6 py-4 border-t border-white/5 bg-obsidian/40 backdrop-blur-md">
          <div className="grid grid-cols-2 gap-8">
            {/* Main Model Config */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-white/50 uppercase tracking-widest">Main Reasoning Engine</h4>
                <span className="px-2 py-0.5 bg-cyber-purple/10 text-cyber-purple text-[10px] rounded border border-cyber-purple/20">L3 PLANNER</span>
              </div>
              <p className="text-xs text-white/30 leading-relaxed">
                Responsible for architectural mapping, RAG query optimization, and complex reasoning loops.
              </p>
              {activeModels.main && (
                <div className="bg-white/[0.02] border border-white/5 p-3 rounded-lg flex items-center justify-between">
                  <span className="text-white font-medium">{activeModels.main.name}</span>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-cyber-emerald shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                    <span className="text-[10px] text-cyber-emerald font-bold uppercase">Active</span>
                  </div>
                </div>
              )}
            </div>
            
            {/* Executor Model Config */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-white/50 uppercase tracking-widest">Tool Executor Engine</h4>
                <span className="px-2 py-0.5 bg-cyber-cyan/10 text-cyber-cyan text-[10px] rounded border border-cyber-cyan/20">L2 ACTUATOR</span>
              </div>
              <p className="text-xs text-white/30 leading-relaxed">
                Optimized for precise tool calling, file operations, and structured JSON output.
              </p>
              {activeModels.executor && (
                <div className="bg-white/[0.02] border border-white/5 p-3 rounded-lg flex items-center justify-between">
                  <span className="text-white font-medium">{activeModels.executor.name}</span>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-cyber-emerald shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                    <span className="text-[10px] text-cyber-emerald font-bold uppercase">Active</span>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* GPU Info */}
          {systemMetrics?.gpuName && (
            <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between">
              <span className="text-[10px] font-bold text-white/20 uppercase tracking-[0.2em]">
                Hardware: {systemMetrics.gpuName}
              </span>
              <div className="flex gap-4">
                 <div className="flex items-center gap-2">
                   <div className="w-1 h-1 bg-cyber-cyan rounded-full" />
                   <span className="text-[10px] text-white/40 uppercase font-medium">LMStudio API: Ready</span>
                 </div>
                 <div className="flex items-center gap-2">
                   <div className="w-1 h-1 bg-cyber-emerald rounded-full" />
                   <span className="text-[10px] text-white/40 uppercase font-medium">Swarm Cluster: Syncing</span>
                 </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SlimHeader;

