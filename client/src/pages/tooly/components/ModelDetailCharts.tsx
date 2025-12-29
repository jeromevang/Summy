/**
 * Model Detail Charts
 * 
 * Visualization components for model performance data:
 * - Context Degradation Curve
 * - Latency Profile
 * - Behavioral Boundaries
 */

import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  ReferenceLine,
  CartesianGrid
} from 'recharts';

// ============================================================
// TYPES
// ============================================================

interface ContextFillResult {
  fillLevel: number;
  qualityScore: number;
  latencyMs: number;
  passed: boolean;
}

interface ContextPerformance {
  testedAt: string;
  contextLimit: number;
  results: ContextFillResult[];
  effectiveMaxContext: number;
  degradationCurve: number[];
  baseline: {
    qualityScore: number;
    latencyMs: number;
  };
}

interface LatencyProfile {
  points: Array<{
    contextLength: number;
    avgLatency: number;
    p95Latency: number;
    tokensPerSecond: number;
  }>;
  recommendedContext: number;
  maxStableContext: number;
}

interface BehavioralBoundaries {
  maxChainLength: number;
  maxNestingDepth: number;
  complexityCliff: number;
  chainResults: Array<{
    chainLength: number;
    passed: boolean;
    score: number;
  }>;
}

// ============================================================
// CONTEXT DEGRADATION CHART
// ============================================================

export const ContextDegradationChart: React.FC<{
  data: ContextPerformance | null;
}> = ({ data }) => {
  if (!data) {
    return (
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          📉 Context Degradation
        </h3>
        <div className="text-center py-8 text-gray-400">
          <div className="text-4xl mb-2">📊</div>
          <p>No context fill data available</p>
          <p className="text-sm mt-1">Run a context fill test to see degradation curve</p>
        </div>
      </div>
    );
  }

  const chartData = [
    { fillLevel: 0, qualityScore: data.baseline.qualityScore, label: '0%' },
    ...data.results.map(r => ({
      fillLevel: r.fillLevel,
      qualityScore: r.qualityScore,
      label: `${r.fillLevel}%`
    }))
  ];

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          📉 Context Degradation Curve
        </h3>
        <div className="text-sm text-gray-400">
          Effective Max: <span className="text-cyan-400 font-mono">{data.effectiveMaxContext.toLocaleString()}</span> tokens
        </div>
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="qualityGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis 
            dataKey="label" 
            stroke="#9ca3af" 
            fontSize={12}
            tick={{ fill: '#9ca3af' }}
          />
          <YAxis 
            domain={[0, 100]}
            stroke="#9ca3af" 
            fontSize={12}
            tick={{ fill: '#9ca3af' }}
            tickFormatter={(v) => `${v}%`}
          />
          <ReferenceLine y={70} stroke="#f59e0b" strokeDasharray="5 5" label={{ value: 'Threshold', fill: '#f59e0b', fontSize: 10 }} />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1f2937',
              border: '1px solid #374151',
              borderRadius: '8px'
            }}
            labelStyle={{ color: '#9ca3af' }}
            formatter={(value: number) => [`${value}%`, 'Quality']}
          />
          <Area
            type="monotone"
            dataKey="qualityScore"
            stroke="#06b6d4"
            fill="url(#qualityGradient)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4 mt-4">
        {data.results.map(r => (
          <div 
            key={r.fillLevel}
            className={`text-center p-2 rounded-lg ${
              r.passed ? 'bg-green-500/10' : 'bg-red-500/10'
            }`}
          >
            <div className={`text-lg font-bold ${r.passed ? 'text-green-400' : 'text-red-400'}`}>
              {r.qualityScore}%
            </div>
            <div className="text-xs text-gray-400">{r.fillLevel}% fill</div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================
// LATENCY PROFILE CHART
// ============================================================

export const LatencyProfileChart: React.FC<{
  data: LatencyProfile | null;
}> = ({ data }) => {
  if (!data || !data.points || data.points.length === 0) {
    return (
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          ⏱️ Latency Profile
        </h3>
        <div className="text-center py-8 text-gray-400">
          <div className="text-4xl mb-2">⏱️</div>
          <p>No latency data available</p>
          <p className="text-sm mt-1">Run a latency profile test</p>
        </div>
      </div>
    );
  }

  const chartData = data.points.map(p => ({
    context: `${(p.contextLength / 1000).toFixed(0)}K`,
    contextLength: p.contextLength,
    avgLatency: p.avgLatency,
    p95Latency: p.p95Latency,
    tps: p.tokensPerSecond
  }));

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          ⏱️ Latency Profile
        </h3>
        <div className="flex gap-4 text-sm">
          <span className="text-gray-400">
            Recommended: <span className="text-green-400 font-mono">{(data.recommendedContext / 1000).toFixed(0)}K</span>
          </span>
          <span className="text-gray-400">
            Max Stable: <span className="text-yellow-400 font-mono">{(data.maxStableContext / 1000).toFixed(0)}K</span>
          </span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis 
            dataKey="context" 
            stroke="#9ca3af" 
            fontSize={12}
            tick={{ fill: '#9ca3af' }}
          />
          <YAxis 
            yAxisId="left"
            stroke="#9ca3af" 
            fontSize={12}
            tick={{ fill: '#9ca3af' }}
            tickFormatter={(v) => `${v}ms`}
          />
          <YAxis 
            yAxisId="right"
            orientation="right"
            stroke="#9ca3af" 
            fontSize={12}
            tick={{ fill: '#9ca3af' }}
            tickFormatter={(v) => `${v}t/s`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1f2937',
              border: '1px solid #374151',
              borderRadius: '8px'
            }}
            labelStyle={{ color: '#9ca3af' }}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="avgLatency"
            stroke="#06b6d4"
            strokeWidth={2}
            dot={{ fill: '#06b6d4', r: 4 }}
            name="Avg Latency (ms)"
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="p95Latency"
            stroke="#f59e0b"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={{ fill: '#f59e0b', r: 3 }}
            name="P95 Latency (ms)"
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="tps"
            stroke="#10b981"
            strokeWidth={2}
            dot={{ fill: '#10b981', r: 4 }}
            name="Tokens/sec"
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex justify-center gap-6 mt-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-cyan-400"></div>
          <span className="text-gray-400">Avg Latency</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-0.5 bg-yellow-400"></div>
          <span className="text-gray-400">P95 Latency</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-400"></div>
          <span className="text-gray-400">Tokens/sec</span>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// BEHAVIORAL BOUNDARIES CHART
// ============================================================

export const BehavioralBoundariesChart: React.FC<{
  data: BehavioralBoundaries | null;
}> = ({ data }) => {
  if (!data) {
    return (
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          🧱 Behavioral Boundaries
        </h3>
        <div className="text-center py-8 text-gray-400">
          <div className="text-4xl mb-2">🧱</div>
          <p>No boundary data available</p>
          <p className="text-sm mt-1">Run boundary detection tests</p>
        </div>
      </div>
    );
  }

  const chainData = data.chainResults || [
    { chainLength: 2, passed: true, score: 100 },
    { chainLength: 4, passed: data.maxChainLength >= 4, score: data.maxChainLength >= 4 ? 80 : 40 },
    { chainLength: 6, passed: data.maxChainLength >= 6, score: data.maxChainLength >= 6 ? 60 : 20 },
    { chainLength: 8, passed: data.maxChainLength >= 8, score: data.maxChainLength >= 8 ? 40 : 0 },
  ];

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        🧱 Behavioral Boundaries
      </h3>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-gray-700/30 rounded-lg p-4 text-center">
          <div className="text-3xl font-bold text-cyan-400">{data.maxChainLength}</div>
          <div className="text-sm text-gray-400">Max Tool Chain</div>
        </div>
        <div className="bg-gray-700/30 rounded-lg p-4 text-center">
          <div className="text-3xl font-bold text-purple-400">{data.maxNestingDepth}</div>
          <div className="text-sm text-gray-400">Max Nesting Depth</div>
        </div>
        <div className="bg-gray-700/30 rounded-lg p-4 text-center">
          <div className="text-3xl font-bold text-yellow-400">{data.complexityCliff}</div>
          <div className="text-sm text-gray-400">Complexity Cliff</div>
        </div>
      </div>

      {/* Tool Chain Success Bar Chart */}
      <div className="mb-4">
        <div className="text-sm text-gray-400 mb-2">Tool Chain Performance</div>
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={chainData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
            <XAxis type="number" domain={[0, 100]} stroke="#9ca3af" fontSize={12} tickFormatter={v => `${v}%`} />
            <YAxis 
              type="category" 
              dataKey="chainLength" 
              stroke="#9ca3af" 
              fontSize={12}
              tickFormatter={v => `${v} tools`}
              width={60}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1f2937',
                border: '1px solid #374151',
                borderRadius: '8px'
              }}
              formatter={(value: number) => [`${value}%`, 'Score']}
            />
            <Bar dataKey="score" radius={[0, 4, 4, 0]}>
              {chainData.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={entry.passed ? '#10b981' : '#ef4444'} 
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Complexity Cliff Indicator */}
      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <div className="text-yellow-400 font-medium">Complexity Cliff at {data.complexityCliff} operations</div>
            <div className="text-sm text-gray-400">
              Model performance drops sharply beyond this complexity level
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// COMBINED CHARTS PANEL
// ============================================================

export const ModelDetailChartsPanel: React.FC<{
  contextPerformance: ContextPerformance | null;
  latencyProfile: LatencyProfile | null;
  behavioralBoundaries: BehavioralBoundaries | null;
}> = ({ contextPerformance, latencyProfile, behavioralBoundaries }) => {
  return (
    <div className="space-y-6">
      <ContextDegradationChart data={contextPerformance} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LatencyProfileChart data={latencyProfile} />
        <BehavioralBoundariesChart data={behavioralBoundaries} />
      </div>
    </div>
  );
};

export default ModelDetailChartsPanel;



