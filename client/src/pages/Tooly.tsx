import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import ReconnectingWebSocket from 'reconnecting-websocket';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';
import TestEditor from '../components/TestEditor';
import type { CustomTest } from '../components/TestEditor';
import { Recommendations } from '../components/Recommendations';
import type { Recommendation } from '../components/Recommendations';
import { ModelDetailV2 } from '../components/ModelDetailV2';

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

interface ExtendedProbeResult {
  name: string;
  passed: boolean;
  score?: number;
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
  // Extended probes
  strategicRAGProbes?: ExtendedProbeResult[];
  architecturalProbes?: ExtendedProbeResult[];
  navigationProbes?: ExtendedProbeResult[];
  helicopterProbes?: ExtendedProbeResult[];
  proactiveProbes?: ExtendedProbeResult[];
  intentProbes?: ExtendedProbeResult[];
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

interface ModelInfo {
  name?: string;
  author?: string;
  description?: string;
  parameters?: string;
  architecture?: string;
  contextLength?: number;
  license?: string;
  quantization?: string;
  capabilities?: string[];
  tags?: string[];
  source?: string;
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
  scoreBreakdown?: {
    ragScore?: number;
    bugDetectionScore?: number;
    architecturalScore?: number;
    navigationScore?: number;
    proactiveScore?: number;
    toolScore?: number;
    reasoningScore?: number;
    intentScore?: number;
    overallScore?: number;
  };
  badges?: Array<{ id: string; name: string; icon: string }>;
  modelInfo?: ModelInfo;
  recommendations?: Recommendation[];
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

// Tool categories - mirrors server/src/modules/tooly/capabilities.ts
const TOOL_CATEGORIES: Record<string, string[]> = {
  'RAG - Semantic Search': ['rag_query', 'rag_status', 'rag_index'],
  'File Operations': ['read_file', 'read_multiple_files', 'write_file', 'edit_file', 'delete_file', 'copy_file', 'move_file', 'get_file_info', 'list_directory', 'search_files', 'create_directory', 'delete_directory', 'list_allowed_directories'],
  'Git Operations': ['git_status', 'git_diff', 'git_log', 'git_init', 'git_add', 'git_commit', 'git_push', 'git_pull', 'git_checkout', 'git_stash', 'git_stash_pop', 'git_reset', 'git_clone', 'git_branch_create', 'git_branch_list', 'git_blame', 'git_show'],
  'NPM Operations': ['npm_run', 'npm_install', 'npm_uninstall', 'npm_init', 'npm_test', 'npm_build', 'npm_list'],
  'Browser': ['browser_navigate', 'browser_go_back', 'browser_go_forward', 'browser_click', 'browser_type', 'browser_hover', 'browser_select_option', 'browser_press_key', 'browser_snapshot', 'browser_fetch_content', 'browser_take_screenshot', 'browser_wait', 'browser_resize', 'browser_handle_dialog', 'browser_drag', 'browser_tabs', 'browser_evaluate', 'browser_console_messages', 'browser_network_requests'],
  'HTTP/Search': ['http_request', 'url_fetch_content', 'web_search'],
  'Code Execution': ['shell_exec', 'run_python', 'run_node', 'run_typescript'],
  'Memory': ['memory_store', 'memory_retrieve', 'memory_list', 'memory_delete'],
  'Text': ['text_summarize', 'diff_files'],
  'Process': ['process_list', 'process_kill'],
  'Archive': ['zip_create', 'zip_extract'],
  'Utility': ['mcp_rules', 'env_get', 'env_set', 'json_parse', 'base64_encode', 'base64_decode']
};

// Helper to extract category from test name (e.g., "1.1 Emit Test" -> "Tool Probes", "3.x RAG" -> "RAG Probes")
const extractCategoryFromTest = (testName: string, testType?: 'probe' | 'tools' | 'latency'): string => {
  if (!testName) return 'Running Tests';
  const lower = testName.toLowerCase();
  
  // Check for tool capability tests (tools test type or known tool names)
  if (testType === 'tools') {
    // Find which category this tool belongs to
    for (const [catName, tools] of Object.entries(TOOL_CATEGORIES)) {
      if (tools.some(tool => lower.includes(tool.replace(/_/g, ' ')) || lower === tool)) {
        return `🔧 ${catName}`;
      }
    }
    return '🔧 Tool Tests';
  }
  
  // Probe tests
  if (lower.includes('emit') || lower.includes('schema') || lower.includes('selection') || lower.includes('suppression') || lower.includes('1.')) return 'Tool Behavior (1.x)';
  if (lower.includes('reasoning') || lower.includes('intent extraction') || lower.includes('planning') || lower.includes('2.')) return 'Reasoning (2.x)';
  if (lower.includes('rag') || lower.includes('3.')) return '🔍 Strategic RAG';
  if (lower.includes('architecture') || lower.includes('4.')) return '🏗️ Architecture';
  if (lower.includes('navigation') || lower.includes('5.')) return '🧭 Navigation';
  if (lower.includes('helicopter') || lower.includes('6.')) return '🐛 Bug Detection';
  if (lower.includes('proactive') || lower.includes('7.')) return '💡 Proactive';
  if (lower.includes('intent') || lower.includes('8.')) return '🎯 Intent';
  if (lower.includes('tool')) return 'Tool Tests';
  if (lower.includes('latency') || lower.includes('context')) return 'Latency Profile';
  return 'Running Tests';
};

// ============================================================
// TOOLY PAGE
// ============================================================

const Tooly: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>('models');
  const [models, setModels] = useState<DiscoveredModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<ModelProfile | null>(null);
  const selectedModelRef = useRef<string | null>(null);
  const [tests, setTests] = useState<TestDefinition[]>([]);
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  
  // Tests tab state
  const [customTests, setCustomTests] = useState<any[]>([]);
  const [builtInTests, setBuiltInTests] = useState<any[]>([]);
  const [testEditorOpen, setTestEditorOpen] = useState(false);
  const [editingTest, setEditingTest] = useState<CustomTest | null>(null);
  const [selectedTest, setSelectedTest] = useState<any | null>(null);
  const [testCategoryFilter, setTestCategoryFilter] = useState('all');
  const [testSearchFilter, setTestSearchFilter] = useState('');
  const [tryingTest, setTryingTest] = useState(false);
  const [testResult, setTestResult] = useState<any | null>(null);
  
  // Collapsible section states for model detail pane
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    scores: true,
    breakdown: true,
    badges: true,
    info: false,
    recommendations: true,
    probes: false,
    latency: false,
    tools: false,
  });
  
  // V1/V2 version toggle for right pane
  const [detailPaneVersion, setDetailPaneVersion] = useState<'v1' | 'v2'>(() => {
    const saved = localStorage.getItem('tooly_detailPaneVersion');
    return (saved as 'v1' | 'v2') || 'v2';
  });
  
  // Persist version preference
  useEffect(() => {
    localStorage.setItem('tooly_detailPaneVersion', detailPaneVersion);
  }, [detailPaneVersion]);
  
  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };
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
    startTime?: number;
  }>({});
  
  // Helper to calculate ETA
  const calculateETA = () => {
    if (!testProgress.startTime) return null;
    const elapsed = Date.now() - testProgress.startTime;
    const probeP = testProgress.probeProgress;
    const toolsP = testProgress.toolsProgress;
    const latencyP = testProgress.latencyProgress;
    
    const current = (probeP?.current ?? 0) + (toolsP?.current ?? 0) + (latencyP?.current ?? 0);
    const total = (probeP?.total ?? 0) + (toolsP?.total ?? 0) + (latencyP?.total ?? 0);
    
    if (current === 0 || total === 0) return null;
    
    const avgTimePerTest = elapsed / current;
    const remaining = (total - current) * avgTimePerTest;
    
    if (remaining < 1000) return '< 1s';
    if (remaining < 60000) return `~${Math.ceil(remaining / 1000)}s`;
    const mins = Math.floor(remaining / 60000);
    const secs = Math.ceil((remaining % 60000) / 1000);
    return `~${mins}m ${secs}s`;
  };

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

  // Test intents state
  const [testingIntents, setTestingIntents] = useState(false);
  const [intentProgress, setIntentProgress] = useState<{
    current: number;
    total: number;
    currentModelName: string;
  } | null>(null);
  const cancelIntentTestRef = useRef(false);

  // Keep ref in sync with selectedModel and persist to localStorage
  useEffect(() => {
    selectedModelRef.current = selectedModel?.modelId || null;
    if (selectedModel?.modelId) {
      localStorage.setItem('tooly_selectedModelId', selectedModel.modelId);
    }
  }, [selectedModel?.modelId]);
  
  // Restore selected model from localStorage on mount
  useEffect(() => {
    const savedModelId = localStorage.getItem('tooly_selectedModelId');
    if (savedModelId && !selectedModel && models.length > 0) {
      // Check if the saved model exists in the current models list
      const modelExists = models.some(m => m.id === savedModelId);
      if (modelExists) {
        fetchModelProfile(savedModelId);
      }
    }
  }, [models]); // Trigger when models are loaded

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
    fetchCustomTests();
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
      // Use /detail endpoint to get scoreBreakdown, badges, etc.
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" style={{ height: 'calc(100vh - 440px)', minHeight: '450px' }}>
            {/* Model List - scrollable */}
            <div className="flex flex-col h-full overflow-hidden">
              <div className="flex flex-col gap-3 mb-4">
                {/* Header row */}
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-white">Available Models</h3>
                  {/* Filters */}
                  <div className="flex items-center gap-3">
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
                      <span className="text-xs text-gray-500">Mode:</span>
                      <select
                        value={testMode}
                        onChange={(e) => setTestMode(e.target.value as any)}
                        className="bg-[#2d2d2d] border border-[#3d3d3d] rounded px-2 py-1 text-xs text-gray-300 focus:border-purple-500 focus:outline-none"
                        title="Controls model loading/unloading during tests"
                      >
                        <option value="quick">Quick</option>
                        <option value="keep_on_success">Keep</option>
                        <option value="manual">Manual</option>
                      </select>
                    </div>
                  </div>
                </div>
                {/* Action buttons row */}
                <div className="flex items-center gap-2">
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
                  
                  {/* Test Intents Button */}
                  <button
                    onClick={async () => {
                      if (testingIntents) {
                        cancelIntentTestRef.current = true;
                        return;
                      }
                      
                      const modelsToTest = models.filter(m => m.provider === 'lmstudio');
                      if (modelsToTest.length === 0) return;
                      
                      setTestingIntents(true);
                      cancelIntentTestRef.current = false;
                      
                      for (let i = 0; i < modelsToTest.length; i++) {
                        if (cancelIntentTestRef.current) break;
                        
                        const model = modelsToTest[i];
                        setIntentProgress({
                          current: i + 1,
                          total: modelsToTest.length,
                          currentModelName: model.displayName
                        });
                        
                        try {
                          await fetch(`/api/tooly/probe/${encodeURIComponent(model.id)}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ 
                              categories: ['8.x'], // Intent Recognition only
                              mode: 'quick' 
                            })
                          });
                        } catch (error) {
                          console.error(`Failed to test intents for ${model.id}:`, error);
                        }
                      }
                      
                      await fetchModels();
                      setTestingIntents(false);
                      setTimeout(() => setIntentProgress(null), 3000);
                    }}
                    disabled={models.filter(m => m.provider === 'lmstudio').length === 0 || testingAllModels}
                    className={`px-3 py-1 text-xs rounded transition-colors ${
                      testingIntents 
                        ? 'bg-red-600 hover:bg-red-700 text-white' 
                        : 'bg-orange-600 hover:bg-orange-700 text-white'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {testingIntents ? '⏹️ Stop' : '🎯 Test Intents'}
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
              
              {/* Intent Test Progress */}
              {intentProgress && (
                <div className="mb-4 p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-orange-400">
                      🎯 Testing Intents ({intentProgress.current}/{intentProgress.total})
                    </span>
                  </div>
                  <div className="w-full bg-[#1a1a1a] rounded-full h-2 mb-2">
                    <div 
                      className="bg-orange-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${(intentProgress.current / intentProgress.total) * 100}%` }}
                    />
                  </div>
                  {testingIntents && (
                    <p className="text-xs text-gray-500">
                      Testing: {intentProgress.currentModelName}
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
                <div className="space-y-2 flex-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-[#3d3d3d] scrollbar-track-transparent">
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
                      {/* Mini Progress Bar on Model Card */}
                      {testProgress.modelId === model.id && (testProgress.probeProgress?.status === 'running' || testProgress.toolsProgress?.status === 'running' || testProgress.latencyProgress?.status === 'running') && (
                        <div className="mt-3 pt-3 border-t border-[#2d2d2d]">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="animate-pulse text-purple-400 text-xs">●</span>
                              <span className="text-xs text-gray-400 truncate max-w-[180px]">
                                {testProgress.probeProgress?.currentTest || testProgress.toolsProgress?.currentTest || testProgress.latencyProgress?.currentTest || 'Testing...'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {calculateETA() && (
                                <span className="text-xs text-gray-500">{calculateETA()}</span>
                              )}
                              <span className="text-xs text-gray-500">
                                {((testProgress.probeProgress?.current ?? 0) + (testProgress.toolsProgress?.current ?? 0) + (testProgress.latencyProgress?.current ?? 0))}/
                                {((testProgress.probeProgress?.total ?? 0) + (testProgress.toolsProgress?.total ?? 0) + (testProgress.latencyProgress?.total ?? 0))}
                              </span>
                            </div>
                          </div>
                          <div className="w-full bg-[#1a1a1a] rounded-full h-1.5">
                            <div 
                              className="bg-purple-500 h-1.5 rounded-full transition-all duration-300"
                              style={{ 
                                width: `${(() => {
                                  const current = (testProgress.probeProgress?.current ?? 0) + (testProgress.toolsProgress?.current ?? 0) + (testProgress.latencyProgress?.current ?? 0);
                                  const total = (testProgress.probeProgress?.total ?? 0) + (testProgress.toolsProgress?.total ?? 0) + (testProgress.latencyProgress?.total ?? 0);
                                  return total > 0 ? (current / total) * 100 : 0;
                                })()}%` 
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Model Details - scrollable within fixed height */}
            <div className={`flex flex-col h-full ${detailPaneVersion === 'v2' ? 'overflow-y-auto overflow-x-hidden' : 'overflow-y-auto overflow-x-hidden'} scrollbar-thin scrollbar-thumb-[#3d3d3d] scrollbar-track-transparent`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-white">
                    {selectedModel ? selectedModel.displayName : 'Select a Model'}
                  </h3>
                  {selectedModel && getRoleBadge(selectedModel.role)}
                  {selectedModel && (
                    <button
                      onClick={() => navigate(`/tooly/model/${encodeURIComponent(selectedModel.modelId)}`)}
                      className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
                      title="View full model profile"
                    >
                      Full Profile →
                    </button>
                  )}
                </div>
                {selectedModel && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setAsMainModel(selectedModel.modelId)}
                      disabled={savingDualModel}
                      className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                        mainModelId === selectedModel.modelId
                          ? 'bg-purple-600 text-white'
                          : 'bg-[#2d2d2d] text-gray-300 hover:bg-purple-600/50 hover:text-white'
                      }`}
                    >
                      {mainModelId === selectedModel.modelId ? '✓ Main' : 'Use as Main'}
                    </button>
                    <button
                      onClick={() => setAsExecutorModel(selectedModel.modelId)}
                      disabled={savingDualModel}
                      className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                        executorModelId === selectedModel.modelId
                          ? 'bg-blue-600 text-white'
                          : 'bg-[#2d2d2d] text-gray-300 hover:bg-blue-600/50 hover:text-white'
                      }`}
                    >
                      {executorModelId === selectedModel.modelId ? '✓ Executor' : 'Use as Executor'}
                    </button>
                  </div>
                )}
              </div>
              
              {/* V1/V2 Version Toggle */}
              {selectedModel && (
                <div className="flex items-center gap-1 mb-3 p-1 bg-[#1a1a1a] rounded-lg w-fit">
                  <button
                    onClick={() => setDetailPaneVersion('v1')}
                    className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                      detailPaneVersion === 'v1'
                        ? 'bg-[#2d2d2d] text-white'
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    Classic v1
                  </button>
                  <button
                    onClick={() => setDetailPaneVersion('v2')}
                    className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                      detailPaneVersion === 'v2'
                        ? 'bg-teal-600 text-white'
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    Visual v2
                  </button>
                </div>
              )}
              
              {selectedModel && detailPaneVersion === 'v2' ? (
                <div className="flex-1 overflow-hidden">
                  <ModelDetailV2
                    profile={{
                      modelId: selectedModel.modelId,
                      displayName: selectedModel.displayName,
                      provider: selectedModel.provider,
                      role: selectedModel.role || 'none',
                      score: selectedModel.score,
                      scoreBreakdown: selectedModel.scoreBreakdown,
                      contextLatency: selectedModel.contextLatency ? {
                        latencies: selectedModel.contextLatency.latencies as unknown as Record<string, number>,
                        speedRating: (selectedModel.contextLatency.speedRating === 'very_slow' ? 'slow' : selectedModel.contextLatency.speedRating) as 'excellent' | 'good' | 'acceptable' | 'slow' | undefined,
                        maxUsableContext: selectedModel.contextLatency.maxUsableContext,
                        isInteractiveSpeed: selectedModel.contextLatency.isInteractiveSpeed,
                        recommendedContext: selectedModel.contextLatency.recommendedContext,
                      } : undefined,
                      badges: selectedModel.badges,
                      recommendations: selectedModel.recommendations?.map(r => {
                        // Map status to suitability
                        const statusToSuitability: Record<string, 'excellent' | 'good' | 'fair' | 'poor'> = {
                          'excellent': 'excellent',
                          'good': 'good',
                          'caution': 'fair',
                          'not_suitable': 'poor',
                        };
                        return {
                          task: r.task,
                          suitability: statusToSuitability[r.status] || 'good',
                        };
                      }),
                      modelInfo: selectedModel.modelInfo,
                      toolCategories: (() => {
                        // Build toolCategories from model capabilities
                        const result: Record<string, { tools: Array<{ name: string; score: number; testsPassed: number; enabled: boolean }> }> = {};
                        for (const [catName, tools] of Object.entries(TOOL_CATEGORIES)) {
                          const toolsWithData = tools.map(toolName => ({
                            name: toolName,
                            score: selectedModel.capabilities?.[toolName]?.score || 0,
                            testsPassed: selectedModel.capabilities?.[toolName]?.testsPassed || 0,
                            enabled: selectedModel.enabledTools?.includes(toolName) || false,
                          }));
                          // Only include categories that have at least one tested tool
                          if (toolsWithData.some(t => t.score > 0)) {
                            result[catName] = { tools: toolsWithData };
                          }
                        }
                        return Object.keys(result).length > 0 ? result : undefined;
                      })(),
                      probeResults: selectedModel.probeResults ? {
                        coreProbes: [
                          { name: 'Emit Test', passed: selectedModel.probeResults.emitTest?.passed || false },
                          { name: 'Schema Test', passed: selectedModel.probeResults.schemaTest?.passed || false },
                          { name: 'Selection Test', passed: selectedModel.probeResults.selectionTest?.passed || false },
                          { name: 'Suppression Test', passed: selectedModel.probeResults.suppressionTest?.passed || false },
                        ],
                        strategicRAGProbes: selectedModel.probeResults.strategicRAGProbes,
                        architecturalProbes: selectedModel.probeResults.architecturalProbes,
                        navigationProbes: selectedModel.probeResults.navigationProbes,
                        helicopterProbes: selectedModel.probeResults.helicopterProbes,
                        proactiveProbes: selectedModel.probeResults.proactiveProbes,
                        intentProbes: selectedModel.probeResults.intentProbes,
                      } : undefined,
                    }}
                    testProgress={(() => {
                      // Calculate live test progress for this model
                      const isThisModel = testProgress.modelId === selectedModel.modelId;
                      const probeP = isThisModel ? testProgress.probeProgress : undefined;
                      const toolsP = isThisModel ? testProgress.toolsProgress : undefined;
                      const latencyP = isThisModel ? testProgress.latencyProgress : undefined;
                      
                      if (!probeP && !toolsP && !latencyP) return undefined;
                      
                      const isRunning = probeP?.status === 'running' || toolsP?.status === 'running' || latencyP?.status === 'running';
                      const current = (probeP?.current ?? 0) + (toolsP?.current ?? 0) + (latencyP?.current ?? 0);
                      const total = (probeP?.total ?? 0) + (toolsP?.total ?? 0) + (latencyP?.total ?? 0);
                      const percent = total > 0 ? Math.round((current / total) * 100) : 0;
                      const currentTest = probeP?.currentTest || toolsP?.currentTest || latencyP?.currentTest || '';
                      // Determine test type for category extraction
                      const testType: 'probe' | 'tools' | 'latency' | undefined = 
                        toolsP?.status === 'running' ? 'tools' :
                        probeP?.status === 'running' ? 'probe' :
                        latencyP?.status === 'running' ? 'latency' : undefined;
                      // Extract detailed category from the current test name
                      const currentCategory = extractCategoryFromTest(currentTest, testType);
                      // Calculate ETA
                      const eta = calculateETA();
                      
                      return {
                        isRunning,
                        current,
                        total,
                        currentCategory,
                        currentTest,
                        percent,
                        eta: eta || undefined,
                        testType, // Pass test type for tab switching
                      };
                    })()}
                    modelLoading={{
                      isLoading: modelLoading.modelId === selectedModel.modelId && (modelLoading.status === 'loading' || modelLoading.status === 'unloading'),
                      status: modelLoading.status as 'loading' | 'unloading' | undefined,
                      message: modelLoading.message,
                    }}
                    isRunningTests={probingModel === selectedModel.modelId || testingModel === selectedModel.modelId}
                    onRunTests={async () => {
                      // Clear previous scores first to show real-time updates
                      if (selectedModel) {
                        setSelectedModel({
                          ...selectedModel,
                          scoreBreakdown: {
                            ...selectedModel.scoreBreakdown,
                            ragScore: 0,
                            architecturalScore: 0,
                            navigationScore: 0,
                            bugDetectionScore: 0,
                            intentScore: 0,
                            reasoningScore: 0,
                            proactiveScore: 0,
                          },
                          probeResults: selectedModel.probeResults ? {
                            ...selectedModel.probeResults,
                            strategicRAGProbes: [],
                            architecturalProbes: [],
                            navigationProbes: [],
                            helicopterProbes: [],
                            proactiveProbes: [],
                            intentProbes: [],
                          } : undefined,
                        });
                      }
                      
                      // Run all tests
                      await runProbeTests(selectedModel.modelId, selectedModel.provider);
                      await runModelTests(selectedModel.modelId, selectedModel.provider);
                    }}
                    onSetAsMain={() => setAsMainModel(selectedModel.modelId)}
                    onSetAsExecutor={() => setAsExecutorModel(selectedModel.modelId)}
                  />
                </div>
              ) : selectedModel ? (
                <div className="space-y-3">
                  {/* === PRIMARY SCORES - Always visible === */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-4 bg-gradient-to-br from-purple-900/40 to-purple-800/20 border border-purple-500/30 rounded-xl text-center">
                      <span className="text-purple-300 text-xs font-medium">Tool Score</span>
                      <p className="text-3xl font-bold text-white mt-1">
                        {testProgress.modelId === selectedModel.modelId && testProgress.toolsProgress?.status === 'running'
                          ? testProgress.toolsProgress.score
                          : selectedModel.score ?? 0}
                      </p>
                    </div>
                    <div className="p-4 bg-gradient-to-br from-blue-900/40 to-blue-800/20 border border-blue-500/30 rounded-xl text-center">
                      <span className="text-blue-300 text-xs font-medium">Probe Score</span>
                      <p className="text-3xl font-bold text-white mt-1">
                        {testProgress.modelId === selectedModel.modelId && testProgress.probeProgress?.status === 'running'
                          ? testProgress.probeProgress.score
                          : selectedModel.probeResults?.toolScore ?? 0}
                      </p>
                    </div>
                    <div className="p-4 bg-gradient-to-br from-emerald-900/40 to-emerald-800/20 border border-emerald-500/30 rounded-xl text-center">
                      <span className="text-emerald-300 text-xs font-medium">Reasoning</span>
                      <p className="text-3xl font-bold text-white mt-1">
                        {selectedModel.probeResults?.reasoningScore ?? 0}
                      </p>
                    </div>
                  </div>

                  {/* === BADGES - Inline with labels === */}
                  {selectedModel.badges && selectedModel.badges.length > 0 && (
                    <div className="flex flex-wrap gap-2 py-2">
                      {selectedModel.badges.map(badge => (
                        <span 
                          key={badge.id}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#2d2d2d] hover:bg-[#3d3d3d] rounded-full text-xs text-gray-200 transition-colors"
                        >
                          <span>{badge.icon}</span>
                          <span>{badge.name}</span>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* === COLLAPSIBLE: Skill Breakdown === */}
                  {selectedModel.scoreBreakdown && (
                    <div className="border border-[#3d3d3d] rounded-lg overflow-hidden">
                      <button 
                        onClick={() => toggleSection('breakdown')}
                        className="w-full flex items-center justify-between p-3 bg-[#252525] hover:bg-[#2d2d2d] transition-colors"
                      >
                        <span className="text-sm font-medium text-gray-300">Skill Breakdown</span>
                        <span className="text-gray-500">{expandedSections.breakdown ? '−' : '+'}</span>
                      </button>
                      {expandedSections.breakdown && (
                        <div className="p-3 bg-[#1a1a1a] grid grid-cols-2 gap-2">
                          {[
                            { label: 'RAG Search', icon: '🔍', score: selectedModel.scoreBreakdown.ragScore },
                            { label: 'Architecture', icon: '🏗️', score: selectedModel.scoreBreakdown.architecturalScore },
                            { label: 'Navigation', icon: '🧭', score: selectedModel.scoreBreakdown.navigationScore },
                            { label: 'Proactive', icon: '💡', score: selectedModel.scoreBreakdown.proactiveScore },
                            { label: 'Intent', icon: '🎯', score: selectedModel.scoreBreakdown.intentScore },
                            { label: 'Bug Detection', icon: '🐛', score: selectedModel.scoreBreakdown.bugDetectionScore },
                            { label: 'Reasoning', icon: '🧠', score: selectedModel.scoreBreakdown.reasoningScore },
                            { label: 'Overall', icon: '⭐', score: selectedModel.scoreBreakdown.overallScore ?? selectedModel.score },
                          ].map(({ label, icon, score }) => (
                            <div key={label} className="flex items-center justify-between p-2 bg-[#252525] rounded">
                              <span className="text-xs text-gray-400">{icon} {label}</span>
                              <span className={`text-sm font-semibold ${
                                (score ?? 0) >= 80 ? 'text-green-400' : 
                                (score ?? 0) >= 50 ? 'text-yellow-400' : 
                                (score ?? 0) > 0 ? 'text-red-400' : 'text-gray-500'
                              }`}>
                                {score ?? '—'}%
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* === COLLAPSIBLE: Model Info === */}
                  {selectedModel.modelInfo && (
                    <div className="border border-[#3d3d3d] rounded-lg overflow-hidden">
                      <button 
                        onClick={() => toggleSection('info')}
                        className="w-full flex items-center justify-between p-3 bg-[#252525] hover:bg-[#2d2d2d] transition-colors"
                      >
                        <span className="text-sm font-medium text-gray-300">Model Information</span>
                        <span className="text-gray-500">{expandedSections.info ? '−' : '+'}</span>
                      </button>
                      {expandedSections.info && (
                        <div className="p-3 bg-[#1a1a1a] space-y-2">
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            {selectedModel.modelInfo.author && (
                              <div className="flex items-center gap-2">
                                <span className="text-gray-500">Author</span>
                                <span className="text-gray-200">{selectedModel.modelInfo.author}</span>
                              </div>
                            )}
                            {selectedModel.modelInfo.parameters && (
                              <div className="flex items-center gap-2">
                                <span className="text-gray-500">Size</span>
                                <span className="text-gray-200">{selectedModel.modelInfo.parameters}</span>
                              </div>
                            )}
                            {selectedModel.modelInfo.architecture && (
                              <div className="flex items-center gap-2">
                                <span className="text-gray-500">Architecture</span>
                                <span className="text-gray-200">{selectedModel.modelInfo.architecture}</span>
                              </div>
                            )}
                            {selectedModel.modelInfo.license && (
                              <div className="flex items-center gap-2">
                                <span className="text-gray-500">License</span>
                                <span className="text-gray-200">{selectedModel.modelInfo.license}</span>
                              </div>
                            )}
                          </div>
                          {selectedModel.modelInfo.description && (
                            <p className="text-gray-400 text-xs mt-2">
                              {selectedModel.modelInfo.description}
                            </p>
                          )}
                          {selectedModel.modelInfo.capabilities && selectedModel.modelInfo.capabilities.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {selectedModel.modelInfo.capabilities.slice(0, 8).map((cap, i) => (
                                <span key={i} className="px-2 py-0.5 bg-[#2d2d2d] rounded text-[10px] text-gray-400">
                                  {cap}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* === COLLAPSIBLE: Recommendations === */}
                  {selectedModel.recommendations && selectedModel.recommendations.length > 0 && (
                    <div className="border border-[#3d3d3d] rounded-lg overflow-hidden">
                      <button 
                        onClick={() => toggleSection('recommendations')}
                        className="w-full flex items-center justify-between p-3 bg-[#252525] hover:bg-[#2d2d2d] transition-colors"
                      >
                        <span className="text-sm font-medium text-gray-300">Best For</span>
                        <span className="text-gray-500">{expandedSections.recommendations ? '−' : '+'}</span>
                      </button>
                      {expandedSections.recommendations && (
                        <div className="p-3 bg-[#1a1a1a]">
                          <Recommendations 
                            recommendations={selectedModel.recommendations.slice(0, 4)} 
                            onAlternativeClick={(id) => navigate(`/tooly/model/${encodeURIComponent(id)}`)}
                          />
                        </div>
                      )}
                    </div>
                  )}

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
                        probeProgress: { current: 0, total: 1, currentTest: 'Initializing...', score: 0, status: 'running' },
                        startTime: Date.now(),
                      }));
                      await runProbeTests(selectedModel.modelId, selectedModel.provider, false);
                      
                      // 3. Run tool capability tests
                      setTestProgress(prev => ({
                        ...prev,
                        probeProgress: undefined,
                        toolsProgress: { current: 0, total: 1, currentTest: 'Initializing...', score: 0, status: 'running' },
                        startTime: prev.startTime || Date.now(),
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

                  {/* === COLLAPSIBLE: Probe Results === */}
                  {selectedModel.probeResults && (
                    <div className="border border-[#3d3d3d] rounded-lg overflow-hidden">
                      <button 
                        onClick={() => toggleSection('probes')}
                        className="w-full flex items-center justify-between p-3 bg-[#252525] hover:bg-[#2d2d2d] transition-colors"
                      >
                        <span className="text-sm font-medium text-gray-300">Probe Test Results</span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-500">
                            Tool: <span className="text-white">{selectedModel.probeResults?.toolScore ?? '-'}%</span>
                            {' / '}
                            Rsn: <span className="text-white">{selectedModel.probeResults?.reasoningScore ?? '-'}%</span>
                          </span>
                          <span className="text-gray-500">{expandedSections.probes ? '−' : '+'}</span>
                        </div>
                      </button>
                      {expandedSections.probes && (
                        <div className="p-3 bg-[#1a1a1a] space-y-3">
                      
                      {/* Core Tool Behavior Probes */}
                      <div>
                        <p className="text-xs text-gray-500 mb-2">Tool Behavior - Core</p>
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
                      <div>
                        <p className="text-xs text-gray-500 mb-2">Tool Behavior - Enhanced</p>
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
                          <p className="text-xs text-gray-500 mb-2">Reasoning</p>
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
                    </div>
                  )}

                  {/* === COLLAPSIBLE: Context Latency === */}
                  {selectedModel.contextLatency && (
                    <div className="border border-[#3d3d3d] rounded-lg overflow-hidden">
                      <button 
                        onClick={() => toggleSection('latency')}
                        className="w-full flex items-center justify-between p-3 bg-[#252525] hover:bg-[#2d2d2d] transition-colors"
                      >
                        <span className="text-sm font-medium text-gray-300">Context Latency</span>
                        <div className="flex items-center gap-3">
                          {selectedModel.contextLatency.speedRating && (
                            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                              selectedModel.contextLatency.speedRating === 'excellent' ? 'bg-green-500/20 text-green-400' :
                              selectedModel.contextLatency.speedRating === 'good' ? 'bg-blue-500/20 text-blue-400' :
                              selectedModel.contextLatency.speedRating === 'acceptable' ? 'bg-yellow-500/20 text-yellow-400' :
                              selectedModel.contextLatency.speedRating === 'slow' ? 'bg-orange-500/20 text-orange-400' :
                              'bg-red-500/20 text-red-400'
                            }`}>
                              {selectedModel.contextLatency.speedRating === 'excellent' ? '🚀' :
                               selectedModel.contextLatency.speedRating === 'good' ? '✅' :
                               selectedModel.contextLatency.speedRating === 'acceptable' ? '⚡' :
                               selectedModel.contextLatency.speedRating === 'slow' ? '🐢' : '⚠️'}
                            </span>
                          )}
                          <span className="text-gray-500">{expandedSections.latency ? '−' : '+'}</span>
                        </div>
                      </button>
                      {expandedSections.latency && (
                        <div className="p-3 bg-[#1a1a1a] space-y-2">
                      
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
                    </div>
                  )}

                  {/* === COLLAPSIBLE: Advanced Settings === */}
                  <div className="border border-[#3d3d3d] rounded-lg overflow-hidden">
                    <button 
                      onClick={() => toggleSection('tools')}
                      className="w-full flex items-center justify-between p-3 bg-[#252525] hover:bg-[#2d2d2d] transition-colors"
                    >
                      <span className="text-sm font-medium text-gray-300">Advanced Settings</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-500">
                          {selectedModel.enabledTools?.length || 0} tools
                        </span>
                        <span className="text-gray-500">{expandedSections.tools ? '−' : '+'}</span>
                      </div>
                    </button>
                    {expandedSections.tools && (
                      <div className="p-3 bg-[#1a1a1a] space-y-4">

                  {/* Context Length */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-gray-400">Context Length</span>
                      {selectedModel.contextLength && (
                        <button
                          onClick={() => removeContextLength(selectedModel.modelId)}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                    <select
                      value={editingContextLength ?? selectedModel.contextLength ?? defaultContextLength}
                      onChange={(e) => {
                        const newValue = parseInt(e.target.value);
                        setEditingContextLength(newValue);
                        updateContextLength(selectedModel.modelId, newValue);
                      }}
                      className="w-full bg-[#252525] border border-[#3d3d3d] rounded px-2 py-1.5 text-white text-sm focus:border-purple-500 focus:outline-none"
                    >
                      {(() => {
                        const maxCtx = selectedModel.maxContextLength || 1048576;
                        const allSizes = [
                          { value: 2048, label: '2K' },
                          { value: 4096, label: '4K' },
                          { value: 8192, label: '8K' },
                          { value: 16384, label: '16K' },
                          { value: 32768, label: '32K' },
                          { value: 65536, label: '64K' },
                          { value: 131072, label: '128K' },
                          { value: 1048576, label: '1M' },
                        ];
                        return allSizes
                          .filter(size => size.value <= maxCtx)
                          .map(size => (
                            <option key={size.value} value={size.value}>{size.label}</option>
                          ));
                      })()}
                    </select>
                  </div>

                  {/* Native Tool Calls Section */}
                  <div>
                    <p className="text-xs text-gray-400 mb-2">Native Tool Mappings</p>
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
                              ⚠️ {unmappedTools.length} unmapped
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Tool List */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-gray-400">
                        Tool Capabilities ({selectedModel.enabledTools?.length || 0}/{Object.keys(selectedModel.capabilities).length})
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={async () => {
                            // Enable all tools with score >= 70
                            const toEnable = Object.entries(selectedModel.capabilities)
                              .filter(([_, cap]) => cap.score >= 70)
                              .map(([tool]) => tool);
                            for (const tool of toEnable) {
                              if (!selectedModel.enabledTools?.includes(tool)) {
                                await fetch(`/api/tooly/models/${encodeURIComponent(selectedModel.modelId)}/tools/${tool}`, {
                                  method: 'PUT',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ enabled: true })
                                });
                              }
                            }
                            await fetchModelProfile(selectedModel.modelId);
                          }}
                          className="px-2 py-1 text-xs bg-green-500/20 text-green-400 rounded hover:bg-green-500/30 transition-colors"
                          title="Enable all tools with score >= 70%"
                        >
                          Enable Passing
                        </button>
                        <button
                          onClick={() => {
                            setTestProgress({
                              modelId: selectedModel.modelId,
                              toolsProgress: { current: 0, total: 1, currentTest: 'Initializing...', score: 0, status: 'running' },
                              startTime: Date.now(),
                            });
                            runModelTests(selectedModel.modelId, selectedModel.provider);
                          }}
                          disabled={testingModel === selectedModel.modelId}
                          className="px-2 py-1 text-xs bg-purple-500/20 text-purple-400 rounded hover:bg-purple-500/30 transition-colors disabled:opacity-50"
                        >
                          {testingModel === selectedModel.modelId ? 'Testing...' : 'Run Tests'}
                        </button>
                      </div>
                    </div>
                    
                    {/* Tool list */}
                    <div className="space-y-1 max-h-56 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-[#4d4d4d] scrollbar-track-transparent">
                      {Object.entries(selectedModel.capabilities)
                        .sort(([, a], [, b]) => (b.score || 0) - (a.score || 0))
                        .map(([tool, cap]) => {
                          const isEnabled = selectedModel.enabledTools?.includes(tool) || false;
                          const score = cap.score || 0;
                          const status = cap.testsPassed > 0 ? 'passed' : cap.testsFailed > 0 ? 'failed' : 'untested';
                          
                          return (
                            <div 
                              key={tool} 
                              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors ${
                                isEnabled 
                                  ? 'bg-[#1a1a1a] border border-purple-500/30' 
                                  : 'bg-[#151515] border border-transparent'
                              }`}
                            >
                              {/* Toggle */}
                              <input
                                type="checkbox"
                                checked={isEnabled}
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
                                className="w-3.5 h-3.5 rounded border-gray-600 bg-[#0d0d0d] text-purple-500 focus:ring-purple-500 focus:ring-offset-0"
                              />
                              
                              {/* Tool name */}
                              <span className={`flex-1 text-xs font-medium ${isEnabled ? 'text-white' : 'text-gray-500'}`}>
                                {tool}
                              </span>
                              
                              {/* Score badge */}
                              <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${
                                score >= 70 ? 'bg-green-500/20 text-green-400' :
                                score >= 40 ? 'bg-yellow-500/20 text-yellow-400' :
                                score > 0 ? 'bg-red-500/20 text-red-400' :
                                'bg-gray-500/20 text-gray-500'
                              }`}>
                                {score > 0 ? `${score}%` : '--'}
                              </span>
                              
                              {/* Status indicator */}
                              <span className={`text-[10px] ${
                                status === 'passed' ? 'text-green-400' :
                                status === 'failed' ? 'text-red-400' :
                                'text-gray-500'
                              }`}>
                                {status === 'passed' ? '✓' : status === 'failed' ? '✗' : '○'}
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  </div>

                  {/* IDE Aliases (inside Advanced Settings) */}
                  <div>
                    <p className="text-xs text-gray-400 mb-2">IDE Aliases</p>
                    <div className="flex gap-2">
                      {['cursor', 'continue'].map((ide) => (
                        <button 
                          key={ide}
                          onClick={() => navigator.clipboard.writeText(`${selectedModel.modelId}-${ide}`)}
                          className="flex-1 px-2 py-1.5 bg-[#252525] border border-[#3d3d3d] rounded text-xs text-gray-300 hover:bg-[#3d3d3d] transition-colors"
                        >
                          {ide.charAt(0).toUpperCase() + ide.slice(1)}: Copy
                        </button>
                      ))}
                    </div>
                  </div>
                      </div>
                    )}
                  </div>

                  {/* Quick Actions */}
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => {
                        // Initialize - server will send actual totals via WebSocket
                        setTestProgress({
                          modelId: selectedModel.modelId,
                          probeProgress: { current: 0, total: 1, currentTest: 'Initializing...', score: 0, status: 'running' },
                          startTime: Date.now(),
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
                          toolsProgress: { current: 0, total: 1, currentTest: 'Initializing...', score: 0, status: 'running' },
                          startTime: Date.now(),
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

        {/* Tests Tab - Split Layout */}
        {activeTab === 'tests' && (
          <div className="flex gap-4 h-[calc(100vh-280px)]">
            {/* Left: Test List */}
            <div className="w-1/2 flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Tests</h3>
                <button
                  onClick={() => { setEditingTest(null); setTestEditorOpen(true); }}
                  className="px-3 py-1 text-xs bg-purple-600 hover:bg-purple-500 text-white rounded"
                >
                  + New Test
                </button>
              </div>
              
              {/* Filters */}
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={testSearchFilter}
                  onChange={e => setTestSearchFilter(e.target.value)}
                  placeholder="Search..."
                  className="flex-1 px-2 py-1 text-xs bg-[#2d2d2d] border border-[#3d3d3d] rounded text-gray-300 focus:border-purple-500 focus:outline-none"
                />
                <select
                  value={testCategoryFilter}
                  onChange={e => setTestCategoryFilter(e.target.value)}
                  className="px-2 py-1 text-xs bg-[#2d2d2d] border border-[#3d3d3d] rounded text-gray-300 focus:border-purple-500 focus:outline-none"
                >
                  <option value="all">All Categories</option>
                  <option value="custom">Custom</option>
                  <option value="3.x">Strategic RAG</option>
                  <option value="4.x">Architectural</option>
                  <option value="5.x">Navigation</option>
                  <option value="6.x">Helicopter</option>
                  <option value="7.x">Proactive</option>
                  <option value="8.x">Intent</option>
                </select>
              </div>
              
              {/* Test List */}
              <div className="flex-1 overflow-y-auto space-y-2 scrollbar-thin scrollbar-thumb-[#3d3d3d] scrollbar-track-transparent">
                {/* Custom Tests */}
                {customTests
                  .filter(t => testCategoryFilter === 'all' || t.category === testCategoryFilter)
                  .filter(t => !testSearchFilter || t.name.toLowerCase().includes(testSearchFilter.toLowerCase()) || t.prompt.toLowerCase().includes(testSearchFilter.toLowerCase()))
                  .map(test => (
                    <div
                      key={test.id}
                      onClick={() => { setSelectedTest(test); setTestResult(null); }}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedTest?.id === test.id 
                          ? 'border-purple-500 bg-purple-500/10' 
                          : 'border-[#2d2d2d] hover:border-[#3d3d3d]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-medium text-sm truncate">{test.name}</p>
                          <p className="text-gray-500 text-xs">📝 Custom • {test.category}</p>
                        </div>
                        <div className="flex items-center gap-1 ml-2">
                          <span className={`px-1.5 py-0.5 text-xs rounded ${
                            test.difficulty === 'easy' ? 'bg-green-500/20 text-green-400' :
                            test.difficulty === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-red-500/20 text-red-400'
                          }`}>
                            {test.difficulty}
                          </span>
                          <button
                            onClick={e => { e.stopPropagation(); setEditingTest(test); setTestEditorOpen(true); }}
                            className="p-1 text-gray-400 hover:text-white"
                            title="Edit"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); handleDeleteTest(test.id); }}
                            className="p-1 text-gray-400 hover:text-red-400"
                            title="Delete"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                      <p className="text-gray-400 text-xs mt-1 truncate">{test.prompt}</p>
                    </div>
                  ))}
                
                {/* Built-in Tests */}
                {builtInTests
                  .filter(t => testCategoryFilter === 'all' || t.category === testCategoryFilter)
                  .filter(t => !testSearchFilter || t.name.toLowerCase().includes(testSearchFilter.toLowerCase()) || t.prompt.toLowerCase().includes(testSearchFilter.toLowerCase()))
                  .map(test => (
                    <div
                      key={test.id}
                      onClick={() => { setSelectedTest(test); setTestResult(null); }}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedTest?.id === test.id 
                          ? 'border-blue-500 bg-blue-500/10' 
                          : 'border-[#2d2d2d] hover:border-[#3d3d3d]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-medium text-sm truncate">{test.name}</p>
                          <p className="text-gray-500 text-xs">{test.categoryIcon} {test.categoryName}</p>
                        </div>
                        <span className="px-1.5 py-0.5 text-xs bg-blue-500/20 text-blue-400 rounded">
                          built-in
                        </span>
                      </div>
                      <p className="text-gray-400 text-xs mt-1 truncate">{test.prompt}</p>
                    </div>
                  ))}
                
                {customTests.length === 0 && builtInTests.length === 0 && (
                  <p className="text-gray-500 text-center py-8">No tests found</p>
                )}
              </div>
            </div>
            
            {/* Right: Test Details / Chat */}
            <div className="w-1/2 flex flex-col border-l border-[#2d2d2d] pl-4">
              {selectedTest ? (
                <>
                  {/* Test Header */}
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-white">{selectedTest.name}</h3>
                      <p className="text-gray-500 text-sm">
                        {selectedTest.categoryIcon || '📝'} {selectedTest.categoryName || selectedTest.category}
                        {selectedTest.expectedTool && ` • Expected: ${selectedTest.expectedTool}`}
                      </p>
                    </div>
                    <button
                      onClick={() => handleTryTest(selectedTest)}
                      disabled={tryingTest || !mainModelId}
                      className={`px-4 py-2 text-sm rounded transition-colors ${
                        tryingTest 
                          ? 'bg-gray-600 text-gray-300' 
                          : 'bg-green-600 hover:bg-green-500 text-white'
                      } disabled:opacity-50`}
                    >
                      {tryingTest ? '⏳ Running...' : '▶️ Try Test'}
                    </button>
                  </div>
                  
                  {/* Test Prompt */}
                  <div className="mb-4">
                    <label className="text-xs text-gray-500 mb-1 block">Prompt</label>
                    <div className="p-3 bg-[#1a1a1a] border border-[#2d2d2d] rounded text-sm text-gray-300 font-mono">
                      {selectedTest.prompt}
                    </div>
                  </div>
                  
                  {/* Expected Behavior */}
                  {selectedTest.expectedBehavior && (
                    <div className="mb-4">
                      <label className="text-xs text-gray-500 mb-1 block">Expected Behavior</label>
                      <div className="p-3 bg-[#1a1a1a] border border-[#2d2d2d] rounded text-sm text-gray-400">
                        {selectedTest.expectedBehavior}
                      </div>
                    </div>
                  )}
                  
                  {/* Test Result */}
                  {testResult && (
                    <div className="flex-1 overflow-y-auto">
                      <label className="text-xs text-gray-500 mb-1 block">Result</label>
                      {testResult.error ? (
                        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-400">
                          {testResult.error}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {/* Tool Calls */}
                          {testResult.result?.toolCalls?.length > 0 && (
                            <div>
                              <span className="text-xs text-gray-500">Tool Calls:</span>
                              {testResult.result.toolCalls.map((tc: any, i: number) => (
                                <div key={i} className="mt-1 p-2 bg-purple-500/10 border border-purple-500/30 rounded text-xs">
                                  <span className="text-purple-400">{tc.function?.name || tc.name}</span>
                                  {tc.function?.arguments && (
                                    <pre className="mt-1 text-gray-400 overflow-x-auto">
                                      {typeof tc.function.arguments === 'string' 
                                        ? tc.function.arguments 
                                        : JSON.stringify(tc.function.arguments, null, 2)}
                                    </pre>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          
                          {/* Response Content */}
                          {testResult.result?.content && (
                            <div>
                              <span className="text-xs text-gray-500">Response:</span>
                              <div className="mt-1 p-3 bg-[#1a1a1a] border border-[#2d2d2d] rounded text-sm text-gray-300 whitespace-pre-wrap">
                                {testResult.result.content}
                              </div>
                            </div>
                          )}
                          
                          {/* Model Info */}
                          <div className="text-xs text-gray-500">
                            Model: {testResult.result?.model}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  Select a test to view details
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Test Editor Modal */}
        <TestEditor
          isOpen={testEditorOpen}
          onClose={() => { setTestEditorOpen(false); setEditingTest(null); }}
          onSave={handleSaveTest}
          editingTest={editingTest}
        />

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

