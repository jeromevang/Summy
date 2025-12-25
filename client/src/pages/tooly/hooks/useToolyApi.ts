import type { CustomTest } from '../../../components/TestEditor';
import type {
  DiscoveredModel,
  ModelProfile,
  ProviderFilter,
  TestMode,
  ProxyMode,
} from '../types';

// Re-export new hooks for convenience
export { useTestRunner } from './useTestRunner';
export { useOptimalSetup } from './useOptimalSetup';

interface UseToolyApiParams {
  // State setters
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setModels: React.Dispatch<React.SetStateAction<DiscoveredModel[]>>;
  setAvailableProviders: React.Dispatch<React.SetStateAction<{ lmstudio: boolean; openai: boolean; azure: boolean }>>;
  setTests: React.Dispatch<React.SetStateAction<any[]>>;
  setCustomTests: React.Dispatch<React.SetStateAction<any[]>>;
  setBuiltInTests: React.Dispatch<React.SetStateAction<any[]>>;
  setLogs: React.Dispatch<React.SetStateAction<any[]>>;
  setSelectedModel: React.Dispatch<React.SetStateAction<ModelProfile | null>>;
  setEditingSystemPrompt: React.Dispatch<React.SetStateAction<string>>;
  setShowSystemPromptEditor: React.Dispatch<React.SetStateAction<boolean>>;
  setDefaultContextLength: React.Dispatch<React.SetStateAction<number>>;
  setProxyMode: React.Dispatch<React.SetStateAction<ProxyMode>>;
  setEnableDualModel: React.Dispatch<React.SetStateAction<boolean>>;
  setMainModelId: React.Dispatch<React.SetStateAction<string>>;
  setExecutorModelId: React.Dispatch<React.SetStateAction<string>>;
  setSavingDualModel: React.Dispatch<React.SetStateAction<boolean>>;
  setModelValidationError: React.Dispatch<React.SetStateAction<string>>;
  setSavingSystemPrompt: React.Dispatch<React.SetStateAction<boolean>>;
  setMcpStatus: React.Dispatch<React.SetStateAction<{ connected: boolean; mode: string }>>;
  setMcpTools: React.Dispatch<React.SetStateAction<string[]>>;
  setMcpConnecting: React.Dispatch<React.SetStateAction<boolean>>;
  setEditingContextLength: React.Dispatch<React.SetStateAction<number | null>>;
  setTestingModel: React.Dispatch<React.SetStateAction<string | null>>;
  setProbingModel: React.Dispatch<React.SetStateAction<string | null>>;
  setTryingTest: React.Dispatch<React.SetStateAction<boolean>>;
  setTestResult: React.Dispatch<React.SetStateAction<any | null>>;
  setSelectedTest: React.Dispatch<React.SetStateAction<any | null>>;
  setSandboxActive: React.Dispatch<React.SetStateAction<boolean>>;

  // State values
  providerFilter: ProviderFilter;
  models: DiscoveredModel[];
  testMode: TestMode;
  enableDualModel: boolean;
  mainModelId: string;
  executorModelId: string;
  mcpStatus: { connected: boolean; mode: string };
  selectedTest: any | null;
}

export interface ToolyApi {
  fetchSettings: () => Promise<void>;
  saveDualModelConfig: () => Promise<void>;
  setAsMainModel: (modelId: string) => Promise<void>;
  setAsExecutorModel: (modelId: string) => Promise<void>;
  saveSystemPrompt: (modelId: string, prompt: string) => Promise<void>;
  fetchMcpStatus: () => Promise<void>;
  toggleMcpConnection: () => Promise<void>;
  updateContextLength: (modelId: string, contextLength: number) => Promise<void>;
  removeContextLength: (modelId: string) => Promise<void>;
  fetchModels: () => Promise<void>;
  fetchTests: () => Promise<void>;
  fetchCustomTests: () => Promise<void>;
  fetchLogs: () => Promise<void>;
  fetchModelProfile: (modelId: string) => Promise<void>;
  runModelTests: (modelId: string, modelProvider?: string) => Promise<void>;
  runProbeTests: (modelId: string, modelProvider?: string, runLatencyProfile?: boolean) => Promise<void>;
  saveProxyMode: (mode: ProxyMode) => Promise<void>;
  handleRollback: (backupId: string) => Promise<void>;
  handleSaveTest: (test: CustomTest) => Promise<void>;
  handleDeleteTest: (testId: string) => Promise<void>;
  handleTryTest: (test: any) => Promise<void>;
  getMainModels: () => DiscoveredModel[];
  getExecutorModels: () => DiscoveredModel[];
  // Sandbox (Phase 6)
  enterSandbox: () => Promise<void>;
  exitSandbox: () => Promise<void>;
  fetchSandboxStatus: () => Promise<void>;
  indexSandbox: () => Promise<void>;
}

export function useToolyApi(params: UseToolyApiParams): ToolyApi {
  const {
    setLoading,
    setModels,
    setAvailableProviders,
    setTests,
    setCustomTests,
    setBuiltInTests,
    setLogs,
    setSelectedModel,
    setEditingSystemPrompt,
    setShowSystemPromptEditor,
    setDefaultContextLength,
    setProxyMode,
    setEnableDualModel,
    setMainModelId,
    setExecutorModelId,
    setSavingDualModel,
    setModelValidationError,
    setSavingSystemPrompt,
    setMcpStatus,
    setMcpTools,
    setMcpConnecting,
    setEditingContextLength,
    setTestingModel,
    setProbingModel,
    setTryingTest,
    setTestResult,
    setSelectedTest,
    setSandboxActive,
    providerFilter,
    models,
    testMode,
    enableDualModel,
    mainModelId,
    executorModelId,
    mcpStatus,
    selectedTest,
  } = params;

  // Fetch settings for default context length, proxy mode, and dual-model config
  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        if (data.defaultContextLength) {
          setDefaultContextLength(data.defaultContextLength);
        }
        if (data.proxyMode) {
          setProxyMode(data.proxyMode);
        }
        if (data.enableDualModel !== undefined) {
          setEnableDualModel(data.enableDualModel);
        }
        if (data.mainModelId) {
          setMainModelId(data.mainModelId);
        }
        if (data.executorModelId) {
          setExecutorModelId(data.executorModelId);
        }
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    }
  };

  // Save dual-model configuration
  const saveDualModelConfig = async () => {
    setModelValidationError('');

    // Validation
    if (enableDualModel) {
      if (!mainModelId || !executorModelId) {
        setModelValidationError('Please select both Main Model and Executor Model when dual-model routing is enabled.');
        return;
      }
    } else {
      if (!mainModelId) {
        setModelValidationError('Please select a model to use.');
        return;
      }
    }

    setSavingDualModel(true);
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enableDualModel,
          mainModelId,
          executorModelId,
          lmstudioModel: mainModelId // Sync for backward compatibility
        })
      });
    } catch (error) {
      console.error('Failed to save dual-model config:', error);
    } finally {
      setSavingDualModel(false);
    }
  };

  // Get models suitable for main role
  const getMainModels = () => models.filter(m => m.role === 'main' || m.role === 'both');

  // Get models suitable for executor role
  const getExecutorModels = () => models.filter(m => m.role === 'executor' || m.role === 'both');

  // Set model as main and save
  const setAsMainModel = async (modelId: string) => {
    setMainModelId(modelId);
    setModelValidationError('');

    // Auto-save
    setSavingDualModel(true);
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enableDualModel,
          mainModelId: modelId,
          executorModelId,
          lmstudioModel: modelId
        })
      });
    } catch (error) {
      console.error('Failed to save main model:', error);
    } finally {
      setSavingDualModel(false);
    }
  };

  // Set model as executor (auto-enables dual model) and save
  const setAsExecutorModel = async (modelId: string) => {
    setExecutorModelId(modelId);
    setEnableDualModel(true); // Auto-enable dual model
    setModelValidationError('');

    // Auto-save
    setSavingDualModel(true);
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enableDualModel: true,
          mainModelId,
          executorModelId: modelId,
          lmstudioModel: mainModelId
        })
      });
    } catch (error) {
      console.error('Failed to save executor model:', error);
    } finally {
      setSavingDualModel(false);
    }
  };

  // Save system prompt for model
  const saveSystemPrompt = async (modelId: string, prompt: string) => {
    setSavingSystemPrompt(true);
    try {
      await fetch(`/api/tooly/models/${encodeURIComponent(modelId)}/prompt`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemPrompt: prompt })
      });
      await fetchModelProfile(modelId);
    } catch (error) {
      console.error('Failed to save system prompt:', error);
    } finally {
      setSavingSystemPrompt(false);
    }
  };

  // Fetch MCP status and tools
  const fetchMcpStatus = async () => {
    try {
      const [statusRes, toolsRes] = await Promise.all([
        fetch('/api/tooly/mcp/status'),
        fetch('/api/tooly/mcp/tools')
      ]);

      if (statusRes.ok) {
        const status = await statusRes.json();
        setMcpStatus(status);
      }

      if (toolsRes.ok) {
        const data = await toolsRes.json();
        // Handle nested structure: { tools: { tools: [...] } } or { tools: [...] }
        const toolsArray = Array.isArray(data.tools)
          ? data.tools
          : (data.tools?.tools || []);
        // Extract tool names from the tool objects
        const toolNames = toolsArray.map((t: { name: string }) => t.name);
        setMcpTools(toolNames);
      }
    } catch (error) {
      console.error('Failed to fetch MCP status:', error);
    }
  };

  // Connect/disconnect MCP
  const toggleMcpConnection = async () => {
    setMcpConnecting(true);
    try {
      const endpoint = mcpStatus.connected ? '/api/tooly/mcp/disconnect' : '/api/tooly/mcp/connect';
      await fetch(endpoint, { method: 'POST' });
      await fetchMcpStatus();
    } catch (error) {
      console.error('Failed to toggle MCP connection:', error);
    } finally {
      setMcpConnecting(false);
    }
  };

  // Update context length for a model
  const updateContextLength = async (modelId: string, contextLength: number) => {
    try {
      const res = await fetch(`/api/tooly/models/${encodeURIComponent(modelId)}/context-length`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contextLength })
      });
      if (res.ok) {
        await fetchModelProfile(modelId);
      }
    } catch (error) {
      console.error('Failed to update context length:', error);
    } finally {
      setEditingContextLength(null);
    }
  };

  // Remove custom context length (revert to global default)
  const removeContextLength = async (modelId: string) => {
    try {
      const res = await fetch(`/api/tooly/models/${encodeURIComponent(modelId)}/context-length`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await fetchModelProfile(modelId);
      }
    } catch (error) {
      console.error('Failed to remove context length:', error);
    }
  };

  const fetchModels = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tooly/models?provider=${providerFilter}`);
      if (res.ok) {
        const data = await res.json();
        // Sort models alphabetically by display name
        const sortedModels = (data.models || []).sort((a: DiscoveredModel, b: DiscoveredModel) =>
          a.displayName.localeCompare(b.displayName)
        );
        setModels(sortedModels);
        if (data.providers) {
          setAvailableProviders(data.providers);
        }
      }
    } catch (error) {
      console.error('Failed to fetch models:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTests = async () => {
    try {
      const res = await fetch('/api/tooly/tests');
      if (res.ok) {
        const data = await res.json();
        setTests(data.tests || []);
      }
    } catch (error) {
      console.error('Failed to fetch tests:', error);
    }
  };

  const fetchCustomTests = async () => {
    try {
      const res = await fetch('/api/tooly/custom-tests');
      if (res.ok) {
        const data = await res.json();
        setCustomTests(data.customTests || []);
        setBuiltInTests(data.builtInTests || []);
      }
    } catch (error) {
      console.error('Failed to fetch custom tests:', error);
    }
  };

  const handleSaveTest = async (test: CustomTest) => {
    const method = test.id ? 'PUT' : 'POST';
    const url = test.id
      ? `/api/tooly/custom-tests/${encodeURIComponent(test.id)}`
      : '/api/tooly/custom-tests';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(test),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to save test');
    }

    await fetchCustomTests();
  };

  const handleDeleteTest = async (testId: string) => {
    if (!confirm('Delete this test?')) return;

    try {
      const res = await fetch(`/api/tooly/custom-tests/${encodeURIComponent(testId)}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        await fetchCustomTests();
        if (selectedTest?.id === testId) {
          setSelectedTest(null);
        }
      }
    } catch (error) {
      console.error('Failed to delete test:', error);
    }
  };

  const handleTryTest = async (test: any) => {
    if (!mainModelId) {
      alert('Please select a main model first');
      return;
    }

    setTryingTest(true);
    setTestResult(null);
    setSelectedTest(test);

    try {
      const res = await fetch(`/api/tooly/custom-tests/${encodeURIComponent(test.id)}/try`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId: mainModelId }),
      });

      if (res.ok) {
        const data = await res.json();
        setTestResult(data);
      } else {
        const err = await res.json();
        setTestResult({ error: err.error || 'Failed to try test' });
      }
    } catch (error: any) {
      setTestResult({ error: error.message || 'Failed to try test' });
    } finally {
      setTryingTest(false);
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/tooly/logs');
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    }
  };

  const fetchModelProfile = async (modelId: string) => {
    try {
      const res = await fetch(`/api/tooly/models/${encodeURIComponent(modelId)}/detail`);
      if (res.ok) {
        const profile = await res.json();
        setSelectedModel(profile);
        setEditingSystemPrompt(profile.systemPrompt || '');
        setShowSystemPromptEditor(false);
      } else if (res.status === 404) {
        // Model not tested yet - show default profile
        const model = models.find(m => m.id === modelId);
        const defaultProfile: ModelProfile = {
          modelId,
          displayName: model?.displayName || modelId,
          provider: model?.provider || 'lmstudio',
          testedAt: '',
          score: 0,
          enabledTools: [],
          capabilities: {},
          maxContextLength: model?.maxContextLength
        };
        setSelectedModel(defaultProfile);
        setEditingSystemPrompt('');
        setShowSystemPromptEditor(false);
      }
    } catch (error) {
      console.error('Failed to fetch model profile:', error);
      // Still show default profile on error
      const model = models.find(m => m.id === modelId);
      if (model) {
        const defaultProfile: ModelProfile = {
          modelId,
          displayName: model.displayName || modelId,
          provider: model.provider || 'lmstudio',
          testedAt: '',
          score: 0,
          enabledTools: [],
          capabilities: {},
          maxContextLength: model.maxContextLength
        };
        setSelectedModel(defaultProfile);
        setEditingSystemPrompt('');
        setShowSystemPromptEditor(false);
      }
    }
  };

  const runModelTests = async (modelId: string, modelProvider?: string) => {
    setTestingModel(modelId);
    try {
      const res = await fetch(`/api/tooly/models/${encodeURIComponent(modelId)}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: modelProvider || 'lmstudio',
          testMode: testMode
        })
      });
      if (res.ok) {
        await fetchModels();
        await fetchModelProfile(modelId);
      }
    } catch (error) {
      console.error('Failed to run tests:', error);
    } finally {
      setTestingModel(null);
    }
  };

  const runProbeTests = async (modelId: string, modelProvider?: string, runLatencyProfile: boolean = false) => {
    setProbingModel(modelId);
    try {
      const res = await fetch(`/api/tooly/models/${encodeURIComponent(modelId)}/probe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: modelProvider || 'lmstudio',
          runLatencyProfile
        })
      });
      if (res.ok) {
        await fetchModels();
        await fetchModelProfile(modelId);
      }
    } catch (error) {
      console.error('Failed to run probe tests:', error);
    } finally {
      setProbingModel(null);
    }
  };

  const saveProxyMode = async (mode: ProxyMode) => {
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proxyMode: mode })
      });
      setProxyMode(mode);
    } catch (error) {
      console.error('Failed to save proxy mode:', error);
    }
  };

  const handleRollback = async (backupId: string) => {
    try {
      const res = await fetch(`/api/tooly/backups/${backupId}/restore`, {
        method: 'POST'
      });
      if (res.ok) {
        await fetchLogs();
      }
    } catch (error) {
      console.error('Failed to rollback:', error);
    }
  };
  // Sandbox API
  const enterSandbox = async () => {
    try {
      const res = await fetch('/api/tooly/sandbox/enter', { method: 'POST' });
      if (res.ok) {
        setSandboxActive(true);
      }
    } catch (error) {
      console.error('Failed to enter sandbox:', error);
    }
  };

  const exitSandbox = async () => {
    try {
      const res = await fetch('/api/tooly/sandbox/exit', { method: 'POST' });
      if (res.ok) {
        setSandboxActive(false);
      }
    } catch (error) {
      console.error('Failed to exit sandbox:', error);
    }
  };

  const fetchSandboxStatus = async () => {
    try {
      const res = await fetch('/api/tooly/sandbox/status');
      if (res.ok) {
        const data = await res.json();
        setSandboxActive(data.active);
      }
    } catch (error) {
      console.error('Failed to fetch sandbox status:', error);
    }
  };

  const indexSandbox = async () => {
    try {
      await fetch('/api/tooly/sandbox/index', { method: 'POST' });
    } catch (error) {
      console.error('Failed to index sandbox:', error);
    }
  };

  return {
    fetchSettings,
    saveDualModelConfig,
    setAsMainModel,
    setAsExecutorModel,
    saveSystemPrompt,
    fetchMcpStatus,
    toggleMcpConnection,
    updateContextLength,
    removeContextLength,
    fetchModels,
    fetchTests,
    fetchCustomTests,
    fetchLogs,
    fetchModelProfile,
    runModelTests,
    runProbeTests,
    saveProxyMode,
    handleRollback,
    handleSaveTest,
    handleDeleteTest,
    handleTryTest,
    getMainModels,
    getExecutorModels,
    enterSandbox,
    exitSandbox,
    fetchSandboxStatus,
    indexSandbox,
  };
}
