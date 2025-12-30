export const useConfigOps = (setters: any, values: any) => {
  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        if (data.defaultContextLength) setters.setDefaultContextLength(data.defaultContextLength);
        if (data.proxyMode) setters.setProxyMode(data.proxyMode);
        if (data.enableDualModel !== undefined) setters.setEnableDualModel(data.enableDualModel);
        if (data.mainModelId) setters.setMainModelId(data.mainModelId);
        if (data.executorModelId) setters.setExecutorModelId(data.executorModelId);
      }
    } catch (error) { console.error('Failed to fetch settings:', error); }
  };

  const saveDualModelConfig = async () => {
    setters.setModelValidationError('');
    if (values.enableDualModel && (!values.mainModelId || !values.executorModelId)) {
      setters.setModelValidationError('Please select both models.');
      return;
    }
    setters.setSavingDualModel(true);
    try {
      await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enableDualModel: values.enableDualModel, mainModelId: values.mainModelId, executorModelId: values.executorModelId }) });
    } catch (error) { console.error('Failed to save:', error); } finally { setters.setSavingDualModel(false); }
  };

  return { fetchSettings, saveDualModelConfig };
};
