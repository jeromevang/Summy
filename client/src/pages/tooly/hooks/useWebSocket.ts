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
}

export function useWebSocket({
  setTestProgress,
  setModelLoading,
  setSystemMetrics,
  fetchModels,
  fetchModelProfile,
  selectedModelRef,
}: UseWebSocketParams) {
  useEffect(() => {
    const ws = new ReconnectingWebSocket('ws://localhost:3001');
    
    ws.onopen = () => {
      console.log('[Tooly] WebSocket connected for progress updates');
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
            // Keep last 30 data points (30 seconds of history)
            return newMetrics.slice(-30);
          });
        }
      } catch (e) {
        // Ignore parse errors
      }
    };
    
    ws.onerror = (e) => {
      console.error('[Tooly] WebSocket error:', e);
    };
    
    ws.onclose = () => {
      console.log('[Tooly] WebSocket closed, will auto-reconnect...');
    };

    return () => ws.close();
  }, []); // Empty dependency - stable connection with auto-reconnect
}

