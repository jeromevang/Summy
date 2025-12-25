import { v4 as uuidv4 } from 'uuid';
import { DBBase } from './db-base.js';

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

export interface LogFilters {
    tool?: string;
    status?: string;
    sessionId?: string;
    limit?: number;
    offset?: number;
}

export class DBAnalytics extends DBBase {
    public recordAnalytics(entry: AnalyticsEntry): void {
        this.run(`
      INSERT INTO analytics 
      (type, model, provider, tokens_input, tokens_output, tokens_saved, duration_ms, success, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
            entry.type,
            entry.model || null,
            entry.provider || null,
            entry.tokensInput || 0,
            entry.tokensOutput || 0,
            entry.tokensSaved || 0,
            entry.durationMs || 0,
            entry.success !== false ? 1 : 0,
            entry.metadata ? JSON.stringify(entry.metadata) : null
        ]);
    }

    public getAnalyticsSummary(period: 'day' | 'week' | 'month'): AnalyticsSummary {
        const periodMap = {
            day: '-1 day',
            week: '-7 days',
            month: '-30 days'
        };
        const since = periodMap[period];

        const summary = this.get(`
      SELECT 
        COUNT(*) as total_requests,
        SUM(tokens_input) as tokens_original,
        SUM(tokens_input - tokens_saved) as tokens_compressed,
        SUM(tokens_saved) as tokens_saved
      FROM analytics 
      WHERE timestamp > datetime('now', ?)
    `, [since]);

        const toolStats = this.get(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful
      FROM analytics 
      WHERE type = 'tool' AND timestamp > datetime('now', ?)
    `, [since]);

        const dailyRows = this.query(`
      SELECT 
        DATE(timestamp) as date,
        COUNT(*) as requests,
        SUM(CASE WHEN type = 'tool' THEN 1 ELSE 0 END) as tool_calls
      FROM analytics 
      WHERE timestamp > datetime('now', ?)
      GROUP BY DATE(timestamp)
      ORDER BY date DESC
    `, [since]);

        const toolUsage = this.query(`
      SELECT 
        json_extract(metadata, '$.tool') as tool,
        COUNT(*) as count,
        AVG(CASE WHEN success = 1 THEN 100.0 ELSE 0.0 END) as success_rate
      FROM analytics 
      WHERE type = 'tool' AND timestamp > datetime('now', ?)
      GROUP BY json_extract(metadata, '$.tool')
      ORDER BY count DESC
      LIMIT 10
    `, [since]);

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

    public logExecution(log: ExecutionLog): string {
        const id = log.id || uuidv4();
        this.run(`
      INSERT INTO execution_logs 
      (id, session_id, model, tool, arguments, result, status, duration_ms, error_message, backup_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
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
        ]);
        return id;
    }

    public getExecutionLogs(filters: LogFilters = {}): ExecutionLog[] {
        let sql = 'SELECT * FROM execution_logs WHERE 1=1';
        const params: any[] = [];

        if (filters.tool) {
            sql += ' AND tool = ?';
            params.push(filters.tool);
        }
        if (filters.status) {
            sql += ' AND status = ?';
            params.push(filters.status);
        }
        if (filters.sessionId) {
            sql += ' AND session_id = ?';
            params.push(filters.sessionId);
        }

        sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
        params.push(filters.limit || 50, filters.offset || 0);

        const rows = this.query(sql, params);

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

    public getExecutionLog(id: string): ExecutionLog | null {
        const row = this.get('SELECT * FROM execution_logs WHERE id = ?', [id]);
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

    public createBackup(backup: FileBackup): string {
        const id = backup.id || uuidv4();
        const expiresAt = backup.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

        this.run(`
      INSERT INTO file_backups 
      (id, execution_log_id, file_path, original_content, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `, [id, backup.executionLogId, backup.filePath, backup.originalContent, expiresAt]);
        return id;
    }

    public getBackup(id: string): FileBackup | null {
        const row = this.get('SELECT * FROM file_backups WHERE id = ?', [id]);
        if (!row) return null;

        return {
            id: row.id,
            executionLogId: row.execution_log_id,
            filePath: row.file_path,
            originalContent: row.original_content,
            expiresAt: row.expires_at
        };
    }

    public markBackupRestored(id: string): void {
        this.run('UPDATE file_backups SET restored = 1 WHERE id = ?', [id]);
    }

    public cleanupExpiredBackups(): number {
        const result = this.run(`
      DELETE FROM file_backups 
      WHERE expires_at < datetime('now') AND restored = 0
    `);
        return result.changes;
    }

    public getBackupsForLog(executionLogId: string): FileBackup[] {
        const rows = this.query('SELECT * FROM file_backups WHERE execution_log_id = ?', [executionLogId]);

        return rows.map(row => ({
            id: row.id,
            executionLogId: row.execution_log_id,
            filePath: row.file_path,
            originalContent: row.original_content,
            expiresAt: row.expires_at
        }));
    }
}
