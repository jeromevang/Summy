/**
 * Database Schema Definition
 * Defines all database tables and indexes
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs-extra';
import { DB_PATH } from './db-base.js';
// Database schema SQL
export const SCHEMA_SQL = `
-- Sessions
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  name TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME,
  model TEXT,
  provider TEXT,
  messages TEXT,
  compression TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at);
-- PERFORMANCE: Add indexes for session queries
CREATE INDEX IF NOT EXISTS idx_sessions_model ON sessions(model);
CREATE INDEX IF NOT EXISTS idx_sessions_provider ON sessions(provider);
CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_model_created ON sessions(model, created_at DESC);

-- Analytics
CREATE TABLE IF NOT EXISTS analytics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  type TEXT NOT NULL,
  model TEXT,
  provider TEXT,
  tokens_input INTEGER DEFAULT 0,
  tokens_output INTEGER DEFAULT 0,
  tokens_saved INTEGER DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  success INTEGER DEFAULT 1,
  metadata TEXT
);
CREATE INDEX IF NOT EXISTS idx_analytics_timestamp ON analytics(timestamp);
CREATE INDEX IF NOT EXISTS idx_analytics_type ON analytics(type);
-- PERFORMANCE: Add composite indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_analytics_model_timestamp ON analytics(model, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_type_success ON analytics(type, success);
CREATE INDEX IF NOT EXISTS idx_analytics_provider_timestamp ON analytics(provider, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_success_timestamp ON analytics(success, timestamp DESC);

-- Execution Logs
CREATE TABLE IF NOT EXISTS execution_logs (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  model TEXT,
  tool TEXT NOT NULL,
  arguments TEXT,
  result TEXT,
  status TEXT NOT NULL,
  duration_ms INTEGER DEFAULT 0,
  error_message TEXT,
  backup_id TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON execution_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_logs_tool ON execution_logs(tool);
CREATE INDEX IF NOT EXISTS idx_logs_status ON execution_logs(status);
-- PERFORMANCE: Add composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_logs_session_timestamp ON execution_logs(session_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_logs_model_tool ON execution_logs(model, tool);
CREATE INDEX IF NOT EXISTS idx_logs_session_tool ON execution_logs(session_id, tool);
CREATE INDEX IF NOT EXISTS idx_logs_status_duration ON execution_logs(status, duration_ms);

-- File Backups
CREATE TABLE IF NOT EXISTS file_backups (
  id TEXT PRIMARY KEY,
  execution_log_id TEXT,
  file_path TEXT NOT NULL,
  original_content TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME,
  restored INTEGER DEFAULT 0,
  FOREIGN KEY (execution_log_id) REFERENCES execution_logs(id)
);
CREATE INDEX IF NOT EXISTS idx_backups_expires ON file_backups(expires_at);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  read INTEGER DEFAULT 0,
  action_label TEXT,
  action_href TEXT
);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_timestamp ON notifications(timestamp);

-- Deduplicated system prompts
CREATE TABLE IF NOT EXISTS system_prompts (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  hash TEXT UNIQUE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Deduplicated tool sets
CREATE TABLE IF NOT EXISTS tool_sets (
  id TEXT PRIMARY KEY,
  tools TEXT NOT NULL,
  hash TEXT UNIQUE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Model profiles
CREATE TABLE IF NOT EXISTS model_profiles (
  model_id TEXT PRIMARY KEY,
  provider TEXT,
  capabilities TEXT, -- JSON: ModelCapabilities
  profile TEXT, -- JSON: ModelProfile
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_model_profiles_provider ON model_profiles(provider);

-- Test history (for trends)
CREATE TABLE IF NOT EXISTS test_history (
  id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL,
  test_mode TEXT, -- 'quick', 'standard', 'deep', 'optimization'
  scores TEXT, -- JSON: ScoreBreakdown
  duration_ms INTEGER,
  test_count INTEGER,
  passed_count INTEGER,
  failed_count INTEGER,
  timestamp TEXT DEFAULT CURRENT_TIMESTAMP
);
-- PERFORMANCE: Add indexes for test history queries
CREATE INDEX IF NOT EXISTS idx_test_history_model_id ON test_history(model_id);
CREATE INDEX IF NOT EXISTS idx_test_history_model_timestamp ON test_history(model_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_test_history_mode ON test_history(test_mode);
CREATE INDEX IF NOT EXISTS idx_test_history_timestamp ON test_history(timestamp DESC);

-- Global user preferences (memory)
CREATE TABLE IF NOT EXISTS memory_global (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Failure log (JSON files, but tracking table)
CREATE TABLE IF NOT EXISTS failure_log (
  id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL,
  failure_type TEXT NOT NULL,
  failure_details TEXT, -- JSON: FailureDetails
  timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
  resolved INTEGER DEFAULT 0,
  prosthetic_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_failure_log_model_id ON failure_log(model_id);
CREATE INDEX IF NOT EXISTS idx_failure_log_type ON failure_log(failure_type);
CREATE INDEX IF NOT EXISTS idx_failure_log_resolved ON failure_log(resolved);

-- Prosthetic prompts
CREATE TABLE IF NOT EXISTS prosthetic_prompts (
  id TEXT PRIMARY KEY,
  model_id TEXT,
  combo_id TEXT,
  level INTEGER NOT NULL,
  prompt TEXT NOT NULL,
  type TEXT NOT NULL, -- 'individual' or 'combo'
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_used TEXT,
  effectiveness_score REAL DEFAULT 0,
  usage_count INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_prosthetic_model_id ON prosthetic_prompts(model_id);
CREATE INDEX IF NOT EXISTS idx_prosthetic_combo_id ON prosthetic_prompts(combo_id);
CREATE INDEX IF NOT EXISTS idx_prosthetic_type ON prosthetic_prompts(type);

-- Combo test results (Main + Executor pairs)
CREATE TABLE IF NOT EXISTS combo_test_results (
  id TEXT PRIMARY KEY,
  main_model_id TEXT NOT NULL,
  executor_model_id TEXT NOT NULL,
  overall_score REAL NOT NULL,
  main_score REAL DEFAULT 0,
  executor_score REAL DEFAULT 0,
  tier_scores TEXT, -- JSON: { simple, medium, complex }
  category_scores TEXT, -- JSON: CategoryScore[]
  test_results TEXT, -- JSON: ComboTestResult[]
  avg_latency_ms REAL DEFAULT 0,
  passed_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  main_excluded INTEGER DEFAULT 0,
  tested_at TEXT DEFAULT CURRENT_TIMESTAMP,
  qualifying_gate_passed INTEGER, -- 0=false, 1=true, NULL=not run
  disqualified_at TEXT, -- 'qualifying_gate' if disqualified
  qualifying_results TEXT, -- JSON: ComboTestResult[] from qualifying gate
  UNIQUE(main_model_id, executor_model_id)
);
CREATE INDEX IF NOT EXISTS idx_combo_results_main ON combo_test_results(main_model_id);
CREATE INDEX IF NOT EXISTS idx_combo_results_executor ON combo_test_results(executor_model_id);
CREATE INDEX IF NOT EXISTS idx_combo_results_score ON combo_test_results(overall_score DESC);
-- PERFORMANCE: Add composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_combo_results_main_executor_score ON combo_test_results(main_model_id, executor_model_id, overall_score DESC);
CREATE INDEX IF NOT EXISTS idx_combo_results_qualifying ON combo_test_results(qualifying_gate_passed, overall_score DESC);
CREATE INDEX IF NOT EXISTS idx_combo_results_excluded ON combo_test_results(main_excluded, overall_score DESC);
CREATE INDEX IF NOT EXISTS idx_combo_results_tested_at ON combo_test_results(tested_at DESC);

-- Context sessions
CREATE TABLE IF NOT EXISTS context_sessions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  model_id TEXT,
  provider TEXT,
  context_data TEXT, -- JSON: ContextData
  compression_enabled INTEGER DEFAULT 0,
  compression_ratio REAL DEFAULT 0,
  last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_context_sessions_model_id ON context_sessions(model_id);
CREATE INDEX IF NOT EXISTS idx_context_sessions_created ON context_sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_context_sessions_updated ON context_sessions(updated_at);

-- Context operations
CREATE TABLE IF NOT EXISTS context_operations (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  operation_type TEXT NOT NULL, -- 'add', 'remove', 'summarize', 'compress'
  operation_data TEXT, -- JSON: OperationData
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  duration_ms INTEGER DEFAULT 0,
  success INTEGER DEFAULT 1,
  error_message TEXT,
  FOREIGN KEY (session_id) REFERENCES context_sessions(id)
);
CREATE INDEX IF NOT EXISTS idx_context_operations_session_id ON context_operations(session_id);
CREATE INDEX IF NOT EXISTS idx_context_operations_type ON context_operations(operation_type);
CREATE INDEX IF NOT EXISTS idx_context_operations_timestamp ON context_operations(timestamp);

-- System settings
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Model metadata
CREATE TABLE IF NOT EXISTS model_metadata (
  model_id TEXT PRIMARY KEY,
  display_name TEXT,
  provider TEXT NOT NULL,
  status TEXT DEFAULT 'untested',
  role TEXT DEFAULT 'both',
  category TEXT DEFAULT 'general',
  score REAL DEFAULT 0,
  tool_score REAL DEFAULT 0,
  reasoning_score REAL DEFAULT 0,
  avg_latency REAL DEFAULT 0,
  tested_at TEXT,
  error TEXT,
  max_context_length INTEGER,
  trained_for_tool_use INTEGER DEFAULT 0,
  vision INTEGER DEFAULT 0,
  size_bytes INTEGER,
  quantization TEXT,
  parameters INTEGER,
  cost_per_token REAL,
  free_tier INTEGER DEFAULT 0,
  requires_key INTEGER DEFAULT 0,
  supports_streaming INTEGER DEFAULT 0,
  supports_functions INTEGER DEFAULT 0,
  supports_vision INTEGER DEFAULT 0,
  supports_json INTEGER DEFAULT 0,
  last_health_check TEXT,
  health_status TEXT DEFAULT 'unknown',
  failure_count INTEGER DEFAULT 0,
  success_rate REAL DEFAULT 0,
  last_used TEXT,
  usage_count INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_model_metadata_provider ON model_metadata(provider);
CREATE INDEX IF NOT EXISTS idx_model_metadata_status ON model_metadata(status);
CREATE INDEX IF NOT EXISTS idx_model_metadata_role ON model_metadata(role);
CREATE INDEX IF NOT EXISTS idx_model_metadata_category ON model_metadata(category);
CREATE INDEX IF NOT EXISTS idx_model_metadata_score ON model_metadata(score DESC);
CREATE INDEX IF NOT EXISTS idx_model_metadata_health_status ON model_metadata(health_status);

-- ============================================================
-- CODE INDEX SYSTEM (Refactoring & AI Navigation)
-- ============================================================

-- File metadata
CREATE TABLE IF NOT EXISTS code_index (
    file_path TEXT PRIMARY KEY,
    scope TEXT,
    exports TEXT,
    inputs TEXT,
    outputs TEXT,
    libraries TEXT,
    category TEXT,
    tags TEXT,
    complexity TEXT,
    lines_count INTEGER,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_code_index_category ON code_index(category);

-- Function-level chunks (from AST parsing)
CREATE TABLE IF NOT EXISTS code_chunks (
    id TEXT PRIMARY KEY,
    file_path TEXT NOT NULL,
    symbol_name TEXT NOT NULL,
    symbol_type TEXT NOT NULL,     -- 'function', 'class', 'component', 'hook'
    content TEXT,
    inputs TEXT,                   -- JSON array of parameters
    outputs TEXT,                  -- Return type/description
    start_line INTEGER,
    end_line INTEGER,
    dependencies TEXT,             -- JSON array of called functions
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (file_path) REFERENCES code_index(file_path)
);
CREATE INDEX IF NOT EXISTS idx_code_chunks_file ON code_chunks(file_path);
CREATE INDEX IF NOT EXISTS idx_code_chunks_symbol ON code_chunks(symbol_name);
CREATE INDEX IF NOT EXISTS idx_code_chunks_type ON code_chunks(symbol_type);

-- Dependency relationships
CREATE TABLE IF NOT EXISTS code_dependencies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_chunk_id TEXT,
    target_chunk_id TEXT,
    dependency_type TEXT NOT NULL, -- 'calls', 'imports', 'extends'
    metadata TEXT,                 -- Additional context
    FOREIGN KEY (source_chunk_id) REFERENCES code_chunks(id),
    FOREIGN KEY (target_chunk_id) REFERENCES code_chunks(id)
);
CREATE INDEX IF NOT EXISTS idx_code_deps_source ON code_dependencies(source_chunk_id);
CREATE INDEX IF NOT EXISTS idx_code_deps_target ON code_dependencies(target_chunk_id);

-- MIGRATION: Add missing columns if they don't exist
-- This ensures backward compatibility with existing databases
CREATE TABLE IF NOT EXISTS migration_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  migration_name TEXT NOT NULL,
  executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Migration 1: Add qualifying_gate_passed column to combo_test_results
INSERT OR IGNORE INTO migration_log (migration_name) VALUES ('add_qualifying_gate_passed');
ALTER TABLE combo_test_results ADD COLUMN qualifying_gate_passed INTEGER DEFAULT NULL;
ALTER TABLE combo_test_results ADD COLUMN disqualified_at TEXT DEFAULT NULL;
ALTER TABLE combo_test_results ADD COLUMN qualifying_results TEXT DEFAULT NULL;
`;

/**
 * Initialize database with schema
 */
export function initializeDatabase(db: Database.Database): void {
  // Ensure data directory exists
  const dataDir = path.dirname(DB_PATH);
  fs.ensureDirSync(dataDir);

  // Execute schema
  db.exec(SCHEMA_SQL);
  
  // Insert default settings if needed
  const stmt = db.prepare('SELECT COUNT(*) as count FROM system_settings WHERE key = ?');
  const count = stmt.get('initialized') as any;

  if (!count || count.count === 0) {
    const insertStmt = db.prepare('INSERT INTO system_settings (key, value) VALUES (?, ?)');
    insertStmt.run('initialized', 'true');
    insertStmt.run('version', '1.0.0');
  }
}
