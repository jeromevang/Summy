import { db } from './database.js';
import { SemanticUnit } from '../analysis/ast-parser.js';

export class CodeIndexService {
  /**
   * Search for symbols across the codebase
   */
  async searchSymbols(query: string, type?: string) {
    const connection = db.getConnection();
    let sql = 'SELECT * FROM code_chunks WHERE symbol_name LIKE ?';
    const params: any[] = [`%${query}%`];

    if (type) {
      sql += ' AND symbol_type = ?';
      params.push(type);
    }

    return connection.prepare(sql).all(...params);
  }

  /**
   * Get file metadata
   */
  async getFileInfo(filePath: string) {
    const connection = db.getConnection();
    return connection.prepare('SELECT * FROM code_index WHERE file_path = ?').get(filePath);
  }

  /**
   * Get all chunks for a file
   */
  async getFileChunks(filePath: string) {
    const connection = db.getConnection();
    return connection.prepare('SELECT * FROM code_chunks WHERE file_path = ? ORDER BY start_line').all(filePath);
  }

  /**
   * Record a dependency
   */
  async addDependency(sourceId: string, targetId: string, type: string) {
    const connection = db.getConnection();
    return connection.prepare(`
      INSERT INTO code_dependencies (source_chunk_id, target_chunk_id, dependency_type)
      VALUES (?, ?, ?)
    `).run(sourceId, targetId, type);
  }
}

export const codeIndexService = new CodeIndexService();
