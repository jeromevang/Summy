import { useState, useEffect } from 'react';
import { Model } from '../types';

export const useModels = (selectedProvider: string) => {
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
      
      // Reset selections when provider changes
      setSelectedModelId('');
      setExecutorModelId('');
      
      if (data.models?.length > 0) {
        setSelectedModelId(data.models[0].id);
      }
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
