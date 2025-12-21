import React from 'react';

// ============================================================
// TYPES
// ============================================================

export type Badge = {
  id: string;
  name: string;
  icon: string;
  description: string;
  earned: boolean;
  score?: number;
  threshold: number;
};

interface BadgesProps {
  badges: Badge[];
  size?: 'small' | 'medium' | 'large';
  showLabels?: boolean;
  showUnearned?: boolean;
}

// ============================================================
// BADGE DEFINITIONS
// ============================================================

export const BADGE_DEFINITIONS: Omit<Badge, 'earned' | 'score'>[] = [
  { id: 'rag_expert', name: 'RAG Expert', icon: '🔍', description: 'RAG score ≥90%', threshold: 90 },
  { id: 'bug_hunter', name: 'Bug Hunter', icon: '🐛', description: 'Bug detection ≥85%', threshold: 85 },
  { id: 'architect', name: 'Architect', icon: '🏗️', description: 'Architectural awareness ≥85%', threshold: 85 },
  { id: 'navigator', name: 'Navigator', icon: '🧭', description: 'Navigation ≥90%', threshold: 90 },
  { id: 'helpful', name: 'Helpful', icon: '💡', description: 'Proactive ≥85%', threshold: 85 },
  { id: 'speed_demon', name: 'Speed Demon', icon: '⚡', description: 'Excellent latency', threshold: 0 },
  { id: 'tool_master', name: 'Tool Master', icon: '🔧', description: 'Tool score ≥90%', threshold: 90 },
  { id: 'thinker', name: 'Thinker', icon: '🧠', description: 'Reasoning score ≥85%', threshold: 85 },
];

// ============================================================
// STYLES
// ============================================================

const getStyles = (size: 'small' | 'medium' | 'large') => {
  const sizes = {
    small: { icon: 16, font: 10, gap: 4, padding: '2px 4px' },
    medium: { icon: 20, font: 12, gap: 6, padding: '4px 8px' },
    large: { icon: 28, font: 14, gap: 8, padding: '6px 12px' },
  };
  
  const s = sizes[size];
  
  return {
    container: {
      display: 'flex',
      flexWrap: 'wrap' as const,
      gap: `${s.gap}px`,
    } as React.CSSProperties,
    
    badge: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: `${s.gap}px`,
      padding: s.padding,
      borderRadius: '6px',
      background: 'rgba(74, 222, 128, 0.15)',
      border: '1px solid rgba(74, 222, 128, 0.3)',
      transition: 'all 0.2s ease',
      cursor: 'default',
    } as React.CSSProperties,
    
    badgeUnearned: {
      background: 'rgba(255, 255, 255, 0.05)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      opacity: 0.5,
    } as React.CSSProperties,
    
    icon: {
      fontSize: `${s.icon}px`,
      lineHeight: 1,
    } as React.CSSProperties,
    
    label: {
      fontSize: `${s.font}px`,
      fontWeight: 500,
      color: '#e0e0e0',
    } as React.CSSProperties,
    
    iconOnly: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: `${s.icon}px`,
      cursor: 'default',
      transition: 'transform 0.2s ease',
    } as React.CSSProperties,
    
    tooltip: {
      position: 'absolute' as const,
      bottom: '100%',
      left: '50%',
      transform: 'translateX(-50%)',
      background: '#1a1a2e',
      border: '1px solid rgba(255,255,255,0.2)',
      borderRadius: '6px',
      padding: '6px 10px',
      fontSize: '11px',
      color: '#e0e0e0',
      whiteSpace: 'nowrap' as const,
      zIndex: 100,
      marginBottom: '4px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
    } as React.CSSProperties,
    
    wrapper: {
      position: 'relative' as const,
      display: 'inline-flex',
    } as React.CSSProperties,
  };
};

// ============================================================
// COMPONENT
// ============================================================

export const Badges: React.FC<BadgesProps> = ({
  badges,
  size = 'medium',
  showLabels = false,
  showUnearned = false,
}) => {
  const [hoveredBadge, setHoveredBadge] = React.useState<string | null>(null);
  const styles = getStyles(size);

  const displayBadges = showUnearned 
    ? badges 
    : badges.filter(b => b.earned);

  if (displayBadges.length === 0) {
    return null;
  }

  return (
    <div style={styles.container}>
      {displayBadges.map((badge) => (
        <div
          key={badge.id}
          style={styles.wrapper}
          onMouseEnter={() => setHoveredBadge(badge.id)}
          onMouseLeave={() => setHoveredBadge(null)}
        >
          {showLabels ? (
            <div style={{
              ...styles.badge,
              ...(badge.earned ? {} : styles.badgeUnearned),
            }}>
              <span style={styles.icon}>{badge.icon}</span>
              <span style={styles.label}>{badge.name}</span>
            </div>
          ) : (
            <span 
              style={{
                ...styles.iconOnly,
                opacity: badge.earned ? 1 : 0.3,
              }}
              title={badge.name}
            >
              {badge.icon}
            </span>
          )}
          
          {hoveredBadge === badge.id && (
            <div style={styles.tooltip}>
              <strong>{badge.name}</strong>
              <br />
              {badge.description}
              {badge.score !== undefined && (
                <>
                  <br />
                  Score: {badge.score}%
                </>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

// ============================================================
// COMPACT BADGE ROW (for model cards)
// ============================================================

interface BadgeRowProps {
  badges: Badge[];
  maxDisplay?: number;
}

export const BadgeRow: React.FC<BadgeRowProps> = ({ badges, maxDisplay = 5 }) => {
  const earnedBadges = badges.filter(b => b.earned);
  const displayBadges = earnedBadges.slice(0, maxDisplay);
  const remaining = earnedBadges.length - maxDisplay;

  if (displayBadges.length === 0) {
    return <span style={{ color: '#666', fontSize: '12px' }}>No badges</span>;
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
      {displayBadges.map((badge) => (
        <span 
          key={badge.id} 
          title={`${badge.name}: ${badge.description}`}
          style={{ fontSize: '16px', cursor: 'default' }}
        >
          {badge.icon}
        </span>
      ))}
      {remaining > 0 && (
        <span style={{ fontSize: '11px', color: '#888', marginLeft: '4px' }}>
          +{remaining}
        </span>
      )}
    </div>
  );
};

export default Badges;

