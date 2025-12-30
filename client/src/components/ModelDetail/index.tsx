import React, { useState, useEffect } from 'react';
import { ScoreRing } from '../ScoreRing';
import { SkillRadar, type SkillData } from '../SkillRadar';
import type { LatencyDataPoint } from '../LatencyChart';
import {
  OverviewTab,
  CapabilitiesTab,
  ToolsTab,
  PerformanceTab
} from './components';
import { ModelProfile, TestProgress, ModelLoading, TabId } from './types';
import { styles } from './utils';

interface ModelDetailProps {
  profile: ModelProfile | null;
  testProgress?: TestProgress;
  modelLoading?: ModelLoading;
  isRunningTests?: boolean;
  onRunTests?: () => void;
  onSetAsMain?: () => void;
  onSetAsExecutor?: () => void;
}

export const ModelDetail: React.FC<ModelDetailProps> = ({
  profile,
  testProgress,
  modelLoading,
  isRunningTests,
  onRunTests,
  onSetAsMain,
  onSetAsExecutor,
}) => {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  
  useEffect(() => {
    if (testProgress?.isRunning) {
      if (testProgress.testType === 'tools') setActiveTab('tools');
      else if (testProgress.testType === 'latency') setActiveTab('perf');
      else if (testProgress.testType === 'probe') setActiveTab('capabilities');
    }
  }, [testProgress?.isRunning, testProgress?.testType]);

  if (!profile) {
    return (
      <div style={styles.emptyState}>
        <div style={styles.emptyIcon}>📊</div>
        <div style={styles.emptyText}>Select a model to view details</div>
      </div>
    );
  }

  const radarData: SkillData[] = [
    { skill: 'RAG', score: profile.scoreBreakdown?.ragScore ?? 0 },
    { skill: 'Architecture', score: profile.scoreBreakdown?.architecturalScore ?? 0 },
    { skill: 'Navigation', score: profile.scoreBreakdown?.navigationScore ?? 0 },
    { skill: 'Bug', score: profile.scoreBreakdown?.bugDetectionScore ?? 0 },
    { skill: 'Intent', score: profile.scoreBreakdown?.intentScore ?? 0 },
    { skill: 'Reasoning', score: profile.scoreBreakdown?.reasoningScore ?? 0 },
    { skill: 'Proactive', score: profile.scoreBreakdown?.proactiveScore ?? 0 },
    { skill: 'Tools', score: profile.scoreBreakdown?.toolScore ?? 0 },
  ];

  const latencyData: LatencyDataPoint[] = Object.entries(profile.contextLatency?.latencies || {})
    .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
    .map(([context, latency]) => ({
      context: context.includes('k') ? context : `\${parseInt(context) / 1000}k`,
      latency,
      contextSize: parseInt(context),
    }));

  const getRoleBadge = (role: string) => {
    const config: Record<string, { color: string; bg: string; label: string }> = {
      main: { color: '#10B981', bg: '#10B98120', label: 'Main Model' },
      executor: { color: '#0EA5E9', bg: '#0EA5E920', label: 'Executor' },
      both: { color: '#8B5CF6', bg: '#8B5CF620', label: 'Main + Executor' },
      none: { color: '#64748b', bg: '#64748b20', label: 'Unassigned' },
    };
    const c = config[role] || config.none;
    return (
      <span style={{ padding: '4px 10px', backgroundColor: c.bg, border: `1px solid \${c.color}40`, borderRadius: '12px', fontSize: '11px', fontWeight: 600, color: c.color }}>
        {c.label}
      </span>
    );
  };

  const tabs: { id: TabId; label: string; icon: string }[] = [
    { id: 'overview', label: 'Overview', icon: '📋' },
    { id: 'capabilities', label: 'Capabilities', icon: '🧪' },
    { id: 'tools', label: 'Tools', icon: '🔧' },
    { id: 'perf', label: 'Performance', icon: '⚡' },
  ];

  return (
    <div style={styles.container}>
      <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      
      {modelLoading?.isLoading && (
        <div style={styles.loadingOverlay}>
          <div style={styles.loadingCard}>
            <div style={styles.spinner} />
            <span style={styles.loadingText}>{modelLoading.status === 'loading' ? '📥 Loading...' : '📤 Unloading...'}</span>
          </div>
        </div>
      )}

      <div style={styles.heroSection}>
        <div style={styles.heroLeft}>
          <ScoreRing score={profile.scoreBreakdown?.overallScore ?? profile.score ?? 0} size={80} strokeWidth={6} label="Score" />
          <div style={{ marginTop: '6px' }}>{getRoleBadge(profile.role)}</div>
        </div>
        <div style={styles.heroCenter}><SkillRadar data={radarData} size={260} /></div>
        <div style={styles.heroActions}>
          <button onClick={onRunTests} disabled={isRunningTests} style={styles.actionButtonCompact}>
            {isRunningTests ? '⏳ Testing...' : '🚀 Run Tests'}
          </button>
          <button onClick={onSetAsMain} style={styles.actionButtonSecondaryCompact}>🎯 Main</button>
          <button onClick={onSetAsExecutor} style={styles.actionButtonSecondaryCompact}>⚡ Exec</button>
        </div>
      </div>

      <div style={styles.tabBar}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ ...styles.tabButton, ...(activeTab === tab.id ? styles.tabButtonActive : {}) }}>
            <span>{tab.icon}</span> <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div style={styles.tabContent}>
        {activeTab === 'overview' && <OverviewTab profile={profile} />}
        {activeTab === 'capabilities' && <CapabilitiesTab profile={profile} testProgress={testProgress} />}
        {activeTab === 'tools' && <ToolsTab profile={profile} testProgress={testProgress} />}
        {activeTab === 'perf' && <PerformanceTab profile={profile} latencyData={latencyData} />}
      </div>
    </div>
  );
};

export default ModelDetail;
