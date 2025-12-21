import React from 'react';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';
import type { SystemMetric } from '../types';

interface SystemMetricsChartsProps {
  systemMetrics: SystemMetric[];
}

export const SystemMetricsCharts: React.FC<SystemMetricsChartsProps> = ({ systemMetrics }) => {
  const latestMetric = systemMetrics[systemMetrics.length - 1];
  
  return (
    <div className="grid grid-cols-2 gap-4 mb-4">
      <div className="bg-[#1a1a1a] rounded-lg p-3 border border-[#2d2d2d]">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-400">🖥️ CPU Usage</span>
          <span className="text-lg font-bold text-purple-400">
            {latestMetric?.cpu ?? 0}%
          </span>
        </div>
        <div className="h-16">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={systemMetrics}>
              <YAxis domain={[0, 100]} hide />
              <Line 
                type="monotone" 
                dataKey="cpu" 
                stroke="#8b5cf6" 
                strokeWidth={2} 
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="bg-[#1a1a1a] rounded-lg p-3 border border-[#2d2d2d]">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">🎮 GPU Usage</span>
            {latestMetric?.gpuTemp > 0 && (
              <span className={`text-xs ${
                latestMetric?.gpuTemp > 80 ? 'text-red-400' :
                latestMetric?.gpuTemp > 60 ? 'text-yellow-400' :
                'text-gray-500'
              }`}>
                🌡️ {latestMetric?.gpuTemp}°C
              </span>
            )}
          </div>
          <span className="text-lg font-bold text-green-400">
            {latestMetric?.gpu ?? 0}%
          </span>
        </div>
        <div className="h-16">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={systemMetrics}>
              <YAxis domain={[0, 100]} hide />
              <Line 
                type="monotone" 
                dataKey="gpu" 
                stroke="#10b981" 
                strokeWidth={2} 
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        {latestMetric?.gpuName && (
          <p className="text-xs text-gray-600 mt-1 truncate">
            {latestMetric?.gpuName}
          </p>
        )}
      </div>
    </div>
  );
};

