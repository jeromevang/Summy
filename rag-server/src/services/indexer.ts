/**
 * RAG Server Indexer Module
 */

export * from './indexer/index.js';
import { Indexer } from './indexer/RAGIndexer.js';

export { Indexer };

let indexerInstance: Indexer | null = null;

export function getIndexer(config?: any): Indexer {
  if (!indexerInstance) {
    indexerInstance = new Indexer(config);
  } else if (config) {
    // Update existing instance config
    (indexerInstance as any).updateConfig?.(config);
  }
  return indexerInstance;
}

export default Indexer;