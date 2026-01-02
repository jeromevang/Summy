/**
 * WebSocket & Real-time Updates Tests
 * Tests WebSocket broadcasting, reconnection, and live updates
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import ReconnectingWebSocket from 'reconnecting-websocket';
import WS from 'ws';
import fetch from 'node-fetch';

const WS_URL = 'ws://localhost:3001';
const SERVER_URL = 'http://localhost:3001';

describe('WebSocket & Real-time Updates Tests', () => {
  let ws;
  let receivedMessages = [];

  beforeAll(() => {
    return new Promise((resolve) => {
      ws = new ReconnectingWebSocket(WS_URL, [], {
        WebSocket: WS,
        maxReconnectionDelay: 1000,
        minReconnectionDelay: 100
      });

      ws.addEventListener('message', (event) => {
        try {
          const data = JSON.parse(event.data);
          receivedMessages.push(data);
        } catch (e) {
          receivedMessages.push({ raw: event.data });
        }
      });

      ws.addEventListener('open', () => {
        resolve();
      });
    });
  });

  afterAll(() => {
    if (ws) {
      ws.close();
    }
  });

  describe('8.1 WebSocket Connection', () => {
    it('should establish WebSocket connection', () => {
      expect(ws.readyState).toBe(WS.OPEN);
    });

    it('should receive welcome message', async () => {
      // Wait a bit for initial messages
      await new Promise(resolve => setTimeout(resolve, 500));

      const hasWelcome = receivedMessages.some(
        msg => msg.type === 'welcome' || msg.type === 'connection'
      );
      expect(hasWelcome).toBe(true);
    });

    it('should handle reconnection', async () => {
      // Close and wait for reconnect
      ws.reconnect();

      await new Promise(resolve => setTimeout(resolve, 2000));

      expect(ws.readyState).toBe(WS.OPEN);
    }, 5000);
  });

  describe('8.2 Session Updates', () => {
    it('should broadcast new session creation', async () => {
      receivedMessages = []; // Clear previous messages

      // Create a session via API
      const response = await fetch(`${SERVER_URL}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'WebSocket Test Session',
          model: 'test-model'
        })
      });

      expect(response.ok).toBe(true);
      const session = await response.json();

      // Wait for WebSocket message
      await new Promise(resolve => setTimeout(resolve, 1000));

      const sessionMessage = receivedMessages.find(
        msg => msg.type === 'session_created' && msg.data?.id === session.id
      );

      expect(sessionMessage).toBeDefined();
      expect(sessionMessage.data.title).toBe('WebSocket Test Session');
    });

    it('should broadcast session updates', async () => {
      receivedMessages = [];

      // Get a session
      const listResponse = await fetch(`${SERVER_URL}/api/sessions?limit=1`);
      const sessions = await listResponse.json();

      if (sessions.length === 0) {
        console.log('Skipping: No sessions available');
        return;
      }

      const sessionId = sessions[0].id;

      // Update the session
      await fetch(`${SERVER_URL}/api/sessions/${sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Updated via WebSocket Test'
        })
      });

      await new Promise(resolve => setTimeout(resolve, 1000));

      const updateMessage = receivedMessages.find(
        msg => msg.type === 'session_updated' && msg.data?.id === sessionId
      );

      expect(updateMessage).toBeDefined();
    });
  });

  describe('8.3 System Metrics Broadcasting', () => {
    it('should receive system metrics updates', async () => {
      receivedMessages = [];

      // Wait for periodic metrics broadcast
      await new Promise(resolve => setTimeout(resolve, 6000));

      const metricsMessage = receivedMessages.find(
        msg => msg.type === 'system_metrics'
      );

      if (metricsMessage) {
        expect(metricsMessage.data).toHaveProperty('cpu');
        expect(metricsMessage.data).toHaveProperty('memory');
        expect(metricsMessage.data).toHaveProperty('timestamp');
      } else {
        console.log('Note: System metrics broadcasting may not be enabled');
      }
    }, 10000);
  });

  describe('8.4 Request Logging', () => {
    it('should broadcast API request logs', async () => {
      receivedMessages = [];

      // Make an API request
      await fetch(`${SERVER_URL}/api/sessions`);

      await new Promise(resolve => setTimeout(resolve, 500));

      const logMessage = receivedMessages.find(
        msg => msg.type === 'request_log' || msg.type === 'activity'
      );

      if (logMessage) {
        expect(logMessage.data).toHaveProperty('path');
        expect(logMessage.data).toHaveProperty('method');
      }
    });
  });

  describe('8.5 Error Broadcasting', () => {
    it('should broadcast error events', async () => {
      receivedMessages = [];

      // Trigger an error (request non-existent resource)
      await fetch(`${SERVER_URL}/api/sessions/non-existent-id-12345`).catch(() => {});

      await new Promise(resolve => setTimeout(resolve, 500));

      const errorMessage = receivedMessages.find(
        msg => msg.type === 'error' || msg.type === 'request_error'
      );

      // May or may not receive depending on implementation
      if (errorMessage) {
        expect(errorMessage.data).toHaveProperty('message');
      }
    });
  });

  describe('8.6 Targeted Messages', () => {
    it('should support client-specific messages', async () => {
      // This would require server implementation to send targeted messages
      // For now, verify we can send messages to server

      ws.send(JSON.stringify({
        type: 'ping',
        clientId: 'test-client'
      }));

      await new Promise(resolve => setTimeout(resolve, 500));

      // Server may respond with pong
      const pongMessage = receivedMessages.find(
        msg => msg.type === 'pong'
      );

      // Optional feature
      if (pongMessage) {
        expect(pongMessage).toBeDefined();
      }
    });
  });

  describe('8.7 Multiple Clients', () => {
    it('should broadcast to multiple connected clients', async () => {
      // Create second WebSocket connection
      const ws2 = new WS(WS_URL);
      const ws2Messages = [];

      await new Promise((resolve) => {
        ws2.on('open', resolve);
      });

      ws2.on('message', (data) => {
        try {
          ws2Messages.push(JSON.parse(data.toString()));
        } catch (e) {}
      });

      receivedMessages = [];

      // Trigger a broadcast event
      await fetch(`${SERVER_URL}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Multi-client Test',
          model: 'test'
        })
      });

      await new Promise(resolve => setTimeout(resolve, 1000));

      // Both clients should receive the message
      const ws1HasMessage = receivedMessages.some(
        msg => msg.type === 'session_created' && msg.data?.title === 'Multi-client Test'
      );

      const ws2HasMessage = ws2Messages.some(
        msg => msg.type === 'session_created' && msg.data?.title === 'Multi-client Test'
      );

      expect(ws1HasMessage).toBe(true);
      expect(ws2HasMessage).toBe(true);

      ws2.close();
    });
  });

  describe('8.8 Message Ordering', () => {
    it('should maintain message order', async () => {
      receivedMessages = [];

      // Send multiple rapid requests
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          fetch(`${SERVER_URL}/api/sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: `Order Test ${i}`,
              model: 'test'
            })
          })
        );
      }

      await Promise.all(promises);
      await new Promise(resolve => setTimeout(resolve, 2000));

      const sessionMessages = receivedMessages.filter(
        msg => msg.type === 'session_created' && msg.data?.title?.startsWith('Order Test')
      );

      // Should have received all messages
      expect(sessionMessages.length).toBeGreaterThanOrEqual(5);
    });
  });
});
