/**
 * Analytics Service
 * Tracks requests, tokens, tool usage, and provides summary data.
 */

import { db, AnalyticsEntry, AnalyticsSummary } from './database';

// ============================================================
// TYPES
// ============================================================

/**
 * Represents the data structure for tracking LLM request analytics.
 */
export interface RequestAnalytics {
  /** The ID of the model used for the request. */
  model: string;
  /** The provider of the model (e.g., 'openai', 'anthropic'). */
  provider: string;
  /** The number of input tokens used. */
  tokensInput: number;
  /** The number of output tokens generated. */
  tokensOutput: number;
  /** The duration of the request in milliseconds. */
  durationMs: number;
  /** Indicates if the request was successful. */
  success: boolean;
}

/**
 * Represents the data structure for tracking context compression analytics.
 */
export interface CompressionAnalytics {
  /** Optional: The ID of the model involved in compression. */
  model?: string;
  /** Optional: The provider of the model involved in compression. */
  provider?: string;
  /** The original number of tokens before compression. */
  tokensOriginal: number;
  /** The number of tokens after compression. */
  tokensCompressed: number;
  /** The number of tokens saved by compression. */
  tokensSaved: number;
  /** The compression mode used (e.g., 1, 2). */
  compressionMode: number;
  /** The duration of the compression operation in milliseconds. */
  durationMs: number;
}

/**
 * Represents the data structure for tracking tool execution analytics.
 */
export interface ToolAnalytics {
  /** The ID of the model that invoked the tool. */
  model: string;
  /** The name of the tool executed. */
  tool: string;
  /** The duration of the tool execution in milliseconds. */
  durationMs: number;
  /** Indicates if the tool execution was successful. */
  success: boolean;
  /** Optional: The type of error if the tool execution failed. */
  errorType?: string;
}

// ============================================================
// ANALYTICS SERVICE
// ============================================================

/**
 * Service responsible for tracking various application analytics such as LLM requests,
 * context compression, and tool executions. It also provides summary and estimation functionalities.
 */
class AnalyticsService {
  /**
   * Tracks a single LLM request by recording its analytics data to the database.
   * @param data - The `RequestAnalytics` object containing details of the request.
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
   * Tracks context compression events by recording its analytics data to the database.
   * @param data - The `CompressionAnalytics` object containing details of the compression.
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
      success: true, // Compression tracking assumes success for now
      metadata: {
        compressionMode: data.compressionMode,
        savingsPercent: data.tokensOriginal > 0 ? Math.round((data.tokensSaved / data.tokensOriginal) * 100) : 0
      }
    };

    db.recordAnalytics(entry);
  }

  /**
   * Tracks a single tool execution by recording its analytics data to the database.
   * @param data - The `ToolAnalytics` object containing details of the tool execution.
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
   * Retrieves an analytics summary for a specified time period.
   * @param period - The time period for the summary ('day', 'week', 'month'). Defaults to 'week'.
   * @returns An `AnalyticsSummary` object.
   */
  getSummary(period: 'day' | 'week' | 'month' = 'week'): AnalyticsSummary {
    return db.getAnalyticsSummary(period);
  }

  /**
   * Retrieves a formatted analytics summary suitable for API responses or display.
   * @param period - The time period for the summary ('day', 'week', 'month'). Defaults to 'week'.
   * @returns A `FormattedAnalytics` object.
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
   * Estimates the number of tokens in a given string content.
   * This is a rough approximation, typically ~4 characters per token for English text.
   * @param content - The string content to estimate tokens for.
   * @returns The estimated number of tokens.
   */
  estimateTokens(content: string): number {
    if (!content) return 0;
    return Math.ceil(content.length / 4);
  }

  /**
   * Estimates the total number of tokens from an array of messages,
   * accounting for various content formats.
   * @param messages - An array of message objects, each potentially containing string or array content.
   * @returns The estimated total number of tokens.
   */
  estimateMessagesTokens(messages: any[]): number {
    if (!messages || !Array.isArray(messages)) return 0;
    
    let total = 0;
    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        total += this.estimateTokens(msg.content);
      } else if (Array.isArray(msg.content)) {
        // Handle content array format (e.g., multimodal messages)
        for (const part of msg.content) {
          if (part.type === 'text' && part.text) {
            total += this.estimateTokens(part.text);
          }
        }
      }
      // Add overhead for message structure (e.g., role, delimiters)
      total += 4; 
    }
    
    return total;
  }
}

// ============================================================
// FORMATTED TYPES
// ============================================================

/**
 * Represents a formatted analytics summary suitable for display or API consumption.
 */
export interface FormattedAnalytics {
  /** The time period covered by the analytics (e.g., 'week', 'month'). */
  period: string;
  /** High-level overview statistics. */
  overview: {
    /** Total number of requests. */
    totalRequests: number;
    /** Change in requests compared to the previous period (currently a placeholder). */
    requestChange: number;
    /** Total original tokens before compression. */
    tokensOriginal: number;
    /** Total tokens after compression. */
    tokensCompressed: number;
    /** Total tokens saved by compression. */
    tokensSaved: number;
    /** Percentage of tokens saved by compression. */
    savingsPercent: number;
    /** Total number of tool executions. */
    toolExecutions: number;
    /** Success rate of tool executions. */
    toolSuccessRate: number;
  };
  /** Detailed breakdown of token savings. */
  tokenSavings: {
    /** Original tokens. */
    original: number;
    /** Compressed tokens. */
    compressed: number;
    /** Tokens saved. */
    saved: number;
    /** Percentage saved. */
    percent: number;
  };
  /** Breakdown of tool usage. */
  toolUsage: Array<{
    /** Name of the tool. */
    tool: string;
    /** Number of times the tool was used. */
    count: number;
    /** Success rate of the tool. */
    successRate: number;
  }>;
  /** Daily activity breakdown. */
  dailyActivity: Array<{
    /** Date of the activity. */
    date: string;
    /** Number of requests on that date. */
    requests: number;
    /** Number of tool calls on that date. */
    toolCalls: number;
  }>;
}

// Export singleton instance
/**
 * The singleton instance of the AnalyticsService.
 */
export const analytics = new AnalyticsService();


