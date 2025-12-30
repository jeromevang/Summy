export interface ChunkMetadata {
  content?: string;
  filePath?: string;
  startLine?: number;
  endLine?: number;
  symbolName?: string;
  symbolType?: string;
  language?: string;
  signature?: string;
  summary?: string;
  purpose?: string;
  isSummaryVector?: boolean;
  originalChunkId?: string;
}

export interface VectorRecord {
  [key: string]: unknown;
  id: number;
  chunk_id: string;
  vector: number[];
  content: string;
  file_path: string;
  start_line: number;
  end_line: number;
  symbol_name: string;
  symbol_type: string;
  language: string;
  signature: string;
  summary: string;
  purpose: string;
  is_summary_vector: boolean;
  original_chunk_id: string;
}
