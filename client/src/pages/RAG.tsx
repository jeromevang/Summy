import React, { useState } from 'react';
import { StatsCards, ChunkBrowser } from './RAG/components';
import { useRAG } from './RAG/hooks';
import { TabId, ChunkInfo } from './RAG/types';

const RAG: React.FC = () => {
  const {
    stats, progress, isConnected, projectPath, setProjectPath, queryText, setQueryText,
    queryResults, isQuerying, queryLatency, handleStartIndexing, handleQuery
  } = useRAG();

  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [chunkFilter, setChunkFilter] = useState({ fileType: '', symbolType: '', search: '' });
  const [selectedChunk, setSelectedChunk] = useState<ChunkInfo | null>(null);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="border-b border-gray-800 bg-[#111] px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold">🔍 RAG System</h1>
          <span className={`px-2 py-1 rounded text-xs \${isConnected ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
            {isConnected ? '● Connected' : '○ Disconnected'}
          </span>
        </div>
        <div className="flex gap-2">
          {['dashboard', 'settings', 'query', 'browser'].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab as TabId)} className={`px-4 py-2 rounded \${activeTab === tab ? 'bg-blue-600' : 'bg-gray-800 text-gray-400'}`}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <StatsCards stats={stats} formatBytes={formatBytes} />
            {progress && (
              <div className="bg-[#1a1a1a] rounded-lg p-4 border border-gray-800">
                <div className="flex justify-between text-sm mb-2"><span>Indexing...</span><span>{progress.processedFiles}/{progress.totalFiles}</span></div>
                <div className="w-full bg-gray-700 h-2 rounded-full"><div className="bg-blue-600 h-2 rounded-full" style={{ width: `\${(progress.processedFiles / progress.totalFiles) * 100}%` }}></div></div>
              </div>
            )}
            <div className="bg-[#1a1a1a] rounded-lg p-4 border border-gray-800">
              <input type="text" value={projectPath} onChange={e => setProjectPath(e.target.value)} className="w-full px-3 py-2 bg-[#0a0a0a] border border-gray-700 rounded mb-4" placeholder="Project Path" />
              <button onClick={handleStartIndexing} className="px-4 py-2 bg-blue-600 rounded">Start Indexing</button>
            </div>
          </div>
        )}

        {activeTab === 'query' && (
          <div className="space-y-6">
            <div className="flex gap-3">
              <input type="text" value={queryText} onChange={e => setQueryText(e.target.value)} className="flex-1 px-4 py-3 bg-[#0a0a0a] border border-gray-700 rounded-lg text-lg" placeholder="Search codebase..." />
              <button onClick={handleQuery} disabled={isQuerying} className="px-6 py-3 bg-blue-600 rounded-lg">{isQuerying ? '...' : 'Search'}</button>
            </div>
            {queryResults.map((res, i) => (
              <div key={i} className="bg-[#1a1a1a] p-4 rounded-lg border border-gray-800">
                <div className="flex justify-between text-blue-400 font-mono text-sm mb-2"><span>{res.filePath}</span><span>{(res.score * 100).toFixed(1)}%</span></div>
                <pre className="bg-[#0a0a0a] p-3 rounded text-sm"><code>{res.snippet}</code></pre>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'browser' && (
          <ChunkBrowser state={{ chunks: [], totalCount: 0, page: 1, totalPages: 1 }} filter={chunkFilter} isLoading={false} selectedChunk={selectedChunk} onFilterChange={setChunkFilter} onLoadChunks={() => {}} onChunkClick={setSelectedChunk} />
        )}
      </div>
    </div>
  );
};

export default RAG;