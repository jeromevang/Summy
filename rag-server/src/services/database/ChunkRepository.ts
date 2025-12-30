import { Database } from 'better-sqlite3';
import { StoredChunk } from './types.js';

export class ChunkRepository {
  constructor(private db: Database) {}

  addChunk(chunk: StoredChunk): void {
    this.db.prepare(`
      INSERT INTO chunks 
      (id, file_path, vector_id, content, content_hash, tokens, start_line, end_line, 
       symbol_name, symbol_type, language, imports, signature, summary, purpose, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        file_path = excluded.file_path,
        vector_id = excluded.vector_id,
        content = excluded.content,
        content_hash = excluded.content_hash,
        tokens = excluded.tokens,
        start_line = excluded.start_line,
        end_line = excluded.end_line,
        symbol_name = excluded.symbol_name,
        symbol_type = excluded.symbol_type,
        language = excluded.language,
        imports = excluded.imports,
        signature = excluded.signature,
        summary = excluded.summary,
        purpose = excluded.purpose
    `).run(chunk.id, chunk.filePath, chunk.vectorId, chunk.content, chunk.contentHash, chunk.tokens, chunk.startLine, chunk.endLine, chunk.symbolName, chunk.symbolType, chunk.language, JSON.stringify(chunk.imports || []), chunk.signature, chunk.summary, chunk.purpose, chunk.createdAt);
  }

  getChunk(id: string): StoredChunk | null {
    const row = this.db.prepare('SELECT * FROM chunks WHERE id = ?').get(id) as any;
    return row ? this.rowToChunk(row) : null;
  }

  getChunksByFile(filePath: string): StoredChunk[] {
    const rows = this.db.prepare('SELECT * FROM chunks WHERE file_path = ? ORDER BY start_line').all(filePath) as any[];
    return rows.map(r => this.rowToChunk(r));
  }

  getChunkCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM chunks').get() as any;
    return row?.count || 0;
  }

  private rowToChunk(row: any): StoredChunk {
    return {
      id: row.id, filePath: row.file_path, vectorId: row.vector_id, content: row.content,
      contentHash: row.content_hash, tokens: row.tokens, startLine: row.start_line,
      endLine: row.end_line, symbolName: row.symbol_name, symbolType: row.symbol_type,
      language: row.language, imports: JSON.parse(row.imports || '[]'),
      signature: row.signature, summary: row.summary, purpose: row.purpose, createdAt: row.created_at
    };
  }
}
