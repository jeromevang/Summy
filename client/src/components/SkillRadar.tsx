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

  // Calculate font size based on chart size
  const fontSize = size < 150 ? 8 : size < 200 ? 9 : 10;
  // Calculate margins to ensure labels are visible (need more space for longer labels)
  const margin = size < 150 ? 35 : size < 200 ? 40 : 45;

  return (
    <div style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart 
          data={chartData} 
          margin={{ top: margin, right: margin, bottom: margin, left: margin }}
          cx="50%"
          cy="50%"
          outerRadius={size < 150 ? '55%' : '60%'}
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

