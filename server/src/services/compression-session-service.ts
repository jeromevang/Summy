/**
 * Compression Session Service
 *
 * Manages smart context compression sessions and their storage in the database.
 * Handles CRUD operations for compression sessions and their metadata.
 *
 * Part of Smart Context Compression System
 */

import { dbManager } from './db/connection.js';
import crypto from 'crypto';
import type { CompressionResult, CompressionStats, CompressionDecision, CompressionMode } from '../modules/tooly/context/index.js';

// ============================================================
// TYPES
// ============================================================

export interface CompressionSession {
  id: string;
  claudeSessionId: string | null;
  transcriptHash: string;
  uncompressedData: string;  // JSONL
  compressedData: string | null;  // JSONL
  compressionEnabled: boolean;
  compressionMode: CompressionMode;
  llmProvider: 'lmstudio' | 'claude';
  useRAG: boolean;
  decisions: CompressionDecision[] | null;
  stats: CompressionStats | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCompressionSessionInput {
  claudeSessionId?: string;
  transcript: string;  // JSONL format
  compressionEnabled?: boolean;
  compressionMode?: CompressionMode;
  llmProvider?: 'lmstudio' | 'claude';
  useRAG?: boolean;
  compressionResult?: CompressionResult;
}

export interface UpdateCompressionSessionInput {
  compressionEnabled?: boolean;
  compressionMode?: CompressionMode;
  llmProvider?: 'lmstudio' | 'claude';
  useRAG?: boolean;
  compressionResult?: CompressionResult;
}

// ============================================================
// COMPRESSION SESSION SERVICE
// ============================================================

class CompressionSessionService {
  /**
   * Get database connection
   */
  private getDb() {
    return dbManager.getConnection();
  }

  /**
   * Create a new compression session
   */
  async createSession(input: CreateCompressionSessionInput): Promise<CompressionSession> {
    const id = this.generateId();
    const transcriptHash = this.hashTranscript(input.transcript);

    const session = {
      id,
      claude_session_id: input.claudeSessionId || null,
      transcript_hash: transcriptHash,
      uncompressed_data: input.transcript,
      compressed_data: input.compressionResult
        ? this.resultToJSONL(input.compressionResult.compressedTranscript)
        : null,
      compression_enabled: input.compressionEnabled ?? true,
      compression_mode: input.compressionMode || 'conservative',
      llm_provider: input.llmProvider || 'lmstudio',
      use_rag: input.useRAG ?? false,
      decisions: input.compressionResult?.decisions ? JSON.stringify(input.compressionResult.decisions) : null,
      stats: input.compressionResult?.stats ? JSON.stringify(input.compressionResult.stats) : null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const db = this.getDb();
    db.prepare(
      `INSERT INTO compression_sessions (
        id, claude_session_id, transcript_hash, uncompressed_data, compressed_data,
        compression_enabled, compression_mode, llm_provider, use_rag,
        decisions, stats, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      session.id,
      session.claude_session_id,
      session.transcript_hash,
      session.uncompressed_data,
      session.compressed_data,
      session.compression_enabled ? 1 : 0,
      session.compression_mode,
      session.llm_provider,
      session.use_rag ? 1 : 0,
      session.decisions,
      session.stats,
      session.created_at,
      session.updated_at
    );

    return this.normalizeSession(session);
  }

  /**
   * Get session by ID
   */
  async getSessionById(id: string): Promise<CompressionSession | null> {
    const row = await db.get(
      'SELECT * FROM compression_sessions WHERE id = ?',
      [id]
    );

    return row ? this.normalizeSession(row) : null;
  }

  /**
   * Get session by Claude session ID
   */
  async getSessionByClaudeId(claudeSessionId: string): Promise<CompressionSession | null> {
    const row = await db.get(
      'SELECT * FROM compression_sessions WHERE claude_session_id = ?',
      [claudeSessionId]
    );

    return row ? this.normalizeSession(row) : null;
  }

  /**
   * Get session by transcript hash (find existing session for same transcript)
   */
  async getSessionByTranscriptHash(hash: string): Promise<CompressionSession | null> {
    const row = await db.get(
      'SELECT * FROM compression_sessions WHERE transcript_hash = ?',
      [hash]
    );

    return row ? this.normalizeSession(row) : null;
  }

  /**
   * Find or create session for a transcript
   */
  async findOrCreateSession(input: CreateCompressionSessionInput): Promise<CompressionSession> {
    const transcriptHash = this.hashTranscript(input.transcript);

    // Try to find existing session
    let session: CompressionSession | null = null;

    if (input.claudeSessionId) {
      session = await this.getSessionByClaudeId(input.claudeSessionId);
    }

    if (!session) {
      session = await this.getSessionByTranscriptHash(transcriptHash);
    }

    if (session) {
      // Update existing session
      return this.updateSession(session.id, {
        compressionEnabled: input.compressionEnabled,
        compressionMode: input.compressionMode,
        llmProvider: input.llmProvider,
        useRAG: input.useRAG,
        compressionResult: input.compressionResult
      });
    }

    // Create new session
    return this.createSession(input);
  }

  /**
   * Update session
   */
  async updateSession(id: string, input: UpdateCompressionSessionInput): Promise<CompressionSession> {
    const session = await this.getSessionById(id);

    if (!session) {
      throw new Error(`Session ${id} not found`);
    }

    const updates: any = {
      updated_at: new Date().toISOString()
    };

    if (input.compressionEnabled !== undefined) {
      updates.compression_enabled = input.compressionEnabled ? 1 : 0;
    }

    if (input.compressionMode) {
      updates.compression_mode = input.compressionMode;
    }

    if (input.llmProvider) {
      updates.llm_provider = input.llmProvider;
    }

    if (input.useRAG !== undefined) {
      updates.use_rag = input.useRAG ? 1 : 0;
    }

    if (input.compressionResult) {
      updates.compressed_data = this.resultToJSONL(input.compressionResult.compressedTranscript);
      updates.decisions = JSON.stringify(input.compressionResult.decisions);
      updates.stats = JSON.stringify(input.compressionResult.stats);
    }

    // Build UPDATE query
    const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = [...Object.values(updates), id];

    await db.run(
      `UPDATE compression_sessions SET ${setClause} WHERE id = ?`,
      values
    );

    return this.getSessionById(id) as Promise<CompressionSession>;
  }

  /**
   * Toggle compression enabled/disabled
   */
  async toggleCompression(id: string, enabled: boolean): Promise<CompressionSession> {
    return this.updateSession(id, { compressionEnabled: enabled });
  }

  /**
   * Update compression settings
   */
  async updateSettings(id: string, settings: {
    mode?: CompressionMode;
    provider?: 'lmstudio' | 'claude';
    useRAG?: boolean;
  }): Promise<CompressionSession> {
    return this.updateSession(id, {
      compressionMode: settings.mode,
      llmProvider: settings.provider,
      useRAG: settings.useRAG
    });
  }

  /**
   * Get all sessions
   */
  async getAllSessions(limit: number = 100, offset: number = 0): Promise<CompressionSession[]> {
    const rows = await db.all(
      'SELECT * FROM compression_sessions ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [limit, offset]
    );

    return rows.map(row => this.normalizeSession(row));
  }

  /**
   * Get sessions with compression enabled
   */
  async getEnabledSessions(): Promise<CompressionSession[]> {
    const rows = await db.all(
      'SELECT * FROM compression_sessions WHERE compression_enabled = 1 ORDER BY created_at DESC'
    );

    return rows.map(row => this.normalizeSession(row));
  }

  /**
   * Delete session
   */
  async deleteSession(id: string): Promise<void> {
    // Delete related compression turns first
    await db.run('DELETE FROM compression_turns WHERE session_id = ?', [id]);

    // Delete session
    await db.run('DELETE FROM compression_sessions WHERE id = ?', [id]);
  }

  /**
   * Delete old sessions (older than days)
   */
  async deleteOldSessions(days: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const result = await db.run(
      'DELETE FROM compression_sessions WHERE created_at < ?',
      [cutoffDate.toISOString()]
    );

    return result.changes || 0;
  }

  /**
   * Get session statistics
   */
  async getSessionStats(): Promise<{
    totalSessions: number;
    enabledSessions: number;
    totalCompressions: number;
    averageCompressionRatio: number;
    totalTokensSaved: number;
  }> {
    const db = this.getDb();
    const total = db.prepare('SELECT COUNT(*) as count FROM compression_sessions').get() as any;
    const enabled = db.prepare('SELECT COUNT(*) as count FROM compression_sessions WHERE compression_enabled = 1').get() as any;

    const statsRows = db.prepare(
      'SELECT stats FROM compression_sessions WHERE stats IS NOT NULL'
    ).all() as any[];

    let totalCompressions = 0;
    let totalCompressionRatio = 0;
    let totalTokensSaved = 0;

    for (const row of statsRows) {
      if (row.stats) {
        const stats = JSON.parse(row.stats);
        totalCompressions++;
        totalCompressionRatio += stats.compressionRatio || 0;
        totalTokensSaved += stats.tokensSaved || 0;
      }
    }

    return {
      totalSessions: total?.count || 0,
      enabledSessions: enabled?.count || 0,
      totalCompressions,
      averageCompressionRatio: totalCompressions > 0 ? totalCompressionRatio / totalCompressions : 0,
      totalTokensSaved
    };
  }

  /**
   * Export session as JSON
   */
  async exportSession(id: string): Promise<{
    uncompressed: string;
    compressed: string;
    decisions: CompressionDecision[];
    stats: CompressionStats;
  }> {
    const session = await this.getSessionById(id);

    if (!session) {
      throw new Error(`Session ${id} not found`);
    }

    return {
      uncompressed: session.uncompressedData,
      compressed: session.compressedData || session.uncompressedData,
      decisions: session.decisions || [],
      stats: session.stats || this.getDefaultStats()
    };
  }

  // ============================================================
  // UTILITY METHODS
  // ============================================================

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `cs_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Hash transcript for duplicate detection
   */
  private hashTranscript(transcript: string): string {
    return crypto.createHash('sha256').update(transcript).digest('hex').substring(0, 16);
  }

  /**
   * Convert compression result to JSONL
   */
  private resultToJSONL(messages: any[]): string {
    return messages.map(msg => JSON.stringify(msg)).join('\n');
  }

  /**
   * Normalize database row to CompressionSession
   */
  private normalizeSession(row: any): CompressionSession {
    return {
      id: row.id,
      claudeSessionId: row.claude_session_id,
      transcriptHash: row.transcript_hash,
      uncompressedData: row.uncompressed_data,
      compressedData: row.compressed_data,
      compressionEnabled: Boolean(row.compression_enabled),
      compressionMode: row.compression_mode,
      llmProvider: row.llm_provider,
      useRAG: Boolean(row.use_rag),
      decisions: row.decisions ? JSON.parse(row.decisions) : null,
      stats: row.stats ? JSON.parse(row.stats) : null,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  /**
   * Get default stats object
   */
  private getDefaultStats(): CompressionStats {
    return {
      totalMessages: 0,
      preservedCount: 0,
      compressedCount: 0,
      droppedCount: 0,
      originalTokens: 0,
      compressedTokens: 0,
      tokensSaved: 0,
      compressionRatio: 1.0,
      duration: 0
    };
  }
}

// ============================================================
// SINGLETON EXPORT
// ============================================================

export const compressionSessionService = new CompressionSessionService();
