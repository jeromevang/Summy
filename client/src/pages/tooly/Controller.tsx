/**
 * Controller Page
 * Meta-agent visibility UI for the self-improving system.
 * 
 * Features:
 * - Failure queue with pattern grouping
 * - Controller analysis trigger
 * - Prosthetic review and approval
 * - Real-time failure alerts
 */

import React, { useState, useEffect } from 'react';

// Types
interface FailurePattern {
  id: string;
  name: string;
  description: string;
  category: string;
  count: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  firstSeen: string;
  lastSeen: string;
}

interface FailureEntry {
  id: string;
  timestamp: string;
  modelId: string;
  category: string;
  tool?: string;
  error: string;
  errorType: string;
  context: {
    query: string;
    queryHash: string;
  };
  pattern?: string;
  resolved: boolean;
}

interface FailureAlert {
  id: string;
  type: string;
  severity: string;
  patternName: string;
  message: string;
  timestamp: string;
}

interface ControllerAnalysis {
  diagnosis: string;
  rootCause: string;
  suggestedProsthetic: {
    level: number;
    prompt: string;
    targetCategories: string[];
  };
  testCases: Array<{
    id: string;
    prompt: string;
    expectedTool?: string;
    expectedBehavior: string;
  }>;
  confidence: number;
  priority: string;
}

interface ObserverStatus {
  enabled: boolean;
  running: boolean;
  lastCheck: string;
  alertCount: number;
  patternsTracked: number;
}

interface DashboardSummary {
  unresolvedFailures: number;
  criticalPatterns: number;
  modelsAffected: number;
  recentAlerts: FailureAlert[];
  needsAttention: boolean;
}

const API_BASE = 'http://localhost:3001/api/tooly';

export default function Controller() {
  // State
  const [patterns, setPatterns] = useState<FailurePattern[]>([]);
  const [failures, setFailures] = useState<FailureEntry[]>([]);
  const [alerts, setAlerts] = useState<FailureAlert[]>([]);
  const [observerStatus, setObserverStatus] = useState<ObserverStatus | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [analysis, setAnalysis] = useState<ControllerAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPattern, setSelectedPattern] = useState<string | null>(null);

  // Load data
  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load all data in parallel
      const [statusRes, patternsRes, failuresRes] = await Promise.all([
        fetch(`${API_BASE}/controller/status`),
        fetch(`${API_BASE}/failures/patterns`),
        fetch(`${API_BASE}/failures?resolved=false&limit=50`)
      ]);

      if (statusRes.ok) {
        const data = await statusRes.json();
        setObserverStatus(data.observer);
        setSummary(data.summary);
        setAlerts(data.summary?.recentAlerts || []);
      }

      if (patternsRes.ok) {
        const data = await patternsRes.json();
        setPatterns(data.patterns || []);
      }

      if (failuresRes.ok) {
        const data = await failuresRes.json();
        setFailures(data.failures || []);
      }

      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleObserver = async () => {
    try {
      const endpoint = observerStatus?.running ? 'stop' : 'start';
      const res = await fetch(`${API_BASE}/controller/${endpoint}`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setObserverStatus(data.status);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const runAnalysis = async () => {
    try {
      setAnalyzing(true);
      setAnalysis(null);
      
      const res = await fetch(`${API_BASE}/controller/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      if (res.ok) {
        const data = await res.json();
        setAnalysis(data.analysis);
      } else {
        const data = await res.json();
        setError(data.error || 'Analysis failed');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const applyProsthetic = async (modelId: string) => {
    if (!analysis?.suggestedProsthetic) return;

    try {
      const res = await fetch(`${API_BASE}/controller/apply-prosthetic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId,
          prosthetic: analysis.suggestedProsthetic,
          testFirst: true
        })
      });

      if (res.ok) {
        alert('Prosthetic applied successfully!');
        loadData();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to apply prosthetic');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-400 bg-red-900/30 border-red-500/50';
      case 'high': return 'text-orange-400 bg-orange-900/30 border-orange-500/50';
      case 'medium': return 'text-yellow-400 bg-yellow-900/30 border-yellow-500/50';
      default: return 'text-blue-400 bg-blue-900/30 border-blue-500/50';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'tool': return '🔧';
      case 'rag': return '🔍';
      case 'reasoning': return '🧠';
      case 'intent': return '💭';
      case 'browser': return '🌐';
      default: return '❓';
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            🎮 Controller
            <span className="text-sm font-normal text-gray-400 ml-2">
              Self-Improving System Monitor
            </span>
          </h1>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Observer Status */}
          <div className="flex items-center gap-2 text-sm">
            <span className={`w-2 h-2 rounded-full ${observerStatus?.running ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
            <span className="text-gray-400">Observer</span>
            <button
              onClick={toggleObserver}
              className={`px-3 py-1 rounded text-xs font-medium ${
                observerStatus?.running 
                  ? 'bg-red-900/50 text-red-300 hover:bg-red-900/70' 
                  : 'bg-green-900/50 text-green-300 hover:bg-green-900/70'
              }`}
            >
              {observerStatus?.running ? 'Stop' : 'Start'}
            </button>
          </div>

          {/* Analyze Button */}
          <button
            onClick={runAnalysis}
            disabled={analyzing}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium disabled:opacity-50 flex items-center gap-2"
          >
            {analyzing ? (
              <>
                <span className="animate-spin">⏳</span>
                Analyzing...
              </>
            ) : (
              <>
                <span>🔬</span>
                Analyze Failures
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-4 p-3 bg-red-900/50 border border-red-500/50 rounded-lg text-red-300">
          ⚠️ {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-300">×</button>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <SummaryCard
          title="Unresolved Failures"
          value={summary?.unresolvedFailures || 0}
          icon="🔴"
          color={summary?.unresolvedFailures ? 'text-red-400' : 'text-gray-400'}
        />
        <SummaryCard
          title="Critical Patterns"
          value={summary?.criticalPatterns || 0}
          icon="⚠️"
          color={summary?.criticalPatterns ? 'text-orange-400' : 'text-gray-400'}
        />
        <SummaryCard
          title="Models Affected"
          value={summary?.modelsAffected || 0}
          icon="🤖"
          color="text-blue-400"
        />
        <SummaryCard
          title="Patterns Tracked"
          value={patterns.length}
          icon="📊"
          color="text-purple-400"
        />
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left: Failure Patterns */}
        <div className="col-span-1">
          <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              📋 Failure Patterns
              <span className="text-sm font-normal text-gray-500">({patterns.length})</span>
            </h2>

            {loading ? (
              <div className="text-gray-500 text-center py-8">Loading...</div>
            ) : patterns.length === 0 ? (
              <div className="text-gray-500 text-center py-8">
                ✨ No failure patterns detected
              </div>
            ) : (
              <div className="space-y-2">
                {patterns.map(pattern => (
                  <div
                    key={pattern.id}
                    onClick={() => setSelectedPattern(pattern.id === selectedPattern ? null : pattern.id)}
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                      selectedPattern === pattern.id
                        ? 'border-purple-500 bg-purple-900/20'
                        : 'border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{getCategoryIcon(pattern.category)} {pattern.name}</span>
                      <span className={`px-2 py-0.5 rounded text-xs ${getSeverityColor(pattern.severity)}`}>
                        {pattern.count}
                      </span>
                    </div>
                    {selectedPattern === pattern.id && (
                      <div className="mt-2 text-sm text-gray-400">
                        <p>{pattern.description}</p>
                        <p className="mt-1 text-xs text-gray-500">
                          Last seen: {new Date(pattern.lastSeen).toLocaleString()}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Center: Recent Failures */}
        <div className="col-span-1">
          <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              🔥 Recent Failures
              <span className="text-sm font-normal text-gray-500">({failures.length})</span>
            </h2>

            {failures.length === 0 ? (
              <div className="text-gray-500 text-center py-8">
                ✨ No unresolved failures
              </div>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {failures.slice(0, 20).map(failure => (
                  <div
                    key={failure.id}
                    className="p-3 rounded-lg border border-gray-700 text-sm"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span>{getCategoryIcon(failure.category)}</span>
                      <span className="font-medium text-gray-300">{failure.errorType}</span>
                      <span className="text-xs text-gray-500 ml-auto">
                        {new Date(failure.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-gray-400 text-xs truncate">{failure.error}</p>
                    <p className="text-gray-500 text-xs truncate mt-1">
                      "{failure.context.query.substring(0, 60)}..."
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Analysis & Alerts */}
        <div className="col-span-1 space-y-4">
          {/* Analysis Results */}
          {analysis && (
            <div className="bg-gray-900 rounded-lg border border-purple-500/50 p-4">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                🔬 Analysis Results
                <span className={`ml-auto text-xs px-2 py-1 rounded ${
                  analysis.priority === 'critical' ? 'bg-red-900/50 text-red-300' :
                  analysis.priority === 'high' ? 'bg-orange-900/50 text-orange-300' :
                  'bg-blue-900/50 text-blue-300'
                }`}>
                  {analysis.priority} priority
                </span>
              </h2>

              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-gray-500">Diagnosis:</span>
                  <p className="text-gray-300">{analysis.diagnosis}</p>
                </div>

                <div>
                  <span className="text-gray-500">Root Cause:</span>
                  <p className="text-gray-300">{analysis.rootCause}</p>
                </div>

                <div>
                  <span className="text-gray-500">Confidence:</span>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-2 bg-gray-700 rounded-full">
                      <div 
                        className="h-full bg-purple-500 rounded-full"
                        style={{ width: `${analysis.confidence}%` }}
                      />
                    </div>
                    <span className="text-purple-400">{analysis.confidence}%</span>
                  </div>
                </div>

                {analysis.suggestedProsthetic && (
                  <div className="mt-4 p-3 bg-gray-800 rounded-lg border border-gray-700">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">Suggested Prosthetic (Level {analysis.suggestedProsthetic.level})</span>
                    </div>
                    <p className="text-xs text-gray-400 font-mono bg-gray-900 p-2 rounded max-h-32 overflow-y-auto">
                      {analysis.suggestedProsthetic.prompt.substring(0, 300)}...
                    </p>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => {
                          const modelId = prompt('Enter model ID to apply prosthetic to:');
                          if (modelId) applyProsthetic(modelId);
                        }}
                        className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 rounded text-sm font-medium"
                      >
                        Apply Prosthetic
                      </button>
                    </div>
                  </div>
                )}

                {analysis.testCases && analysis.testCases.length > 0 && (
                  <div className="mt-2">
                    <span className="text-gray-500">Test Cases ({analysis.testCases.length}):</span>
                    <div className="mt-1 space-y-1">
                      {analysis.testCases.map(tc => (
                        <div key={tc.id} className="text-xs p-2 bg-gray-800 rounded">
                          <span className="text-gray-400">{tc.prompt.substring(0, 50)}...</span>
                          {tc.expectedTool && (
                            <span className="ml-2 text-blue-400">→ {tc.expectedTool}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Recent Alerts */}
          <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              🔔 Recent Alerts
              <span className="text-sm font-normal text-gray-500">({alerts.length})</span>
            </h2>

            {alerts.length === 0 ? (
              <div className="text-gray-500 text-center py-4 text-sm">
                No alerts yet
              </div>
            ) : (
              <div className="space-y-2">
                {alerts.map(alert => (
                  <div
                    key={alert.id}
                    className={`p-2 rounded-lg border text-sm ${getSeverityColor(alert.severity)}`}
                  >
                    <div className="font-medium">{alert.patternName}</div>
                    <div className="text-xs opacity-75">{alert.message}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Summary Card Component
function SummaryCard({ title, value, icon, color }: { 
  title: string; 
  value: number; 
  icon: string;
  color: string;
}) {
  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
      <div className="flex items-center gap-3">
        <span className="text-2xl">{icon}</span>
        <div>
          <div className={`text-2xl font-bold ${color}`}>{value}</div>
          <div className="text-sm text-gray-500">{title}</div>
        </div>
      </div>
    </div>
  );
}

