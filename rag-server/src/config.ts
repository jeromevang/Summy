/**
 * RAG Server Configuration
 */

export interface RAGConfig {
  // Server settings
  port: number;
  wsPort: number;
  
  // LM Studio embedding config
  lmstudio: {
    model: string;           // Embedding model (e.g., nomic-embed-text-v1.5)
    chatModel?: string;      // Chat model for summaries (e.g., qwen/qwen3-4b)
    loadOnDemand: boolean;   // default: false - keep loaded for performance
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
    paths?: string[];         // specific subdirs to watch (e.g., ["server/src", "client/src"])
  };
  
  // Project settings
  project: {
    path: string | null;      // current project path
    autoDetect: boolean;      // default: true
  };
  
  // === HIERARCHICAL RAG SETTINGS ===
  
  // Summarization settings
  summarization: {
    enabled: boolean;              // Generate LLM summaries for chunks/files
    chunkSummaries: boolean;       // Summarize individual chunks
    fileSummaries: boolean;        // Aggregate chunk summaries into file summaries
    asyncGeneration: boolean;      // Generate summaries in background (non-blocking)
  };
  
  // Dependency graph settings
  dependencyGraph: {
    enabled: boolean;              // Build import/export dependency graph
    includeCallGraph: boolean;     // Track function call relationships (heavier)
  };
  
  // Query enhancement settings
  queryEnhancement: {
    enableHyde: boolean;           // HyDE: generate hypothetical code before search
    enableQueryExpansion: boolean; // Expand query with synonyms/related terms
    enableContextualChunks: boolean; // Embed metadata with code (file path, name, etc.)
    enableMultiVector: boolean;    // Store both code and summary embeddings
  };
  
  // Query routing settings
  queryRouting: {
    enabled: boolean;              // Auto-route queries to appropriate layer
    defaultStrategy: 'code' | 'summary' | 'hybrid' | 'auto';
  };
}

export const defaultConfig: RAGConfig = {
  port: 3002,
  wsPort: 3003,
  
  lmstudio: {
    model: '',
    chatModel: '',
    loadOnDemand: false  // Keep loaded for performance
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
  },
  
  // Hierarchical RAG defaults
  summarization: {
    enabled: true,
    chunkSummaries: true,
    fileSummaries: true,
    asyncGeneration: true  // Non-blocking by default
  },
  
  dependencyGraph: {
    enabled: true,
    includeCallGraph: false  // Heavier, off by default
  },
  
  queryEnhancement: {
    enableHyde: false,              // Optional: adds latency
    enableQueryExpansion: false,    // Optional: adds latency
    enableContextualChunks: true,   // Always on: zero cost, big benefit
    enableMultiVector: true         // Store both code + summary embeddings
  },
  
  queryRouting: {
    enabled: true,
    defaultStrategy: 'auto'
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

// Enriched chunk with summary (hierarchical RAG)
export interface EnrichedChunk extends CodeChunk {
  summary?: string;           // LLM-generated summary
  purpose?: string;           // What this code does (authentication, validation, etc.)
  summaryEmbedding?: number[]; // Separate embedding for summary
  contextualContent?: string; // Code + metadata for contextual embedding
}

// File summary (aggregated from chunks)
export interface FileSummary {
  filePath: string;
  summary: string;            // High-level description
  responsibility: string;     // Main purpose (e.g., "user authentication")
  exports: string[];          // Exported symbols
  imports: ImportInfo[];      // Import relationships
  chunkIds: string[];         // References to chunks in this file
  chunkCount: number;
  embedding?: number[];       // File-level embedding
  lastUpdated: string;
}

export interface ImportInfo {
  from: string;               // Import source (e.g., "./database", "express")
  names: string[];            // Imported names
  isExternal: boolean;        // Is it from node_modules?
}

// Dependency graph
export interface DependencyGraph {
  nodes: Map<string, DependencyNode>;
  edges: DependencyEdge[];
  lastBuilt: string;
}

export interface DependencyNode {
  filePath: string;
  imports: string[];          // Files this imports
  exports: string[];          // Exported symbols
  fileType: 'service' | 'route' | 'component' | 'util' | 'config' | 'test' | 'unknown';
}

export interface DependencyEdge {
  from: string;               // Source file
  to: string;                 // Target file
  type: 'imports' | 'calls' | 'extends' | 'implements';
  symbols: string[];          // Which symbols are used
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
