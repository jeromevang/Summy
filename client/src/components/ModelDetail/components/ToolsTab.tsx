import React, { useState, useRef, useEffect } from 'react';
import { ModelProfile, TestProgress } from '../types';
import { styles } from '../utils/styles';

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

interface ToolsTabProps {
  profile: ModelProfile;
  testProgress?: TestProgress;
}

export const ToolsTab: React.FC<ToolsTabProps> = ({ profile, testProgress }) => {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'all' | 'passed' | 'failed'>('all');
  const categories = profile.toolCategories || {};
  const activeToolRef = useRef<HTMLDivElement>(null);
  
  const filterTools = (tools: any[]) => {
    if (filter === 'passed') return tools.filter(t => t.score >= 80);
    if (filter === 'failed') return tools.filter(t => t.score < 80);
    return tools;
  };
  
  const toggleCategory = (catName: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(catName)) next.delete(catName);
      else next.add(catName);
      return next;
    });
  };
  
  const getBarColor = (score: number) => {
    if (score >= 85) return '#10B981';
    if (score >= 70) return '#0EA5E9';
    if (score >= 50) return '#F59E0B';
    return '#F43F5E';
  };
  
  const isToolActive = (toolName: string) => {
    if (!testProgress?.isRunning || testProgress.testType !== 'tools') return false;
    const currentTest = testProgress.currentTest?.toLowerCase() || '';
    const toolNameLower = toolName.toLowerCase();
    const normalize = (s: string) => s.replace(/[_\-\s]/g, '');
    return normalize(currentTest) === normalize(toolNameLower) || normalize(currentTest).includes(normalize(toolNameLower));
  };
  
  useEffect(() => {
    if (testProgress?.isRunning && testProgress.testType === 'tools' && testProgress.currentTest) {
      for (const [catName, catData] of Object.entries(categories)) {
        if (catData.tools.some(t => t.name.toLowerCase() === testProgress.currentTest!.toLowerCase())) {
          setExpandedCategories(prev => new Set([...prev, catName]));
          break;
        }
      }
      setTimeout(() => activeToolRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
    }
  }, [testProgress?.currentTest]);
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
      <div style={styles.filterBar}>
        <span style={styles.filterLabel}>Filter:</span>
        {(['all', 'passed', 'failed'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ ...styles.filterButton, ...(filter === f ? styles.filterButtonActive : {}) }}>
            {f === 'all' ? '📋 All' : f === 'passed' ? '✓ Passed' : '✗ Failed'}
          </button>
        ))}
      </div>
      
      {Object.entries(categories).length === 0 ? (
        <div style={styles.emptyCard}>No tool data available</div>
      ) : (
        Object.entries(categories).map(([catName, catData]) => {
          const filteredTools = filterTools(catData.tools);
          const isExpanded = expandedCategories.has(catName);
          const avgScore = catData.tools.length > 0 ? Math.round(catData.tools.reduce((sum, t) => sum + t.score, 0) / catData.tools.length) : 0;
          const icon = TOOL_CATEGORY_ICONS[catName] || '🔧';
          const isActive = testProgress?.isRunning && testProgress.currentTest?.toLowerCase().includes(catName.toLowerCase().split(' ')[0]);
          
          return (
            <div key={catName} style={{ ...styles.capabilityCard, ...(isActive ? styles.capabilityCardActive : {}) }}>
              <div style={styles.capabilityHeader} onClick={() => toggleCategory(catName)}>
                <div style={styles.capabilityHeaderLeft}>
                  <span style={styles.capabilityIcon}>{icon}</span>
                  <span style={styles.capabilityName}>{catName}</span>
                </div>
                <div style={styles.capabilityHeaderRight}>
                  <span style={{ ...styles.capabilityScore, color: getBarColor(avgScore) }}>{avgScore}%</span>
                  <span style={styles.expandIcon}>{isExpanded ? '▼' : '▶'}</span>
                </div>
              </div>
              <div style={styles.capabilityBarBg}>
                <div style={{ ...styles.capabilityBarFill, width: `\${avgScore}%`, backgroundColor: getBarColor(avgScore) }} />
              </div>
              {isExpanded && (
                <div style={styles.probeList}>
                  {filteredTools.map((tool, idx) => {
                    const isActive = isToolActive(tool.name);
                    return (
                      <div key={idx} ref={isActive ? activeToolRef : undefined} style={{ ...styles.probeItemCompact, borderColor: isActive ? '#8B5CF6' : tool.score >= 80 ? '#10B98140' : '#F43F5E40' }}>
                        <div style={{ ...styles.probeStatusSmall, backgroundColor: tool.score >= 80 ? '#10B981' : '#F43F5E' }}>{tool.score >= 80 ? '✓' : '✗'}</div>
                        <span style={styles.probeNameCompact}>{tool.name}</span>
                        <span style={styles.probeScoreCompact}>{tool.score}%</span>
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
