import { useState, useEffect, useCallback, useRef } from 'react';
import ReconnectingWebSocket from 'reconnecting-websocket';
import { 
  HardwareProfile, 
  ScannedModel, 
  ReadinessResult, 
  TeachingResult, 
  ReadinessProgress, 
  BatchResult, 
  BatchProgress,
  CombinationCheckResult,
  Model
} from '../types';
import { THRESHOLD } from '../constants';

export const useReadiness = (selectedProvider: string) => {
  // Assessment state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assessmentResult, setAssessmentResult] = useState<ReadinessResult | null>(null);
  const [teachingResult, setTeachingResult] = useState<TeachingResult | null>(null);
  const [progress, setProgress] = useState<ReadinessProgress | null>(null);
  
  // Batch state
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  
  // UI state
  const [isTeaching, setIsTeaching] = useState(false);
  const [teachingLog, setTeachingLog] = useState<string[]>([]);
  const [combinationCheck, setCombinationCheck] = useState<CombinationCheckResult | null>(null);

  // WebSocket for real-time updates
  useEffect(() => {
    const ws = new ReconnectingWebSocket(`ws://${window.location.hostname}:3001`);

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string);

        if (message.type === 'readiness_progress') {
          setProgress(message.payload);
        } else if (message.type === 'batch_readiness_progress') {
          setBatchProgress(message.payload);
        } else if (message.type === 'teaching_attempt') {
          setIsTeaching(true);
          setTeachingLog(prev => [...prev, 
            `[\${new Date().toLocaleTimeString()}] Attempt \${message.data.attempt} at Level \${message.data.level}`
          ]);
        } else if (message.type === 'teaching_complete') {
          setIsTeaching(false);
          setTeachingLog(prev => [...prev,
            `[\${new Date().toLocaleTimeString()}] Teaching \${message.data.success ? 'SUCCESSFUL' : 'FAILED'}!`
          ]);
        }
      } catch (e) {
        // Ignore parse errors
      }
    };

    return () => ws.close();
  }, []);

  const runAssessment = async (
    selectedModelId: string, 
    executorModelId: string, 
    mode: 'single' | 'dual', 
    runCount: number,
    autoTeach = false
  ) => {
    if (mode === 'dual' && !executorModelId) {
      setError('Please select an executor model for dual mode');
      return;
    }

    setIsLoading(true);
    setError(null);
    setAssessmentResult(null);
    setTeachingResult(null);
    setProgress(null);
    setTeachingLog([]);

    try {
      const body: any = {
        modelId: selectedModelId,
        autoTeach,
        runCount
      };

      if (mode === 'dual') {
        body.executorModelId = executorModelId;
      }

      const response = await fetch('/api/tooly/readiness/assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!response.ok) throw new Error('Assessment failed');
      const data = await response.json();

      setAssessmentResult(data);
      if (data.teaching) {
        setTeachingResult(data.teaching);
        setTeachingLog(data.teaching.log || []);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const checkCombination = async (mainModelId: string, executorModelId: string, hardware: HardwareProfile | null, models: Model[]) => {
    if (!hardware) return;

    const mainModel = models.find(m => m.id === mainModelId) as ScannedModel | undefined;
    const executorModel = models.find(m => m.id === executorModelId) as ScannedModel | undefined;

    if (!mainModel || !executorModel) return;

    const mainVram = mainModel.estimatedVramGB || 0;
    const execVram = executorModel.estimatedVramGB || 0;
    const totalVram = mainVram + execVram;
    const availableVram = hardware.availableVramGB;
    const vramOk = totalVram <= availableVram;
    
    const vramMessage = vramOk
      ? `\${totalVram.toFixed(1)}GB fits in \${availableVram.toFixed(1)}GB available`
      : `\${totalVram.toFixed(1)}GB exceeds \${availableVram.toFixed(1)}GB available`;

    const compatibilityOk = mainModelId !== executorModelId;
    const compatibilityMessage = compatibilityOk
      ? 'Different models selected'
      : 'Main and executor models should be different';

    const setupOk = !!mainModelId && !!executorModelId;
    const setupMessage = setupOk ? 'Both models configured' : 'Missing model configuration';

    setCombinationCheck({
      vramOk,
      compatibilityOk,
      setupOk,
      vramMessage,
      compatibilityMessage,
      setupMessage,
      overallOk: vramOk && compatibilityOk && setupOk
    });
  };

  const runBatchAssessment = async (runCount: number) => {
    setIsLoading(true);
    setError(null);
    setBatchResult(null);
    setBatchProgress(null);

    try {
      const response = await fetch('/api/tooly/readiness/assess-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runCount })
      });

      if (!response.ok) throw new Error('Batch assessment failed');
      const data = await response.json();
      setBatchResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const loadModelAssessmentData = async (modelId: string) => {
    try {
      const response = await fetch(`/api/tooly/models/${encodeURIComponent(modelId)}/detail`);
      if (response.ok) {
        const data = await response.json();
        setAssessmentResult({
          modelId: data.modelId,
          displayName: data.displayName,
          provider: data.provider,
          testedAt: data.testedAt,
          overallScore: data.score,
          categoryScores: data.scoreBreakdown,
          testResults: data.testResults || [],
          duration: 0,
          passed: data.score >= THRESHOLD
        });
      }
    } catch (err) {
      console.error('Failed to load assessment data:', err);
    }
  };

  return {
    isLoading,
    error,
    setError,
    assessmentResult,
    setAssessmentResult,
    teachingResult,
    progress,
    setProgress,
    batchResult,
    batchProgress,
    isTeaching,
    teachingLog,
    combinationCheck,
    runAssessment,
    checkCombination,
    runBatchAssessment,
    loadModelAssessmentData
  };
};
