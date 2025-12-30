export const useTestOps = (setters: any, values: any) => {
  const fetchTests = async () => {
    try {
      const res = await fetch('/api/tooly/tests');
      if (res.ok) setters.setTests((await res.json()).tests || []);
    } catch (error) { console.error('Failed to fetch tests:', error); }
  };

  const runModelTests = async (modelId: string, provider?: string) => {
    setters.setTestingModel(modelId);
    try {
      const res = await fetch(`/api/tooly/models/\${encodeURIComponent(modelId)}/test`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: provider || 'lmstudio', testMode: values.testMode }) });
      if (res.ok) { await fetchTests(); }
    } catch (error) { console.error('Failed to run tests:', error); } finally { setters.setTestingModel(null); }
  };

  const handleSaveTest = async (test: any) => {
    const method = test.id ? 'PUT' : 'POST';
    const url = test.id ? `/api/tooly/custom-tests/\${encodeURIComponent(test.id)}` : '/api/tooly/custom-tests';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(test) });
    if (!res.ok) throw new Error('Failed to save');
  };

  return { fetchTests, runModelTests, handleSaveTest };
};
