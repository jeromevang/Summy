import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs-extra';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database file location
const DB_PATH = path.join(__dirname, '../../data/summy.db');

// ============================================================
// TYPES
// ============================================================

export interface Session {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  model: string;
  provider: string;
  messages: any[];
  compression?: any;
}

export interface AnalyticsEntry {
  type: 'request' | 'compression' | 'tool';
  model?: string;
  provider?: string;
  tokensInput?: number;
  tokensOutput?: number;
  tokensSaved?: number;
  durationMs?: number;
  success?: boolean;
  metadata?: any;
}

export interface AnalyticsSummary {
  totalRequests: number;
  tokensOriginal: number;
  tokensCompressed: number;
  tokensSaved: number;
  toolExecutions: number;
  toolSuccessRate: number;
  dailyActivity: Array<{
    date: string;
    requests: number;
    toolCalls: number;
  }>;
  toolUsage: Array<{
    tool: string;
    count: number;
    successRate: number;
  }>;
}

export interface ExecutionLog {
  id?: string;
  sessionId?: string;
  model: string;
  tool: string;
  arguments: any;
  result?: any;
  status: 'success' | 'failed' | 'timeout';
  durationMs?: number;
  errorMessage?: string;
  backupId?: string;
}

export interface FileBackup {
  id?: string;
  executionLogId: string;
  filePath: string;
  originalContent: string;
  expiresAt?: string;
}

export interface Notification {
  id?: string;
  type: 'success' | 'warning' | 'error' | 'info';
  title: string;
  message?: string;
  read?: boolean;
  actionLabel?: string;
  actionHref?: string;
}

export interface LogFilters {
  tool?: string;
  status?: string;
  sessionId?: string;
  limit?: number;
  offset?: number;
}

// ============================================================
// CONTEXT SESSION TYPES (New normalized structure)
// ============================================================

export interface ContextMessage {
  id?: number;
  turnId?: string;
  sequence: number;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string;
  toolCalls?: any[];
  toolCallId?: string;
  name?: string;
  source?: 'ide' | 'llm' | 'mcp' | 'middleware' | 'summy';
}

export interface ContextTurn {
  id: string;
  sessionId: string;
  turnNumber: number;
  toolSetId?: string;
  toolChangeReason?: string;
  rawRequest?: any;
  rawResponse?: any;
  isAgentic?: boolean;
  agenticIterations?: number;
  messages: ContextMessage[];
  createdAt?: string;
}

export interface ContextSessionDB {
  id: string;
  name: string;
  ide: string;
  ideMapping?: string;
  systemPromptId?: string;
  systemPrompt?: string;
  createdAt: string;
  updatedAt: string;
  turns: ContextTurn[];
}

export interface SystemPrompt {
  id: string;
  content: string;
  hash: string;
}

export interface ToolSet {
  id: string;
  tools: any[];
  toolCount: number;
  hash: string;
}

// ============================================================
// SCHEMA
// ============================================================

const SCHEMA = `
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

-- ============================================================
-- CONTEXT SESSIONS (New normalized session storage)
-- ============================================================

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

-- ============================================================
-- RAG SYSTEM (Semantic code search)
-- ============================================================

-- Single active project index (one at a time)
CREATE TABLE IF NOT EXISTS rag_index (
  id TEXT PRIMARY KEY DEFAULT 'active',
  name TEXT,
  project_path TEXT NOT NULL,
  project_hash TEXT NOT NULL,
  embedding_model TEXT,
  embedding_dimensions INTEGER DEFAULT 768,
  total_files INTEGER DEFAULT 0,
  total_chunks INTEGER DEFAULT 0,
  total_vectors INTEGER DEFAULT 0,
  storage_size INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  last_indexed_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Track indexed files (for incremental updates)
CREATE TABLE IF NOT EXISTS rag_files (
  id TEXT PRIMARY KEY,
  file_path TEXT NOT NULL UNIQUE,
  file_hash TEXT NOT NULL,
  file_size INTEGER DEFAULT 0,
  chunk_count INTEGER DEFAULT 0,
  language TEXT,
  indexed_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_rag_files_path ON rag_files(file_path);
CREATE INDEX IF NOT EXISTS idx_rag_files_hash ON rag_files(file_hash);

-- Chunk metadata (for search result display)
CREATE TABLE IF NOT EXISTS rag_chunks (
  id TEXT PRIMARY KEY,
  file_id TEXT NOT NULL REFERENCES rag_files(id) ON DELETE CASCADE,
  vector_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  tokens INTEGER DEFAULT 0,
  start_line INTEGER,
  end_line INTEGER,
  symbol_name TEXT,
  symbol_type TEXT,
  language TEXT,
  imports TEXT,
  signature TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_file ON rag_chunks(file_id);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_vector ON rag_chunks(vector_id);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_symbol ON rag_chunks(symbol_name);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_type ON rag_chunks(symbol_type);

-- RAG metrics/history for analytics dashboard
CREATE TABLE IF NOT EXISTS rag_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
  files_processed INTEGER DEFAULT 0,
  chunks_created INTEGER DEFAULT 0,
  embeddings_generated INTEGER DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  query TEXT,
  results_count INTEGER DEFAULT 0,
  top_score REAL DEFAULT 0,
  latency_ms INTEGER DEFAULT 0,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_rag_metrics_type ON rag_metrics(type);
CREATE INDEX IF NOT EXISTS idx_rag_metrics_timestamp ON rag_metrics(timestamp);

-- 2D projections for visualization (computed lazily via UMAP)
CREATE TABLE IF NOT EXISTS rag_projections (
  chunk_id TEXT PRIMARY KEY REFERENCES rag_chunks(id) ON DELETE CASCADE,
  x REAL NOT NULL,
  y REAL NOT NULL,
  computed_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- RAG configuration (persisted settings)
CREATE TABLE IF NOT EXISTS rag_config (
  id TEXT PRIMARY KEY DEFAULT 'active',
  lmstudio_model TEXT,
  lmstudio_load_on_demand INTEGER DEFAULT 1,
  storage_data_path TEXT,
  indexing_chunk_size INTEGER DEFAULT 1500,
  indexing_chunk_overlap INTEGER DEFAULT 200,
  indexing_include_patterns TEXT DEFAULT '["**/*.ts","**/*.tsx","**/*.js","**/*.jsx","**/*.py","**/*.go","**/*.rs","**/*.java","**/*.cpp","**/*.c","**/*.h","**/*.cs","**/*.rb","**/*.php","**/*.swift","**/*.kt"]',
  indexing_exclude_patterns TEXT DEFAULT '["**/node_modules/**","**/dist/**","**/build/**","**/.git/**","**/vendor/**","**/__pycache__/**","**/target/**"]',
  watcher_enabled INTEGER DEFAULT 1,
  watcher_debounce_ms INTEGER DEFAULT 1000,
  project_path TEXT,
  project_auto_detect INTEGER DEFAULT 1,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

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
`;

// ============================================================
// DATABASE SERVICE
// ============================================================

class DatabaseService {
  private db: Database.Database;
  private initialized: boolean = false;

  constructor() {
    // Ensure data directory exists
    const dataDir = path.dirname(DB_PATH);
    fs.ensureDirSync(dataDir);

    // Create database
    this.db = new Database(DB_PATH);
    this.db.pragma('journal_mode = WAL'); // Better concurrency
    this.initialize();
  }

  private initialize(): void {
    if (this.initialized) return;
    
    // Run schema
    this.db.exec(SCHEMA);
    this.initialized = true;
    console.log('[DB] SQLite database initialized at:', DB_PATH);
  }

  // ============================================================
  // SESSIONS
  // ============================================================

  getSessions(limit: number = 50, offset: number = 0): Session[] {
    const stmt = this.db.prepare(`
      SELECT * FROM sessions 
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `);
    const rows = stmt.all(limit, offset) as any[];
    return rows.map(row => this.rowToSession(row));
  }

  getSession(id: string): Session | null {
    const stmt = this.db.prepare('SELECT * FROM sessions WHERE id = ?');
    const row = stmt.get(id) as any;
    return row ? this.rowToSession(row) : null;
  }

  saveSession(session: Session): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO sessions 
      (id, name, created_at, updated_at, model, provider, messages, compression)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      session.id,
      session.name || 'Untitled Session',
      session.createdAt || new Date().toISOString(),
      session.updatedAt || new Date().toISOString(),
      session.model || '',
      session.provider || '',
      JSON.stringify(session.messages || []),
      JSON.stringify(session.compression || null)
    );
  }

  deleteSession(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM sessions WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  getSessionCount(): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM sessions');
    const row = stmt.get() as any;
    return row?.count || 0;
  }

  private rowToSession(row: any): Session {
    return {
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      model: row.model,
      provider: row.provider,
      messages: JSON.parse(row.messages || '[]'),
      compression: JSON.parse(row.compression || 'null')
    };
  }

  // ============================================================
  // ANALYTICS
  // ============================================================

  recordAnalytics(entry: AnalyticsEntry): void {
    const stmt = this.db.prepare(`
      INSERT INTO analytics 
      (type, model, provider, tokens_input, tokens_output, tokens_saved, duration_ms, success, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      entry.type,
      entry.model || null,
      entry.provider || null,
      entry.tokensInput || 0,
      entry.tokensOutput || 0,
      entry.tokensSaved || 0,
      entry.durationMs || 0,
      entry.success !== false ? 1 : 0,
      entry.metadata ? JSON.stringify(entry.metadata) : null
    );
  }

  getAnalyticsSummary(period: 'day' | 'week' | 'month'): AnalyticsSummary {
    const periodMap = {
      day: '-1 day',
      week: '-7 days',
      month: '-30 days'
    };
    const since = periodMap[period];

    // Summary stats
    const summaryStmt = this.db.prepare(`
      SELECT 
        COUNT(*) as total_requests,
        SUM(tokens_input) as tokens_original,
        SUM(tokens_input - tokens_saved) as tokens_compressed,
        SUM(tokens_saved) as tokens_saved
      FROM analytics 
      WHERE timestamp > datetime('now', ?)
    `);
    const summary = summaryStmt.get(since) as any;

    // Tool executions
    const toolStmt = this.db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful
      FROM analytics 
      WHERE type = 'tool' AND timestamp > datetime('now', ?)
    `);
    const toolStats = toolStmt.get(since) as any;

    // Daily activity
    const dailyStmt = this.db.prepare(`
      SELECT 
        DATE(timestamp) as date,
        COUNT(*) as requests,
        SUM(CASE WHEN type = 'tool' THEN 1 ELSE 0 END) as tool_calls
      FROM analytics 
      WHERE timestamp > datetime('now', ?)
      GROUP BY DATE(timestamp)
      ORDER BY date DESC
    `);
    const dailyRows = dailyStmt.all(since) as any[];

    // Tool usage breakdown
    const toolUsageStmt = this.db.prepare(`
      SELECT 
        json_extract(metadata, '$.tool') as tool,
        COUNT(*) as count,
        AVG(CASE WHEN success = 1 THEN 100.0 ELSE 0.0 END) as success_rate
      FROM analytics 
      WHERE type = 'tool' AND timestamp > datetime('now', ?)
      GROUP BY json_extract(metadata, '$.tool')
      ORDER BY count DESC
      LIMIT 10
    `);
    const toolUsage = toolUsageStmt.all(since) as any[];

    return {
      totalRequests: summary?.total_requests || 0,
      tokensOriginal: summary?.tokens_original || 0,
      tokensCompressed: summary?.tokens_compressed || 0,
      tokensSaved: summary?.tokens_saved || 0,
      toolExecutions: toolStats?.total || 0,
      toolSuccessRate: toolStats?.total > 0 
        ? Math.round((toolStats.successful / toolStats.total) * 100) 
        : 100,
      dailyActivity: dailyRows.map(row => ({
        date: row.date,
        requests: row.requests,
        toolCalls: row.tool_calls
      })),
      toolUsage: toolUsage.map(row => ({
        tool: row.tool || 'unknown',
        count: row.count,
        successRate: Math.round(row.success_rate)
      }))
    };
  }

  // ============================================================
  // EXECUTION LOGS
  // ============================================================

  logExecution(log: ExecutionLog): string {
    const id = log.id || uuidv4();
    const stmt = this.db.prepare(`
      INSERT INTO execution_logs 
      (id, session_id, model, tool, arguments, result, status, duration_ms, error_message, backup_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      log.sessionId || null,
      log.model,
      log.tool,
      JSON.stringify(log.arguments),
      log.result ? JSON.stringify(log.result) : null,
      log.status,
      log.durationMs || 0,
      log.errorMessage || null,
      log.backupId || null
    );
    return id;
  }

  getExecutionLogs(filters: LogFilters = {}): ExecutionLog[] {
    let query = 'SELECT * FROM execution_logs WHERE 1=1';
    const params: any[] = [];

    if (filters.tool) {
      query += ' AND tool = ?';
      params.push(filters.tool);
    }
    if (filters.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }
    if (filters.sessionId) {
      query += ' AND session_id = ?';
      params.push(filters.sessionId);
    }

    query += ' ORDER BY timestamp DESC';
    query += ` LIMIT ? OFFSET ?`;
    params.push(filters.limit || 50, filters.offset || 0);

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];
    
    return rows.map(row => ({
      id: row.id,
      sessionId: row.session_id,
      model: row.model,
      tool: row.tool,
      arguments: JSON.parse(row.arguments || '{}'),
      result: row.result ? JSON.parse(row.result) : null,
      status: row.status,
      durationMs: row.duration_ms,
      errorMessage: row.error_message,
      backupId: row.backup_id
    }));
  }

  getExecutionLog(id: string): ExecutionLog | null {
    const stmt = this.db.prepare('SELECT * FROM execution_logs WHERE id = ?');
    const row = stmt.get(id) as any;
    if (!row) return null;
    
    return {
      id: row.id,
      sessionId: row.session_id,
      model: row.model,
      tool: row.tool,
      arguments: JSON.parse(row.arguments || '{}'),
      result: row.result ? JSON.parse(row.result) : null,
      status: row.status,
      durationMs: row.duration_ms,
      errorMessage: row.error_message,
      backupId: row.backup_id
    };
  }

  // ============================================================
  // FILE BACKUPS
  // ============================================================

  createBackup(backup: FileBackup): string {
    const id = backup.id || uuidv4();
    const expiresAt = backup.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    
    const stmt = this.db.prepare(`
      INSERT INTO file_backups 
      (id, execution_log_id, file_path, original_content, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(id, backup.executionLogId, backup.filePath, backup.originalContent, expiresAt);
    return id;
  }

  getBackup(id: string): FileBackup | null {
    const stmt = this.db.prepare('SELECT * FROM file_backups WHERE id = ?');
    const row = stmt.get(id) as any;
    if (!row) return null;
    
    return {
      id: row.id,
      executionLogId: row.execution_log_id,
      filePath: row.file_path,
      originalContent: row.original_content,
      expiresAt: row.expires_at
    };
  }

  markBackupRestored(id: string): void {
    const stmt = this.db.prepare('UPDATE file_backups SET restored = 1 WHERE id = ?');
    stmt.run(id);
  }

  cleanupExpiredBackups(): number {
    const stmt = this.db.prepare(`
      DELETE FROM file_backups 
      WHERE expires_at < datetime('now') AND restored = 0
    `);
    const result = stmt.run();
    return result.changes;
  }

  getBackupsForLog(executionLogId: string): FileBackup[] {
    const stmt = this.db.prepare('SELECT * FROM file_backups WHERE execution_log_id = ?');
    const rows = stmt.all(executionLogId) as any[];
    
    return rows.map(row => ({
      id: row.id,
      executionLogId: row.execution_log_id,
      filePath: row.file_path,
      originalContent: row.original_content,
      expiresAt: row.expires_at
    }));
  }

  // ============================================================
  // NOTIFICATIONS
  // ============================================================

  addNotification(notification: Notification): string {
    const id = notification.id || uuidv4();
    const stmt = this.db.prepare(`
      INSERT INTO notifications 
      (id, type, title, message, action_label, action_href)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      notification.type,
      notification.title,
      notification.message || null,
      notification.actionLabel || null,
      notification.actionHref || null
    );
    return id;
  }

  getNotifications(unreadOnly: boolean = false, limit: number = 20): Notification[] {
    let query = 'SELECT * FROM notifications';
    if (unreadOnly) {
      query += ' WHERE read = 0';
    }
    query += ' ORDER BY timestamp DESC LIMIT ?';
    
    const stmt = this.db.prepare(query);
    const rows = stmt.all(limit) as any[];
    
    return rows.map(row => ({
      id: row.id,
      type: row.type,
      title: row.title,
      message: row.message,
      read: row.read === 1,
      actionLabel: row.action_label,
      actionHref: row.action_href
    }));
  }

  getUnreadCount(): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM notifications WHERE read = 0');
    const row = stmt.get() as any;
    return row?.count || 0;
  }

  markNotificationAsRead(id: string): void {
    const stmt = this.db.prepare('UPDATE notifications SET read = 1 WHERE id = ?');
    stmt.run(id);
  }

  markAllNotificationsAsRead(): void {
    const stmt = this.db.prepare('UPDATE notifications SET read = 1');
    stmt.run();
  }

  deleteNotification(id: string): void {
    const stmt = this.db.prepare('DELETE FROM notifications WHERE id = ?');
    stmt.run(id);
  }

  clearAllNotifications(): void {
    const stmt = this.db.prepare('DELETE FROM notifications');
    stmt.run();
  }

  // ============================================================
  // CONTEXT SESSIONS (New normalized structure)
  // ============================================================

  // Hash helper
  private hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  // Get or create system prompt (deduplicated)
  getOrCreateSystemPrompt(content: string): string {
    const hash = this.hashContent(content);
    
    // Check if exists
    const existing = this.db.prepare('SELECT id FROM system_prompts WHERE hash = ?').get(hash) as any;
    if (existing) return existing.id;
    
    // Create new
    const id = uuidv4();
    this.db.prepare(`
      INSERT INTO system_prompts (id, content, hash) VALUES (?, ?, ?)
    `).run(id, content, hash);
    return id;
  }

  // Get system prompt by ID
  getSystemPrompt(id: string): string | null {
    const row = this.db.prepare('SELECT content FROM system_prompts WHERE id = ?').get(id) as any;
    return row?.content || null;
  }

  // Get or create tool set (deduplicated)
  getOrCreateToolSet(tools: any[]): string {
    const toolsJson = JSON.stringify(tools);
    const hash = this.hashContent(toolsJson);
    
    // Check if exists
    const existing = this.db.prepare('SELECT id FROM tool_sets WHERE hash = ?').get(hash) as any;
    if (existing) return existing.id;
    
    // Create new
    const id = uuidv4();
    this.db.prepare(`
      INSERT INTO tool_sets (id, tools, tool_count, hash) VALUES (?, ?, ?, ?)
    `).run(id, toolsJson, tools.length, hash);
    return id;
  }

  // Get tool set by ID
  getToolSet(id: string): any[] | null {
    const row = this.db.prepare('SELECT tools FROM tool_sets WHERE id = ?').get(id) as any;
    return row ? JSON.parse(row.tools) : null;
  }

  // Create new context session
  createContextSession(session: {
    id: string;
    name: string;
    ide: string;
    ideMapping?: string;
    systemPrompt?: string;
  }): void {
    let systemPromptId: string | null = null;
    if (session.systemPrompt) {
      systemPromptId = this.getOrCreateSystemPrompt(session.systemPrompt);
    }
    
    this.db.prepare(`
      INSERT INTO context_sessions (id, name, ide, ide_mapping, system_prompt_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(session.id, session.name, session.ide, session.ideMapping || null, systemPromptId);
  }

  // Get context session by ID (with turns and messages)
  getContextSession(id: string): ContextSessionDB | null {
    const sessionRow = this.db.prepare(`
      SELECT cs.*, sp.content as system_prompt_content
      FROM context_sessions cs
      LEFT JOIN system_prompts sp ON cs.system_prompt_id = sp.id
      WHERE cs.id = ?
    `).get(id) as any;
    
    if (!sessionRow) return null;
    
    // Get turns
    const turnRows = this.db.prepare(`
      SELECT * FROM context_turns WHERE session_id = ? ORDER BY turn_number ASC
    `).all(id) as any[];
    
    const turns: ContextTurn[] = turnRows.map(turnRow => {
      // Get messages for this turn
      const messageRows = this.db.prepare(`
        SELECT * FROM context_messages WHERE turn_id = ? ORDER BY sequence ASC
      `).all(turnRow.id) as any[];
      
      const messages: ContextMessage[] = messageRows.map(msgRow => ({
        id: msgRow.id,
        turnId: msgRow.turn_id,
        sequence: msgRow.sequence,
        role: msgRow.role,
        content: msgRow.content,
        toolCalls: msgRow.tool_calls ? JSON.parse(msgRow.tool_calls) : undefined,
        toolCallId: msgRow.tool_call_id,
        name: msgRow.name,
        source: msgRow.source
      }));
      
      return {
        id: turnRow.id,
        sessionId: turnRow.session_id,
        turnNumber: turnRow.turn_number,
        toolSetId: turnRow.tool_set_id,
        toolChangeReason: turnRow.tool_change_reason,
        rawRequest: turnRow.raw_request ? JSON.parse(turnRow.raw_request) : undefined,
        rawResponse: turnRow.raw_response ? JSON.parse(turnRow.raw_response) : undefined,
        isAgentic: turnRow.is_agentic === 1,
        agenticIterations: turnRow.agentic_iterations,
        messages,
        createdAt: turnRow.created_at
      };
    });
    
    return {
      id: sessionRow.id,
      name: sessionRow.name,
      ide: sessionRow.ide,
      ideMapping: sessionRow.ide_mapping,
      systemPromptId: sessionRow.system_prompt_id,
      systemPrompt: sessionRow.system_prompt_content,
      createdAt: sessionRow.created_at,
      updatedAt: sessionRow.updated_at,
      turns
    };
  }

  // List context sessions (without full turn/message data)
  listContextSessions(limit: number = 50, offset: number = 0): Array<{
    id: string;
    name: string;
    ide: string;
    turnCount: number;
    createdAt: string;
    updatedAt: string;
  }> {
    const rows = this.db.prepare(`
      SELECT cs.*, COUNT(ct.id) as turn_count
      FROM context_sessions cs
      LEFT JOIN context_turns ct ON cs.id = ct.session_id
      GROUP BY cs.id
      ORDER BY cs.updated_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset) as any[];
    
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      ide: row.ide,
      turnCount: row.turn_count || 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  // Add turn to session
  addContextTurn(turn: {
    sessionId: string;
    turnNumber: number;
    tools?: any[];
    previousToolSetId?: string;
    rawRequest?: any;
    rawResponse?: any;
    isAgentic?: boolean;
    agenticIterations?: number;
    messages: ContextMessage[];
  }): string {
    const turnId = uuidv4();
    
    // Handle tool set
    let toolSetId: string | null = null;
    let toolChangeReason: string | null = null;
    
    if (turn.tools && turn.tools.length > 0) {
      toolSetId = this.getOrCreateToolSet(turn.tools);
      if (turn.previousToolSetId && toolSetId !== turn.previousToolSetId) {
        toolChangeReason = 'Tools changed from previous turn';
      }
    } else if (turn.previousToolSetId) {
      toolSetId = turn.previousToolSetId;
    }
    
    // Insert turn
    this.db.prepare(`
      INSERT INTO context_turns 
      (id, session_id, turn_number, tool_set_id, tool_change_reason, raw_request, raw_response, is_agentic, agentic_iterations)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      turnId,
      turn.sessionId,
      turn.turnNumber,
      toolSetId,
      toolChangeReason,
      turn.rawRequest ? JSON.stringify(turn.rawRequest) : null,
      turn.rawResponse ? JSON.stringify(turn.rawResponse) : null,
      turn.isAgentic ? 1 : 0,
      turn.agenticIterations || 0
    );
    
    // Insert messages
    const insertMsg = this.db.prepare(`
      INSERT INTO context_messages 
      (turn_id, sequence, role, content, tool_calls, tool_call_id, name, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    for (const msg of turn.messages) {
      insertMsg.run(
        turnId,
        msg.sequence,
        msg.role,
        msg.content || null,
        msg.toolCalls ? JSON.stringify(msg.toolCalls) : null,
        msg.toolCallId || null,
        msg.name || null,
        msg.source || null
      );
    }
    
    // Update session timestamp
    this.db.prepare(`
      UPDATE context_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(turn.sessionId);
    
    return turnId;
  }

  // Get turn with messages
  getContextTurn(turnId: string): ContextTurn | null {
    const turnRow = this.db.prepare('SELECT * FROM context_turns WHERE id = ?').get(turnId) as any;
    if (!turnRow) return null;
    
    const messageRows = this.db.prepare(`
      SELECT * FROM context_messages WHERE turn_id = ? ORDER BY sequence ASC
    `).all(turnId) as any[];
    
    return {
      id: turnRow.id,
      sessionId: turnRow.session_id,
      turnNumber: turnRow.turn_number,
      toolSetId: turnRow.tool_set_id,
      toolChangeReason: turnRow.tool_change_reason,
      rawRequest: turnRow.raw_request ? JSON.parse(turnRow.raw_request) : undefined,
      rawResponse: turnRow.raw_response ? JSON.parse(turnRow.raw_response) : undefined,
      isAgentic: turnRow.is_agentic === 1,
      agenticIterations: turnRow.agentic_iterations,
      messages: messageRows.map(row => ({
        id: row.id,
        turnId: row.turn_id,
        sequence: row.sequence,
        role: row.role,
        content: row.content,
        toolCalls: row.tool_calls ? JSON.parse(row.tool_calls) : undefined,
        toolCallId: row.tool_call_id,
        name: row.name,
        source: row.source
      })),
      createdAt: turnRow.created_at
    };
  }

  // Delete context session
  deleteContextSession(id: string): boolean {
    const result = this.db.prepare('DELETE FROM context_sessions WHERE id = ?').run(id);
    return result.changes > 0;
  }

  // Clear all context sessions
  clearAllContextSessions(): number {
    const result = this.db.prepare('DELETE FROM context_sessions').run();
    return result.changes;
  }

  // Check if context session exists
  contextSessionExists(id: string): boolean {
    const row = this.db.prepare('SELECT 1 FROM context_sessions WHERE id = ?').get(id);
    return !!row;
  }

  // Get latest turn number for session
  getLatestTurnNumber(sessionId: string): number {
    const row = this.db.prepare(`
      SELECT MAX(turn_number) as max_turn FROM context_turns WHERE session_id = ?
    `).get(sessionId) as any;
    return row?.max_turn || 0;
  }

  // Get previous tool set ID
  getPreviousToolSetId(sessionId: string): string | null {
    const row = this.db.prepare(`
      SELECT tool_set_id FROM context_turns 
      WHERE session_id = ? AND tool_set_id IS NOT NULL
      ORDER BY turn_number DESC LIMIT 1
    `).get(sessionId) as any;
    return row?.tool_set_id || null;
  }

  // Update session name (for title generation)
  updateContextSessionName(sessionId: string, name: string): boolean {
    const result = this.db.prepare(`
      UPDATE context_sessions SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(name, sessionId);
    return result.changes > 0;
  }

  // Get the most recent session (within time window)
  getMostRecentSession(withinSeconds: number = 30): ContextSessionDB | null {
    const row = this.db.prepare(`
      SELECT * FROM context_sessions 
      WHERE datetime(created_at) >= datetime('now', '-' || ? || ' seconds')
      ORDER BY created_at DESC 
      LIMIT 1
    `).get(withinSeconds) as any;
    
    if (!row) return null;
    
    return {
      id: row.id,
      name: row.name,
      ide: row.ide,
      ideMapping: row.ide_mapping,
      systemPromptId: row.system_prompt_id,
      systemPrompt: row.system_prompt_id ? this.getSystemPrompt(row.system_prompt_id) || undefined : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      turns: [] // Don't load turns for this quick lookup
    };
  }

  // ============================================================
  // RAG SYSTEM
  // ============================================================

  // Get current RAG index info
  getRAGIndex(): {
    id: string;
    name: string | null;
    projectPath: string;
    projectHash: string;
    embeddingModel: string | null;
    embeddingDimensions: number;
    totalFiles: number;
    totalChunks: number;
    totalVectors: number;
    storageSize: number;
    status: string;
    lastIndexedAt: string | null;
    createdAt: string;
    updatedAt: string;
  } | null {
    const row = this.db.prepare('SELECT * FROM rag_index WHERE id = ?').get('active') as any;
    if (!row) return null;
    
    return {
      id: row.id,
      name: row.name,
      projectPath: row.project_path,
      projectHash: row.project_hash,
      embeddingModel: row.embedding_model,
      embeddingDimensions: row.embedding_dimensions,
      totalFiles: row.total_files,
      totalChunks: row.total_chunks,
      totalVectors: row.total_vectors,
      storageSize: row.storage_size,
      status: row.status,
      lastIndexedAt: row.last_indexed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  // Create or update RAG index
  upsertRAGIndex(index: {
    name?: string;
    projectPath: string;
    projectHash: string;
    embeddingModel?: string;
    embeddingDimensions?: number;
    status?: string;
  }): void {
    this.db.prepare(`
      INSERT INTO rag_index (id, name, project_path, project_hash, embedding_model, embedding_dimensions, status)
      VALUES ('active', ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        project_path = excluded.project_path,
        project_hash = excluded.project_hash,
        embedding_model = excluded.embedding_model,
        embedding_dimensions = excluded.embedding_dimensions,
        status = excluded.status,
        updated_at = CURRENT_TIMESTAMP
    `).run(
      index.name || null,
      index.projectPath,
      index.projectHash,
      index.embeddingModel || null,
      index.embeddingDimensions || 768,
      index.status || 'pending'
    );
  }

  // Update RAG index status
  updateRAGIndexStatus(status: string, stats?: {
    totalFiles?: number;
    totalChunks?: number;
    totalVectors?: number;
    storageSize?: number;
  }): void {
    let query = 'UPDATE rag_index SET status = ?, updated_at = CURRENT_TIMESTAMP';
    const params: any[] = [status];
    
    if (stats) {
      if (stats.totalFiles !== undefined) {
        query += ', total_files = ?';
        params.push(stats.totalFiles);
      }
      if (stats.totalChunks !== undefined) {
        query += ', total_chunks = ?';
        params.push(stats.totalChunks);
      }
      if (stats.totalVectors !== undefined) {
        query += ', total_vectors = ?';
        params.push(stats.totalVectors);
      }
      if (stats.storageSize !== undefined) {
        query += ', storage_size = ?';
        params.push(stats.storageSize);
      }
    }
    
    if (status === 'ready') {
      query += ', last_indexed_at = CURRENT_TIMESTAMP';
    }
    
    query += " WHERE id = 'active'";
    this.db.prepare(query).run(...params);
  }

  // Add or update a file in RAG index
  upsertRAGFile(file: {
    id: string;
    filePath: string;
    fileHash: string;
    fileSize: number;
    chunkCount: number;
    language: string;
  }): void {
    this.db.prepare(`
      INSERT INTO rag_files (id, file_path, file_hash, file_size, chunk_count, language)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(file_path) DO UPDATE SET
        id = excluded.id,
        file_hash = excluded.file_hash,
        file_size = excluded.file_size,
        chunk_count = excluded.chunk_count,
        language = excluded.language,
        indexed_at = CURRENT_TIMESTAMP
    `).run(file.id, file.filePath, file.fileHash, file.fileSize, file.chunkCount, file.language);
  }

  // Get RAG file by path
  getRAGFile(filePath: string): {
    id: string;
    filePath: string;
    fileHash: string;
    fileSize: number;
    chunkCount: number;
    language: string;
    indexedAt: string;
  } | null {
    const row = this.db.prepare('SELECT * FROM rag_files WHERE file_path = ?').get(filePath) as any;
    if (!row) return null;
    
    return {
      id: row.id,
      filePath: row.file_path,
      fileHash: row.file_hash,
      fileSize: row.file_size,
      chunkCount: row.chunk_count,
      language: row.language,
      indexedAt: row.indexed_at
    };
  }

  // Get all RAG files
  getRAGFiles(): Array<{
    id: string;
    filePath: string;
    fileHash: string;
    fileSize: number;
    chunkCount: number;
    language: string;
    indexedAt: string;
  }> {
    const rows = this.db.prepare('SELECT * FROM rag_files ORDER BY file_path').all() as any[];
    return rows.map(row => ({
      id: row.id,
      filePath: row.file_path,
      fileHash: row.file_hash,
      fileSize: row.file_size,
      chunkCount: row.chunk_count,
      language: row.language,
      indexedAt: row.indexed_at
    }));
  }

  // Delete RAG file and its chunks
  deleteRAGFile(filePath: string): boolean {
    const file = this.getRAGFile(filePath);
    if (!file) return false;
    
    const result = this.db.prepare('DELETE FROM rag_files WHERE file_path = ?').run(filePath);
    return result.changes > 0;
  }

  // Add a chunk
  addRAGChunk(chunk: {
    id: string;
    fileId: string;
    vectorId: number;
    content: string;
    contentHash: string;
    tokens: number;
    startLine: number;
    endLine: number;
    symbolName?: string;
    symbolType?: string;
    language: string;
    imports?: string[];
    signature?: string;
  }): void {
    this.db.prepare(`
      INSERT INTO rag_chunks 
      (id, file_id, vector_id, content, content_hash, tokens, start_line, end_line, symbol_name, symbol_type, language, imports, signature)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      chunk.id,
      chunk.fileId,
      chunk.vectorId,
      chunk.content,
      chunk.contentHash,
      chunk.tokens,
      chunk.startLine,
      chunk.endLine,
      chunk.symbolName || null,
      chunk.symbolType || null,
      chunk.language,
      chunk.imports ? JSON.stringify(chunk.imports) : null,
      chunk.signature || null
    );
  }

  // Get chunk by ID
  getRAGChunk(id: string): {
    id: string;
    fileId: string;
    vectorId: number;
    content: string;
    contentHash: string;
    tokens: number;
    startLine: number;
    endLine: number;
    symbolName: string | null;
    symbolType: string | null;
    language: string;
    imports: string[];
    signature: string | null;
    filePath?: string;
  } | null {
    const row = this.db.prepare(`
      SELECT c.*, f.file_path 
      FROM rag_chunks c 
      JOIN rag_files f ON c.file_id = f.id 
      WHERE c.id = ?
    `).get(id) as any;
    if (!row) return null;
    
    return {
      id: row.id,
      fileId: row.file_id,
      vectorId: row.vector_id,
      content: row.content,
      contentHash: row.content_hash,
      tokens: row.tokens,
      startLine: row.start_line,
      endLine: row.end_line,
      symbolName: row.symbol_name,
      symbolType: row.symbol_type,
      language: row.language,
      imports: row.imports ? JSON.parse(row.imports) : [],
      signature: row.signature,
      filePath: row.file_path
    };
  }

  // Get chunk by vector ID
  getRAGChunkByVectorId(vectorId: number): typeof this.getRAGChunk extends (id: string) => infer R ? R : never {
    const row = this.db.prepare(`
      SELECT c.*, f.file_path 
      FROM rag_chunks c 
      JOIN rag_files f ON c.file_id = f.id 
      WHERE c.vector_id = ?
    `).get(vectorId) as any;
    if (!row) return null;
    
    return {
      id: row.id,
      fileId: row.file_id,
      vectorId: row.vector_id,
      content: row.content,
      contentHash: row.content_hash,
      tokens: row.tokens,
      startLine: row.start_line,
      endLine: row.end_line,
      symbolName: row.symbol_name,
      symbolType: row.symbol_type,
      language: row.language,
      imports: row.imports ? JSON.parse(row.imports) : [],
      signature: row.signature,
      filePath: row.file_path
    };
  }

  // Get chunks with pagination and filters
  getRAGChunks(options: {
    page?: number;
    limit?: number;
    fileType?: string;
    symbolType?: string;
    search?: string;
  } = {}): {
    chunks: Array<{
      id: string;
      filePath: string;
      symbolName: string | null;
      symbolType: string | null;
      startLine: number;
      endLine: number;
      tokens: number;
      language: string;
      preview: string;
    }>;
    total: number;
  } {
    const page = options.page || 1;
    const limit = options.limit || 50;
    const offset = (page - 1) * limit;
    
    let whereClause = '1=1';
    const params: any[] = [];
    
    if (options.fileType) {
      whereClause += ' AND c.language = ?';
      params.push(options.fileType);
    }
    if (options.symbolType) {
      whereClause += ' AND c.symbol_type = ?';
      params.push(options.symbolType);
    }
    if (options.search) {
      whereClause += ' AND (c.content LIKE ? OR c.symbol_name LIKE ? OR f.file_path LIKE ?)';
      const searchPattern = `%${options.search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }
    
    // Get total count
    const countRow = this.db.prepare(`
      SELECT COUNT(*) as count FROM rag_chunks c
      JOIN rag_files f ON c.file_id = f.id
      WHERE ${whereClause}
    `).get(...params) as any;
    
    // Get paginated results
    const rows = this.db.prepare(`
      SELECT c.id, f.file_path, c.symbol_name, c.symbol_type, c.start_line, c.end_line, c.tokens, c.language, SUBSTR(c.content, 1, 200) as preview
      FROM rag_chunks c
      JOIN rag_files f ON c.file_id = f.id
      WHERE ${whereClause}
      ORDER BY f.file_path, c.start_line
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as any[];
    
    return {
      chunks: rows.map(row => ({
        id: row.id,
        filePath: row.file_path,
        symbolName: row.symbol_name,
        symbolType: row.symbol_type,
        startLine: row.start_line,
        endLine: row.end_line,
        tokens: row.tokens,
        language: row.language,
        preview: row.preview
      })),
      total: countRow?.count || 0
    };
  }

  // Delete chunks for a file
  deleteRAGChunksForFile(fileId: string): number {
    const result = this.db.prepare('DELETE FROM rag_chunks WHERE file_id = ?').run(fileId);
    return result.changes;
  }

  // Clear all RAG data
  clearAllRAGData(): { files: number; chunks: number } {
    const chunksResult = this.db.prepare('DELETE FROM rag_chunks').run();
    const filesResult = this.db.prepare('DELETE FROM rag_files').run();
    this.db.prepare('DELETE FROM rag_index').run();
    this.db.prepare('DELETE FROM rag_metrics').run();
    this.db.prepare('DELETE FROM rag_projections').run();
    
    return {
      files: filesResult.changes,
      chunks: chunksResult.changes
    };
  }

  // Add RAG metric
  addRAGMetric(metric: {
    type: 'indexing' | 'query';
    filesProcessed?: number;
    chunksCreated?: number;
    embeddingsGenerated?: number;
    durationMs?: number;
    query?: string;
    resultsCount?: number;
    topScore?: number;
    latencyMs?: number;
    error?: string;
  }): void {
    this.db.prepare(`
      INSERT INTO rag_metrics 
      (type, files_processed, chunks_created, embeddings_generated, duration_ms, query, results_count, top_score, latency_ms, error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      metric.type,
      metric.filesProcessed || 0,
      metric.chunksCreated || 0,
      metric.embeddingsGenerated || 0,
      metric.durationMs || 0,
      metric.query || null,
      metric.resultsCount || 0,
      metric.topScore || 0,
      metric.latencyMs || 0,
      metric.error || null
    );
  }

  // Get RAG metrics for dashboard
  getRAGMetrics(type?: 'indexing' | 'query', limit: number = 100): Array<{
    id: number;
    type: string;
    timestamp: string;
    filesProcessed: number;
    chunksCreated: number;
    embeddingsGenerated: number;
    durationMs: number;
    query: string | null;
    resultsCount: number;
    topScore: number;
    latencyMs: number;
    error: string | null;
  }> {
    let query = 'SELECT * FROM rag_metrics';
    const params: any[] = [];
    
    if (type) {
      query += ' WHERE type = ?';
      params.push(type);
    }
    
    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);
    
    const rows = this.db.prepare(query).all(...params) as any[];
    
    return rows.map(row => ({
      id: row.id,
      type: row.type,
      timestamp: row.timestamp,
      filesProcessed: row.files_processed,
      chunksCreated: row.chunks_created,
      embeddingsGenerated: row.embeddings_generated,
      durationMs: row.duration_ms,
      query: row.query,
      resultsCount: row.results_count,
      topScore: row.top_score,
      latencyMs: row.latency_ms,
      error: row.error
    }));
  }

  // Save/update 2D projection for a chunk
  upsertRAGProjection(chunkId: string, x: number, y: number): void {
    this.db.prepare(`
      INSERT INTO rag_projections (chunk_id, x, y)
      VALUES (?, ?, ?)
      ON CONFLICT(chunk_id) DO UPDATE SET
        x = excluded.x,
        y = excluded.y,
        computed_at = CURRENT_TIMESTAMP
    `).run(chunkId, x, y);
  }

  // Get all projections for visualization
  getRAGProjections(): Array<{
    chunkId: string;
    x: number;
    y: number;
    filePath: string;
    symbolName: string | null;
    symbolType: string | null;
    language: string;
  }> {
    const rows = this.db.prepare(`
      SELECT p.chunk_id, p.x, p.y, f.file_path, c.symbol_name, c.symbol_type, c.language
      FROM rag_projections p
      JOIN rag_chunks c ON p.chunk_id = c.id
      JOIN rag_files f ON c.file_id = f.id
    `).all() as any[];
    
    return rows.map(row => ({
      chunkId: row.chunk_id,
      x: row.x,
      y: row.y,
      filePath: row.file_path,
      symbolName: row.symbol_name,
      symbolType: row.symbol_type,
      language: row.language
    }));
  }

  // ============================================================
  // RAG CONFIG
  // ============================================================

  // Get RAG configuration
  getRAGConfig(): {
    lmstudio: {
      model: string | null;
      loadOnDemand: boolean;
    };
    storage: {
      dataPath: string | null;
    };
    indexing: {
      chunkSize: number;
      chunkOverlap: number;
      includePatterns: string[];
      excludePatterns: string[];
    };
    watcher: {
      enabled: boolean;
      debounceMs: number;
    };
    project: {
      path: string | null;
      autoDetect: boolean;
    };
  } | null {
    const row = this.db.prepare(`SELECT * FROM rag_config WHERE id = 'active'`).get() as any;
    
    if (!row) {
      // Return default config if none exists
      return {
        lmstudio: { model: null, loadOnDemand: true },
        storage: { dataPath: null },
        indexing: {
          chunkSize: 1500,
          chunkOverlap: 200,
          includePatterns: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.py', '**/*.go', '**/*.rs', '**/*.java', '**/*.cpp', '**/*.c', '**/*.h', '**/*.cs', '**/*.rb', '**/*.php', '**/*.swift', '**/*.kt'],
          excludePatterns: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**', '**/vendor/**', '**/__pycache__/**', '**/target/**']
        },
        watcher: { enabled: true, debounceMs: 1000 },
        project: { path: null, autoDetect: true }
      };
    }
    
    return {
      lmstudio: {
        model: row.lmstudio_model,
        loadOnDemand: !!row.lmstudio_load_on_demand
      },
      storage: {
        dataPath: row.storage_data_path
      },
      indexing: {
        chunkSize: row.indexing_chunk_size || 1500,
        chunkOverlap: row.indexing_chunk_overlap || 200,
        includePatterns: JSON.parse(row.indexing_include_patterns || '[]'),
        excludePatterns: JSON.parse(row.indexing_exclude_patterns || '[]')
      },
      watcher: {
        enabled: !!row.watcher_enabled,
        debounceMs: row.watcher_debounce_ms || 1000
      },
      project: {
        path: row.project_path,
        autoDetect: !!row.project_auto_detect
      }
    };
  }

  // Save RAG configuration
  saveRAGConfig(config: {
    lmstudio?: { model?: string | null; loadOnDemand?: boolean };
    storage?: { dataPath?: string | null };
    indexing?: { chunkSize?: number; chunkOverlap?: number; includePatterns?: string[]; excludePatterns?: string[] };
    watcher?: { enabled?: boolean; debounceMs?: number };
    project?: { path?: string | null; autoDetect?: boolean };
  }): boolean {
    try {
      // Get current config
      const current = this.getRAGConfig();
      if (!current) return false;
      
      // Merge with new values
      const merged = {
        lmstudio: { ...current.lmstudio, ...config.lmstudio },
        storage: { ...current.storage, ...config.storage },
        indexing: { ...current.indexing, ...config.indexing },
        watcher: { ...current.watcher, ...config.watcher },
        project: { ...current.project, ...config.project }
      };
      
      // Check if config exists
      const exists = this.db.prepare(`SELECT 1 FROM rag_config WHERE id = 'active'`).get();
      
      if (exists) {
        this.db.prepare(`
          UPDATE rag_config SET
            lmstudio_model = ?,
            lmstudio_load_on_demand = ?,
            storage_data_path = ?,
            indexing_chunk_size = ?,
            indexing_chunk_overlap = ?,
            indexing_include_patterns = ?,
            indexing_exclude_patterns = ?,
            watcher_enabled = ?,
            watcher_debounce_ms = ?,
            project_path = ?,
            project_auto_detect = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = 'active'
        `).run(
          merged.lmstudio.model,
          merged.lmstudio.loadOnDemand ? 1 : 0,
          merged.storage.dataPath,
          merged.indexing.chunkSize,
          merged.indexing.chunkOverlap,
          JSON.stringify(merged.indexing.includePatterns),
          JSON.stringify(merged.indexing.excludePatterns),
          merged.watcher.enabled ? 1 : 0,
          merged.watcher.debounceMs,
          merged.project.path,
          merged.project.autoDetect ? 1 : 0
        );
      } else {
        this.db.prepare(`
          INSERT INTO rag_config (
            id, lmstudio_model, lmstudio_load_on_demand, storage_data_path,
            indexing_chunk_size, indexing_chunk_overlap, indexing_include_patterns, indexing_exclude_patterns,
            watcher_enabled, watcher_debounce_ms, project_path, project_auto_detect
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          'active',
          merged.lmstudio.model,
          merged.lmstudio.loadOnDemand ? 1 : 0,
          merged.storage.dataPath,
          merged.indexing.chunkSize,
          merged.indexing.chunkOverlap,
          JSON.stringify(merged.indexing.includePatterns),
          JSON.stringify(merged.indexing.excludePatterns),
          merged.watcher.enabled ? 1 : 0,
          merged.watcher.debounceMs,
          merged.project.path,
          merged.project.autoDetect ? 1 : 0
        );
      }
      
      console.log('[DB] RAG config saved:', merged.lmstudio.model, merged.project.path);
      return true;
    } catch (error) {
      console.error('[DB] Failed to save RAG config:', error);
      return false;
    }
  }

  // ============================================================
  // CUSTOM TESTS CRUD
  // ============================================================

  createCustomTest(test: {
    id?: string;
    name: string;
    category: string;
    prompt: string;
    expectedTool?: string;
    expectedBehavior?: string;
    difficulty?: string;
    variants?: any[];
  }): string {
    const id = test.id || uuidv4();
    const now = new Date().toISOString();
    
    const stmt = this.db.prepare(`
      INSERT INTO custom_tests (id, name, category, prompt, expected_tool, expected_behavior, difficulty, variants, is_builtin, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `);
    
    stmt.run(
      id,
      test.name,
      test.category,
      test.prompt,
      test.expectedTool || null,
      test.expectedBehavior || null,
      test.difficulty || 'medium',
      test.variants ? JSON.stringify(test.variants) : null,
      now,
      now
    );
    
    return id;
  }

  getCustomTests(): any[] {
    const stmt = this.db.prepare('SELECT * FROM custom_tests ORDER BY category, name');
    const rows = stmt.all() as any[];
    
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      category: row.category,
      prompt: row.prompt,
      expectedTool: row.expected_tool,
      expectedBehavior: row.expected_behavior,
      difficulty: row.difficulty,
      variants: row.variants ? JSON.parse(row.variants) : [],
      isBuiltin: row.is_builtin === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  getCustomTest(id: string): any | null {
    const stmt = this.db.prepare('SELECT * FROM custom_tests WHERE id = ?');
    const row = stmt.get(id) as any;
    
    if (!row) return null;
    
    return {
      id: row.id,
      name: row.name,
      category: row.category,
      prompt: row.prompt,
      expectedTool: row.expected_tool,
      expectedBehavior: row.expected_behavior,
      difficulty: row.difficulty,
      variants: row.variants ? JSON.parse(row.variants) : [],
      isBuiltin: row.is_builtin === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  updateCustomTest(id: string, updates: {
    name?: string;
    category?: string;
    prompt?: string;
    expectedTool?: string;
    expectedBehavior?: string;
    difficulty?: string;
    variants?: any[];
  }): boolean {
    const test = this.getCustomTest(id);
    if (!test || test.isBuiltin) return false;
    
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE custom_tests SET
        name = COALESCE(?, name),
        category = COALESCE(?, category),
        prompt = COALESCE(?, prompt),
        expected_tool = COALESCE(?, expected_tool),
        expected_behavior = COALESCE(?, expected_behavior),
        difficulty = COALESCE(?, difficulty),
        variants = COALESCE(?, variants),
        updated_at = ?
      WHERE id = ? AND is_builtin = 0
    `);
    
    const result = stmt.run(
      updates.name || null,
      updates.category || null,
      updates.prompt || null,
      updates.expectedTool || null,
      updates.expectedBehavior || null,
      updates.difficulty || null,
      updates.variants ? JSON.stringify(updates.variants) : null,
      now,
      id
    );
    
    return result.changes > 0;
  }

  deleteCustomTest(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM custom_tests WHERE id = ? AND is_builtin = 0');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  // ============================================================
  // MODEL INFO CACHE
  // ============================================================

  cacheModelInfo(modelId: string, info: any, source: string): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO model_info (model_id, info, fetched_at, source)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(modelId, JSON.stringify(info), new Date().toISOString(), source);
  }

  getCachedModelInfo(modelId: string): any | null {
    const stmt = this.db.prepare('SELECT * FROM model_info WHERE model_id = ?');
    const row = stmt.get(modelId) as any;
    
    if (!row) return null;
    
    return {
      modelId: row.model_id,
      info: JSON.parse(row.info),
      fetchedAt: row.fetched_at,
      source: row.source,
    };
  }

  // ============================================================
  // UTILITIES
  // ============================================================

  close(): void {
    this.db.close();
  }

  // Run a scheduled cleanup job
  runCleanup(): { backupsDeleted: number } {
    const backupsDeleted = this.cleanupExpiredBackups();
    return { backupsDeleted };
  }
}

// Export singleton instance
export const db = new DatabaseService();

// Export types
export type { DatabaseService };

