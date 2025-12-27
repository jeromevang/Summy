import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database file location
export const DB_PATH = path.join(__dirname, '../../../../data/summy.db');

export const SCHEMA = `
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
  tool_count INTEGER DEFAULT 0,
  hash TEXT UNIQUE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Context sessions (main session info)
CREATE TABLE IF NOT EXISTS context_sessions (
  id TEXT PRIMARY KEY,
  name TEXT,
  ide TEXT,
  ide_mapping TEXT,
  system_prompt_id TEXT REFERENCES system_prompts(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_context_sessions_created ON context_sessions(created_at);

-- Context turns (each request/response cycle)
CREATE TABLE IF NOT EXISTS context_turns (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES context_sessions(id) ON DELETE CASCADE,
  turn_number INTEGER NOT NULL,
  tool_set_id TEXT REFERENCES tool_sets(id),
  tool_change_reason TEXT,
  raw_request TEXT,
  raw_response TEXT,
  is_agentic INTEGER DEFAULT 0,
  agentic_iterations INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_context_turns_session ON context_turns(session_id);
CREATE INDEX IF NOT EXISTS idx_context_turns_number ON context_turns(session_id, turn_number);

-- Context messages (individual messages in conversation)
CREATE TABLE IF NOT EXISTS context_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  turn_id TEXT NOT NULL REFERENCES context_turns(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  role TEXT NOT NULL,
  content TEXT,
  tool_calls TEXT,
  tool_call_id TEXT,
  name TEXT,
  source TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_context_messages_turn ON context_messages(turn_id);
CREATE INDEX IF NOT EXISTS idx_context_messages_sequence ON context_messages(turn_id, sequence);

-- Custom test definitions for Tooly
CREATE TABLE IF NOT EXISTS custom_tests (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  prompt TEXT NOT NULL,
  expected_tool TEXT,
  expected_behavior TEXT,
  difficulty TEXT DEFAULT 'medium',
  variants TEXT, -- JSON array
  is_builtin INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Model info cache
CREATE TABLE IF NOT EXISTS model_info (
  model_id TEXT PRIMARY KEY,
  info TEXT, -- JSON
  fetched_at TEXT DEFAULT CURRENT_TIMESTAMP,
  source TEXT -- 'huggingface', 'ollama', 'web'
);

-- Model optimization profiles (v2)
CREATE TABLE IF NOT EXISTS model_profiles_v2 (
  model_id TEXT PRIMARY KEY,
  display_name TEXT,
  provider TEXT DEFAULT 'lmstudio',
  raw_scores TEXT, -- JSON: AgenticScores
  trainability_scores TEXT, -- JSON: TrainabilityScores
  failure_profile TEXT, -- JSON: FailureProfile
  precedence_matrix TEXT, -- JSON: PrecedenceMatrix
  stateful_profile TEXT, -- JSON
  anti_patterns TEXT, -- JSON: AntiPatternDetection
  score_breakdown TEXT, -- JSON: ScoreBreakdown
  recommended_role TEXT,
  optimal_pairings TEXT, -- JSON array of model IDs
  optimal_settings TEXT, -- JSON: ModelOptimalSettings
  mcp_config_path TEXT,
  tested_at TEXT DEFAULT CURRENT_TIMESTAMP,
  test_version INTEGER DEFAULT 1
);

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

-- Global user preferences (memory)
CREATE TABLE IF NOT EXISTS memory_global (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  confidence REAL DEFAULT 1.0,
  source TEXT, -- 'user_correction', 'observed_behavior', 'explicit_preference'
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Project-specific knowledge
CREATE TABLE IF NOT EXISTS memory_project (
  id TEXT PRIMARY KEY,
  project_path TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  importance TEXT DEFAULT 'normal', -- 'critical', 'high', 'normal', 'low'
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_path, key)
);

-- Learned patterns from interactions
CREATE TABLE IF NOT EXISTS memory_patterns (
  id TEXT PRIMARY KEY,
  pattern_type TEXT NOT NULL, -- 'preference', 'correction', 'behavior', 'rule'
  trigger TEXT NOT NULL,
  action TEXT NOT NULL,
  confidence REAL DEFAULT 0.5,
  success_rate REAL DEFAULT 1.0,
  occurrence_count INTEGER DEFAULT 1,
  source TEXT, -- 'user_correction', 'observed_behavior', 'explicit_preference'
  last_used TEXT DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Interaction history for learning (sparse storage)
CREATE TABLE IF NOT EXISTS learning_interactions (
  id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL,
  user_request TEXT,
  model_response TEXT,
  tool_calls TEXT, -- JSON array
  user_feedback TEXT, -- 'positive', 'negative', 'correction'
  correction TEXT,
  extracted_pattern_id TEXT REFERENCES memory_patterns(id),
  timestamp TEXT DEFAULT CURRENT_TIMESTAMP
);

-- MCP model configurations
CREATE TABLE IF NOT EXISTS mcp_model_configs (
  model_id TEXT PRIMARY KEY,
  tool_format TEXT DEFAULT 'openai', -- 'openai', 'xml'
  enabled_tools TEXT, -- JSON array
  disabled_tools TEXT, -- JSON array
  tool_overrides TEXT, -- JSON
  system_prompt_additions TEXT, -- JSON array
  context_budget TEXT, -- JSON: ContextBudget
  optimal_settings TEXT, -- JSON
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Ground Truth for tests (Phase 8)
CREATE TABLE IF NOT EXISTS ground_truth (
  test_id TEXT PRIMARY KEY,
  success INTEGER DEFAULT 1,
  tool_calls TEXT, -- JSON array
  explanation TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Combo Test Results (Main + Executor pairs)
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
`;

export class DBBase {
    protected static sharedDb: Database.Database | null = null;
    protected db: Database.Database;

    constructor() {
        if (!DBBase.sharedDb) {
            const dataDir = path.dirname(DB_PATH);
            fs.ensureDirSync(dataDir);
            DBBase.sharedDb = new Database(DB_PATH);
            DBBase.sharedDb.pragma('journal_mode = WAL');
            DBBase.sharedDb.exec(SCHEMA);
        }
        this.db = DBBase.sharedDb;
    }

    public query(sql: string, params: any[] = []): any[] {
        return this.db.prepare(sql).all(...params);
    }

    public run(sql: string, params: any[] = []): { changes: number; lastInsertRowid: number | bigint } {
        return this.db.prepare(sql).run(...params);
    }

    public get(sql: string, params: any[] = []): any {
        return this.db.prepare(sql).get(...params);
    }

    public exec(sql: string): void {
        this.db.exec(sql);
    }

    public close(): void {
        this.db.close();
    }
}
