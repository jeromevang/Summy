import React, { useState, useEffect, useRef } from 'react';
import ReconnectingWebSocket from 'reconnecting-websocket';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';

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
  // Core tool probes (1.1 - 1.4)
  emitTest: ProbeTestResult;
  schemaTest: ProbeTestResult;
  selectionTest: ProbeTestResult;
  suppressionTest: ProbeTestResult;
  // Enhanced tool probes (1.5 - 1.8)
  nearIdenticalSelectionTest?: ProbeTestResult;
  multiToolEmitTest?: ProbeTestResult;
  argumentValidationTest?: ProbeTestResult;
  schemaReorderTest?: ProbeTestResult;
  // Reasoning
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
  modelMaxContext?: number;
  minLatency?: number;
  isInteractiveSpeed?: boolean;
  speedRating?: 'excellent' | 'good' | 'acceptable' | 'slow' | 'very_slow';
}

interface ModelProfile {
  modelId: string;
  displayName: string;
  provider: 'lmstudio' | 'openai' | 'azure';
  testedAt: string;
  score: number;
  enabledTools: string[];
  capabilities: Record<string, { supported: boolean; score: number; nativeAliases?: string[] }>;
  contextLength?: number;
  maxContextLength?: number;
  role?: 'main' | 'executor' | 'both' | 'none';
  probeResults?: ProbeResults;
  contextLatency?: ContextLatencyData;
  systemPrompt?: string;
  discoveredNativeTools?: string[];  // ALL tools the model claims to support
  unmappedNativeTools?: string[];    // Tools that couldn't be matched to any MCP tool
}

interface DiscoveredModel {
  id: string;
  displayName: string;
  provider: 'lmstudio' | 'openai' | 'azure';
  status: 'tested' | 'untested' | 'failed' | 'known_good';
  score?: number;
  toolScore?: number;
  reasoningScore?: number;
  toolCount?: number;
  totalTools?: number;
  role?: 'main' | 'executor' | 'both' | 'none';
  maxContextLength?: number;
  sizeBytes?: number;
  quantization?: string;
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
  const selectedModelRef = useRef<string | null>(null);
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

  // Model loading state
  const [modelLoading, setModelLoading] = useState<{
    modelId?: string;
    status?: 'loading' | 'unloading' | 'loaded' | 'unloaded' | 'failed';
    message?: string;
  }>({});

  // System metrics state for CPU/GPU charts
  const [systemMetrics, setSystemMetrics] = useState<{
    cpu: number;
    gpu: number;
    gpuMemory: number;
    gpuTemp: number;
    gpuName: string;
  }[]>([]);

  // Slow model prompt state
  const [showSlowModelPrompt, setShowSlowModelPrompt] = useState(false);
  const [slowModelLatency, setSlowModelLatency] = useState<number>(0);
  const pendingTestRef = useRef<{ modelId: string; provider: string } | null>(null);

  // Test all models state
  const [testingAllModels, setTestingAllModels] = useState(false);
  const [testAllProgress, setTestAllProgress] = useState<{
    current: number;
    total: number;
    currentModelName: string;
    skipped: string[];
    completed: string[];
  } | null>(null);
  const cancelTestAllRef = useRef(false);

  // Keep ref in sync with selectedModel
  useEffect(() => {
    selectedModelRef.current = selectedModel?.modelId || null;
  }, [selectedModel?.modelId]);

  // Listen for WebSocket progress updates with auto-reconnect
  useEffect(() => {
    const ws = new ReconnectingWebSocket('ws://localhost:3001');
    
    ws.onopen = () => {
      console.log('[Tooly] WebSocket connected for progress updates');
    };
    
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('[Tooly] WS message received:', message.type, message.data?.testType, message.data?.current, message.data?.total);
        if (message.type === 'test_progress') {
          const { testType, modelId, current, total, currentTest, score, status } = message.data;
          console.log('[Tooly] Progress update:', testType, `${current}/${total}`, currentTest, status, 'score:', score);
          setTestProgress(prev => {
            const newState = {
              ...prev,
              modelId,
              [`${testType}Progress`]: { current, total, currentTest, score: score ?? 0, status }
            };
            console.log('[Tooly] New testProgress state:', newState);
            return newState;
          });
          
          // Refresh model list and selected model profile when test completes
          if (status === 'completed') {
            setTimeout(() => {
              fetchModels();
              // Use ref to get current selected model ID
              if (modelId === selectedModelRef.current) {
                fetchModelProfile(modelId);
              }
            }, 500);
          }
        } else if (message.type === 'model_loading') {
          const { modelId, status, message: loadMessage } = message.data;
          console.log('[Tooly] Model loading:', modelId, status, loadMessage);
          setModelLoading({ modelId, status, message: loadMessage });
          
          // Clear loading state after model is loaded/failed
          if (status === 'loaded' || status === 'failed' || status === 'unloaded') {
            setTimeout(() => setModelLoading({}), 2000);
          }
        } else if (message.type === 'system_metrics') {
          const { cpu, gpu, gpuMemory, gpuTemp, gpuName } = message.data;
          setSystemMetrics(prev => {
            const newMetrics = [...prev, { cpu, gpu, gpuMemory, gpuTemp, gpuName }];
            // Keep last 30 data points (30 seconds of history)
            return newMetrics.slice(-30);
          });
        }
      } catch (e) {
        // Ignore parse errors
      }
    };
    
    ws.onerror = (e) => {
      console.error('[Tooly] WebSocket error:', e);
    };
    
    ws.onclose = () => {
      console.log('[Tooly] WebSocket closed, will auto-reconnect...');
    };

    return () => ws.close();
  }, []); // Empty dependency - stable connection with auto-reconnect

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

  // Validation error for model selection
  const [modelValidationError, setModelValidationError] = useState<string>('');
  
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

      {/* Model Selection & Dual-Model Configuration */}
      <div className="bg-[#1a1a1a] rounded-xl border border-[#2d2d2d] p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-medium flex items-center gap-2">
            <span className="text-lg">🎯</span> Active Model Configuration
          </h3>
          <button
            onClick={saveDualModelConfig}
            disabled={savingDualModel}
            className="px-4 py-1.5 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-lg disabled:opacity-50 font-medium"
          >
            {savingDualModel ? 'Saving...' : 'Save & Apply'}
          </button>
        </div>
        
        {/* Validation Error */}
        {modelValidationError && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
            ❌ {modelValidationError}
          </div>
        )}
        
        {/* Dual Model Toggle */}
        <label className="flex items-center gap-3 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={enableDualModel}
            onChange={(e) => {
              setEnableDualModel(e.target.checked);
              setModelValidationError('');
            }}
            className="w-5 h-5 rounded border-gray-600 bg-[#0d0d0d] text-purple-500 focus:ring-purple-500"
          />
          <div>
            <span className="text-white font-medium">Enable Dual-Model Routing</span>
            <p className="text-xs text-gray-400">Use separate models for reasoning and tool execution</p>
          </div>
        </label>
        
        {/* Model Selection */}
        <div className={`grid ${enableDualModel ? 'grid-cols-2' : 'grid-cols-1'} gap-4`}>
          {/* Main Model - Always shown */}
          <div className="p-3 bg-[#0d0d0d] rounded-lg border border-[#2d2d2d]">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">{enableDualModel ? '🧠' : '🤖'}</span>
              <span className="text-white font-medium">
                {enableDualModel ? 'Main Model (Reasoning)' : 'Model'}
              </span>
            </div>
            <select
              value={mainModelId}
              onChange={(e) => {
                setMainModelId(e.target.value);
                setModelValidationError('');
              }}
              className="w-full bg-[#1a1a1a] border border-[#3d3d3d] rounded px-3 py-2 text-white text-sm focus:border-purple-500 focus:outline-none"
            >
              <option value="">Select model...</option>
              {models.filter(m => m.provider === 'lmstudio').map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName} {m.maxContextLength ? `(${Math.round(m.maxContextLength / 1024)}K)` : ''}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-2">
              {enableDualModel 
                ? 'Handles reasoning, planning. No direct tool access.' 
                : 'This model handles all requests (reasoning + tools)'}
            </p>
          </div>
          
          {/* Executor Model - Only shown when dual mode is enabled */}
          {enableDualModel && (
            <div className="p-3 bg-[#0d0d0d] rounded-lg border border-[#2d2d2d]">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">⚡</span>
                <span className="text-white font-medium">Executor Model (Tools)</span>
              </div>
              <select
                value={executorModelId}
                onChange={(e) => {
                  setExecutorModelId(e.target.value);
                  setModelValidationError('');
                }}
                className="w-full bg-[#1a1a1a] border border-[#3d3d3d] rounded px-3 py-2 text-white text-sm focus:border-purple-500 focus:outline-none"
              >
                <option value="">Select model...</option>
                {models.filter(m => m.provider === 'lmstudio').map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName} {m.maxContextLength ? `(${Math.round(m.maxContextLength / 1024)}K)` : ''}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-2">
                Executes tool calls. Schema-aware, deterministic.
              </p>
            </div>
          )}
        </div>
        
        {/* Current Active Model Display */}
        {mainModelId && (
          <div className="mt-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
            <div className="text-xs text-gray-400 mb-1">Active Model(s):</div>
            <div className="text-sm text-white">
              {enableDualModel ? (
                <>
                  <span className="text-purple-400">Main:</span> {models.find(m => m.id === mainModelId)?.displayName || mainModelId}
                  {executorModelId && (
                    <>
                      <span className="mx-2 text-gray-500">|</span>
                      <span className="text-blue-400">Executor:</span> {models.find(m => m.id === executorModelId)?.displayName || executorModelId}
                    </>
                  )}
                </>
              ) : (
                <span className="text-green-400">{models.find(m => m.id === mainModelId)?.displayName || mainModelId}</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* System Metrics Charts */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-[#1a1a1a] rounded-lg p-3 border border-[#2d2d2d]">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-400">🖥️ CPU Usage</span>
            <span className="text-lg font-bold text-purple-400">
              {systemMetrics[systemMetrics.length - 1]?.cpu ?? 0}%
            </span>
          </div>
          <div className="h-16">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={systemMetrics}>
                <YAxis domain={[0, 100]} hide />
                <Line 
                  type="monotone" 
                  dataKey="cpu" 
                  stroke="#8b5cf6" 
                  strokeWidth={2} 
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="bg-[#1a1a1a] rounded-lg p-3 border border-[#2d2d2d]">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">🎮 GPU Usage</span>
              {systemMetrics[systemMetrics.length - 1]?.gpuTemp > 0 && (
                <span className={`text-xs ${
                  systemMetrics[systemMetrics.length - 1]?.gpuTemp > 80 ? 'text-red-400' :
                  systemMetrics[systemMetrics.length - 1]?.gpuTemp > 60 ? 'text-yellow-400' :
                  'text-gray-500'
                }`}>
                  🌡️ {systemMetrics[systemMetrics.length - 1]?.gpuTemp}°C
                </span>
              )}
            </div>
            <span className="text-lg font-bold text-green-400">
              {systemMetrics[systemMetrics.length - 1]?.gpu ?? 0}%
            </span>
          </div>
          <div className="h-16">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={systemMetrics}>
                <YAxis domain={[0, 100]} hide />
                <Line 
                  type="monotone" 
                  dataKey="gpu" 
                  stroke="#10b981" 
                  strokeWidth={2} 
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {systemMetrics[systemMetrics.length - 1]?.gpuName && (
            <p className="text-xs text-gray-600 mt-1 truncate">
              {systemMetrics[systemMetrics.length - 1]?.gpuName}
            </p>
          )}
        </div>
      </div>

      {/* Slow Model Prompt Modal */}
      {showSlowModelPrompt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#1a1a1a] border border-[#3d3d3d] rounded-lg p-6 max-w-md mx-4">
            <div className="text-center mb-4">
              <span className="text-4xl">🐢</span>
              <h3 className="text-lg font-semibold text-white mt-2">This Model is a Bit Slow</h3>
            </div>
            <p className="text-gray-400 text-sm mb-2">
              Initial latency test took <span className="text-yellow-400 font-medium">{(slowModelLatency / 1000).toFixed(1)}s</span> at 2K context.
            </p>
            <p className="text-gray-400 text-sm mb-4">
              Full testing may take a while. This is typical for larger models on consumer hardware.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowSlowModelPrompt(false);
                  // Mark as too slow and don't run tests
                  if (pendingTestRef.current) {
                    setTestProgress(prev => ({
                      ...prev,
                      modelId: pendingTestRef.current?.modelId,
                      latencyProgress: { 
                        current: 1, 
                        total: 1, 
                        currentTest: 'Skipped - too slow for local testing', 
                        status: 'completed' 
                      }
                    }));
                  }
                  pendingTestRef.current = null;
                }}
                className="flex-1 py-2 bg-[#2d2d2d] hover:bg-[#3d3d3d] text-gray-300 rounded-lg transition-colors"
              >
                Cancel Tests
              </button>
              <button
                onClick={async () => {
                  setShowSlowModelPrompt(false);
                  if (pendingTestRef.current) {
                    const { modelId, provider } = pendingTestRef.current;
                    pendingTestRef.current = null;
                    // Continue with remaining tests
                    await runProbeTests(modelId, provider, false);
                    setTestProgress(prev => ({
                      ...prev,
                      modelId,
                      probeProgress: undefined,
                      toolsProgress: { current: 0, total: 1, currentTest: 'Starting tool tests...', score: 0, status: 'running' }
                    }));
                    await runModelTests(modelId, provider);
                    setTestProgress({});
                  }
                }}
                className="flex-1 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
              >
                Continue Anyway
              </button>
            </div>
          </div>
        </div>
      )}

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
            <div className="flex flex-col">
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
                  {/* Test All Models Button */}
                  <button
                    onClick={async () => {
                      if (testingAllModels) {
                        // Cancel
                        cancelTestAllRef.current = true;
                        return;
                      }
                      
                      const modelsToTest = models.filter(m => m.provider === 'lmstudio');
                      if (modelsToTest.length === 0) return;
                      
                      setTestingAllModels(true);
                      cancelTestAllRef.current = false;
                      setTestAllProgress({
                        current: 0,
                        total: modelsToTest.length,
                        currentModelName: '',
                        skipped: [],
                        completed: []
                      });
                      
                      for (let i = 0; i < modelsToTest.length; i++) {
                        if (cancelTestAllRef.current) break;
                        
                        const model = modelsToTest[i];
                        setTestAllProgress(prev => prev ? {
                          ...prev,
                          current: i + 1,
                          currentModelName: model.displayName
                        } : null);
                        
                        // Quick latency check
                        try {
                          const quickLatencyRes = await fetch(`/api/tooly/models/${encodeURIComponent(model.id)}/quick-latency`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ provider: model.provider })
                          });
                          
                          if (quickLatencyRes.ok) {
                            const { latency } = await quickLatencyRes.json();
                            
                            // Skip if too slow (> 10 seconds)
                            if (latency > 10000) {
                              setTestAllProgress(prev => prev ? {
                                ...prev,
                                skipped: [...prev.skipped, model.displayName]
                              } : null);
                              continue;
                            }
                          } else {
                            // Timeout or error - skip
                            setTestAllProgress(prev => prev ? {
                              ...prev,
                              skipped: [...prev.skipped, model.displayName]
                            } : null);
                            continue;
                          }
                        } catch {
                          // Skip on error
                          setTestAllProgress(prev => prev ? {
                            ...prev,
                            skipped: [...prev.skipped, model.displayName]
                          } : null);
                          continue;
                        }
                        
                        if (cancelTestAllRef.current) break;
                        
                        // Run full tests
                        try {
                          await fetch(`/api/tooly/models/${encodeURIComponent(model.id)}/probe`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ provider: model.provider, runLatencyProfile: false })
                          });
                          
                          if (cancelTestAllRef.current) break;
                          
                          await fetch(`/api/tooly/models/${encodeURIComponent(model.id)}/test`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ provider: model.provider })
                          });
                          
                          if (cancelTestAllRef.current) break;
                          
                          await fetch(`/api/tooly/models/${encodeURIComponent(model.id)}/latency-profile`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ provider: model.provider })
                          });
                          
                          setTestAllProgress(prev => prev ? {
                            ...prev,
                            completed: [...prev.completed, model.displayName]
                          } : null);
                        } catch (error) {
                          console.error(`Failed to test ${model.id}:`, error);
                          setTestAllProgress(prev => prev ? {
                            ...prev,
                            skipped: [...prev.skipped, model.displayName]
                          } : null);
                        }
                      }
                      
                      // Refresh model list
                      await fetchModels();
                      setTestingAllModels(false);
                      
                      // Keep progress visible for a moment
                      setTimeout(() => setTestAllProgress(null), 5000);
                    }}
                    disabled={models.filter(m => m.provider === 'lmstudio').length === 0}
                    className={`px-3 py-1 text-xs rounded transition-colors ${
                      testingAllModels 
                        ? 'bg-red-600 hover:bg-red-700 text-white' 
                        : 'bg-purple-600 hover:bg-purple-700 text-white'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {testingAllModels ? '⏹️ Stop' : '🧪 Test All'}
                  </button>
                </div>
              </div>
              
              {/* Test All Progress */}
              {testAllProgress && (
                <div className="mb-4 p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-purple-400">
                      Testing All Models ({testAllProgress.current}/{testAllProgress.total})
                    </span>
                    <span className="text-xs text-gray-400">
                      ✅ {testAllProgress.completed.length} | ⏭️ {testAllProgress.skipped.length} skipped
                    </span>
                  </div>
                  <div className="w-full bg-[#1a1a1a] rounded-full h-2 mb-2">
                    <div 
                      className="bg-purple-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${(testAllProgress.current / testAllProgress.total) * 100}%` }}
                    />
                  </div>
                  {testAllProgress.currentModelName && testingAllModels && (
                    <p className="text-xs text-gray-500">
                      Testing: {testAllProgress.currentModelName}
                    </p>
                  )}
                  {!testingAllModels && testAllProgress.skipped.length > 0 && (
                    <p className="text-xs text-yellow-400 mt-1">
                      Skipped (too slow): {testAllProgress.skipped.join(', ')}
                    </p>
                  )}
                </div>
              )}
              
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-500"></div>
                </div>
              ) : models.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  No models discovered. Check your LLM provider settings.
                </p>
              ) : (
                <div className="space-y-2 flex-1 max-h-[calc(100vh-340px)] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-[#3d3d3d] scrollbar-track-transparent">
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
                              {model.quantization && (
                                <>
                                  <span>•</span>
                                  <span className="text-purple-400">{model.quantization}</span>
                                </>
                              )}
                              {model.sizeBytes && (
                                <>
                                  <span>•</span>
                                  <span>{(model.sizeBytes / (1024 * 1024 * 1024)).toFixed(1)}GB</span>
                                </>
                              )}
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
                              <p className="text-white font-medium" title="🔧Tools / 🔬Probe / 🧠Reasoning">
                                🔧{model.score}/🔬{model.toolScore ?? '-'}/🧠{model.reasoningScore ?? '-'}
                              </p>
                              <p className="text-gray-500 text-xs">
                                {model.toolCount}/{model.totalTools} tools
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
            <div className="flex flex-col max-h-[calc(100vh-280px)] overflow-y-auto scrollbar-thin scrollbar-thumb-[#3d3d3d] scrollbar-track-transparent">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-white">
                    {selectedModel ? selectedModel.displayName : 'Select a Model'}
                  </h3>
                  {selectedModel && getRoleBadge(selectedModel.role)}
                </div>
                {selectedModel && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setAsMainModel(selectedModel.id)}
                      disabled={savingDualModel}
                      className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                        mainModelId === selectedModel.id
                          ? 'bg-purple-600 text-white'
                          : 'bg-[#2d2d2d] text-gray-300 hover:bg-purple-600/50 hover:text-white'
                      }`}
                    >
                      {mainModelId === selectedModel.id ? '✓ Main' : 'Use as Main'}
                    </button>
                    <button
                      onClick={() => setAsExecutorModel(selectedModel.id)}
                      disabled={savingDualModel}
                      className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                        executorModelId === selectedModel.id
                          ? 'bg-blue-600 text-white'
                          : 'bg-[#2d2d2d] text-gray-300 hover:bg-blue-600/50 hover:text-white'
                      }`}
                    >
                      {executorModelId === selectedModel.id ? '✓ Executor' : 'Use as Executor'}
                    </button>
                  </div>
                )}
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
                      
                      // NEW ORDER: latency (quick check) → probe → tools → full latency
                      
                      // 1. Quick latency check at 2K context first
                      setTestProgress({
                        modelId: selectedModel.modelId,
                        latencyProgress: { current: 0, total: 1, currentTest: 'Quick latency check at 2K...', status: 'running' }
                      });
                      
                      try {
                        const quickLatencyRes = await fetch(`/api/tooly/models/${encodeURIComponent(selectedModel.modelId)}/quick-latency`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ provider: selectedModel.provider })
                        });
                        
                        if (quickLatencyRes.ok) {
                          const { latency } = await quickLatencyRes.json();
                          
                          // If latency > 10 seconds, show prompt
                          if (latency > 10000) {
                            setSlowModelLatency(latency);
                            pendingTestRef.current = { modelId: selectedModel.modelId, provider: selectedModel.provider || 'lmstudio' };
                            setShowSlowModelPrompt(true);
                            setTestProgress({});
                            return; // Stop here, user will decide
                          }
                        }
                      } catch (error) {
                        console.error('Quick latency check failed:', error);
                      }
                      
                      // 2. Run probe tests (includes reasoning)
                      setTestProgress(prev => ({
                        ...prev,
                        latencyProgress: undefined,
                        probeProgress: { current: 0, total: 1, currentTest: 'Initializing...', score: 0, status: 'running' }
                      }));
                      await runProbeTests(selectedModel.modelId, selectedModel.provider, false);
                      
                      // 3. Run tool capability tests
                      setTestProgress(prev => ({
                        ...prev,
                        probeProgress: undefined,
                        toolsProgress: { current: 0, total: 1, currentTest: 'Initializing...', score: 0, status: 'running' }
                      }));
                      await runModelTests(selectedModel.modelId, selectedModel.provider);
                      
                      // 4. Run full latency profile
                      setTestProgress(prev => ({
                        ...prev,
                        toolsProgress: undefined,
                        latencyProgress: { current: 0, total: 1, currentTest: 'Running full latency profile...', status: 'running' }
                      }));
                      
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
                      
                      // Clear progress on completion
                      setTestProgress({});
                    }}
                    disabled={probingModel === selectedModel.modelId || testingModel === selectedModel.modelId}
                    className="w-full py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {probingModel === selectedModel.modelId || testingModel === selectedModel.modelId 
                      ? '⏳ Running Tests...' 
                      : '🚀 Run All Tests'}
                  </button>

                  {/* Model Loading Indicator */}
                  {modelLoading.modelId === selectedModel.modelId && (modelLoading.status === 'loading' || modelLoading.status === 'unloading') && (
                    <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="animate-spin h-5 w-5 border-2 border-yellow-500 border-t-transparent rounded-full" />
                        <div>
                          <span className="text-sm text-yellow-400">
                            {modelLoading.status === 'loading' ? '📥 Loading Model...' : '📤 Unloading Model...'}
                          </span>
                          <p className="text-xs text-gray-500">{modelLoading.message}</p>
                        </div>
                      </div>
                    </div>
                  )}

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
                      
                      {/* Core Tool Behavior Probes */}
                      <div className="mb-3">
                        <p className="text-xs text-gray-500 mb-2">Tool Behavior - Core (1.1-1.4)</p>
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
                      
                      {/* Enhanced Tool Behavior Probes */}
                      <div className="mb-3">
                        <p className="text-xs text-gray-500 mb-2">Tool Behavior - Enhanced (1.5-1.8)</p>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { name: 'Similar Tools', key: 'nearIdenticalSelectionTest', icon: '🔍' },
                            { name: 'Multi-Tool', key: 'multiToolEmitTest', icon: '📦' },
                            { name: 'Arguments', key: 'argumentValidationTest', icon: '✅' },
                            { name: 'Reorder', key: 'schemaReorderTest', icon: '🔄' }
                          ].map(({ name, key, icon }) => {
                            const result = selectedModel.probeResults?.[key as keyof ProbeResults] as ProbeTestResult | undefined;
                            return (
                              <div 
                                key={key} 
                                className={`p-2 rounded border ${result?.passed ? 'border-green-500/30 bg-green-500/10' : result === undefined ? 'border-gray-500/30 bg-gray-500/10' : 'border-red-500/30 bg-red-500/10'}`}
                                title={result?.details || 'Not tested yet'}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-white">{icon} {name}</span>
                                  <span className={`text-xs font-medium ${result?.passed ? 'text-green-400' : result === undefined ? 'text-gray-400' : 'text-red-400'}`}>
                                    {result?.score ?? '-'}%
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
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-medium text-gray-400">Context Latency Profile</h4>
                        {/* Speed Rating Badge */}
                        {selectedModel.contextLatency.speedRating && (
                          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                            selectedModel.contextLatency.speedRating === 'excellent' ? 'bg-green-500/20 text-green-400' :
                            selectedModel.contextLatency.speedRating === 'good' ? 'bg-blue-500/20 text-blue-400' :
                            selectedModel.contextLatency.speedRating === 'acceptable' ? 'bg-yellow-500/20 text-yellow-400' :
                            selectedModel.contextLatency.speedRating === 'slow' ? 'bg-orange-500/20 text-orange-400' :
                            'bg-red-500/20 text-red-400'
                          }`}>
                            {selectedModel.contextLatency.speedRating === 'excellent' ? '🚀 Excellent' :
                             selectedModel.contextLatency.speedRating === 'good' ? '✅ Good' :
                             selectedModel.contextLatency.speedRating === 'acceptable' ? '⚡ Acceptable' :
                             selectedModel.contextLatency.speedRating === 'slow' ? '🐢 Slow' :
                             '⚠️ Very Slow'}
                          </span>
                        )}
                      </div>
                      
                      {/* Speed Warning */}
                      {selectedModel.contextLatency.isInteractiveSpeed === false && (
                        <div className="mb-2 p-2 bg-orange-500/10 border border-orange-500/30 rounded text-xs text-orange-400">
                          ⚠️ This model may be too slow for interactive IDE use. Consider using a smaller/faster model.
                        </div>
                      )}
                      
                      {/* Min Latency */}
                      {selectedModel.contextLatency.minLatency !== undefined && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-400">Fastest Response</span>
                          <span className={`font-medium ${
                            selectedModel.contextLatency.minLatency < 500 ? 'text-green-400' :
                            selectedModel.contextLatency.minLatency < 2000 ? 'text-blue-400' :
                            selectedModel.contextLatency.minLatency < 5000 ? 'text-yellow-400' :
                            'text-orange-400'
                          }`}>
                            {selectedModel.contextLatency.minLatency < 1000 
                              ? `${selectedModel.contextLatency.minLatency}ms`
                              : `${(selectedModel.contextLatency.minLatency / 1000).toFixed(1)}s`
                            }
                          </span>
                        </div>
                      )}
                      
                      <div className="flex items-center justify-between text-sm mt-1">
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
                      
                      {/* Latency by Context Size */}
                      <div className="mt-2">
                        <span className="text-xs text-gray-500">Latency by context size:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {Object.entries(selectedModel.contextLatency.latencies).map(([size, latency]) => (
                            <span 
                              key={size} 
                              className={`px-2 py-0.5 text-xs rounded ${
                                latency < 500 ? 'bg-green-500/20 text-green-400' :
                                latency < 2000 ? 'bg-blue-500/20 text-blue-400' :
                                latency < 5000 ? 'bg-yellow-500/20 text-yellow-400' :
                                latency < 10000 ? 'bg-orange-500/20 text-orange-400' :
                                'bg-red-500/20 text-red-400'
                              }`}
                            >
                              {(parseInt(size) / 1024).toFixed(0)}K: {latency < 1000 ? `${latency}ms` : `${(latency / 1000).toFixed(1)}s`}
                            </span>
                          ))}
                          {/* Show if test was stopped early due to timeout */}
                          {selectedModel.contextLatency.modelMaxContext && 
                           selectedModel.contextLatency.maxUsableContext < selectedModel.contextLatency.modelMaxContext && (
                            <span className="px-2 py-0.5 text-xs rounded bg-red-500/20 text-red-400" title="Test stopped - exceeded 30s timeout">
                              ⚠️ {(selectedModel.contextLatency.maxUsableContext / 1024).toFixed(0)}K+ timeout
                            </span>
                          )}
                        </div>
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

                  {/* Native Tool Calls Section */}
                  <div className="p-3 bg-[#2d2d2d] rounded-lg">
                    <h4 className="text-sm font-medium text-gray-400 mb-2">Native Tool Calls</h4>
                    {(() => {
                      // Use discoveredNativeTools if available, otherwise fall back to collecting from nativeAliases
                      const discoveredTools = selectedModel.discoveredNativeTools || [];
                      const unmappedTools = selectedModel.unmappedNativeTools || [];
                      
                      // Build mapping of native tool -> MCP tool
                      const mappedTools: Record<string, string> = {};
                      Object.entries(selectedModel.capabilities).forEach(([tool, cap]) => {
                        if (cap.nativeAliases && cap.nativeAliases.length > 0) {
                          cap.nativeAliases.forEach(alias => {
                            mappedTools[alias] = tool;
                          });
                        }
                      });
                      
                      // If no discovered tools and no mapped aliases, show empty state
                      if (discoveredTools.length === 0 && Object.keys(mappedTools).length === 0) {
                        return (
                          <p className="text-xs text-gray-500 italic">
                            No native tool calls detected. Run the 🔧 Tools test to discover what tools this model claims to support.
                          </p>
                        );
                      }
                      
                      // Use discoveredTools if available, otherwise use keys from mappedTools
                      const allTools = discoveredTools.length > 0 
                        ? discoveredTools 
                        : Object.keys(mappedTools);
                      
                      // Handler to update alias mapping
                      const updateAlias = async (nativeToolName: string, newMcpTool: string | null) => {
                        try {
                          const response = await fetch(`/api/tooly/models/${encodeURIComponent(selectedModel.modelId)}/alias`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ nativeToolName, mcpTool: newMcpTool })
                          });
                          
                          if (response.ok) {
                            // Refresh the model profile
                            const profileResponse = await fetch(`/api/tooly/models/${encodeURIComponent(selectedModel.modelId)}`);
                            if (profileResponse.ok) {
                              const updatedProfile = await profileResponse.json();
                              setSelectedModel(updatedProfile);
                            }
                          }
                        } catch (error) {
                          console.error('Failed to update alias:', error);
                        }
                      };
                      
                      return (
                        <div>
                          <p className="text-[10px] text-gray-500 mb-2">
                            Tools the model claims to support ({allTools.length} discovered). Click dropdown to reassign:
                          </p>
                          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-[#4d4d4d] scrollbar-track-transparent">
                            {allTools.map((tool) => {
                              const mapsTo = mappedTools[tool];
                              const isUnmapped = unmappedTools.includes(tool) || !mapsTo;
                              
                              return (
                                <div
                                  key={tool}
                                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border ${
                                    isUnmapped 
                                      ? 'bg-orange-500/10 border-orange-500/20' 
                                      : 'bg-purple-500/10 border-purple-500/20'
                                  }`}
                                >
                                  <span className={`text-xs font-medium min-w-[120px] ${isUnmapped ? 'text-orange-300' : 'text-purple-300'}`}>
                                    {tool}
                                  </span>
                                  <span className="text-[10px] text-gray-500">→</span>
                                  <select
                                    value={mapsTo || ''}
                                    onChange={(e) => updateAlias(tool, e.target.value || null)}
                                    className="flex-1 text-xs bg-[#252525] border border-gray-700 rounded px-1.5 py-0.5 text-gray-300 focus:outline-none focus:border-purple-500"
                                  >
                                    <option value="">⚠️ Unmapped</option>
                                    {Array.isArray(mcpTools) && mcpTools.map((mcpTool) => (
                                      <option key={mcpTool} value={mcpTool}>
                                        {mcpTool}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              );
                            })}
                          </div>
                          {unmappedTools.length > 0 && (
                            <p className="text-[10px] text-orange-400/70 mt-2">
                              ⚠️ {unmappedTools.length} tool(s) have no MCP server equivalent
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Tool Categories with Toggles */}
                  <div className="p-3 bg-[#2d2d2d] rounded-lg">
                    <h4 className="text-sm font-medium text-gray-400 mb-2">Tool Configuration</h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-[#4d4d4d] scrollbar-track-transparent">
                      {Object.entries(selectedModel.capabilities).map(([tool, cap]) => (
                        <div key={tool} className="p-2 bg-[#1a1a1a] rounded-lg">
                          <div className="flex items-center justify-between">
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
                              <span className={`text-xs font-medium ${cap.supported ? 'text-white' : 'text-gray-500'}`}>
                                {tool}
                              </span>
                            </div>
                            <span className={`text-xs ${cap.score >= 70 ? 'text-green-400' : cap.score >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                              {cap.score}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => {
                        // Initialize - server will send actual totals via WebSocket
                        setTestProgress({
                          modelId: selectedModel.modelId,
                          probeProgress: { current: 0, total: 1, currentTest: 'Initializing...', score: 0, status: 'running' }
                        });
                        runProbeTests(selectedModel.modelId, selectedModel.provider, true);
                      }}
                      disabled={probingModel === selectedModel.modelId}
                      className="flex-1 py-2 px-3 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 disabled:opacity-50 text-sm"
                    >
                      {probingModel === selectedModel.modelId ? 'Probing...' : '🧪 Probes'}
                    </button>
                    <button
                      onClick={() => {
                        // Initialize - server will send actual totals via WebSocket
                        setTestProgress({
                          modelId: selectedModel.modelId,
                          toolsProgress: { current: 0, total: 1, currentTest: 'Initializing...', score: 0, status: 'running' }
                        });
                        runModelTests(selectedModel.modelId, selectedModel.provider);
                      }}
                      disabled={testingModel === selectedModel.modelId}
                      className="flex-1 py-2 px-3 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 disabled:opacity-50 text-sm"
                    >
                      {testingModel === selectedModel.modelId ? 'Testing...' : '🔧 Tools'}
                    </button>
                    <button
                      onClick={async () => {
                        // Initialize - server will send actual totals via WebSocket
                        setTestProgress({
                          modelId: selectedModel.modelId,
                          latencyProgress: { current: 0, total: 1, currentTest: 'Initializing...', status: 'running' }
                        });
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
                        setTestProgress({});
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

