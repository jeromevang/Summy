import React from 'react';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

export interface SkillData {
  skill: string;
  score: number;
  fullMark?: number;
}

interface SkillRadarProps {
  data: SkillData[];
  size?: number;
}

export const SkillRadar: React.FC<SkillRadarProps> = ({ data, size = 200 }) => {
  // Ensure all data points have fullMark
  const chartData = data.map(d => ({
    ...d,
    fullMark: d.fullMark || 100,
  }));

  // Optimized sizing for minimal wasted space while keeping labels readable
  // Smaller margins, larger outerRadius = more chart, less whitespace
  const fontSize = Math.max(9, Math.min(11, size / 20));
  const margin = Math.max(20, size * 0.12); // Tighter margins
  const outerRadius = '75%'; // Larger chart area

  return (
    <div style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart 
          data={chartData} 
          margin={{ top: margin, right: margin + 10, bottom: margin, left: margin + 10 }}
          cx="50%"
          cy="50%"
          outerRadius={outerRadius}
        >
          <PolarGrid 
            stroke="#334155" 
            gridType="polygon"
          />
          <PolarAngleAxis
            dataKey="skill"
            tick={{ 
              fill: '#94a3b8', 
              fontSize: fontSize,
              fontWeight: 500,
            }}
            tickLine={false}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={false}
            axisLine={false}
          />
          <Radar
            name="Score"
            dataKey="score"
            stroke="#14B8A6"
            fill="#14B8A6"
            fillOpacity={0.3}
            strokeWidth={2}
            dot={{
              r: 3,
              fill: '#14B8A6',
              stroke: '#0f172a',
              strokeWidth: 1,
            }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            }}
            labelStyle={{
              color: '#e2e8f0',
              fontWeight: 600,
            }}
            itemStyle={{
              color: '#14B8A6',
            }}
            formatter={(value: number) => [`${value}%`, 'Score']}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default SkillRadar;

