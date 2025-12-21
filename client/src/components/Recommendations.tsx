import React from 'react';

// ============================================================
// TYPES
// ============================================================

export type RecommendationStatus = 'excellent' | 'good' | 'caution' | 'not_suitable';

export type Recommendation = {
  id: string;
  task: string;
  status: RecommendationStatus;
  score: number;
  description: string;
  alternative?: {
    modelId: string;
    modelName: string;
    score: number;
  };
};

interface RecommendationsProps {
  recommendations: Recommendation[];
  onAlternativeClick?: (modelId: string) => void;
}

// ============================================================
// STYLES
// ============================================================

const styles = {
  container: {
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    borderRadius: '12px',
    padding: '16px',
    border: '1px solid rgba(255,255,255,0.08)',
  } as React.CSSProperties,
  
  title: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#e0e0e0',
    marginBottom: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  } as React.CSSProperties,
  
  list: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  } as React.CSSProperties,
  
  item: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    padding: '10px 12px',
    borderRadius: '8px',
    background: 'rgba(255,255,255,0.03)',
  } as React.CSSProperties,
  
  icon: {
    fontSize: '18px',
    lineHeight: 1,
    flexShrink: 0,
    marginTop: '2px',
  } as React.CSSProperties,
  
  content: {
    flex: 1,
    minWidth: 0,
  } as React.CSSProperties,
  
  taskName: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#e0e0e0',
    marginBottom: '2px',
  } as React.CSSProperties,
  
  description: {
    fontSize: '11px',
    color: '#888',
    lineHeight: 1.4,
  } as React.CSSProperties,
  
  score: {
    fontSize: '12px',
    fontWeight: 600,
    flexShrink: 0,
    padding: '2px 8px',
    borderRadius: '4px',
  } as React.CSSProperties,
  
  alternative: {
    fontSize: '11px',
    color: '#888',
    marginTop: '4px',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  } as React.CSSProperties,
  
  alternativeLink: {
    color: '#60a5fa',
    cursor: 'pointer',
    textDecoration: 'underline',
  } as React.CSSProperties,
};

// ============================================================
// STATUS HELPERS
// ============================================================

const STATUS_CONFIG: Record<RecommendationStatus, { icon: string; color: string; bg: string }> = {
  excellent: { icon: '✅', color: '#4ade80', bg: 'rgba(74, 222, 128, 0.15)' },
  good: { icon: '👍', color: '#60a5fa', bg: 'rgba(96, 165, 250, 0.15)' },
  caution: { icon: '⚠️', color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.15)' },
  not_suitable: { icon: '❌', color: '#f87171', bg: 'rgba(248, 113, 113, 0.15)' },
};

// ============================================================
// COMPONENT
// ============================================================

export const Recommendations: React.FC<RecommendationsProps> = ({
  recommendations,
  onAlternativeClick,
}) => {
  if (!recommendations || recommendations.length === 0) {
    return null;
  }

  return (
    <div style={styles.container}>
      <div style={styles.title}>
        <span>📋</span>
        <span>Recommended For</span>
      </div>
      <div style={styles.list}>
        {recommendations.map((rec) => {
          const config = STATUS_CONFIG[rec.status];
          
          return (
            <div key={rec.id} style={styles.item}>
              <span style={styles.icon}>{config.icon}</span>
              <div style={styles.content}>
                <div style={styles.taskName}>{rec.task}</div>
                <div style={styles.description}>{rec.description}</div>
                {rec.alternative && rec.status !== 'excellent' && rec.status !== 'good' && (
                  <div style={styles.alternative}>
                    Consider{' '}
                    <span 
                      style={styles.alternativeLink}
                      onClick={() => onAlternativeClick?.(rec.alternative!.modelId)}
                    >
                      {rec.alternative.modelName}
                    </span>
                    {' '}({rec.alternative.score}%)
                  </div>
                )}
              </div>
              <span 
                style={{
                  ...styles.score,
                  color: config.color,
                  background: config.bg,
                }}
              >
                {rec.score}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ============================================================
// TASK DEFINITIONS
// ============================================================

export const RECOMMENDATION_TASKS = [
  { id: 'rag_search', task: 'RAG-based code search', scoreKey: 'ragScore' },
  { id: 'architecture', task: 'Architecture understanding', scoreKey: 'architecturalScore' },
  { id: 'navigation', task: 'Code navigation', scoreKey: 'navigationScore' },
  { id: 'code_review', task: 'Code review', scoreKey: 'proactiveScore' },
  { id: 'bug_detection', task: 'Security audits / Bug detection', scoreKey: 'bugDetectionScore' },
  { id: 'refactoring', task: 'Refactoring suggestions', scoreKey: 'proactiveScore' },
];

export default Recommendations;

