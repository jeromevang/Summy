import React from 'react';
import { HardwareProfile } from '../types';

interface HardwarePanelProps {
  hardware: HardwareProfile | null;
  isLoading: boolean;
  onRefresh: () => void;
}

export const HardwarePanel: React.FC<HardwarePanelProps> = ({ hardware, isLoading, onRefresh }) => {
  if (isLoading) {
    return (
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6 animate-pulse">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 bg-gray-700 rounded-lg"></div>
          <div className="h-6 w-48 bg-gray-700 rounded"></div>
        </div>
        <div className="space-y-3">
          <div className="h-4 w-full bg-gray-700 rounded"></div>
          <div className="h-4 w-3/4 bg-gray-700 rounded"></div>
        </div>
      </div>
    );
  }

  if (!hardware) {
    return (
      <div className="bg-gray-800/50 border border-red-500/30 rounded-xl p-6">
        <div className="text-red-400 mb-2">Failed to detect hardware</div>
        <button
          onClick={onRefresh}
          className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
        >
          Retry Detection
        </button>
      </div>
    );
  }

  const vramUsedPercent = ((hardware.totalVramGB - hardware.availableVramGB) / hardware.totalVramGB) * 100;
  const vramColor = vramUsedPercent > 80 ? 'red' : vramUsedPercent > 50 ? 'yellow' : 'green';

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          💻 Hardware Profile
        </h3>
        <button
          onClick={onRefresh}
          className="text-gray-400 hover:text-white text-sm"
        >
          🔄 Refresh
        </button>
      </div>

      {hardware.primaryGpu && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">🎮</span>
            <span className="text-white font-medium">{hardware.primaryGpu.name}</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div>
              <span className="text-gray-400">VRAM: </span>
              <span className={`font-mono text-\${vramColor}-400`}>
                {hardware.availableVramGB.toFixed(1)} / {hardware.totalVramGB.toFixed(1)} GB
              </span>
            </div>
          </div>
          <div className="mt-2 h-3 bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all bg-\${vramColor}-500`}
              style={{ width: `\${100 - vramUsedPercent}%` }}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 text-xs">
        <div className="bg-gray-900/50 p-2 rounded border border-gray-700">
          <div className="text-gray-500 mb-1 uppercase tracking-wider">System CPU</div>
          <div className="text-gray-300 truncate">{hardware.system.cpuModel}</div>
        </div>
        <div className="bg-gray-900/50 p-2 rounded border border-gray-700">
          <div className="text-gray-500 mb-1 uppercase tracking-wider">System RAM</div>
          <div className="text-gray-300">{hardware.system.ramTotalGB.toFixed(0)} GB</div>
        </div>
      </div>
    </div>
  );
};
