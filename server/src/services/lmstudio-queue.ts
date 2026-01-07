/**
 * LMStudio Request Queue Service
 *
 * Manages a queue for LMStudio API requests to prevent blocking when the
 * local model is busy. Uses a FIFO queue with timeout support.
 *
 * Part of Smart Context Compression System
 */

import EventEmitter from 'events';

// ============================================================
// TYPES
// ============================================================

interface QueuedRequest {
  id: string;
  prompt: string;
  maxTokens: number;
  temperature: number;
  timeout: number;
  resolve: (result: string) => void;
  reject: (error: Error) => void;
  timestamp: number;
}

interface QueueStats {
  queueLength: number;
  processing: boolean;
  totalProcessed: number;
  totalFailed: number;
  averageWaitTime: number;
  currentRequest: string | null;
}

// ============================================================
// LMSTUDIO QUEUE SERVICE
// ============================================================

class LMStudioQueueService extends EventEmitter {
  private queue: QueuedRequest[] = [];
  private processing: boolean = false;
  private currentRequest: QueuedRequest | null = null;
  private totalProcessed: number = 0;
  private totalFailed: number = 0;
  private waitTimes: number[] = [];
  private readonly maxQueueSize: number = 50;
  private readonly defaultTimeout: number = 30000;  // 30 seconds
  private readonly lmstudioUrl: string;

  constructor(lmstudioUrl: string = 'http://localhost:1234') {
    super();
    this.lmstudioUrl = lmstudioUrl;

    // Start queue processor
    this.startProcessor();
  }

  /**
   * Add request to queue
   */
  async enqueue(
    prompt: string,
    options: {
      maxTokens?: number;
      temperature?: number;
      timeout?: number;
    } = {}
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      // Check queue size
      if (this.queue.length >= this.maxQueueSize) {
        reject(new Error('Queue is full'));
        return;
      }

      const request: QueuedRequest = {
        id: this.generateId(),
        prompt,
        maxTokens: options.maxTokens || 2000,
        temperature: options.temperature ?? 0.1,
        timeout: options.timeout || this.defaultTimeout,
        resolve,
        reject,
        timestamp: Date.now()
      };

      this.queue.push(request);
      this.emit('enqueued', { requestId: request.id, queueLength: this.queue.length });

      console.log(
        `[LMStudioQueue] Enqueued request ${request.id} (queue: ${this.queue.length})`
      );

      // Start processing if not already processing
      if (!this.processing) {
        this.processNext();
      }
    });
  }

  /**
   * Start queue processor
   */
  private startProcessor(): void {
    // Check queue periodically
    setInterval(() => {
      if (!this.processing && this.queue.length > 0) {
        this.processNext();
      }
    }, 1000);
  }

  /**
   * Process next request in queue
   */
  private async processNext(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;
    const request = this.queue.shift()!;
    this.currentRequest = request;

    const waitTime = Date.now() - request.timestamp;
    this.waitTimes.push(waitTime);

    // Keep only last 100 wait times
    if (this.waitTimes.length > 100) {
      this.waitTimes.shift();
    }

    this.emit('processing', {
      requestId: request.id,
      queueLength: this.queue.length,
      waitTime
    });

    console.log(
      `[LMStudioQueue] Processing request ${request.id} (waited: ${waitTime}ms, queue: ${this.queue.length})`
    );

    try {
      // Set timeout
      const timeoutPromise = new Promise<string>((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), request.timeout);
      });

      // Execute request
      const resultPromise = this.executeLMStudioRequest(request);

      // Race against timeout
      const result = await Promise.race([resultPromise, timeoutPromise]);

      // Success
      this.totalProcessed++;
      request.resolve(result);

      this.emit('completed', {
        requestId: request.id,
        duration: Date.now() - request.timestamp
      });

      console.log(`[LMStudioQueue] Completed request ${request.id}`);
    } catch (error: any) {
      // Failure
      this.totalFailed++;
      request.reject(error);

      this.emit('failed', {
        requestId: request.id,
        error: error.message
      });

      console.error(`[LMStudioQueue] Failed request ${request.id}:`, error.message);
    } finally {
      this.processing = false;
      this.currentRequest = null;

      // Process next request after a small delay
      setTimeout(() => {
        if (this.queue.length > 0) {
          this.processNext();
        }
      }, 100);
    }
  }

  /**
   * Execute LMStudio API request
   */
  private async executeLMStudioRequest(request: QueuedRequest): Promise<string> {
    const axios = (await import('axios')).default;

    const response = await axios.post(
      `${this.lmstudioUrl}/v1/chat/completions`,
      {
        model: 'local-model',
        messages: [{ role: 'user', content: request.prompt }],
        temperature: request.temperature,
        max_tokens: request.maxTokens
      },
      {
        timeout: request.timeout,
        headers: { 'Content-Type': 'application/json' }
      }
    );

    return response.data.choices[0].message.content;
  }

  /**
   * Get queue statistics
   */
  getStats(): QueueStats {
    const averageWaitTime =
      this.waitTimes.length > 0
        ? this.waitTimes.reduce((sum, t) => sum + t, 0) / this.waitTimes.length
        : 0;

    return {
      queueLength: this.queue.length,
      processing: this.processing,
      totalProcessed: this.totalProcessed,
      totalFailed: this.totalFailed,
      averageWaitTime,
      currentRequest: this.currentRequest?.id || null
    };
  }

  /**
   * Get queue position for a request
   */
  getPosition(requestId: string): number {
    const index = this.queue.findIndex(req => req.id === requestId);
    return index !== -1 ? index + 1 : -1;
  }

  /**
   * Clear queue (emergency)
   */
  clearQueue(): void {
    const cleared = this.queue.length;

    // Reject all pending requests
    for (const request of this.queue) {
      request.reject(new Error('Queue cleared'));
    }

    this.queue = [];

    console.log(`[LMStudioQueue] Cleared ${cleared} pending requests`);
    this.emit('cleared', { count: cleared });
  }

  /**
   * Check if LMStudio is available
   */
  async checkAvailability(): Promise<boolean> {
    try {
      const axios = (await import('axios')).default;
      const response = await axios.get(`${this.lmstudioUrl}/v1/models`, {
        timeout: 2000
      });
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get detailed queue info
   */
  getQueueInfo(): {
    queue: Array<{ id: string; waitTime: number }>;
    current: { id: string; processingTime: number } | null;
  } {
    const now = Date.now();

    return {
      queue: this.queue.map(req => ({
        id: req.id,
        waitTime: now - req.timestamp
      })),
      current: this.currentRequest
        ? {
            id: this.currentRequest.id,
            processingTime: now - this.currentRequest.timestamp
          }
        : null
    };
  }

  /**
   * Generate unique request ID
   */
  private generateId(): string {
    return `lms_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Get estimated wait time for a new request
   */
  getEstimatedWaitTime(): number {
    if (this.queue.length === 0 && !this.processing) {
      return 0;
    }

    const avgWaitTime = this.waitTimes.length > 0
      ? this.waitTimes.reduce((sum, t) => sum + t, 0) / this.waitTimes.length
      : 3000;  // Default 3s

    return avgWaitTime * (this.queue.length + (this.processing ? 1 : 0));
  }

  /**
   * Export queue state (for debugging)
   */
  exportState(): any {
    return {
      queueLength: this.queue.length,
      processing: this.processing,
      totalProcessed: this.totalProcessed,
      totalFailed: this.totalFailed,
      averageWaitTime: this.getStats().averageWaitTime,
      currentRequest: this.currentRequest ? {
        id: this.currentRequest.id,
        processingTime: Date.now() - this.currentRequest.timestamp
      } : null,
      queue: this.queue.map(req => ({
        id: req.id,
        waitTime: Date.now() - req.timestamp
      }))
    };
  }
}

// ============================================================
// SINGLETON EXPORT
// ============================================================

let queueInstance: LMStudioQueueService | null = null;

export function getLMStudioQueue(lmstudioUrl?: string): LMStudioQueueService {
  if (!queueInstance) {
    queueInstance = new LMStudioQueueService(
      lmstudioUrl || process.env.LMSTUDIO_URL || 'http://localhost:1234'
    );
  }
  return queueInstance;
}

export { LMStudioQueueService };
