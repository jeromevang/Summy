import React, { useState, useRef, useEffect } from 'react';
import { ModelProfile, TestProgress } from '../types';
import { styles } from '../utils/styles';

interface CapabilitiesTabProps {
  profile: ModelProfile;
  testProgress?: TestProgress;
}

export const CapabilitiesTab: React.FC<CapabilitiesTabProps> = ({ profile, testProgress }) => {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'all' | 'passed' | 'failed'>('all');
  const activeProbeRef = useRef<HTMLDivElement>(null);
  
  const probeResults = profile.probeResults;
  
  const isProbeActive = (probeName: string) => {
    if (!testProgress?.isRunning || testProgress.testType !== 'probe') return false;
    const currentTest = testProgress.currentTest?.toLowerCase() || '';
    const probeNameLower = probeName.toLowerCase();
    const normalize = (s: string) => s.replace(/[^a-z0-9]/g, '');
    const normalizedCurrent = normalize(currentTest);
    const normalizedProbe = normalize(probeNameLower);
    return normalizedCurrent.includes(normalizedProbe) || 
           normalizedProbe.includes(normalizedCurrent) ||
           currentTest.includes(probeNameLower) || 
           probeNameLower.includes(currentTest);
  };
  
  const categories = [
    { id: 'rag', name: 'Strategic RAG', icon: '🔍', score: profile.scoreBreakdown?.ragScore ?? 0, probes: probeResults?.strategicRAGProbes },
    { id: 'architecture', name: 'Architecture', icon: '🏗️', score: profile.scoreBreakdown?.architecturalScore ?? 0, probes: probeResults?.architecturalProbes },
    { id: 'navigation', name: 'Navigation', icon: '🧭', score: profile.scoreBreakdown?.navigationScore ?? 0, probes: probeResults?.navigationProbes },
    { id: 'bug', name: 'Bug Detection', icon: '🐛', score: profile.scoreBreakdown?.bugDetectionScore ?? 0, probes: probeResults?.architecturalProbes?.filter(p => p.name.toLowerCase().includes('bug') || p.name.toLowerCase().includes('sql') || p.name.toLowerCase().includes('xss')) },
    { id: 'helicopter', name: 'Helicopter View', icon: '🚁', score: 0, probes: probeResults?.helicopterProbes },
    { id: 'proactive', name: 'Proactive', icon: '💡', score: profile.scoreBreakdown?.proactiveScore ?? 0, probes: probeResults?.proactiveProbes },
    { id: 'intent', name: 'Intent', icon: '🎯', score: profile.scoreBreakdown?.intentScore ?? 0, probes: probeResults?.intentProbes },
    { id: 'reasoning', name: 'Reasoning', icon: '🧠', score: profile.scoreBreakdown?.reasoningScore ?? 0, probes: probeResults?.reasoningProbes },
    { id: 'core', name: 'Core Behavior', icon: '🔬', score: 0, probes: probeResults?.coreProbes },
    { id: 'enhanced', name: 'Enhanced Behavior', icon: '⚡', score: 0, probes: probeResults?.enhancedProbes },
  ].filter(cat => cat.probes && cat.probes.length > 0);
  
  useEffect(() => {
    if (testProgress?.isRunning && testProgress.testType === 'probe' && testProgress.currentCategory) {
      const cat = testProgress.currentCategory.toLowerCase();
      categories.forEach(c => {
        if (cat.includes(c.name.toLowerCase()) || cat.includes(c.icon)) {
          setExpandedCategories(prev => new Set([...prev, c.id]));
        }
      });
      setTimeout(() => {
        activeProbeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [testProgress?.currentCategory, testProgress?.currentTest]);
  
  const toggleCategory = (id: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  
  const getBarColor = (score: number) => {
    if (score >= 85) return '#10B981';
    if (score >= 70) return '#0EA5E9';
    if (score >= 50) return '#F59E0B';
    return '#F43F5E';
  };
  
  const filterProbes = (probes: any[] | undefined) => {
    if (!probes) return [];
    if (filter === 'passed') return probes.filter(p => p.passed);
    if (filter === 'failed') return probes.filter(p => !p.passed);
    return probes;
  };
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
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
            }}
          >
            {f === 'all' ? '📋 All' : f === 'passed' ? '✓ Passed' : '✗ Failed'}
          </button>
        ))}
      </div>
      
      {categories.length === 0 ? (
        <div style={styles.emptyCard}>No capability data available</div>
      ) : (
        categories.map(cat => {
          const isExpanded = expandedCategories.has(cat.id);
          const filteredProbes = filterProbes(cat.probes);
          const calculatedScore = cat.score || (cat.probes && cat.probes.length > 0 
            ? Math.round(cat.probes.reduce((sum, p) => sum + (p.score ?? (p.passed ? 100 : 0)), 0) / cat.probes.length)
            : 0);
          const isActive = testProgress?.isRunning && testProgress.testType === 'probe' &&
            (testProgress.currentCategory?.toLowerCase().includes(cat.name.toLowerCase()) ||
             testProgress.currentCategory?.includes(cat.icon));

          return (
            <div key={cat.id} style={{ ...styles.capabilityCard, ...(isActive ? styles.capabilityCardActive : {}) }}>
              <div style={styles.capabilityHeader} onClick={() => toggleCategory(cat.id)}>
                <div style={styles.capabilityHeaderLeft}>
                  <span style={styles.capabilityIcon}>{cat.icon}</span>
                  <span style={styles.capabilityName}>{cat.name}</span>
                  {isActive && <span style={styles.activeIndicator}><span style={styles.spinnerSmall} /> Testing...</span>}
                </div>
                <div style={styles.capabilityHeaderRight}>
                  <span style={{ ...styles.capabilityScore, color: getBarColor(calculatedScore) }}>{calculatedScore}%</span>
                  <span style={styles.expandIcon}>{isExpanded ? '▼' : '▶'}</span>
                </div>
              </div>
              <div style={styles.capabilityBarBg}>
                <div style={{ ...styles.capabilityBarFill, width: `\${calculatedScore}%`, backgroundColor: getBarColor(calculatedScore) }} />
              </div>
              {isExpanded && (
                <div style={styles.probeList}>
                  {filteredProbes.map((probe, idx) => {
                    const probeActive = isProbeActive(probe.name);
                    return (
                      <div key={idx} ref={probeActive ? activeProbeRef : undefined} style={{ ...styles.probeItemCompact, borderColor: probeActive ? '#8B5CF6' : probe.passed ? '#10B98140' : '#F43F5E40' }}>
                        <div style={{ ...styles.probeStatusSmall, backgroundColor: probe.passed ? '#10B981' : '#F43F5E' }}>{probe.passed ? '✓' : '✗'}</div>
                        <span style={styles.probeNameCompact}>{probe.name}</span>
                        {probe.score !== undefined && <span style={styles.probeScoreCompact}>{probe.score}%</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
};
