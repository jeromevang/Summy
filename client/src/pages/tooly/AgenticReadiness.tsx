/**
 * Agentic Readiness Page
 * Test, teach, and certify models for agentic coding capabilities
 * 
 * Features:
 * - Hardware detection & VRAM monitoring
 * - Model scanning with VRAM estimates
 * - Qualifying Gate (5 must-pass tests) + Capability Discovery
 * - Dual-model mode (Main + Executor)
 * - Tool-by-tool capability grid
 * - Real-time WebSocket progress
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import ReconnectingWebSocket from 'reconnecting-websocket';
import { TestConfigPanel } from './components/TestConfigPanel';
import type { TestConfig } from './components/TestConfigPanel';

// Tooltip component
const Tooltip: React.FC<{ children: React.ReactNode; content: string }> = ({ children, content }) => {
  const [show, setShow] = useState(false);

  return (
    <div className="relative inline-block">
      <div
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      >
        {children}
      </div>
      {show && (
        <div className="absolute z-50 px-2 py-1 text-xs text-white bg-gray-900 rounded shadow-lg bottom-full left-1/2 transform -translate-x-1/2 mb-1 whitespace-nowrap">
          {content}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
        </div>
      )}
    </div>
  );
};

// ============================================================
// TYPES
// ============================================================

interface GPUInfo {
  name: string;
  vramMB: number;
  vramFreeMB: number;
  driver: string;
}

interface HardwareProfile {
  gpus: GPUInfo[];
  primaryGpu: GPUInfo | null;
  system: {
    cpuModel: string;
    cpuCores: number;
    ramTotalGB: number;
    ramFreeGB: number;
    platform: string;
  };
  totalVramGB: number;
  availableVramGB: number;
}

interface ScannedModel {
  id: string;
  displayName: string;
  parameters?: string;
  quantization?: string;
  estimatedVramGB: number;
  canRun: boolean;
  loadedNow: boolean;
  testedBefore: boolean;
  lastScore?: number;
}

interface CategoryScore {
  tool: number;
  rag: number;
  reasoning: number;
  intent: number;
  browser: number;
  multi_turn: number;
  boundary: number;
  fault_injection: number;
}

interface TestResult {
  testId: string;
  testName: string;
  category: string;
  passed: boolean;
  score: number;
  details: string;
  latency: number;
  attribution?: 'main' | 'executor' | 'loop';
}

interface CombinationCheckResult {
  vramOk: boolean;
  compatibilityOk: boolean;
  setupOk: boolean;
  vramMessage: string;
  compatibilityMessage: string;
  setupMessage: string;
  overallOk: boolean;
}

interface ReadinessResult {
  modelId: string;
  executorModelId?: string;
  assessedAt: string;
  overallScore: number;
  passed: boolean;
  qualifyingGatePassed: boolean;
  disqualifiedAt?: string;
  categoryScores: CategoryScore;
  testResults: TestResult[];
  failedTests: string[];
  duration: number;
  mode: 'single' | 'dual';
  trainabilityScores?: {
    systemPromptCompliance: number;
    instructionPersistence: number;
    correctionAcceptance: number;
    overallTrainability: number;
  };
}

interface TeachingResult {
  success: boolean;
  attempts: number;
  startingScore: number;
  finalScore: number;
  finalLevel: 1 | 2 | 3 | 4;
  prostheticApplied: boolean;
  probesFixed: string[];
  probesRemaining: string[];
  failedTestsByLevel: { level: number; count: number }[];
  improvements: CategoryScore;
  certified: boolean;
  log: string[];
}

interface LeaderboardEntry {
  rank: number;
  modelId: string;
  executorModelId?: string;
  score: number;
  certified: boolean;
  mode: 'single' | 'dual';
}

interface BatchResult {
  startedAt: string;
  completedAt: string;
  leaderboard: LeaderboardEntry[];
  bestModel: string | null;
}

interface Model {
  id: string;
  displayName?: string;
  estimatedVramGB?: number;
}

interface ReadinessProgress {
  modelId: string;
  current: number;
  total: number;
  currentTest: string;
  currentCategory?: string;
  status: string;
  score: number;
  passed?: boolean;
  mode?: 'single' | 'dual';
  phase?: 'qualifying' | 'discovery';
  attribution?: 'main' | 'executor' | 'loop';
}

interface BatchProgress {
  currentModel: string | null;
  currentModelIndex: number;
  totalModels: number;
  status: string;
  results: LeaderboardEntry[];
}

interface ToolCapability {
  tool: string;
  runs: number;
  passes: number;
  avgScore: number;
  avgLatency: number;
}

type Tab = 'setup' | 'single' | 'dual' | 'batch' | 'capabilities';

// ============================================================
// CONSTANTS
// ============================================================

const QUALIFYING_GATE = [
  { id: 'QG-1', name: 'Tool Format Valid', icon: '📝' },
  { id: 'QG-2', name: 'Instruction Following', icon: '📋' },
  { id: 'QG-3', name: 'Context Coherence', icon: '🎯' },
  { id: 'QG-4', name: 'Basic Reasoning', icon: '🧠' },
  { id: 'QG-5', name: 'State Transition', icon: '🔄' },
];

const CATEGORIES = [
  { key: 'tool', name: 'Tool Calling', icon: '🔧', weight: '20%' },
  { key: 'rag', name: 'RAG Usage', icon: '📚', weight: '18%' },
  { key: 'reasoning', name: 'Reasoning', icon: '🧠', weight: '15%' },
  { key: 'intent', name: 'Intent Recognition', icon: '🎯', weight: '10%' },
  { key: 'browser', name: 'Browser/Web', icon: '🌐', weight: '10%' },
  { key: 'multi_turn', name: 'Multi-Turn', icon: '💬', weight: '10%' },
  { key: 'boundary', name: 'Boundaries', icon: '🧱', weight: '10%' },
  { key: 'fault_injection', name: 'Fault Recovery', icon: '💥', weight: '7%' },
] as const;

const THRESHOLD = 70;

// ============================================================
// HARDWARE PANEL COMPONENT
// ============================================================

const HardwarePanel: React.FC<{
  hardware: HardwareProfile | null;
  isLoading: boolean;
  onRefresh: () => void;
}> = ({ hardware, isLoading, onRefresh }) => {
  if (isLoading) {
    return (
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6 animate-pulse">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 bg-gray-700 rounded-lg"></div>
          <div className="h-6 w-48 bg-gray-700 rounded"></div>
        </div>
        <div className="space-y-3">
          <div className="h-4 w-full bg-gray-700 rounded"></div>
          <div className="h-4 w-3/4 bg-gray-700 rounded"></div>
        </div>
      </div>
    );
  }

  if (!hardware) {
    return (
      <div className="bg-gray-800/50 border border-red-500/30 rounded-xl p-6">
        <div className="text-red-400 mb-2">Failed to detect hardware</div>
        <button
          onClick={onRefresh}
          className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
        >
          Retry Detection
        </button>
      </div>
    );
  }

  const vramUsedPercent = ((hardware.totalVramGB - hardware.availableVramGB) / hardware.totalVramGB) * 100;
  const vramColor = vramUsedPercent > 80 ? 'red' : vramUsedPercent > 50 ? 'yellow' : 'green';

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          💻 Hardware Profile
        </h3>
        <button
          onClick={onRefresh}
          className="text-gray-400 hover:text-white text-sm"
        >
          🔄 Refresh
        </button>
      </div>

      {/* GPU Info */}
      {hardware.primaryGpu && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">🎮</span>
            <span className="text-white font-medium">{hardware.primaryGpu.name}</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div>
              <span className="text-gray-400">VRAM: </span>
              <span className={`font-mono text-${vramColor}-400`}>
                {hardware.availableVramGB.toFixed(1)} / {hardware.totalVramGB.toFixed(1)} GB
              </span>
            </div>
          </div>
          {/* VRAM Bar */}
          <div className="mt-2 h-3 bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all bg-${vramColor}-500`}
              style={{ width: `${100 - vramUsedPercent}%` }}
            />
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {hardware.availableVramGB.toFixed(1)} GB available for models
          </div>
        </div>
      )}

      {/* System Info */}
      <div className="grid grid-cols-2 gap-4 text-sm border-t border-gray-700 pt-4">
        <div>
          <span className="text-gray-400">CPU: </span>
          <span className="text-gray-300">{hardware.system.cpuModel}</span>
        </div>
        <div>
          <span className="text-gray-400">RAM: </span>
          <span className="text-gray-300">
            {hardware.system.ramFreeGB.toFixed(1)} / {hardware.system.ramTotalGB.toFixed(1)} GB
          </span>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// QUALIFYING GATE PANEL
// ============================================================

const QualifyingGatePanel: React.FC<{
  results: TestResult[];
  phase: 'qualifying' | 'discovery' | undefined;
  disqualifiedAt?: string;
}> = ({ results, phase, disqualifiedAt }) => {
  const qualifyingResults = results.filter(r => r.testId.startsWith('QG-'));
  
  return (
    <div className={`border rounded-xl p-4 mb-4 ${
      disqualifiedAt 
        ? 'bg-red-500/10 border-red-500/30' 
        : phase === 'qualifying'
          ? 'bg-yellow-500/10 border-yellow-500/30'
          : 'bg-green-500/10 border-green-500/30'
    }`}>
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-medium text-white flex items-center gap-2">
          🚪 Qualifying Gate
          {phase === 'qualifying' && (
            <span className="text-xs px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded animate-pulse">
              TESTING
            </span>
          )}
          {disqualifiedAt && (
            <span className="text-xs px-2 py-0.5 bg-red-500/20 text-red-400 rounded">
              FAILED
            </span>
          )}
          {!disqualifiedAt && phase === 'discovery' && (
            <span className="text-xs px-2 py-0.5 bg-green-500/20 text-green-400 rounded">
              PASSED
            </span>
          )}
        </h4>
      </div>
      
      <div className="grid grid-cols-5 gap-2">
        {QUALIFYING_GATE.map(gate => {
          const result = qualifyingResults.find(r => r.testId === gate.id);
          const status = !result ? 'pending' : result.passed ? 'pass' : 'fail';
          const isCurrent = disqualifiedAt === gate.name;
          
          return (
            <div
              key={gate.id}
              className={`p-2 rounded-lg text-center transition-all ${
                status === 'pending' ? 'bg-gray-700/50 text-gray-400' :
                status === 'pass' ? 'bg-green-500/20 text-green-400' :
                'bg-red-500/20 text-red-400'
              } ${isCurrent ? 'ring-2 ring-red-500' : ''}`}
              title={result?.details || gate.name}
            >
              <div className="text-lg mb-1">{gate.icon}</div>
              <div className="text-xs font-medium truncate">{gate.id}</div>
            </div>
          );
        })}
      </div>
      
      {disqualifiedAt && (
        <div className="mt-3 text-sm text-red-400">
          ❌ Model disqualified at: <strong>{disqualifiedAt}</strong>
        </div>
      )}
    </div>
  );
};

// ============================================================
// DUAL MODEL FLOW VISUALIZATION
// ============================================================

const DualModelFlowViz: React.FC<{
  progress: ReadinessProgress | null;
  mainModel: string;
  executorModel: string;
}> = ({ progress, mainModel, executorModel }) => {
  const isActive = progress?.mode === 'dual' && progress.status === 'running';
  const currentStep = progress?.attribution || null;
  
  const steps = [
    { id: 'main', label: 'Main Model', icon: '🧠', desc: 'Reasoning & Planning' },
    { id: 'executor', label: 'Executor', icon: '⚡', desc: 'Tool Execution' },
    { id: 'loop', label: 'Agentic Loop', icon: '🔄', desc: 'Result Processing' },
  ];

  return (
    <div className="bg-gray-800/50 border border-purple-500/30 rounded-xl p-6 mb-4">
      <h4 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        🔗 Dual Model Flow
        {isActive && <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded animate-pulse">ACTIVE</span>}
      </h4>
      
      {/* Model Names */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-purple-900/30 rounded-lg p-3 border border-purple-500/20">
          <div className="text-xs text-purple-400 mb-1">🧠 Main Model</div>
          <div className="text-white font-medium truncate">{mainModel || 'Not selected'}</div>
        </div>
        <div className="bg-blue-900/30 rounded-lg p-3 border border-blue-500/20">
          <div className="text-xs text-blue-400 mb-1">⚡ Executor Model</div>
          <div className="text-white font-medium truncate">{executorModel || 'Not selected'}</div>
        </div>
      </div>

      {/* Flow Diagram */}
      <div className="flex items-center justify-between gap-2">
        {steps.map((step, i) => (
          <React.Fragment key={step.id}>
            <div className={`flex-1 p-4 rounded-lg text-center transition-all ${
              currentStep === step.id
                ? 'bg-gradient-to-br from-purple-500/20 to-blue-500/20 border-2 border-purple-400 scale-105'
                : 'bg-gray-700/50 border border-gray-600'
            }`}>
              <div className={`text-2xl mb-2 ${currentStep === step.id ? 'animate-bounce' : ''}`}>
                {step.icon}
              </div>
              <div className={`font-medium ${currentStep === step.id ? 'text-purple-300' : 'text-gray-400'}`}>
                {step.label}
              </div>
              <div className="text-xs text-gray-500 mt-1">{step.desc}</div>
            </div>
            {i < steps.length - 1 && (
              <div className={`text-2xl ${currentStep ? 'text-purple-400' : 'text-gray-600'}`}>→</div>
            )}
          </React.Fragment>
        ))}
      </div>
      
      {/* Current Test Info */}
      {progress && (
        <div className="mt-4 p-3 bg-gray-700/30 rounded-lg">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">Current Test:</span>
            <span className="text-white font-medium">{progress.currentTest}</span>
          </div>
          <div className="flex items-center justify-between text-sm mt-1">
            <span className="text-gray-400">Phase:</span>
            <span className={`${progress.phase === 'qualifying' ? 'text-yellow-400' : 'text-cyan-400'}`}>
              {progress.phase === 'qualifying' ? '🚪 Qualifying Gate' : '🎯 Capability Discovery'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================
// OBSERVABILITY PANEL
// ============================================================

interface SpanEvent {
  traceId: string;
  spanId?: string;
  operation?: string;
  durationMs?: number;
  status?: 'running' | 'success' | 'error';
  attributes?: Record<string, any>;
}

const ObservabilityPanel: React.FC<{
  isOpen: boolean;
  onToggle: () => void;
}> = ({ isOpen, onToggle }) => {
  const [spans, setSpans] = useState<SpanEvent[]>([]);
  const [activeTrace, setActiveTrace] = useState<string | null>(null);
  
  useEffect(() => {
    const ws = new ReconnectingWebSocket(`ws://${window.location.hostname}:3001`);
    
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string);
        
        if (message.type === 'trace_start') {
          setActiveTrace(message.payload.traceId);
          setSpans([{ 
            traceId: message.payload.traceId, 
            operation: 'trace_start', 
            attributes: { modelId: message.payload.modelId }
          }]);
        } else if (message.type === 'span_start') {
          setSpans(prev => [...prev, {
            traceId: message.payload.traceId,
            spanId: message.payload.spanId,
            operation: message.payload.operation,
            status: 'running',
            attributes: message.payload.attributes
          }]);
        } else if (message.type === 'span_end') {
          setSpans(prev => prev.map(s => 
            s.spanId === message.payload.spanId 
              ? { ...s, durationMs: message.payload.durationMs, status: message.payload.status }
              : s
          ));
        } else if (message.type === 'trace_end') {
          setActiveTrace(null);
          setSpans(prev => [...prev, {
            traceId: message.payload.traceId,
            operation: 'trace_end',
            durationMs: message.payload.totalDurationMs,
            status: 'success'
          }]);
        }
      } catch {
        // Ignore parse errors
      }
    };
    
    return () => ws.close();
  }, []);

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="fixed bottom-4 right-4 px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-gray-400 hover:text-white hover:border-cyan-500 transition-colors flex items-center gap-2"
      >
        <span className={activeTrace ? 'animate-pulse text-green-400' : ''}>🔍</span>
        Observability {spans.length > 0 && `(${spans.length})`}
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 w-96 max-h-96 bg-gray-900 border border-gray-700 rounded-xl overflow-hidden shadow-2xl">
      <div className="flex items-center justify-between p-3 border-b border-gray-700 bg-gray-800">
        <h4 className="font-medium text-white flex items-center gap-2">
          🔍 Trace Log
          {activeTrace && <span className="animate-pulse text-green-400 text-xs">● LIVE</span>}
        </h4>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSpans([])}
            className="text-xs text-gray-500 hover:text-white"
          >
            Clear
          </button>
          <button onClick={onToggle} className="text-gray-400 hover:text-white">✕</button>
        </div>
      </div>
      
      <div className="max-h-80 overflow-y-auto p-2 space-y-1 font-mono text-xs">
        {spans.length === 0 ? (
          <div className="text-gray-500 text-center py-8">No traces yet. Run an assessment to see spans.</div>
        ) : (
          spans.map((span, i) => (
            <div
              key={i}
              className={`px-2 py-1 rounded ${
                span.operation === 'trace_start' ? 'bg-blue-500/20 text-blue-400' :
                span.operation === 'trace_end' ? 'bg-green-500/20 text-green-400' :
                span.status === 'running' ? 'bg-yellow-500/10 text-yellow-400' :
                span.status === 'error' ? 'bg-red-500/10 text-red-400' :
                'bg-gray-800/50 text-gray-400'
              }`}
            >
              <div className="flex justify-between">
                <span>{span.operation}</span>
                {span.durationMs && <span className="text-gray-500">{span.durationMs}ms</span>}
              </div>
              {span.attributes && Object.keys(span.attributes).length > 0 && (
                <div className="text-gray-500 text-xs truncate">
                  {Object.entries(span.attributes).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ')}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// ============================================================
// TOOL CAPABILITY GRID
// ============================================================

const ToolCapabilityGrid: React.FC<{
  results: TestResult[];
}> = ({ results }) => {
  const toolStats = useMemo(() => {
    const stats: Record<string, { passes: number; fails: number; totalScore: number; totalLatency: number }> = {};

    (results || []).forEach(r => {
      const category = r.category;
      if (!stats[category]) {
        stats[category] = { passes: 0, fails: 0, totalScore: 0, totalLatency: 0 };
      }
      if (r.passed) stats[category].passes++;
      else stats[category].fails++;
      stats[category].totalScore += r.score;
      stats[category].totalLatency += r.latency;
    });

    return Object.entries(stats).map(([category, stat]) => ({
      category,
      total: stat.passes + stat.fails,
      passes: stat.passes,
      fails: stat.fails,
      avgScore: Math.round(stat.totalScore / (stat.passes + stat.fails)),
      avgLatency: Math.round(stat.totalLatency / (stat.passes + stat.fails))
    }));
  }, [results]);

  if (results.length === 0) return null;

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-white mb-4">🎯 Capability Breakdown</h3>
      
      <div className="space-y-3">
        {toolStats.map(stat => {
          const cat = CATEGORIES.find(c => c.key === stat.category);
          if (!cat) return null;
          
          const passRate = (stat.passes / stat.total) * 100;
          
          return (
            <div key={stat.category} className="flex items-center gap-4">
              <span className="text-xl w-8">{cat.icon}</span>
              <div className="flex-1">
                <div className="flex justify-between mb-1">
                  <span className="text-gray-300 font-medium">{cat.name}</span>
                  <span className="text-gray-400 text-sm">
                    {stat.passes}/{stat.total} passed • {stat.avgLatency}ms avg
                  </span>
                </div>
                <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${passRate >= 80 ? 'bg-green-500' : passRate >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                    style={{ width: `${passRate}%` }}
                  />
                </div>
              </div>
              <span className={`font-mono font-bold w-12 text-right ${
                stat.avgScore >= 70 ? 'text-green-400' : stat.avgScore >= 50 ? 'text-yellow-400' : 'text-red-400'
              }`}>
                {stat.avgScore}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ============================================================
// MAIN COMPONENT
// ============================================================

export const AgenticReadiness: React.FC = () => {
  const navigate = useNavigate();

  // Tab state
  const [tab, setTab] = useState<Tab>('single');
  
  // Hardware state
  const [hardware, setHardware] = useState<HardwareProfile | null>(null);
  const [isLoadingHardware, setIsLoadingHardware] = useState(true);
  
  // Models state
  const [models, setModels] = useState<Model[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>('lmstudio');
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [executorModelId, setExecutorModelId] = useState<string>('');
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  
  // Assessment state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assessmentResult, setAssessmentResult] = useState<ReadinessResult | null>(null);
  const [teachingResult, setTeachingResult] = useState<TeachingResult | null>(null);
  const [progress, setProgress] = useState<ReadinessProgress | null>(null);
  
  // Batch state
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);
  
  // Config panel state
  const [showConfigPanel, setShowConfigPanel] = useState(false);
  const [testConfig, setTestConfig] = useState<TestConfig | undefined>(undefined);
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  
  // UI state
  const [runCount, setRunCount] = useState(1);
  const [autoTeachRequested, setAutoTeachRequested] = useState(false);
  const [isTeaching, setIsTeaching] = useState(false);
  const [teachingLog, setTeachingLog] = useState<string[]>([]);
  const [showObservability, setShowObservability] = useState(false);
  const [combinationCheck, setCombinationCheck] = useState<CombinationCheckResult | null>(null);

  // ============================================================
  // DATA FETCHING
  // ============================================================

  const detectHardware = async () => {
    setIsLoadingHardware(true);
    try {
      const response = await fetch('/api/tooly/optimal-setup/hardware');
      if (!response.ok) throw new Error('Failed to detect hardware');
      const data = await response.json();
      setHardware(data);
    } catch (err: any) {
      console.error('Hardware detection failed:', err);
    } finally {
      setIsLoadingHardware(false);
    }
  };

  const fetchModels = async () => {
    setIsLoadingModels(true);
    setError(null);
    try {
      const response = await fetch(`/api/tooly/models?provider=${selectedProvider}`);
      if (!response.ok) throw new Error('Failed to fetch models');
      const data = await response.json();
      setModels(data.models || []);
      // Clear selected models when provider changes
      setSelectedModelId('');
      setExecutorModelId('');
      if (data.models?.length > 0 && !selectedModelId) {
        setSelectedModelId(data.models[0].id);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoadingModels(false);
    }
  };

  // Load saved assessment for a model
  const loadModelAssessmentData = async (modelId: string) => {
    try {
      const response = await fetch(`/api/tooly/models/${encodeURIComponent(modelId)}`);
      if (response.ok) {
        const profile = await response.json();
        if (profile.agenticReadiness) {
          const assessmentResult: ReadinessResult = {
            modelId,
            assessedAt: profile.agenticReadiness.assessedAt || new Date().toISOString(),
            overallScore: profile.agenticReadiness.score,
            passed: profile.agenticReadiness.certified,
            qualifyingGatePassed: profile.agenticReadiness.qualifyingGatePassed ?? true,
            categoryScores: profile.agenticReadiness.categoryScores,
            testResults: profile.agenticReadiness.testResults || [],
            failedTests: [],
            duration: 0,
            mode: profile.agenticReadiness.mode || 'single',
            trainabilityScores: profile.trainabilityScores
          };
          setAssessmentResult(assessmentResult);
        } else {
          setAssessmentResult(null);
        }
      }
    } catch (err) {
      console.warn('Failed to load model assessment data:', err);
    }
  };

  // ============================================================
  // EFFECTS
  // ============================================================

  // Initial data loading
  useEffect(() => {
    detectHardware();
    fetchModels();
  }, []);

  // Refetch models when provider changes
  useEffect(() => {
    fetchModels();
  }, [selectedProvider]);

  // Load assessment when model changes
  useEffect(() => {
    if (selectedModelId) {
      loadModelAssessmentData(selectedModelId);
    } else {
      setAssessmentResult(null);
    }
  }, [selectedModelId]);

  // WebSocket for real-time updates
  useEffect(() => {
    const ws = new ReconnectingWebSocket(`ws://${window.location.hostname}:3001`);

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string);

        if (message.type === 'readiness_progress') {
          setProgress(message.payload);
        } else if (message.type === 'batch_readiness_progress') {
          setBatchProgress(message.payload);
        } else if (message.type === 'teaching_attempt') {
          setIsTeaching(true);
          setTeachingLog(prev => [...prev, 
            `[${new Date().toLocaleTimeString()}] Attempt ${message.data.attempt} at Level ${message.data.level}`
          ]);
        } else if (message.type === 'teaching_complete') {
          setIsTeaching(false);
          setTeachingLog(prev => [...prev,
            `[${new Date().toLocaleTimeString()}] Teaching ${message.data.success ? 'SUCCESSFUL' : 'FAILED'}!`
          ]);
        }
      } catch (e) {
        // Ignore parse errors
      }
    };

    return () => ws.close();
  }, []);

  // ============================================================
  // ACTIONS
  // ============================================================

  const runAssessment = async (mode: 'single' | 'dual', autoTeach = false) => {
    // Use the selected model
    const testModelId = selectedModelId;
    console.log('Using selected model ID:', testModelId);

    if (mode === 'dual' && !executorModelId) {
      setError('Please select an executor model for dual mode');
      return;
    }

    setIsLoading(true);
    setError(null);
    setAssessmentResult(null);
    setTeachingResult(null);
    setProgress(null);
    setTeachingLog([]);
    setAutoTeachRequested(autoTeach);

    try {
      const body: any = {
        modelId: testModelId,
        autoTeach,
        runCount
      };

      if (mode === 'dual') {
        body.executorModelId = executorModelId;
      }

      // LOG EXACT REQUEST DETAILS
      console.log('🚀 ASSESSMENT REQUEST DETAILS:');
      console.log('URL:', '/api/tooly/readiness/assess');
      console.log('Method:', 'POST');
      console.log('Headers:', { 'Content-Type': 'application/json' });
      console.log('Body:', JSON.stringify(body, null, 2));
      console.log('Full Request Payload:', body);

      const response = await fetch('/api/tooly/readiness/assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      // LOG RESPONSE DETAILS
      console.log('📥 RESPONSE DETAILS:');
      console.log('Status:', response.status);
      console.log('Status Text:', response.statusText);
      console.log('Headers:', Object.fromEntries(response.headers.entries()));
      console.log('Response OK:', response.ok);

      if (!response.ok) throw new Error('Assessment failed');
      const data = await response.json();

      // LOG RESPONSE BODY
      console.log('📄 RESPONSE BODY:');
      console.log('Full Response Data:', JSON.stringify(data, null, 2));
      console.log('Assessment Result:', data);

      setAssessmentResult(data);
      if (data.teaching) {
        setTeachingResult(data.teaching);
        setTeachingLog(data.teaching.log || []);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
      setAutoTeachRequested(false);
    }
  };

  const checkCombination = async (mainModelId: string, executorModelId: string) => {
    if (!hardware) return;

    const mainModel = models.find(m => m.id === mainModelId);
    const executorModel = models.find(m => m.id === executorModelId);

    if (!mainModel || !executorModel) return;

    // VRAM Check
    const mainVram = mainModel.estimatedVramGB;
    const execVram = executorModel.estimatedVramGB;
    const totalVram = mainVram + execVram;
    const availableVram = hardware.availableVramGB;
    const vramOk = totalVram <= availableVram;
    const vramMessage = vramOk
      ? `${totalVram.toFixed(1)}GB fits in ${availableVram.toFixed(1)}GB available`
      : `${totalVram.toFixed(1)}GB exceeds ${availableVram.toFixed(1)}GB available`;

    // Compatibility Check (basic for now - can be enhanced)
    const compatibilityOk = mainModelId !== executorModelId; // Different models
    const compatibilityMessage = compatibilityOk
      ? 'Different models selected for main/executor roles'
      : 'Main and executor models should be different';

    // Setup Check
    const setupOk = !!mainModelId && !!executorModelId;
    const setupMessage = setupOk
      ? 'Both models configured'
      : 'Missing model configuration';

    const overallOk = vramOk && compatibilityOk && setupOk;

    setCombinationCheck({
      vramOk,
      compatibilityOk,
      setupOk,
      vramMessage,
      compatibilityMessage,
      setupMessage,
      overallOk
    });
  };

  const runBatchAssessment = async () => {
    setIsLoading(true);
    setError(null);
    setBatchResult(null);
    setBatchProgress(null);

    try {
      const response = await fetch('/api/tooly/readiness/assess-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runCount })
      });

      if (!response.ok) throw new Error('Batch assessment failed');
      const data = await response.json();
      setBatchResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // ============================================================
  // RENDER HELPERS
  // ============================================================

  const renderProgressBar = (score: number, threshold = THRESHOLD) => {
    const passed = score >= threshold;
    return (
      <div className="relative h-3 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`absolute h-full transition-all duration-500 ${
            passed ? 'bg-green-500' : score >= threshold * 0.8 ? 'bg-yellow-500' : 'bg-red-500'
          }`}
          style={{ width: `${Math.min(score, 100)}%` }}
        />
        <div className="absolute h-full w-0.5 bg-white/50" style={{ left: `${threshold}%` }} />
      </div>
    );
  };

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <button
          onClick={() => navigate('/tooly')}
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition-colors"
        >
          ← Back to Model Hub
        </button>

        <div className="mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
            Agentic Readiness Assessment
          </h1>
          <p className="text-gray-400 mt-2">
            Test, teach, and certify your local models for agentic coding tasks
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {[
            { id: 'single', label: 'Single Model', icon: '🤖' },
            { id: 'dual', label: 'Dual Model', icon: '🔗' },
            { id: 'batch', label: 'Test All', icon: '📊' },
            { id: 'setup', label: 'Hardware', icon: '💻' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as Tab)}
              className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${
                tab === t.id
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                  : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              <span>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {/* Error display */}
        {error && (
          <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-4 mb-6">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {/* Hardware Tab */}
        {tab === 'setup' && (
          <div className="space-y-6">
            <HardwarePanel
              hardware={hardware}
              isLoading={isLoadingHardware}
              onRefresh={detectHardware}
            />

            {/* Model List with VRAM */}
            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                🤖 Available Models
                <button
                  onClick={fetchModels}
                  className="text-gray-400 hover:text-white text-sm ml-auto"
                >
                  🔄 Refresh
                </button>
              </h3>

              {isLoadingModels ? (
                <div className="text-gray-400 text-center py-8">Loading models...</div>
              ) : models.length === 0 ? (
                <div className="text-gray-400 text-center py-8">
                  No models found for {selectedProvider === 'lmstudio' ? 'LM Studio' :
                                      selectedProvider === 'openrouter' ? 'OpenRouter' :
                                      selectedProvider === 'openai' ? 'OpenAI' : 'Azure'}.
                  {selectedProvider === 'lmstudio' && ' Make sure LM Studio is running.'}
                  {selectedProvider === 'openrouter' && ' Check OpenRouter API key configuration.'}
                  {selectedProvider === 'openai' && ' Check OpenAI API key configuration.'}
                  {selectedProvider === 'azure' && ' Check Azure configuration.'}
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {models.map(model => {
                    const canRun = !hardware || !model.estimatedVramGB || 
                      model.estimatedVramGB <= hardware.availableVramGB;
                    
                    return (
                      <div
                        key={model.id}
                        className={`flex items-center gap-4 p-3 rounded-lg ${
                          canRun ? 'bg-gray-700/30 hover:bg-gray-700/50' : 'bg-red-900/20 opacity-50'
                        }`}
                      >
                        <span className={canRun ? 'text-green-400' : 'text-red-400'}>
                          {canRun ? '✓' : '✗'}
                        </span>
                        <div className="flex-1">
                          <div className="font-medium text-white">{model.displayName || model.id}</div>
                          {model.estimatedVramGB && (
                            <div className="text-xs text-gray-400">
                              ~{model.estimatedVramGB.toFixed(1)} GB VRAM
                            </div>
                          )}
                        </div>
                        {!canRun && (
                          <span className="text-xs text-red-400">Insufficient VRAM</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Single Model Tab */}
        {tab === 'single' && (
          <div className="space-y-6">
            {/* Provider Selection */}
            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">🔧 Model Provider</h3>
              <div className="flex items-center gap-4">
                <select
                  value={selectedProvider}
                  onChange={(e) => {
                    setSelectedProvider(e.target.value);
                    // Models will be refetched automatically via useEffect
                  }}
                  className="bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-cyan-400 focus:outline-none"
                >
                  <option value="lmstudio">💻 LM Studio (Local)</option>
                  <option value="openrouter">🚀 OpenRouter (Free)</option>
                  <option value="openai">⚡ OpenAI</option>
                  <option value="azure">☁️ Azure OpenAI</option>
                </select>
                <button
                  onClick={fetchModels}
                  className="text-gray-400 hover:text-white text-sm px-3 py-2 border border-gray-600 rounded-lg"
                >
                  🔄 Refresh Models
                </button>
              </div>
            </div>

            {/* Model Selector */}
            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Select Model
              </label>
              <select
                value={selectedModelId}
                onChange={(e) => setSelectedModelId(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-cyan-500"
                disabled={isLoading}
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName || m.id}
                  </option>
                ))}
              </select>

              {/* Run Count */}
              <div className="mt-4 flex items-center gap-4">
                <label className="text-sm text-gray-400">Runs per test (flakiness):</label>
                <select
                  value={runCount}
                  onChange={(e) => setRunCount(Number(e.target.value))}
                  className="bg-gray-700 border border-gray-600 rounded px-3 py-1 text-white text-sm"
                >
                  <option value={1}>1x (fast)</option>
                  <option value={3}>3x (reliable)</option>
                </select>
              </div>
            </div>

            {/* Progress */}
            {progress && (
              <div className="bg-gray-800/50 border border-cyan-500/30 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <span className="text-cyan-400 font-medium text-lg">
                      {progress.status === 'completed' ? '✅ Complete' : '🔬 Testing'}
                    </span>
                    <div className="text-gray-400 text-sm mt-1">
                      Phase: {progress.phase === 'qualifying' ? 'Qualifying Gate' : 'Capability Discovery'}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-white text-2xl font-bold">{progress.current}</span>
                    <span className="text-gray-400">/{progress.total}</span>
                  </div>
                </div>

                <QualifyingGatePanel
                  results={assessmentResult?.testResults || []}
                  phase={progress.phase}
                  disqualifiedAt={assessmentResult?.disqualifiedAt}
                />

                <div className="h-3 bg-gray-700 rounded-full overflow-hidden mb-2">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-500"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                  />
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">{progress.currentTest}</span>
                  <span className="text-cyan-400">{progress.score}%</span>
                </div>
              </div>
            )}

            {/* Results */}
            {assessmentResult && (
              <>
                <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 className="text-xl font-bold text-white">Assessment Results</h2>
                      <p className="text-gray-400 text-sm">
                        {assessmentResult.mode === 'dual' ? 'Dual Model Mode' : 'Single Model'} •
                        {(assessmentResult.duration / 1000).toFixed(1)}s
                      </p>
                    </div>
                    <div className="text-right">
                      <div className={`text-4xl font-bold ${
                        assessmentResult.passed ? 'text-green-400' :
                        assessmentResult.qualifyingGatePassed ? 'text-yellow-400' : 'text-red-400'
                      }`}>
                        {assessmentResult.qualifyingGatePassed ? `${assessmentResult.overallScore}%` : 'DQ'}
                      </div>
                      <div className={`text-sm font-medium ${
                        assessmentResult.passed ? 'text-green-400' :
                        assessmentResult.qualifyingGatePassed ? 'text-gray-400' : 'text-red-400'
                      }`}>
                        {assessmentResult.passed ? '✓ CERTIFIED' :
                         assessmentResult.qualifyingGatePassed ? `Threshold: ${THRESHOLD}%` : 'DISQUALIFIED'}
                      </div>
                    </div>
                  </div>

                  {/* Category Scores */}
                  {assessmentResult.qualifyingGatePassed && (
                    <div className="space-y-3">
                      {CATEGORIES.map(cat => (
                        <div key={cat.key} className="flex items-center gap-4">
                          <span className="text-xl w-8">{cat.icon}</span>
                          <div className="flex-1">
                            <div className="flex justify-between mb-1">
                              <span className="text-gray-300">{cat.name}</span>
                              <span className="text-gray-400 text-sm">{cat.weight}</span>
                            </div>
                            {renderProgressBar(assessmentResult.categoryScores[cat.key as keyof CategoryScore])}
                          </div>
                          <span className={`font-mono font-bold w-12 text-right ${
                            assessmentResult.categoryScores[cat.key as keyof CategoryScore] >= THRESHOLD
                              ? 'text-green-400' : 'text-gray-400'
                          }`}>
                            {assessmentResult.categoryScores[cat.key as keyof CategoryScore]}%
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Capability Grid */}
                <ToolCapabilityGrid results={assessmentResult.testResults || []} />
              </>
            )}

            {/* Actions */}
            <div className="flex gap-3 flex-wrap">
              <Tooltip content="Run comprehensive agentic capability assessment on the selected model (28 tests, ~5-10 minutes)">
                <button
                  onClick={() => runAssessment('single', false)}
                  disabled={isLoading}
                  className="px-6 py-3 bg-cyan-500 text-black font-bold rounded-lg hover:bg-cyan-400 transition-colors disabled:opacity-50"
                >
                  {isLoading ? 'Running...' : 'Run Assessment'}
                </button>
              </Tooltip>
              <Tooltip content="Run assessment and automatically apply AI-generated prosthetics to fix any failures (may take 15-30 minutes)">
                <button
                  onClick={() => runAssessment('single', true)}
                  disabled={isLoading || !selectedModelId}
                  className="px-6 py-3 bg-gray-700 text-white font-medium rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-50"
                >
                  Assess + Auto-Teach
                </button>
              </Tooltip>
              <Tooltip content="Configure test settings: timeouts, test categories, flakiness detection, and context window testing">
                <button
                  onClick={() => setShowConfigPanel(true)}
                  className="px-4 py-3 bg-gray-800 border border-gray-600 text-gray-300 font-medium rounded-lg hover:bg-gray-700 hover:border-gray-500 transition-colors"
                  title="Test Configuration"
                >
                  ⚙️ Config
                </button>
              </Tooltip>
            </div>
          </div>
        )}

        {/* Dual Model Tab */}
        {tab === 'dual' && (
          <div className="space-y-6">
            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">
                🔗 Dual Model Configuration
              </h3>
              <p className="text-gray-400 text-sm mb-4">
                Main model handles reasoning, Executor model handles tool calls. 
                This allows using a smarter model for planning with a faster model for execution.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Main Model */}
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    🧠 Main Model (Reasoning)
                  </label>
                  <select
                    value={selectedModelId}
                    onChange={(e) => setSelectedModelId(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-purple-500"
                    disabled={isLoading}
                  >
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.displayName || m.id}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Executor Model */}
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    ⚡ Executor Model (Tools)
                  </label>
                  <select
                    value={executorModelId}
                    onChange={(e) => setExecutorModelId(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500"
                    disabled={isLoading}
                  >
                    <option value="">-- Select Executor --</option>
                    {models.filter(m => m.id !== selectedModelId).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.displayName || m.id}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* VRAM Calculator & Combo Validation */}
              {hardware && selectedModelId && executorModelId && (
                <div className="mt-4 p-4 bg-gray-700/30 rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Combined VRAM Estimate:</span>
                    {(() => {
                      const mainVram = models.find(m => m.id === selectedModelId)?.estimatedVramGB || 0;
                      const execVram = models.find(m => m.id === executorModelId)?.estimatedVramGB || 0;
                      const total = mainVram + execVram;
                      const available = hardware.availableVramGB;
                      const fits = total <= available;
                      return (
                        <span className={`font-mono ${fits ? 'text-green-400' : 'text-red-400'}`}>
                          {total.toFixed(1)} GB / {available.toFixed(1)} GB available
                          {fits ? ' ✓' : ' ❌ Won\'t fit!'}
                        </span>
                      );
                    })()}
                  </div>

                  {/* Check Combination Button */}
                  <div className="flex items-center justify-between pt-2 border-t border-gray-600/50">
                    <span className="text-gray-400 text-sm">Compatibility Check:</span>
                    <button
                      onClick={() => checkCombination(selectedModelId, executorModelId)}
                      disabled={isLoading}
                      className="px-4 py-2 bg-blue-600/80 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      <span>🔍</span>
                      Check Combination
                    </button>
                  </div>

                  {/* Combination Check Results */}
                  {combinationCheck && (
                    <div className="pt-2 border-t border-gray-600/50">
                      <div className="text-xs space-y-1">
                        <div className={`flex items-center gap-2 ${combinationCheck.vramOk ? 'text-green-400' : 'text-red-400'}`}>
                          <span>{combinationCheck.vramOk ? '✓' : '✗'}</span>
                          <span>VRAM: {combinationCheck.vramMessage}</span>
                        </div>
                        <div className={`flex items-center gap-2 ${combinationCheck.compatibilityOk ? 'text-green-400' : 'text-yellow-400'}`}>
                          <span>{combinationCheck.compatibilityOk ? '✓' : '⚠'}</span>
                          <span>Compatibility: {combinationCheck.compatibilityMessage}</span>
                        </div>
                        <div className={`flex items-center gap-2 ${combinationCheck.setupOk ? 'text-green-400' : 'text-red-400'}`}>
                          <span>{combinationCheck.setupOk ? '✓' : '✗'}</span>
                          <span>Setup: {combinationCheck.setupMessage}</span>
                        </div>
                      </div>
                      {combinationCheck.overallOk && (
                        <div className="mt-2 text-green-400 text-xs font-medium">
                          ✅ This combination looks good to test!
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Run Count */}
              <div className="mt-4 flex items-center gap-4">
                <label className="text-sm text-gray-400">Runs per test (flakiness):</label>
                <select
                  value={runCount}
                  onChange={(e) => setRunCount(Number(e.target.value))}
                  className="bg-gray-700 border border-gray-600 rounded px-3 py-1 text-white text-sm"
                >
                  <option value={1}>1x (fast)</option>
                  <option value={3}>3x (reliable)</option>
                </select>
              </div>
            </div>

            {/* Dual Model Flow Visualization */}
            {(progress?.mode === 'dual' || executorModelId) && (
              <DualModelFlowViz
                progress={progress}
                mainModel={selectedModelId}
                executorModel={executorModelId}
              />
            )}

            {/* Progress with attribution */}
            {progress && progress.mode === 'dual' && (
              <div className="bg-gray-800/50 border border-purple-500/30 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <span className="text-purple-400 font-medium text-lg">
                      🔗 Dual Model Assessment
                    </span>
                    <div className="text-gray-400 text-sm mt-1">
                      Testing {selectedModelId} + {executorModelId}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-white text-2xl font-bold">{progress.current}</span>
                    <span className="text-gray-400">/{progress.total}</span>
                  </div>
                </div>

                <QualifyingGatePanel
                  results={assessmentResult?.testResults || []}
                  phase={progress.phase}
                  disqualifiedAt={assessmentResult?.disqualifiedAt}
                />

                <div className="h-3 bg-gray-700 rounded-full overflow-hidden mb-2">
                  <div
                    className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                  />
                </div>

                <div className="flex justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400">{progress.currentTest}</span>
                    {progress.attribution && (
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        progress.attribution === 'main' ? 'bg-purple-500/20 text-purple-400' :
                        progress.attribution === 'executor' ? 'bg-blue-500/20 text-blue-400' :
                        'bg-green-500/20 text-green-400'
                      }`}>
                        {progress.attribution === 'main' ? '🧠 MAIN' :
                         progress.attribution === 'executor' ? '⚡ EXECUTOR' : '🔄 LOOP'}
                      </span>
                    )}
                  </div>
                  <span className="text-purple-400 font-mono">{progress.score}%</span>
                </div>
              </div>
            )}

            {/* Results */}
            {assessmentResult && assessmentResult.mode === 'dual' && (
              <>
                <div className="bg-gray-800/50 border border-purple-500/30 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 className="text-xl font-bold text-white">Dual Model Results</h2>
                      <p className="text-gray-400 text-sm">
                        {assessmentResult.modelId} + {assessmentResult.executorModelId}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className={`text-4xl font-bold ${
                        assessmentResult.passed ? 'text-green-400' : 'text-purple-400'
                      }`}>
                        {assessmentResult.qualifyingGatePassed ? `${assessmentResult.overallScore}%` : 'DQ'}
                      </div>
                      <div className={`text-sm font-medium ${
                        assessmentResult.passed ? 'text-green-400' : 'text-gray-400'
                      }`}>
                        {assessmentResult.passed ? '✓ CERTIFIED' : `Threshold: ${THRESHOLD}%`}
                      </div>
                    </div>
                  </div>

                  {/* Attribution breakdown */}
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    {['main', 'executor', 'loop'].map(attr => {
                      const attrResults = assessmentResult.testResults.filter(r => r.attribution === attr);
                      const passed = attrResults.filter(r => r.passed).length;
                      return (
                        <div key={attr} className="bg-gray-700/30 rounded-lg p-4 text-center">
                          <div className="text-2xl mb-2">
                            {attr === 'main' ? '🧠' : attr === 'executor' ? '⚡' : '🔄'}
                          </div>
                          <div className="text-sm text-gray-400 mb-1 capitalize">{attr}</div>
                          <div className="text-white font-bold">
                            {passed}/{attrResults.length}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <ToolCapabilityGrid results={assessmentResult.testResults || []} />
              </>
            )}

            <div className="flex gap-3">
              <Tooltip content="Test the selected Main + Executor model combination (28 tests, ~5-10 minutes)">
                <button
                  onClick={() => runAssessment('dual', false)}
                  disabled={isLoading || !selectedModelId || !executorModelId}
                  className="px-6 py-3 bg-gradient-to-r from-purple-500 to-blue-500 text-white font-bold rounded-lg hover:from-purple-400 hover:to-blue-400 transition-colors disabled:opacity-50"
                >
                  {isLoading ? 'Running...' : 'Test Dual Mode'}
                </button>
              </Tooltip>
              <Tooltip content="Test dual model combination and automatically apply prosthetics to improve coordination between models">
                <button
                  onClick={() => runAssessment('dual', true)}
                  disabled={isLoading || !selectedModelId || !executorModelId}
                  className="px-6 py-3 bg-gray-700 text-white font-medium rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-50"
                >
                  Test + Auto-Teach
                </button>
              </Tooltip>
              <Tooltip content="View detailed combo testing results and compare different model pair performances">
                <button
                  onClick={() => navigate('/tooly/combo-test')}
                  className="px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-medium rounded-lg hover:from-amber-400 hover:to-orange-400 transition-colors"
                >
                  🏆 Combo Leaderboard
                </button>
              </Tooltip>
            </div>
          </div>
        )}

        {/* Batch Tab */}
        {tab === 'batch' && (
          <div className="space-y-6">
            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
              <h2 className="text-xl font-bold text-white mb-2">Test All Models</h2>
              <p className="text-gray-400 mb-4">
                Run assessment on all {models.length} available models
              </p>

              {batchProgress && batchProgress.status === 'running' && (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-cyan-400">{batchProgress.currentModel || 'Starting...'}</span>
                    <span className="text-gray-400">
                      {batchProgress.currentModelIndex}/{batchProgress.totalModels}
                    </span>
                  </div>
                  <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-cyan-500"
                      style={{ width: `${(batchProgress.currentModelIndex / batchProgress.totalModels) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              <button
                onClick={runBatchAssessment}
                disabled={isLoading || models.length === 0}
                className="px-6 py-3 bg-cyan-500 text-black font-bold rounded-lg hover:bg-cyan-400 disabled:opacity-50"
              >
                {isLoading ? 'Testing...' : `Test All ${models.length} Models`}
              </button>
            </div>

            {/* Leaderboard */}
            {batchResult && (
              <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
                <h2 className="text-xl font-bold text-white mb-4">🏆 Leaderboard</h2>

                {batchResult.bestModel && (
                  <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 mb-4">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">🏆</span>
                      <div>
                        <div className="text-green-400 font-bold">Best Model</div>
                        <div className="text-white">{batchResult.bestModel}</div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  {batchResult.leaderboard.map((entry) => (
                    <div
                      key={entry.modelId}
                      className="flex items-center gap-4 py-3 px-4 bg-gray-700/30 rounded-lg hover:bg-gray-700/50 cursor-pointer"
                      onClick={() => {
                        setSelectedModelId(entry.modelId);
                        setTab('single');
                      }}
                    >
                      <span className={`text-xl font-bold ${
                        entry.rank === 1 ? 'text-yellow-400' :
                        entry.rank === 2 ? 'text-gray-300' :
                        entry.rank === 3 ? 'text-orange-400' :
                        'text-gray-500'
                      }`}>
                        #{entry.rank}
                      </span>
                      <div className="flex-1">
                        <div className="font-medium text-white">{entry.modelId}</div>
                        {entry.mode === 'dual' && entry.executorModelId && (
                          <div className="text-xs text-gray-400">+ {entry.executorModelId}</div>
                        )}
                      </div>
                      <span className={`text-xl font-bold ${
                        entry.score >= THRESHOLD ? 'text-green-400' : 'text-gray-400'
                      }`}>
                        {entry.score}%
                      </span>
                      {entry.certified && (
                        <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded text-xs font-bold">
                          CERTIFIED
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Observability Panel */}
      <ObservabilityPanel
        isOpen={showObservability}
        onToggle={() => setShowObservability(!showObservability)}
      />
      
      {/* Test Configuration Panel */}
      <TestConfigPanel
        isOpen={showConfigPanel}
        onClose={() => setShowConfigPanel(false)}
        onSave={(config) => {
          setTestConfig(config);
          console.log('[AgenticReadiness] Test config saved:', config);
        }}
        initialConfig={testConfig}
      />
    </div>
  );
};

export default AgenticReadiness;
