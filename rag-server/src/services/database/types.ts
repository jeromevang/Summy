import { SymbolType } from '@summy/shared';

export interface StoredChunk {
  id: string;
  filePath: string;
  vectorId: number;
  content: string;
  contentHash: string;
  tokens: number;
  startLine: number;
  endLine: number;
  symbolName: string | null;
  symbolType: string | null;
  language: string;
  imports: string[];
  signature: string | null;
  summary: string | null;
  purpose: string | null;
  createdAt: string;
}

export interface FileSummary {
  filePath: string;
  summary: string;
  responsibility: string;
  exports: string[];
  imports: { from: string; names: string[]; isExternal: boolean }[];
  chunkIds: string[];
  chunkCount: number;
  lastUpdated: string;
}

export interface ChunkProjection {
  chunkId: string;
  x: number;
  y: number;
  computedAt: string;
}

export interface IndexMetric {
  id?: number;
  type: string;
  filesProcessed: number;
  chunksCreated: number;
  embeddingsGenerated: number;
  durationMs: number;
  timestamp?: string;
}

export interface IndexStatus {
  id: string;
  projectPath: string;
  projectHash: string;
  embeddingModel: string;
  embeddingDimensions: number;
  status: 'idle' | 'indexing' | 'ready' | 'error';
  totalFiles: number;
  totalChunks: number;
  totalVectors: number;
  storageSize: number;
  lastIndexed: string | null;
  createdAt: string;
}

export type RelationType = 
  | 'imports' | 'exports' | 'calls' | 'extends' | 'implements'
  | 'uses' | 'defines' | 'contains' | 'references' | 'depends_on';

export interface CodeModule {
  id: string;
  name: string;
  path: string;
  parentPath: string | null;
  fileCount: number;
  totalLines: number;
  mainLanguage: string | null;
  description: string | null;
  createdAt: string;
}

export interface CodeSymbol {
  id: string;
  name: string;
  qualifiedName: string | null;
  type: SymbolType;
  filePath: string;
  startLine: number;
  endLine: number;
  signature: string | null;
  docComment: string | null;
  visibility: 'public' | 'private' | 'protected' | 'internal';
  isExported: boolean;
  isAsync: boolean;
  isStatic: boolean;
  parentSymbolId: string | null;
  chunkId: string | null;
  language: string | null;
  createdAt: string;
}

export interface CodeRelationship {
  id: number;
  sourceType: 'file' | 'symbol' | 'module';
  sourceId: string;
  targetType: 'file' | 'symbol' | 'module';
  targetId: string;
  relationType: RelationType;
  metadata: Record<string, any> | null;
  createdAt: string;
}

export interface FileDependency {
  id: number;
  fromFile: string;
  toFile: string;
  importType: 'import' | 'require' | 'dynamic';
  importedSymbols: string[];
  isExternal: boolean;
  createdAt: string;
}
