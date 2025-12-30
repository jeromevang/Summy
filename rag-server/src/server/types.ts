import { RAGConfig, IndexProgress } from '../config.js';

export interface ServerStats {
  projectPath: string;
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
