import React, { useEffect } from 'react';

// Hooks
import { useToolyState } from './hooks/useToolyState';
import { useToolyApi } from './hooks/useToolyApi';
import { useWebSocket } from './hooks/useWebSocket';

// Components
import { LegacyTooly } from './LegacyTooly';
import { ToolyNext } from './ToolyNext';

const Tooly: React.FC = () => {
  // Initialize state
  const state = useToolyState();

  // Initialize API functions
  const api = useToolyApi({
    setLoading: state.setLoading,
    setModels: state.setModels,
    setAvailableProviders: state.setAvailableProviders,
    setTests: state.setTests,
    setCustomTests: state.setCustomTests,
    setBuiltInTests: state.setBuiltInTests,
    setLogs: state.setLogs,
    setSelectedModel: state.setSelectedModel,
    setEditingSystemPrompt: state.setEditingSystemPrompt,
    setShowSystemPromptEditor: state.setShowSystemPromptEditor,
    setDefaultContextLength: state.setDefaultContextLength,
    setProxyMode: state.setProxyMode,
    setEnableDualModel: state.setEnableDualModel,
    setMainModelId: state.setMainModelId,
    setExecutorModelId: state.setExecutorModelId,
    setSavingDualModel: state.setSavingDualModel,
    setModelValidationError: state.setModelValidationError,
    setSavingSystemPrompt: state.setSavingSystemPrompt,
    setMcpStatus: state.setMcpStatus,
    setMcpTools: state.setMcpTools,
    setMcpConnecting: state.setMcpConnecting,
    setEditingContextLength: state.setEditingContextLength,
    setTestingModel: state.setTestingModel,
    setProbingModel: state.setProbingModel,
    setTryingTest: state.setTryingTest,
    setTestResult: state.setTestResult,
    setSelectedTest: state.setSelectedTest,
    providerFilter: state.providerFilter,
    models: state.models,
    testMode: state.testMode,
    enableDualModel: state.enableDualModel,
    mainModelId: state.mainModelId,
    executorModelId: state.executorModelId,
    mcpStatus: state.mcpStatus,
    selectedTest: state.selectedTest,
    setSandboxActive: state.setSandboxActive,
  });

  // Initialize WebSocket
  useWebSocket({
    setTestProgress: state.setTestProgress,
    setModelLoading: state.setModelLoading,
    setSystemMetrics: state.setSystemMetrics,
    fetchModels: api.fetchModels,
    fetchModelProfile: api.fetchModelProfile,
    selectedModelRef: state.selectedModelRef,
    setCognitiveStep: state.setCognitiveStep,
    setIntentCard: state.setIntentCard,
    setCognitiveLogs: state.setCognitiveLogs,
    setMentalModelSummary: state.setMentalModelSummary,
  });

  // Fetch data on mount
  useEffect(() => {
    api.fetchModels();
    api.fetchTests();
    api.fetchCustomTests();
    api.fetchLogs();
    api.fetchSettings();
    api.fetchMcpStatus();
  }, []);

  // Refetch when provider filter changes
  useEffect(() => {
    api.fetchModels();
  }, [state.providerFilter]);

  // Restore selected model from localStorage on mount
  useEffect(() => {
    const savedModelId = localStorage.getItem('tooly_selectedModelId');
    if (savedModelId && !state.selectedModel && state.models.length > 0) {
      const modelExists = state.models.some(m => m.id === savedModelId);
      if (modelExists) {
        api.fetchModelProfile(savedModelId);
      }
    }
  }, [state.models]);

  return (
    <div className="h-full">
      {state.legacyMode ? (
        <LegacyTooly state={state} api={api} />
      ) : (
        <ToolyNext state={state} api={api} />
      )}
    </div>
  );
};

export default Tooly;
