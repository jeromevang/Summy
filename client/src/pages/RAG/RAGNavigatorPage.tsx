import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRag } from './hooks/useRag';

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
    stats,
    availableModels,
    selectedModel,
    setSelectedModel,
    loadModel,
    isLoadingModel,
  } = useRag();

  const [showModelConfig, setShowModelConfig] = useState(false);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // The useRag hook handles the search via useEffect
  };

  const handleLoadModel = async () => {
    await loadModel();
    setShowModelConfig(false);
  };

  // Format file size
  const formatSize = (bytes?: number) => {
    if (!bytes) return 'Unknown';
    const kb = bytes / 1024;
    const mb = kb / 1024;
    const gb = mb / 1024;
    if (gb >= 1) return `${gb.toFixed(2)} GB`;
    if (mb >= 1) return `${mb.toFixed(2)} MB`;
    return `${kb.toFixed(2)} KB`;
  };

  return (
    <div className="h-full overflow-hidden bg-obsidian text-white flex flex-col p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
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
        <div className="bg-obsidian-panel border border-white/5 rounded-xl p-6 shadow-2xl flex flex-col space-y-4">
          <h3 className="text-lg font-semibold text-white">Indexing Status (GPS)</h3>
          <p className="text-sm text-white/70">
            Current status of the codebase index used for RAG and semantic search.
          </p>

          {/* Embedding Model Configuration */}
          <div className="bg-white/5 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white">Embedding Model</span>
              <button
                onClick={() => setShowModelConfig(!showModelConfig)}
                className="text-xs text-cyber-cyan hover:text-cyber-cyan/80"
              >
                {showModelConfig ? 'Hide' : 'Configure'}
              </button>
            </div>

            <div className="text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-white/50">Model:</span>
                <span className="text-white/80 font-mono">{stats?.embeddingModel || 'None'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/50">Loaded:</span>
                <span className={stats?.embeddingModelLoaded ? 'text-cyber-emerald' : 'text-red-400'}>
                  {stats?.embeddingModelLoaded ? 'Yes' : 'No'}
                </span>
              </div>
            </div>

            {showModelConfig && (
              <div className="pt-3 border-t border-white/10 space-y-3">
                <div>
                  <label className="text-xs text-white/70 block mb-2">Select Model</label>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white"
                  >
                    {availableModels.length === 0 && (
                      <option value="">No models available</option>
                    )}
                    {availableModels.map((model) => (
                      <option key={model.path} value={model.path}>
                        {model.name} {model.loaded ? '(loaded)' : ''} - {formatSize(model.size)}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={handleLoadModel}
                  disabled={isLoadingModel || !selectedModel}
                  className="w-full px-3 py-1.5 bg-cyber-purple hover:bg-cyber-purple/80 disabled:opacity-50 disabled:cursor-not-allowed rounded text-xs font-medium transition-all"
                >
                  {isLoadingModel ? 'Loading Model...' : 'Load Model'}
                </button>

                {availableModels.length === 0 && (
                  <p className="text-xs text-cyber-amber">
                    No embedding models found in LM Studio. Please download an embedding model (e.g., nomic-embed-text) in LM Studio first.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Indexing Stats */}
          <div className="space-y-2">
            <div className="flex items-center justify-between bg-white/5 p-3 rounded-lg">
              <span className="text-sm text-white/70">Indexed Files:</span>
              <span className="text-white font-mono text-sm">
                {stats?.totalFiles || 0}
              </span>
            </div>

            <div className="flex items-center justify-between bg-white/5 p-3 rounded-lg">
              <span className="text-sm text-white/70">Embeddings:</span>
              <span className="text-cyber-emerald font-mono text-sm">
                {stats?.embeddingsGenerated || 0}
              </span>
            </div>

            <div className="flex items-center justify-between bg-white/5 p-3 rounded-lg">
              <span className="text-sm text-white/70">Chunks:</span>
              <span className="text-cyber-cyan font-mono text-sm">
                {stats?.chunksCreated || 0}
              </span>
            </div>

            {stats?.projectPath && (
              <div className="bg-white/5 p-3 rounded-lg">
                <span className="text-xs text-white/50 block mb-1">Project Path:</span>
                <span className="text-xs text-white/80 font-mono break-all">
                  {stats.projectPath}
                </span>
              </div>
            )}
          </div>

          {/* Index Button */}
          <button
            onClick={triggerIndex}
            disabled={isIndexing || !stats?.embeddingModelLoaded}
            className="w-full py-2 bg-cyber-emerald hover:bg-cyber-emerald/80 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-all"
          >
            {isIndexing ? 'Indexing...' : 'Re-index Codebase'}
          </button>

          {!stats?.embeddingModelLoaded && (
            <p className="text-xs text-cyber-amber text-center">
              Load an embedding model first
            </p>
          )}

          {isIndexing && (
            <p className="text-cyber-amber text-xs text-center">
              Indexing can take a few minutes depending on codebase size.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default RAGNavigatorPage;
