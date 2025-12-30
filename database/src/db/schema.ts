import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * File metadata - mapping to code_index table in Phase 1.3
 */
export const codeIndex = sqliteTable('code_index', {
  filePath: text('file_path').primaryKey(),
  scope: text('scope').notNull(),
  exports: text('exports'), // JSON string of exported symbols
  inputs: text('inputs'),   // JSON string of inputs
  outputs: text('outputs'),  // JSON string of outputs
  libraries: text('libraries'), // JSON string of used libraries
  category: text('category'),
  tags: text('tags'),
  complexity: text('complexity'),
  linesCount: integer('lines_count'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
});

/**
 * Function-level chunks - mapping to code_chunks table in Phase 1.3
 */
export const codeChunks = sqliteTable('code_chunks', {
  id: text('id').primaryKey(),
  filePath: text('file_path').notNull().references(() => codeIndex.filePath),
  symbolName: text('symbol_name').notNull(),
  symbolType: text('symbol_type').notNull(), // 'function', 'class', 'component'
  inputs: text('inputs'),                    // JSON array of parameters
  outputs: text('outputs'),                  // Return type/description
  startLine: integer('start_line'),
  endLine: integer('end_line'),
  dependencies: text('dependencies'),        // JSON array of called functions
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
}, (table) => ({
  filePathIdx: index('idx_code_chunks_file_path').on(table.filePath),
}));

/**
 * Dependency relationships - mapping to code_dependencies table in Phase 1.3
 */
export const codeDependencies = sqliteTable('code_dependencies', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sourceChunkId: text('source_chunk_id').references(() => codeChunks.id),
  targetChunkId: text('target_chunk_id').references(() => codeChunks.id),
  dependencyType: text('dependency_type').notNull(), // 'calls', 'imports', 'extends'
  metadata: text('metadata'),                        // Additional context
}, (table) => ({
  sourceIdx: index('idx_code_deps_source').on(table.sourceChunkId),
  targetIdx: index('idx_code_deps_target').on(table.targetChunkId),
}));