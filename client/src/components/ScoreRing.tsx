import React from 'react';

interface ScoreRingProps {
  score: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  sublabel?: string;
}

export const ScoreRing: React.FC<ScoreRingProps> = ({
  score,
  size = 120,
  strokeWidth = 10,
  label,
  sublabel,
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (score / 100) * circumference;
  
  // Color based on score
  const getColor = (s: number) => {
    if (s >= 85) return '#10B981'; // Emerald - excellent
    if (s >= 70) return '#0EA5E9'; // Sky - good
    if (s >= 50) return '#F59E0B'; // Amber - caution
    return '#F43F5E'; // Rose - poor
  };
  
  const color = getColor(score);
  
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '8px',
    }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg
          width={size}
          height={size}
          style={{ transform: 'rotate(-90deg)' }}
        >
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#334155"
            strokeWidth={strokeWidth}
          />
          {/* Progress circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{
              transition: 'stroke-dashoffset 0.5s ease-in-out',
              filter: `drop-shadow(0 0 8px ${color}40)`,
            }}
          />
        </svg>
        {/* Score text in center */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
        }}>
          <div style={{
            fontSize: size * 0.28,
            fontWeight: 700,
            color: color,
            lineHeight: 1,
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            {score}
          </div>
        </div>
      </div>
      {label && (
        <div style={{
          fontSize: '13px',
          fontWeight: 600,
          color: '#e2e8f0',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}>
          {label}
        </div>
      )}
      {sublabel && (
        <div style={{
          fontSize: '11px',
          color: '#94a3b8',
          marginTop: '-4px',
        }}>
          {sublabel}
        </div>
      )}
    </div>
  );
};

export default ScoreRing;

