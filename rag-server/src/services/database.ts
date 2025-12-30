/**
 * RAG Server Database Module
 */

export * from './database/index.js';
import { getRAGDatabase } from './database/DatabaseManager.js';

export { getRAGDatabase };
export default getRAGDatabase;