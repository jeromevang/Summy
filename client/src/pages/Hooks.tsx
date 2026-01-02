import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ReconnectingWebSocket from 'reconnecting-websocket';
import { Activity, CheckCircle, XCircle, Clock, Zap, TrendingUp } from 'lucide-react';

// ============================================================
// TYPES
// ============================================================

interface HookExecution {
  id: string;
  hookName: string;
  timestamp: string;
  status: 'running' | 'success' | 'error';
  duration?: number;
  input?: {
    transcriptPath?: string;
    messageCount?: number;
    estimatedTokens?: number;
  };
  output?: {
    summary?: string;
    compression?: number;
    tokensSaved?: number;
  };
  error?: string;
  lmStudioTime?: number;
  cliTime?: number;
}

interface HookStats {
  totalExecutions: number;
  successRate: number;
  avgDuration: number;
  lastHourCount: number;
  lmStudioOnline: boolean;
}

// ============================================================
// COMPONENT
// ============================================================

const Hooks: React.FC = () => {
  const [executions, setExecutions] = useState<HookExecution[]>([]);
  const [stats, setStats] = useState<HookStats | null>(null);
  const [selectedExecution, setSelectedExecution] = useState<HookExecution | null>(null);
  const [loading, setLoading] = useState(true);

  // Load hook activity on mount
  useEffect(() => {
    loadActivity();
    loadStats();

    // WebSocket for real-time updates
    const ws = new ReconnectingWebSocket('ws://localhost:3001');

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'hook-activity') {
          // Update executions list
          if (message.data.execution) {
            setExecutions(prev => {
              const filtered = prev.filter(e => e.id !== message.data.execution.id);
              return [message.data.execution, ...filtered].slice(0, 20);
            });
          }
          // Update stats
          if (message.data.stats) {
            setStats(message.data.stats);
          }
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    return () => {
      ws.close();
    };
  }, []);

  const loadActivity = async () => {
    try {
      const response = await axios.get('http://localhost:3001/api/hooks/activity?limit=20');
      setExecutions(response.data.executions || []);
    } catch (error) {
      console.error('Failed to load hook activity:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const response = await axios.get('http://localhost:3001/api/hooks/stats');
      setStats(response.data.stats || null);
    } catch (error) {
      console.error('Failed to load hook stats:', error);
    }
  };

  const clearHistory = async () => {
    if (!confirm('Clear all hook execution history?')) return;

    try {
      await axios.delete('http://localhost:3001/api/hooks/history');
      setExecutions([]);
      loadStats();
    } catch (error) {
      console.error('Failed to clear history:', error);
      alert('Failed to clear history');
    }
  };

  const formatDuration = (ms?: number): string => {
    if (!ms) return 'N/A';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-400" />;
      case 'running':
        return <Clock className="w-5 h-5 text-yellow-400 animate-spin" />;
      default:
        return <Activity className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'success':
        return 'bg-green-900/20 border-green-500/30';
      case 'error':
        return 'bg-red-900/20 border-red-500/30';
      case 'running':
        return 'bg-yellow-900/20 border-yellow-500/30';
      default:
        return 'bg-gray-900/20 border-gray-500/30';
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="text-cyan-400">Loading hook activity...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="w-8 h-8 text-cyan-400" />
          <h1 className="text-2xl font-bold text-white">Hooks Monitor</h1>
        </div>
        <button
          onClick={clearHistory}
          className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg border border-red-500/30 transition-colors"
        >
          Clear History
        </button>
      </div>

      {/* Statistics Dashboard */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/50">
            <div className="flex items-center gap-2 text-gray-400 text-sm mb-2">
              <Activity className="w-4 h-4" />
              Total Runs
            </div>
            <div className="text-2xl font-bold text-white">{stats.totalExecutions}</div>
          </div>

          <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/50">
            <div className="flex items-center gap-2 text-gray-400 text-sm mb-2">
              <TrendingUp className="w-4 h-4" />
              Success Rate
            </div>
            <div className="text-2xl font-bold text-green-400">
              {stats.successRate.toFixed(1)}%
            </div>
          </div>

          <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/50">
            <div className="flex items-center gap-2 text-gray-400 text-sm mb-2">
              <Clock className="w-4 h-4" />
              Avg Duration
            </div>
            <div className="text-2xl font-bold text-cyan-400">
              {formatDuration(stats.avgDuration)}
            </div>
          </div>

          <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/50">
            <div className="flex items-center gap-2 text-gray-400 text-sm mb-2">
              <Zap className="w-4 h-4" />
              LM Studio
            </div>
            <div className={`text-2xl font-bold ${stats.lmStudioOnline ? 'text-green-400' : 'text-red-400'}`}>
              {stats.lmStudioOnline ? 'Online' : 'Offline'}
            </div>
          </div>
        </div>
      )}

      {/* Activity Feed */}
      <div className="bg-gray-900/50 rounded-lg border border-gray-700/50">
        <div className="p-4 border-b border-gray-700/50">
          <h2 className="text-lg font-semibold text-white">Live Activity</h2>
          <p className="text-sm text-gray-400">Recent hook executions (last 20)</p>
        </div>

        <div className="divide-y divide-gray-700/50">
          {executions.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No hook executions yet. Hooks will appear here when triggered.
            </div>
          ) : (
            executions.map((execution) => (
              <div
                key={execution.id}
                onClick={() => setSelectedExecution(execution)}
                className={`p-4 hover:bg-gray-800/30 cursor-pointer transition-colors border-l-4 ${getStatusColor(execution.status)}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    {getStatusIcon(execution.status)}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">{execution.hookName}</span>
                        <span className="text-xs text-gray-500">{formatTimestamp(execution.timestamp)}</span>
                      </div>
                      {execution.status === 'success' && execution.output && (
                        <div className="text-sm text-gray-400 mt-1">
                          {execution.input?.messageCount || 'N/A'} messages → {execution.output.compression ? `${Math.round(execution.output.compression * 100)}% compression` : 'summarized'}
                        </div>
                      )}
                      {execution.status === 'error' && (
                        <div className="text-sm text-red-400 mt-1">{execution.error}</div>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-cyan-400">{formatDuration(execution.duration)}</div>
                    {execution.duration && (
                      <div className="text-xs text-gray-500">
                        {execution.lmStudioTime ? `LM Studio: ${formatDuration(execution.lmStudioTime)}` : ''}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Details Panel */}
      {selectedExecution && (
        <div className="bg-gray-900/50 rounded-lg border border-gray-700/50 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">
              Execution Details: {selectedExecution.hookName}
            </h2>
            <button
              onClick={() => setSelectedExecution(null)}
              className="text-gray-400 hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>

          <div className="space-y-4">
            {/* Status */}
            <div>
              <div className="text-sm text-gray-400 mb-1">Status</div>
              <div className="flex items-center gap-2">
                {getStatusIcon(selectedExecution.status)}
                <span className="text-white capitalize">{selectedExecution.status}</span>
              </div>
            </div>

            {/* Timing */}
            <div>
              <div className="text-sm text-gray-400 mb-1">Performance</div>
              <div className="text-white">
                <div>Total: {formatDuration(selectedExecution.duration)}</div>
                {selectedExecution.cliTime && (
                  <div className="text-sm text-gray-400">CLI: {formatDuration(selectedExecution.cliTime)}</div>
                )}
                {selectedExecution.lmStudioTime && (
                  <div className="text-sm text-gray-400">LM Studio: {formatDuration(selectedExecution.lmStudioTime)}</div>
                )}
              </div>
            </div>

            {/* Input */}
            {selectedExecution.input && (
              <div>
                <div className="text-sm text-gray-400 mb-1">Input</div>
                <div className="text-white text-sm">
                  {selectedExecution.input.messageCount && (
                    <div>Messages: {selectedExecution.input.messageCount}</div>
                  )}
                  {selectedExecution.input.estimatedTokens && (
                    <div>Estimated Tokens: {selectedExecution.input.estimatedTokens.toLocaleString()}</div>
                  )}
                  {selectedExecution.input.transcriptPath && (
                    <div className="text-xs text-gray-500 mt-1 truncate">
                      {selectedExecution.input.transcriptPath}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Output */}
            {selectedExecution.output && (
              <div>
                <div className="text-sm text-gray-400 mb-1">Output</div>
                <div className="text-white text-sm">
                  {selectedExecution.output.compression && (
                    <div>Compression: {Math.round(selectedExecution.output.compression * 100)}%</div>
                  )}
                  {selectedExecution.output.tokensSaved && (
                    <div>Tokens Saved: {selectedExecution.output.tokensSaved.toLocaleString()}</div>
                  )}
                  {selectedExecution.output.summary && (
                    <div className="mt-2 p-3 bg-gray-800/50 rounded border border-gray-700/50">
                      <div className="text-xs text-gray-400 mb-1">Generated Summary:</div>
                      <div className="text-sm text-gray-300 whitespace-pre-wrap">
                        {selectedExecution.output.summary.substring(0, 500)}
                        {selectedExecution.output.summary.length > 500 && '...'}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Error */}
            {selectedExecution.error && (
              <div>
                <div className="text-sm text-gray-400 mb-1">Error</div>
                <div className="text-red-400 text-sm p-3 bg-red-900/20 rounded border border-red-500/30">
                  {selectedExecution.error}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Hooks;
