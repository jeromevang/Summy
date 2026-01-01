import { useState, useEffect, useCallback } from 'react';

// Define types for RAG data
interface SearchResult {
  filePath: string;
  snippet: string;
  relevance: number;
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
}

export const useRag = (): UseRag => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [ragStatus, setRagStatus] = useState<RagStatus>('uninitialized');
  const [isIndexing, setIsIndexing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Simulate RAG server API calls
  const fetchRagStatus = useCallback(async () => {
    // In a real scenario, this would fetch from http://localhost:3002/status or /api/rag/status
    await new Promise(resolve => setTimeout(resolve, 500)); // Simulate network delay
    setRagStatus(Math.random() > 0.1 ? 'indexed' : 'error'); // 90% chance of success
  }, []);

  const performSearch = useCallback(async (query: string) => {
    if (!query) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    setError(null);
    try {
      // In a real scenario, this would fetch from http://localhost:3002/query or /api/rag/query
      await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate network delay
      if (Math.random() > 0.2) { // 80% chance of success
        setSearchResults([
          { filePath: 'src/services/authService.ts', snippet: 'export async function verifyToken(token: string): Promise<boolean> { ... }', relevance: 0.95 },
          { filePath: 'src/middleware/authMiddleware.ts', snippet: 'if (!req.headers.authorization) { ... }', relevance: 0.88 },
          { filePath: 'docs/authentication.md', snippet: '## Authentication Flow\n1. User logs in...\n', relevance: 0.72 },
        ]);
      } else {
        throw new Error('RAG search failed');
      }
    } catch (err: any) {
      setError(err.message);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const triggerIndex = useCallback(async () => {
    setIsIndexing(true);
    setError(null);
    setRagStatus('indexing');
    try {
      // In a real scenario, this would POST to http://localhost:3002/index or /api/rag/index
      await new Promise(resolve => setTimeout(resolve, 3000)); // Simulate indexing time
      if (Math.random() > 0.1) { // 90% chance of success
        setRagStatus('indexed');
      } else {
        throw new Error('Indexing failed');
      }
    } catch (err: any) {
      setError(err.message);
      setRagStatus('error');
    } finally {
      setIsIndexing(false);
    }
  }, []);

  // Initial load of RAG status
  useEffect(() => {
    fetchRagStatus();
    // Refresh status periodically
    const interval = setInterval(fetchRagStatus, 10000); 
    return () => clearInterval(interval);
  }, [fetchRagStatus]);

  // Perform search when query changes (with debounce in real app)
  useEffect(() => {
    const handler = setTimeout(() => {
      performSearch(searchQuery);
    }, 500); // Debounce search
    return () => {
      clearTimeout(handler);
    };
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
  };
};