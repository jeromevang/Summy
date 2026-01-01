/**
 * WebSocket Broadcast Service
 * Allows broadcasting messages to all connected WebSocket clients from anywhere.
 */

/**
 * Represents a generic WebSocket client with essential properties for broadcasting.
 */
type WebSocketClient = {
  /** The current state of the WebSocket connection. */
  readyState: number;
  /** Numeric constant indicating an open WebSocket connection. */
  OPEN: number;
  /** Function to send data over the WebSocket connection. */
  send: (data: string) => void;
};

/**
 * Manages broadcasting messages to all registered WebSocket clients.
 */
class WSBroadcastService {
  private clients: Set<WebSocketClient> = new Set();

  /**
   * Registers a new WebSocket client with the broadcasting service.
   * @param client The WebSocket client to register.
   */
  registerClient(client: WebSocketClient) {
    this.clients.add(client);
  }

  /**
   * Unregisters a WebSocket client from the broadcasting service.
   * @param client The WebSocket client to unregister.
   */
  unregisterClient(client: WebSocketClient) {
    this.clients.delete(client);
  }

  /**
   * Returns the number of currently connected WebSocket clients.
   * @returns The number of connected clients.
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Broadcasts a message to all registered WebSocket clients.
   * The message includes a type, payload, and a timestamp.
   * @param type The type of the message (e.g., 'test_progress', 'model_loading').
   * @param payload The data payload of the message.
   */
  broadcast(type: string, payload: any) {
    const message = JSON.stringify({ type, payload, timestamp: new Date().toISOString() });
    this.clients.forEach(client => {
      if (client.readyState === client.OPEN) {
        client.send(message);
      }
    });
  }

  /**
   * Broadcasts test progress updates to all registered clients.
   * @param testType The type of test ('probe', 'tools', 'latency').
   * @param modelId The ID of the model being tested.
   * @param progress The progress data, including current, total, test name, category, score, and status.
   */
  broadcastProgress(testType: 'probe' | 'tools' | 'latency', modelId: string, progress: {
    current: number;
    total: number;
    currentTest?: string;
    currentCategory?: string;
    score?: number;
    status?: 'running' | 'completed' | 'cancelled' | 'failed';
  }) {
    console.log(`[WSBroadcast] Progress: ${testType} ${progress.current}/${progress.total} - ${progress.currentCategory || testType}: ${progress.currentTest} (clients: ${this.clients.size})`);
    this.broadcast('test_progress', {
      testType,
      modelId,
      category: progress.currentCategory || this.inferCategory(testType, progress.currentTest),
      currentTest: progress.currentTest,
      progress: { current: progress.current, total: progress.total },
      score: progress.score,
      status: progress.status || 'running'
    });
  }

  /**
   * Infers the category of a test from its type or name.
   * @param testType The general type of the test.
   * @param testName The specific name of the test.
   * @returns The inferred category of the test.
   */
  private inferCategory(testType: string, testName?: string): string {
    if (!testName) return testType;

    // Extract category from test name patterns
    if (testName.includes('Emit') || testName.includes('Schema') || testName.includes('Selection') || testName.includes('Suppression')) {
      return 'Tool Behavior';
    }
    if (testName.includes('Reasoning') || testName.includes('Intent') || testName.includes('Planning')) {
      return 'Reasoning';
    }
    if (testName.includes('RAG')) return 'RAG Usage';
    if (testName.includes('Bug') || testName.includes('Detection')) return 'Bug Detection';
    if (testName.includes('Navigation') || testName.includes('Codebase')) return 'Navigation';
    if (testName.includes('Proactive')) return 'Proactive';
    if (testName.includes('Failure') || testName.includes('Calibration')) return 'Failure Modes';
    if (testName.includes('Stateful') || testName.includes('Decay') || testName.includes('Drift')) return 'Stateful';
    if (testName.includes('Precedence') || testName.includes('Conflict')) return 'Precedence';
    if (testName.includes('Compliance') || testName.includes('System Prompt')) return 'Compliance';

    return testType === 'probe' ? 'Probe Tests' : testType === 'tools' ? 'Tool Tests' : 'Tests';
  }

  /**
   * Broadcasts test completion status to all registered clients.
   * @param modelId The ID of the model for which the test completed.
   * @param score The final score of the test.
   * @param testType The type of test ('probe', 'tools', 'latency'). Defaults to 'tools'.
   */
  broadcastTestComplete(modelId: string, score: number, testType: 'probe' | 'tools' | 'latency' = 'tools') {
    console.log(`[WSBroadcast] Test complete: ${modelId} - Score: ${score} (clients: ${this.clients.size})`);
    this.broadcast('test_complete', {
      modelId,
      score,
      testType,
      status: 'completed'
    });
  }

  /**
   * Broadcasts model loading status updates to all registered clients.
   * @param modelId The ID of the model whose status is being updated.
   * @param status The loading status ('loading', 'unloading', 'loaded', 'unloaded', 'failed').
   * @param message An optional descriptive message about the status.
   */
  broadcastModelLoading(modelId: string, status: 'loading' | 'unloading' | 'loaded' | 'unloaded' | 'failed', message?: string) {
    console.log(`[WSBroadcast] Model ${status}: ${modelId} - ${message || ''} (clients: ${this.clients.size})`);
    this.broadcast('model_loading', {
      modelId,
      status,
      message: message || `Model ${status}`
    });
  }
  
  /**
   * Broadcasts cognitive loop trace events.
   * @param step The current step in the cognitive loop (e.g., 'search', 'understand', 'decide').
   * @param data Optional supplementary data for the trace event.
   */
  broadcastCognitiveTrace(step: 'search' | 'understand' | 'decide' | 'act' | 'verify' | 'persist' | 'idle', data?: any) {
    this.broadcast('cognitive_trace', {
      step,
      timestamp: Date.now(),
      data
    });
  }

  /**
   * Broadcasts agentic readiness progress, including qualifying gate phase and dual-model mode support.
   * @param data The readiness progress data, including model ID, current/total progress, current test, status, score, phase, mode, and attribution.
   */
  broadcastReadinessProgress(data: {
    modelId: string;
    current: number;
    total: number;
    currentTest: string;
    currentCategory?: string;
    status: 'running' | 'completed';
    score: number;
    passed?: boolean;
    // Qualifying gate & dual-model support
    phase?: 'qualifying' | 'discovery';
    mode?: 'single' | 'dual';
    attribution?: 'main' | 'executor' | 'loop' | null;
  }) {
    const phase = data.phase || (data.current <= 5 ? 'qualifying' : 'discovery');
    console.log(`[WSBroadcast] Readiness [${phase}]: ${data.modelId} - ${data.current}/${data.total} - ${data.currentTest} (${data.mode || 'single'} mode, clients: ${this.clients.size})`);
    this.broadcast('readiness_progress', { ...data, phase });
  }

  /**
   * Broadcasts batch readiness progress for multiple models.
   * @param data The batch readiness progress data, including current model, total models, status, and results for each model.
   */
  broadcastBatchReadinessProgress(data: {
    currentModel: string | null;
    currentModelIndex: number;
    totalModels: number;
    status: 'running' | 'completed';
    results: Array<{
      modelId: string;
      score: number;
      certified: boolean;
    }>;
    bestModel?: string;
  }) {
    console.log(`[WSBroadcast] Batch readiness progress: ${data.currentModel || 'Complete'} - ${data.currentModelIndex}/${data.totalModels} (clients: ${this.clients.size})`);
    this.broadcast('batch_readiness_progress', data);
  }

  /**
   * Broadcasts teaching progress for a specific model.
   * @param data The teaching progress data, including model ID, attempt, level, current score, phase, and failed tests by level.
   */
  broadcastTeachingProgress(data: {
    modelId: string;
    attempt: number;
    level: 1 | 2 | 3 | 4;
    currentScore: number;
    phase: 'initial_assessment' | 'teaching_attempt' | 'teaching_verify' | 'teaching_complete';
    failedTestsByLevel?: { level: number; count: number }[];
  }) {
    console.log(`[WSBroadcast] Teaching progress: ${data.modelId} - Attempt ${data.attempt}, Level ${data.level} (clients: ${this.clients.size})`);
    this.broadcast('teaching_attempt', data);
  }

  /**
   * Broadcasts teaching verification progress for a specific model.
   * @param data The teaching verification progress data, including model ID, attempt, and phase.
   */
  broadcastTeachingVerify(data: {
    modelId: string;
    attempt: number;
    phase: 'verifying';
  }) {
    console.log(`[WSBroadcast] Teaching verify: ${data.modelId} - Attempt ${data.attempt} (clients: ${this.clients.size})`);
    this.broadcast('teaching_verify', data);
  }

  /**
   * Broadcasts teaching completion for a specific model.
   * @param data The teaching completion data, including model ID, success status, final score, and number of attempts.
   */
  broadcastTeachingComplete(data: {
    modelId: string;
    success: boolean;
    finalScore: number;
    attempts: number;
  }) {
    console.log(`[WSBroadcast] Teaching complete: ${data.modelId} - Success: ${data.success}, Score: ${data.finalScore} (clients: ${this.clients.size})`);
    this.broadcast('teaching_complete', data);
  }

  /**
   * Broadcasts combo teaching progress.
   * @param data The combo teaching progress data, including combo ID, a descriptive message, and the current step.
   */
  broadcastComboTeachingProgress(data: {
    comboId: string;
    message: string;
    step: 'teaching' | 'verifying' | 'complete';
  }) {
    console.log(`[WSBroadcast] Combo Teaching: ${data.comboId} - ${data.message} (clients: ${this.clients.size})`);
    this.broadcast('combo_teaching_progress', data);
  }
}

/**
 * The singleton instance of the WSBroadcastService.
 */
export const wsBroadcast = new WSBroadcastService();
