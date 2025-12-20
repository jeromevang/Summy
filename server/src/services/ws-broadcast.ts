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

  broadcast(type: string, data: any) {
    const message = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
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
    score?: number;
    status?: 'running' | 'completed' | 'failed';
  }) {
    console.log(`[WSBroadcast] Progress: ${testType} ${progress.current}/${progress.total} - ${progress.currentTest} (clients: ${this.clients.size})`);
    this.broadcast('test_progress', {
      testType,
      modelId,
      ...progress
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

