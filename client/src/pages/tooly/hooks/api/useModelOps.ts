export const useModelOps = (setters: any, values: any) => {
  const setAsMainModel = async (modelId: string) => {
    setters.setMainModelId(modelId);
    setters.setSavingDualModel(true);
    try {
      await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enableDualModel: values.enableDualModel, mainModelId: modelId, executorModelId: values.executorModelId }) });
    } catch (error) { console.error('Failed to save main model:', error); } finally { setters.setSavingDualModel(false); }
  };

  const fetchModels = async () => {
    setters.setLoading(true);
    try {
      const res = await fetch(`/api/tooly/models?provider=${values.providerFilter}`);
      if (res.ok) {
        const data = await res.json();
        setters.setModels((data.models || []).sort((a: any, b: any) => a.displayName.localeCompare(b.displayName)));
        if (data.providers) setters.setAvailableProviders(data.providers);
      }
    } catch (error) { console.error('Failed to fetch models:', error); } finally { setters.setLoading(false); }
  };

  const saveSystemPrompt = async (modelId: string, prompt: string) => {
    setters.setSavingSystemPrompt(true);
    try {
      await fetch(`/api/tooly/models/${encodeURIComponent(modelId)}/prompt`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ systemPrompt: prompt }) });
    } catch (error) { console.error('Failed to save system prompt:', error); } finally { setters.setSavingSystemPrompt(false); }
  };

  return { setAsMainModel, fetchModels, saveSystemPrompt };
};
