import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

interface DegradationData {
  contextLength: number;
  performance: number; // e.g., accuracy, score
}

interface ContextDegradationCurveProps {
  data: DegradationData[];
  modelName: string;
}

export const ContextDegradationCurve: React.FC<ContextDegradationCurveProps> = ({ data, modelName }) => {
  if (!data || data.length === 0) {
    return <div className="text-gray-500 text-center py-4">No degradation data available.</div>;
  }

  return (
    <div className="bg-obsidian-panel border border-white/5 rounded-xl p-4 shadow-2xl h-full">
      <h4 className="text-sm font-semibold text-white mb-4">📉 Context Degradation Curve: {modelName}</h4>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2d2d2d" />
          <XAxis 
            dataKey="contextLength" 
            label={{ value: 'Context Length (tokens)', position: 'insideBottomRight', offset: 0, fill: '#e0e0e0' }} 
            stroke="#e0e0e0" 
            tick={{ fill: '#e0e0e0', fontSize: 10 }}
          />
          <YAxis 
            label={{ value: 'Performance (%)', angle: -90, position: 'insideLeft', fill: '#e0e0e0' }} 
            stroke="#e0e0e0" 
            tick={{ fill: '#e0e0e0', fontSize: 10 }}
            domain={[0, 100]}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #3d3d3d', color: '#e0e0e0' }} 
            labelStyle={{ color: '#8b5cf6' }}
          />
          <Legend wrapperStyle={{ fontSize: '12px', color: '#e0e0e0' }} />
          <Line type="monotone" dataKey="performance" stroke="#10b981" activeDot={{ r: 8 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};