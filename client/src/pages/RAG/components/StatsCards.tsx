import React from 'react';
import { RAGStats } from '../types';

interface StatsCardsProps {
  stats: RAGStats | null;
  formatBytes: (bytes: number) => string;
}

export const StatsCards: React.FC<StatsCardsProps> = ({ stats, formatBytes }) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ready': case 'complete': return 'bg-green-500';
      case 'indexing': case 'scanning': case 'chunking': case 'embedding': case 'storing': return 'bg-yellow-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
      <div className="bg-[#1a1a1a] rounded-lg p-4 border border-gray-800">
        <div className="text-gray-400 text-sm">Status</div>
        <div className="flex items-center gap-2 mt-1">
          <span className={`w-2 h-2 rounded-full \${getStatusColor(stats?.status || 'idle')}`}></span>
          <span className="text-xl font-bold capitalize">{stats?.status || 'Idle'}</span>
        </div>
      </div>
      <div className="bg-[#1a1a1a] rounded-lg p-4 border border-gray-800">
        <div className="text-gray-400 text-sm">Files Indexed</div>
        <div className="text-xl font-bold mt-1">{stats?.totalFiles || 0}</div>
      </div>
      <div className="bg-[#1a1a1a] rounded-lg p-4 border border-gray-800">
        <div className="text-gray-400 text-sm">Chunks</div>
        <div className="text-xl font-bold mt-1">{stats?.totalChunks || 0}</div>
      </div>
      <div className="bg-[#1a1a1a] rounded-lg p-4 border border-gray-800">
        <div className="text-gray-400 text-sm">Vectors</div>
        <div className="text-xl font-bold mt-1">{stats?.totalVectors || 0}</div>
      </div>
      <div className="bg-[#1a1a1a] rounded-lg p-4 border border-gray-800">
        <div className="text-gray-400 text-sm">Storage</div>
        <div className="text-xl font-bold mt-1">{formatBytes(stats?.storageSize || 0)}</div>
      </div>
    </div>
  );
};
