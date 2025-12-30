/**
 * LanceDB Vector Store Module
 */

export * from './lancedb/index.js';
import { LanceDBStore } from './lancedb/LanceDBManager.js';

export { LanceDBStore };

let store: LanceDBStore | null = null;
export function getLanceDBStore(dbPath?: string): LanceDBStore {
  if (!store) store = new LanceDBStore(dbPath);
  return store;
}