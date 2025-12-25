/**
 * Agentic Readiness Page
 * Test, teach, and certify models for agentic coding capabilities
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ReconnectingWebSocket from 'reconnecting-websocket';

// ============================================================
// TYPES
// ============================================================

interface CategoryScore {
  tool: number;
  rag: number;
  reasoning: number;
  intent: number;
  browser: number;
}

interface TestResult {
  testId: string;
  testName: string;
  category: string;
  passed: boolean;
  score: number;
  details: string;
  latency: number;
}

interface ReadinessResult {
  modelId: string;
  assessedAt: string;
  overallScore: number;
  passed: boolean;
  categoryScores: CategoryScore;
  testResults: TestResult[];
  failedTests: string[];
  duration: number;
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
  score: number;
  certified: boolean;
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
}

interface ReadinessProgress {
  modelId: string;
  current: number;
  total: number;
  currentTest: string;
  status: string;
  score: number;
}

interface BatchProgress {
  currentModel: string | null;
  currentModelIndex: number;
  totalModels: number;
  status: string;
  results: LeaderboardEntry[];
}

type Tab = 'single' | 'batch';

// ============================================================
// CONSTANTS
// ============================================================

const CATEGORIES = [
  { key: 'tool', name: 'Tool Calling', icon: '🔧', weight: '30%' },
  { key: 'rag', name: 'RAG Usage', icon: '📚', weight: '25%' },
  { key: 'reasoning', name: 'Reasoning', icon: '🧠', weight: '20%' },
  { key: 'intent', name: 'Intent Recognition', icon: '🎯', weight: '15%' },
  { key: 'browser', name: 'Browser/Web', icon: '🌐', weight: '10%' },
] as const;

const THRESHOLD = 70;

// ============================================================
// COMPONENT
// ============================================================

export const AgenticReadiness: React.FC = () => {
  const navigate = useNavigate();

  // State
  const [tab, setTab] = useState<Tab>('single');
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [autoTeachRequested, setAutoTeachRequested] = useState(false);
  const [isTeaching, setIsTeaching] = useState(false);

  // Single model assessment
  const [assessmentResult, setAssessmentResult] = useState<ReadinessResult | null>(null);
  const [teachingResult, setTeachingResult] = useState<TeachingResult | null>(null);
  const [savedTeachingResult, setSavedTeachingResult] = useState<TeachingResult | null>(null);
  const [progress, setProgress] = useState<ReadinessProgress | null>(null);

  // Batch assessment
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);

  // Teaching log
  const [teachingLog, setTeachingLog] = useState<string[]>([]);
  const [currentFailedTestsByLevel, setCurrentFailedTestsByLevel] = useState<{ level: number; count: number }[]>([]);

  // WebSocket connection for real-time updates
  useEffect(() => {
    const ws = new ReconnectingWebSocket(`ws://${window.location.hostname}:3001`);

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string);
        console.log('[Readiness] WebSocket message:', message.type, message.payload);

        if (message.type === 'readiness_progress') {
          console.log('[Readiness] RECEIVED readiness_progress:', message.payload.current, '/', message.payload.total, '-', message.payload.currentTest);
          setProgress(message.payload);
          // Let the progress stay visible - user can start new assessment to clear it
        } else if (message.type === 'batch_readiness_progress') {
          setBatchProgress(message.payload);
          if (message.payload.status === 'completed' && message.payload.results) {
            setBatchResult({
              startedAt: '',
              completedAt: new Date().toISOString(),
              leaderboard: message.data.results,
              bestModel: message.data.bestModel
            });
          }
        } else if (message.type === 'teaching_attempt') {
          setIsTeaching(true);
          const { attempt, level, currentScore, failedTestsByLevel } = message.data;
          if (failedTestsByLevel) {
            setCurrentFailedTestsByLevel(failedTestsByLevel);
          } else {
            setCurrentFailedTestsByLevel([]);
          }
          setTeachingLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] Starting teaching attempt ${attempt} at Level ${level} (Current score: ${currentScore}%)`]);
        } else if (message.type === 'teaching_verify') {
          const { attempt } = message.data;
          setTeachingLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] Verifying teaching results for attempt ${attempt}...`]);
        } else if (message.type === 'teaching_complete') {
          setIsTeaching(false);
          setCurrentFailedTestsByLevel([]);
          const { success, finalScore, attempts } = message.data;
          setTeachingLog(prev => [...prev,
            `[${new Date().toLocaleTimeString()}] Teaching ${success ? 'SUCCESSFUL' : 'FAILED'}!`,
            `[${new Date().toLocaleTimeString()}] Final score: ${finalScore}% after ${attempts} attempt${attempts !== 1 ? 's' : ''}`
          ]);
        }
      } catch (e) {
        console.error('[Readiness] WebSocket parse error:', e);
        // Ignore parse errors
      }
    };

    return () => ws.close();
  }, []);

  // Fetch available models
  useEffect(() => {
    fetchModels();
  }, []);

  // Load saved assessment and teaching results when model changes
  useEffect(() => {
    if (selectedModelId) {
      loadModelAssessmentData(selectedModelId);
      loadSavedTeachingResult(selectedModelId);
    } else {
      setAssessmentResult(null);
      setSavedTeachingResult(null);
    }
  }, [selectedModelId]);

  const fetchModels = async () => {
    setIsLoadingModels(true);
    setError(null);
    try {
      const response = await fetch('/api/tooly/models?provider=lmstudio');
      if (!response.ok) throw new Error('Failed to fetch models');
      const data = await response.json();
      setModels(data.models || []);
      setDebugInfo(`Found ${data.models?.length || 0} models. Providers: ${Object.entries(data.providers || {}).map(([k, v]) => `${k}:${v}`).join(', ')}`);
      if (data.models?.length > 0 && !selectedModelId) {
        setSelectedModelId(data.models[0].id);
      }
    } catch (err: any) {
      setError(err.message);
      setDebugInfo(`Error: ${err.message}`);
    } finally {
      setIsLoadingModels(false);
    }
  };

  // Load saved teaching results for a model
  const loadSavedTeachingResult = async (modelId: string) => {
    try {
      const response = await fetch(`/api/tooly/readiness/${encodeURIComponent(modelId)}/teaching-result`);
      if (response.ok) {
        const teachingResult = await response.json();
        setSavedTeachingResult(teachingResult);
      } else {
        setSavedTeachingResult(null);
      }
    } catch (err) {
      console.warn('Failed to load saved teaching result:', err);
      setSavedTeachingResult(null);
    }
  };

  const loadModelAssessmentData = async (modelId: string) => {
    try {
      const response = await fetch(`/api/tooly/models/${encodeURIComponent(modelId)}`);
      if (response.ok) {
        const profile = await response.json();
        if (profile.agenticReadiness) {
          // Create a partial ReadinessResult from the stored data
          const assessmentResult: ReadinessResult = {
            modelId,
            assessedAt: profile.agenticReadiness.assessedAt || new Date().toISOString(),
            overallScore: profile.agenticReadiness.score,
            passed: profile.agenticReadiness.certified,
            categoryScores: profile.agenticReadiness.categoryScores,
            testResults: [], // We don't store individual test results, only summary
            failedTests: [], // We don't store this either
            duration: 0, // Not stored
            trainabilityScores: profile.trainabilityScores // Include if available
          };
          setAssessmentResult(assessmentResult);
        } else {
          setAssessmentResult(null);
        }
      } else {
        setAssessmentResult(null);
      }
    } catch (err) {
      console.warn('Failed to load model assessment data:', err);
      setAssessmentResult(null);
    }
  };

  // Run single model assessment
  const runAssessment = async (autoTeach = false) => {
    if (!selectedModelId) {
      setError('Please select a model first');
      return;
    }

    // Check if the selected model exists in our models list
    const modelExists = models.some(m => m.id === selectedModelId);
    if (!modelExists) {
      setError(`Model "${selectedModelId}" not found in available models. Please refresh the model list.`);
      return;
    }

    console.log('[Readiness] Starting assessment for model:', selectedModelId, 'autoTeach:', autoTeach);

    setIsLoading(true);
    setError(null);
    setAssessmentResult(null);
    setTeachingResult(null);
    setProgress(null); // Clear previous progress
    setTeachingLog([]);
    setAutoTeachRequested(autoTeach);
    setIsTeaching(false);

    // Ensure the "Starting Assessment..." message shows for at least 1 second
    await new Promise(resolve => setTimeout(resolve, 1000));

    try {
      const response = await fetch('/api/tooly/readiness/assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId: selectedModelId, autoTeach })
      });

      if (!response.ok) throw new Error('Assessment failed');
      const data = await response.json();

      // Always show assessment results first
      setAssessmentResult(data.assessment);

      // If auto-teach was requested and teaching happened, show those results too
      if (data.teaching) {
        setTeachingResult(data.teaching);
        setTeachingLog(data.teaching.log || []);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
      setAutoTeachRequested(false);
      // Let WebSocket messages handle progress clearing naturally
    }
  };

  // Run teaching cycle
  const runTeaching = async () => {
    if (!selectedModelId) return;

    setIsLoading(true);
    setError(null);
    setTeachingResult(null);
    setTeachingLog([]);

    try {
      const response = await fetch(`/api/tooly/readiness/${selectedModelId}/teach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxAttempts: 3, startLevel: 1 })
      });

      if (!response.ok) throw new Error('Teaching failed');
      const data = await response.json();

      setTeachingResult(data);
      setTeachingLog(data.log || []);

      // Refresh assessment after teaching
      if (data.certified) {
        const assessResponse = await fetch('/api/tooly/readiness/assess', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ modelId: selectedModelId, autoTeach: false })
        });
        const assessData = await assessResponse.json();
        setAssessmentResult(assessData.assessment);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Delete model profile
  const deleteProfile = async () => {
    if (!selectedModelId) return;

    if (!confirm(`Are you sure you want to delete the profile for "${selectedModelId}"? This will remove all saved assessment data and prosthetics.`)) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/tooly/models/${encodeURIComponent(selectedModelId)}/profile`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Failed to delete profile');

      // Refresh models list
      await loadModels();

      // Clear current selection if it was deleted
      if (selectedModelId) {
        const modelStillExists = models.some(m => m.id === selectedModelId);
        if (!modelStillExists) {
          setSelectedModelId(null);
          setAssessmentResult(null);
          setTeachingResult(null);
          setSavedTeachingResult(null);
        }
      }

      alert('Profile deleted successfully');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Run batch assessment
  const runBatchAssessment = async () => {
    setIsLoading(true);
    setError(null);
    setBatchResult(null);
    setBatchProgress(null);

    try {
      const response = await fetch('/api/tooly/readiness/assess-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) throw new Error('Batch assessment failed');
      const data = await response.json();

      setBatchResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
      setBatchProgress(null);
    }
  };

  // Certify model
  const certifyModel = async () => {
    if (!selectedModelId || !assessmentResult) return;

    try {
      const response = await fetch(`/api/tooly/readiness/${selectedModelId}/certify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          score: assessmentResult.overallScore,
          categoryScores: assessmentResult.categoryScores
        })
      });

      if (!response.ok) throw new Error('Certification failed');
      
      // Update local state
      setAssessmentResult(prev => prev ? { ...prev, passed: true } : null);
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Render progress bar
  const renderProgressBar = (score: number, threshold = THRESHOLD) => {
    const passed = score >= threshold;
    const percentage = Math.min(score, 100);

    return (
      <div className="relative h-3 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`absolute h-full transition-all duration-500 ${
            passed ? 'bg-green-500' : score >= threshold * 0.8 ? 'bg-yellow-500' : 'bg-red-500'
          }`}
          style={{ width: `${percentage}%` }}
        />
        <div
          className="absolute h-full w-0.5 bg-white/50"
          style={{ left: `${threshold}%` }}
        />
      </div>
    );
  };

  // Render category score row
  const renderCategoryRow = (category: typeof CATEGORIES[number], score: number, testsInCategory?: TestResult[]) => {
    const passed = score >= THRESHOLD;
    const passedCount = testsInCategory?.filter(t => t.passed).length ?? 0;
    const totalCount = testsInCategory?.length ?? 0;

    return (
      <div key={category.key} className="flex items-center gap-4 py-3 border-b border-gray-700/50">
        <span className="text-xl">{category.icon}</span>
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <span className="font-medium text-gray-200">{category.name}</span>
            <span className={`text-sm font-mono ${passed ? 'text-green-400' : 'text-gray-400'}`}>
              {score}%
              {totalCount > 0 && <span className="text-gray-500 ml-2">({passedCount}/{totalCount})</span>}
            </span>
          </div>
          {renderProgressBar(score)}
        </div>
        <span className={`px-2 py-0.5 rounded text-xs font-bold ${
          passed ? 'bg-green-500/20 text-green-400' : 'bg-gray-600/30 text-gray-400'
        }`}>
          {passed ? 'PASS' : 'FAIL'}
        </span>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white p-6">
      {/* Header */}
      <div className="max-w-6xl mx-auto">
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
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setTab('single')}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              tab === 'single'
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            Single Model
          </button>
          <button
            onClick={() => setTab('batch')}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              tab === 'batch'
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            Test All Models
          </button>
        </div>

        {/* Tab Content */}
        <>
          {/* Error display */}
          {error && (
            <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-4 mb-6">
              <p className="text-red-400">{error}</p>
            </div>
          )}

          {/* Single Model Tab */}
        {tab === 'single' && (
          <div className="space-y-6">
            {/* Model Selector */}
            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Select Model {isLoadingModels && <span className="text-cyan-400">(Loading...)</span>}
              </label>
              {isLoadingModels ? (
                <div className="text-center py-8">
                  <div className="animate-spin text-4xl mb-4">🔄</div>
                  <p className="text-gray-400">Loading models...</p>
                </div>
              ) : models.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-4xl mb-4">🤖</div>
                  <h3 className="text-lg font-medium text-gray-300 mb-2">No Models Found</h3>
                  <p className="text-gray-400 text-sm mb-4">
                    Make sure LM Studio is running and has models loaded.
                  </p>
                  <div className="text-xs text-gray-500 mb-4 font-mono">
                    Debug: {debugInfo}
                  </div>
                  <button
                    onClick={fetchModels}
                    className="px-4 py-2 bg-cyan-500 text-black font-medium rounded-lg hover:bg-cyan-400 transition-colors"
                  >
                    Refresh Models
                  </button>
                </div>
              ) : (
                <select
                  value={selectedModelId}
                  onChange={(e) => {
                    setSelectedModelId(e.target.value);
                    // Don't clear assessment/teaching results here - they will be loaded by useEffect
                  }}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-cyan-500"
                  disabled={isLoading}
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.displayName || m.id}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Initial loading message */}
            {isLoading && !progress && (
              <div className="bg-gray-800/50 border border-cyan-500/30 rounded-xl p-6">
                <div className="flex items-center gap-4">
                  <div className="animate-spin w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full"></div>
                  <div>
                    <div className="text-cyan-400 font-medium">Starting Assessment...</div>
                    <div className="text-gray-400 text-sm">Connecting to LM Studio and initializing tests</div>
                  </div>
                </div>
              </div>
            )}

            {/* Progress indicator */}
            {progress && (
              <div className="bg-gray-800/50 border border-cyan-500/30 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <span className="text-cyan-400 font-medium text-lg">
                      {progress.status === 'completed' ? '✅ Assessment Complete' : '🔬 Running Assessment'}
                    </span>
                    <div className="text-gray-400 text-sm mt-1">
                      {progress.status === 'completed'
                        ? 'All 20 agentic tasks completed successfully'
                        : 'Testing model capabilities against 20 agentic tasks'
                      }
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-white text-2xl font-bold">{progress.current}</span>
                    <span className="text-gray-400">/{progress.total}</span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mb-4">
                  <div className="h-3 bg-gray-700 rounded-full overflow-hidden mb-2">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-500"
                      style={{ width: `${(progress.current / progress.total) * 100}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">
                      {Math.round((progress.current / progress.total) * 100)}% complete
                    </span>
                    <span className="text-cyan-400">
                      {progress.score}% current score
                    </span>
                  </div>
                </div>

                {/* Current test */}
                <div className="bg-gray-700/30 rounded-lg p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`w-2 h-2 rounded-full ${progress.status === 'completed' ? 'bg-green-400' : 'bg-cyan-400 animate-pulse'}`}></div>
                    <span className="text-white font-medium">
                      {progress.status === 'completed' ? 'Final Result:' : 'Currently Testing:'}
                    </span>
                  </div>
                  <p className="text-cyan-300 text-lg">{progress.currentTest}</p>
                  <p className="text-gray-400 text-sm mt-1">
                    {progress.status === 'completed'
                      ? `Assessment completed with a score of ${progress.score}%`
                      : 'This test evaluates the model\'s ability to perform agentic coding tasks'
                    }
                  </p>
                </div>

                {/* Auto-teach notice */}
                {autoTeachRequested && progress.status === 'completed' && (
                  <div className="mt-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-yellow-400">
                      <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
                      <span className="text-sm font-medium">Assessment complete - Auto-teaching will start if score &lt; 70%</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Teaching Progress */}
            {(isTeaching || teachingLog.length > 0 || teachingResult || savedTeachingResult) && (
              <div className="bg-gray-800/50 border border-yellow-500/30 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <span className="text-yellow-400 font-medium text-lg">🧠 Auto-Teaching</span>
                    <div className="text-gray-400 text-sm mt-1">
                      {isTeaching ? 'Teaching in progress...' :
                       teachingResult ? 'Teaching completed' :
                       savedTeachingResult ? 'Previous teaching results loaded' :
                       'Ready to teach'}
                    </div>
                  </div>
                  {isTeaching && (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-yellow-400">Teaching in progress...</span>
                    </div>
                  )}
                </div>

                {/* Teaching log */}
                {teachingLog.length > 0 && (
                  <div className="bg-gray-900/50 rounded-lg p-4 max-h-48 overflow-y-auto">
                    <div className="space-y-2">
                      {teachingLog.slice(-10).map((log, i) => (
                        <div key={i} className="text-gray-300 text-sm font-mono">
                          {log}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Assessment Results */}
            {assessmentResult && (
              <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-bold text-white">Assessment Results</h2>
                    <p className="text-gray-400 text-sm">
                      Completed in {(assessmentResult.duration / 1000).toFixed(1)}s
                    </p>
                  </div>
                  <div className="text-right">
                    <div className={`text-4xl font-bold ${
                      assessmentResult.overallScore >= THRESHOLD ? 'text-green-400' : 'text-yellow-400'
                    }`}>
                      {assessmentResult.overallScore}%
                    </div>
                    <div className={`text-sm font-medium ${
                      assessmentResult.passed ? 'text-green-400' : 'text-gray-400'
                    }`}>
                      {assessmentResult.passed ? '✓ CERTIFIED' : `Threshold: ${THRESHOLD}%`}
                    </div>
                  </div>
                </div>

                {/* Category Scores */}
                <div className="space-y-1">
                  {CATEGORIES.map((cat) => {
                    const categoryTests = assessmentResult.testResults.filter(t => t.category === cat.key);
                    return renderCategoryRow(
                      cat,
                      assessmentResult.categoryScores[cat.key as keyof CategoryScore],
                      categoryTests
                    );
                  })}
                </div>

                {/* Trainability Scores */}
                {assessmentResult.trainabilityScores ? (
                  <div className="mt-6 bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/30 rounded-xl p-6">
                    <h3 className="text-xl font-semibold text-purple-400 mb-4 flex items-center">
                      🧠 Learnability Analysis
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-gray-800/50 rounded-lg p-4 text-center">
                        <div className="text-sm text-gray-400 mb-1">Overall Trainability</div>
                        <div className={`text-2xl font-bold ${
                          assessmentResult.trainabilityScores.overallTrainability >= 80 ? 'text-green-400' :
                          assessmentResult.trainabilityScores.overallTrainability >= 50 ? 'text-yellow-400' :
                          'text-red-400'
                        }`}>
                          {assessmentResult.trainabilityScores.overallTrainability}%
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {assessmentResult.trainabilityScores.overallTrainability >= 80 ? 'Highly Trainable' :
                           assessmentResult.trainabilityScores.overallTrainability >= 50 ? 'Moderately Trainable' :
                           'Low Trainability'}
                        </div>
                      </div>
                      <div className="bg-gray-800/50 rounded-lg p-4 text-center">
                        <div className="text-sm text-gray-400 mb-1">Prompt Compliance</div>
                        <div className="text-xl font-bold text-blue-400">
                          {assessmentResult.trainabilityScores.systemPromptCompliance}/20
                        </div>
                      </div>
                      <div className="bg-gray-800/50 rounded-lg p-4 text-center">
                        <div className="text-sm text-gray-400 mb-1">Instruction Persistence</div>
                        <div className="text-xl font-bold text-blue-400">
                          {assessmentResult.trainabilityScores.instructionPersistence}/20
                        </div>
                      </div>
                      <div className="bg-gray-800/50 rounded-lg p-4 text-center">
                        <div className="text-sm text-gray-400 mb-1">Correction Acceptance</div>
                        <div className="text-xl font-bold text-blue-400">
                          {assessmentResult.trainabilityScores.correctionAcceptance}/100
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-6 bg-gradient-to-r from-gray-500/10 to-gray-600/10 border border-gray-500/30 rounded-xl p-6">
                    <h3 className="text-xl font-semibold text-gray-400 mb-4 flex items-center">
                      🧠 Learnability Analysis - Not Available
                    </h3>
                    <div className="text-gray-300 mb-3">
                      This model hasn't been through the full test suite to calculate learnability scores.
                    </div>
                    <div className="text-sm text-gray-400">
                      Learnability scores require running the comprehensive test suite, not just readiness assessments.
                      The scores measure how well the model can be improved through prompt engineering and training.
                    </div>
                  </div>
                )}

                {/* Failed Tests */}
                {assessmentResult.failedTests.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-sm font-medium text-gray-400 mb-2">
                      Failed Tests ({assessmentResult.failedTests.length})
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {assessmentResult.testResults
                        .filter(t => !t.passed)
                        .map(t => (
                          <span
                            key={t.testId}
                            className="px-2 py-1 bg-red-500/20 text-red-400 rounded text-xs"
                            title={t.details}
                          >
                            {t.testId}: {t.testName}
                          </span>
                        ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 mt-6">
                  {!assessmentResult.passed && (
                    <button
                      onClick={runTeaching}
                      disabled={isLoading}
                      className="px-4 py-2 bg-yellow-500/20 text-yellow-400 rounded-lg font-medium hover:bg-yellow-500/30 transition-colors disabled:opacity-50"
                    >
                      🔧 Auto-Teach Gaps
                    </button>
                  )}
                  {assessmentResult.overallScore >= THRESHOLD && !assessmentResult.passed && (
                    <button
                      onClick={certifyModel}
                      disabled={isLoading}
                      className="px-4 py-2 bg-green-500/20 text-green-400 rounded-lg font-medium hover:bg-green-500/30 transition-colors disabled:opacity-50"
                    >
                      ✓ Certify Model
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Teaching Result */}
            {(teachingResult || savedTeachingResult) && (() => {
              const result = teachingResult || savedTeachingResult;
              return (
                <div className={`border rounded-xl p-6 ${
                  result.certified
                    ? 'bg-green-500/10 border-green-500/30'
                    : 'bg-yellow-500/10 border-yellow-500/30'
                }`}>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold">
                      {result.certified ? '✓ Teaching Successful' : '⚠️ Teaching Incomplete'}
                      {savedTeachingResult && !teachingResult && <span className="text-xs text-gray-400 ml-2">(Saved)</span>}
                    </h2>
                    <div className="flex items-center gap-2">
                      {isTeaching && (
                        <button
                          onClick={() => {
                            setIsTeaching(false);
                            setTeachingLog(prev => [...prev, '[CANCELLED] Teaching cancelled by user']);
                          }}
                          className="px-3 py-1 bg-red-500/20 text-red-400 rounded text-sm hover:bg-red-500/30"
                        >
                          Cancel
                        </button>
                      )}
                      {savedTeachingResult && !teachingResult && (
                        <button
                          onClick={async () => {
                            try {
                              await fetch(`/api/tooly/readiness/${encodeURIComponent(selectedModelId)}/teaching-result`, {
                                method: 'DELETE'
                              });
                              setSavedTeachingResult(null);
                            } catch (err) {
                              console.warn('Failed to clear saved teaching result:', err);
                            }
                          }}
                          className="px-3 py-1 bg-gray-500/20 text-gray-400 rounded text-sm hover:bg-gray-500/30"
                        >
                          Clear Saved
                        </button>
                      )}
                      <span className="text-gray-400">
                        {result.attempts} attempt{result.attempts !== 1 ? 's' : ''} · Level {result.finalLevel}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <div className="text-gray-400 text-sm">Starting Score</div>
                      <div className="text-2xl font-bold text-gray-300">{result.startingScore}%</div>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <div className="text-gray-400 text-sm">Final Score</div>
                      <div className={`text-2xl font-bold ${
                        result.finalScore >= THRESHOLD ? 'text-green-400' : 'text-yellow-400'
                      }`}>
                        {result.finalScore}%
                      </div>
                    </div>
                  </div>

                  {/* Failed Tests by Level */}
                  {(result.failedTestsByLevel && result.failedTestsByLevel.length > 0) || (isTeaching && currentFailedTestsByLevel.length > 0) ? (() => {
                    const levelData = isTeaching && currentFailedTestsByLevel.length > 0 ? currentFailedTestsByLevel : result.failedTestsByLevel;
                    return (
                      <div className="mb-4">
                        <div className="text-sm text-gray-400 mb-2">Learning Progress {isTeaching && '(Live)'}</div>
                        <div className="flex flex-wrap gap-2">
                          {levelData.map((levelItem, index) => {
                            const prevCount = index > 0 ? levelData[index - 1].count : levelItem.count;
                            const learned = levelItem.count < prevCount;
                            return (
                              <div
                                key={levelItem.level}
                                className={`px-3 py-2 rounded-lg text-sm font-medium ${
                                  learned
                                    ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                    : 'bg-gray-700/50 text-gray-300'
                                }`}
                              >
                                Failed Tests ({levelItem.count}) LVL {levelItem.level}
                                {learned && <span className="ml-1">📈</span>}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })() : null}

                  {result.probesFixed.length > 0 && (
                    <div className="mb-4">
                      <div className="text-sm text-gray-400 mb-1">Probes Fixed</div>
                      <div className="flex flex-wrap gap-1">
                        {result.probesFixed.map(id => (
                          <span key={id} className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded text-xs">
                            {id}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                {/* Teaching Log */}
                  {teachingLog.length > 0 && (
                    <details className="mt-4">
                      <summary className="cursor-pointer text-gray-400 text-sm hover:text-white">
                        View Teaching Log ({teachingLog.length} entries)
                      </summary>
                      <div className="mt-2 bg-gray-900 rounded-lg p-3 max-h-48 overflow-y-auto font-mono text-xs">
                        {teachingLog.map((log, i) => (
                          <div key={i} className="text-gray-400">{log}</div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              );
            })()}
            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => runAssessment(false)}
                disabled={isLoading || !selectedModelId}
                className="px-6 py-3 bg-cyan-500 text-black font-bold rounded-lg hover:bg-cyan-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading && progress ? 'Running...' : 'Run Assessment'}
              </button>
              <button
                onClick={() => runAssessment(true)}
                disabled={isLoading || !selectedModelId}
                className="px-6 py-3 bg-gray-700 text-white font-medium rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-50"
              >
                Assess + Auto-Teach
              </button>
              <button
                onClick={deleteProfile}
                disabled={isLoading || !selectedModelId}
                className="px-6 py-3 bg-red-600 text-white font-medium rounded-lg hover:bg-red-500 transition-colors disabled:opacity-50"
              >
                Delete Profile
              </button>
            </div>
          </div>
        )}

          {/* Batch Tab */}
        {tab === 'batch' && (
          <div className="space-y-6">
            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
              <h2 className="text-xl font-bold text-white mb-2">Test All Models</h2>
              <p className="text-gray-400 mb-4">
                Run the Agentic Readiness assessment on all available models to find the best one.
              </p>

              {/* No models warning */}
              {isLoadingModels ? (
                <div className="text-center py-4">
                  <div className="animate-spin text-2xl mb-2">🔄</div>
                  <p className="text-gray-400">Loading models...</p>
                </div>
              ) : models.length === 0 ? (
                <div className="text-center py-4">
                  <div className="text-red-400 mb-2">No models available for batch testing</div>
                  <button
                    onClick={fetchModels}
                    className="px-4 py-2 bg-cyan-500 text-black font-medium rounded hover:bg-cyan-400"
                  >
                    Refresh Models
                  </button>
                </div>
              ) : (
                <>
                  {/* Batch Progress */}
                  {batchProgress && batchProgress.status === 'running' && (
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-cyan-400">
                          Testing: {batchProgress.currentModel || 'Starting...'}
                        </span>
                        <span className="text-gray-400">
                          {batchProgress.currentModelIndex}/{batchProgress.totalModels}
                        </span>
                      </div>
                      <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-cyan-500 transition-all duration-300"
                          style={{ width: `${(batchProgress.currentModelIndex / batchProgress.totalModels) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <button
                    onClick={runBatchAssessment}
                    disabled={isLoading}
                    className="px-6 py-3 bg-cyan-500 text-black font-bold rounded-lg hover:bg-cyan-400 transition-colors disabled:opacity-50"
                  >
                    {isLoading ? 'Testing...' : `Test All ${models.length} Models`}
                  </button>
                </>
              )}
            </div>

            {/* Leaderboard */}
            {batchResult && (
              <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
                <h2 className="text-xl font-bold text-white mb-4">Leaderboard</h2>

                {batchResult.bestModel && (
                  <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 mb-4">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">🏆</span>
                      <div>
                        <div className="text-green-400 font-bold">Best Model</div>
                        <div className="text-white">{batchResult.bestModel}</div>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedModelId(batchResult.bestModel!);
                          setTab('single');
                        }}
                        className="ml-auto px-3 py-1 bg-green-500/20 text-green-400 rounded hover:bg-green-500/30"
                      >
                        View Details
                      </button>
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
                      </div>
                      <div className="flex items-center gap-3">
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
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        </>
      </div>
    </div>
  );
};

export default AgenticReadiness;

