import { useState, useEffect, useCallback } from 'react';

// Define types for RAG data
interface SearchResult {
  filePath: string;
  snippet: string;
  relevance: number;
  score?: number; // API returns 'score' but we map to 'relevance'
}

interface RAGStats {
  projectPath: string | null;
  status: string;
  totalFiles: number;
  processedFiles: number;
  chunksCreated: number;
  embeddingsGenerated: number;
  fileWatcherActive: boolean;
  embeddingModel: string;
  embeddingModelLoaded: boolean;
}

interface EmbeddingModel {
  id: string;
  name: string;
  path: string;
  loaded: boolean;
  size?: number;
}

interface RAGConfig {
  port?: number;
  embedder?: {
    type: string;
    apiKey?: string;
  };
  lmstudio?: {
    model: string;
    chatModel?: string;
    loadOnDemand?: boolean;
    keepLoaded?: boolean;
  };
  project?: {
    path: string;
  };
}

type RagStatus = 'uninitialized' | 'indexing' | 'indexed' | 'error';

interface UseRag {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchResults: SearchResult[];
  isSearching: boolean;
  ragStatus: RagStatus;
  isIndexing: boolean;
  triggerIndex: () => void;
  error: string | null;
  stats: RAGStats | null;
  availableModels: EmbeddingModel[];
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  loadModel: () => Promise<void>;
  isLoadingModel: boolean;
  ragConfig: RAGConfig | null;
  updateConfig: (config: Partial<RAGConfig>) => Promise<void>;
}

const API_BASE = '/api/rag';

export const useRag = (): UseRag => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [ragStatus, setRagStatus] = useState<RagStatus>('uninitialized');
  const [isIndexing, setIsIndexing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<RAGStats | null>(null);
  const [availableModels, setAvailableModels] = useState<EmbeddingModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [isLoadingModel, setIsLoadingModel] = useState<boolean>(false);
  const [ragConfig, setRagConfig] = useState<RAGConfig | null>(null);

  // Fetch RAG status and stats
  const fetchRagStatus = useCallback(async () => {
    console.log('[useRAG] Fetching RAG status from', `${API_BASE}/stats`);
    try {
      const response = await fetch(`${API_BASE}/stats`);
      console.log('[useRAG] Stats fetch response status:', response.status);

      if (!response.ok) {
        throw new Error('Failed to fetch RAG stats');
      }

      const data: RAGStats = await response.json();
      console.log('[useRAG] Received stats:', data);
      setStats(data);

      // Determine status based on stats
      if (data.status === 'indexing') {
        setRagStatus('indexing');
      } else if (data.totalFiles > 0 && data.embeddingsGenerated > 0) {
        setRagStatus('indexed');
      } else if (data.status === 'error') {
        setRagStatus('error');
      } else {
        setRagStatus('uninitialized');
      }

      console.log('[useRAG] Updated RAG status to:', ragStatus);
    } catch (err: any) {
      console.error('[useRAG] Failed to fetch RAG status:', err);
      setRagStatus('error');
      setError(err.message);
    }
  }, []);

  // Fetch available embedding models
  const fetchAvailableModels = useCallback(async () => {
    console.log('[useRAG] Fetching available models from', `${API_BASE}/models`);
    try {
      const response = await fetch(`${API_BASE}/models`);
      console.log('[useRAG] Models fetch response status:', response.status);

      if (!response.ok) {
        throw new Error('Failed to fetch models');
      }

      const models: EmbeddingModel[] = await response.json();
      console.log('[useRAG] Received models:', models);
      setAvailableModels(models);

      // Auto-select first model if none selected
      if (models.length > 0 && !selectedModel) {
        console.log('[useRAG] Auto-selecting first model:', models[0].path);
        setSelectedModel(models[0].path);
      }
    } catch (err: any) {
      console.error('[useRAG] Failed to fetch models:', err);
    }
  }, [selectedModel]);

  // Fetch RAG configuration
  const fetchConfig = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/config`);
      if (!response.ok) {
        throw new Error('Failed to fetch config');
      }
      const config: RAGConfig = await response.json();
      setRagConfig(config);

      // Set selected model from config
      if (config.lmstudio?.model) {
        setSelectedModel(config.lmstudio.model);
      }
    } catch (err: any) {
      console.error('Failed to fetch config:', err);
    }
  }, []);

  // Update RAG configuration
  const updateConfig = useCallback(async (configUpdate: Partial<RAGConfig>) => {
    try {
      const response = await fetch(`${API_BASE}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configUpdate)
      });

      if (!response.ok) {
        throw new Error('Failed to update config');
      }

      await fetchConfig();
    } catch (err: any) {
      console.error('Failed to update config:', err);
      setError(err.message);
      throw err;
    }
  }, [fetchConfig]);

  // Load selected embedding model
  const loadModel = useCallback(async () => {
    if (!selectedModel) {
      setError('No model selected');
      return;
    }

    setIsLoadingModel(true);
    setError(null);

    try {
      // Update config with selected model
      await updateConfig({
        embedder: { type: 'lmstudio' },
        lmstudio: {
          model: selectedModel,
          loadOnDemand: false,
          keepLoaded: true
        }
      });

      // Wait a moment for model to load
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Refresh status
      await fetchRagStatus();
    } catch (err: any) {
      setError(`Failed to load model: ${err.message}`);
    } finally {
      setIsLoadingModel(false);
    }
  }, [selectedModel, updateConfig, fetchRagStatus]);

  // Perform semantic search
  const performSearch = useCallback(async (query: string) => {
    if (!query || query.trim().length === 0) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, limit: 10 })
      });

      if (!response.ok) {
        throw new Error('Search failed');
      }

      const data = await response.json();

      // Map API response to expected format
      const results: SearchResult[] = (data.results || []).map((r: any) => ({
        filePath: r.filePath,
        snippet: r.snippet || r.content || '',
        relevance: r.score || 0
      }));

      setSearchResults(results);
    } catch (err: any) {
      console.error('Search failed:', err);
      setError(err.message);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Trigger indexing
  const triggerIndex = useCallback(async () => {
    setIsIndexing(true);
    setError(null);
    setRagStatus('indexing');

    try {
      // Get current project path from config or use default
      const projectPath = ragConfig?.project?.path || process.cwd();

      const response = await fetch(`${API_BASE}/index`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath })
      });

      if (!response.ok) {
        throw new Error('Failed to start indexing');
      }

      // Poll for indexing completion
      const pollInterval = setInterval(async () => {
        await fetchRagStatus();

        if (stats?.status !== 'indexing') {
          clearInterval(pollInterval);
          setIsIndexing(false);
        }
      }, 2000);

      // Stop polling after 5 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
        setIsIndexing(false);
      }, 300000);

    } catch (err: any) {
      console.error('Indexing failed:', err);
      setError(err.message);
      setRagStatus('error');
      setIsIndexing(false);
    }
  }, [ragConfig, fetchRagStatus, stats]);

  // Initial setup
  useEffect(() => {
    console.log('[useRAG] Component mounted, initializing...');
    fetchRagStatus();
    fetchAvailableModels();
    fetchConfig();

    // Refresh status periodically
    const interval = setInterval(fetchRagStatus, 10000);
    return () => {
      console.log('[useRAG] Component unmounting, cleaning up...');
      clearInterval(interval);
    };
  }, [fetchRagStatus, fetchAvailableModels, fetchConfig]);

  // Perform search when query changes (with debounce)
  useEffect(() => {
    const handler = setTimeout(() => {
      performSearch(searchQuery);
    }, 500);

    return () => clearTimeout(handler);
  }, [searchQuery, performSearch]);

  return {
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
    ragConfig,
    updateConfig,
  };
};
