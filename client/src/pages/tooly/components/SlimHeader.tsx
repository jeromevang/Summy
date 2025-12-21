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
    <div className="bg-[#1a1a1a] border border-[#2d2d2d] rounded-xl">
      {/* Compact Header */}
      <div 
        className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-[#1e1e1e] transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Left: Active Models */}
        <div className="flex items-center gap-6">
          {/* Main Model */}
          <div className="flex items-center gap-2">
            <span className="text-purple-500 text-sm font-medium">🎯 Main:</span>
            {activeModels.main ? (
              <span className="text-white text-sm">
                {activeModels.main.name}
                {activeModels.main.score && (
                  <span className="text-gray-500 ml-1">({activeModels.main.score}%)</span>
                )}
              </span>
            ) : (
              <span className="text-gray-500 text-sm italic">Not set</span>
            )}
          </div>
          
          {/* Executor Model */}
          <div className="flex items-center gap-2">
            <span className="text-cyan-500 text-sm font-medium">⚡ Exec:</span>
            {activeModels.executor ? (
              <span className="text-white text-sm">
                {activeModels.executor.name}
                {activeModels.executor.score && (
                  <span className="text-gray-500 ml-1">({activeModels.executor.score}%)</span>
                )}
              </span>
            ) : (
              <span className="text-gray-500 text-sm italic">Not set</span>
            )}
          </div>
        </div>

        {/* Right: System Metrics */}
        <div className="flex items-center gap-4">
          {/* CPU */}
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-xs">CPU</span>
            <MiniSparkline data={cpuHistory} color="#3b82f6" />
            <span className="text-blue-400 text-sm font-mono w-10 text-right">
              {systemMetrics?.cpu ?? 0}%
            </span>
          </div>
          
          {/* GPU */}
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-xs">GPU</span>
            <MiniSparkline data={gpuHistory} color="#22c55e" />
            <span className="text-green-400 text-sm font-mono w-10 text-right">
              {systemMetrics?.gpu ?? 0}%
            </span>
          </div>
          
          {/* VRAM */}
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-xs">VRAM</span>
            <MiniSparkline data={vramHistory} color="#f59e0b" />
            <span className="text-amber-400 text-sm font-mono w-20 text-right">
              {formatVram(systemMetrics?.vramUsedMB, systemMetrics?.vramTotalMB)}
            </span>
          </div>

          {/* Test Running Indicator */}
          {isTestRunning && (
            <div className="flex items-center gap-1 text-purple-400">
              <span className="animate-spin">⚙️</span>
              <span className="text-xs">Testing...</span>
            </div>
          )}
          
          {/* Expand Icon */}
          <span className={`text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
            ▼
          </span>
        </div>
      </div>

      {/* Expanded Configuration */}
      {isExpanded && (
        <div className="px-4 py-3 border-t border-[#2d2d2d] bg-[#161616]">
          <div className="grid grid-cols-2 gap-4">
            {/* Main Model Config */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-400">Main Model (Planning & Reasoning)</h4>
              <p className="text-xs text-gray-500">
                Handles task analysis, RAG queries, and complex reasoning.
              </p>
              {activeModels.main && (
                <div className="bg-[#1a1a1a] p-2 rounded text-sm">
                  <span className="text-white">{activeModels.main.name}</span>
                </div>
              )}
            </div>
            
            {/* Executor Model Config */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-400">Executor Model (Tool Execution)</h4>
              <p className="text-xs text-gray-500">
                Handles file operations, git commands, and tool calls.
              </p>
              {activeModels.executor && (
                <div className="bg-[#1a1a1a] p-2 rounded text-sm">
                  <span className="text-white">{activeModels.executor.name}</span>
                </div>
              )}
            </div>
          </div>
          
          {/* GPU Info */}
          {systemMetrics?.gpuName && (
            <div className="mt-3 pt-3 border-t border-[#2d2d2d]">
              <span className="text-xs text-gray-500">
                {systemMetrics.gpuName}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SlimHeader;

