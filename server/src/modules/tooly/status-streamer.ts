/**
 * Status Streamer
 * Sends status updates to the IDE during tool execution via SSE
 * Compatible with Cursor and Continue (VSCode)
 */

import { Response } from 'express';

// ============================================================
// TYPES
// ============================================================

export interface StatusMessage {
  type: 'thinking' | 'tool_start' | 'tool_complete' | 'tool_error' | 'retry' | 'info';
  message: string;
  tool?: string;
  progress?: number;  // 0-100
  metadata?: any;
}

// ============================================================
// STATUS ICONS
// ============================================================

const STATUS_ICONS: Record<StatusMessage['type'], string> = {
  thinking: '🔄',
  tool_start: '🔧',
  tool_complete: '✅',
  tool_error: '❌',
  retry: '⏳',
  info: 'ℹ️'
};

// ============================================================
// STATUS STREAMER CLASS
// ============================================================

export class StatusStreamer {
  private res: Response;
  private enabled: boolean;
  private messageCount: number = 0;

  constructor(res: Response, enabled: boolean = true) {
    this.res = res;
    this.enabled = enabled;
    
    if (enabled) {
      // Setup SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
    }
  }

  /**
   * Send a status message to the IDE
   */
  sendStatus(status: StatusMessage): void {
    if (!this.enabled) return;

    const icon = STATUS_ICONS[status.type];
    const content = `\n${icon} ${status.message}\n`;

    this.sendChunk({
      id: `status-${++this.messageCount}`,
      object: 'chat.completion.chunk',
      choices: [{
        index: 0,
        delta: { content },
        finish_reason: null
      }]
    });
  }

  /**
   * Send thinking status
   */
  thinking(message: string = 'Analyzing request...'): void {
    this.sendStatus({
      type: 'thinking',
      message
    });
  }

  /**
   * Send tool start status
   */
  toolStart(tool: string, args?: any): void {
    const argsPreview = args ? ` (${this.formatArgs(args)})` : '';
    this.sendStatus({
      type: 'tool_start',
      message: `Executing: ${tool}${argsPreview}`,
      tool
    });
  }

  /**
   * Send tool complete status
   */
  toolComplete(tool: string, durationMs?: number): void {
    const duration = durationMs ? ` (${durationMs}ms)` : '';
    this.sendStatus({
      type: 'tool_complete',
      message: `${tool} complete${duration}`,
      tool
    });
  }

  /**
   * Send tool error status
   */
  toolError(tool: string, error: string): void {
    this.sendStatus({
      type: 'tool_error',
      message: `${tool} failed: ${error}`,
      tool
    });
  }

  /**
   * Send retry status
   */
  retry(attempt: number, maxAttempts: number, delayMs: number): void {
    this.sendStatus({
      type: 'retry',
      message: `Retrying... (attempt ${attempt}/${maxAttempts}, waiting ${Math.round(delayMs/1000)}s)`
    });
  }

  /**
   * Send info status
   */
  info(message: string): void {
    this.sendStatus({
      type: 'info',
      message
    });
  }

  /**
   * Send a raw SSE chunk
   */
  sendChunk(chunk: any): void {
    if (!this.enabled) return;

    try {
      this.res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    } catch (e) {
      // Response might be closed
    }
  }

  /**
   * Stream a response from the LLM
   */
  async streamResponse(responseStream: AsyncIterable<Buffer> | NodeJS.ReadableStream): Promise<string> {
    let fullContent = '';

    if (Symbol.asyncIterator in responseStream) {
      // Async iterator
      for await (const chunk of responseStream as AsyncIterable<Buffer>) {
        const chunkStr = chunk.toString();
        fullContent += chunkStr;
        this.res.write(chunkStr);
      }
    } else {
      // Node stream
      const stream = responseStream as NodeJS.ReadableStream;
      return new Promise((resolve, reject) => {
        stream.on('data', (chunk: Buffer) => {
          const chunkStr = chunk.toString();
          fullContent += chunkStr;
          this.res.write(chunkStr);
        });
        stream.on('end', () => resolve(fullContent));
        stream.on('error', reject);
      });
    }

    return fullContent;
  }

  /**
   * End the stream
   */
  end(): void {
    if (!this.enabled) return;

    try {
      this.res.write('data: [DONE]\n\n');
      this.res.end();
    } catch (e) {
      // Response might already be closed
    }
  }

  /**
   * Send error and end
   */
  sendError(message: string): void {
    this.sendStatus({
      type: 'tool_error',
      message
    });
    this.end();
  }

  /**
   * Format tool arguments for display
   */
  private formatArgs(args: any): string {
    if (!args || typeof args !== 'object') return '';
    
    const entries = Object.entries(args);
    if (entries.length === 0) return '';
    
    return entries
      .map(([key, value]) => {
        const strValue = String(value);
        const truncated = strValue.length > 30 ? strValue.slice(0, 30) + '...' : strValue;
        return `${key}: ${truncated}`;
      })
      .join(', ');
  }

  /**
   * Check if streaming is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}

// ============================================================
// FACTORY FUNCTION
// ============================================================

/**
 * Create a status streamer for a request
 */
export function createStatusStreamer(
  res: Response,
  settings: { showStatusInIDE?: boolean }
): StatusStreamer {
  return new StatusStreamer(res, settings.showStatusInIDE !== false);
}

// ============================================================
// PROGRESS TRACKER
// ============================================================

export class ProgressTracker {
  private streamer: StatusStreamer;
  private totalSteps: number;
  private currentStep: number = 0;
  private stepMessages: string[] = [];

  constructor(streamer: StatusStreamer, totalSteps: number) {
    this.streamer = streamer;
    this.totalSteps = totalSteps;
  }

  /**
   * Start a new step
   */
  startStep(message: string): void {
    this.currentStep++;
    this.stepMessages.push(message);
    
    const progress = Math.round((this.currentStep / this.totalSteps) * 100);
    this.streamer.sendStatus({
      type: 'info',
      message: `[${this.currentStep}/${this.totalSteps}] ${message}`,
      progress
    });
  }

  /**
   * Complete current step
   */
  completeStep(message?: string): void {
    const stepMsg = message || this.stepMessages[this.stepMessages.length - 1];
    this.streamer.sendStatus({
      type: 'tool_complete',
      message: stepMsg,
      progress: Math.round((this.currentStep / this.totalSteps) * 100)
    });
  }

  /**
   * Report error in current step
   */
  errorStep(error: string): void {
    this.streamer.sendStatus({
      type: 'tool_error',
      message: error
    });
  }

  /**
   * Get progress percentage
   */
  getProgress(): number {
    return Math.round((this.currentStep / this.totalSteps) * 100);
  }
}

