/**
 * Combo Testing Page
 * Test dual-model combinations to find the best Main + Executor pairs
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ReconnectingWebSocket from 'reconnecting-websocket';

// ============================================================
// TYPES
// ============================================================

type TestCategory = 
  | 'suppress' | 'single_tool' | 'tool_select' | 'param_extract'
  | 'clarify' | 'multi_tool' | 'reasoning' | 'refusal';

type DifficultyTier = 'simple' | 'medium' | 'complex';

interface Model {
  id: string;
  displayName?: string;
  role?: 'main' | 'executor' | 'both';
  score?: number;
  sizeBytes?: number;
  quantization?: string;
}

interface ComboTestResult {
  testId: string;
  testName: string;
  category: TestCategory;
  difficulty: DifficultyTier;
  passed: boolean;
  mainAction: string | null;
  mainTool: string | null;
  executorToolCalls: string[];
  latencyMs: number;
  error?: string;
  timedOut?: boolean;
  skipped?: boolean;
}

interface CategoryScore {
  category: TestCategory;
  difficulty: DifficultyTier;
  score: number;
  passed: boolean;
  latencyMs: number;
}

interface TierScore {
  tier: DifficultyTier;
  score: number;
  categories: CategoryScore[];
}

interface ComboScore {
  mainModelId: string;
  executorModelId: string;
  totalTests: number;
  passedTests: number;
  categoryScores?: CategoryScore[];
  tierScores?: TierScore[];
  // Split scores
  mainScore: number;           // % where Main correctly identified action
  executorScore: number;       // % where Executor succeeded (given Main was correct)
  mainCorrectCount?: number;
  executorSuccessCount?: number;
  // Legacy
  intentAccuracy: number;
  executionSuccess: number;
  avgLatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  overallScore: number;
  testResults: ComboTestResult[];
  testedAt: string;
  skippedTests?: number;
  timedOutTests?: number;
  mainExcluded?: boolean;    // True if Main model was excluded due to timeout
  mainTimedOut?: boolean;    // True if Main model specifically was too slow
  executorTimedOut?: boolean; // True if Executor model specifically was too slow
}

// Category display info
const CATEGORY_LABELS: Record<TestCategory, { name: string; emoji: string }> = {
  suppress: { name: 'Suppress', emoji: '🚫' },
  single_tool: { name: 'Single Tool', emoji: '🔧' },
  tool_select: { name: 'Tool Select', emoji: '🎯' },
  param_extract: { name: 'Param Extract', emoji: '📝' },
  clarify: { name: 'Clarify', emoji: '❓' },
  multi_tool: { name: 'Multi-Tool', emoji: '🔗' },
  reasoning: { name: 'Reasoning', emoji: '🧠' },
  refusal: { name: 'Refusal', emoji: '🛡️' },
};

const TIER_COLORS: Record<DifficultyTier, string> = {
  simple: 'text-green-400',
  medium: 'text-yellow-400',
  complex: 'text-red-400',
};

interface ComboTestProgress {
  currentMain: string;
  currentExecutor: string;
  currentTest: string;
  comboIndex: number;
  totalCombos: number;
  testIndex: number;
  totalTests: number;
  status: 'running' | 'completed' | 'failed' | 'timeout';
}

interface ContextSizeResult {
  contextSize: number;
  score: ComboScore;
}

// ============================================================
// CONSTANTS
// ============================================================

const CONTEXT_SIZES = [4096, 8192, 16384, 32768];

// ============================================================
// COMPONENT
// ============================================================

export const ComboTest: React.FC = () => {
  const navigate = useNavigate();

  // State
  const [models, setModels] = useState<Model[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [selectedMainModels, setSelectedMainModels] = useState<Set<string>>(new Set());
  const [selectedExecutorModels, setSelectedExecutorModels] = useState<Set<string>>(new Set());
  
  // Testing state
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<ComboTestProgress | null>(null);
  const [results, setResults] = useState<ComboScore[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  // Context size testing
  const [selectedCombo, setSelectedCombo] = useState<{ main: string; executor: string } | null>(null);
  const [isTestingContext, setIsTestingContext] = useState(false);
  const [contextResults, setContextResults] = useState<ContextSizeResult[]>([]);
  
  // Track excluded Main models
  const [excludedMainModels, setExcludedMainModels] = useState<Set<string>>(new Set());

  // WebSocket for real-time progress
  useEffect(() => {
    const ws = new ReconnectingWebSocket(`ws://${window.location.hostname}:3001`);

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string);
        
        if (message.type === 'combo_test_progress') {
          console.log('[ComboTest] Progress:', message.data);
          setProgress(message.data);
          
          if (message.data.status === 'completed') {
            setIsRunning(false);
          }
        }
        
        // Handle incremental combo results
        if (message.type === 'combo_test_result') {
          console.log('[ComboTest] Combo Result:', message.data);
          // Update results with the sorted list from server
          setResults(message.data.allResults || []);
          
          if (message.data.isComplete) {
            setIsRunning(false);
            setProgress(null);
          }
        }
        
        // Handle Main model exclusion notification
        if (message.type === 'combo_test_main_excluded') {
          console.log('[ComboTest] Main model excluded:', message.data);
          setExcludedMainModels(prev => new Set([...prev, message.data.mainModelId]));
        }
      } catch (e) {
        // Ignore parse errors
      }
    };

    return () => ws.close();
  }, []);

  // Fetch models and saved results on mount
  useEffect(() => {
    fetchModels();
    fetchSavedResults();
  }, []);

  // Fetch saved combo results from database
  const fetchSavedResults = async () => {
    try {
      const response = await fetch('/api/tooly/combo-test/results');
      if (!response.ok) return;
      const data = await response.json();
      if (data.results && data.results.length > 0) {
        // Convert database format to UI format
        const uiResults = data.results.map((r: any) => ({
          mainModelId: r.mainModelId,
          executorModelId: r.executorModelId,
          totalTests: r.passedCount + r.failedCount,
          passedTests: r.passedCount,
          categoryScores: r.categoryScores || [],
          tierScores: [
            { tier: 'simple', score: r.tierScores?.simple || 0, categories: r.tierScores?.simpleCategories || [] },
            { tier: 'medium', score: r.tierScores?.medium || 0, categories: r.tierScores?.mediumCategories || [] },
            { tier: 'complex', score: r.tierScores?.complex || 0, categories: r.tierScores?.complexCategories || [] },
          ],
          mainScore: r.mainScore || 0,
          executorScore: r.executorScore || 0,
          mainCorrectCount: 0,
          executorSuccessCount: 0,
          intentAccuracy: 0,
          executionSuccess: 0,
          avgLatencyMs: r.avgLatencyMs || 0,
          minLatencyMs: 0,
          maxLatencyMs: 0,
          overallScore: r.overallScore,
          testResults: r.testResults || [],
          testedAt: r.testedAt,
          mainExcluded: r.mainExcluded,
        }));
        setResults(uiResults);
        console.log(`[ComboTest] Loaded ${uiResults.length} saved results`);
      }
    } catch (err: any) {
      console.log('[ComboTest] No saved results:', err.message);
    }
  };

  const fetchModels = async () => {
    setIsLoadingModels(true);
    try {
      const response = await fetch('/api/tooly/models?provider=lmstudio');
      if (!response.ok) throw new Error('Failed to fetch models');
      const data = await response.json();
      // Sort models by size (smallest first)
      const sortedModels = (data.models || []).sort((a: Model, b: Model) => {
        const sizeA = a.sizeBytes || 0;
        const sizeB = b.sizeBytes || 0;
        return sizeA - sizeB;
      });
      setModels(sortedModels);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoadingModels(false);
    }
  };

  // Format bytes to human-readable size
  const formatSize = (bytes?: number): string => {
    if (!bytes) return '?';
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) {
      return `${gb.toFixed(1)}GB`;
    }
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(0)}MB`;
  };


  // Toggle model selection
  const toggleMainModel = (modelId: string) => {
    setSelectedMainModels(prev => {
      const next = new Set(prev);
      if (next.has(modelId)) {
        next.delete(modelId);
      } else {
        next.add(modelId);
      }
      return next;
    });
  };

  const toggleExecutorModel = (modelId: string) => {
    setSelectedExecutorModels(prev => {
      const next = new Set(prev);
      if (next.has(modelId)) {
        next.delete(modelId);
      } else {
        next.add(modelId);
      }
      return next;
    });
  };

  // Select all / none helpers
  const selectAllMain = () => {
    const mainModels = models.filter(m => m.role === 'main' || m.role === 'both' || !m.role);
    setSelectedMainModels(new Set(mainModels.map(m => m.id)));
  };

  const selectAllExecutor = () => {
    const executorModels = models.filter(m => m.role === 'executor' || m.role === 'both' || !m.role);
    setSelectedExecutorModels(new Set(executorModels.map(m => m.id)));
  };

  // Run all combo tests
  const runAllCombos = async () => {
    if (selectedMainModels.size === 0 || selectedExecutorModels.size === 0) {
      setError('Please select at least one Main and one Executor model');
      return;
    }

    setIsRunning(true);
    setError(null);
    setResults([]);
    setProgress(null);
    setExcludedMainModels(new Set());

    try {
      const response = await fetch('/api/tooly/combo-test/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mainModels: Array.from(selectedMainModels),
          executorModels: Array.from(selectedExecutorModels),
        }),
      });

      if (!response.ok) throw new Error('Failed to start combo tests');
      
      const data = await response.json();
      console.log('[ComboTest] Started test:', data.testId);
      // Results will come via WebSocket 'combo_test_result' events

    } catch (err: any) {
      setError(err.message);
      setIsRunning(false);
    }
  };

  // Test context sizes for selected combo
  const testContextSizes = async () => {
    if (!selectedCombo) return;

    setIsTestingContext(true);
    setContextResults([]);

    try {
      const response = await fetch('/api/tooly/combo-test/context-sizes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mainModelId: selectedCombo.main,
          executorModelId: selectedCombo.executor,
          contextSizes: CONTEXT_SIZES,
        }),
      });

      if (!response.ok) throw new Error('Failed to test context sizes');
      
      const data = await response.json();
      setContextResults(data.results || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsTestingContext(false);
    }
  };

  // Calculate totals
  const totalCombos = selectedMainModels.size * selectedExecutorModels.size;
  const totalTests = totalCombos * 8; // 8 test cases per combo (one per category)

  // Get model display name
  const getModelName = (modelId: string | undefined | null) => {
    if (!modelId) return 'Unknown';
    const model = models.find(m => m.id === modelId);
    return model?.displayName || modelId.split('/').pop() || modelId;
  };

  // Render progress bar
  const renderProgress = () => {
    // Don't render if no progress or if completed (results will show instead)
    if (!progress || progress.status === 'completed') return null;

    const overallProgress = ((progress.comboIndex - 1) * progress.totalTests + progress.testIndex) / 
                           (progress.totalCombos * progress.totalTests) * 100;

    return (
      <div className="bg-gray-800/50 border border-amber-500/30 rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <span className="text-amber-400 font-medium text-lg">🧪 Testing in Progress</span>
            <div className="text-gray-400 text-sm mt-1">
              Finding the best Main + Executor combination
            </div>
          </div>
          <div className="text-right">
            <span className="text-white text-2xl font-bold">{progress.comboIndex}</span>
            <span className="text-gray-400">/{progress.totalCombos} combos</span>
          </div>
        </div>

        {/* Overall progress bar */}
        <div className="mb-4">
          <div className="h-3 bg-gray-700 rounded-full overflow-hidden mb-2">
            <div
              className="h-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-500"
              style={{ width: `${overallProgress}%` }}
            />
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">{Math.round(overallProgress)}% complete</span>
            <span className="text-amber-400">
              Test {progress.testIndex}/{progress.totalTests}
            </span>
          </div>
        </div>

        {/* Current combo info */}
        <div className="bg-gray-700/30 rounded-lg p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></div>
            <span className="text-white font-medium">Currently Testing:</span>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-3">
            <div>
              <span className="text-gray-400 text-xs uppercase">Main Model</span>
              <div className="text-amber-300 font-mono text-sm truncate">
                {getModelName(progress.currentMain)}
              </div>
            </div>
            <div>
              <span className="text-gray-400 text-xs uppercase">Executor Model</span>
              <div className="text-orange-300 font-mono text-sm truncate">
                {getModelName(progress.currentExecutor)}
              </div>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-600">
            <span className="text-gray-400 text-xs uppercase">Current Test</span>
            <div className="text-white">{progress.currentTest}</div>
          </div>
        </div>
      </div>
    );
  };

  // Render results table
  const renderResults = () => {
    if (results.length === 0) return null;

    // Calculate how many combos are done
    const completedCombos = results.length;
    const totalCombosExpected = selectedMainModels.size * selectedExecutorModels.size;
    const stillRunning = isRunning && completedCombos < totalCombosExpected;

    return (
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-white">Results</h2>
            {stillRunning && (
              <span className="flex items-center gap-2 text-amber-400 text-sm">
                <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse"></span>
                {completedCombos}/{totalCombosExpected} combos tested
              </span>
            )}
            {!stillRunning && results.length > 0 && (
              <span className="text-gray-500 text-sm">
                {results.length} combo{results.length !== 1 ? 's' : ''} tested
                {excludedMainModels.size > 0 && (
                  <span className="text-red-400 ml-2">
                    ({excludedMainModels.size} Main model{excludedMainModels.size !== 1 ? 's' : ''} excluded)
                  </span>
                )}
              </span>
            )}
          </div>
          <button
            onClick={() => {
              const csv = [
                ['Rank', 'Main Model', 'Executor Model', 'Main Score', 'Executor Score', 'Overall Score', 'Simple', 'Medium', 'Complex', 'Avg Latency'],
                ...results.map((r, i) => [
                  i + 1,
                  r.mainModelId,
                  r.executorModelId,
                  r.mainScore,
                  r.executorScore,
                  r.overallScore,
                  r.tierScores?.find(t => t.tier === 'simple')?.score ?? 0,
                  r.tierScores?.find(t => t.tier === 'medium')?.score ?? 0,
                  r.tierScores?.find(t => t.tier === 'complex')?.score ?? 0,
                  r.avgLatencyMs
                ])
              ].map(row => row.join(',')).join('\n');
              
              const blob = new Blob([csv], { type: 'text/csv' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `combo-results-${new Date().toISOString().slice(0,10)}.csv`;
              a.click();
            }}
            className="px-3 py-1.5 bg-gray-700 text-gray-300 rounded-lg text-sm hover:bg-gray-600 transition-colors"
          >
            📥 Export CSV
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-gray-400 text-sm border-b border-gray-700">
                <th className="pb-3 pr-4">#</th>
                <th className="pb-3 pr-4">Main Model</th>
                <th className="pb-3 pr-4">Executor Model</th>
                <th className="pb-3 pr-4 text-center" title="Main (Intent) / Executor (Tools)">🧠/🔧</th>
                <th className="pb-3 pr-4 text-right">Score</th>
                <th className="pb-3 pr-4 text-right text-green-400/70">Simple</th>
                <th className="pb-3 pr-4 text-right text-yellow-400/70">Medium</th>
                <th className="pb-3 pr-4 text-right text-red-400/70">Complex</th>
                <th className="pb-3 pr-4 text-right">Latency</th>
                <th className="pb-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {results.map((result, index) => {
                const isMainExcluded = result.mainExcluded === true;
                const isMainSlow = result.mainTimedOut === true;
                const isExecutorSlow = result.executorTimedOut === true && !isMainSlow;
                const isSkipped = (result.overallScore === 0 && result.avgLatencyMs === 0) || isMainExcluded;
                const isBest = index === 0 && result.overallScore > 0;
                
                return (
                  <tr 
                    key={`${result.mainModelId}-${result.executorModelId}`}
                    className={`border-b border-gray-700/50 hover:bg-gray-700/20 transition-colors ${
                      isBest ? 'bg-green-500/5' : ''
                    }`}
                  >
                    <td className="py-3 pr-4">
                      {isBest ? (
                        <span className="text-yellow-400 text-lg">🏆</span>
                      ) : isMainExcluded ? (
                        <span className="text-red-500" title="Main model excluded (too slow at intent)">🐌</span>
                      ) : isMainSlow ? (
                        <span className="text-red-500" title="Main model slow (>5s for intent)">🐌</span>
                      ) : isExecutorSlow ? (
                        <span className="text-orange-400" title="Executor slow (>5s for tools) but Main OK">⏱️</span>
                      ) : isSkipped ? (
                        <span className="text-gray-500">-</span>
                      ) : (
                        <span className={`font-bold ${
                          index < 3 ? 'text-white' : 'text-gray-500'
                        }`}>
                          {index + 1}
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`font-mono text-sm ${isMainExcluded || isMainSlow ? 'text-red-400 line-through' : 'text-amber-300'}`}>
                        {getModelName(result.mainModelId)}
                      </span>
                      {isMainExcluded && (
                        <span className="ml-2 text-xs text-red-400/60">excluded</span>
                      )}
                      {isMainSlow && !isMainExcluded && (
                        <span className="ml-2 text-xs text-red-400/60">slow</span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`font-mono text-sm ${isExecutorSlow ? 'text-orange-400' : 'text-orange-300'}`}>
                        {getModelName(result.executorModelId)}
                      </span>
                      {isExecutorSlow && (
                        <span className="ml-2 text-xs text-orange-400/60">slow</span>
                      )}
                      {isMainExcluded && (
                        <span className="ml-2 text-xs text-gray-500">(+ others skipped)</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-center">
                      {isSkipped ? (
                        <span className="text-gray-500">-/-</span>
                      ) : (
                        <span className="font-mono text-sm" title={`Main: ${result.mainScore}% intent accuracy | Executor: ${result.executorScore}% tool success`}>
                          <span className={result.mainScore >= 80 ? 'text-amber-400' : result.mainScore >= 50 ? 'text-amber-600' : 'text-red-400'}>
                            {result.mainScore}
                          </span>
                          <span className="text-gray-500">/</span>
                          <span className={result.executorScore >= 80 ? 'text-orange-400' : result.executorScore >= 50 ? 'text-orange-600' : 'text-red-400'}>
                            {result.executorScore}
                          </span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-right">
                      {isMainExcluded ? (
                        <span className="text-red-400 text-xs" title="Main model too slow, skipped remaining executors">🐌 MAIN SLOW</span>
                      ) : isMainSlow ? (
                        <span className="text-red-400 text-xs" title="Main model too slow (>5s for intent generation)">🐌 {result.overallScore}%</span>
                      ) : isExecutorSlow ? (
                        <span className="text-orange-400 text-sm" title="Executor slow (>5s for tools), Main was fast">⏱️ {result.overallScore}%</span>
                      ) : isSkipped ? (
                        <span className="text-red-400 text-sm">SKIP</span>
                      ) : (
                        <span className={`font-bold ${
                          result.overallScore >= 70 ? 'text-green-400' :
                          result.overallScore >= 50 ? 'text-yellow-400' :
                          'text-red-400'
                        }`}>
                          {result.overallScore}%
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-right">
                      {isSkipped ? '-' : (
                        <span className={
                          (result.tierScores?.find(t => t.tier === 'simple')?.score ?? 0) >= 80 
                            ? 'text-green-400' : 'text-gray-500'
                        }>
                          {result.tierScores?.find(t => t.tier === 'simple')?.score ?? '-'}%
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-right">
                      {isSkipped ? '-' : (
                        <span className={
                          (result.tierScores?.find(t => t.tier === 'medium')?.score ?? 0) >= 60 
                            ? 'text-yellow-400' : 'text-gray-500'
                        }>
                          {result.tierScores?.find(t => t.tier === 'medium')?.score ?? '-'}%
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-right">
                      {isSkipped ? '-' : (
                        <span className={
                          (result.tierScores?.find(t => t.tier === 'complex')?.score ?? 0) >= 50 
                            ? 'text-orange-400' : 'text-gray-500'
                        }>
                          {result.tierScores?.find(t => t.tier === 'complex')?.score ?? '-'}%
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-right">
                      {isSkipped ? (
                        <span className="text-red-400 text-xs">&gt;5s timeout</span>
                      ) : (
                        <span className={`${
                          result.avgLatencyMs < 3000 ? 'text-green-400' :
                          result.avgLatencyMs < 5000 ? 'text-yellow-400' :
                          'text-red-400'
                        }`}>
                          {(result.avgLatencyMs / 1000).toFixed(1)}s
                        </span>
                      )}
                    </td>
                    <td className="py-3">
                      {!isSkipped && (
                        <button
                          onClick={() => setSelectedCombo({
                            main: result.mainModelId,
                            executor: result.executorModelId
                          })}
                          className={`px-2 py-1 rounded text-xs transition-colors ${
                            selectedCombo?.main === result.mainModelId && 
                            selectedCombo?.executor === result.executorModelId
                              ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          }`}
                        >
                          Select
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Selected Combo Details */}
        {selectedCombo && (() => {
          const selectedResult = results.find(
            r => r.mainModelId === selectedCombo.main && r.executorModelId === selectedCombo.executor
          );
          
          return (
            <div className="mt-6 pt-6 border-t border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-medium text-white">Selected Combo</h3>
                  <p className="text-gray-400 text-sm mt-1">
                    <span className="text-amber-300">{getModelName(selectedCombo.main)}</span>
                    {' + '}
                    <span className="text-orange-300">{getModelName(selectedCombo.executor)}</span>
                  </p>
                </div>
                <button
                  onClick={testContextSizes}
                  disabled={isTestingContext}
                  className="px-4 py-2 bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded-lg font-medium hover:bg-purple-500/30 transition-colors disabled:opacity-50"
                >
                  {isTestingContext ? 'Testing...' : '📐 Test Context Sizes'}
                </button>
              </div>

              {/* Split Score Summary */}
              {selectedResult && (
                <div className="mb-6 grid grid-cols-2 gap-4">
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">🧠</span>
                      <span className="text-amber-400 font-medium">Main Model (Intent)</span>
                    </div>
                    <div className="text-3xl font-bold text-white mb-1">
                      {selectedResult.mainScore}%
                    </div>
                    <div className="text-gray-400 text-sm">
                      {selectedResult.mainCorrectCount ?? '?'}/{selectedResult.totalTests - (selectedResult.skippedTests || 0) - (selectedResult.timedOutTests || 0)} correct routing decisions
                    </div>
                  </div>
                  <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">🔧</span>
                      <span className="text-orange-400 font-medium">Executor Model (Tools)</span>
                    </div>
                    <div className="text-3xl font-bold text-white mb-1">
                      {selectedResult.executorScore}%
                    </div>
                    <div className="text-gray-400 text-sm">
                      {selectedResult.executorSuccessCount ?? '?'} successful tool executions
                      <span className="text-gray-500 text-xs block">(of tests where Main was correct)</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Category Scores Breakdown */}
              {selectedResult?.tierScores && (
                <div className="mb-6">
                  <h4 className="text-sm font-medium text-gray-400 mb-3">Category Breakdown</h4>
                  <div className="space-y-4">
                    {selectedResult.tierScores.map((tier) => (
                      <div key={tier.tier} className="bg-gray-700/20 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <span className={`text-sm font-medium uppercase ${TIER_COLORS[tier.tier]}`}>
                            {tier.tier} ({tier.tier === 'simple' ? '20%' : tier.tier === 'medium' ? '30%' : '50%'})
                          </span>
                          <span className={`text-lg font-bold ${
                            tier.score >= 80 ? 'text-green-400' :
                            tier.score >= 50 ? 'text-yellow-400' :
                            'text-red-400'
                          }`}>
                            {tier.score}%
                          </span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          {(tier.categories || []).map((cat) => {
                            const label = CATEGORY_LABELS[cat.category];
                            return (
                              <div 
                                key={cat.category}
                                className={`p-2 rounded-lg text-center ${
                                  cat.passed 
                                    ? 'bg-green-500/10 border border-green-500/30' 
                                    : 'bg-red-500/10 border border-red-500/30'
                                }`}
                              >
                                <div className="text-lg mb-1">{label.emoji}</div>
                                <div className="text-xs text-gray-300">{label.name}</div>
                                <div className={`text-sm font-bold ${cat.passed ? 'text-green-400' : 'text-red-400'}`}>
                                  {cat.passed ? '✓ PASS' : '✗ FAIL'}
                                </div>
                                {cat.latencyMs > 0 && (
                                  <div className="text-xs text-gray-500 mt-1">
                                    {(cat.latencyMs / 1000).toFixed(1)}s
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Context Size Results */}
              {contextResults.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-gray-400 mb-3">Context Size Results</h4>
                  <div className="grid grid-cols-4 gap-4">
                    {contextResults.map((cr) => (
                      <div 
                        key={cr.contextSize}
                        className="bg-gray-700/30 rounded-lg p-4 text-center"
                      >
                        <div className="text-gray-400 text-sm mb-1">
                          {cr.contextSize / 1024}K Context
                        </div>
                        <div className={`text-2xl font-bold ${
                          cr.score.overallScore >= 70 ? 'text-green-400' :
                          cr.score.overallScore >= 50 ? 'text-yellow-400' :
                          'text-red-400'
                        }`}>
                          {cr.score.overallScore}%
                        </div>
                        <div className="text-gray-500 text-xs mt-1">
                          {(cr.score.avgLatencyMs / 1000).toFixed(1)}s avg
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </div>
    );
  };

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
          <h1 className="text-3xl font-bold bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
            Combo Testing
          </h1>
          <p className="text-gray-400 mt-2">
            Find the best Main + Executor model pair for dual-model routing
          </p>
        </div>

        {/* Error display */}
        {error && (
          <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-4 mb-6">
            <p className="text-red-400">{error}</p>
            <button 
              onClick={() => setError(null)}
              className="text-red-400/60 text-sm hover:text-red-400 mt-2"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Model Selection */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Main Models */}
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-amber-400">🧠 Main Model Candidates</h2>
              <div className="flex gap-2">
                <button
                  onClick={selectAllMain}
                  className="text-xs text-gray-400 hover:text-white"
                >
                  Select All
                </button>
                <button
                  onClick={() => setSelectedMainModels(new Set())}
                  className="text-xs text-gray-400 hover:text-white"
                >
                  Clear
                </button>
              </div>
            </div>
            
            {isLoadingModels ? (
              <div className="text-center py-8">
                <div className="animate-spin text-2xl mb-2">🔄</div>
                <p className="text-gray-400">Loading models...</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                {models.map((model) => (
                  <label
                    key={model.id}
                    className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                      selectedMainModels.has(model.id)
                        ? 'bg-amber-500/10 border border-amber-500/30'
                        : 'bg-gray-700/30 hover:bg-gray-700/50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedMainModels.has(model.id)}
                      onChange={() => toggleMainModel(model.id)}
                      className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-amber-500 focus:ring-amber-500"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-gray-200 truncate block">
                        {model.displayName || model.id}
                      </span>
                    </div>
                    <span className="text-xs text-gray-500 font-mono whitespace-nowrap">
                      {formatSize(model.sizeBytes)}
                    </span>
                    {model.role === 'main' && (
                      <span className="text-xs text-amber-400/60">main</span>
                    )}
                  </label>
                ))}
              </div>
            )}
            <div className="mt-3 text-sm text-gray-500">
              {selectedMainModels.size} selected • sorted by size ↑
            </div>
          </div>

          {/* Executor Models */}
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-orange-400">🔧 Executor Model Candidates</h2>
              <div className="flex gap-2">
                <button
                  onClick={selectAllExecutor}
                  className="text-xs text-gray-400 hover:text-white"
                >
                  Select All
                </button>
                <button
                  onClick={() => setSelectedExecutorModels(new Set())}
                  className="text-xs text-gray-400 hover:text-white"
                >
                  Clear
                </button>
              </div>
            </div>
            
            {isLoadingModels ? (
              <div className="text-center py-8">
                <div className="animate-spin text-2xl mb-2">🔄</div>
                <p className="text-gray-400">Loading models...</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                {models.map((model) => (
                  <label
                    key={model.id}
                    className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                      selectedExecutorModels.has(model.id)
                        ? 'bg-orange-500/10 border border-orange-500/30'
                        : 'bg-gray-700/30 hover:bg-gray-700/50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedExecutorModels.has(model.id)}
                      onChange={() => toggleExecutorModel(model.id)}
                      className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-orange-500 focus:ring-orange-500"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-gray-200 truncate block">
                        {model.displayName || model.id}
                      </span>
                    </div>
                    <span className="text-xs text-gray-500 font-mono whitespace-nowrap">
                      {formatSize(model.sizeBytes)}
                    </span>
                    {model.role === 'executor' && (
                      <span className="text-xs text-orange-400/60">executor</span>
                    )}
                  </label>
                ))}
              </div>
            )}
            <div className="mt-3 text-sm text-gray-500">
              {selectedExecutorModels.size} selected • sorted by size ↑
            </div>
          </div>
        </div>

        {/* Action Bar */}
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 mb-6 flex items-center justify-between">
          <div className="text-gray-400">
            <span className="text-white font-medium">{totalCombos}</span> combos × 
            <span className="text-white font-medium"> 9</span> tests = 
            <span className="text-white font-medium"> {totalTests}</span> total tests
            {results.length > 0 && !isRunning && (
              <span className="ml-4 text-green-400/60">
                💾 {results.length} saved results
              </span>
            )}
          </div>
          <div className="flex gap-3">
            {results.length > 0 && !isRunning && (
              <button
                onClick={async () => {
                  if (confirm('Clear all saved combo test results?')) {
                    try {
                      await fetch('/api/tooly/combo-test/results', { method: 'DELETE' });
                      setResults([]);
                      setSelectedCombo(null);
                    } catch (err) {
                      console.error('Failed to clear results:', err);
                    }
                  }
                }}
                className="px-4 py-3 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
              >
                🗑️ Clear Results
              </button>
            )}
            <button
              onClick={runAllCombos}
              disabled={isRunning || selectedMainModels.size === 0 || selectedExecutorModels.size === 0}
              className="px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-black font-bold rounded-lg hover:from-amber-400 hover:to-orange-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRunning ? '🔄 Testing...' : '🚀 Test All Combos'}
            </button>
          </div>
        </div>

        {/* Progress */}
        {isRunning && renderProgress()}

        {/* Results */}
        {renderResults()}

        {/* Empty state */}
        {!isRunning && results.length === 0 && (
          <div className="bg-gray-800/30 border border-dashed border-gray-700 rounded-xl p-12 text-center">
            <div className="text-4xl mb-4">🔬</div>
            <h3 className="text-xl font-medium text-gray-300 mb-2">No Results Yet</h3>
            <p className="text-gray-500 max-w-md mx-auto">
              Select Main and Executor model candidates above, then click "Test All Combos" 
              to find the best dual-model pairing for your use case.
            </p>
            <p className="text-gray-600 text-sm mt-3">
              Results are automatically saved and persist between sessions.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ComboTest;

