import { Database } from 'better-sqlite3';
import { CodeSymbol } from './types.js';
import { SymbolType } from '@summy/shared';

export class SymbolRepository {
  constructor(private db: Database) {}

  addSymbol(symbol: Omit<CodeSymbol, 'createdAt'>): void {
    this.db.prepare(`
      INSERT INTO symbols 
      (id, name, qualified_name, type, file_path, start_line, end_line, signature, doc_comment,
       visibility, is_exported, is_async, is_static, parent_symbol_id, chunk_id, language)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name, qualified_name = excluded.qualified_name, type = excluded.type,
        file_path = excluded.file_path, start_line = excluded.start_line, end_line = excluded.end_line,
        signature = excluded.signature, doc_comment = excluded.doc_comment, visibility = excluded.visibility,
        is_exported = excluded.is_exported, is_async = excluded.is_async, is_static = excluded.is_static,
        parent_symbol_id = excluded.parent_symbol_id, chunk_id = excluded.chunk_id, language = excluded.language
    `).run(symbol.id, symbol.name, symbol.qualifiedName, symbol.type, symbol.filePath, symbol.startLine, symbol.endLine, symbol.signature, symbol.docComment, symbol.visibility, symbol.isExported ? 1 : 0, symbol.isAsync ? 1 : 0, symbol.isStatic ? 1 : 0, symbol.parentSymbolId, symbol.chunkId, symbol.language);
  }

  getSymbol(id: string): CodeSymbol | null {
    const row = this.db.prepare('SELECT * FROM symbols WHERE id = ?').get(id) as any;
    return row ? this.rowToSymbol(row) : null;
  }

  searchSymbols(query: string, options?: { type?: SymbolType; exported?: boolean; limit?: number }): CodeSymbol[] {
    let sql = 'SELECT * FROM symbols WHERE name LIKE ?';
    const params: any[] = [`%${query}%`];
    if (options?.type) { sql += ' AND type = ?'; params.push(options.type); }
    if (options?.exported !== undefined) { sql += ' AND is_exported = ?'; params.push(options.exported ? 1 : 0); }
    sql += ' ORDER BY name';
    if (options?.limit) { sql += ` LIMIT ${options.limit}`; }
    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map(r => this.rowToSymbol(r));
  }

  private rowToSymbol(row: any): CodeSymbol {
    return { id: row.id, name: row.name, qualifiedName: row.qualified_name, type: row.type, filePath: row.file_path, startLine: row.start_line, endLine: row.end_line, signature: row.signature, docComment: row.doc_comment, visibility: row.visibility || 'public', isExported: row.is_exported === 1, isAsync: row.is_async === 1, isStatic: row.is_static === 1, parentSymbolId: row.parent_symbol_id, chunkId: row.chunk_id, language: row.language, createdAt: row.created_at };
  }
}
