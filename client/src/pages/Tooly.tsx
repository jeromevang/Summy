import React, { useState, useEffect } from 'react';

// ============================================================
// TYPES
// ============================================================

interface ProbeTestResult {
  passed: boolean;
  score: number;
  details: string;
}

interface ReasoningProbeResults {
  intentExtraction: ProbeTestResult;
  multiStepPlanning: ProbeTestResult;
  conditionalReasoning: ProbeTestResult;
  contextContinuity: ProbeTestResult;
  logicalConsistency: ProbeTestResult;
  explanation: ProbeTestResult;
  edgeCaseHandling: ProbeTestResult;
}

interface ProbeResults {
  testedAt: string;
  emitTest: ProbeTestResult;
  schemaTest: ProbeTestResult;
  selectionTest: ProbeTestResult;
  suppressionTest: ProbeTestResult;
  reasoningProbes?: ReasoningProbeResults;
  toolScore?: number;
  reasoningScore?: number;
  overallScore: number;
}

interface ContextLatencyData {
  testedContextSizes: number[];
  latencies: Record<number, number>;
  maxUsableContext: number;
  recommendedContext: number;
}

interface ModelProfile {
  modelId: string;
  displayName: string;
  provider: 'lmstudio' | 'openai' | 'azure';
  testedAt: string;
  score: number;
  enabledTools: string[];
  capabilities: Record<string, { supported: boolean; score: number }>;
  contextLength?: number;
  maxContextLength?: number;
  role?: 'main' | 'executor' | 'both' | 'none';
  probeResults?: ProbeResults;
  contextLatency?: ContextLatencyData;
  systemPrompt?: string;
}

interface DiscoveredModel {
  id: string;
  displayName: string;
  provider: 'lmstudio' | 'openai' | 'azure';
  status: 'tested' | 'untested' | 'failed' | 'known_good';
  score?: number;
  toolCount?: number;
  totalTools?: number;
  role?: 'main' | 'executor' | 'both' | 'none';
  maxContextLength?: number;
}

interface TestDefinition {
  id: string;
  tool: string;
  category: string;
  difficulty: string;
  prompt: string;
}

interface ExecutionLog {
  id: string;
  timestamp: string;
  model: string;
  tool: string;
  status: 'success' | 'failed' | 'timeout';
  durationMs: number;
  backupId?: string;
}

type TabId = 'models' | 'tests' | 'logs';

// ============================================================
// TOOLY PAGE
// ============================================================

const Tooly: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('models');
  const [models, setModels] = useState<DiscoveredModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<ModelProfile | null>(null);
  const [tests, setTests] = useState<TestDefinition[]>([]);
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingModel, setTestingModel] = useState<string | null>(null);
  const [providerFilter, setProviderFilter] = useState<'all' | 'lmstudio' | 'openai' | 'azure'>(() => {
    const saved = localStorage.getItem('tooly_providerFilter');
    return (saved as 'all' | 'lmstudio' | 'openai' | 'azure') || 'all';
  });
  const [availableProviders, setAvailableProviders] = useState<{ lmstudio: boolean; openai: boolean; azure: boolean }>({
    lmstudio: false, openai: false, azure: false
  });
  const [testMode, setTestMode] = useState<'quick' | 'keep_on_success' | 'manual'>(() => {
    const saved = localStorage.getItem('tooly_testMode');
    return (saved as 'quick' | 'keep_on_success' | 'manual') || 'keep_on_success';
  });
  const [defaultContextLength, setDefaultContextLength] = useState<number>(8192);
  const [editingContextLength, setEditingContextLength] = useState<number | null>(null);
  const [probingModel, setProbingModel] = useState<string | null>(null);
  const [proxyMode, setProxyMode] = useState<'passthrough' | 'summy' | 'tooly' | 'both'>('both');
  const [enableDualModel, setEnableDualModel] = useState(false);
  const [mainModelId, setMainModelId] = useState<string>('');
  const [executorModelId, setExecutorModelId] = useState<string>('');
  const [savingDualModel, setSavingDualModel] = useState(false);
  const [editingSystemPrompt, setEditingSystemPrompt] = useState<string>('');
  const [savingSystemPrompt, setSavingSystemPrompt] = useState(false);
  const [showSystemPromptEditor, setShowSystemPromptEditor] = useState(false);
  const [mcpStatus, setMcpStatus] = useState<{ connected: boolean; mode: string }>({ connected: false, mode: 'none' });
  const [mcpTools, setMcpTools] = useState<string[]>([]);
  const [mcpConnecting, setMcpConnecting] = useState(false);
  const [logStatusFilter, setLogStatusFilter] = useState<'all' | 'success' | 'failed' | 'timeout'>('all');
  const [logToolFilter, setLogToolFilter] = useState<string>('');

  // Test progress state
  const [testProgress, setTestProgress] = useState<{
    probeProgress?: { current: number; total: number; currentTest: string; score: number; status: string };
    toolsProgress?: { current: number; total: number; currentTest: string; score: number; status: string };
    latencyProgress?: { current: number; total: number; currentTest: string; status: string };
    modelId?: string;
  }>({});

  // Listen for WebSocket progress updates
  useEffect(() => {
    const ws = new WebSocket('ws://localhost:3001');
    
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'test_progress') {
          const { testType, modelId, current, total, currentTest, score, status } = message.data;
          setTestProgress(prev => ({
            ...prev,
            modelId,
            [`${testType}Progress`]: { current, total, currentTest, score, status }
          }));
          
          // Refresh model list when test completes
          if (status === 'completed') {
            setTimeout(() => {
              fetchModels();
              if (modelId === selectedModel?.modelId) {
                fetchModelProfile(modelId);
              }
            }, 500);
          }
        }
      } catch (e) {
        // Ignore parse errors
      }
    };

    return () => ws.close();
  }, [selectedModel?.modelId]);

  // Persist filter selections to localStorage
  useEffect(() => {
    localStorage.setItem('tooly_providerFilter', providerFilter);
  }, [providerFilter]);

  useEffect(() => {
    localStorage.setItem('tooly_testMode', testMode);
  }, [testMode]);

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
    setSavingDualModel(true);
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enableDualModel,
          mainModelId,
          executorModelId
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
        const tools = await toolsRes.json();
        setMcpTools(tools.tools || []);
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
        // Refresh the profile
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

  // Fetch data on mount
  useEffect(() => {
    fetchModels();
    fetchTests();
    fetchLogs();
    fetchSettings();
    fetchMcpStatus();
  }, []);

  // Refetch when provider filter changes
  useEffect(() => {
    fetchModels();
  }, [providerFilter]);

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
      const res = await fetch(`/api/tooly/models/${encodeURIComponent(modelId)}`);
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

  const saveProxyMode = async (mode: typeof proxyMode) => {
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

  const getRoleBadge = (role?: string) => {
    switch (role) {
      case 'main':
        return <span className="px-2 py-0.5 text-xs rounded-full bg-blue-500/20 text-blue-400">🧠 Main</span>;
      case 'executor':
        return <span className="px-2 py-0.5 text-xs rounded-full bg-green-500/20 text-green-400">⚡ Executor</span>;
      case 'both':
        return <span className="px-2 py-0.5 text-xs rounded-full bg-purple-500/20 text-purple-400">✨ Both</span>;
      case 'none':
        return <span className="px-2 py-0.5 text-xs rounded-full bg-red-500/20 text-red-400">⚠️ Limited</span>;
      default:
        return <span className="px-2 py-0.5 text-xs rounded-full bg-gray-500/20 text-gray-400">? Unprobed</span>;
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

  const getStatusIcon = (status: DiscoveredModel['status']) => {
    switch (status) {
      case 'tested': return '✅';
      case 'known_good': return '✅';
      case 'untested': return '⚠️';
      case 'failed': return '❌';
      default: return '❓';
    }
  };

  const getStatusColor = (status: DiscoveredModel['status']) => {
    switch (status) {
      case 'tested': return 'text-green-400';
      case 'known_good': return 'text-green-400';
      case 'untested': return 'text-yellow-400';
      case 'failed': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white">Tooly - Model Hub</h1>
          <p className="text-gray-400 text-sm">Model Capabilities, Probing & Tool Management</p>
        </div>
        <div className="flex items-center gap-4">
          {/* Proxy Mode Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Mode:</span>
            <select
              value={proxyMode}
              onChange={(e) => saveProxyMode(e.target.value as typeof proxyMode)}
              className="bg-[#2d2d2d] border border-[#3d3d3d] rounded px-2 py-1 text-sm text-gray-300 focus:border-purple-500 focus:outline-none"
            >
              <option value="passthrough">Passthrough Only</option>
              <option value="summy">Summy Only (Compression)</option>
              <option value="tooly">Tooly Only (Tools)</option>
              <option value="both">Summy + Tooly</option>
            </select>
          </div>
          <button
            onClick={() => {
              fetchModels();
              fetchTests();
              fetchLogs();
            }}
            className="px-3 py-1.5 text-sm bg-[#2d2d2d] text-gray-300 rounded-lg hover:bg-[#3d3d3d] transition-colors"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Dual-Model Configuration */}
      <div className="bg-[#1a1a1a] rounded-xl border border-[#2d2d2d] p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={enableDualModel}
                onChange={(e) => setEnableDualModel(e.target.checked)}
                className="w-4 h-4 rounded border-gray-600 bg-[#0d0d0d] text-purple-500 focus:ring-purple-500"
              />
              <span className="text-white font-medium">Enable Dual-Model Routing</span>
            </label>
          </div>
          <button
            onClick={saveDualModelConfig}
            disabled={savingDualModel}
            className="px-3 py-1 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded disabled:opacity-50"
          >
            {savingDualModel ? 'Saving...' : 'Save Config'}
          </button>
        </div>
        
        {enableDualModel && (
          <div className="grid grid-cols-2 gap-4">
            {/* Main Model */}
            <div className="p-3 bg-[#0d0d0d] rounded-lg border border-[#2d2d2d]">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">🧠</span>
                <span className="text-white font-medium">Main Model (Reasoning)</span>
              </div>
              <select
                value={mainModelId}
                onChange={(e) => setMainModelId(e.target.value)}
                className="w-full bg-[#1a1a1a] border border-[#3d3d3d] rounded px-3 py-2 text-white text-sm focus:border-purple-500 focus:outline-none"
              >
                <option value="">Select model...</option>
                {getMainModels().map((m) => (
                  <option key={m.id} value={m.id}>{m.displayName}</option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-2">
                Handles reasoning, planning. No direct tool access.
              </p>
              {getMainModels().length === 0 && (
                <p className="text-xs text-yellow-400 mt-1">
                  No models with Main role. Run probe tests first.
                </p>
              )}
            </div>
            
            {/* Executor Model */}
            <div className="p-3 bg-[#0d0d0d] rounded-lg border border-[#2d2d2d]">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">⚡</span>
                <span className="text-white font-medium">Executor Model (Tools)</span>
              </div>
              <select
                value={executorModelId}
                onChange={(e) => setExecutorModelId(e.target.value)}
                className="w-full bg-[#1a1a1a] border border-[#3d3d3d] rounded px-3 py-2 text-white text-sm focus:border-purple-500 focus:outline-none"
              >
                <option value="">Select model...</option>
                {getExecutorModels().map((m) => (
                  <option key={m.id} value={m.id}>{m.displayName}</option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-2">
                Executes tool calls. Schema-aware, deterministic.
              </p>
              {getExecutorModels().length === 0 && (
                <p className="text-xs text-yellow-400 mt-1">
                  No models with Executor role. Run probe tests first.
                </p>
              )}
            </div>
          </div>
        )}
        
        {!enableDualModel && (
          <p className="text-sm text-gray-500">
            Single-model mode: The selected provider's model handles both reasoning and tool execution.
          </p>
        )}
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 bg-[#1a1a1a] p-1 rounded-lg border border-[#2d2d2d]">
        {(['models', 'tests', 'logs'] as TabId[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'bg-[#2d2d2d] text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-[#1a1a1a] rounded-xl border border-[#2d2d2d] p-6">
        {/* Models Tab */}
        {activeTab === 'models' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Model List */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Available Models</h3>
                {/* Filters */}
                <div className="flex items-center gap-4">
                  {/* Provider Filter */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Provider:</span>
                    <select
                      value={providerFilter}
                      onChange={(e) => setProviderFilter(e.target.value as any)}
                      className="bg-[#2d2d2d] border border-[#3d3d3d] rounded px-2 py-1 text-xs text-gray-300 focus:border-purple-500 focus:outline-none"
                    >
                      <option value="all">All</option>
                      <option value="lmstudio" disabled={!availableProviders.lmstudio}>
                        LM Studio {availableProviders.lmstudio ? '' : '(offline)'}
                      </option>
                      <option value="openai" disabled={!availableProviders.openai}>
                        OpenAI {availableProviders.openai ? '' : '(no key)'}
                      </option>
                      <option value="azure" disabled={!availableProviders.azure}>
                        Azure {availableProviders.azure ? '' : '(not configured)'}
                      </option>
                    </select>
                  </div>
                  
                  {/* Test Mode */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Test Mode:</span>
                    <select
                      value={testMode}
                      onChange={(e) => setTestMode(e.target.value as any)}
                      className="bg-[#2d2d2d] border border-[#3d3d3d] rounded px-2 py-1 text-xs text-gray-300 focus:border-purple-500 focus:outline-none"
                      title="Controls model loading/unloading during tests"
                    >
                      <option value="quick">Quick (unload after)</option>
                      <option value="keep_on_success">Keep on Success</option>
                      <option value="manual">Manual (no unload)</option>
                    </select>
                  </div>
                </div>
              </div>
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-500"></div>
                </div>
              ) : models.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  No models discovered. Check your LLM provider settings.
                </p>
              ) : (
                <div className="space-y-2 max-h-[calc(100vh-400px)] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-[#3d3d3d] scrollbar-track-transparent">
                  {models.map((model) => (
                    <div
                      key={model.id}
                      onClick={() => fetchModelProfile(model.id)}
                      className={`p-4 rounded-lg border cursor-pointer transition-all ${
                        selectedModel?.modelId === model.id
                          ? 'border-purple-500 bg-purple-500/10'
                          : 'border-[#2d2d2d] hover:border-[#3d3d3d]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className={getStatusColor(model.status)}>
                            {getStatusIcon(model.status)}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-white font-medium">{model.displayName}</p>
                              {getRoleBadge(model.role)}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                              <span>{model.provider}</span>
                              {model.maxContextLength && (
                                <>
                                  <span>•</span>
                                  <span>{(model.maxContextLength / 1024).toFixed(0)}K ctx</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          {model.score !== undefined ? (
                            <div className="text-right">
                              <p className="text-white font-medium">{model.score}/100</p>
                              <p className="text-gray-500 text-xs">
                                🔧 {model.toolCount}/{model.totalTools}
                              </p>
                            </div>
                          ) : (
                            <span className="text-gray-500 text-xs">Not tested</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Model Details */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">
                  {selectedModel ? selectedModel.displayName : 'Select a Model'}
                </h3>
                {selectedModel && getRoleBadge(selectedModel.role)}
              </div>
              {selectedModel ? (
                <div className="space-y-4">
                  {/* Scores - 3 columns */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-3 bg-[#2d2d2d] rounded-lg text-center">
                      <span className="text-gray-400 text-xs">🔧 Tool</span>
                      <p className="text-xl font-bold text-white">
                        {testProgress.modelId === selectedModel.modelId && testProgress.toolsProgress?.status === 'running'
                          ? testProgress.toolsProgress.score
                          : selectedModel.score ?? 0}
                      </p>
                    </div>
                    <div className="p-3 bg-[#2d2d2d] rounded-lg text-center">
                      <span className="text-gray-400 text-xs">🔬 Probe</span>
                      <p className="text-xl font-bold text-white">
                        {testProgress.modelId === selectedModel.modelId && testProgress.probeProgress?.status === 'running'
                          ? testProgress.probeProgress.score
                          : selectedModel.probeResults?.toolScore ?? 0}
                      </p>
                    </div>
                    <div className="p-3 bg-[#2d2d2d] rounded-lg text-center">
                      <span className="text-gray-400 text-xs">🧠 Reason</span>
                      <p className="text-xl font-bold text-white">
                        {selectedModel.probeResults?.reasoningScore ?? 0}
                      </p>
                    </div>
                  </div>

                  {/* Run All Tests Button */}
                  <button
                    onClick={async () => {
                      if (!selectedModel) return;
                      // Run probe tests (includes reasoning) with latency profile
                      await runProbeTests(selectedModel.modelId, selectedModel.provider, true);
                      // Run tool tests
                      await runModelTests(selectedModel.modelId, selectedModel.provider);
                    }}
                    disabled={probingModel === selectedModel.modelId || testingModel === selectedModel.modelId}
                    className="w-full py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {probingModel === selectedModel.modelId || testingModel === selectedModel.modelId 
                      ? '⏳ Running Tests...' 
                      : '🚀 Run All Tests'}
                  </button>

                  {/* Test Progress Bars */}
                  {(testProgress.modelId === selectedModel.modelId && testProgress.probeProgress?.status === 'running') && (
                    <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-purple-400">🔬 Probe Test Running</span>
                        <span className="text-xs text-gray-400">
                          {testProgress.probeProgress.current}/{testProgress.probeProgress.total}
                        </span>
                      </div>
                      <div className="w-full bg-[#1a1a1a] rounded-full h-2 mb-2">
                        <div 
                          className="bg-purple-500 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${(testProgress.probeProgress.current / testProgress.probeProgress.total) * 100}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-500">{testProgress.probeProgress.currentTest}</p>
                    </div>
                  )}

                  {(testProgress.modelId === selectedModel.modelId && testProgress.toolsProgress?.status === 'running') && (
                    <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-blue-400">🔧 Tool Test Running</span>
                        <span className="text-xs text-gray-400">
                          {testProgress.toolsProgress.current}/{testProgress.toolsProgress.total}
                        </span>
                      </div>
                      <div className="w-full bg-[#1a1a1a] rounded-full h-2 mb-2">
                        <div 
                          className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${(testProgress.toolsProgress.current / testProgress.toolsProgress.total) * 100}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-500">{testProgress.toolsProgress.currentTest}</p>
                    </div>
                  )}

                  {(testProgress.modelId === selectedModel.modelId && testProgress.latencyProgress?.status === 'running') && (
                    <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-green-400">⏱️ Latency Test Running</span>
                        <span className="text-xs text-gray-400">
                          {testProgress.latencyProgress.current}/{testProgress.latencyProgress.total}
                        </span>
                      </div>
                      <div className="w-full bg-[#1a1a1a] rounded-full h-2 mb-2">
                        <div 
                          className="bg-green-500 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${(testProgress.latencyProgress.current / testProgress.latencyProgress.total) * 100}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-500">{testProgress.latencyProgress.currentTest}</p>
                    </div>
                  )}

                  {/* Probe Results */}
                  {selectedModel.probeResults && (
                    <div className="p-3 bg-[#2d2d2d] rounded-lg">
                      {/* Score Summary */}
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-medium text-gray-400">Probe Test Results</h4>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-gray-400">Tool: <span className="text-white font-medium">{selectedModel.probeResults?.toolScore ?? '-'}%</span></span>
                          <span className="text-gray-400">Reasoning: <span className="text-white font-medium">{selectedModel.probeResults?.reasoningScore ?? '-'}%</span></span>
                        </div>
                      </div>
                      
                      {/* Tool Behavior Probes */}
                      <div className="mb-3">
                        <p className="text-xs text-gray-500 mb-2">Tool Behavior (1.x)</p>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { name: 'Emit', key: 'emitTest', icon: '📤' },
                            { name: 'Schema', key: 'schemaTest', icon: '📋' },
                            { name: 'Selection', key: 'selectionTest', icon: '🎯' },
                            { name: 'Suppression', key: 'suppressionTest', icon: '🛑' }
                          ].map(({ name, key, icon }) => {
                            const result = selectedModel.probeResults?.[key as keyof ProbeResults] as ProbeTestResult | undefined;
                            return (
                              <div 
                                key={key} 
                                className={`p-2 rounded border ${result?.passed ? 'border-green-500/30 bg-green-500/10' : 'border-red-500/30 bg-red-500/10'}`}
                                title={result?.details}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-white">{icon} {name}</span>
                                  <span className={`text-xs font-medium ${result?.passed ? 'text-green-400' : 'text-red-400'}`}>
                                    {result?.score ?? 0}%
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      
                      {/* Reasoning Probes */}
                      {selectedModel.probeResults.reasoningProbes && (
                        <div>
                          <p className="text-xs text-gray-500 mb-2">Reasoning (2.x)</p>
                          <div className="grid grid-cols-2 gap-2">
                            {[
                              { name: 'Intent', key: 'intentExtraction', icon: '🎯' },
                              { name: 'Planning', key: 'multiStepPlanning', icon: '📋' },
                              { name: 'Conditional', key: 'conditionalReasoning', icon: '🔀' },
                              { name: 'Context', key: 'contextContinuity', icon: '🔗' },
                              { name: 'Logic', key: 'logicalConsistency', icon: '🧩' },
                              { name: 'Explain', key: 'explanation', icon: '💬' },
                              { name: 'Edge Cases', key: 'edgeCaseHandling', icon: '⚠️' }
                            ].map(({ name, key, icon }) => {
                              const result = selectedModel.probeResults?.reasoningProbes?.[key as keyof ReasoningProbeResults];
                              return (
                                <div 
                                  key={key} 
                                  className={`p-2 rounded border ${result?.passed ? 'border-green-500/30 bg-green-500/10' : 'border-red-500/30 bg-red-500/10'}`}
                                  title={result?.details}
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs text-white">{icon} {name}</span>
                                    <span className={`text-xs font-medium ${result?.passed ? 'text-green-400' : 'text-red-400'}`}>
                                      {result?.score ?? 0}%
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Context Latency */}
                  {selectedModel.contextLatency && (
                    <div className="p-3 bg-[#2d2d2d] rounded-lg">
                      <h4 className="text-sm font-medium text-gray-400 mb-2">Context Latency Profile</h4>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-400">Max Usable Context</span>
                        <span className="text-white font-medium">
                          {(selectedModel.contextLatency.maxUsableContext / 1024).toFixed(0)}K
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm mt-1">
                        <span className="text-gray-400">Recommended</span>
                        <span className="text-green-400 font-medium">
                          {(selectedModel.contextLatency.recommendedContext / 1024).toFixed(0)}K
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {Object.entries(selectedModel.contextLatency.latencies).map(([size, latency]) => (
                          <span 
                            key={size} 
                            className={`px-2 py-0.5 text-xs rounded ${latency < 30000 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}
                          >
                            {(parseInt(size) / 1024).toFixed(0)}K: {(latency / 1000).toFixed(1)}s
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Context Length */}
                  <div className="p-3 bg-[#2d2d2d] rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-gray-400">Context Length</span>
                      <div className="flex items-center gap-2">
                        {selectedModel.maxContextLength && (
                          <span className="text-xs text-gray-500">
                            max: {selectedModel.maxContextLength.toLocaleString()}
                          </span>
                        )}
                        {selectedModel.contextLength && (
                          <button
                            onClick={() => removeContextLength(selectedModel.modelId)}
                            className="text-xs text-red-400 hover:text-red-300"
                          >
                            Remove custom
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={editingContextLength ?? selectedModel.contextLength ?? defaultContextLength}
                        onChange={(e) => {
                          const newValue = parseInt(e.target.value);
                          setEditingContextLength(newValue);
                          updateContextLength(selectedModel.modelId, newValue);
                        }}
                        className="flex-1 bg-[#0d0d0d] border border-[#3d3d3d] rounded px-2 py-1 text-white text-sm focus:border-purple-500 focus:outline-none"
                      >
                        {(() => {
                          const maxCtx = selectedModel.maxContextLength || 1048576;
                          const allSizes = [
                            { value: 2048, label: '2,048 (2K)' },
                            { value: 4096, label: '4,096 (4K)' },
                            { value: 8192, label: '8,192 (8K)' },
                            { value: 16384, label: '16,384 (16K)' },
                            { value: 32768, label: '32,768 (32K)' },
                            { value: 65536, label: '65,536 (64K)' },
                            { value: 131072, label: '131,072 (128K)' },
                            { value: 1048576, label: '1,048,576 (1M)' },
                          ];
                          return allSizes
                            .filter(size => size.value <= maxCtx)
                            .map(size => (
                              <option key={size.value} value={size.value}>{size.label}</option>
                            ));
                        })()}
                      </select>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {selectedModel.contextLength 
                        ? '📌 Custom value set for this model' 
                        : `Using global default (${defaultContextLength.toLocaleString()})`}
                    </p>
                  </div>

                  {/* Tool Categories with Toggles */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-400 mb-2">Tool Capabilities</h4>
                    <div className="space-y-1 max-h-48 overflow-y-auto pr-2 scrollbar-thin">
                      {Object.entries(selectedModel.capabilities).map(([tool, cap]) => (
                        <div key={tool} className="flex items-center justify-between py-1">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={selectedModel.enabledTools?.includes(tool) || false}
                              onChange={async (e) => {
                                try {
                                  await fetch(`/api/tooly/models/${encodeURIComponent(selectedModel.modelId)}/tools/${tool}`, {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ enabled: e.target.checked })
                                  });
                                  await fetchModelProfile(selectedModel.modelId);
                                } catch (error) {
                                  console.error('Failed to toggle tool:', error);
                                }
                              }}
                              className="w-3 h-3 rounded border-gray-600 bg-[#0d0d0d] text-purple-500 focus:ring-purple-500"
                            />
                            <span className={`text-xs ${cap.supported ? 'text-white' : 'text-gray-500'}`}>
                              {tool}
                            </span>
                          </div>
                          <span className={`text-xs ${cap.score >= 70 ? 'text-green-400' : cap.score >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                            {cap.score}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => runProbeTests(selectedModel.modelId, selectedModel.provider, true)}
                      disabled={probingModel === selectedModel.modelId}
                      className="flex-1 py-2 px-3 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 disabled:opacity-50 text-sm"
                    >
                      {probingModel === selectedModel.modelId ? 'Probing...' : '🧪 Probes'}
                    </button>
                    <button
                      onClick={() => runModelTests(selectedModel.modelId, selectedModel.provider)}
                      disabled={testingModel === selectedModel.modelId}
                      className="flex-1 py-2 px-3 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 disabled:opacity-50 text-sm"
                    >
                      {testingModel === selectedModel.modelId ? 'Testing...' : '🔧 Tools'}
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          await fetch(`/api/tooly/models/${encodeURIComponent(selectedModel.modelId)}/latency-profile`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ provider: selectedModel.provider })
                          });
                          await fetchModelProfile(selectedModel.modelId);
                        } catch (error) {
                          console.error('Failed to run latency profile:', error);
                        }
                      }}
                      className="flex-1 py-2 px-3 bg-yellow-500/20 text-yellow-400 rounded-lg hover:bg-yellow-500/30 text-sm"
                    >
                      ⏱️ Latency
                    </button>
                  </div>

                  {/* System Prompt Editor */}
                  <div className="pt-3 border-t border-[#3d3d3d]">
                    <button
                      onClick={() => setShowSystemPromptEditor(!showSystemPromptEditor)}
                      className="text-sm text-gray-400 hover:text-white flex items-center gap-2"
                    >
                      <span>{showSystemPromptEditor ? '▼' : '▶'}</span>
                      <span>Custom System Prompt</span>
                      {selectedModel.systemPrompt && <span className="text-xs text-purple-400">(customized)</span>}
                    </button>
                    
                    {showSystemPromptEditor && (
                      <div className="mt-3 space-y-2">
                        <textarea
                          value={editingSystemPrompt}
                          onChange={(e) => setEditingSystemPrompt(e.target.value)}
                          placeholder="Enter custom system prompt for this model..."
                          className="w-full h-32 bg-[#0d0d0d] border border-[#3d3d3d] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none resize-none"
                        />
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => {
                              setEditingSystemPrompt('');
                              saveSystemPrompt(selectedModel.modelId, '');
                            }}
                            className="px-3 py-1 text-xs text-gray-400 hover:text-white"
                          >
                            Clear
                          </button>
                          <button
                            onClick={() => saveSystemPrompt(selectedModel.modelId, editingSystemPrompt)}
                            disabled={savingSystemPrompt}
                            className="px-3 py-1 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded disabled:opacity-50"
                          >
                            {savingSystemPrompt ? 'Saving...' : 'Save Prompt'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-64 text-gray-500">
                  Select a model to view details
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tests Tab */}
        {activeTab === 'tests' && (
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">Test Definitions</h3>
            {tests.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No test definitions found.</p>
            ) : (
              <div className="space-y-2">
                {tests.map((test) => (
                  <div
                    key={test.id}
                    className="p-4 rounded-lg border border-[#2d2d2d] hover:border-[#3d3d3d]"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-white font-medium">{test.id}</p>
                        <p className="text-gray-500 text-sm">{test.tool} • {test.category}</p>
                      </div>
                      <span className={`px-2 py-1 text-xs rounded ${
                        test.difficulty === 'easy' ? 'bg-green-500/20 text-green-400' :
                        test.difficulty === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-red-500/20 text-red-400'
                      }`}>
                        {test.difficulty}
                      </span>
                    </div>
                    <p className="text-gray-400 text-sm mt-2 truncate">{test.prompt}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Logs Tab */}
        {activeTab === 'logs' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Execution Logs</h3>
              
              {/* Log Filters */}
              <div className="flex items-center gap-3">
                <select
                  value={logStatusFilter}
                  onChange={(e) => setLogStatusFilter(e.target.value as typeof logStatusFilter)}
                  className="bg-[#2d2d2d] border border-[#3d3d3d] rounded px-2 py-1 text-xs text-gray-300 focus:border-purple-500 focus:outline-none"
                >
                  <option value="all">All Status</option>
                  <option value="success">Success</option>
                  <option value="failed">Failed</option>
                  <option value="timeout">Timeout</option>
                </select>
                
                <input
                  type="text"
                  value={logToolFilter}
                  onChange={(e) => setLogToolFilter(e.target.value)}
                  placeholder="Filter by tool..."
                  className="bg-[#2d2d2d] border border-[#3d3d3d] rounded px-2 py-1 text-xs text-gray-300 w-32 focus:border-purple-500 focus:outline-none"
                />
              </div>
            </div>
            
            {logs.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No execution logs yet.</p>
            ) : (
              <div className="space-y-2">
                {logs
                  .filter(log => logStatusFilter === 'all' || log.status === logStatusFilter)
                  .filter(log => !logToolFilter || log.tool.toLowerCase().includes(logToolFilter.toLowerCase()))
                  .map((log) => (
                  <div
                    key={log.id}
                    className="p-4 rounded-lg border border-[#2d2d2d] hover:border-[#3d3d3d]"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={
                          log.status === 'success' ? 'text-green-400' :
                          log.status === 'failed' ? 'text-red-400' :
                          'text-yellow-400'
                        }>
                          {log.status === 'success' ? '✅' : log.status === 'failed' ? '❌' : '⏳'}
                        </span>
                        <div>
                          <p className="text-white">{log.tool}</p>
                          <p className="text-gray-500 text-xs">
                            {new Date(log.timestamp).toLocaleString()} • {log.durationMs}ms
                          </p>
                        </div>
                      </div>
                      {log.backupId && (
                        <button
                          onClick={() => handleRollback(log.backupId!)}
                          className="px-3 py-1 text-xs bg-yellow-500/20 text-yellow-400 rounded hover:bg-yellow-500/30"
                        >
                          ↩️ Undo
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Tooly;

