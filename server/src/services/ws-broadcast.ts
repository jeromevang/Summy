/**
 * WebSocket Broadcast Service
 * Allows broadcasting messages to all connected WebSocket clients from anywhere
 */

type WebSocketClient = {
  readyState: number;
  OPEN: number;
  send: (data: string) => void;
};

class WSBroadcastService {
  private clients: Set<WebSocketClient> = new Set();

  registerClient(client: WebSocketClient) {
    this.clients.add(client);
  }

  unregisterClient(client: WebSocketClient) {
    this.clients.delete(client);
  }

  getClientCount(): number {
    return this.clients.size;
  }

  broadcast(type: string, payload: any) {
    const message = JSON.stringify({ type, payload, timestamp: new Date().toISOString() });
    this.clients.forEach(client => {
      if (client.readyState === client.OPEN) {
        client.send(message);
      }
    });
  }

  /**
   * Broadcast test progress updates
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
    // Use 'payload' instead of spreading into root to match frontend expectations
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
   * Infer category from test type or test name
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
   * Broadcast test completion
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
   * Broadcast model loading status
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
   * Broadcast cognitive loop trace events
   */
  broadcastCognitiveTrace(step: 'search' | 'understand' | 'decide' | 'act' | 'verify' | 'persist' | 'idle', data?: any) {
    this.broadcast('cognitive_trace', {
      step,
      timestamp: Date.now(),
      data
    });
  }

  /**
   * Broadcast agentic readiness progress
   * Extended to support qualifying gate phase and dual-model mode
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
   * Broadcast batch readiness progress
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
   * Broadcast teaching progress
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
   * Broadcast teaching verification progress
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
   * Broadcast teaching completion
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
   * Broadcast combo teaching progress
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

export const wsBroadcast = new WSBroadcastService();

