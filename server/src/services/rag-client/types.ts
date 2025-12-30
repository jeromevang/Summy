export interface RAGConfig {
  lmstudio: { model: string; loadOnDemand: boolean };
  storage: { dataPath: string };
  indexing: { chunkSize: number; chunkOverlap: number; includePatterns: string[]; excludePatterns: string[] };
  watcher: { enabled: boolean; debounceMs: number };
  project: { path: string | null; autoDetect: boolean };
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

export interface RAGQueryResult {
  filePath: string;
  startLine: number;
  endLine: number;
  snippet: string;
  symbolName: string | null;
  symbolType: string | null;
  language: string;
  score: number;
}
