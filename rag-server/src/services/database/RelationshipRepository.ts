import { Database } from 'better-sqlite3';
import { CodeRelationship, FileDependency, RelationType } from './types.js';

export class RelationshipRepository {
  constructor(private db: Database) {}

  addRelationship(rel: Omit<CodeRelationship, 'id' | 'createdAt'>): number {
    const res = this.db.prepare(`INSERT INTO relationships (source_type, source_id, target_type, target_id, relation_type, metadata) VALUES (?, ?, ?, ?, ?, ?)`).run(rel.sourceType, rel.sourceId, rel.targetType, rel.targetId, rel.relationType, rel.metadata ? JSON.stringify(rel.metadata) : null);
    return Number(res.lastInsertRowid);
  }

  getRelationshipsFrom(sourceType: string, sourceId: string): CodeRelationship[] {
    const rows = this.db.prepare('SELECT * FROM relationships WHERE source_type = ? AND source_id = ?').all(sourceType, sourceId) as any[];
    return rows.map(r => this.rowToRelationship(r));
  }

  addFileDependency(dep: Omit<FileDependency, 'id' | 'createdAt'>): void {
    this.db.prepare(`INSERT INTO file_dependencies (from_file, to_file, import_type, imported_symbols, is_external) VALUES (?, ?, ?, ?, ?) ON CONFLICT(from_file, to_file) DO UPDATE SET import_type = excluded.import_type, imported_symbols = excluded.imported_symbols, is_external = excluded.is_external`).run(dep.fromFile, dep.toFile, dep.importType, JSON.stringify(dep.importedSymbols), dep.isExternal ? 1 : 0);
  }

  private rowToRelationship(row: any): CodeRelationship {
    return { id: row.id, sourceType: row.source_type, sourceId: row.source_id, targetType: row.target_type, targetId: row.target_id, relationType: row.relation_type, metadata: row.metadata ? JSON.parse(row.metadata) : null, createdAt: row.created_at };
  }
}
