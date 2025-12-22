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
}

export const wsBroadcast = new WSBroadcastService();

