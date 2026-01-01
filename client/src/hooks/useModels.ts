import { useState, useEffect } from 'react';

// Shared type definition (move this to a shared types file later)
export interface Model {
  id: string;
  displayName?: string;
  provider?: string;
  contextLength?: number;
}

export const useModels = (selectedProvider: string = 'all') => {
  const [models, setModels] = useState<Model[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [executorModelId, setExecutorModelId] = useState<string>('');

  const fetchModels = async () => {
    setIsLoadingModels(true);
    try {
      const response = await fetch(`/api/tooly/models?provider=${selectedProvider}`);
      if (!response.ok) throw new Error('Failed to fetch models');
      const data = await response.json();
      setModels(data.models || []);
      
      // We don't auto-select here anymore to keep it flexible
    } catch (err: any) {
      console.error('Failed to fetch models:', err);
    } finally {
      setIsLoadingModels(false);
    }
  };

  useEffect(() => {
    fetchModels();
  }, [selectedProvider]);

  return {
    models,
    isLoadingModels,
    selectedModelId,
    setSelectedModelId,
    executorModelId,
    setExecutorModelId,
    fetchModels
  };
};
