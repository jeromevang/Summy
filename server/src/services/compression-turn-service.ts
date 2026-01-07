/**
 * Compression Turn Service
 *
 * Manages turn-by-turn compression history for tracking compression events
 * over the lifecycle of a conversation.
 *
 * Part of Smart Context Compression System
 */

import { db } from './database.js';
import type { CompressionStats, CompressionDecision } from '../modules/tooly/context/index.js';

// ============================================================
// TYPES
// ============================================================

export interface CompressionTurn {
  id: string;
  sessionId: string;
  turnNumber: number;
  messageCount: number;
  uncompressedSnapshot: string;  // JSONL
  compressedSnapshot: string;    // JSONL
  decisions: CompressionDecision[];
  stats: CompressionStats;
  triggerReason: 'threshold_reached' | 'manual' | 'forced';
  createdAt: Date;
}

export interface CreateTurnInput {
  sessionId: string;
  messageCount: number;
  uncompressedSnapshot: string;
  compressedSnapshot: string;
  decisions: CompressionDecision[];
  stats: CompressionStats;
  triggerReason: 'threshold_reached' | 'manual' | 'forced';
}

// ============================================================
// COMPRESSION TURN SERVICE
// ============================================================

class CompressionTurnService {
  /**
   * Create a new compression turn
   */
  async createTurn(input: CreateTurnInput): Promise<CompressionTurn> {
    const id = this.generateId();

    // Get next turn number for this session
    const turnNumber = await this.getNextTurnNumber(input.sessionId);

    const turn = {
      id,
      session_id: input.sessionId,
      turn_number: turnNumber,
      message_count: input.messageCount,
      uncompressed_snapshot: input.uncompressedSnapshot,
      compressed_snapshot: input.compressedSnapshot,
      decisions: JSON.stringify(input.decisions),
      stats: JSON.stringify(input.stats),
      trigger_reason: input.triggerReason,
      created_at: new Date().toISOString()
    };

    await db.run(
      `INSERT INTO compression_turns (
        id, session_id, turn_number, message_count,
        uncompressed_snapshot, compressed_snapshot,
        decisions, stats, trigger_reason, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        turn.id,
        turn.session_id,
        turn.turn_number,
        turn.message_count,
        turn.uncompressed_snapshot,
        turn.compressed_snapshot,
        turn.decisions,
        turn.stats,
        turn.trigger_reason,
        turn.created_at
      ]
    );

    return this.normalizeTurn(turn);
  }

  /**
   * Get turn by ID
   */
  async getTurnById(id: string): Promise<CompressionTurn | null> {
    const row = await db.get(
      'SELECT * FROM compression_turns WHERE id = ?',
      [id]
    );

    return row ? this.normalizeTurn(row) : null;
  }

  /**
   * Get all turns for a session
   */
  async getTurnsBySessionId(sessionId: string): Promise<CompressionTurn[]> {
    const rows = await db.all(
      'SELECT * FROM compression_turns WHERE session_id = ? ORDER BY turn_number ASC',
      [sessionId]
    );

    return rows.map(row => this.normalizeTurn(row));
  }

  /**
   * Get specific turn by session and turn number
   */
  async getTurnByNumber(sessionId: string, turnNumber: number): Promise<CompressionTurn | null> {
    const row = await db.get(
      'SELECT * FROM compression_turns WHERE session_id = ? AND turn_number = ?',
      [sessionId, turnNumber]
    );

    return row ? this.normalizeTurn(row) : null;
  }

  /**
   * Get latest turn for a session
   */
  async getLatestTurn(sessionId: string): Promise<CompressionTurn | null> {
    const row = await db.get(
      'SELECT * FROM compression_turns WHERE session_id = ? ORDER BY turn_number DESC LIMIT 1',
      [sessionId]
    );

    return row ? this.normalizeTurn(row) : null;
  }

  /**
   * Get turn count for a session
   */
  async getTurnCount(sessionId: string): Promise<number> {
    const result = await db.get(
      'SELECT COUNT(*) as count FROM compression_turns WHERE session_id = ?',
      [sessionId]
    );

    return result?.count || 0;
  }

  /**
   * Get turns with pagination
   */
  async getTurnsPaginated(
    sessionId: string,
    limit: number = 10,
    offset: number = 0
  ): Promise<{
    turns: CompressionTurn[];
    total: number;
    hasMore: boolean;
  }> {
    const total = await this.getTurnCount(sessionId);

    const rows = await db.all(
      'SELECT * FROM compression_turns WHERE session_id = ? ORDER BY turn_number DESC LIMIT ? OFFSET ?',
      [sessionId, limit, offset]
    );

    const turns = rows.map(row => this.normalizeTurn(row));

    return {
      turns,
      total,
      hasMore: offset + limit < total
    };
  }

  /**
   * Get compression timeline for visualization
   */
  async getCompressionTimeline(sessionId: string): Promise<{
    turnNumber: number;
    messageCount: number;
    tokensSaved: number;
    compressionRatio: number;
    timestamp: Date;
  }[]> {
    const turns = await this.getTurnsBySessionId(sessionId);

    return turns.map(turn => ({
      turnNumber: turn.turnNumber,
      messageCount: turn.messageCount,
      tokensSaved: turn.stats.tokensSaved,
      compressionRatio: turn.stats.compressionRatio,
      timestamp: turn.createdAt
    }));
  }

  /**
   * Get aggregated stats for a session
   */
  async getSessionAggregatedStats(sessionId: string): Promise<{
    totalTurns: number;
    totalMessageCount: number;
    totalTokensSaved: number;
    averageCompressionRatio: number;
    totalPreserved: number;
    totalCompressed: number;
    totalDropped: number;
  }> {
    const turns = await this.getTurnsBySessionId(sessionId);

    if (turns.length === 0) {
      return {
        totalTurns: 0,
        totalMessageCount: 0,
        totalTokensSaved: 0,
        averageCompressionRatio: 0,
        totalPreserved: 0,
        totalCompressed: 0,
        totalDropped: 0
      };
    }

    const latestTurn = turns[turns.length - 1];

    return {
      totalTurns: turns.length,
      totalMessageCount: latestTurn.messageCount,
      totalTokensSaved: turns.reduce((sum, t) => sum + t.stats.tokensSaved, 0),
      averageCompressionRatio: turns.reduce((sum, t) => sum + t.stats.compressionRatio, 0) / turns.length,
      totalPreserved: latestTurn.stats.preservedCount,
      totalCompressed: latestTurn.stats.compressedCount,
      totalDropped: latestTurn.stats.droppedCount
    };
  }

  /**
   * Compare two turns
   */
  async compareTurns(sessionId: string, turn1: number, turn2: number): Promise<{
    turn1: CompressionTurn;
    turn2: CompressionTurn;
    messageCountDiff: number;
    tokensSavedDiff: number;
    compressionRatioDiff: number;
  } | null> {
    const t1 = await this.getTurnByNumber(sessionId, turn1);
    const t2 = await this.getTurnByNumber(sessionId, turn2);

    if (!t1 || !t2) {
      return null;
    }

    return {
      turn1: t1,
      turn2: t2,
      messageCountDiff: t2.messageCount - t1.messageCount,
      tokensSavedDiff: t2.stats.tokensSaved - t1.stats.tokensSaved,
      compressionRatioDiff: t2.stats.compressionRatio - t1.stats.compressionRatio
    };
  }

  /**
   * Delete turns for a session
   */
  async deleteTurnsBySessionId(sessionId: string): Promise<number> {
    const result = await db.run(
      'DELETE FROM compression_turns WHERE session_id = ?',
      [sessionId]
    );

    return result.changes || 0;
  }

  /**
   * Delete turn by ID
   */
  async deleteTurn(id: string): Promise<void> {
    await db.run('DELETE FROM compression_turns WHERE id = ?', [id]);
  }

  /**
   * Delete old turns (keep only last N)
   */
  async pruneOldTurns(sessionId: string, keepLast: number = 20): Promise<number> {
    // Get all turn numbers
    const rows = await db.all(
      'SELECT turn_number FROM compression_turns WHERE session_id = ? ORDER BY turn_number DESC',
      [sessionId]
    );

    if (rows.length <= keepLast) {
      return 0;  // Nothing to prune
    }

    // Delete turns older than the threshold
    const keepThreshold = rows[keepLast - 1].turn_number;

    const result = await db.run(
      'DELETE FROM compression_turns WHERE session_id = ? AND turn_number < ?',
      [sessionId, keepThreshold]
    );

    return result.changes || 0;
  }

  /**
   * Export turn history as JSON
   */
  async exportTurnHistory(sessionId: string): Promise<any[]> {
    const turns = await this.getTurnsBySessionId(sessionId);

    return turns.map(turn => ({
      turnNumber: turn.turnNumber,
      messageCount: turn.messageCount,
      stats: turn.stats,
      decisions: turn.decisions,
      triggerReason: turn.triggerReason,
      timestamp: turn.createdAt.toISOString()
    }));
  }

  /**
   * Get compression efficiency trend
   */
  async getEfficiencyTrend(sessionId: string): Promise<{
    turnNumber: number;
    efficiency: number;  // tokens saved per message
  }[]> {
    const turns = await this.getTurnsBySessionId(sessionId);

    return turns.map(turn => ({
      turnNumber: turn.turnNumber,
      efficiency: turn.messageCount > 0
        ? turn.stats.tokensSaved / turn.messageCount
        : 0
    }));
  }

  // ============================================================
  // UTILITY METHODS
  // ============================================================

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `ct_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Get next turn number for a session
   */
  private async getNextTurnNumber(sessionId: string): Promise<number> {
    const result = await db.get(
      'SELECT MAX(turn_number) as max_turn FROM compression_turns WHERE session_id = ?',
      [sessionId]
    );

    return (result?.max_turn || 0) + 1;
  }

  /**
   * Normalize database row to CompressionTurn
   */
  private normalizeTurn(row: any): CompressionTurn {
    return {
      id: row.id,
      sessionId: row.session_id,
      turnNumber: row.turn_number,
      messageCount: row.message_count,
      uncompressedSnapshot: row.uncompressed_snapshot,
      compressedSnapshot: row.compressed_snapshot,
      decisions: row.decisions ? JSON.parse(row.decisions) : [],
      stats: row.stats ? JSON.parse(row.stats) : this.getDefaultStats(),
      triggerReason: row.trigger_reason,
      createdAt: new Date(row.created_at)
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

export const compressionTurnService = new CompressionTurnService();
