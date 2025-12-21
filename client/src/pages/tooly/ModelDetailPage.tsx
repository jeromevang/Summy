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
// MINI METRIC DISPLAY
// ============================================================

const MiniMetric: React.FC<{ label: string; value: string | number; color: string }> = ({ 
  label, 
  value, 
  color 
}) => (
  <div className="flex items-center gap-2 px-3 py-1 bg-[#1a1a1a] rounded-lg">
    <span className="text-gray-400 text-xs">{label}</span>
    <span className={`font-mono text-sm ${color}`}>{value}</span>
  </div>
);

// ============================================================
// MAIN COMPONENT
// ============================================================

export const ModelDetailPage: React.FC = () => {
  const { modelId } = useParams<{ modelId: string }>();
  const navigate = useNavigate();
  const decodedModelId = modelId ? decodeURIComponent(modelId) : '';

  // State
  const [profile, setProfile] = useState<ModelProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics | null>(null);
  const [testProgress, setTestProgress] = useState<TestProgress>({ isRunning: false });
  const [metricsHistory, setMetricsHistory] = useState<SystemMetrics[]>([]);

  // WebSocket for real-time updates
  useEffect(() => {
    const wsUrl = `ws://${window.location.hostname}:3001/ws`;
    const ws = new ReconnectingWebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'system_metrics') {
          setSystemMetrics(data.payload);
          setMetricsHistory(prev => [...prev.slice(-60), data.payload]);
        } else if (data.type === 'test_progress' && data.payload?.modelId === decodedModelId) {
          setTestProgress({
            isRunning: true,
            currentTest: data.payload.currentTest,
            currentCategory: data.payload.category,
            progress: data.payload.progress,
            status: data.payload.status
          });
        } else if (data.type === 'test_complete' && data.payload?.modelId === decodedModelId) {
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
  const handleRunTests = async (mode: 'quick' | 'standard' | 'deep' | 'optimization' = 'standard') => {
    if (!decodedModelId) return;
    
    try {
      setTestProgress({ isRunning: true, status: 'Starting...' });
      setActiveTab('testing');
      
      const response = await fetch(
        `/api/tooly/models/${encodeURIComponent(decodedModelId)}/test?mode=${mode}`,
        { method: 'POST' }
      );
      
      if (!response.ok) throw new Error('Failed to start tests');
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

  // Radar data
  const radarData = profile?.scoreBreakdown ? [
    { subject: 'Tools', value: profile.scoreBreakdown.toolScore ?? 0 },
    { subject: 'Reasoning', value: profile.scoreBreakdown.reasoningScore ?? 0 },
    { subject: 'RAG', value: profile.scoreBreakdown.ragScore ?? 0 },
    { subject: 'Intent', value: profile.scoreBreakdown.intentScore ?? 0 },
    { subject: 'Bugs', value: profile.scoreBreakdown.bugDetectionScore ?? 0 },
  ] : [];

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

            {/* Center: System Metrics */}
            <div className="flex items-center gap-3">
              <MiniMetric 
                label="CPU" 
                value={`${systemMetrics?.cpu ?? 0}%`} 
                color="text-blue-400" 
              />
              <MiniMetric 
                label="GPU" 
                value={`${systemMetrics?.gpu ?? 0}%`} 
                color="text-green-400" 
              />
              <MiniMetric 
                label="VRAM" 
                value={systemMetrics?.vramUsedMB && systemMetrics?.vramTotalMB
                  ? `${(systemMetrics.vramUsedMB / 1024).toFixed(1)}/${(systemMetrics.vramTotalMB / 1024).toFixed(1)}GB`
                  : 'N/A'
                } 
                color="text-amber-400" 
              />
            </div>

            {/* Right: Actions */}
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

        {/* Test Progress Bar */}
        {testProgress.isRunning && testProgress.progress && (
          <div className="px-6 pb-3">
            <div className="bg-[#1a1a1a] rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-300">
                  {testProgress.currentCategory}: {testProgress.currentTest}
                </span>
                <span className="text-sm text-gray-500">
                  {testProgress.progress.current}/{testProgress.progress.total}
                </span>
              </div>
              <div className="h-2 bg-[#2d2d2d] rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-purple-600 to-purple-400 transition-all duration-300"
                  style={{ 
                    width: `${(testProgress.progress.current / testProgress.progress.total) * 100}%` 
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="px-6 py-4">
        {/* Hero Section: Score Ring + Radar */}
        <div className="grid grid-cols-3 gap-6 mb-6">
          {/* Score Ring */}
          <div className="bg-[#1a1a1a] rounded-xl border border-[#2d2d2d] p-6 flex flex-col items-center justify-center">
            <ScoreRing score={profile.score} size={120} />
            <p className="text-gray-400 text-sm mt-2">Overall Score</p>
          </div>
          
          {/* Radar Chart */}
          <div className="bg-[#1a1a1a] rounded-xl border border-[#2d2d2d] p-4 flex items-center justify-center">
            <SkillRadar data={radarData} size={280} />
          </div>
          
          {/* Quick Stats */}
          <div className="bg-[#1a1a1a] rounded-xl border border-[#2d2d2d] p-6">
            <h3 className="text-white font-medium mb-4">Quick Stats</h3>
            <div className="space-y-3">
              {profile.scoreBreakdown && Object.entries(profile.scoreBreakdown).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-gray-400 text-sm capitalize">
                    {key.replace(/Score$/, '')}
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-[#2d2d2d] rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-purple-500 rounded-full"
                        style={{ width: `${value}%` }}
                      />
                    </div>
                    <span className="text-white text-sm font-mono w-10 text-right">
                      {value}%
                    </span>
                  </div>
                </div>
              ))}
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
              isTestRunning={testProgress.isRunning}
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

