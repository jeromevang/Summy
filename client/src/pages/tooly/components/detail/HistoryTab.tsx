/**
 * History Tab Component
 * Previous test runs, score trends, and learning events
 */

import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface TestHistoryEntry {
  id: string;
  testMode: string;
  scores: Record<string, number>;
  durationMs: number;
  testCount: number;
  passedCount: number;
  failedCount: number;
  timestamp: string;
}

interface HistoryTabProps {
  modelId: string;
}

export const HistoryTab: React.FC<HistoryTabProps> = ({ modelId }) => {
  const [history, setHistory] = useState<TestHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'chart'>('list');

  useEffect(() => {
    fetchHistory();
  }, [modelId]);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const response = await fetch(`http://localhost:3001/api/tooly/models/${encodeURIComponent(modelId)}/test/history`);
      if (response.ok) {
        const data = await response.json();
        setHistory(data.history || []);
      }
    } catch (err) {
      console.error('Failed to fetch history:', err);
    } finally {
      setLoading(false);
    }
  };

  // Prepare chart data
  const chartData = history.map(entry => ({
    date: new Date(entry.timestamp).toLocaleDateString(),
    overall: entry.scores?.overallScore || 0,
    tool: entry.scores?.toolScore || 0,
    reasoning: entry.scores?.reasoningScore || 0,
    rag: entry.scores?.ragScore || 0
  })).reverse();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin text-4xl">⚙️</div>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-500">
        <span className="text-4xl mb-4">📈</span>
        <p>No test history yet</p>
        <p className="text-sm mt-1">Run tests to track progress over time</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* View Toggle */}
      <div className="flex justify-end">
        <div className="inline-flex bg-[#161616] rounded-lg border border-[#2d2d2d]">
          <button
            onClick={() => setView('list')}
            className={`px-4 py-2 text-sm ${
              view === 'list' 
                ? 'text-purple-400 bg-purple-500/10' 
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            📋 List
          </button>
          <button
            onClick={() => setView('chart')}
            className={`px-4 py-2 text-sm ${
              view === 'chart' 
                ? 'text-purple-400 bg-purple-500/10' 
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            📈 Chart
          </button>
        </div>
      </div>

      {/* Chart View */}
      {view === 'chart' && chartData.length > 1 && (
        <div className="bg-[#161616] rounded-lg p-4 border border-[#2d2d2d]">
          <h4 className="text-white font-medium mb-4">Score Trends</h4>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis 
                  dataKey="date" 
                  stroke="#666" 
                  fontSize={12}
                />
                <YAxis 
                  domain={[0, 100]} 
                  stroke="#666" 
                  fontSize={12}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1a1a1a', 
                    border: '1px solid #2d2d2d',
                    borderRadius: '8px'
                  }}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="overall" 
                  stroke="#a855f7" 
                  strokeWidth={2}
                  dot={{ fill: '#a855f7' }}
                  name="Overall"
                />
                <Line 
                  type="monotone" 
                  dataKey="tool" 
                  stroke="#3b82f6" 
                  strokeWidth={1.5}
                  dot={{ fill: '#3b82f6' }}
                  name="Tools"
                />
                <Line 
                  type="monotone" 
                  dataKey="reasoning" 
                  stroke="#22c55e" 
                  strokeWidth={1.5}
                  dot={{ fill: '#22c55e' }}
                  name="Reasoning"
                />
                <Line 
                  type="monotone" 
                  dataKey="rag" 
                  stroke="#f59e0b" 
                  strokeWidth={1.5}
                  dot={{ fill: '#f59e0b' }}
                  name="RAG"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* List View */}
      {view === 'list' && (
        <div className="space-y-3">
          {history.map(entry => (
            <div 
              key={entry.id}
              className="bg-[#161616] rounded-lg p-4 border border-[#2d2d2d]"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    entry.testMode === 'quick' ? 'bg-gray-700 text-gray-300' :
                    entry.testMode === 'standard' ? 'bg-purple-500/20 text-purple-400' :
                    entry.testMode === 'deep' ? 'bg-blue-500/20 text-blue-400' :
                    'bg-amber-500/20 text-amber-400'
                  }`}>
                    {entry.testMode}
                  </span>
                  <span className="text-gray-400 text-sm">
                    {new Date(entry.timestamp).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-green-400 text-sm">
                    ✓ {entry.passedCount}
                  </span>
                  <span className="text-red-400 text-sm">
                    ✗ {entry.failedCount}
                  </span>
                  <span className="text-gray-500 text-sm">
                    {(entry.durationMs / 1000).toFixed(1)}s
                  </span>
                </div>
              </div>
              
              {/* Score Breakdown */}
              <div className="grid grid-cols-5 gap-2">
                {entry.scores && Object.entries(entry.scores)
                  .filter(([key]) => key !== 'overallScore')
                  .slice(0, 5)
                  .map(([key, value]) => (
                    <div key={key} className="text-center">
                      <div className="text-white font-mono text-sm">{value}%</div>
                      <div className="text-gray-500 text-xs">
                        {key.replace(/Score$/, '')}
                      </div>
                    </div>
                  ))}
              </div>
              
              {/* Overall Score Bar */}
              <div className="mt-3 pt-3 border-t border-[#2d2d2d]">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-gray-400 text-sm">Overall Score</span>
                  <span className="text-white font-mono">
                    {entry.scores?.overallScore || 0}%
                  </span>
                </div>
                <div className="h-2 bg-[#2d2d2d] rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full ${
                      (entry.scores?.overallScore || 0) >= 80 ? 'bg-green-500' :
                      (entry.scores?.overallScore || 0) >= 60 ? 'bg-amber-500' :
                      'bg-red-500'
                    }`}
                    style={{ width: `${entry.scores?.overallScore || 0}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Stats Summary */}
      <div className="bg-[#161616] rounded-lg p-4 border border-[#2d2d2d]">
        <h4 className="text-white font-medium mb-3">Summary Statistics</h4>
        <div className="grid grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-white">{history.length}</div>
            <div className="text-gray-500 text-sm">Total Runs</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-400">
              {history.length > 0 
                ? Math.round(history.reduce((sum, h) => sum + (h.scores?.overallScore || 0), 0) / history.length)
                : 0}%
            </div>
            <div className="text-gray-500 text-sm">Avg Score</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-400">
              {Math.max(...history.map(h => h.scores?.overallScore || 0))}%
            </div>
            <div className="text-gray-500 text-sm">Best Score</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-amber-400">
              {history.length > 1 
                ? (history[0].scores?.overallScore || 0) - (history[history.length - 1].scores?.overallScore || 0)
                : 0}%
            </div>
            <div className="text-gray-500 text-sm">Progress</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HistoryTab;

