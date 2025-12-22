/**
 * Model Detail Page
 * Full-width dedicated page for model testing, analytics, configuration, and history
 * 
 * Tabs:
 * 1. Overview - Scores, badges, recommendations, failure profile
 * 2. Testing - Run tests, live progress, categorized results
 * 3. Capabilities - Detailed probe results by category
 * 4. Configuration - Tools, context budget, system prompt, RAG settings
 * 5. History - Previous test runs, score trends
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReconnectingWebSocket from 'reconnecting-websocket';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, AreaChart, Area, ReferenceLine } from 'recharts';

// Tab components
import { OverviewTab } from './components/detail/OverviewTab';
import { TestingTab } from './components/detail/TestingTab';
import { CapabilitiesTab } from './components/detail/CapabilitiesTab';
import { ConfigurationTab } from './components/detail/ConfigurationTab';
import { HistoryTab } from './components/detail/HistoryTab';

// Shared components
import SkillRadar from '../../components/SkillRadar';
import ScoreRing from '../../components/ScoreRing';

// ============================================================
// TYPES
// ============================================================

interface SystemMetrics {
  cpu: number;
  gpu: number;
  vramUsedMB?: number;
  vramTotalMB?: number;
  vramPercent?: number;
  gpuName?: string;
  gpuTemp?: number;
  // System RAM
  ramUsedGB?: number;
  ramTotalGB?: number;
  ramPercent?: number;
}

interface ModelProfile {
  modelId: string;
  displayName: string;
  provider: 'lmstudio' | 'openai' | 'azure';
  testedAt: string;
  score: number;
  role?: 'main' | 'executor' | 'both' | 'none';
  scoreBreakdown?: Record<string, number>;
  modelInfo?: Record<string, any>;
  probeResults?: Record<string, any>;
  capabilities?: Record<string, any>;
  contextLatency?: Record<string, any>;
  badges?: Array<{ id: string; name: string; icon: string }>;
  recommendations?: Array<{ type: string; message: string; priority: string }>;
  failureProfile?: Record<string, any>;
  trainabilityScores?: Record<string, number>;
  optimalSettings?: Record<string, any>;
}

interface TestProgress {
  isRunning: boolean;
  currentTest?: string;
  currentCategory?: string;
  progress?: { current: number; total: number };
  status?: string;
  eta?: number;
}

type TabId = 'overview' | 'testing' | 'capabilities' | 'configuration' | 'history';

// ============================================================
// MAIN COMPONENT
// ============================================================

export const ModelDetailPage: React.FC = () => {
  const { modelId } = useParams<{ modelId: string }>();
  const navigate = useNavigate();
  const decodedModelId = modelId ? decodeURIComponent(modelId) : '';

  // Pre-flight error state
  interface PreflightError {
    aborted: boolean;
    abortReason?: 'MODEL_TOO_SLOW' | 'USER_CANCELLED' | 'ERROR';
    preflightLatency?: number;
    preflightMessage?: string;
  }

  // State
  const [profile, setProfile] = useState<ModelProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics | null>(null);
  const [testProgress, setTestProgress] = useState<TestProgress>({ isRunning: false });
  const [metricsHistory, setMetricsHistory] = useState<SystemMetrics[]>([]);
  const [preflightError, setPreflightError] = useState<PreflightError | null>(null);

  // WebSocket for real-time updates
  useEffect(() => {
    const wsUrl = `ws://${window.location.hostname}:3001/ws`;
    const ws = new ReconnectingWebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const payload = msg.payload || msg.data; // Support both formats
        
        if (msg.type === 'system_metrics') {
          setSystemMetrics(payload);
          setMetricsHistory(prev => [...prev.slice(-60), payload]);
        } else if (msg.type === 'test_progress' && payload?.modelId === decodedModelId) {
          // Handle progress - can be { current, total } or just numbers
          const progress = payload.progress || { current: payload.current, total: payload.total };
          
          setTestProgress({
            isRunning: payload.status !== 'completed' && payload.status !== 'cancelled',
            currentTest: payload.currentTest,
            currentCategory: payload.category || payload.currentCategory,
            progress: progress,
            status: payload.status
          });
          
          // If completed or cancelled, refresh profile
          if (payload.status === 'completed') {
            fetchProfile();
          }
        } else if (msg.type === 'test_complete' && payload?.modelId === decodedModelId) {
          setTestProgress({ isRunning: false });
          // Refresh profile after test completes
          fetchProfile();
        }
      } catch (err) {
        // Ignore parse errors
      }
    };

    return () => ws.close();
  }, [decodedModelId]);

  // Fetch model profile
  const fetchProfile = useCallback(async () => {
    if (!decodedModelId) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/tooly/models/${encodeURIComponent(decodedModelId)}`);
      if (!response.ok) throw new Error('Failed to fetch model');
      
      const data = await response.json();
      setProfile(data.profile || data);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [decodedModelId]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // Auto-switch to testing tab when test starts
  useEffect(() => {
    if (testProgress.isRunning && activeTab !== 'testing') {
      setActiveTab('testing');
    }
  }, [testProgress.isRunning]);

  // Actions
  const handleRunTests = async (mode: 'quick' | 'standard' | 'deep' | 'optimization' | string = 'standard', skipPreflight: boolean = false) => {
    if (!decodedModelId) return;
    
    // Clear any previous pre-flight error
    setPreflightError(null);
    
    try {
      setTestProgress({ isRunning: true, status: 'Starting...' });
      setActiveTab('testing');
      
      const url = new URL(`/api/tooly/models/${encodeURIComponent(decodedModelId)}/test`, window.location.origin);
      url.searchParams.set('mode', mode);
      if (skipPreflight) {
        url.searchParams.set('skipPreflight', 'true');
      }
      
      const response = await fetch(url.toString(), { method: 'POST' });
      
      if (!response.ok) throw new Error('Failed to start tests');
      
      // Check the response for pre-flight abort
      const result = await response.json();
      
      if (result.aborted && result.abortReason === 'MODEL_TOO_SLOW') {
        // Model was too slow - show pre-flight error
        setPreflightError({
          aborted: true,
          abortReason: result.abortReason,
          preflightLatency: result.preflightLatency,
          preflightMessage: result.preflightMessage
        });
        setTestProgress({ isRunning: false });
      } else {
        // Tests ran normally - refresh profile to get results
        fetchProfile();
        setTestProgress({ isRunning: false });
      }
    } catch (err: any) {
      setError(err.message);
      setTestProgress({ isRunning: false });
    }
  };

  const handleCancelTests = async () => {
    if (!decodedModelId) return;
    
    try {
      await fetch(`/api/tooly/models/${encodeURIComponent(decodedModelId)}/test`, {
        method: 'DELETE'
      });
      setTestProgress({ isRunning: false });
    } catch (err) {
      // Ignore
    }
  };

  const handleClearResults = async () => {
    if (!decodedModelId || testProgress.isRunning) return;
    
    if (!confirm('Clear all test results for this model? This cannot be undone.')) {
      return;
    }
    
    try {
      const response = await fetch(
        `/api/tooly/models/${encodeURIComponent(decodedModelId)}/results`,
        { method: 'DELETE' }
      );
      
      if (response.ok) {
        // Refresh profile to show cleared state
        fetchProfile();
      }
    } catch (err) {
      console.error('Failed to clear results:', err);
    }
  };

  const handleSetAsMain = async () => {
    if (!decodedModelId || testProgress.isRunning) return;
    
    try {
      await fetch('/api/tooly/active-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId: decodedModelId, role: 'main' })
      });
      fetchProfile();
    } catch (err) {
      // Ignore
    }
  };

  const handleSetAsExecutor = async () => {
    if (!decodedModelId || testProgress.isRunning) return;
    
    try {
      await fetch('/api/tooly/active-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId: decodedModelId, role: 'executor' })
      });
      fetchProfile();
    } catch (err) {
      // Ignore
    }
  };

  // Radar data - SkillRadar expects { skill, score } format
  // Build radar with all available scores
  const radarData = profile?.scoreBreakdown ? [
    { skill: 'Tools', score: profile.scoreBreakdown.toolScore ?? 0 },
    { skill: 'RAG', score: profile.scoreBreakdown.ragScore ?? 0 },
    { skill: 'Failures', score: profile.scoreBreakdown.failureModesScore ?? 0 },
    { skill: 'Stateful', score: profile.scoreBreakdown.statefulScore ?? 0 },
    { skill: 'Precedence', score: profile.scoreBreakdown.precedenceScore ?? 0 },
    { skill: 'Compliance', score: profile.scoreBreakdown.complianceScore ?? 0 },
  ].filter(d => d.score > 0 || profile.scoreBreakdown?.toolScore) : [];

  // Tab configuration
  const tabs: Array<{ id: TabId; label: string; icon: string }> = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'testing', label: 'Testing', icon: '🧪' },
    { id: 'capabilities', label: 'Capabilities', icon: '⚡' },
    { id: 'configuration', label: 'Configuration', icon: '⚙️' },
    { id: 'history', label: 'History', icon: '📈' }
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">⚙️</div>
          <p className="text-gray-400">Loading model...</p>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="text-4xl mb-4">❌</div>
          <p className="text-red-400">{error || 'Model not found'}</p>
          <button
            onClick={() => navigate('/tooly')}
            className="mt-4 px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-500"
          >
            ← Back to Model Hub
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f]">
      {/* Sticky Header with Metrics */}
      <div className="sticky top-0 z-50 bg-[#0f0f0f]/95 backdrop-blur border-b border-[#2d2d2d]">
        <div className="px-6 py-3">
          <div className="flex items-center justify-between">
            {/* Left: Back + Model Name */}
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/tooly')}
                className="text-gray-400 hover:text-white transition-colors"
              >
                ← Back
              </button>
              <div>
                <h1 className="text-xl font-bold text-white">{profile.displayName}</h1>
                <div className="flex items-center gap-2">
                  {profile.role && profile.role !== 'none' && (
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      profile.role === 'main' ? 'bg-purple-500/20 text-purple-400' :
                      profile.role === 'executor' ? 'bg-cyan-500/20 text-cyan-400' :
                      'bg-green-500/20 text-green-400'
                    }`}>
                      {profile.role === 'main' ? '🎯 Main' : 
                       profile.role === 'executor' ? '⚡ Executor' : '✨ Both'}
                    </span>
                  )}
                  <span className="text-gray-500 text-sm">
                    Score: {profile.score}%
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Actions (metrics are now in hero section below) */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleSetAsMain}
                disabled={testProgress.isRunning}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors
                  ${testProgress.isRunning 
                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed' 
                    : 'bg-purple-600/20 text-purple-400 hover:bg-purple-600/30'}`}
                title={testProgress.isRunning ? 'Cannot change while test is running' : 'Set as Main'}
              >
                🎯 Main
              </button>
              <button
                onClick={handleSetAsExecutor}
                disabled={testProgress.isRunning}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors
                  ${testProgress.isRunning 
                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed' 
                    : 'bg-cyan-600/20 text-cyan-400 hover:bg-cyan-600/30'}`}
                title={testProgress.isRunning ? 'Cannot change while test is running' : 'Set as Executor'}
              >
                ⚡ Exec
              </button>
              
              {testProgress.isRunning ? (
                <button
                  onClick={handleCancelTests}
                  className="px-4 py-1.5 bg-red-600/20 text-red-400 hover:bg-red-600/30 rounded text-sm font-medium"
                >
                  ⏹ Cancel Test
                </button>
              ) : (
                <button
                  onClick={() => handleRunTests('standard')}
                  className="px-4 py-1.5 bg-gradient-to-r from-purple-600 to-purple-500 
                           hover:from-purple-500 hover:to-purple-400 
                           text-white font-medium rounded text-sm shadow-lg"
                >
                  🚀 Run Tests
                </button>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Main Content */}
      <div className="px-6 py-4">
        {/* Hero Section: Score Ring + Radar + Latency + Real-time Metrics */}
        <div className="grid grid-cols-5 gap-4 mb-6">
          {/* Score Ring */}
          <div className="bg-[#1a1a1a] rounded-xl border border-[#2d2d2d] p-4 flex flex-col items-center justify-center">
            <ScoreRing score={profile.score} size={100} />
            <p className="text-gray-400 text-xs mt-2">Overall Score</p>
          </div>
          
          {/* Radar Chart */}
          <div className="bg-[#1a1a1a] rounded-xl border border-[#2d2d2d] p-3 flex items-center justify-center">
            <SkillRadar data={radarData} size={180} />
          </div>
          
          {/* Latency Chart */}
          <div className="bg-[#1a1a1a] rounded-xl border border-[#2d2d2d] p-4 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-400">⚡ Response Time</span>
              {profile.contextLatency?.speedRating && (
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  profile.contextLatency.speedRating === 'excellent' ? 'bg-green-500/20 text-green-400' :
                  profile.contextLatency.speedRating === 'good' ? 'bg-cyan-500/20 text-cyan-400' :
                  profile.contextLatency.speedRating === 'acceptable' ? 'bg-amber-500/20 text-amber-400' :
                  'bg-red-500/20 text-red-400'
                }`}>
                  {profile.contextLatency.speedRating}
                </span>
              )}
            </div>
            {profile.contextLatency?.latencies && Object.keys(profile.contextLatency.latencies).length > 0 ? (
              <div className="flex-1 flex flex-col justify-end min-h-[100px]">
                <div className="flex items-center justify-between text-[10px] text-gray-500 mb-1">
                  <span>
                    Min: {profile.contextLatency.minLatency 
                      ? (profile.contextLatency.minLatency < 1000 
                          ? `${profile.contextLatency.minLatency}ms` 
                          : `${(profile.contextLatency.minLatency/1000).toFixed(1)}s`)
                      : 'N/A'}
                  </span>
                  <span>
                    Rec: {(profile.contextLatency.recommendedContext / 1024).toFixed(0)}K
                  </span>
                </div>
                <div className="h-[70px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart 
                      data={Object.entries(profile.contextLatency.latencies)
                        .map(([size, latency]) => ({
                          ctx: parseInt(size) >= 1024 ? `${parseInt(size)/1024}K` : `${size}`,
                          ms: latency as number,
                          size: parseInt(size)
                        }))
                        .sort((a, b) => a.size - b.size)
                      }
                      margin={{ top: 5, right: 5, bottom: 0, left: 5 }}
                    >
                      <defs>
                        <linearGradient id="latencyGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <XAxis 
                        dataKey="ctx" 
                        tick={{ fontSize: 9, fill: '#666' }} 
                        axisLine={{ stroke: '#2d2d2d' }}
                        tickLine={false}
                        interval={0}
                      />
                      <YAxis hide domain={[0, 'auto']} />
                      <ReferenceLine y={5000} stroke="#ef4444" strokeDasharray="2 2" strokeOpacity={0.5} />
                      <Tooltip 
                        contentStyle={{ background: '#1a1a1a', border: '1px solid #2d2d2d', fontSize: 11 }}
                        formatter={(v: number) => [`${v < 1000 ? `${v}ms` : `${(v/1000).toFixed(1)}s`}`, 'Latency']}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="ms" 
                        stroke="#06b6d4" 
                        strokeWidth={2} 
                        fill="url(#latencyGradient)"
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-gray-600 text-xs text-center">
                  Run Standard or Deep<br/>test to measure
                </p>
              </div>
            )}
          </div>
          
          {/* CPU + RAM Real-time Charts */}
          <div className="bg-[#1a1a1a] rounded-xl border border-[#2d2d2d] p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-400">🖥️ CPU</span>
              <span className="text-lg font-bold text-purple-400">
                {systemMetrics?.cpu ?? 0}%
              </span>
            </div>
            <div className="h-12">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={metricsHistory}>
                  <defs>
                    <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <YAxis domain={[0, 100]} hide />
                  <Area 
                    type="monotone" 
                    dataKey="cpu" 
                    stroke="#8b5cf6" 
                    strokeWidth={2} 
                    fill="url(#cpuGradient)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            {/* RAM */}
            <div className="flex items-center justify-between mt-2 mb-1">
              <span className="text-xs text-gray-400">💾 RAM</span>
              <span className="text-sm font-bold text-blue-400">
                {systemMetrics?.ramUsedGB ?? 0}/{systemMetrics?.ramTotalGB ?? 0}GB
              </span>
            </div>
            <div className="h-8">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={metricsHistory}>
                  <defs>
                    <linearGradient id="ramGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <YAxis domain={[0, systemMetrics?.ramTotalGB || 32]} hide />
                  <Area 
                    type="monotone" 
                    dataKey="ramUsedGB" 
                    stroke="#3b82f6" 
                    strokeWidth={2} 
                    fill="url(#ramGradient)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* GPU + VRAM Charts */}
          <div className="bg-[#1a1a1a] rounded-xl border border-[#2d2d2d] p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">🎮 GPU</span>
                {systemMetrics?.gpuTemp && systemMetrics.gpuTemp > 0 && (
                  <span className={`text-xs ${
                    systemMetrics.gpuTemp > 80 ? 'text-red-400' :
                    systemMetrics.gpuTemp > 60 ? 'text-yellow-400' :
                    'text-gray-500'
                  }`}>
                    🌡️ {systemMetrics.gpuTemp}°C
                  </span>
                )}
              </div>
              <span className="text-lg font-bold text-green-400">
                {systemMetrics?.gpu ?? 0}%
              </span>
            </div>
            <div className="h-10">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={metricsHistory}>
                  <defs>
                    <linearGradient id="gpuGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <YAxis domain={[0, 100]} hide />
                  <Area 
                    type="monotone" 
                    dataKey="gpu" 
                    stroke="#10b981" 
                    strokeWidth={2} 
                    fill="url(#gpuGradient)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            {/* VRAM */}
            <div className="flex items-center justify-between mt-2 mb-1">
              <span className="text-xs text-gray-400">💾 VRAM</span>
              <span className="text-sm font-bold text-amber-400">
                {systemMetrics?.vramUsedMB 
                  ? `${(systemMetrics.vramUsedMB / 1024).toFixed(1)}/${(systemMetrics.vramTotalMB! / 1024).toFixed(1)}GB`
                  : 'N/A'}
              </span>
            </div>
            <div className="h-8">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={metricsHistory}>
                  <defs>
                    <linearGradient id="vramGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <YAxis domain={[0, systemMetrics?.vramTotalMB || 16000]} hide />
                  <Area 
                    type="monotone" 
                    dataKey="vramUsedMB" 
                    stroke="#f59e0b" 
                    strokeWidth={2} 
                    fill="url(#vramGradient)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[#2d2d2d] mb-4">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-3 text-sm font-medium transition-colors relative
                ${activeTab === tab.id 
                  ? 'text-purple-400' 
                  : 'text-gray-500 hover:text-gray-300'}`}
            >
              <span className="mr-2">{tab.icon}</span>
              {tab.label}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-500" />
              )}
              {tab.id === 'testing' && testProgress.isRunning && (
                <span className="ml-2 animate-pulse">●</span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="bg-[#1a1a1a] rounded-xl border border-[#2d2d2d] p-6 min-h-[500px]">
          {activeTab === 'overview' && (
            <OverviewTab 
              profile={profile} 
              onRunTests={handleRunTests}
              isTestRunning={testProgress.isRunning}
            />
          )}
          {activeTab === 'testing' && (
            <TestingTab 
              profile={profile}
              testProgress={testProgress}
              onRunTests={handleRunTests}
              onCancelTests={handleCancelTests}
              onClearResults={handleClearResults}
              isTestRunning={testProgress.isRunning}
              preflightError={preflightError}
              onDismissPreflightError={() => setPreflightError(null)}
            />
          )}
          {activeTab === 'capabilities' && (
            <CapabilitiesTab 
              profile={profile}
              testProgress={testProgress}
            />
          )}
          {activeTab === 'configuration' && (
            <ConfigurationTab 
              profile={profile}
              isTestRunning={testProgress.isRunning}
              onUpdate={fetchProfile}
            />
          )}
          {activeTab === 'history' && (
            <HistoryTab 
              modelId={profile.modelId}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default ModelDetailPage;

