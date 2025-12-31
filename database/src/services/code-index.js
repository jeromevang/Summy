import { db } from './database.js';
export class CodeIndexService {
    getConnection() {
        return db.getConnection();
    }
    /**
     * Search for symbols across the codebase
     */
    async searchSymbols(query, type) {
        let sql = 'SELECT * FROM code_chunks WHERE symbol_name LIKE ?';
        const params = [`%${query}%`];
        if (type) {
            sql += ' AND symbol_type = ?';
            params.push(type);
        }
        return this.getConnection().prepare(sql).all(...params);
    }
    async getChunk(id) {
        return this.getConnection().prepare('SELECT * FROM code_chunks WHERE id = ?').get(id);
    }
    async getFileChunks(filePath) {
        return this.getConnection().prepare('SELECT * FROM code_chunks WHERE file_path = ? ORDER BY start_line').all(filePath);
    }
    /**
     * Get upstream dependencies (who calls me?)
     */
    async getCallers(chunkId) {
        const sql = `
      SELECT c.* 
      FROM code_dependencies d
      JOIN code_chunks c ON d.source_chunk_id = c.id
      WHERE d.target_chunk_id = ?
    `;
        return this.getConnection().prepare(sql).all(chunkId);
    }
    /**
     * Get downstream dependencies (who do I call?)
     */
    async getCallees(chunkId) {
        const sql = `
      SELECT c.* 
      FROM code_dependencies d
      JOIN code_chunks c ON d.target_chunk_id = c.id
      WHERE d.source_chunk_id = ?
    `;
        return this.getConnection().prepare(sql).all(chunkId);
    }
}
export const codeIndexService = new CodeIndexService();
//# sourceMappingURL=code-index.js.map