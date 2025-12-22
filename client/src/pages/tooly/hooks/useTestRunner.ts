/**
 * useTestRunner Hook
 * Manages test execution state and WebSocket updates
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// ============================================================
// TYPES
// ============================================================

export interface TestProgress {
  isRunning: boolean;
  currentTest?: string;
  currentCategory?: string;
  progress?: number;
  status?: 'running' | 'completed' | 'cancelled' | 'error';
  eta?: number;
  score?: number;
}

export interface TestResult {
  testId: string;
  tool: string;
  passed: boolean;
  score: number;
  latency: number;
}

export interface TestRunResult {
  modelId: string;
  startedAt: string;
  completedAt: string;
  totalTests: number;
  passed: number;
  failed: number;
  overallScore: number;
  results: TestResult[];
  aborted?: boolean;
}

export type TestMode = 'quick' | 'standard' | 'deep' | 'optimization';

export interface UseTestRunnerOptions {
  modelId?: string;
  wsUrl?: string;
  onComplete?: (result: TestRunResult) => void;
  onProgress?: (progress: TestProgress) => void;
  onError?: (error: string) => void;
}

// ============================================================
// HOOK
// ============================================================

export function useTestRunner(options: UseTestRunnerOptions = {}) {
  const { modelId, wsUrl, onComplete, onProgress, onError } = options;
  
  const [progress, setProgress] = useState<TestProgress>({ isRunning: false });
  const [lastResult, setLastResult] = useState<TestRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const currentModelRef = useRef<string | undefined>(modelId);
  
  // Update ref when modelId changes
  useEffect(() => {
    currentModelRef.current = modelId;
  }, [modelId]);
  
  // Connect to WebSocket for progress updates
  useEffect(() => {
    const url = wsUrl || `ws://${window.location.hostname}:3001/ws`;
    const ws = new WebSocket(url);
    wsRef.current = ws;
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Handle test progress updates
        if (data.type === 'progress' && data.category === 'tools') {
          // Check if this is for our model
          if (!currentModelRef.current || data.modelId === currentModelRef.current) {
            const newProgress: TestProgress = {
              isRunning: data.status === 'running',
              currentTest: data.currentTest,
              currentCategory: data.currentCategory,
              progress: data.current && data.total 
                ? Math.round((data.current / data.total) * 100) 
                : undefined,
              status: data.status,
              eta: data.eta,
              score: data.score
            };
            
            setProgress(newProgress);
            onProgress?.(newProgress);
            
            // Handle completion
            if (data.status === 'completed' || data.status === 'cancelled') {
              setProgress(prev => ({ ...prev, isRunning: false }));
            }
          }
        }
      } catch {
        // Ignore non-JSON messages
      }
    };
    
    ws.onerror = () => {
      console.error('[useTestRunner] WebSocket error');
    };
    
    return () => {
      ws.close();
    };
  }, [wsUrl, onProgress]);
  
  /**
   * Start a test run
   */
  const runTests = useCallback(async (
    targetModelId: string,
    mode: TestMode = 'standard',
    options: { tools?: string[] } = {}
  ): Promise<TestRunResult | null> => {
    setError(null);
    setProgress({ isRunning: true, status: 'running' });
    
    try {
      const response = await fetch(
        `/api/tooly/models/${encodeURIComponent(targetModelId)}/test?mode=${mode}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tools: options.tools })
        }
      );
      
      if (!response.ok) {
        throw new Error('Failed to start tests');
      }
      
      const result = await response.json();
      setLastResult(result);
      setProgress({ isRunning: false, status: 'completed' });
      onComplete?.(result);
      
      return result;
    } catch (err: any) {
      const errorMsg = err.message || 'Test failed';
      setError(errorMsg);
      setProgress({ isRunning: false, status: 'error' });
      onError?.(errorMsg);
      return null;
    }
  }, [onComplete, onError]);
  
  /**
   * Cancel a running test
   */
  const cancelTests = useCallback(async (targetModelId?: string): Promise<boolean> => {
    const id = targetModelId || currentModelRef.current;
    if (!id) return false;
    
    try {
      const response = await fetch(
        `/api/tooly/models/${encodeURIComponent(id)}/test`,
        { method: 'DELETE' }
      );
      
      if (response.ok) {
        setProgress({ isRunning: false, status: 'cancelled' });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);
  
  /**
   * Check if tests are running for a model
   */
  const isRunning = useCallback((targetModelId?: string): boolean => {
    if (!progress.isRunning) return false;
    if (!targetModelId) return progress.isRunning;
    return progress.isRunning && currentModelRef.current === targetModelId;
  }, [progress.isRunning]);
  
  return {
    // State
    progress,
    lastResult,
    error,
    isTestRunning: progress.isRunning,
    
    // Actions
    runTests,
    cancelTests,
    isRunning,
    
    // Reset
    reset: useCallback(() => {
      setProgress({ isRunning: false });
      setLastResult(null);
      setError(null);
    }, [])
  };
}

export default useTestRunner;

