import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRag } from './hooks/useRag'; // Assuming this hook will be created

const RAGNavigatorPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    searchQuery,
    setSearchQuery,
    searchResults,
    isSearching,
    ragStatus,
    isIndexing,
    triggerIndex,
    error,
  } = useRag();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // The useRag hook should handle the actual search logic when searchQuery changes
  };

  return (
    <div className="h-full overflow-hidden bg-obsidian text-white flex flex-col p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')} // Navigate back to dashboard or home
            className="p-2 hover:bg-white/5 rounded-lg text-white/60 hover:text-white transition-colors"
          >
            ←
          </button>
          <h1 className="text-2xl font-bold text-white">RAG & GPS Navigator</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-white/50">RAG Server Status: </span>
          <span className={`px-3 py-1 rounded-full text-xs font-bold ${
            ragStatus === 'indexed' ? 'bg-cyber-emerald/20 text-cyber-emerald' :
            ragStatus === 'indexing' ? 'bg-cyber-amber/20 text-cyber-amber' :
            'bg-red-500/20 text-red-400'
          }`}>
            {ragStatus.toUpperCase()}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1">
        {/* Search Panel */}
        <div className="md:col-span-2 bg-obsidian-panel border border-white/5 rounded-xl p-6 shadow-2xl flex flex-col">
          <h3 className="text-lg font-semibold text-white mb-4">Semantic Code Search</h3>
          <form onSubmit={handleSearch} className="flex gap-3 mb-4">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search codebase semantically (e.g., 'how is auth handled?')"
              className="flex-1 bg-white/[0.03] border border-white/10 rounded px-3 py-2 text-sm text-white focus:border-cyber-cyan focus:outline-none"
            />
            <button
              type="submit"
              disabled={isSearching}
              className="px-5 py-2 bg-cyber-cyan hover:bg-cyber-cyan/80 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-all"
            >
              {isSearching ? 'Searching...' : 'Search'}
            </button>
          </form>

          {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

          {/* Search Results */}
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {searchResults.length === 0 && !isSearching ? (
              <p className="text-gray-500 text-center py-8">No results. Try a semantic query.</p>
            ) : searchResults.length === 0 && isSearching ? (
              <p className="text-gray-500 text-center py-8">Searching...</p>
            ) : (
              <div className="space-y-4">
                {searchResults.map((result, idx) => (
                  <div key={idx} className="bg-white/[0.02] border border-white/5 rounded-lg p-4">
                    <p className="text-cyber-cyan text-sm font-mono mb-1">{result.filePath}</p>
                    <pre className="text-white/80 text-xs font-mono whitespace-pre-wrap max-h-40 overflow-hidden">
                      {result.snippet}
                    </pre>
                    <p className="text-white/50 text-xs mt-2">Relevance: {(result.relevance * 100).toFixed(1)}%</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Indexing Status & Control */}
        <div className="bg-obsidian-panel border border-white/5 rounded-xl p-6 shadow-2xl flex flex-col">
          <h3 className="text-lg font-semibold text-white mb-4">Indexing Status (GPS)</h3>
          <p className="text-sm text-white/70 mb-4">
            Current status of the codebase index used for RAG and semantic search.
          </p>

          <div className="flex items-center justify-between bg-white/5 p-3 rounded-lg mb-4">
            <span className="text-sm text-white/70">Last Indexed:</span>
            <span className="text-cyber-emerald font-mono text-sm">
              {ragStatus === 'indexed' ? 'Just now' : 'N/A'} {/* TODO: Replace with actual timestamp */}
            </span>
          </div>
          <div className="flex items-center justify-between bg-white/5 p-3 rounded-lg mb-6">
            <span className="text-sm text-white/70">Indexed Files:</span>
            <span className="text-white font-mono text-sm">
              {ragStatus === 'indexed' ? '12,345' : '0'} {/* TODO: Replace with actual file count */}
            </span>
          </div>

          <button
            onClick={triggerIndex}
            disabled={isIndexing}
            className="w-full py-2 bg-cyber-emerald hover:bg-cyber-emerald/80 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-all"
          >
            {isIndexing ? 'Indexing...' : 'Re-index Codebase'}
          </button>

          {isIndexing && (
            <p className="text-cyber-amber text-xs mt-3 text-center">
              Indexing can take a few minutes depending on codebase size.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default RAGNavigatorPage;
