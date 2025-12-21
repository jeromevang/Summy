import React from 'react';

// ============================================================
// TYPES
// ============================================================

interface LeaderboardEntry {
  modelId: string;
  displayName: string;
  score: number;
  rank: number;
}

interface LeaderboardCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  entries: LeaderboardEntry[];
}

interface LeaderboardsProps {
  categories: LeaderboardCategory[];
  onModelClick?: (modelId: string) => void;
  loading?: boolean;
}

// ============================================================
// STYLES
// ============================================================

const styles = {
  container: {
    marginBottom: '24px',
  } as React.CSSProperties,
  
  title: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#e0e0e0',
    marginBottom: '16px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  } as React.CSSProperties,
  
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '12px',
  } as React.CSSProperties,
  
  card: {
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    borderRadius: '12px',
    padding: '16px',
    border: '1px solid rgba(255,255,255,0.08)',
    transition: 'all 0.2s ease',
  } as React.CSSProperties,
  
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '12px',
    paddingBottom: '8px',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
  } as React.CSSProperties,
  
  cardIcon: {
    fontSize: '18px',
  } as React.CSSProperties,
  
  cardTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#e0e0e0',
  } as React.CSSProperties,
  
  entryList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  } as React.CSSProperties,
  
  entry: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 8px',
    borderRadius: '6px',
    background: 'rgba(255,255,255,0.03)',
    cursor: 'pointer',
    transition: 'background 0.2s ease',
  } as React.CSSProperties,
  
  entryHover: {
    background: 'rgba(255,255,255,0.08)',
  } as React.CSSProperties,
  
  entryLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    overflow: 'hidden',
  } as React.CSSProperties,
  
  rank: {
    fontSize: '12px',
    fontWeight: 700,
    width: '18px',
    height: '18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '4px',
  } as React.CSSProperties,
  
  rank1: {
    background: 'linear-gradient(135deg, #ffd700 0%, #ffb300 100%)',
    color: '#1a1a2e',
  } as React.CSSProperties,
  
  rank2: {
    background: 'linear-gradient(135deg, #c0c0c0 0%, #a0a0a0 100%)',
    color: '#1a1a2e',
  } as React.CSSProperties,
  
  rank3: {
    background: 'linear-gradient(135deg, #cd7f32 0%, #a0522d 100%)',
    color: '#1a1a2e',
  } as React.CSSProperties,
  
  modelName: {
    fontSize: '12px',
    color: '#b0b0b0',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '100px',
  } as React.CSSProperties,
  
  score: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#4ade80',
  } as React.CSSProperties,
  
  emptyState: {
    fontSize: '12px',
    color: '#666',
    textAlign: 'center' as const,
    padding: '12px',
  } as React.CSSProperties,
  
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    color: '#666',
    fontSize: '13px',
  } as React.CSSProperties,
};

// ============================================================
// COMPONENT
// ============================================================

export const Leaderboards: React.FC<LeaderboardsProps> = ({
  categories,
  onModelClick,
  loading = false,
}) => {
  const [hoveredEntry, setHoveredEntry] = React.useState<string | null>(null);

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.title}>Category Leaderboards</div>
        <div style={styles.loading}>Loading leaderboards...</div>
      </div>
    );
  }

  if (!categories || categories.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.title}>Category Leaderboards</div>
        <div style={styles.emptyState}>
          No tested models yet. Run probes on models to see leaderboards.
        </div>
      </div>
    );
  }

  const getRankStyle = (rank: number): React.CSSProperties => {
    switch (rank) {
      case 1: return { ...styles.rank, ...styles.rank1 };
      case 2: return { ...styles.rank, ...styles.rank2 };
      case 3: return { ...styles.rank, ...styles.rank3 };
      default: return styles.rank;
    }
  };

  const getScoreColor = (score: number): string => {
    if (score >= 90) return '#4ade80';
    if (score >= 75) return '#fbbf24';
    if (score >= 50) return '#fb923c';
    return '#f87171';
  };

  return (
    <div style={styles.container}>
      <div style={styles.title}>Category Leaderboards</div>
      <div style={styles.grid}>
        {categories.map((category) => (
          <div key={category.id} style={styles.card}>
            <div style={styles.cardHeader}>
              <span style={styles.cardIcon}>{category.icon}</span>
              <span style={styles.cardTitle}>{category.name}</span>
            </div>
            <div style={styles.entryList}>
              {category.entries.length === 0 ? (
                <div style={styles.emptyState}>No data</div>
              ) : (
                category.entries.slice(0, 3).map((entry) => {
                  const entryKey = `${category.id}-${entry.modelId}`;
                  const isHovered = hoveredEntry === entryKey;
                  
                  return (
                    <div
                      key={entry.modelId}
                      style={{
                        ...styles.entry,
                        ...(isHovered ? styles.entryHover : {}),
                      }}
                      onMouseEnter={() => setHoveredEntry(entryKey)}
                      onMouseLeave={() => setHoveredEntry(null)}
                      onClick={() => onModelClick?.(entry.modelId)}
                    >
                      <div style={styles.entryLeft}>
                        <span style={getRankStyle(entry.rank)}>
                          {entry.rank}
                        </span>
                        <span style={styles.modelName} title={entry.displayName}>
                          {entry.displayName}
                        </span>
                      </div>
                      <span style={{ ...styles.score, color: getScoreColor(entry.score) }}>
                        {entry.score}%
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================
// DEFAULT CATEGORIES
// ============================================================

export const DEFAULT_LEADERBOARD_CATEGORIES = [
  { id: 'rag', name: 'Best for RAG', description: 'Strategic RAG score', icon: '🔍' },
  { id: 'architect', name: 'Best Architect', description: 'Architectural + Helicopter', icon: '🏗️' },
  { id: 'navigator', name: 'Best Navigator', description: 'Navigation score', icon: '🧭' },
  { id: 'reviewer', name: 'Best Reviewer', description: 'Bug detection + Proactive', icon: '🐛' },
  { id: 'proactive', name: 'Most Proactive', description: 'Proactive helpfulness', icon: '💡' },
  { id: 'overall', name: 'Best Overall', description: 'Weighted average', icon: '🏆' },
];

export default Leaderboards;

