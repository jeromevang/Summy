/**
 * RAG Server Configuration
 */

export interface RAGConfig {
  // Server settings
  port: number;
  wsPort: number;
  
  // LM Studio embedding config
  lmstudio: {
    model: string;      // selected from dropdown (e.g., nomic-embed-text-v1.5)
    loadOnDemand: boolean;  // default: true - load when needed, unload after
  };
  
  // HNSWLib storage config
  storage: {
    dataPath: string;   // default: ./data/indices
  };
  
  // Indexing settings
  indexing: {
    chunkSize: number;        // default: 1000 tokens
    chunkOverlap: number;     // default: 50 tokens
    includePatterns: string[]; // default: ["**/*.ts", "**/*.js", etc.]
    excludePatterns: string[]; // default: ["node_modules", ".git", etc.]
  };
  
  // File watcher settings
  watcher: {
    enabled: boolean;         // default: true
    debounceMs: number;       // default: 2000ms
  };
  
  // Project settings
  project: {
    path: string | null;      // current project path
    autoDetect: boolean;      // default: true
  };
}

export const defaultConfig: RAGConfig = {
  port: 3002,
  wsPort: 3003,
  
  lmstudio: {
    model: '',
    loadOnDemand: true
  },
  
  storage: {
    dataPath: './data/indices'
  },
  
  indexing: {
    chunkSize: 1000,
    chunkOverlap: 50,
    includePatterns: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.js',
      '**/*.jsx',
      '**/*.py',
      '**/*.go',
      '**/*.rs',
      '**/*.java',
      '**/*.c',
      '**/*.cpp',
      '**/*.h',
      '**/*.hpp',
      '**/*.cs',
      '**/*.rb',
      '**/*.php',
      '**/*.swift',
      '**/*.kt',
      '**/*.scala',
      '**/*.vue',
      '**/*.svelte'
    ],
    excludePatterns: [
      '**/node_modules/**',
      '**/.git/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/coverage/**',
      '**/__pycache__/**',
      '**/venv/**',
      '**/.venv/**',
      '**/target/**',
      '**/vendor/**'
    ]
  },
  
  watcher: {
    enabled: true,
    debounceMs: 2000
  },
  
  project: {
    path: null,
    autoDetect: true
  }
};

// Indexing progress interface
export interface IndexProgress {
  status: 'idle' | 'scanning' | 'chunking' | 'embedding' | 'storing' | 'complete' | 'error';
  totalFiles: number;
  processedFiles: number;
  currentFile: string;
  chunksCreated: number;
  embeddingsGenerated: number;
  eta: number; // seconds
  error?: string;
}

// RAG query result interface
export interface RAGResult {
  filePath: string;
  startLine: number;
  endLine: number;
  snippet: string;
  symbolName: string | null;
  symbolType: string | null;
  language: string;
  score: number;
}

// Chunk metadata interface
export interface CodeChunk {
  id: string;
  content: string;
  type: 'function' | 'class' | 'method' | 'module' | 'block';
  name: string;
  filePath: string;
  startLine: number;
  endLine: number;
  language: string;
  imports: string[];
  signature?: string;
  tokens: number;
}

// Chunk visualization interface (for 2D scatter plot)
export interface ChunkVisualization {
  id: string;
  x: number;
  y: number;
  filePath: string;
  symbolName: string;
  symbolType: string;
  language: string;
}

// RAG metrics interface
export interface RAGMetrics {
  indexingHistory: {
    timestamp: Date;
    filesProcessed: number;
    chunksCreated: number;
    duration: number;
  }[];
  
  queryHistory: {
    timestamp: Date;
    query: string;
    latency: number;
    resultsCount: number;
    topScore: number;
  }[];
  
  embeddingStats: {
    totalEmbeddings: number;
    avgGenerationTime: number;
    modelLoaded: boolean;
    modelName: string;
  };
}
