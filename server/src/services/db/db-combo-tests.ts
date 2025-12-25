import { DBBase } from './db-base.js';
import { v4 as uuid } from 'uuid';

export interface ComboTestRecord {
  id: string;
  mainModelId: string;
  executorModelId: string;
  overallScore: number;
  mainScore: number;
  executorScore: number;
  tierScores: {
    simple: number;
    medium: number;
    complex: number;
  };
  categoryScores: any[];
  testResults: any[];
  avgLatencyMs: number;
  passedCount: number;
  failedCount: number;
  mainExcluded: boolean;
  testedAt: string;
}

export class DBComboTests extends DBBase {
  /**
   * Save or update a combo test result
   * Uses UPSERT (INSERT OR REPLACE) to update existing results
   */
  saveComboResult(result: Omit<ComboTestRecord, 'id' | 'testedAt'>): ComboTestRecord {
    const id = uuid();
    const testedAt = new Date().toISOString();

    this.run(`
      INSERT INTO combo_test_results (
        id, main_model_id, executor_model_id, overall_score, main_score, executor_score,
        tier_scores, category_scores, test_results, avg_latency_ms,
        passed_count, failed_count, main_excluded, tested_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(main_model_id, executor_model_id) DO UPDATE SET
        overall_score = excluded.overall_score,
        main_score = excluded.main_score,
        executor_score = excluded.executor_score,
        tier_scores = excluded.tier_scores,
        category_scores = excluded.category_scores,
        test_results = excluded.test_results,
        avg_latency_ms = excluded.avg_latency_ms,
        passed_count = excluded.passed_count,
        failed_count = excluded.failed_count,
        main_excluded = excluded.main_excluded,
        tested_at = excluded.tested_at
    `, [
      id,
      result.mainModelId,
      result.executorModelId,
      result.overallScore,
      result.mainScore,
      result.executorScore,
      JSON.stringify(result.tierScores),
      JSON.stringify(result.categoryScores),
      JSON.stringify(result.testResults),
      result.avgLatencyMs,
      result.passedCount,
      result.failedCount,
      result.mainExcluded ? 1 : 0,
      testedAt
    ]);

    return { ...result, id, testedAt };
  }

  /**
   * Get all combo test results, sorted by overall score descending
   */
  getAllComboResults(): ComboTestRecord[] {
    const rows = this.query(`
      SELECT * FROM combo_test_results 
      ORDER BY overall_score DESC
    `);

    return rows.map(this.parseRow);
  }

  /**
   * Get combo result for a specific main + executor pair
   */
  getComboResult(mainModelId: string, executorModelId: string): ComboTestRecord | null {
    const row = this.get(`
      SELECT * FROM combo_test_results 
      WHERE main_model_id = ? AND executor_model_id = ?
    `, [mainModelId, executorModelId]);

    return row ? this.parseRow(row) : null;
  }

  /**
   * Get all results for a specific main model
   */
  getResultsForMainModel(mainModelId: string): ComboTestRecord[] {
    const rows = this.query(`
      SELECT * FROM combo_test_results 
      WHERE main_model_id = ?
      ORDER BY overall_score DESC
    `, [mainModelId]);

    return rows.map(this.parseRow);
  }

  /**
   * Get all results for a specific executor model
   */
  getResultsForExecutorModel(executorModelId: string): ComboTestRecord[] {
    const rows = this.query(`
      SELECT * FROM combo_test_results 
      WHERE executor_model_id = ?
      ORDER BY overall_score DESC
    `, [executorModelId]);

    return rows.map(this.parseRow);
  }

  /**
   * Get top N combo pairs by overall score
   */
  getTopCombos(limit: number = 10): ComboTestRecord[] {
    const rows = this.query(`
      SELECT * FROM combo_test_results 
      WHERE main_excluded = 0
      ORDER BY overall_score DESC
      LIMIT ?
    `, [limit]);

    return rows.map(this.parseRow);
  }

  /**
   * Delete a combo result
   */
  deleteComboResult(mainModelId: string, executorModelId: string): boolean {
    const result = this.run(`
      DELETE FROM combo_test_results 
      WHERE main_model_id = ? AND executor_model_id = ?
    `, [mainModelId, executorModelId]);

    return result.changes > 0;
  }

  /**
   * Clear all combo results
   */
  clearAllComboResults(): number {
    const result = this.run(`DELETE FROM combo_test_results`);
    return result.changes;
  }

  /**
   * Parse a database row into a ComboTestRecord
   */
  private parseRow(row: any): ComboTestRecord {
    return {
      id: row.id,
      mainModelId: row.main_model_id,
      executorModelId: row.executor_model_id,
      overallScore: row.overall_score,
      mainScore: row.main_score || 0,
      executorScore: row.executor_score || 0,
      tierScores: row.tier_scores ? JSON.parse(row.tier_scores) : { simple: 0, medium: 0, complex: 0 },
      categoryScores: row.category_scores ? JSON.parse(row.category_scores) : [],
      testResults: row.test_results ? JSON.parse(row.test_results) : [],
      avgLatencyMs: row.avg_latency_ms || 0,
      passedCount: row.passed_count || 0,
      failedCount: row.failed_count || 0,
      mainExcluded: row.main_excluded === 1,
      testedAt: row.tested_at
    };
  }
}

