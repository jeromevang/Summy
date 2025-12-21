import React, { useState } from 'react';
import { ScoreRing } from './ScoreRing';
import { SkillRadar } from './SkillRadar';
import type { SkillData } from './SkillRadar';
import { LatencyChart, SpeedBadge } from './LatencyChart';
import type { LatencyDataPoint } from './LatencyChart';

interface ModelProfile {
  modelId: string;
  displayName: string;
  provider: string;
  role: 'main' | 'executor' | 'both' | 'none';
  score: number;
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
  contextLatency?: {
    latencies?: Record<string, number>;
    speedRating?: 'excellent' | 'good' | 'acceptable' | 'slow';
    maxUsableContext?: number;
    isInteractiveSpeed?: boolean;
    recommendedContext?: number;
  };
  badges?: Array<{ id: string; name: string; icon: string }>;
  recommendations?: Array<{ task: string; suitability: 'excellent' | 'good' | 'fair' | 'poor' }>;
  modelInfo?: {
    name?: string;
    author?: string;
    description?: string;
    parameters?: string;
    architecture?: string;
    contextLength?: number;
    license?: string;
    capabilities?: string[];
  };
  toolCategories?: Record<string, { tools: Array<{ name: string; score: number; testsPassed: number; enabled: boolean }> }>;
  probeResults?: {
    coreProbes?: Array<{ name: string; passed: boolean; latency?: number }>;
    enhancedProbes?: Array<{ name: string; passed: boolean; score?: number }>;
    reasoningProbes?: Array<{ name: string; passed: boolean; score?: number }>;
    strategicRAGProbes?: Array<{ name: string; passed: boolean; score?: number }>;
    architecturalProbes?: Array<{ name: string; passed: boolean; score?: number }>;
    navigationProbes?: Array<{ name: string; passed: boolean; score?: number }>;
    helicopterProbes?: Array<{ name: string; passed: boolean; score?: number }>;
    proactiveProbes?: Array<{ name: string; passed: boolean; score?: number }>;
    intentProbes?: Array<{ name: string; passed: boolean; score?: number }>;
  };
}

interface TestProgress {
  isRunning: boolean;
  current: number;
  total: number;
  currentCategory?: string;
  currentTest?: string;
  percent: number;
  eta?: string;
  testType?: 'probe' | 'tools' | 'latency';
}

interface ModelLoading {
  isLoading: boolean;
  status?: 'loading' | 'unloading';
  message?: string;
}

interface ModelDetailV2Props {
  profile: ModelProfile | null;
  testProgress?: TestProgress;
  modelLoading?: ModelLoading;
  isRunningTests?: boolean;
  onRunTests?: () => void;
  onSetAsMain?: () => void;
  onSetAsExecutor?: () => void;
}

type TabId = 'overview' | 'capabilities' | 'tools' | 'perf';

export const ModelDetailV2: React.FC<ModelDetailV2Props> = ({
  profile,
  testProgress,
  modelLoading,
  isRunningTests,
  onRunTests,
  onSetAsMain,
  onSetAsExecutor,
}) => {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  
  // Auto-switch to appropriate tab when a category is being tested
  React.useEffect(() => {
    if (testProgress?.isRunning) {
      // Use testType to determine which tab to switch to
      if (testProgress.testType === 'tools') {
        setActiveTab('tools');
      } else if (testProgress.testType === 'latency') {
        setActiveTab('perf');
      } else if (testProgress.testType === 'probe') {
        // Check if it's a capability probe or overview
        const cat = (testProgress.currentCategory || '').toLowerCase();
        if (cat.includes('strategic rag') || cat.includes('🔍') ||
            cat.includes('architecture') || cat.includes('🏗️') ||
            cat.includes('navigation') || cat.includes('🧭') ||
            cat.includes('bug') || cat.includes('🐛') ||
            cat.includes('proactive') || cat.includes('💡') ||
            cat.includes('intent') || cat.includes('🎯') ||
            cat.includes('reasoning') || cat.includes('2.x') ||
            cat.includes('3.x') || cat.includes('4.x') || 
            cat.includes('5.x') || cat.includes('6.x') || 
            cat.includes('7.x') || cat.includes('8.x')) {
          setActiveTab('capabilities');
        }
      }
    }
  }, [testProgress?.currentCategory, testProgress?.isRunning, testProgress?.testType]);

  if (!profile) {
    return (
      <div style={styles.emptyState}>
        <div style={styles.emptyIcon}>📊</div>
        <div style={styles.emptyText}>Select a model to view details</div>
      </div>
    );
  }
  
  // Check if we're in a loading state
  const isLoading = modelLoading?.isLoading;

  const overallScore = profile.scoreBreakdown?.overallScore ?? profile.score ?? 0;
  
  // Build radar chart data
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

  // Build latency chart data
  const latencyData: LatencyDataPoint[] = [];
  if (profile.contextLatency?.latencies) {
    const entries = Object.entries(profile.contextLatency.latencies);
    entries.sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
    entries.forEach(([context, latency]) => {
      latencyData.push({
        context: context.includes('k') ? context : `${parseInt(context) / 1000}k`,
        latency: latency,
        contextSize: parseInt(context),
      });
    });
  }

  const getRoleBadge = (role: string) => {
    const config: Record<string, { color: string; bg: string; label: string }> = {
      main: { color: '#10B981', bg: '#10B98120', label: 'Main Model' },
      executor: { color: '#0EA5E9', bg: '#0EA5E920', label: 'Executor' },
      both: { color: '#8B5CF6', bg: '#8B5CF620', label: 'Main + Executor' },
      none: { color: '#64748b', bg: '#64748b20', label: 'Unassigned' },
    };
    const c = config[role] || config.none;
    return (
      <span style={{
        padding: '4px 10px',
        backgroundColor: c.bg,
        border: `1px solid ${c.color}40`,
        borderRadius: '12px',
        fontSize: '11px',
        fontWeight: 600,
        color: c.color,
      }}>
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
      {/* CSS Keyframes */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
      
      {/* Model Loading Indicator - Like V1 */}
      {isLoading && (
        <div style={styles.loadingOverlay}>
          <div style={styles.loadingCard}>
            <div style={styles.spinner} />
            <span style={styles.loadingText}>
              {modelLoading?.status === 'loading' ? '📥 Loading Model...' : '📤 Unloading Model...'}
            </span>
            {modelLoading?.message && (
              <span style={styles.loadingMessage}>{modelLoading.message}</span>
            )}
          </div>
        </div>
      )}

      {/* Hero Section - Compact */}
      <div style={styles.heroSection}>
        {/* Left: Score Ring + Role */}
        <div style={styles.heroLeft}>
          <ScoreRing
            score={overallScore}
            size={80}
            strokeWidth={6}
            label="Score"
          />
          <div style={{ marginTop: '6px' }}>
            {getRoleBadge(profile.role)}
          </div>
        </div>
        
        {/* Center: Radar Chart - Optimized size */}
        <div style={styles.heroCenter}>
          <SkillRadar data={radarData} size={260} />
        </div>
        
        {/* Right: Actions - Always Visible */}
        <div style={styles.heroActions}>
          <button
            onClick={onRunTests}
            disabled={isRunningTests}
            style={{
              ...styles.actionButtonCompact,
              opacity: isRunningTests ? 0.6 : 1,
              cursor: isRunningTests ? 'not-allowed' : 'pointer',
            }}
          >
            {isRunningTests ? '⏳' : '🚀'} {isRunningTests ? 'Testing...' : 'Run Tests'}
          </button>
          <button onClick={onSetAsMain} style={styles.actionButtonSecondaryCompact}>
            🎯 Main
          </button>
          <button onClick={onSetAsExecutor} style={styles.actionButtonSecondaryCompact}>
            ⚡ Exec
          </button>
        </div>
      </div>

      {/* Test Progress Bar - Enhanced with details and ETA */}
      {testProgress?.isRunning && (
        <div style={styles.progressContainer}>
          <div style={styles.progressHeader}>
            <span style={styles.progressLabel}>
              <span style={styles.pulsingDot} />
              {testProgress.currentCategory || 'Running Tests...'}
            </span>
            <div style={styles.progressStats}>
              {testProgress.eta && (
                <span style={styles.progressEta}>⏱️ {testProgress.eta}</span>
              )}
              <span style={styles.progressCount}>
                {testProgress.current}/{testProgress.total} ({testProgress.percent}%)
              </span>
            </div>
          </div>
          <div style={styles.progressBarBg}>
            <div 
              style={{
                ...styles.progressBarFill,
                width: `${testProgress.percent}%`,
              }}
            />
          </div>
          {testProgress.currentTest && (
            <div style={styles.progressDetails}>
              <span style={styles.progressTestIcon}>🧪</span>
              <span style={styles.progressCurrentTest}>{testProgress.currentTest}</span>
            </div>
          )}
        </div>
      )}

      {/* Tab Navigation */}
      <div style={styles.tabBar}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              ...styles.tabButton,
              ...(activeTab === tab.id ? styles.tabButtonActive : {}),
            }}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={styles.tabContent}>
        {activeTab === 'overview' && <OverviewTab profile={profile} />}
        {activeTab === 'capabilities' && <CapabilitiesTab profile={profile} testProgress={testProgress} />}
        {activeTab === 'tools' && <ToolsTab profile={profile} testProgress={testProgress} />}
        {activeTab === 'perf' && <PerformanceTab profile={profile} latencyData={latencyData} />}
      </div>
    </div>
  );
};

// Test Progress Bar Component
const TestProgressBar: React.FC<{ profile: ModelProfile; liveProgress?: TestProgress }> = ({ profile, liveProgress }) => {
  // Calculate how many test categories have been run
  const categories = [
    { name: 'Tool', hasData: (profile.scoreBreakdown?.toolScore ?? 0) > 0 },
    { name: 'Reason', hasData: (profile.scoreBreakdown?.reasoningScore ?? 0) > 0 },
    { name: 'RAG', hasData: profile.probeResults?.strategicRAGProbes && profile.probeResults.strategicRAGProbes.length > 0 },
    { name: 'Arch', hasData: profile.probeResults?.architecturalProbes && profile.probeResults.architecturalProbes.length > 0 },
    { name: 'Nav', hasData: profile.probeResults?.navigationProbes && profile.probeResults.navigationProbes.length > 0 },
    { name: 'Intent', hasData: profile.probeResults?.intentProbes && profile.probeResults.intentProbes.length > 0 },
  ];
  
  const completedStatic = categories.filter(c => c.hasData).length;
  const totalStatic = categories.length;
  
  // Use live progress if available, otherwise use static
  const isLive = liveProgress?.isRunning;
  const current = isLive ? liveProgress.current : completedStatic;
  const total = isLive ? liveProgress.total : totalStatic;
  const percent = isLive ? liveProgress.percent : Math.round((completedStatic / totalStatic) * 100);
  const currentCategory = isLive ? liveProgress.currentCategory : undefined;
  
  return (
    <div style={{ marginTop: '10px', width: '100%' }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        fontSize: '10px', 
        color: isLive ? '#14B8A6' : '#64748b',
        marginBottom: '4px',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {isLive && (
            <span style={{ 
              width: '6px', 
              height: '6px', 
              borderRadius: '50%', 
              backgroundColor: '#14B8A6',
              animation: 'pulse 1s infinite',
            }} />
          )}
          {isLive ? (currentCategory || 'Testing...') : 'Test Progress'}
        </span>
        <span>{current}/{total}</span>
      </div>
      <div style={{
        height: '6px',
        backgroundColor: '#334155',
        borderRadius: '3px',
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${percent}%`,
          backgroundColor: isLive ? '#14B8A6' : (percent === 100 ? '#10B981' : '#3B82F6'),
          borderRadius: '3px',
          transition: isLive ? 'width 0.2s ease-out' : 'width 0.3s ease',
          boxShadow: isLive ? '0 0 8px #14B8A680' : 'none',
        }} />
      </div>
      {/* CSS for pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
};

// Overview Tab Component
const OverviewTab: React.FC<{
  profile: ModelProfile;
}> = ({ profile }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
      {/* Model Info Card */}
      {profile.modelInfo && (
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <span style={styles.cardIcon}>ℹ️</span>
            Model Information
          </div>
          <div style={styles.infoGrid}>
            {profile.modelInfo.author && (
              <div style={styles.infoItem}>
                <span style={styles.infoLabel}>Author</span>
                <span style={styles.infoValue}>{profile.modelInfo.author}</span>
              </div>
            )}
            {profile.modelInfo.architecture && (
              <div style={styles.infoItem}>
                <span style={styles.infoLabel}>Architecture</span>
                <span style={styles.infoValue}>{profile.modelInfo.architecture}</span>
              </div>
            )}
            {profile.modelInfo.parameters && (
              <div style={styles.infoItem}>
                <span style={styles.infoLabel}>Parameters</span>
                <span style={styles.infoValue}>{profile.modelInfo.parameters}</span>
              </div>
            )}
            {profile.modelInfo.contextLength && (
              <div style={styles.infoItem}>
                <span style={styles.infoLabel}>Context</span>
                <span style={styles.infoValue}>{(profile.modelInfo.contextLength / 1000).toFixed(0)}k tokens</span>
              </div>
            )}
          </div>
          {profile.modelInfo.description && (
            <p style={styles.description}>{profile.modelInfo.description}</p>
          )}
        </div>
      )}

      {/* Badges - only show EARNED badges */}
      {(() => {
        const earnedBadges = (profile.badges || []).filter((b: any) => b.earned !== false);
        return earnedBadges.length > 0 ? (
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <span style={styles.cardIcon}>🏆</span>
              Earned Badges ({earnedBadges.length})
            </div>
            <div style={styles.badgesGrid}>
              {earnedBadges.map((badge: any) => (
                <div key={badge.id} style={styles.badge}>
                  <span style={styles.badgeIcon}>{badge.icon}</span>
                  <span style={styles.badgeName}>{badge.name}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <span style={styles.cardIcon}>🏆</span>
              Badges
            </div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>
              No badges earned yet. Run full probes to unlock badges.
            </div>
          </div>
        );
      })()}

      {/* Recommendations */}
      {profile.recommendations && profile.recommendations.length > 0 && (
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <span style={styles.cardIcon}>✅</span>
            Recommended For
          </div>
          <div style={styles.recList}>
            {profile.recommendations.slice(0, 5).map((rec, i) => (
              <div key={i} style={styles.recItem}>
                <span style={{
                  ...styles.recDot,
                  backgroundColor: rec.suitability === 'excellent' ? '#10B981' :
                                   rec.suitability === 'good' ? '#0EA5E9' :
                                   rec.suitability === 'fair' ? '#F59E0B' : '#F43F5E',
                }} />
                <span style={styles.recText}>{rec.task}</span>
                <span style={styles.recBadge}>{rec.suitability}</span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
};

// Capabilities Tab Component - Combined Skills + Probes with collapsible sections
const CapabilitiesTab: React.FC<{ profile: ModelProfile; testProgress?: TestProgress }> = ({ profile, testProgress }) => {
  const [expandedCategories, setExpandedCategories] = React.useState<Set<string>>(new Set());
  const [filter, setFilter] = React.useState<'all' | 'passed' | 'failed'>('all');
  const activeProbeRef = React.useRef<HTMLDivElement>(null);
  
  const probeResults = profile.probeResults;
  
  // Check if a specific probe is currently being tested
  const isProbeActive = (probeName: string) => {
    if (!testProgress?.isRunning || testProgress.testType !== 'probe') return false;
    const currentTest = testProgress.currentTest?.toLowerCase() || '';
    const probeNameLower = probeName.toLowerCase();
    // Normalize both strings by removing special chars
    const normalize = (s: string) => s.replace(/[^a-z0-9]/g, '');
    const normalizedCurrent = normalize(currentTest);
    const normalizedProbe = normalize(probeNameLower);
    // Match by probe name or partial match (flexible matching)
    return normalizedCurrent.includes(normalizedProbe) || 
           normalizedProbe.includes(normalizedCurrent) ||
           currentTest.includes(probeNameLower) || 
           probeNameLower.includes(currentTest);
  };
  
  // Define all capability categories with their aggregate score and probes
  const categories = [
    { 
      id: 'rag', 
      name: 'Strategic RAG', 
      icon: '🔍', 
      score: profile.scoreBreakdown?.ragScore ?? 0,
      probes: probeResults?.strategicRAGProbes 
    },
    { 
      id: 'architecture', 
      name: 'Architecture', 
      icon: '🏗️', 
      score: profile.scoreBreakdown?.architecturalScore ?? 0,
      probes: probeResults?.architecturalProbes 
    },
    { 
      id: 'navigation', 
      name: 'Navigation', 
      icon: '🧭', 
      score: profile.scoreBreakdown?.navigationScore ?? 0,
      probes: probeResults?.navigationProbes 
    },
    { 
      id: 'bug', 
      name: 'Bug Detection', 
      icon: '🐛', 
      score: profile.scoreBreakdown?.bugDetectionScore ?? 0,
      probes: probeResults?.architecturalProbes?.filter(p => 
        p.name.toLowerCase().includes('bug') || 
        p.name.toLowerCase().includes('sql') || 
        p.name.toLowerCase().includes('xss')
      )
    },
    { 
      id: 'helicopter', 
      name: 'Helicopter View', 
      icon: '🚁', 
      score: 0, // Calculate from probes if available
      probes: probeResults?.helicopterProbes 
    },
    { 
      id: 'proactive', 
      name: 'Proactive', 
      icon: '💡', 
      score: profile.scoreBreakdown?.proactiveScore ?? 0,
      probes: probeResults?.proactiveProbes 
    },
    { 
      id: 'intent', 
      name: 'Intent', 
      icon: '🎯', 
      score: profile.scoreBreakdown?.intentScore ?? 0,
      probes: probeResults?.intentProbes 
    },
    { 
      id: 'reasoning', 
      name: 'Reasoning', 
      icon: '🧠', 
      score: profile.scoreBreakdown?.reasoningScore ?? 0,
      probes: probeResults?.reasoningProbes 
    },
    { 
      id: 'core', 
      name: 'Core Behavior', 
      icon: '🔬', 
      score: 0,
      probes: probeResults?.coreProbes 
    },
    { 
      id: 'enhanced', 
      name: 'Enhanced Behavior', 
      icon: '⚡', 
      score: 0,
      probes: probeResults?.enhancedProbes 
    },
  ].filter(cat => cat.probes && cat.probes.length > 0);
  
  // Auto-expand category being tested and scroll to active probe
  React.useEffect(() => {
    if (testProgress?.isRunning && testProgress.testType === 'probe' && testProgress.currentCategory) {
      const cat = testProgress.currentCategory.toLowerCase();
      categories.forEach(c => {
        if (cat.includes(c.name.toLowerCase()) || cat.includes(c.icon)) {
          setExpandedCategories(prev => new Set([...prev, c.id]));
        }
      });
      // Scroll to active probe after a brief delay for DOM update
      setTimeout(() => {
        activeProbeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [testProgress?.currentCategory, testProgress?.currentTest]);
  
  const toggleCategory = (id: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };
  
  const getBarColor = (score: number) => {
    if (score >= 85) return '#10B981';
    if (score >= 70) return '#0EA5E9';
    if (score >= 50) return '#F59E0B';
    return '#F43F5E';
  };
  
  const filterProbes = (probes: Array<{ name: string; passed: boolean; score?: number; latency?: number }> | undefined) => {
    if (!probes) return [];
    if (filter === 'passed') return probes.filter(p => p.passed);
    if (filter === 'failed') return probes.filter(p => !p.passed);
    return probes;
  };
  
  const hasNoData = categories.length === 0;
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
      {/* Filter Bar */}
      <div style={styles.filterBar}>
        <span style={styles.filterLabel}>Filter:</span>
        {(['all', 'passed', 'failed'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              ...styles.filterButton,
              ...(filter === f ? styles.filterButtonActive : {}),
              ...(f === 'passed' ? { color: filter === f ? '#fff' : '#10B981' } : {}),
              ...(f === 'failed' ? { color: filter === f ? '#fff' : '#F43F5E' } : {}),
              ...(f === 'passed' && filter === f ? { backgroundColor: '#10B981' } : {}),
              ...(f === 'failed' && filter === f ? { backgroundColor: '#F43F5E' } : {}),
            }}
          >
            {f === 'all' ? '📋 All' : f === 'passed' ? '✓ Passed' : '✗ Failed'}
          </button>
        ))}
      </div>
      
      {hasNoData ? (
        <div style={styles.emptyCard}>
          <div style={{ textAlign: 'center', padding: '24px' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>🧪</div>
            <div style={{ color: '#94a3b8', marginBottom: '8px' }}>No capability data available</div>
            <div style={{ color: '#64748b', fontSize: '12px' }}>
              Run tests to see RAG, Architecture, Navigation, and other capability scores.
            </div>
          </div>
        </div>
      ) : (
        categories.map(cat => {
          const isExpanded = expandedCategories.has(cat.id);
          const filteredProbes = filterProbes(cat.probes);
          const passedCount = cat.probes?.filter(p => p.passed).length ?? 0;
          const totalCount = cat.probes?.length ?? 0;
          // Check if this category is currently being tested (include icon match too)
          const isActive = testProgress?.isRunning && testProgress.testType === 'probe' &&
            (testProgress.currentCategory?.toLowerCase().includes(cat.name.toLowerCase()) ||
             testProgress.currentCategory?.includes(cat.icon));
          
          // Calculate score from probes if not provided
          const calculatedScore = cat.score || (cat.probes && cat.probes.length > 0 
            ? Math.round(cat.probes.reduce((sum, p) => sum + (p.score ?? (p.passed ? 100 : 0)), 0) / cat.probes.length)
            : 0);
          
          return (
            <div key={cat.id} style={{
              ...styles.capabilityCard,
              ...(isActive ? styles.capabilityCardActive : {}),
            }}>
              {/* Category Header - Clickable */}
              <div 
                style={styles.capabilityHeader}
                onClick={() => toggleCategory(cat.id)}
              >
                <div style={styles.capabilityHeaderLeft}>
                  <span style={styles.capabilityIcon}>{cat.icon}</span>
                  <span style={styles.capabilityName}>{cat.name}</span>
                  {isActive && (
                    <span style={styles.activeIndicator}>
                      <span style={styles.spinnerSmall} /> Testing...
                    </span>
                  )}
                </div>
                <div style={styles.capabilityHeaderRight}>
                  <span style={{
                    ...styles.capabilityScore,
                    color: getBarColor(calculatedScore),
                  }}>
                    {calculatedScore}%
                  </span>
                  <span style={styles.capabilityPassCount}>
                    {passedCount}/{totalCount}
                  </span>
                  <span style={styles.expandIcon}>
                    {isExpanded ? '▼' : '▶'}
                  </span>
                </div>
              </div>
              
              {/* Progress Bar */}
              <div style={styles.capabilityBarBg}>
                <div style={{
                  ...styles.capabilityBarFill,
                  width: `${calculatedScore}%`,
                  backgroundColor: getBarColor(calculatedScore),
                }} />
              </div>
              
              {/* Expanded Probe Details */}
              {isExpanded && filteredProbes.length > 0 && (
                <div style={styles.probeList}>
                  {filteredProbes.map((probe, idx) => {
                    const probeActive = isProbeActive(probe.name);
                    return (
                      <div 
                        key={idx} 
                        ref={probeActive ? activeProbeRef : undefined}
                        style={{
                          ...styles.probeItemCompact,
                          borderColor: probeActive ? '#8B5CF6' :
                                       probe.passed ? '#10B98140' : '#F43F5E40',
                          backgroundColor: probeActive ? '#8B5CF620' :
                                           probe.passed ? '#10B98108' : '#F43F5E08',
                          boxShadow: probeActive ? '0 0 12px rgba(139, 92, 246, 0.4)' : 'none',
                          transition: 'all 0.2s ease-in-out',
                        }}
                      >
                        {probeActive ? (
                          <div style={styles.activeSpinnerContainer}>
                            <span style={styles.spinnerSmall} />
                          </div>
                        ) : (
                          <div style={{
                            ...styles.probeStatusSmall,
                            backgroundColor: probe.passed ? '#10B981' : '#F43F5E',
                          }}>
                            {probe.passed ? '✓' : '✗'}
                          </div>
                        )}
                        <span style={{
                          ...styles.probeNameCompact,
                          color: probeActive ? '#A78BFA' : undefined,
                          fontWeight: probeActive ? 600 : undefined,
                        }}>{probe.name}</span>
                        {probeActive ? (
                          <span style={{ color: '#8B5CF6', fontSize: '11px' }}>Testing...</span>
                        ) : (
                          <>
                            {probe.score !== undefined && (
                              <span style={{
                                ...styles.probeScoreCompact,
                                color: probe.score >= 80 ? '#10B981' : 
                                       probe.score >= 50 ? '#F59E0B' : '#F43F5E',
                              }}>
                                {probe.score}%
                              </span>
                            )}
                            {probe.latency !== undefined && (
                              <span style={styles.probeLatencyCompact}>
                                {(probe.latency / 1000).toFixed(2)}s
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {isExpanded && filteredProbes.length === 0 && (
                <div style={styles.noProbesMessage}>
                  No {filter === 'passed' ? 'passed' : filter === 'failed' ? 'failed' : ''} probes in this category
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
};

// Tool category icons mapping
const TOOL_CATEGORY_ICONS: Record<string, string> = {
  'RAG - Semantic Search': '🔍',
  'File Operations': '📁',
  'Git Operations': '🔀',
  'NPM Operations': '📦',
  'Browser': '🌐',
  'HTTP/Search': '🌍',
  'Code Execution': '⚙️',
  'Memory': '🧠',
  'Text': '📝',
  'Process': '🔄',
  'Archive': '🗜️',
};

// Tools Tab Component - with collapsible sections like Capabilities
const ToolsTab: React.FC<{ profile: ModelProfile; testProgress?: TestProgress }> = ({ profile, testProgress }) => {
  const [expandedCategories, setExpandedCategories] = React.useState<Set<string>>(new Set());
  const [filter, setFilter] = React.useState<'all' | 'passed' | 'failed'>('all');
  const categories = profile.toolCategories || {};
  const activeToolRef = React.useRef<HTMLDivElement>(null);
  
  const filterTools = (tools: Array<{ name: string; score: number; testsPassed: number; enabled: boolean }>) => {
    if (filter === 'passed') return tools.filter(t => t.score >= 80);
    if (filter === 'failed') return tools.filter(t => t.score < 80);
    return tools;
  };
  
  const toggleCategory = (catName: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(catName)) {
        next.delete(catName);
      } else {
        next.add(catName);
      }
      return next;
    });
  };
  
  const getBarColor = (score: number) => {
    if (score >= 85) return '#10B981';
    if (score >= 70) return '#0EA5E9';
    if (score >= 50) return '#F59E0B';
    return '#F43F5E';
  };
  
  // Check if a specific tool is currently being tested
  const isToolActive = (toolName: string) => {
    if (!testProgress?.isRunning || testProgress.testType !== 'tools') return false;
    const currentTest = testProgress.currentTest?.toLowerCase() || '';
    const toolNameLower = toolName.toLowerCase();
    // Normalize strings (remove underscores, spaces, etc.)
    const normalize = (s: string) => s.replace(/[_\-\s]/g, '');
    const normalizedCurrent = normalize(currentTest);
    const normalizedTool = normalize(toolNameLower);
    // Match by tool name or partial match (flexible matching)
    return normalizedCurrent === normalizedTool ||
           normalizedCurrent.includes(normalizedTool) || 
           normalizedTool.includes(normalizedCurrent) ||
           currentTest === toolNameLower ||
           currentTest.includes(toolNameLower);
  };
  
  // Find which category contains the current tool being tested
  const getActiveCategoryForTool = (toolName: string): string | null => {
    for (const [catName, catData] of Object.entries(categories)) {
      if (catData.tools.some(t => t.name.toLowerCase() === toolName.toLowerCase())) {
        return catName;
      }
    }
    return null;
  };
  
  // Auto-expand category being tested and scroll to active tool
  React.useEffect(() => {
    if (testProgress?.isRunning && testProgress.testType === 'tools' && testProgress.currentTest) {
      const activeCategory = getActiveCategoryForTool(testProgress.currentTest);
      if (activeCategory) {
        setExpandedCategories(prev => new Set([...prev, activeCategory]));
      }
      // Scroll to active tool after a brief delay for DOM update
      setTimeout(() => {
        activeToolRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [testProgress?.currentTest]);
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
      {/* Filter Bar */}
      <div style={styles.filterBar}>
        <span style={styles.filterLabel}>Filter:</span>
        {(['all', 'passed', 'failed'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              ...styles.filterButton,
              ...(filter === f ? styles.filterButtonActive : {}),
              ...(f === 'passed' ? { color: filter === f ? '#fff' : '#10B981' } : {}),
              ...(f === 'failed' ? { color: filter === f ? '#fff' : '#F43F5E' } : {}),
              ...(f === 'passed' && filter === f ? { backgroundColor: '#10B981' } : {}),
              ...(f === 'failed' && filter === f ? { backgroundColor: '#F43F5E' } : {}),
            }}
          >
            {f === 'all' ? '📋 All' : f === 'passed' ? '✓ Passed' : '✗ Failed'}
          </button>
        ))}
      </div>
      
      {Object.entries(categories).length === 0 ? (
        <div style={styles.emptyCard}>
          <div style={{ textAlign: 'center', padding: '24px' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔧</div>
            <div style={{ color: '#94a3b8', marginBottom: '8px' }}>No tool data available</div>
            <div style={{ color: '#64748b', fontSize: '12px' }}>
              Run tests to see tool capability scores.
            </div>
          </div>
        </div>
      ) : (
        Object.entries(categories).map(([catName, catData]) => {
          const filteredTools = filterTools(catData.tools);
          const isExpanded = expandedCategories.has(catName);
          const avgScore = catData.tools.length > 0 
            ? Math.round(catData.tools.reduce((sum, t) => sum + t.score, 0) / catData.tools.length)
            : 0;
          const passedCount = catData.tools.filter(t => t.score >= 80).length;
          const icon = TOOL_CATEGORY_ICONS[catName] || '🔧';
          const isActive = testProgress?.isRunning && 
            testProgress.currentTest?.toLowerCase().includes(catName.toLowerCase().split(' ')[0]);
          
          return (
            <div key={catName} style={{
              ...styles.capabilityCard,
              ...(isActive ? styles.capabilityCardActive : {}),
            }}>
              {/* Category Header - Clickable */}
              <div 
                style={styles.capabilityHeader}
                onClick={() => toggleCategory(catName)}
              >
                <div style={styles.capabilityHeaderLeft}>
                  <span style={styles.capabilityIcon}>{icon}</span>
                  <span style={styles.capabilityName}>{catName}</span>
                  {isActive && (
                    <span style={styles.activeIndicator}>
                      <span style={styles.spinnerSmall} /> Testing...
                    </span>
                  )}
                </div>
                <div style={styles.capabilityHeaderRight}>
                  <span style={{
                    ...styles.capabilityScore,
                    color: getBarColor(avgScore),
                  }}>
                    {avgScore}%
                  </span>
                  <span style={styles.capabilityPassCount}>
                    {passedCount}/{catData.tools.length}
                  </span>
                  <span style={styles.expandIcon}>
                    {isExpanded ? '▼' : '▶'}
                  </span>
                </div>
              </div>
              
              {/* Progress Bar */}
              <div style={styles.capabilityBarBg}>
                <div style={{
                  ...styles.capabilityBarFill,
                  width: `${avgScore}%`,
                  backgroundColor: getBarColor(avgScore),
                }} />
              </div>
              
              {/* Expanded Tool Details */}
              {isExpanded && filteredTools.length > 0 && (
                <div style={styles.probeList}>
                  {filteredTools.map((tool, idx) => {
                    const isActive = isToolActive(tool.name);
                    return (
                      <div 
                        key={idx} 
                        ref={isActive ? activeToolRef : undefined}
                        style={{
                          ...styles.probeItemCompact,
                          borderColor: isActive ? '#8B5CF6' : 
                                       tool.score >= 80 ? '#10B98140' : 
                                       tool.score >= 50 ? '#F59E0B40' : '#F43F5E40',
                          backgroundColor: isActive ? '#8B5CF620' :
                                           tool.score >= 80 ? '#10B98108' : 
                                           tool.score >= 50 ? '#F59E0B08' : '#F43F5E08',
                          boxShadow: isActive ? '0 0 12px rgba(139, 92, 246, 0.4)' : 'none',
                          transition: 'all 0.2s ease-in-out',
                        }}
                      >
                        {isActive ? (
                          <div style={styles.activeSpinnerContainer}>
                            <span style={styles.spinnerSmall} />
                          </div>
                        ) : (
                          <div style={{
                            ...styles.probeStatusSmall,
                            backgroundColor: tool.score >= 80 ? '#10B981' : 
                                             tool.score >= 50 ? '#F59E0B' : '#F43F5E',
                          }}>
                            {tool.score >= 80 ? '✓' : tool.score >= 50 ? '~' : '✗'}
                          </div>
                        )}
                        <span style={{
                          ...styles.probeNameCompact,
                          color: isActive ? '#A78BFA' : undefined,
                          fontWeight: isActive ? 600 : undefined,
                        }}>{tool.name}</span>
                        {isActive ? (
                          <span style={{ color: '#8B5CF6', fontSize: '11px' }}>Testing...</span>
                        ) : (
                          <span style={{
                            ...styles.probeScoreCompact,
                            color: tool.score >= 80 ? '#10B981' : 
                                   tool.score >= 50 ? '#F59E0B' : '#F43F5E',
                          }}>
                            {tool.score}%
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {isExpanded && filteredTools.length === 0 && (
                <div style={styles.noProbesMessage}>
                  No {filter === 'passed' ? 'passed' : filter === 'failed' ? 'failed' : ''} tools in this category
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
};

// Performance Tab Component
const PerformanceTab: React.FC<{ profile: ModelProfile; latencyData: LatencyDataPoint[] }> = ({ 
  profile, 
  latencyData 
}) => {
  const latency = profile.contextLatency;
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
      {/* Speed Rating */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <span style={styles.cardIcon}>⚡</span>
          Speed Rating
        </div>
        <div style={styles.speedSection}>
          {latency?.speedRating && (
            <SpeedBadge rating={latency.speedRating} />
          )}
          <div style={styles.speedStats}>
            {latency?.maxUsableContext && (
              <div style={styles.speedStat}>
                <span style={styles.speedLabel}>Max Usable Context</span>
                <span style={styles.speedValue}>{(latency.maxUsableContext / 1000).toFixed(0)}k</span>
              </div>
            )}
            {latency?.recommendedContext && (
              <div style={styles.speedStat}>
                <span style={styles.speedLabel}>Recommended</span>
                <span style={styles.speedValue}>{(latency.recommendedContext / 1000).toFixed(0)}k</span>
              </div>
            )}
            <div style={styles.speedStat}>
              <span style={styles.speedLabel}>Interactive</span>
              <span style={{
                ...styles.speedValue,
                color: latency?.isInteractiveSpeed ? '#10B981' : '#F43F5E',
              }}>
                {latency?.isInteractiveSpeed ? 'Yes ✓' : 'No ✗'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Latency Chart */}
      {latencyData.length > 0 && (
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <span style={styles.cardIcon}>📈</span>
            Latency by Context Size
          </div>
          <LatencyChart data={latencyData} />
        </div>
      )}

      {/* Individual Latencies */}
      {latency?.latencies && Object.keys(latency.latencies).length > 0 && (
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <span style={styles.cardIcon}>⏱️</span>
            Detailed Latencies
          </div>
          <div style={styles.latencyGrid}>
            {Object.entries(latency.latencies)
              .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
              .map(([ctx, lat]) => (
                <div key={ctx} style={styles.latencyItem}>
                  <span style={styles.latencyContext}>{ctx}</span>
                  <span style={{
                    ...styles.latencyValue,
                    color: lat < 2000 ? '#10B981' : lat < 5000 ? '#F59E0B' : '#F43F5E',
                  }}>
                    {(lat / 1000).toFixed(2)}s
                  </span>
                </div>
              ))
            }
          </div>
        </div>
      )}
    </div>
  );
};

// Styles
const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    width: '100%',
    maxWidth: '100%',
    overflowY: 'auto',
    overflowX: 'hidden',
    backgroundColor: 'transparent', // Match parent background
    color: '#e2e8f0',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    boxSizing: 'border-box',
    padding: '8px', // Add padding to the container
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: '16px',
    color: '#64748b',
  },
  emptyIcon: {
    fontSize: '48px',
    opacity: 0.5,
  },
  emptyText: {
    fontSize: '14px',
  },
  // Loading Overlay - V1 Style
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    borderRadius: '10px',
  },
  loadingCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    padding: '24px',
    backgroundColor: '#1e293b',
    borderRadius: '12px',
    border: '1px solid #334155',
  },
  spinner: {
    width: '32px',
    height: '32px',
    border: '3px solid #334155',
    borderTop: '3px solid #14B8A6',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  loadingText: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#e2e8f0',
  },
  loadingMessage: {
    fontSize: '12px',
    color: '#64748b',
  },
  // Progress bar styles - V1 Style
  progressContainer: {
    padding: '10px 12px',
    backgroundColor: '#14B8A610',
    border: '1px solid #14B8A630',
    borderRadius: '8px',
    marginBottom: '8px',
  },
  progressHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  progressLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    fontWeight: 600,
    color: '#14B8A6',
  },
  pulsingDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: '#14B8A6',
    animation: 'pulse 1s infinite',
  },
  progressStats: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  progressEta: {
    fontSize: '11px',
    color: '#F59E0B',
    fontWeight: 500,
  },
  progressCount: {
    fontSize: '12px',
    color: '#94a3b8',
    fontFamily: "'JetBrains Mono', monospace",
  },
  progressBarBg: {
    height: '8px',
    backgroundColor: '#1e293b',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#14B8A6',
    borderRadius: '4px',
    transition: 'width 0.3s ease-out',
    boxShadow: '0 0 10px #14B8A680',
  },
  progressDetails: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginTop: '8px',
    padding: '6px 8px',
    backgroundColor: '#0f172a',
    borderRadius: '4px',
  },
  progressTestIcon: {
    fontSize: '12px',
  },
  progressCurrentTest: {
    fontSize: '11px',
    color: '#94a3b8',
    fontFamily: "'JetBrains Mono', monospace",
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  heroSection: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 24px',
    backgroundColor: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '10px',
    gap: '24px',
    minHeight: '200px',
    flexShrink: 0,
    marginBottom: '8px',
  },
  heroLeft: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    minWidth: '90px',
    flexShrink: 0,
  },
  heroCenter: {
    flex: 1,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'visible',
    minWidth: 0,
  },
  heroActions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    minWidth: '90px',
    flexShrink: 0,
  },
  actionButtonCompact: {
    padding: '6px 10px',
    backgroundColor: '#14B8A6',
    border: 'none',
    borderRadius: '6px',
    color: '#fff',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
  },
  actionButtonSecondaryCompact: {
    padding: '5px 8px',
    backgroundColor: 'transparent',
    border: '1px solid #334155',
    borderRadius: '6px',
    color: '#94a3b8',
    fontSize: '10px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
  },
  tabBar: {
    display: 'flex',
    gap: '2px',
    padding: '6px 8px',
    backgroundColor: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '10px',
    marginBottom: '8px',
  },
  tabButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '6px 10px',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '6px',
    color: '#94a3b8',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  tabButtonActive: {
    backgroundColor: '#14B8A620',
    color: '#14B8A6',
  },
  tabContent: {
    padding: '0',
    boxSizing: 'border-box',
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: '10px',
    border: '1px solid #334155',
    padding: '12px',
    marginBottom: '8px',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    fontWeight: 600,
    color: '#e2e8f0',
    marginBottom: '12px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  cardIcon: {
    fontSize: '14px',
  },
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '12px',
    marginBottom: '12px',
  },
  infoItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  infoLabel: {
    fontSize: '11px',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.3px',
  },
  infoValue: {
    fontSize: '13px',
    color: '#e2e8f0',
    fontWeight: 500,
  },
  description: {
    fontSize: '12px',
    color: '#94a3b8',
    lineHeight: 1.5,
    margin: 0,
  },
  badgesGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  badge: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 10px',
    backgroundColor: '#14B8A615',
    border: '1px solid #14B8A630',
    borderRadius: '16px',
  },
  badgeIcon: {
    fontSize: '12px',
  },
  badgeName: {
    fontSize: '11px',
    fontWeight: 500,
    color: '#14B8A6',
  },
  recList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  recItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 0',
    borderBottom: '1px solid #33415530',
  },
  recDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
  },
  recText: {
    flex: 1,
    fontSize: '12px',
    color: '#e2e8f0',
  },
  recBadge: {
    fontSize: '10px',
    fontWeight: 600,
    color: '#64748b',
    textTransform: 'uppercase',
  },
  actionsRow: {
    display: 'flex',
    gap: '8px',
  },
  actionButton: {
    flex: 1,
    padding: '10px 16px',
    backgroundColor: '#14B8A6',
    border: 'none',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'opacity 0.15s',
  },
  actionButtonSecondary: {
    flex: 1,
    padding: '10px 16px',
    backgroundColor: 'transparent',
    border: '1px solid #334155',
    borderRadius: '8px',
    color: '#94a3b8',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  skillRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  skillHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  skillIcon: {
    fontSize: '14px',
  },
  skillName: {
    flex: 1,
    fontSize: '12px',
    fontWeight: 500,
    color: '#e2e8f0',
  },
  skillScore: {
    fontSize: '12px',
    fontWeight: 700,
    fontFamily: "'JetBrains Mono', monospace",
  },
  skillBarBg: {
    height: '6px',
    backgroundColor: '#334155',
    borderRadius: '3px',
    overflow: 'hidden',
  },
  skillBarFill: {
    height: '100%',
    borderRadius: '3px',
    transition: 'width 0.3s ease-in-out',
  },
  emptyCard: {
    padding: '24px',
    textAlign: 'center',
    color: '#64748b',
    fontSize: '13px',
    backgroundColor: '#1e293b',
    borderRadius: '10px',
    border: '1px solid #334155',
  },
  toolGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: '8px',
  },
  toolItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 10px',
    backgroundColor: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '6px',
  },
  toolStatus: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
  },
  toolName: {
    flex: 1,
    fontSize: '11px',
    color: '#e2e8f0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  toolScore: {
    fontSize: '10px',
    fontWeight: 600,
    color: '#64748b',
  },
  probeGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  probeItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 12px',
    backgroundColor: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '6px',
  },
  probeStatus: {
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '10px',
    color: '#fff',
    fontWeight: 600,
    flexShrink: 0,
  },
  probeInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flex: 1,
    minWidth: 0,
  },
  probeName: {
    flex: 1,
    fontSize: '12px',
    color: '#e2e8f0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  probeScore: {
    fontSize: '12px',
    fontWeight: 600,
    flexShrink: 0,
  },
  probeLatency: {
    fontSize: '11px',
    color: '#64748b',
    flexShrink: 0,
  },
  // Capabilities Tab Styles
  filterBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    backgroundColor: '#1e293b',
    borderRadius: '8px',
    marginBottom: '8px',
  },
  filterLabel: {
    fontSize: '12px',
    color: '#64748b',
    marginRight: '4px',
  },
  filterButton: {
    padding: '4px 10px',
    fontSize: '11px',
    fontWeight: 500,
    backgroundColor: 'transparent',
    border: '1px solid #334155',
    borderRadius: '4px',
    color: '#94a3b8',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  filterButtonActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
    color: '#fff',
  },
  capabilityCard: {
    backgroundColor: '#1e293b',
    borderRadius: '8px',
    border: '1px solid #334155',
    marginBottom: '8px',
    overflow: 'hidden',
    transition: 'all 0.2s',
  },
  capabilityCardActive: {
    borderColor: '#8B5CF6',
    boxShadow: '0 0 12px rgba(139, 92, 246, 0.3)',
  },
  capabilityHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    cursor: 'pointer',
    userSelect: 'none',
  },
  capabilityHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  capabilityHeaderRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  capabilityIcon: {
    fontSize: '16px',
  },
  capabilityName: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#e2e8f0',
  },
  capabilityScore: {
    fontSize: '13px',
    fontWeight: 700,
  },
  capabilityPassCount: {
    fontSize: '11px',
    color: '#64748b',
  },
  expandIcon: {
    fontSize: '10px',
    color: '#64748b',
    transition: 'transform 0.2s',
  },
  capabilityBarBg: {
    height: '4px',
    backgroundColor: '#0f172a',
    margin: '0 12px 8px 12px',
    borderRadius: '2px',
    overflow: 'hidden',
  },
  capabilityBarFill: {
    height: '100%',
    borderRadius: '2px',
    transition: 'width 0.3s ease-in-out',
  },
  activeIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '11px',
    color: '#8B5CF6',
    marginLeft: '8px',
  },
  spinnerSmall: {
    width: '10px',
    height: '10px',
    border: '2px solid #8B5CF640',
    borderTopColor: '#8B5CF6',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  activeSpinnerContainer: {
    width: '18px',
    height: '18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
    backgroundColor: '#8B5CF620',
    flexShrink: 0,
  },
  probeList: {
    padding: '0 12px 12px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  probeItemCompact: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 10px',
    borderRadius: '4px',
    border: '1px solid',
  },
  probeStatusSmall: {
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '9px',
    color: '#fff',
    fontWeight: 600,
    flexShrink: 0,
  },
  probeNameCompact: {
    flex: 1,
    fontSize: '11px',
    color: '#e2e8f0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  probeScoreCompact: {
    fontSize: '11px',
    fontWeight: 600,
    flexShrink: 0,
  },
  probeLatencyCompact: {
    fontSize: '10px',
    color: '#64748b',
    flexShrink: 0,
  },
  noProbesMessage: {
    padding: '12px',
    fontSize: '11px',
    color: '#64748b',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  speedSection: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '20px',
  },
  speedStats: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  speedStat: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '16px',
  },
  speedLabel: {
    fontSize: '12px',
    color: '#94a3b8',
  },
  speedValue: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#e2e8f0',
  },
  latencyGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
    gap: '8px',
  },
  latencyItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 10px',
    backgroundColor: '#0f172a',
    borderRadius: '6px',
  },
  latencyContext: {
    fontSize: '11px',
    color: '#94a3b8',
  },
  latencyValue: {
    fontSize: '12px',
    fontWeight: 600,
    fontFamily: "'JetBrains Mono', monospace",
  },
};

export default ModelDetailV2;

