import { useState, useEffect, useRef } from 'react';
import type { 
  DiscoveredModel, 
  ModelProfile, 
  ProviderFilter, 
  AvailableProviders,
  TestMode
} from '../types';

interface UseModelsProps {
  api: any;
  models: DiscoveredModel[];
  selectedModel: ModelProfile | null;
  providerFilter: ProviderFilter;
  setProviderFilter: (filter: ProviderFilter) => void;
  availableProviders: AvailableProviders;
  testMode: TestMode;
  setTestMode: (mode: TestMode) => void;
}

export function useModels({
  api,
  models,
  selectedModel,
  providerFilter,
  setProviderFilter,
  availableProviders,
  testMode,
  setTestMode
}: UseModelsProps) {
  const [loading, setLoading] = useState(false);
  const selectedModelRef = useRef<string | null>(selectedModel?.modelId || null);

  useEffect(() => {
    selectedModelRef.current = selectedModel?.modelId || null;
  }, [selectedModel]);

  const handleSelectModel = (modelId: string) => {
    api.fetchModelProfile(modelId);
  };

  const filteredModels = providerFilter === 'all'
    ? models
    : models.filter(m => m.provider === providerFilter);

  return {
    models: filteredModels,
    allModels: models,
    selectedModelId: selectedModel?.modelId ?? null,
    loading,
    providerFilter,
    setProviderFilter,
    availableProviders,
    testMode,
    setTestMode,
    handleSelectModel,
    selectedModelRef
  };
}