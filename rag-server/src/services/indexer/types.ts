import { IndexProgress } from '../../config.js';

export type ProgressCallback = (progress: IndexProgress) => void;

export interface StoredChunk {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  symbolName: string | null;
  symbolType: string | null;
  language: string;
  tokens: number;
  content: string;
  signature: string | null;
  createdAt: string;
  summary?: string;
  purpose?: string;
}
