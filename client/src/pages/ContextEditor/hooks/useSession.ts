import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import ReconnectingWebSocket from 'reconnecting-websocket';
import { ContextSession } from '../types';

export const useSession = (sessionId: string | undefined, navigate: (path: string) => void) => {
  const [session, setSession] = useState<ContextSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [lmstudioConnected, setLmstudioConnected] = useState<boolean | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [turnStatus, setTurnStatus] = useState<{
    status: 'idle' | 'thinking' | 'running_tool' | 'complete';
    message: string;
    tool?: string;
    iteration?: number;
  } | null>(null);

  const loadSession = async () => {
    if (!sessionId) return;
    try {
      const response = await axios.get(`http://localhost:3001/api/sessions/${sessionId}`);
      setSession(response.data);
    } catch (error) {
      console.error('Failed to load session:', error);
      navigate('/sessions');
    } finally {
      setLoading(false);
    }
  };

  const checkLMStudioConnection = async () => {
    try {
      const response = await axios.post('http://localhost:3001/api/test-lmstudio', {});
      setLmstudioConnected(response.data.success);
    } catch {
      setLmstudioConnected(false);
    }
  };

  useEffect(() => {
    if (sessionId) {
      loadSession();
      checkLMStudioConnection();

      const ws = new ReconnectingWebSocket('ws://localhost:3001', [], {
        maxRetries: 10,
        connectionTimeout: 5000,
        maxReconnectionDelay: 10000
      });

      ws.onopen = () => {
        setWsConnected(true);
      };

      ws.onclose = () => {
        setWsConnected(false);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          if (message.type === 'turn_status' && message.data?.sessionId === sessionId) {
            const { status, message: statusMessage, tool, iteration } = message.data;
            if (status === 'complete') {
              setTimeout(() => setTurnStatus(null), 1000);
            } else {
              setTurnStatus({ status, message: statusMessage, tool, iteration });
            }
          }
          
          if (message.type === 'session_updated' && message.data?.id === sessionId) {
            setSession(message.data);
            setLastUpdate(new Date());
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      return () => {
        ws.close();
      };
    }
  }, [sessionId]);

  return {
    session,
    setSession,
    loading,
    lmstudioConnected,
    wsConnected,
    lastUpdate,
    turnStatus,
    loadSession
  };
};
