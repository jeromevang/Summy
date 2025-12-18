/**
 * Analytics Service
 * Tracks requests, tokens, tool usage, and provides summary data
 */

import { db, AnalyticsEntry, AnalyticsSummary } from './database.js';

// ============================================================
// TYPES
// ============================================================

export interface RequestAnalytics {
  model: string;
  provider: string;
  tokensInput: number;
  tokensOutput: number;
  durationMs: number;
  success: boolean;
}

export interface CompressionAnalytics {
  model?: string;
  provider?: string;
  tokensOriginal: number;
  tokensCompressed: number;
  tokensSaved: number;
  compressionMode: number;
  durationMs: number;
}

export interface ToolAnalytics {
  model: string;
  tool: string;
  durationMs: number;
  success: boolean;
  errorType?: string;
}

// ============================================================
// ANALYTICS SERVICE
// ============================================================

class AnalyticsService {
  /**
   * Track a LLM request
   */
  trackRequest(data: RequestAnalytics): void {
    const entry: AnalyticsEntry = {
      type: 'request',
      model: data.model,
      provider: data.provider,
      tokensInput: data.tokensInput,
      tokensOutput: data.tokensOutput,
      durationMs: data.durationMs,
      success: data.success
    };

    db.recordAnalytics(entry);
  }

  /**
   * Track context compression
   */
  trackCompression(data: CompressionAnalytics): void {
    const entry: AnalyticsEntry = {
      type: 'compression',
      model: data.model,
      provider: data.provider,
      tokensInput: data.tokensOriginal,
      tokensOutput: data.tokensCompressed,
      tokensSaved: data.tokensSaved,
      durationMs: data.durationMs,
      success: true,
      metadata: {
        compressionMode: data.compressionMode,
        savingsPercent: Math.round((data.tokensSaved / data.tokensOriginal) * 100)
      }
    };

    db.recordAnalytics(entry);
  }

  /**
   * Track tool execution
   */
  trackToolExecution(data: ToolAnalytics): void {
    const entry: AnalyticsEntry = {
      type: 'tool',
      model: data.model,
      durationMs: data.durationMs,
      success: data.success,
      metadata: {
        tool: data.tool,
        errorType: data.errorType
      }
    };

    db.recordAnalytics(entry);
  }

  /**
   * Get analytics summary for a time period
   */
  getSummary(period: 'day' | 'week' | 'month' = 'week'): AnalyticsSummary {
    return db.getAnalyticsSummary(period);
  }

  /**
   * Get formatted summary for API response
   */
  getFormattedSummary(period: 'day' | 'week' | 'month' = 'week'): FormattedAnalytics {
    const summary = this.getSummary(period);
    
    // Calculate savings percentage
    const savingsPercent = summary.tokensOriginal > 0
      ? Math.round((summary.tokensSaved / summary.tokensOriginal) * 100)
      : 0;

    // Calculate request change (mock for now, would need historical comparison)
    const requestChange = 0; // TODO: Compare with previous period

    return {
      period,
      overview: {
        totalRequests: summary.totalRequests,
        requestChange,
        tokensOriginal: summary.tokensOriginal,
        tokensCompressed: summary.tokensCompressed,
        tokensSaved: summary.tokensSaved,
        savingsPercent,
        toolExecutions: summary.toolExecutions,
        toolSuccessRate: summary.toolSuccessRate
      },
      tokenSavings: {
        original: summary.tokensOriginal,
        compressed: summary.tokensCompressed,
        saved: summary.tokensSaved,
        percent: savingsPercent
      },
      toolUsage: summary.toolUsage.map(t => ({
        tool: t.tool,
        count: t.count,
        successRate: t.successRate
      })),
      dailyActivity: summary.dailyActivity.map(d => ({
        date: d.date,
        requests: d.requests,
        toolCalls: d.toolCalls
      }))
    };
  }

  /**
   * Estimate tokens from message content (rough approximation)
   * ~4 characters per token for English text
   */
  estimateTokens(content: string): number {
    if (!content) return 0;
    return Math.ceil(content.length / 4);
  }

  /**
   * Estimate tokens from messages array
   */
  estimateMessagesTokens(messages: any[]): number {
    if (!messages || !Array.isArray(messages)) return 0;
    
    let total = 0;
    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        total += this.estimateTokens(msg.content);
      } else if (Array.isArray(msg.content)) {
        // Handle content array format
        for (const part of msg.content) {
          if (part.type === 'text' && part.text) {
            total += this.estimateTokens(part.text);
          }
        }
      }
      // Add overhead for message structure
      total += 4;
    }
    
    return total;
  }
}

// ============================================================
// FORMATTED TYPES
// ============================================================

export interface FormattedAnalytics {
  period: string;
  overview: {
    totalRequests: number;
    requestChange: number;
    tokensOriginal: number;
    tokensCompressed: number;
    tokensSaved: number;
    savingsPercent: number;
    toolExecutions: number;
    toolSuccessRate: number;
  };
  tokenSavings: {
    original: number;
    compressed: number;
    saved: number;
    percent: number;
  };
  toolUsage: Array<{
    tool: string;
    count: number;
    successRate: number;
  }>;
  dailyActivity: Array<{
    date: string;
    requests: number;
    toolCalls: number;
  }>;
}

// Export singleton instance
export const analytics = new AnalyticsService();

