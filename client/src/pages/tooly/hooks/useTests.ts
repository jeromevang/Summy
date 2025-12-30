import { useState } from 'react';
import type { ToolyState } from './useToolyState';
import { extractCategoryFromTest } from '../constants';

export interface UseTestsParams {
  state: ToolyState;
  api: any;
}

export const useTests = ({ state, api }: UseTestsParams) => {
  const [isBaselineRun, setIsBaselineRun] = useState(false);

  // Build testProgress for UI components
  const testProgressForModel = (() => {
    const isThisModel = state.testProgress.modelId === state.selectedModel?.modelId;
    const probeP = isThisModel ? state.testProgress.probeProgress : undefined;
    const toolsP = isThisModel ? state.testProgress.toolsProgress : undefined;
    const latencyP = isThisModel ? state.testProgress.latencyProgress : undefined;

    if (!probeP && !toolsP && !latencyP) return undefined;

    const isRunning = probeP?.status === 'running' || toolsP?.status === 'running' || latencyP?.status === 'running';
    const current = (probeP?.current ?? 0) + (toolsP?.current ?? 0) + (latencyP?.current ?? 0);
    const total = (probeP?.total ?? 0) + (toolsP?.total ?? 0) + (latencyP?.total ?? 0);
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;

    let currentCategory: string | undefined;
    let currentTest: string | undefined;
    let testType: 'probe' | 'tools' | 'latency' | undefined;

    if (probeP?.status === 'running') {
      currentCategory = extractCategoryFromTest(probeP.currentTest, 'probe');
      currentTest = probeP.currentTest;
      testType = 'probe';
    } else if (toolsP?.status === 'running') {
      currentCategory = extractCategoryFromTest(toolsP.currentTest, 'tools');
      currentTest = toolsP.currentTest;
      testType = 'tools';
    } else if (latencyP?.status === 'running') {
      currentCategory = 'Latency';
      currentTest = latencyP.currentTest;
      testType = 'latency';
    }

    const eta = state.calculateETA();

    return {
      isRunning,
      current,
      total,
      currentCategory,
      currentTest,
      percent,
      eta: eta ?? undefined,
      testType,
    };
  })();

  const handleContinueSlowModelTest = async () => {
    state.setShowSlowModelPrompt(false);
    if (!state.pendingTestRef.current) return;

    const { modelId, provider } = state.pendingTestRef.current;
    state.pendingTestRef.current = null;

    // Continue with tests
    state.setTestProgress(prev => ({
      ...prev,
      probeProgress: { current: 0, total: 1, currentTest: 'Initializing...', score: 0, status: 'running' },
      startTime: Date.now(),
    }));
    await api.runProbeTests(modelId, provider, false);

    state.setTestProgress(prev => ({
      ...prev,
      probeProgress: undefined,
      toolsProgress: { current: 0, total: 1, currentTest: 'Initializing...', score: 0, status: 'running' },
    }));
    await api.runModelTests(modelId, provider);

    state.setTestProgress(prev => ({
      ...prev,
      toolsProgress: undefined,
      latencyProgress: { current: 0, total: 1, currentTest: 'Running full latency profile...', status: 'running' }
    }));

    try {
      await fetch(`/api/tooly/models/${encodeURIComponent(modelId)}/latency-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider })
      });
      await api.fetchModelProfile(modelId);
    } catch (error) {
      console.error('Failed to run latency profile:', error);
    }

    state.setTestProgress({});
  };

  const runProbeTests = (withLatency: boolean) => {
    if (!state.selectedModel) return;
    state.setTestProgress({
      modelId: state.selectedModel.modelId,
      probeProgress: { current: 0, total: 1, currentTest: 'Initializing...', score: 0, status: 'running' },
      startTime: Date.now(),
    });
    api.runProbeTests(state.selectedModel.modelId, state.selectedModel.provider, withLatency);
  };

  const runModelTests = () => {
    if (!state.selectedModel) return;
    state.setTestProgress({
      modelId: state.selectedModel.modelId,
      toolsProgress: { current: 0, total: 1, currentTest: 'Initializing...', score: 0, status: 'running' },
      startTime: Date.now(),
    });
    api.runModelTests(state.selectedModel.modelId, state.selectedModel.provider);
  };

  return {
    testProgressForModel,
    handleContinueSlowModelTest,
    runProbeTests,
    runModelTests,
    isBaselineRun,
    setIsBaselineRun,
  };
};