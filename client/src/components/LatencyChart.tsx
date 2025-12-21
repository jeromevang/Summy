import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

export interface LatencyDataPoint {
  context: string;
  latency: number;
  contextSize: number;
}

interface LatencyChartProps {
  data: LatencyDataPoint[];
  interactiveThreshold?: number;
  height?: number;
}

export const LatencyChart: React.FC<LatencyChartProps> = ({
  data,
  interactiveThreshold = 3000,
  height = 180,
}) => {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis
            dataKey="context"
            tick={{ fill: '#94a3b8', fontSize: 10 }}
            tickLine={{ stroke: '#475569' }}
            axisLine={{ stroke: '#475569' }}
          />
          <YAxis
            tick={{ fill: '#94a3b8', fontSize: 10 }}
            tickLine={{ stroke: '#475569' }}
            axisLine={{ stroke: '#475569' }}
            tickFormatter={(value) => `${(value / 1000).toFixed(1)}s`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              fontSize: '12px',
            }}
            labelStyle={{
              color: '#e2e8f0',
              fontWeight: 600,
              marginBottom: '4px',
            }}
            formatter={(value: number) => [`${(value / 1000).toFixed(2)}s`, 'Latency']}
          />
          <ReferenceLine
            y={interactiveThreshold}
            stroke="#F59E0B"
            strokeDasharray="5 5"
            label={{
              value: 'Interactive',
              fill: '#F59E0B',
              fontSize: 10,
              position: 'right',
            }}
          />
          <Line
            type="monotone"
            dataKey="latency"
            stroke="#14B8A6"
            strokeWidth={2}
            dot={{
              fill: '#14B8A6',
              stroke: '#0f172a',
              strokeWidth: 2,
              r: 4,
            }}
            activeDot={{
              fill: '#14B8A6',
              stroke: '#fff',
              strokeWidth: 2,
              r: 6,
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

// Speed rating badge component
interface SpeedBadgeProps {
  rating: 'excellent' | 'good' | 'acceptable' | 'slow';
}

export const SpeedBadge: React.FC<SpeedBadgeProps> = ({ rating }) => {
  const config = {
    excellent: { color: '#10B981', bg: '#10B98120', icon: '⚡⚡', label: 'Excellent' },
    good: { color: '#0EA5E9', bg: '#0EA5E920', icon: '⚡', label: 'Good' },
    acceptable: { color: '#F59E0B', bg: '#F59E0B20', icon: '🔋', label: 'Acceptable' },
    slow: { color: '#F43F5E', bg: '#F43F5E20', icon: '🐌', label: 'Slow' },
  };
  
  const { color, bg, icon, label } = config[rating] || config.slow;
  
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '6px 12px',
      backgroundColor: bg,
      border: `1px solid ${color}40`,
      borderRadius: '20px',
      fontSize: '12px',
      fontWeight: 600,
      color: color,
    }}>
      <span>{icon}</span>
      <span>{label}</span>
    </div>
  );
};

export default LatencyChart;

