import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

// Types
interface RAGConfig {
  lmstudio: {
    model: string;
    loadOnDemand: boolean;
  };
  storage: {
    dataPath: string;
  };
  indexing: {
    chunkSize: number;
    chunkOverlap: number;
    includePatterns: string[];
    excludePatterns: string[];
  };
  watcher: {
    enabled: boolean;
    debounceMs: number;
  };
  project: {
    path: string | null;
    autoDetect: boolean;
  };
}

interface RAGStats {
  projectPath: string | null;
  status: string;
  totalFiles: number;
  totalChunks: number;
  totalVectors: number;
  dimensions: number;
  storageSize: number;
  embeddingModel: string;
  embeddingModelLoaded: boolean;
  fileWatcherActive: boolean;
}

interface IndexProgress {
  status: string;
  totalFiles: number;
  processedFiles: number;
  currentFile: string;
  chunksCreated: number;
  embeddingsGenerated: number;
  eta: number;
  error?: string;
}

interface EmbeddingModel {
  id: string;
  name: string;
  path?: string;
  loaded?: boolean;
  size?: number;
}

interface QueryResult {
  filePath: string;
  startLine: number;
  endLine: number;
  snippet: string;
  symbolName: string | null;
  symbolType: string | null;
  language: string;
  score: number;
}

interface ChunkInfo {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  symbolName: string | null;
  symbolType: string | null;
  language: string;
  tokens: number;
  preview: string;
  // Full content loaded on demand
  content?: string;
  signature?: string | null;
}

interface ChunkBrowserState {
  chunks: ChunkInfo[];
  totalCount: number;
  page: number;
  totalPages: number;
}

interface FolderEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

interface BrowseRoot {
  path: string;
  name: string;
  type: 'drive' | 'folder';
}

interface BrowseResult {
  path: string;
  parent: string | null;
  folders: FolderEntry[];
  isProject: boolean;
}

const API_BASE = 'http://localhost:3001/api/rag';

const RAG: React.FC = () => {
  // State
  const [config, setConfig] = useState<RAGConfig | null>(null);
  const [stats, setStats] = useState<RAGStats | null>(null);
  const [progress, setProgress] = useState<IndexProgress | null>(null);
  const [models, setModels] = useState<EmbeddingModel[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'settings' | 'query' | 'browser'>('dashboard');
  
  // Form state
  const [projectPath, setProjectPath] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [queryText, setQueryText] = useState('');
  const [queryResults, setQueryResults] = useState<QueryResult[]>([]);
  const [isQuerying, setIsQuerying] = useState(false);
  const [queryLatency, setQueryLatency] = useState(0);
  
  // Save status
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  
  // Folder picker state
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [browseRoots, setBrowseRoots] = useState<BrowseRoot[]>([]);
  const [currentBrowsePath, setCurrentBrowsePath] = useState<string>('');
  const [browseFolders, setBrowseFolders] = useState<FolderEntry[]>([]);
  const [browseParent, setBrowseParent] = useState<string | null>(null);
  const [browseIsProject, setBrowseIsProject] = useState(false);
  const [isLoadingFolder, setIsLoadingFolder] = useState(false);
  
  // Chunk browser state
  const [chunkBrowser, setChunkBrowser] = useState<ChunkBrowserState>({
    chunks: [],
    totalCount: 0,
    page: 1,
    totalPages: 1
  });
  const [chunkFilter, setChunkFilter] = useState({
    fileType: '',
    symbolType: '',
    search: ''
  });
  const [isLoadingChunks, setIsLoadingChunks] = useState(false);
  const [selectedChunk, setSelectedChunk] = useState<ChunkInfo | null>(null);

  // Load data - each call is independent so one failure doesn't block others
  const loadData = useCallback(async () => {
    // Check connection
    try {
      const healthRes = await axios.get(`${API_BASE}/health`);
      setIsConnected(healthRes.data.healthy);
    } catch (error) {
      console.error('Failed to check RAG health:', error);
      setIsConnected(false);
    }
    
    // Load stats
    try {
      const statsRes = await axios.get(`${API_BASE}/stats`);
      setStats(statsRes.data);
      if (statsRes.data.projectPath) {
        setProjectPath(statsRes.data.projectPath);
      }
    } catch (error) {
      console.error('Failed to load RAG stats:', error);
    }
    
    // Load config - now persisted in database, always available
    try {
      const configRes = await axios.get(`${API_BASE}/config`);
      setConfig(configRes.data);
      if (configRes.data.lmstudio?.model) {
        setSelectedModel(configRes.data.lmstudio.model);
      }
      // Load project path from config if not already set
      if (configRes.data.project?.path && !projectPath) {
        setProjectPath(configRes.data.project.path);
      }
    } catch (error) {
      console.log('Failed to load RAG config:', error);
    }
    
    // Load models - this works even without RAG server (queries LM Studio directly)
    try {
      const modelsRes = await axios.get(`${API_BASE}/models`);
      setModels(Array.isArray(modelsRes.data) ? modelsRes.data : []);
    } catch (error) {
      console.error('Failed to load embedding models:', error);
    }
    
    // Load progress
    try {
      const progressRes = await axios.get(`${API_BASE}/index/status`);
      setProgress(progressRes.data);
    } catch (error) {
      console.error('Failed to load indexing progress:', error);
    }
  }, []);

  useEffect(() => {
    loadData();
    
    // Poll for updates
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Open folder picker
  const openFolderPicker = async () => {
    setShowFolderPicker(true);
    setIsLoadingFolder(true);
    
    try {
      // Load root folders
      const rootsRes = await axios.get(`${API_BASE}/browse/roots`);
      setBrowseRoots(rootsRes.data);
      
      // If we have a current path, browse to it
      if (projectPath) {
        await browseToFolder(projectPath);
      } else {
        // Start from first root
        if (rootsRes.data.length > 0) {
          await browseToFolder(rootsRes.data[0].path);
        }
      }
    } catch (error) {
      console.error('Failed to load roots:', error);
    } finally {
      setIsLoadingFolder(false);
    }
  };

  // Browse to a specific folder
  const browseToFolder = async (folderPath: string) => {
    setIsLoadingFolder(true);
    try {
      const res = await axios.get(`${API_BASE}/browse/dir`, {
        params: { path: folderPath }
      });
      setCurrentBrowsePath(res.data.path);
      setBrowseFolders(res.data.folders);
      setBrowseParent(res.data.parent);
      setBrowseIsProject(res.data.isProject);
    } catch (error) {
      console.error('Failed to browse folder:', error);
    } finally {
      setIsLoadingFolder(false);
    }
  };

  // Select folder from picker
  const selectFolder = () => {
    setProjectPath(currentBrowsePath);
    setShowFolderPicker(false);
  };

  // Start indexing
  const handleStartIndexing = async () => {
    if (!projectPath) return;
    
    try {
      await axios.post(`${API_BASE}/index`, { projectPath });
      loadData();
    } catch (error) {
      console.error('Failed to start indexing:', error);
    }
  };

  // Cancel indexing
  const handleCancelIndexing = async () => {
    try {
      await axios.post(`${API_BASE}/index/cancel`);
      loadData();
    } catch (error) {
      console.error('Failed to cancel indexing:', error);
    }
  };

  // Clear index
  const handleClearIndex = async () => {
    if (!confirm('Are you sure you want to delete all indexed data? This cannot be undone.')) {
      return;
    }
    
    try {
      await axios.delete(`${API_BASE}/index`);
      loadData();
    } catch (error) {
      console.error('Failed to clear index:', error);
    }
  };

  // Save settings
  const handleSaveSettings = async () => {
    if (!config) return;
    
    setSaveStatus('saving');
    try {
      await axios.put(`${API_BASE}/config`, {
        lmstudio: {
          ...config.lmstudio,
          model: selectedModel
        },
        project: {
          ...config.project,
          path: projectPath
        }
      });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
      loadData();
    } catch (error) {
      console.error('Failed to save settings:', error);
      setSaveStatus('error');
    }
  };

  // Query
  const handleQuery = async () => {
    if (!queryText.trim()) return;
    
    setIsQuerying(true);
    try {
      const response = await axios.post(`${API_BASE}/query`, {
        query: queryText,
        limit: 10
      });
      setQueryResults(response.data.results || []);
      setQueryLatency(response.data.latency || 0);
    } catch (error) {
      console.error('Query failed:', error);
      setQueryResults([]);
    } finally {
      setIsQuerying(false);
    }
  };

  // Load chunks for browser
  const loadChunks = useCallback(async (page: number = 1) => {
    setIsLoadingChunks(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        ...(chunkFilter.fileType && { fileType: chunkFilter.fileType }),
        ...(chunkFilter.symbolType && { symbolType: chunkFilter.symbolType }),
        ...(chunkFilter.search && { search: chunkFilter.search })
      });
      const res = await axios.get(`${API_BASE}/chunks?${params}`);
      setChunkBrowser({
        chunks: res.data.chunks || [],
        totalCount: res.data.pagination?.total || 0,
        page: res.data.pagination?.page || 1,
        totalPages: res.data.pagination?.pages || 1
      });
      setSelectedChunk(null); // Clear selection when loading new page
    } catch (error) {
      console.error('Failed to load chunks:', error);
    } finally {
      setIsLoadingChunks(false);
    }
  }, [chunkFilter]);

  // Load full chunk content
  const loadFullChunk = async (chunkId: string) => {
    try {
      const res = await axios.get(`${API_BASE}/chunks/${chunkId}`);
      const fullChunk = res.data;
      // Update the chunk in the list with full content
      setChunkBrowser(prev => ({
        ...prev,
        chunks: prev.chunks.map(c => 
          c.id === chunkId ? { ...c, content: fullChunk.content, signature: fullChunk.signature } : c
        )
      }));
      // Set as selected
      const updatedChunk = { ...chunkBrowser.chunks.find(c => c.id === chunkId)!, content: fullChunk.content, signature: fullChunk.signature };
      setSelectedChunk(updatedChunk);
    } catch (error) {
      console.error('Failed to load chunk details:', error);
    }
  };

  // Handle chunk click
  const handleChunkClick = (chunk: ChunkInfo) => {
    if (selectedChunk?.id === chunk.id) {
      setSelectedChunk(null);
    } else if (chunk.content) {
      setSelectedChunk(chunk);
    } else {
      loadFullChunk(chunk.id);
    }
  };

  // Load chunks when browser tab is active
  useEffect(() => {
    if (activeTab === 'browser') {
      loadChunks(1);
    }
  }, [activeTab, loadChunks]);

  // Format bytes
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Status badge color
  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'ready':
      case 'complete':
        return 'bg-green-500';
      case 'indexing':
      case 'scanning':
      case 'chunking':
      case 'embedding':
      case 'storing':
        return 'bg-yellow-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Header */}
      <div className="border-b border-gray-800 bg-[#111]">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold">🔍 RAG System</h1>
              <span className={`px-2 py-1 rounded text-xs ${isConnected ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                {isConnected ? '● Connected' : '○ Disconnected'}
              </span>
            </div>
            
            {/* Tabs */}
            <div className="flex gap-2">
              {(['dashboard', 'settings', 'query', 'browser'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 rounded transition-colors ${
                    activeTab === tab
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="bg-[#1a1a1a] rounded-lg p-4 border border-gray-800">
                <div className="text-gray-400 text-sm">Status</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`w-2 h-2 rounded-full ${getStatusColor(stats?.status || 'idle')}`}></span>
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

            {/* Progress Bar (when indexing) */}
            {progress && ['scanning', 'chunking', 'embedding', 'storing'].includes(progress.status) && (
              <div className="bg-[#1a1a1a] rounded-lg p-4 border border-gray-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Indexing Progress</span>
                  <span className="text-sm text-gray-400">
                    {progress.processedFiles} / {progress.totalFiles} files
                    {progress.eta > 0 && ` (ETA: ${Math.ceil(progress.eta)}s)`}
                  </span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ width: `${progress.totalFiles > 0 ? (progress.processedFiles / progress.totalFiles) * 100 : 0}%` }}
                  ></div>
                </div>
                <div className="mt-2 text-xs text-gray-400">
                  {progress.currentFile && `Current: ${progress.currentFile}`}
                </div>
                <div className="flex justify-end mt-2">
                  <button
                    onClick={handleCancelIndexing}
                    className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Quick Actions */}
            <div className="bg-[#1a1a1a] rounded-lg p-4 border border-gray-800">
              <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
              <div className="flex flex-wrap gap-3">
                <div className="flex-1 min-w-[300px]">
                  <label className="block text-sm text-gray-400 mb-1">Project Path</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={projectPath}
                      onChange={(e) => setProjectPath(e.target.value)}
                      placeholder="C:\path\to\project or /path/to/project"
                      className="flex-1 px-3 py-2 bg-[#0a0a0a] border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                    />
                    <button
                      onClick={openFolderPicker}
                      className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded font-medium whitespace-nowrap"
                      title="Browse folders"
                    >
                      📁 Browse
                    </button>
                  </div>
                </div>
                <div className="flex items-end gap-2">
                  <button
                    onClick={handleStartIndexing}
                    disabled={!projectPath || progress?.status === 'indexing'}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded font-medium"
                  >
                    {progress?.status === 'indexing' ? 'Indexing...' : 'Start Indexing'}
                  </button>
                  <button
                    onClick={handleClearIndex}
                    disabled={!stats?.totalVectors}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded font-medium"
                  >
                    Clear Index
                  </button>
                </div>
              </div>
            </div>

            {/* Info Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-[#1a1a1a] rounded-lg p-4 border border-gray-800">
                <h3 className="text-lg font-semibold mb-3">Project Info</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Path</span>
                    <span className="font-mono">{stats?.projectPath || 'Not configured'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">File Watcher</span>
                    <span className={stats?.fileWatcherActive ? 'text-green-400' : 'text-gray-500'}>
                      {stats?.fileWatcherActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="bg-[#1a1a1a] rounded-lg p-4 border border-gray-800">
                <h3 className="text-lg font-semibold mb-3">Embedding Model</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Model</span>
                    <span className="font-mono">{stats?.embeddingModel || 'Not configured'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Status</span>
                    <span className={stats?.embeddingModelLoaded ? 'text-green-400' : 'text-gray-500'}>
                      {stats?.embeddingModelLoaded ? 'Loaded' : 'Unloaded'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Dimensions</span>
                    <span>{stats?.dimensions || 0}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            <div className="bg-[#1a1a1a] rounded-lg p-6 border border-gray-800">
              <h3 className="text-lg font-semibold mb-4">Embedding Model</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">LM Studio Model</label>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0a0a0a] border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Select a model...</option>
                    {models.map(model => (
                      <option key={model.id} value={model.id}>
                        {model.name} {model.loaded ? '(loaded)' : ''}
                      </option>
                    ))}
                  </select>
                  
                  {models.length === 0 ? (
                    <div className="mt-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded text-sm">
                      <p className="text-yellow-400 font-medium mb-2">⚠️ No embedding models found</p>
                      <p className="text-gray-400 mb-2">
                        Make sure LM Studio is running and has an embedding model loaded.
                      </p>
                      <p className="text-gray-500 text-xs">
                        <strong>Recommended models:</strong>
                      </p>
                      <ul className="text-gray-500 text-xs mt-1 space-y-1 ml-4 list-disc">
                        <li><code className="text-blue-400">nomic-ai/nomic-embed-text-v1.5-GGUF</code> - Best overall (768 dims)</li>
                        <li><code className="text-blue-400">BAAI/bge-base-en-v1.5-gguf</code> - Good for code (768 dims)</li>
                        <li><code className="text-blue-400">sentence-transformers/all-MiniLM-L6-v2</code> - Fast & light (384 dims)</li>
                      </ul>
                      <p className="text-gray-500 text-xs mt-2">
                        In LM Studio: Search → Download → Load the model
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500 mt-1">
                      Select an embedding model from LM Studio. Recommended: nomic-embed-text or bge.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-[#1a1a1a] rounded-lg p-6 border border-gray-800">
              <h3 className="text-lg font-semibold mb-4">Project Settings</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Project Path</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={projectPath}
                      onChange={(e) => setProjectPath(e.target.value)}
                      placeholder="Absolute path to project directory"
                      className="flex-1 px-3 py-2 bg-[#0a0a0a] border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                    />
                    <button
                      onClick={openFolderPicker}
                      className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded font-medium"
                      title="Browse folders"
                    >
                      📁 Browse
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={handleSaveSettings}
                disabled={saveStatus === 'saving'}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded font-medium"
              >
                {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved!' : 'Save Settings'}
              </button>
            </div>
          </div>
        )}

        {/* Query Tab */}
        {activeTab === 'query' && (
          <div className="space-y-6">
            <div className="bg-[#1a1a1a] rounded-lg p-6 border border-gray-800">
              <h3 className="text-lg font-semibold mb-4">Semantic Search</h3>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={queryText}
                  onChange={(e) => setQueryText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleQuery()}
                  placeholder="Search your codebase... (e.g., 'authentication middleware', 'database connection')"
                  className="flex-1 px-4 py-3 bg-[#0a0a0a] border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500 text-lg"
                />
                <button
                  onClick={handleQuery}
                  disabled={isQuerying || !queryText.trim()}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-lg font-medium"
                >
                  {isQuerying ? 'Searching...' : 'Search'}
                </button>
              </div>
              {queryLatency > 0 && (
                <p className="text-xs text-gray-500 mt-2">
                  Found {queryResults.length} results in {queryLatency}ms
                </p>
              )}
            </div>

            {/* Results */}
            {queryResults.length > 0 && (
              <div className="space-y-4">
                {queryResults.map((result, i) => (
                  <div key={i} className="bg-[#1a1a1a] rounded-lg p-4 border border-gray-800">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <span className="text-blue-400 font-mono text-sm">{result.filePath}</span>
                        <span className="text-gray-500 text-sm">
                          lines {result.startLine}-{result.endLine}
                        </span>
                        {result.symbolName && (
                          <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded text-xs">
                            {result.symbolType}: {result.symbolName}
                          </span>
                        )}
                      </div>
                      <span className="text-green-400 font-medium">
                        {(result.score * 100).toFixed(1)}%
                      </span>
                    </div>
                    <pre className="bg-[#0a0a0a] p-3 rounded overflow-x-auto text-sm">
                      <code>{result.snippet.slice(0, 500)}{result.snippet.length > 500 ? '...' : ''}</code>
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Browser Tab */}
        {activeTab === 'browser' && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="bg-[#1a1a1a] rounded-lg p-4 border border-gray-800">
              <div className="flex flex-wrap gap-4 items-end">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-sm text-gray-400 mb-1">Search</label>
                  <input
                    type="text"
                    value={chunkFilter.search}
                    onChange={(e) => setChunkFilter(f => ({ ...f, search: e.target.value }))}
                    onKeyDown={(e) => e.key === 'Enter' && loadChunks(1)}
                    placeholder="Search content or file path..."
                    className="w-full px-3 py-2 bg-[#0a0a0a] border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="w-40">
                  <label className="block text-sm text-gray-400 mb-1">File Type</label>
                  <select
                    value={chunkFilter.fileType}
                    onChange={(e) => {
                      setChunkFilter(f => ({ ...f, fileType: e.target.value }));
                    }}
                    className="w-full px-3 py-2 bg-[#0a0a0a] border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                  >
                    <option value="">All Types</option>
                    <option value="ts">TypeScript</option>
                    <option value="tsx">TSX</option>
                    <option value="js">JavaScript</option>
                    <option value="jsx">JSX</option>
                    <option value="py">Python</option>
                    <option value="json">JSON</option>
                    <option value="md">Markdown</option>
                  </select>
                </div>
                <div className="w-40">
                  <label className="block text-sm text-gray-400 mb-1">Symbol Type</label>
                  <select
                    value={chunkFilter.symbolType}
                    onChange={(e) => {
                      setChunkFilter(f => ({ ...f, symbolType: e.target.value }));
                    }}
                    className="w-full px-3 py-2 bg-[#0a0a0a] border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                  >
                    <option value="">All Symbols</option>
                    <option value="function">Function</option>
                    <option value="class">Class</option>
                    <option value="interface">Interface</option>
                    <option value="type">Type</option>
                    <option value="variable">Variable</option>
                    <option value="import">Import</option>
                  </select>
                </div>
                <button
                  onClick={() => loadChunks(1)}
                  disabled={isLoadingChunks}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded font-medium"
                >
                  {isLoadingChunks ? 'Loading...' : 'Filter'}
                </button>
              </div>
            </div>

            {/* Stats */}
            <div className="text-sm text-gray-400">
              Showing {chunkBrowser.chunks.length} of {chunkBrowser.totalCount} chunks
              {chunkBrowser.totalPages > 1 && ` (Page ${chunkBrowser.page} of ${chunkBrowser.totalPages})`}
            </div>

            {/* Chunk List */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {isLoadingChunks ? (
                <div className="col-span-2 text-center py-8 text-gray-500">Loading chunks...</div>
              ) : chunkBrowser.chunks.length === 0 ? (
                <div className="col-span-2 bg-[#1a1a1a] rounded-lg p-6 border border-gray-800">
                  {stats?.totalVectors === 0 ? (
                    <div className="text-center text-gray-500">
                      <p className="text-lg mb-2">📂 No chunks indexed yet</p>
                      <p>Go to the Dashboard tab and click "Start Indexing" to index your project.</p>
                    </div>
                  ) : (
                    <div>
                      <h4 className="text-lg font-semibold mb-4">📊 Index Statistics</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-[#0a0a0a] p-4 rounded-lg">
                          <div className="text-2xl font-bold text-blue-400">{stats?.totalFiles || 0}</div>
                          <div className="text-sm text-gray-500">Files Indexed</div>
                        </div>
                        <div className="bg-[#0a0a0a] p-4 rounded-lg">
                          <div className="text-2xl font-bold text-green-400">{stats?.totalVectors || 0}</div>
                          <div className="text-sm text-gray-500">Vectors</div>
                        </div>
                        <div className="bg-[#0a0a0a] p-4 rounded-lg">
                          <div className="text-2xl font-bold text-purple-400">{stats?.dimensions || 0}</div>
                          <div className="text-sm text-gray-500">Dimensions</div>
                        </div>
                        <div className="bg-[#0a0a0a] p-4 rounded-lg">
                          <div className="text-2xl font-bold text-yellow-400">{formatBytes(stats?.storageSize || 0)}</div>
                          <div className="text-sm text-gray-500">Storage</div>
                        </div>
                      </div>
                      <p className="mt-4 text-gray-400">
                        Use the <strong>Query</strong> tab to search your indexed codebase with semantic search.
                      </p>
                      <p className="mt-2 text-sm text-gray-500">
                        The chunk browser requires re-indexing to populate (clear index and re-index).
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                chunkBrowser.chunks.map((chunk) => (
                  <div
                    key={chunk.id}
                    onClick={() => handleChunkClick(chunk)}
                    className={`bg-[#1a1a1a] rounded-lg p-4 border cursor-pointer transition-all hover:border-blue-500/50 ${
                      selectedChunk?.id === chunk.id ? 'border-blue-500' : 'border-gray-800'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-sm text-blue-400 truncate" title={chunk.filePath}>
                          {chunk.filePath}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <span className="text-xs text-gray-500">
                            Lines {chunk.startLine}-{chunk.endLine}
                          </span>
                          {chunk.symbolName && (
                            <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded text-xs">
                              {chunk.symbolType}: {chunk.symbolName}
                            </span>
                          )}
                          <span className="px-2 py-0.5 bg-gray-700 text-gray-400 rounded text-xs">
                            {chunk.language}
                          </span>
                          <span className="text-xs text-gray-600">
                            {chunk.tokens} tokens
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Preview */}
                    <div className="text-xs font-mono text-gray-400 mt-2 bg-[#0a0a0a] px-2 py-1 rounded line-clamp-2">
                      {chunk.preview}...
                    </div>
                    
                    {/* Expanded content */}
                    {selectedChunk?.id === chunk.id && chunk.content && (
                      <div className="mt-3 pt-3 border-t border-gray-700">
                        {chunk.signature && (
                          <div className="text-xs font-mono text-purple-400 mb-2 bg-purple-500/10 px-2 py-1 rounded">
                            {chunk.signature}
                          </div>
                        )}
                        <pre className="bg-[#0a0a0a] p-3 rounded overflow-x-auto text-xs max-h-96 overflow-y-auto">
                          <code>{chunk.content}</code>
                        </pre>
                      </div>
                    )}
                    
                    {/* Loading indicator */}
                    {selectedChunk?.id === chunk.id && !chunk.content && (
                      <div className="mt-3 pt-3 border-t border-gray-700 text-center text-gray-500 text-sm">
                        Loading content...
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Pagination */}
            {chunkBrowser.totalPages > 1 && (
              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={() => loadChunks(chunkBrowser.page - 1)}
                  disabled={chunkBrowser.page <= 1 || isLoadingChunks}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 rounded"
                >
                  ← Previous
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, chunkBrowser.totalPages) }, (_, i) => {
                    let pageNum;
                    if (chunkBrowser.totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (chunkBrowser.page <= 3) {
                      pageNum = i + 1;
                    } else if (chunkBrowser.page >= chunkBrowser.totalPages - 2) {
                      pageNum = chunkBrowser.totalPages - 4 + i;
                    } else {
                      pageNum = chunkBrowser.page - 2 + i;
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => loadChunks(pageNum)}
                        className={`w-10 h-10 rounded ${
                          pageNum === chunkBrowser.page
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-700 hover:bg-gray-600'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => loadChunks(chunkBrowser.page + 1)}
                  disabled={chunkBrowser.page >= chunkBrowser.totalPages || isLoadingChunks}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 rounded"
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Folder Picker Modal */}
      {showFolderPicker && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#1a1a1a] rounded-lg border border-gray-700 w-full max-w-2xl max-h-[80vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <h3 className="text-lg font-semibold">Select Project Folder</h3>
              <button
                onClick={() => setShowFolderPicker(false)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            
            {/* Quick Access */}
            <div className="flex gap-2 p-3 border-b border-gray-700 overflow-x-auto">
              {browseRoots.map((root, i) => (
                <button
                  key={i}
                  onClick={() => browseToFolder(root.path)}
                  className={`px-3 py-1.5 rounded text-sm whitespace-nowrap transition-colors ${
                    currentBrowsePath.startsWith(root.path)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {root.type === 'drive' ? '💿' : '📁'} {root.name}
                </button>
              ))}
            </div>
            
            {/* Current Path */}
            <div className="p-3 border-b border-gray-700 bg-[#0a0a0a]">
              <div className="flex items-center gap-2">
                {browseParent && (
                  <button
                    onClick={() => browseToFolder(browseParent)}
                    className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
                    title="Go up"
                  >
                    ⬆️
                  </button>
                )}
                <input
                  type="text"
                  value={currentBrowsePath}
                  onChange={(e) => setCurrentBrowsePath(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && browseToFolder(currentBrowsePath)}
                  className="flex-1 px-3 py-1.5 bg-transparent border border-gray-600 rounded text-sm font-mono focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={() => browseToFolder(currentBrowsePath)}
                  className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm"
                >
                  Go
                </button>
              </div>
              {browseIsProject && (
                <div className="mt-2 flex items-center gap-2 text-green-400 text-sm">
                  <span>✓</span>
                  <span>Project detected (has package.json, .git, etc.)</span>
                </div>
              )}
            </div>
            
            {/* Folder List */}
            <div className="flex-1 overflow-y-auto p-2 min-h-[300px]">
              {isLoadingFolder ? (
                <div className="flex items-center justify-center h-full text-gray-400">
                  Loading...
                </div>
              ) : browseFolders.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-500">
                  No subfolders
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {browseFolders.map((folder, i) => (
                    <button
                      key={i}
                      onClick={() => browseToFolder(folder.path)}
                      className="flex items-center gap-2 p-2 rounded hover:bg-gray-700 text-left transition-colors"
                      title={folder.path}
                    >
                      <span className="text-xl">📁</span>
                      <span className="truncate text-sm">{folder.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            {/* Modal Footer */}
            <div className="flex items-center justify-between p-4 border-t border-gray-700">
              <span className="text-sm text-gray-400 truncate max-w-md" title={currentBrowsePath}>
                {currentBrowsePath}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowFolderPicker(false)}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded"
                >
                  Cancel
                </button>
                <button
                  onClick={selectFolder}
                  disabled={!currentBrowsePath}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded font-medium"
                >
                  Select Folder
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RAG;
