import { useState, useRef, useEffect } from 'react';
import type { CustomTest } from '../../../components/TestEditor';
import type {
  TabId,
  DiscoveredModel,
  ModelProfile,
  TestDefinition,
  ExecutionLog,
  TestProgress,
  ModelLoadingState,
  SystemMetric,
  TestAllProgress,
  IntentProgress,
  ProviderFilter,
  TestMode,
  ProxyMode,
  AvailableProviders,
  ExpandedSections,
} from '../types';

export interface ToolyState {
  // Navigation
  activeTab: TabId;
  setActiveTab: React.Dispatch<React.SetStateAction<TabId>>;

  // Models
  models: DiscoveredModel[];
  setModels: React.Dispatch<React.SetStateAction<DiscoveredModel[]>>;
  selectedModel: ModelProfile | null;
  setSelectedModel: React.Dispatch<React.SetStateAction<ModelProfile | null>>;
  selectedModelRef: React.MutableRefObject<string | null>;

  // Tests
  tests: TestDefinition[];
  setTests: React.Dispatch<React.SetStateAction<TestDefinition[]>>;
  logs: ExecutionLog[];
  setLogs: React.Dispatch<React.SetStateAction<ExecutionLog[]>>;

  // Tests tab state
  customTests: any[];
  setCustomTests: React.Dispatch<React.SetStateAction<any[]>>;
  builtInTests: any[];
  setBuiltInTests: React.Dispatch<React.SetStateAction<any[]>>;
  testEditorOpen: boolean;
  setTestEditorOpen: React.Dispatch<React.SetStateAction<boolean>>;
  editingTest: CustomTest | null;
  setEditingTest: React.Dispatch<React.SetStateAction<CustomTest | null>>;
  selectedTest: any | null;
  setSelectedTest: React.Dispatch<React.SetStateAction<any | null>>;
  testCategoryFilter: string;
  setTestCategoryFilter: React.Dispatch<React.SetStateAction<string>>;
  testSearchFilter: string;
  setTestSearchFilter: React.Dispatch<React.SetStateAction<string>>;
  tryingTest: boolean;
  setTryingTest: React.Dispatch<React.SetStateAction<boolean>>;
  testResult: any | null;
  setTestResult: React.Dispatch<React.SetStateAction<any | null>>;

  // Collapsible sections
  expandedSections: ExpandedSections;
  setExpandedSections: React.Dispatch<React.SetStateAction<ExpandedSections>>;
  toggleSection: (section: string) => void;

  // Detail pane version
  detailPaneVersion: 'v1' | 'v2';
  setDetailPaneVersion: React.Dispatch<React.SetStateAction<'v1' | 'v2'>>;

  // Loading states
  loading: boolean;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  testingModel: string | null;
  setTestingModel: React.Dispatch<React.SetStateAction<string | null>>;
  probingModel: string | null;
  setProbingModel: React.Dispatch<React.SetStateAction<string | null>>;

  // Filters
  providerFilter: ProviderFilter;
  setProviderFilter: React.Dispatch<React.SetStateAction<ProviderFilter>>;
  availableProviders: AvailableProviders;
  setAvailableProviders: React.Dispatch<React.SetStateAction<AvailableProviders>>;
  testMode: TestMode;
  setTestMode: React.Dispatch<React.SetStateAction<TestMode>>;

  // Context
  defaultContextLength: number;
  setDefaultContextLength: React.Dispatch<React.SetStateAction<number>>;
  editingContextLength: number | null;
  setEditingContextLength: React.Dispatch<React.SetStateAction<number | null>>;

  // Dual model config
  proxyMode: ProxyMode;
  setProxyMode: React.Dispatch<React.SetStateAction<ProxyMode>>;
  enableDualModel: boolean;
  setEnableDualModel: React.Dispatch<React.SetStateAction<boolean>>;
  mainModelId: string;
  setMainModelId: React.Dispatch<React.SetStateAction<string>>;
  executorModelId: string;
  setExecutorModelId: React.Dispatch<React.SetStateAction<string>>;
  savingDualModel: boolean;
  setSavingDualModel: React.Dispatch<React.SetStateAction<boolean>>;
  modelValidationError: string;
  setModelValidationError: React.Dispatch<React.SetStateAction<string>>;

  // System prompt
  editingSystemPrompt: string;
  setEditingSystemPrompt: React.Dispatch<React.SetStateAction<string>>;
  savingSystemPrompt: boolean;
  setSavingSystemPrompt: React.Dispatch<React.SetStateAction<boolean>>;
  showSystemPromptEditor: boolean;
  setShowSystemPromptEditor: React.Dispatch<React.SetStateAction<boolean>>;

  // MCP
  mcpStatus: { connected: boolean; mode: string };
  setMcpStatus: React.Dispatch<React.SetStateAction<{ connected: boolean; mode: string }>>;
  mcpTools: string[];
  setMcpTools: React.Dispatch<React.SetStateAction<string[]>>;
  mcpConnecting: boolean;
  setMcpConnecting: React.Dispatch<React.SetStateAction<boolean>>;

  // Log filters
  logStatusFilter: 'all' | 'success' | 'failed' | 'timeout';
  setLogStatusFilter: React.Dispatch<React.SetStateAction<'all' | 'success' | 'failed' | 'timeout'>>;
  logToolFilter: string;
  setLogToolFilter: React.Dispatch<React.SetStateAction<string>>;

  // Test progress
  testProgress: TestProgress;
  setTestProgress: React.Dispatch<React.SetStateAction<TestProgress>>;
  calculateETA: () => string | null;

  // Model loading
  modelLoading: ModelLoadingState;
  setModelLoading: React.Dispatch<React.SetStateAction<ModelLoadingState>>;

  // System metrics
  systemMetrics: SystemMetric[];
  setSystemMetrics: React.Dispatch<React.SetStateAction<SystemMetric[]>>;

  // Slow model prompt
  showSlowModelPrompt: boolean;
  setShowSlowModelPrompt: React.Dispatch<React.SetStateAction<boolean>>;
  slowModelLatency: number;
  setSlowModelLatency: React.Dispatch<React.SetStateAction<number>>;
  pendingTestRef: React.MutableRefObject<{ modelId: string; provider: string } | null>;

  // Test all models
  testingAllModels: boolean;
  setTestingAllModels: React.Dispatch<React.SetStateAction<boolean>>;
  testAllProgress: TestAllProgress | null;
  setTestAllProgress: React.Dispatch<React.SetStateAction<TestAllProgress | null>>;
  cancelTestAllRef: React.MutableRefObject<boolean>;

  // Test intents
  testingIntents: boolean;
  setTestingIntents: React.Dispatch<React.SetStateAction<boolean>>;
  intentProgress: IntentProgress | null;
  setIntentProgress: React.Dispatch<React.SetStateAction<IntentProgress | null>>;
  cancelIntentTestRef: React.MutableRefObject<boolean>;

  // Cognitive Loop (Phase 5)
  legacyMode: boolean;
  setLegacyMode: React.Dispatch<React.SetStateAction<boolean>>;
  cognitiveStep: 'idle' | 'search' | 'understand' | 'decide' | 'act' | 'verify' | 'persist';
  setCognitiveStep: React.Dispatch<React.SetStateAction<'idle' | 'search' | 'understand' | 'decide' | 'act' | 'verify' | 'persist'>>;
  intentCard: { strategy: 'refactor' | 'patch' | 'investigate'; risk: 'high' | 'medium' | 'low'; reasoning: string } | undefined;
  setIntentCard: React.Dispatch<React.SetStateAction<{ strategy: 'refactor' | 'patch' | 'investigate'; risk: 'high' | 'medium' | 'low'; reasoning: string } | undefined>>;
  cognitiveLogs: string[];
  setCognitiveLogs: React.Dispatch<React.SetStateAction<string[]>>;
  mentalModelSummary: { constraints: string[]; relevantFiles: number } | undefined;
  setMentalModelSummary: React.Dispatch<React.SetStateAction<{ constraints: string[]; relevantFiles: number } | undefined>>;
  sandboxActive: boolean;
  setSandboxActive: React.Dispatch<React.SetStateAction<boolean>>;
  activeMainModel: DiscoveredModel | undefined;
  activeExecutorModel: DiscoveredModel | undefined;
}

export function useToolyState(): ToolyState {
  // Navigation
  const [activeTab, setActiveTab] = useState<TabId>('models');

  // Models
  const [models, setModels] = useState<DiscoveredModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<ModelProfile | null>(null);
  const selectedModelRef = useRef<string | null>(null);

  // Tests
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

  // Collapsible sections
  const [expandedSections, setExpandedSections] = useState<ExpandedSections>({
    scores: true,
    breakdown: true,
    badges: true,
    info: false,
    recommendations: true,
    probes: false,
    latency: false,
    tools: false,
  });

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] } as ExpandedSections));
  };

  // Detail pane version
  const [detailPaneVersion, setDetailPaneVersion] = useState<'v1' | 'v2'>(() => {
    const saved = localStorage.getItem('tooly_detailPaneVersion');
    return (saved as 'v1' | 'v2') || 'v2';
  });

  // Persist version preference
  useEffect(() => {
    localStorage.setItem('tooly_detailPaneVersion', detailPaneVersion);
  }, [detailPaneVersion]);

  // Loading states
  const [loading, setLoading] = useState(true);
  const [testingModel, setTestingModel] = useState<string | null>(null);
  const [probingModel, setProbingModel] = useState<string | null>(null);

  // Filters
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>(() => {
    const saved = localStorage.getItem('tooly_providerFilter');
    return (saved as ProviderFilter) || 'all';
  });
  const [availableProviders, setAvailableProviders] = useState<AvailableProviders>({
    lmstudio: false, openai: false, azure: false
  });
  const [testMode, setTestMode] = useState<TestMode>(() => {
    const saved = localStorage.getItem('tooly_testMode');
    return (saved as TestMode) || 'keep_on_success';
  });

  // Context
  const [defaultContextLength, setDefaultContextLength] = useState<number>(8192);
  const [editingContextLength, setEditingContextLength] = useState<number | null>(null);

  // Dual model config
  const [proxyMode, setProxyMode] = useState<ProxyMode>('both');
  const [enableDualModel, setEnableDualModel] = useState(false);
  const [mainModelId, setMainModelId] = useState<string>('');
  const [executorModelId, setExecutorModelId] = useState<string>('');
  const [savingDualModel, setSavingDualModel] = useState(false);
  const [modelValidationError, setModelValidationError] = useState<string>('');

  // System prompt
  const [editingSystemPrompt, setEditingSystemPrompt] = useState<string>('');
  const [savingSystemPrompt, setSavingSystemPrompt] = useState(false);
  const [showSystemPromptEditor, setShowSystemPromptEditor] = useState(false);

  // MCP
  const [mcpStatus, setMcpStatus] = useState<{ connected: boolean; mode: string }>({ connected: false, mode: 'none' });
  const [mcpTools, setMcpTools] = useState<string[]>([]);
  const [mcpConnecting, setMcpConnecting] = useState(false);

  // Log filters
  const [logStatusFilter, setLogStatusFilter] = useState<'all' | 'success' | 'failed' | 'timeout'>('all');
  const [logToolFilter, setLogToolFilter] = useState<string>('');

  // Test progress
  const [testProgress, setTestProgress] = useState<TestProgress>({});

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

  // Model loading
  const [modelLoading, setModelLoading] = useState<ModelLoadingState>({});

  // System metrics
  const [systemMetrics, setSystemMetrics] = useState<SystemMetric[]>([]);

  // Slow model prompt
  const [showSlowModelPrompt, setShowSlowModelPrompt] = useState(false);
  const [slowModelLatency, setSlowModelLatency] = useState<number>(0);
  const pendingTestRef = useRef<{ modelId: string; provider: string } | null>(null);

  // Test all models
  const [testingAllModels, setTestingAllModels] = useState(false);
  const [testAllProgress, setTestAllProgress] = useState<TestAllProgress | null>(null);
  const cancelTestAllRef = useRef(false);

  // Test intents
  const [testingIntents, setTestingIntents] = useState(false);
  const [intentProgress, setIntentProgress] = useState<IntentProgress | null>(null);
  const cancelIntentTestRef = useRef(false);

  // New Cognitive Loop State (Phase 5)
  const [legacyMode, setLegacyMode] = useState(false);
  const [cognitiveStep, setCognitiveStep] = useState<'idle' | 'search' | 'understand' | 'decide' | 'act' | 'verify' | 'persist'>('idle');
  const [intentCard, setIntentCard] = useState<{ strategy: 'refactor' | 'patch' | 'investigate'; risk: 'high' | 'medium' | 'low'; reasoning: string } | undefined>(undefined);
  const [cognitiveLogs, setCognitiveLogs] = useState<string[]>([]);
  const [mentalModelSummary, setMentalModelSummary] = useState<{ constraints: string[]; relevantFiles: number } | undefined>(undefined);
  const [sandboxActive, setSandboxActive] = useState<boolean>(false);

  // Sync refs for async access
  useEffect(() => {
    selectedModelRef.current = selectedModel?.modelId || null;
    if (selectedModel?.modelId) {
      localStorage.setItem('tooly_selectedModelId', selectedModel.modelId);
    }
  }, [selectedModel?.modelId]);

  // Persist filter selections to localStorage
  useEffect(() => {
    localStorage.setItem('tooly_providerFilter', providerFilter);
  }, [providerFilter]);

  useEffect(() => {
    localStorage.setItem('tooly_testMode', testMode);
  }, [testMode]);

  return {
    // Navigation
    activeTab,
    setActiveTab,

    // Models
    models,
    setModels,
    selectedModel,
    setSelectedModel,
    selectedModelRef,

    // Tests
    tests,
    setTests,
    logs,
    setLogs,

    // Tests tab state
    customTests,
    setCustomTests,
    builtInTests,
    setBuiltInTests,
    testEditorOpen,
    setTestEditorOpen,
    editingTest,
    setEditingTest,
    selectedTest,
    setSelectedTest,
    testCategoryFilter,
    setTestCategoryFilter,
    testSearchFilter,
    setTestSearchFilter,
    tryingTest,
    setTryingTest,
    testResult,
    setTestResult,

    // Collapsible sections
    expandedSections,
    setExpandedSections,
    toggleSection,

    // Detail pane version
    detailPaneVersion,
    setDetailPaneVersion,

    // Loading states
    loading,
    setLoading,
    testingModel,
    setTestingModel,
    probingModel,
    setProbingModel,

    // Filters
    providerFilter,
    setProviderFilter,
    availableProviders,
    setAvailableProviders,
    testMode,
    setTestMode,

    // Context
    defaultContextLength,
    setDefaultContextLength,
    editingContextLength,
    setEditingContextLength,

    // Dual model config
    proxyMode,
    setProxyMode,
    enableDualModel,
    setEnableDualModel,
    mainModelId,
    setMainModelId,
    executorModelId,
    setExecutorModelId,
    savingDualModel,
    setSavingDualModel,
    modelValidationError,
    setModelValidationError,

    // System prompt
    editingSystemPrompt,
    setEditingSystemPrompt,
    savingSystemPrompt,
    setSavingSystemPrompt,
    showSystemPromptEditor,
    setShowSystemPromptEditor,

    // MCP
    mcpStatus,
    setMcpStatus,
    mcpTools,
    setMcpTools,
    mcpConnecting,
    setMcpConnecting,

    // Log filters
    logStatusFilter,
    setLogStatusFilter,
    logToolFilter,
    setLogToolFilter,

    // Test progress
    testProgress,
    setTestProgress,
    calculateETA,

    // Model loading
    modelLoading,
    setModelLoading,

    // System metrics
    systemMetrics,
    setSystemMetrics,

    // Slow model prompt
    showSlowModelPrompt,
    setShowSlowModelPrompt,
    slowModelLatency,
    setSlowModelLatency,
    pendingTestRef,

    // Test all models
    testingAllModels,
    setTestingAllModels,
    testAllProgress,
    setTestAllProgress,
    cancelTestAllRef,

    // Test intents
    testingIntents,
    setTestingIntents,
    intentProgress,
    setIntentProgress,
    cancelIntentTestRef,
    // Cognitive Loop (Phase 5)
    legacyMode,
    setLegacyMode,
    cognitiveStep,
    setCognitiveStep,
    intentCard,
    setIntentCard,
    cognitiveLogs,
    setCognitiveLogs,
    mentalModelSummary,
    setMentalModelSummary,
    sandboxActive,
    setSandboxActive,
    activeMainModel: models.find(m => m.id === mainModelId),
    activeExecutorModel: models.find(m => m.id === executorModelId),
  };
}
