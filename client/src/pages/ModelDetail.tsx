import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Badges, BadgeRow, BADGE_DEFINITIONS } from '../components/Badges';
import type { Badge } from '../components/Badges';
import { Recommendations } from '../components/Recommendations';
import type { Recommendation } from '../components/Recommendations';

// ============================================================
// TYPES
// ============================================================

interface ProbeTestResult {
  passed: boolean;
  score: number;
  details: string;
  variants?: Array<{
    id: string;
    prompt: string;
    passed: boolean;
    result?: string;
  }>;
}

interface ProbeCategory {
  id: string;
  name: string;
  icon: string;
  probes: Record<string, ProbeTestResult>;
  score: number;
  passed: number;
  total: number;
}

interface ContextLatencyData {
  testedContextSizes: number[];
  latencies: Record<number, number>;
  maxUsableContext: number;
  recommendedContext: number;
  speedRating?: 'excellent' | 'good' | 'acceptable' | 'slow' | 'very_slow';
}

interface ToolCategory {
  name: string;
  tools: Array<{
    name: string;
    enabled: boolean;
    score: number;
  }>;
  enabledCount: number;
  totalCount: number;
  score: number;
}

interface ModelInfo {
  name?: string;
  author?: string;
  description?: string;
  parameters?: string;
  architecture?: string;
  contextLength?: number;
  license?: string;
  quantization?: string;
  capabilities?: string[];
  tags?: string[];
  source?: string;
}

interface ModelProfile {
  modelId: string;
  displayName: string;
  provider: 'lmstudio' | 'openai' | 'azure';
  testedAt: string;
  score: number;
  role?: string;
  enabledTools: string[];
  contextLatency?: ContextLatencyData;
  probeCategories?: ProbeCategory[];
  toolCategories?: ToolCategory[];
  badges?: Badge[];
  recommendations?: Recommendation[];
  modelInfo?: ModelInfo;
  scoreBreakdown?: {
    ragScore?: number;
    architecturalScore?: number;
    navigationScore?: number;
    proactiveScore?: number;
    toolScore?: number;
    reasoningScore?: number;
    intentScore?: number;
    bugDetectionScore?: number;
    overallScore?: number;
  };
}

// ============================================================
// STYLES
// ============================================================

const styles = {
  container: {
    padding: '24px',
    maxWidth: '1400px',
    margin: '0 auto',
  } as React.CSSProperties,

  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: '24px',
  } as React.CSSProperties,

  backButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px',
    color: '#b0b0b0',
    cursor: 'pointer',
    fontSize: '13px',
    marginBottom: '16px',
  } as React.CSSProperties,

  modelHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    borderRadius: '16px',
    padding: '24px',
    border: '1px solid rgba(255,255,255,0.08)',
    marginBottom: '24px',
  } as React.CSSProperties,

  scoreCircle: {
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #4ade80 0%, #22c55e 100%)',
    flexShrink: 0,
  } as React.CSSProperties,

  scoreValue: {
    fontSize: '28px',
    fontWeight: 700,
    color: '#fff',
    lineHeight: 1,
  } as React.CSSProperties,

  scoreLabel: {
    fontSize: '10px',
    color: 'rgba(255,255,255,0.8)',
    textTransform: 'uppercase' as const,
  } as React.CSSProperties,

  modelInfo: {
    flex: 1,
  } as React.CSSProperties,

  modelName: {
    fontSize: '24px',
    fontWeight: 600,
    color: '#fff',
    marginBottom: '4px',
  } as React.CSSProperties,

  modelMeta: {
    fontSize: '13px',
    color: '#888',
    marginBottom: '8px',
  } as React.CSSProperties,

  badgeRow: {
    marginTop: '8px',
  } as React.CSSProperties,

  actions: {
    position: 'relative' as const,
  } as React.CSSProperties,

  actionButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 20px',
    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
    border: 'none',
    borderRadius: '8px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
  } as React.CSSProperties,

  dropdown: {
    position: 'absolute' as const,
    top: '100%',
    right: 0,
    marginTop: '4px',
    background: '#1a1a2e',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '8px',
    padding: '8px 0',
    minWidth: '220px',
    zIndex: 100,
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
  } as React.CSSProperties,

  dropdownItem: {
    padding: '10px 16px',
    fontSize: '13px',
    color: '#e0e0e0',
    cursor: 'pointer',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  } as React.CSSProperties,

  dropdownDivider: {
    height: '1px',
    background: 'rgba(255,255,255,0.1)',
    margin: '8px 0',
  } as React.CSSProperties,

  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(6, 1fr)',
    gap: '12px',
    marginBottom: '24px',
  } as React.CSSProperties,

  scoreCard: {
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    borderRadius: '12px',
    padding: '16px',
    border: '1px solid rgba(255,255,255,0.08)',
    textAlign: 'center' as const,
  } as React.CSSProperties,

  scoreCardLabel: {
    fontSize: '11px',
    color: '#888',
    marginBottom: '8px',
    textTransform: 'uppercase' as const,
  } as React.CSSProperties,

  scoreCardValue: {
    fontSize: '28px',
    fontWeight: 700,
    color: '#4ade80',
  } as React.CSSProperties,

  section: {
    marginBottom: '24px',
  } as React.CSSProperties,

  sectionTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#e0e0e0',
    marginBottom: '12px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  } as React.CSSProperties,

  probeCategory: {
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.08)',
    marginBottom: '8px',
    overflow: 'hidden',
  } as React.CSSProperties,

  probeCategoryHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 16px',
    cursor: 'pointer',
  } as React.CSSProperties,

  probeCategoryLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  } as React.CSSProperties,

  probeCategoryIcon: {
    fontSize: '18px',
  } as React.CSSProperties,

  probeCategoryName: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#e0e0e0',
  } as React.CSSProperties,

  probeCategoryRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  } as React.CSSProperties,

  probeCategoryScore: {
    fontSize: '14px',
    fontWeight: 600,
    padding: '4px 10px',
    borderRadius: '6px',
    background: 'rgba(74, 222, 128, 0.15)',
    color: '#4ade80',
  } as React.CSSProperties,

  probeCategoryCount: {
    fontSize: '12px',
    color: '#888',
  } as React.CSSProperties,

  probeList: {
    padding: '0 16px 16px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  } as React.CSSProperties,

  probeItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    background: 'rgba(255,255,255,0.03)',
    borderRadius: '6px',
  } as React.CSSProperties,

  probeItemName: {
    fontSize: '12px',
    color: '#b0b0b0',
  } as React.CSSProperties,

  probeItemScore: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  } as React.CSSProperties,

  progressBar: {
    width: '80px',
    height: '6px',
    background: 'rgba(255,255,255,0.1)',
    borderRadius: '3px',
    overflow: 'hidden',
  } as React.CSSProperties,

  progressFill: {
    height: '100%',
    background: '#4ade80',
    borderRadius: '3px',
    transition: 'width 0.3s ease',
  } as React.CSSProperties,

  twoColumn: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '24px',
  } as React.CSSProperties,

  toolCategory: {
    background: 'rgba(255,255,255,0.03)',
    borderRadius: '8px',
    padding: '12px',
    marginBottom: '8px',
  } as React.CSSProperties,

  toolCategoryHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    cursor: 'pointer',
  } as React.CSSProperties,

  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px',
    color: '#888',
    fontSize: '14px',
  } as React.CSSProperties,

  error: {
    padding: '24px',
    background: 'rgba(248, 113, 113, 0.1)',
    border: '1px solid rgba(248, 113, 113, 0.3)',
    borderRadius: '12px',
    color: '#f87171',
    textAlign: 'center' as const,
  } as React.CSSProperties,
};

// ============================================================
// COMPONENT
// ============================================================

export const ModelDetail: React.FC = () => {
  const { modelId } = useParams<{ modelId: string }>();
  const navigate = useNavigate();
  
  const [profile, setProfile] = useState<ModelProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [probing, setProbing] = useState(false);
  const [probeStatus, setProbeStatus] = useState<string | null>(null);

  useEffect(() => {
    if (modelId) {
      fetchModelProfile(modelId);
    }
  }, [modelId]);

  const fetchModelProfile = async (id: string) => {
    try {
      setLoading(true);
      setError(null);
      
      // Use the /detail endpoint to get full profile with scoreBreakdown, badges, etc.
      const response = await fetch(`/api/tooly/models/${encodeURIComponent(id)}/detail`);
      if (!response.ok) {
        throw new Error('Failed to fetch model profile');
      }
      
      const data = await response.json();
      setProfile(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load model');
    } finally {
      setLoading(false);
    }
  };

  const handleRunProbes = async (categories?: string[], mode: 'quick' | 'full' = 'full') => {
    setDropdownOpen(false);
    setProbing(true);
    setProbeStatus(`Running ${mode} probes${categories ? ` for ${categories.length} categories` : ''}...`);
    
    try {
      console.log(`[ModelDetail] Starting probes for ${modelId} (mode: ${mode})`);
      const response = await fetch(`/api/tooly/probe/${encodeURIComponent(modelId!)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories, mode }),
      });
      
      if (response.ok) {
        setProbeStatus('Probes completed! Refreshing...');
        // Refresh after probes complete
        setTimeout(() => {
          fetchModelProfile(modelId!);
          setProbing(false);
          setProbeStatus(null);
        }, 2000);
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('[ModelDetail] Probe failed:', response.status, errorData);
        setProbeStatus(`Error: ${errorData.error || response.statusText}`);
        setTimeout(() => {
          setProbing(false);
          setProbeStatus(null);
        }, 5000);
      }
    } catch (err: any) {
      console.error('Failed to run probes:', err);
      setProbeStatus(`Error: ${err.message || 'Network error'}`);
      setTimeout(() => {
        setProbing(false);
        setProbeStatus(null);
      }, 5000);
    }
  };

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  const toggleToolCategory = (name: string) => {
    setExpandedTools(prev => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const getScoreColor = (score: number): string => {
    if (score >= 90) return '#4ade80';
    if (score >= 75) return '#fbbf24';
    if (score >= 50) return '#fb923c';
    return '#f87171';
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Loading model profile...</div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div style={styles.container}>
        <button style={styles.backButton} onClick={() => navigate('/tooly')}>
          ← Back to Models
        </button>
        <div style={styles.error}>{error || 'Model not found'}</div>
      </div>
    );
  }

  const probeCategories: ProbeCategory[] = profile.probeCategories || [
    { id: '3.x', name: 'Strategic RAG Probes', icon: '🔍', probes: {}, score: profile.scoreBreakdown?.ragScore || 0, passed: 0, total: 6 },
    { id: '4.x', name: 'Architectural Probes', icon: '🏗️', probes: {}, score: profile.scoreBreakdown?.architecturalScore || 0, passed: 0, total: 6 },
    { id: '5.x', name: 'Navigation Probes', icon: '🧭', probes: {}, score: profile.scoreBreakdown?.navigationScore || 0, passed: 0, total: 5 },
    { id: '6.x', name: 'Helicopter View', icon: '🚁', probes: {}, score: 0, passed: 0, total: 5 },
    { id: '7.x', name: 'Proactive Helpfulness', icon: '💡', probes: {}, score: profile.scoreBreakdown?.proactiveScore || 0, passed: 0, total: 8 },
    { id: '8.x', name: 'Intent Recognition', icon: '🎯', probes: {}, score: 0, passed: 0, total: 16 },
    { id: '1.x', name: 'Tool Behavior', icon: '🔧', probes: {}, score: profile.scoreBreakdown?.toolScore || 0, passed: 0, total: 8 },
    { id: '2.x', name: 'Reasoning', icon: '🧠', probes: {}, score: 0, passed: 0, total: 7 },
  ];

  return (
    <div style={styles.container}>
      {/* Back Button */}
      <button style={styles.backButton} onClick={() => navigate('/tooly')}>
        ← Back to Models
      </button>

      {/* Model Header */}
      <div style={styles.modelHeader}>
        <div 
          style={{
            ...styles.scoreCircle,
            background: `linear-gradient(135deg, ${getScoreColor(profile.score)} 0%, ${getScoreColor(profile.score)}dd 100%)`,
          }}
        >
          <span style={styles.scoreValue}>{profile.score}</span>
          <span style={styles.scoreLabel}>Score</span>
        </div>
        
        <div style={styles.modelInfo}>
          <div style={styles.modelName}>{profile.displayName}</div>
          <div style={styles.modelMeta}>
            Role: {profile.role || 'unknown'} • Provider: {profile.provider} • 
            Last tested: {profile.testedAt ? new Date(profile.testedAt).toLocaleString() : 'Never'}
          </div>
          {profile.modelInfo && (
            <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
              {profile.modelInfo.architecture && <span style={{ marginRight: '8px' }}>🏗️ {profile.modelInfo.architecture}</span>}
              {profile.modelInfo.parameters && <span style={{ marginRight: '8px' }}>📊 {profile.modelInfo.parameters}</span>}
              {profile.modelInfo.quantization && <span style={{ marginRight: '8px' }}>⚡ {profile.modelInfo.quantization}</span>}
              {profile.modelInfo.author && <span style={{ marginRight: '8px' }}>👤 {profile.modelInfo.author}</span>}
              {profile.modelInfo.capabilities && profile.modelInfo.capabilities.length > 0 && (
                <span style={{ marginRight: '8px' }}>✨ {profile.modelInfo.capabilities.join(', ')}</span>
              )}
            </div>
          )}
          <div style={styles.badgeRow}>
            {profile.badges && <BadgeRow badges={profile.badges} />}
          </div>
        </div>

        <div style={styles.actions}>
          <button 
            style={{
              ...styles.actionButton,
              opacity: probing ? 0.7 : 1,
              cursor: probing ? 'wait' : 'pointer'
            }}
            onClick={() => !probing && setDropdownOpen(!dropdownOpen)}
            disabled={probing}
          >
            {probing ? '⏳ Running...' : 'Run Probes ▼'}
          </button>
          
          {probeStatus && (
            <div style={{
              padding: '8px 12px',
              background: probeStatus.startsWith('Error') ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)',
              border: `1px solid ${probeStatus.startsWith('Error') ? 'rgba(239, 68, 68, 0.5)' : 'rgba(59, 130, 246, 0.5)'}`,
              borderRadius: '6px',
              fontSize: '13px',
              color: probeStatus.startsWith('Error') ? '#f87171' : '#60a5fa',
              marginLeft: '10px'
            }}>
              {probeStatus}
            </div>
          )}
          
          {dropdownOpen && !probing && (
            <div style={styles.dropdown}>
              <div 
                style={styles.dropdownItem}
                onClick={() => handleRunProbes(undefined, 'full')}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <span>Run All (Full)</span>
                <span style={{ color: '#888', fontSize: '11px' }}>~20 min</span>
              </div>
              <div 
                style={styles.dropdownItem}
                onClick={() => handleRunProbes(undefined, 'quick')}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <span>Run All (Quick)</span>
                <span style={{ color: '#888', fontSize: '11px' }}>~5 min</span>
              </div>
              <div style={styles.dropdownDivider} />
              {probeCategories.map(cat => (
                <div 
                  key={cat.id}
                  style={styles.dropdownItem}
                  onClick={() => handleRunProbes([cat.id], 'full')}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <span>Re-test: {cat.name} ({cat.id})</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Score Breakdown */}
      <div style={styles.grid}>
        <div style={styles.scoreCard}>
          <div style={styles.scoreCardLabel}>RAG</div>
          <div style={{ ...styles.scoreCardValue, color: getScoreColor(profile.scoreBreakdown?.ragScore || 0) }}>
            {profile.scoreBreakdown?.ragScore || '—'}%
          </div>
        </div>
        <div style={styles.scoreCard}>
          <div style={styles.scoreCardLabel}>Architecture</div>
          <div style={{ ...styles.scoreCardValue, color: getScoreColor(profile.scoreBreakdown?.architecturalScore || 0) }}>
            {profile.scoreBreakdown?.architecturalScore || '—'}%
          </div>
        </div>
        <div style={styles.scoreCard}>
          <div style={styles.scoreCardLabel}>Navigation</div>
          <div style={{ ...styles.scoreCardValue, color: getScoreColor(profile.scoreBreakdown?.navigationScore || 0) }}>
            {profile.scoreBreakdown?.navigationScore || '—'}%
          </div>
        </div>
        <div style={styles.scoreCard}>
          <div style={styles.scoreCardLabel}>Proactive</div>
          <div style={{ ...styles.scoreCardValue, color: getScoreColor(profile.scoreBreakdown?.proactiveScore || 0) }}>
            {profile.scoreBreakdown?.proactiveScore || '—'}%
          </div>
        </div>
        <div style={styles.scoreCard}>
          <div style={styles.scoreCardLabel}>Tools</div>
          <div style={{ ...styles.scoreCardValue, color: getScoreColor(profile.scoreBreakdown?.toolScore || 0) }}>
            {profile.scoreBreakdown?.toolScore || '—'}%
          </div>
        </div>
        <div style={styles.scoreCard}>
          <div style={styles.scoreCardLabel}>Intent</div>
          <div style={{ ...styles.scoreCardValue, color: getScoreColor((profile.scoreBreakdown as any)?.intentScore || 0) }}>
            {(profile.scoreBreakdown as any)?.intentScore || '—'}%
          </div>
        </div>
      </div>

      {/* Probe Results */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Probe Results (Collapsible Categories)</div>
        {probeCategories.map(category => (
          <div key={category.id} style={styles.probeCategory}>
            <div 
              style={styles.probeCategoryHeader}
              onClick={() => toggleCategory(category.id)}
            >
              <div style={styles.probeCategoryLeft}>
                <span>{expandedCategories.has(category.id) ? '▼' : '▶'}</span>
                <span style={styles.probeCategoryIcon}>{category.icon}</span>
                <span style={styles.probeCategoryName}>{category.name} ({category.id})</span>
              </div>
              <div style={styles.probeCategoryRight}>
                <span 
                  style={{
                    ...styles.probeCategoryScore,
                    color: getScoreColor(category.score),
                    background: `${getScoreColor(category.score)}20`,
                  }}
                >
                  {category.score}%
                </span>
                <span style={styles.probeCategoryCount}>
                  {category.passed}/{category.total}
                </span>
              </div>
            </div>
            
            {expandedCategories.has(category.id) && (
              <div style={styles.probeList}>
                {Object.entries(category.probes).length > 0 ? (
                  Object.entries(category.probes).map(([name, result]) => (
                    <div key={name} style={styles.probeItem}>
                      <span style={styles.probeItemName}>{name}</span>
                      <div style={styles.probeItemScore}>
                        <div style={styles.progressBar}>
                          <div 
                            style={{
                              ...styles.progressFill,
                              width: `${result.score}%`,
                              background: getScoreColor(result.score),
                            }}
                          />
                        </div>
                        <span style={{ fontSize: '12px', color: getScoreColor(result.score), fontWeight: 600 }}>
                          {result.score}%
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ padding: '12px', color: '#666', fontSize: '12px', textAlign: 'center' }}>
                    No probe data yet. Run probes to see results.
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Two Column Layout: Recommendations + Tools */}
      <div style={styles.twoColumn}>
        {/* Recommendations */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Recommendations</div>
          {profile.recommendations ? (
            <Recommendations 
              recommendations={profile.recommendations}
              onAlternativeClick={(id) => navigate(`/tooly/model/${encodeURIComponent(id)}`)}
            />
          ) : (
            <div style={{ padding: '16px', color: '#666', fontSize: '13px' }}>
              Run probes to see task recommendations.
            </div>
          )}
        </div>

        {/* Enabled Tools */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Enabled Tools</div>
          <div style={{ 
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
            borderRadius: '12px',
            padding: '16px',
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            {profile.toolCategories ? (
              profile.toolCategories.map(cat => (
                <div key={cat.name} style={styles.toolCategory}>
                  <div 
                    style={styles.toolCategoryHeader}
                    onClick={() => toggleToolCategory(cat.name)}
                  >
                    <span style={{ fontSize: '13px', color: '#e0e0e0' }}>
                      {expandedTools.has(cat.name) ? '▼' : '▶'} {cat.name}
                    </span>
                    <span style={{ fontSize: '12px', color: '#888' }}>
                      [{cat.enabledCount}/{cat.totalCount}] {cat.score}%
                    </span>
                  </div>
                  {expandedTools.has(cat.name) && (
                    <div style={{ marginTop: '8px', paddingLeft: '16px' }}>
                      {cat.tools.map(tool => (
                        <div 
                          key={tool.name}
                          style={{ 
                            fontSize: '11px', 
                            color: tool.enabled ? '#4ade80' : '#666',
                            padding: '2px 0',
                          }}
                        >
                          {tool.enabled ? '✓' : '○'} {tool.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div style={{ color: '#666', fontSize: '13px' }}>
                {profile.enabledTools.length} tools enabled
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Badges Section */}
      {profile.badges && profile.badges.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>All Badges</div>
          <Badges badges={profile.badges} size="large" showLabels showUnearned />
        </div>
      )}
    </div>
  );
};

export default ModelDetail;

