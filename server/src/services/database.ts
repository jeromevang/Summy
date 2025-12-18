import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

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
    const fs = require('fs-extra');
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

