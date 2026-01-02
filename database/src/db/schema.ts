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

/**
 * Teams - Squad configurations with Main Architect + Executor + Specialists
 */
export const teams = sqliteTable('teams', {
  id: text('id').primaryKey(),
  projectHash: text('project_hash').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  mainArchitect: text('main_architect', { mode: 'json' }).notNull(), // { modelId, provider, role, systemPrompt }
  executor: text('executor', { mode: 'json' }), // { modelId, provider, role, systemPrompt }
  specialists: text('specialists', { mode: 'json' }).default('[]'), // Array of specialist configs
  isActive: integer('is_active', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`)
}, (table) => ({
  projectHashIdx: index('idx_teams_project_hash').on(table.projectHash),
  activeIdx: index('idx_teams_active').on(table.isActive),
}));

/**
 * Prosthetics - Coordination prompts for model pairs
 */
export const prosthetics = sqliteTable('prosthetics', {
  id: text('id').primaryKey(),
  projectHash: text('project_hash').notNull(),
  name: text('name').notNull(),
  type: text('type').notNull(), // 'combo', 'manual', 'auto'
  prompt: text('prompt').notNull(),
  modelPair: text('model_pair', { mode: 'json' }), // { main: modelId, executor: modelId }
  tags: text('tags', { mode: 'json' }).default('[]'),
  effectiveness: integer('effectiveness'), // 0-100 score
  applicationsCount: integer('applications_count').default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(strftime('%s', 'now'))`)
}, (table) => ({
  projectHashIdx: index('idx_prosthetics_project_hash').on(table.projectHash),
  typeIdx: index('idx_prosthetics_type').on(table.type),
}));

/**
 * Failures - Logged failures for learning and pattern detection
 */
export const failures = sqliteTable('failures', {
  id: text('id').primaryKey(),
  projectHash: text('project_hash').notNull(),
  modelId: text('model_id').notNull(),
  category: text('category').notNull(), // 'tool_execution', 'logic', 'syntax', 'timeout', etc.
  description: text('description').notNull(),
  context: text('context'), // What the user was trying to do
  errorMessage: text('error_message'),
  stackTrace: text('stack_trace'),
  resolved: integer('resolved', { mode: 'boolean' }).default(false),
  solution: text('solution'),
  prostheticGenerated: integer('prosthetic_generated', { mode: 'boolean' }).default(false),
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull().default(sql`(strftime('%s', 'now'))`)
}, (table) => ({
  projectHashIdx: index('idx_failures_project_hash').on(table.projectHash),
  modelIdIdx: index('idx_failures_model_id').on(table.modelId),
  categoryIdx: index('idx_failures_category').on(table.category),
  resolvedIdx: index('idx_failures_resolved').on(table.resolved),
}));

/**
 * Test Results - Model testing and profiling results
 */
export const testResults = sqliteTable('test_results', {
  id: text('id').primaryKey(),
  projectHash: text('project_hash').notNull(),
  modelId: text('model_id').notNull(),
  testType: text('test_type').notNull(), // 'baseline', 'custom', 'combo', 'latency'
  testName: text('test_name'),
  score: integer('score'), // 0-100
  passed: integer('passed', { mode: 'boolean' }),
  results: text('results', { mode: 'json' }), // Detailed results object
  latencyMs: integer('latency_ms'),
  tokensUsed: integer('tokens_used'),
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull().default(sql`(strftime('%s', 'now'))`)
}, (table) => ({
  projectHashIdx: index('idx_test_results_project_hash').on(table.projectHash),
  modelIdIdx: index('idx_test_results_model_id').on(table.modelId),
  testTypeIdx: index('idx_test_results_test_type').on(table.testType),
  timestampIdx: index('idx_test_results_timestamp').on(table.timestamp),
}));