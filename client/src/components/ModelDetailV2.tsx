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

type TabId = 'overview' | 'skills' | 'tools' | 'perf';

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
    if (testProgress?.isRunning && testProgress.currentCategory) {
      const cat = testProgress.currentCategory.toLowerCase();
      if (cat.includes('skill') || cat.includes('rag') || cat.includes('arch') || cat.includes('nav') || cat.includes('intent') || cat.includes('reason')) {
        setActiveTab('skills');
      } else if (cat.includes('tool') || cat.includes('emit') || cat.includes('schema') || cat.includes('selection')) {
        setActiveTab('tools');
      } else if (cat.includes('perf') || cat.includes('latency') || cat.includes('speed')) {
        setActiveTab('perf');
      }
    }
  }, [testProgress?.currentCategory, testProgress?.isRunning]);

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
    { id: 'skills', label: 'Skills', icon: '🎯' },
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
        
        {/* Center: Radar Chart - Fixed size */}
        <div style={styles.heroCenter}>
          <SkillRadar data={radarData} size={240} />
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

      {/* Test Progress Bar - V1 Style */}
      {testProgress?.isRunning && (
        <div style={styles.progressContainer}>
          <div style={styles.progressHeader}>
            <span style={styles.progressLabel}>
              <span style={styles.pulsingDot} />
              {testProgress.currentCategory || 'Running Tests...'}
            </span>
            <span style={styles.progressCount}>
              {testProgress.current}/{testProgress.total}
            </span>
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
            <span style={styles.progressCurrentTest}>{testProgress.currentTest}</span>
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
        {activeTab === 'skills' && <SkillsTab profile={profile} />}
        {activeTab === 'tools' && <ToolsTab profile={profile} />}
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

// Skills Tab Component
const SkillsTab: React.FC<{ profile: ModelProfile }> = ({ profile }) => {
  const skills = [
    { name: 'RAG Search', score: profile.scoreBreakdown?.ragScore ?? 0, icon: '🔍' },
    { name: 'Architecture', score: profile.scoreBreakdown?.architecturalScore ?? 0, icon: '🏗️' },
    { name: 'Navigation', score: profile.scoreBreakdown?.navigationScore ?? 0, icon: '🧭' },
    { name: 'Bug Detection', score: profile.scoreBreakdown?.bugDetectionScore ?? 0, icon: '🐛' },
    { name: 'Intent', score: profile.scoreBreakdown?.intentScore ?? 0, icon: '🎯' },
    { name: 'Reasoning', score: profile.scoreBreakdown?.reasoningScore ?? 0, icon: '🧠' },
    { name: 'Proactive', score: profile.scoreBreakdown?.proactiveScore ?? 0, icon: '💡' },
    { name: 'Tool Usage', score: profile.scoreBreakdown?.toolScore ?? 0, icon: '🔧' },
  ];

  const getBarColor = (score: number) => {
    if (score >= 85) return '#10B981';
    if (score >= 70) return '#0EA5E9';
    if (score >= 50) return '#F59E0B';
    return '#F43F5E';
  };

  return (
    <div style={styles.card}>
      {skills.map(skill => (
        <div key={skill.name} style={{ ...styles.skillRow, marginBottom: '8px' }}>
          <div style={styles.skillHeader}>
            <span style={styles.skillIcon}>{skill.icon}</span>
            <span style={styles.skillName}>{skill.name}</span>
            <span style={{
              ...styles.skillScore,
              color: getBarColor(skill.score),
            }}>
              {skill.score}%
            </span>
          </div>
          <div style={styles.skillBarBg}>
            <div style={{
              ...styles.skillBarFill,
              width: `${skill.score}%`,
              backgroundColor: getBarColor(skill.score),
            }} />
          </div>
        </div>
      ))}
    </div>
  );
};

// Tools Tab Component
const ToolsTab: React.FC<{ profile: ModelProfile }> = ({ profile }) => {
  const categories = profile.toolCategories || {};
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
      {Object.entries(categories).length === 0 ? (
        <div style={styles.emptyCard}>No tool data available. Run tests to populate.</div>
      ) : (
        Object.entries(categories).map(([catName, catData]) => (
          <div key={catName} style={styles.card}>
            <div style={styles.cardHeader}>
              {catName}
            </div>
            <div style={styles.toolGrid}>
              {catData.tools.map(tool => (
                <div key={tool.name} style={{
                  ...styles.toolItem,
                  borderColor: tool.score >= 80 ? '#10B98140' : 
                               tool.score >= 50 ? '#F59E0B40' : '#F43F5E40',
                }}>
                  <div style={{
                    ...styles.toolStatus,
                    backgroundColor: tool.score >= 80 ? '#10B981' : 
                                     tool.score >= 50 ? '#F59E0B' : '#F43F5E',
                  }} />
                  <span style={styles.toolName}>{tool.name}</span>
                  <span style={styles.toolScore}>{tool.score}%</span>
                </div>
              ))}
            </div>
          </div>
        ))
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
    overflow: 'hidden',
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
  progressCurrentTest: {
    fontSize: '11px',
    color: '#64748b',
    marginTop: '6px',
    display: 'block',
  },
  heroSection: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px',
    backgroundColor: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '10px',
    gap: '8px',
    minHeight: '100px',
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
    overflow: 'hidden',
    minWidth: 0,
    maxWidth: '140px',
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
    flex: 1,
    overflowY: 'auto',
    overflowX: 'hidden',
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

