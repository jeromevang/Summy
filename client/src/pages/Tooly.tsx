import React, { useState, useEffect } from 'react';

// ============================================================
// TYPES
// ============================================================

interface ProbeResults {
  testedAt: string;
  emitTest: { passed: boolean; score: number; details: string };
  schemaTest: { passed: boolean; score: number; details: string };
  selectionTest: { passed: boolean; score: number; details: string };
  suppressionTest: { passed: boolean; score: number; details: string };
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
  role?: 'main' | 'executor' | 'both' | 'none';
  probeResults?: ProbeResults;
  contextLatency?: ContextLatencyData;
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
  const [providerFilter, setProviderFilter] = useState<'all' | 'lmstudio' | 'openai' | 'azure'>('all');
  const [availableProviders, setAvailableProviders] = useState<{ lmstudio: boolean; openai: boolean; azure: boolean }>({
    lmstudio: false, openai: false, azure: false
  });
  const [testMode, setTestMode] = useState<'quick' | 'keep_on_success' | 'manual'>('keep_on_success');
  const [defaultContextLength, setDefaultContextLength] = useState<number>(8192);
  const [editingContextLength, setEditingContextLength] = useState<number | null>(null);
  const [probingModel, setProbingModel] = useState<string | null>(null);
  const [proxyMode, setProxyMode] = useState<'passthrough' | 'summy' | 'tooly' | 'both'>('both');

  // Fetch settings for default context length and proxy mode
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
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error);
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
      }
    } catch (error) {
      console.error('Failed to fetch model profile:', error);
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
                <div className="space-y-2">
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
                            <p className="text-gray-500 text-xs">{model.provider}</p>
                          </div>
                        </div>
                        <div className="text-right flex items-center gap-2">
                          {model.score !== undefined ? (
                            <div className="text-right">
                              <p className="text-white">{model.score}/100</p>
                              <p className="text-gray-500 text-xs">
                                🔧 {model.toolCount}/{model.totalTools}
                              </p>
                            </div>
                          ) : null}
                          {!model.role && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                runProbeTests(model.id, model.provider);
                              }}
                              disabled={probingModel === model.id}
                              className="px-3 py-1 text-xs bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30 disabled:opacity-50"
                              title="Run probe tests to determine model role"
                            >
                              {probingModel === model.id ? 'Probing...' : 'Probe'}
                            </button>
                          )}
                          {model.score === undefined && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                runModelTests(model.id, model.provider);
                              }}
                              disabled={testingModel === model.id}
                              className="px-3 py-1 text-xs bg-purple-500/20 text-purple-400 rounded hover:bg-purple-500/30 disabled:opacity-50"
                            >
                              {testingModel === model.id ? 'Testing...' : 'Test Tools'}
                            </button>
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
                  {/* Role & Score */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-[#2d2d2d] rounded-lg">
                      <span className="text-gray-400 text-sm">Tool Score</span>
                      <p className="text-2xl font-bold text-white">{selectedModel.score}/100</p>
                    </div>
                    <div className="p-3 bg-[#2d2d2d] rounded-lg">
                      <span className="text-gray-400 text-sm">Probe Score</span>
                      <p className="text-2xl font-bold text-white">
                        {selectedModel.probeResults?.overallScore ?? '-'}/100
                      </p>
                    </div>
                  </div>

                  {/* Probe Results */}
                  {selectedModel.probeResults && (
                    <div className="p-3 bg-[#2d2d2d] rounded-lg">
                      <h4 className="text-sm font-medium text-gray-400 mb-3">Probe Test Results</h4>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { name: 'Emit', key: 'emitTest', icon: '📤' },
                          { name: 'Schema', key: 'schemaTest', icon: '📋' },
                          { name: 'Selection', key: 'selectionTest', icon: '🎯' },
                          { name: 'Suppression', key: 'suppressionTest', icon: '🛑' }
                        ].map(({ name, key, icon }) => {
                          const result = selectedModel.probeResults?.[key as keyof ProbeResults] as { passed: boolean; score: number; details: string } | undefined;
                          return (
                            <div 
                              key={key} 
                              className={`p-2 rounded border ${result?.passed ? 'border-green-500/30 bg-green-500/10' : 'border-red-500/30 bg-red-500/10'}`}
                              title={result?.details}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-white">{icon} {name}</span>
                                <span className={`text-sm font-medium ${result?.passed ? 'text-green-400' : 'text-red-400'}`}>
                                  {result?.score ?? 0}%
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
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
                      {selectedModel.contextLength && (
                        <button
                          onClick={() => removeContextLength(selectedModel.modelId)}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          Remove custom
                        </button>
                      )}
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
                        <option value={2048}>2,048 (2K)</option>
                        <option value={4096}>4,096 (4K)</option>
                        <option value={8192}>8,192 (8K)</option>
                        <option value={16384}>16,384 (16K)</option>
                        <option value={32768}>32,768 (32K)</option>
                        <option value={65536}>65,536 (64K)</option>
                        <option value={131072}>131,072 (128K)</option>
                        <option value={1048576}>1,048,576 (1M)</option>
                      </select>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {selectedModel.contextLength 
                        ? '📌 Custom value set for this model' 
                        : `Using global default (${defaultContextLength.toLocaleString()})`}
                    </p>
                  </div>

                  {/* Tool Categories */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-400 mb-2">Tool Capabilities</h4>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {Object.entries(selectedModel.capabilities).map(([tool, cap]) => (
                        <div key={tool} className="flex items-center justify-between py-1">
                          <span className={`text-sm ${cap.supported ? 'text-white' : 'text-gray-500'}`}>
                            {cap.supported ? '✅' : '❌'} {tool}
                          </span>
                          <span className="text-sm text-gray-500">{cap.score}%</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => runProbeTests(selectedModel.modelId, selectedModel.provider, true)}
                      disabled={probingModel === selectedModel.modelId}
                      className="flex-1 py-2 px-4 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 disabled:opacity-50"
                    >
                      {probingModel === selectedModel.modelId ? 'Probing...' : '🧪 Run Probes'}
                    </button>
                    <button
                      onClick={() => runModelTests(selectedModel.modelId, selectedModel.provider)}
                      disabled={testingModel === selectedModel.modelId}
                      className="flex-1 py-2 px-4 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 disabled:opacity-50"
                    >
                      {testingModel === selectedModel.modelId ? 'Testing...' : '🔧 Test Tools'}
                    </button>
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
            <h3 className="text-lg font-semibold text-white mb-4">Execution Logs</h3>
            {logs.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No execution logs yet.</p>
            ) : (
              <div className="space-y-2">
                {logs.map((log) => (
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

