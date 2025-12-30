import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { OverviewTab } from './components/detail/OverviewTab';
import { TestingTab } from './components/detail/TestingTab';
import { CapabilitiesTab } from './components/detail/CapabilitiesTab';
import { ConfigurationTab } from './components/detail/ConfigurationTab';
import { HistoryTab } from './components/detail/HistoryTab';
import SkillRadar from '../../components/SkillRadar';
import ScoreRing from '../../components/ScoreRing';
import { useModelProfile } from './ModelDetailPage/hooks/useModelProfile';
import type { TabId } from './ModelDetailPage/types';

export const ModelDetailPage: React.FC = () => {
  const { modelId } = useParams<{ modelId: string }>();
  const navigate = useNavigate();
  const decodedModelId = modelId ? decodeURIComponent(modelId) : '';

  const {
    profile, loading, error, setError, activeTab, setActiveTab, systemMetrics,
    testProgress, metricsHistory, preflightError, setPreflightError,
    baselineComparison, isRefreshingBaseline, setIsRefreshingBaseline,
    fetchProfile, fetchBaselineComparison
  } = useModelProfile(decodedModelId);

  const handleRunTests = async (mode: string = 'standard') => {
    setPreflightError(null); setActiveTab('testing');
    try {
      const res = await fetch(`/api/tooly/models/${encodeURIComponent(decodedModelId)}/test?mode=${mode}`, { method: 'POST' });
      const result = await res.json();
      if (result.aborted) setPreflightError(result);
      else { fetchProfile(); fetchBaselineComparison(); }
    } catch (err: any) { setError(err.message); }
  };

  const handleCancelTests = () => fetch(`/api/tooly/models/${encodeURIComponent(decodedModelId)}/test`, { method: 'DELETE' });

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
      console.error('Failed to set main model:', err);
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
      console.error('Failed to set executor model:', err);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-screen bg-[#0f0f0f]"><div className="animate-spin text-4xl">⚙️</div></div>;
  if (error || !profile) return <div className="flex items-center justify-center h-screen bg-[#0f0f0f] text-red-400">Error: {error || 'Model not found'}</div>;

  const radarData = profile.scoreBreakdown ? [
    { skill: 'Tools', score: profile.scoreBreakdown.toolScore ?? 0 },
    { skill: 'RAG', score: profile.scoreBreakdown.ragScore ?? 0 },
    { skill: 'Bugs', score: profile.scoreBreakdown.bugDetectionScore ?? 0 },
    { skill: 'Arch', score: profile.scoreBreakdown.architecturalScore ?? 0 },
    { skill: 'Reason', score: profile.scoreBreakdown.reasoningScore ?? 0 },
    { skill: 'Intent', score: profile.scoreBreakdown.intentScore ?? 0 },
  ] : [];

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white p-6">
      <div className="flex justify-between items-center mb-8">
        <button onClick={() => navigate('/tooly')} className="text-gray-400 hover:text-white">← Back</button>
        <h1 className="text-2xl font-bold">{profile.displayName}</h1>
        <div className="flex gap-2">
          <button
            onClick={handleSetAsMain}
            disabled={testProgress.isRunning}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors
              ${testProgress.isRunning
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : profile.role === 'main' || profile.role === 'both'
                  ? 'bg-purple-600 text-white'
                  : 'bg-purple-600/20 text-purple-400 hover:bg-purple-600/30'}`}
          >
            {profile.role === 'main' || profile.role === 'both' ? '🎯 Main Active' : '🎯 Set Main'}
          </button>
          <button
            onClick={handleSetAsExecutor}
            disabled={testProgress.isRunning}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors
              ${testProgress.isRunning
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : profile.role === 'executor' || profile.role === 'both'
                  ? 'bg-cyan-600 text-white'
                  : 'bg-cyan-600/20 text-cyan-400 hover:bg-cyan-600/30'}`}
          >
            {profile.role === 'executor' || profile.role === 'both' ? '⚡ Exec Active' : '⚡ Set Exec'}
          </button>
          <button onClick={() => handleRunTests('standard')} className="px-4 py-2 bg-purple-600 rounded ml-4 shadow-lg shadow-purple-500/20">🚀 Run Tests</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-8">
        <div className="bg-[#1a1a1a] p-6 rounded-xl border border-[#2d2d2d] flex flex-col items-center justify-center shadow-lg">
          <ScoreRing score={profile.score} size={120} />
          <p className="text-gray-400 text-sm mt-3 font-medium uppercase tracking-wider">Overall Score</p>
        </div>
        
        <div className="bg-[#1a1a1a] p-4 rounded-xl border border-[#2d2d2d] lg:col-span-2 flex items-center justify-center shadow-lg overflow-hidden">
          <SkillRadar data={radarData} size={280} />
        </div>
        
        <div className="bg-[#1a1a1a] p-6 rounded-xl border border-[#2d2d2d] lg:col-span-2 shadow-lg">
          <h3 className="text-white font-medium mb-4 flex items-center gap-2">
            <span className="text-blue-400">⚡</span> Real-time Performance
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#0f0f0f] p-3 rounded-lg border border-[#2d2d2d]">
              <span className="text-gray-500 text-[10px] uppercase block mb-1 tracking-wider">CPU Usage</span>
              <span className="text-blue-400 font-mono text-xl">{systemMetrics?.cpu ?? 0}%</span>
            </div>
            <div className="bg-[#0f0f0f] p-3 rounded-lg border border-[#2d2d2d]">
              <span className="text-gray-500 text-[10px] uppercase block mb-1 tracking-wider">GPU Load</span>
              <span className="text-green-400 font-mono text-xl">{systemMetrics?.gpu ?? 0}%</span>
            </div>
            <div className="bg-[#0f0f0f] p-3 rounded-lg border border-[#2d2d2d] col-span-2">
              <span className="text-gray-500 text-[10px] uppercase block mb-1 tracking-wider">VRAM Allocation</span>
              <div className="flex items-end justify-between">
                <span className="text-amber-400 font-mono text-xl">
                  {systemMetrics?.vramUsedMB ? `${(systemMetrics.vramUsedMB / 1024).toFixed(1)}GB` : 'N/A'}
                </span>
                <span className="text-gray-600 font-mono text-xs mb-1">
                  / {systemMetrics?.vramTotalMB ? `${(systemMetrics.vramTotalMB / 1024).toFixed(1)}GB` : 'N/A'}
                </span>
              </div>
              <div className="w-full h-1.5 bg-[#2d2d2d] rounded-full mt-2 overflow-hidden">
                <div
                  className="h-full bg-amber-500 transition-all duration-500"
                  style={{ width: `${systemMetrics?.vramPercent ?? 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex border-b border-[#2d2d2d] mb-6">
        {(['overview', 'testing', 'capabilities', 'configuration', 'history'] as TabId[]).map(id => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`px-6 py-3 text-sm font-bold tracking-widest transition-all relative ${
              activeTab === id ? 'text-purple-400' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {id.toUpperCase()}
            {activeTab === id && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.5)]" />
            )}
          </button>
        ))}
      </div>

      <div className="bg-[#1a1a1a] p-6 rounded-xl border border-[#2d2d2d] min-h-[500px]">
        {activeTab === 'overview' && <OverviewTab profile={profile} onRunTests={handleRunTests} isTestRunning={testProgress.isRunning} />}
        {activeTab === 'testing' && <TestingTab profile={profile} testProgress={testProgress} onRunTests={handleRunTests} onCancelTests={handleCancelTests} onClearResults={() => {}} isTestRunning={testProgress.isRunning} preflightError={preflightError} onDismissPreflightError={() => setPreflightError(null)} baselineComparison={baselineComparison} onRefreshBaseline={() => {}} isRefreshingBaseline={isRefreshingBaseline} />}
        {activeTab === 'capabilities' && <CapabilitiesTab profile={profile} testProgress={testProgress} />}
        {activeTab === 'configuration' && <ConfigurationTab profile={profile} isTestRunning={testProgress.isRunning} onUpdate={fetchProfile} />}
        {activeTab === 'history' && <HistoryTab modelId={profile.modelId} />}
      </div>
    </div>
  );
};

export default ModelDetailPage;