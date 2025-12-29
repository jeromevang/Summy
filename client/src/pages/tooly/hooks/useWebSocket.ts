import { useEffect } from 'react';
import ReconnectingWebSocket from 'reconnecting-websocket';
import type { TestProgress, ModelLoadingState, SystemMetric } from '../types';

interface UseWebSocketParams {
  setTestProgress: React.Dispatch<React.SetStateAction<TestProgress>>;
  setModelLoading: React.Dispatch<React.SetStateAction<ModelLoadingState>>;
  setSystemMetrics: React.Dispatch<React.SetStateAction<SystemMetric[]>>;
  fetchModels: () => Promise<void>;
  fetchModelProfile: (modelId: string) => Promise<void>;
  selectedModelRef: React.MutableRefObject<string | null>;
  // Cognitive Loop Setters (Phase 5)
  setCognitiveStep: React.Dispatch<React.SetStateAction<'idle' | 'search' | 'understand' | 'decide' | 'act' | 'verify' | 'persist'>>;
  setIntentCard: React.Dispatch<React.SetStateAction<any>>;
  setCognitiveLogs: React.Dispatch<React.SetStateAction<string[]>>;
  setMentalModelSummary: React.Dispatch<React.SetStateAction<any>>;
}

export function useWebSocket({
  setTestProgress,
  setModelLoading,
  setSystemMetrics,
  fetchModels,
  fetchModelProfile,
  selectedModelRef,
  setCognitiveStep,
  setIntentCard,
  setCognitiveLogs,
  setMentalModelSummary,
}: UseWebSocketParams) {
  useEffect(() => {
    let ws: ReconnectingWebSocket | null = null;
    let isConnecting = false;
    
    const connectWebSocket = () => {
      if (isConnecting || ws) return;
      
      isConnecting = true;
      ws = new ReconnectingWebSocket(`ws://${window.location.hostname}:3001`, [], {
        maxRetries: 10,
        connectionTimeout: 5000,
        maxReconnectionDelay: 10000
      });

      ws.onopen = () => {
        console.log('[Tooly] WebSocket connected for progress updates');
        isConnecting = false;
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data as string);
          console.log('[Tooly] WS message received:', message.type, message.data?.testType, message.data?.current, message.data?.total);

          if (message.type === 'test_progress') {
            const { testType, modelId, current, total, currentTest, score, status } = message.data;
            console.log('[Tooly] Progress update:', testType, `${current}/${total}`, currentTest, status, 'score:', score);

            setTestProgress(prev => {
              const newState = {
                ...prev,
                modelId,
                [`${testType}Progress`]: { current, total, currentTest, score: score ?? 0, status }
              };
              console.log('[Tooly] New testProgress state:', newState);
              return newState;
            });

            // Refresh model list and selected model profile when test completes
            if (status === 'completed') {
              setTimeout(() => {
                fetchModels();
                // Use ref to get current selected model ID
                if (modelId === selectedModelRef.current) {
                  fetchModelProfile(modelId);
                }
              }, 500);
            }
          } else if (message.type === 'model_loading') {
            const { modelId, status, message: loadMessage } = message.data;
            console.log('[Tooly] Model loading:', modelId, status, loadMessage);
            setModelLoading({ modelId, status, message: loadMessage });

            // Clear loading state after model is loaded/failed
            if (status === 'loaded' || status === 'failed' || status === 'unloaded') {
              setTimeout(() => setModelLoading({}), 2000);
            }
          } else if (message.type === 'system_metrics') {
            const { cpu, gpu, gpuMemory, gpuTemp, gpuName } = message.data;
            setSystemMetrics(prev => {
              const newMetrics = [...prev, { cpu, gpu, gpuMemory, gpuTemp, gpuName }];
              // Keep last 30 data points (30 seconds of history) - FIXED: Prevent memory leak
              return newMetrics.slice(-30);
            });
          } else if (message.type === 'cognitive_step') {
            // Update cognitive loop step indicator
            setCognitiveStep(message.data.step);
          } else if (message.type === 'cognitive_intent') {
            // Update intent card display
            setIntentCard(message.data);
          } else if (message.type === 'cognitive_log') {
            // Append to cognitive log panel
            setCognitiveLogs(prev => [...prev.slice(-99), message.data.log]);
          } else if (message.type === 'mental_model') {
            // Update mental model summary
            setMentalModelSummary(message.data);
          } else if (message.type === 'readiness_progress') {
            // Agentic readiness assessment progress
            setTestProgress(prev => ({
              ...prev,
              readinessProgress: {
                modelId: message.data.modelId,
                current: message.data.current,
                total: message.data.total,
                currentTest: message.data.currentTest,
                status: message.data.status,
                score: message.data.score ?? 0,
              }
            }));
          } else if (message.type === 'batch_readiness_progress') {
            // Batch test all models progress
            setTestProgress(prev => ({
              ...prev,
              batchProgress: {
                currentModel: message.data.currentModel,
                currentModelIndex: message.data.currentModelIndex,
                totalModels: message.data.totalModels,
                status: message.data.status,
                results: message.data.results ?? [],
              }
            }));
          }
        } catch (e) {
          // Ignore parse errors
        }
      };

      ws.onerror = (e) => {
        console.error('[Tooly] WebSocket error:', e);
        isConnecting = false;
      };

      ws.onclose = () => {
        console.log('[Tooly] WebSocket closed, will auto-reconnect...');
        isConnecting = false;
      };
    };

    // Initial connection
    connectWebSocket();

    // Handle page visibility changes to reconnect if needed
    const handleVisibilityChange = () => {
      if (!document.hidden && ws?.readyState !== WebSocket.OPEN) {
        connectWebSocket();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (ws) {
        ws.close();
        ws = null;
      }
    };
  }, []); // Empty dependency - stable connection with auto-reconnect
}

