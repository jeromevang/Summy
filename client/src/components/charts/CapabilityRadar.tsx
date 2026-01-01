import React from 'react';
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Legend
} from 'recharts';

interface CapabilityData {
  skill: string;
  score: number;
  fullMark: number;
}

interface CapabilityRadarProps {
  data: CapabilityData[];
  modelName: string;
}

export const CapabilityRadar: React.FC<CapabilityRadarProps> = ({ data, modelName }) => {
  if (!data || data.length === 0) {
    return <div className="text-gray-500 text-center py-4">No capability data available.</div>;
  }

  return (
    <div className="bg-obsidian-panel border border-white/5 rounded-xl p-4 shadow-2xl h-full">
      <h4 className="text-sm font-semibold text-white mb-4">🔬 Capability Radar: {modelName}</h4>
      <ResponsiveContainer width="100%" height={250}>
        <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data}>
          <PolarGrid stroke="#2d2d2d" />
          <PolarAngleAxis dataKey="skill" stroke="#e0e0e0" tick={{ fill: '#e0e0e0', fontSize: 10 }} />
          <PolarRadiusAxis angle={90} domain={[0, 100]} stroke="#2d2d2d" tick={{ fill: '#e0e0e0', fontSize: 10 }} axisLine={false} />
          <Radar name="Score" dataKey="score" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.6} />
          <Legend wrapperStyle={{ fontSize: '12px', color: '#e0e0e0' }} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
};