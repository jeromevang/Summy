export interface RAGConfig {
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
    paths?: string[];
  };
  project: {
    path: string | null;
    autoDetect: boolean;
  };
  summarization?: {
    enabled: boolean;
    chunkSummaries: boolean;
    fileSummaries: boolean;
    asyncGeneration: boolean;
    model?: string;
    maxTokens?: number;
  };
  dependencyGraph?: {
    enabled: boolean;
  };
  queryEnhancement?: {
    enableHyde: boolean;
    enableQueryExpansion: boolean;
    enableContextualChunks: boolean;
    enableMultiVector: boolean;
  };
  queryRouting?: {
    enabled: boolean;
    defaultStrategy?: string;
  };
}

export interface RAGStats {
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

export interface IndexProgress {
  status: string;
  totalFiles: number;
  processedFiles: number;
  currentFile: string;
  chunksCreated: number;
  embeddingsGenerated: number;
  eta: number;
  error?: string;
}

export interface EmbeddingModel {
  id: string;
  name: string;
  path?: string;
  loaded?: boolean;
  size?: number;
}

export interface QueryResult {
  filePath: string;
  startLine: number;
  endLine: number;
  snippet: string;
  symbolName: string | null;
  symbolType: string | null;
  language: string;
  score: number;
}

export interface ChunkInfo {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  symbolName: string | null;
  symbolType: string | null;
  language: string;
  tokens: number;
  preview: string;
  content?: string;
  signature?: string | null;
}

export interface ChunkBrowserState {
  chunks: ChunkInfo[];
  totalCount: number;
  page: number;
  totalPages: number;
}

export interface FolderEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

export interface BrowseRoot {
  path: string;
  name: string;
  type: 'drive' | 'folder';
}

export interface BrowseResult {
  path: string;
  parent: string | null;
  folders: FolderEntry[];
  isProject: boolean;
}

export type TabId = 'dashboard' | 'settings' | 'query' | 'browser';
