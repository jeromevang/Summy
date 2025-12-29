/**
 * WebSocket Connection Manager
 * Prevents duplicate connections and ensures proper cleanup
 */

import ReconnectingWebSocket from 'reconnecting-websocket';

interface ConnectionConfig {
  maxRetries?: number;
  connectionTimeout?: number;
  maxReconnectionDelay?: number;
}

class WebSocketManager {
  private connections = new Map<string, ReconnectingWebSocket>();
  private connectionCounts = new Map<string, number>();

  /**
   * Get or create a WebSocket connection
   */
  getConnection(url: string, config: ConnectionConfig = {}): ReconnectingWebSocket {
    if (this.connections.has(url)) {
      // Increment usage count
      const count = this.connectionCounts.get(url) || 0;
      this.connectionCounts.set(url, count + 1);
      return this.connections.get(url)!;
    }

    // Create new connection
    const ws = new ReconnectingWebSocket(url, [], {
      maxRetries: 10,
      connectionTimeout: 5000,
      maxReconnectionDelay: 10000,
      ...config
    });

    this.connections.set(url, ws);
    this.connectionCounts.set(url, 1);

    // Add cleanup on close
    const originalClose = ws.close.bind(ws);
    ws.close = () => {
      const count = this.connectionCounts.get(url) || 0;
      if (count <= 1) {
        // Last user, actually close
        this.connections.delete(url);
        this.connectionCounts.delete(url);
        originalClose();
      } else {
        // Decrement count
        this.connectionCounts.set(url, count - 1);
      }
    };

    return ws;
  }

  /**
   * Release a WebSocket connection
   */
  releaseConnection(url: string): void {
    const count = this.connectionCounts.get(url);
    if (count && count > 1) {
      this.connectionCounts.set(url, count - 1);
    } else {
      // Close the connection
      const ws = this.connections.get(url);
      if (ws) {
        ws.close();
      }
    }
  }

  /**
   * Close all connections (for cleanup)
   */
  closeAll(): void {
    for (const [url, ws] of this.connections) {
      try {
        ws.close();
      } catch (error) {
        console.error(`Failed to close WebSocket for ${url}:`, error);
      }
    }
    this.connections.clear();
    this.connectionCounts.clear();
  }

  /**
   * Get connection status
   */
  getStatus(): { url: string; count: number; readyState: number }[] {
    return Array.from(this.connections.entries()).map(([url, ws]) => ({
      url,
      count: this.connectionCounts.get(url) || 0,
      readyState: ws.readyState
    }));
  }
}

// Global instance
export const webSocketManager = new WebSocketManager();

// Hook for React components
export function useWebSocketConnection(url: string, config?: ConnectionConfig) {
  const ws = webSocketManager.getConnection(url, config);

  React.useEffect(() => {
    return () => {
      webSocketManager.releaseConnection(url);
    };
  }, [url]);

  return ws;
}

// Cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    webSocketManager.closeAll();
  });

  // Handle page visibility changes
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      // Page became visible, connections will auto-reconnect
    }
  });
}
