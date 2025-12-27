import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

// Tooltip component
const Tooltip: React.FC<{ children: React.ReactNode; content: string }> = ({ children, content }) => {
  const [show, setShow] = useState(false);

  return (
    <div className="relative inline-block">
      <div
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      >
        {children}
      </div>
      {show && (
        <div className="absolute z-50 px-2 py-1 text-xs text-white bg-gray-900 rounded shadow-lg bottom-full left-1/2 transform -translate-x-1/2 mb-1 whitespace-nowrap">
          {content}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
        </div>
      )}
    </div>
  );
};

// ============================================================
// TYPES
// ============================================================

interface ModuleStatus {
  enabled: boolean;
  stats: {
    sessions?: number;
    tokensSaved?: number;
    savingsPercent?: number;
    toolCount?: number;
    executions?: number;
    successRate?: number;
  };
}

interface AnalyticsData {
  period: string;
  overview: {
    totalRequests: number;
    tokensOriginal: number;
    tokensCompressed: number;
    tokensSaved: number;
    savingsPercent: number;
    toolExecutions: number;
    toolSuccessRate: number;
  };
  toolUsage: Array<{
    tool: string;
    count: number;
    successRate: number;
  }>;
  dailyActivity: Array<{
    date: string;
    requests: number;
    toolCalls: number;
  }>;
}

interface ServerStatus {
  online: boolean;
  port: number;
  ngrokUrl?: string;
  provider: string;
  model: string;
}

type ProxyMode = 'passthrough' | 'summy' | 'tooly' | 'full';

// ============================================================
// DASHBOARD COMPONENT
// ============================================================

interface FailureStats {
  unresolvedCount: number;
  criticalPatterns: number;
  modelsAffected: number;
}

const Dashboard: React.FC = () => {
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  const [summyStatus, setSummyStatus] = useState<ModuleStatus>({ enabled: true, stats: {} });
  const [toolyStatus, setToolyStatus] = useState<ModuleStatus>({ enabled: true, stats: {} });
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [proxyMode, setProxyMode] = useState<ProxyMode>('full');
  const [failureStats, setFailureStats] = useState<FailureStats>({ unresolvedCount: 0, criticalPatterns: 0, modelsAffected: 0 });
  const [loading, setLoading] = useState(true);

  // Fetch data on mount
  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      // Fetch server status
      const statusRes = await fetch('/api/status');
      if (statusRes.ok) {
        const status = await statusRes.json();
        setServerStatus(status);
      }

      // Fetch settings for module status
      const settingsRes = await fetch('/api/settings');
      if (settingsRes.ok) {
        const settings = await settingsRes.json();
        setSummyStatus({
          enabled: settings.modules?.summy?.enabled ?? true,
          stats: { sessions: 0 }
        });
        setToolyStatus({
          enabled: settings.modules?.tooly?.enabled ?? true,
          stats: { toolCount: 0, executions: 0 }
        });
        
        // Determine proxy mode from settings
        if (settings.modules?.summy?.enabled && settings.modules?.tooly?.enabled) {
          setProxyMode('full');
        } else if (settings.modules?.summy?.enabled) {
          setProxyMode('summy');
        } else if (settings.modules?.tooly?.enabled) {
          setProxyMode('tooly');
        } else {
          setProxyMode('passthrough');
        }
      }

      // Fetch analytics
      const analyticsRes = await fetch('/api/analytics?period=week');
      if (analyticsRes.ok) {
        const data = await analyticsRes.json();
        setAnalytics(data);
        
        // Update module stats from analytics
        setSummyStatus(prev => ({
          ...prev,
          stats: {
            ...prev.stats,
            tokensSaved: data.overview?.tokensSaved || 0,
            savingsPercent: data.overview?.savingsPercent || 0
          }
        }));
        setToolyStatus(prev => ({
          ...prev,
          stats: {
            ...prev.stats,
            executions: data.overview?.toolExecutions || 0,
            successRate: data.overview?.toolSuccessRate || 100
          }
        }));
      }

      // Fetch session count
      const sessionsRes = await fetch('/api/sessions');
      if (sessionsRes.ok) {
        const sessions = await sessionsRes.json();
        setSummyStatus(prev => ({
          ...prev,
          stats: { ...prev.stats, sessions: sessions.length }
        }));
      }

      // Fetch failure stats from Controller
      try {
        const failuresRes = await fetch('/api/tooly/controller/status');
        if (failuresRes.ok) {
          const failureData = await failuresRes.json();
          setFailureStats({
            unresolvedCount: failureData.summary?.unresolvedFailures || 0,
            criticalPatterns: failureData.summary?.criticalPatterns || 0,
            modelsAffected: failureData.summary?.modelsAffected || 0
          });
        }
      } catch (e) {
        // Controller endpoint might not be available
      }

    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleModeChange = async (mode: ProxyMode) => {
    setProxyMode(mode);
    
    const summyEnabled = mode === 'summy' || mode === 'full';
    const toolyEnabled = mode === 'tooly' || mode === 'full';
    
    setSummyStatus(prev => ({ ...prev, enabled: summyEnabled }));
    setToolyStatus(prev => ({ ...prev, enabled: toolyEnabled }));

    // Save to server
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modules: {
            summy: { enabled: summyEnabled },
            tooly: { enabled: toolyEnabled }
          }
        })
      });
    } catch (error) {
      console.error('Failed to update settings:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <Tooltip content="Reload dashboard data from all services">
          <button
            onClick={fetchDashboardData}
            className="px-3 py-1.5 text-sm bg-[#2d2d2d] text-gray-300 rounded-lg hover:bg-[#3d3d3d] transition-colors"
          >
            ↻ Refresh
          </button>
        </Tooltip>
      </div>

      {/* Proxy Status */}
      <div className="bg-[#1a1a1a] rounded-xl border border-[#2d2d2d] p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-3 h-3 rounded-full ${serverStatus?.online ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <div>
              <span className="text-white font-medium">Server {serverStatus?.online ? 'Online' : 'Offline'}</span>
              <span className="text-gray-500 mx-2">|</span>
              <span className="text-gray-400">Port: {serverStatus?.port || 3001}</span>
              {serverStatus?.ngrokUrl && (
                <>
                  <span className="text-gray-500 mx-2">|</span>
                  <span className="text-gray-400">ngrok: {serverStatus.ngrokUrl}</span>
                </>
              )}
            </div>
          </div>
          <div className="text-gray-400 text-sm">
            Provider: <span className="text-purple-400">{serverStatus?.provider || 'LM Studio'}</span>
            {serverStatus?.model && (
              <span className="text-gray-500"> ({serverStatus.model})</span>
            )}
          </div>
        </div>
      </div>

      {/* Failure Alert Banner */}
      {failureStats.unresolvedCount > 0 && (
        <Link
          to="/tooly/controller"
          className="block bg-gradient-to-r from-red-900/40 to-orange-900/40 border border-red-500/50 rounded-xl p-4 hover:border-red-400 transition-all"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="text-3xl">🚨</div>
              <div>
                <h3 className="text-white font-semibold">Self-Improving System Needs Attention</h3>
                <p className="text-red-300 text-sm">
                  {failureStats.unresolvedCount} unresolved failure{failureStats.unresolvedCount !== 1 ? 's' : ''} detected
                  {failureStats.criticalPatterns > 0 && (
                    <span className="text-orange-300 ml-2">
                      • {failureStats.criticalPatterns} critical pattern{failureStats.criticalPatterns !== 1 ? 's' : ''}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-2xl font-bold text-red-400">{failureStats.unresolvedCount}</div>
                <div className="text-xs text-gray-400">failures</div>
              </div>
              <span className="text-gray-400">→</span>
            </div>
          </div>
        </Link>
      )}

      {/* Module Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Summy Card */}
        <div className={`bg-[#1a1a1a] rounded-xl border ${summyStatus.enabled ? 'border-purple-500/50' : 'border-[#2d2d2d]'} p-6`}>
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-white">Summy</h2>
              <p className="text-gray-400 text-sm">Context Compression</p>
            </div>
            <div className={`px-3 py-1 rounded-full text-xs font-medium ${
              summyStatus.enabled ? 'bg-purple-500/20 text-purple-400' : 'bg-gray-500/20 text-gray-400'
            }`}>
              {summyStatus.enabled ? '● Enabled' : '○ Disabled'}
            </div>
          </div>
          
          <div className="space-y-3 mb-4">
            <div className="flex justify-between">
              <span className="text-gray-400">Sessions</span>
              <span className="text-white">{summyStatus.stats.sessions || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Tokens Saved</span>
              <span className="text-green-400">
                {summyStatus.stats.tokensSaved?.toLocaleString() || 0}
                {summyStatus.stats.savingsPercent ? ` (${summyStatus.stats.savingsPercent}%)` : ''}
              </span>
            </div>
          </div>
          
          <Link
            to="/"
            className="block w-full text-center py-2 px-4 bg-[#2d2d2d] text-gray-300 rounded-lg hover:bg-[#3d3d3d] transition-colors text-sm"
          >
            Configure →
          </Link>
        </div>

        {/* Tooly Card */}
        <div className={`bg-[#1a1a1a] rounded-xl border ${toolyStatus.enabled ? 'border-blue-500/50' : 'border-[#2d2d2d]'} p-6`}>
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-white">Tooly</h2>
              <p className="text-gray-400 text-sm">Tool Management</p>
            </div>
            <div className={`px-3 py-1 rounded-full text-xs font-medium ${
              toolyStatus.enabled ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-500/20 text-gray-400'
            }`}>
              {toolyStatus.enabled ? '● Enabled' : '○ Disabled'}
            </div>
          </div>
          
          <div className="space-y-3 mb-4">
            <div className="flex justify-between">
              <span className="text-gray-400">Tool Executions</span>
              <span className="text-white">{toolyStatus.stats.executions || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Success Rate</span>
              <span className="text-green-400">{toolyStatus.stats.successRate || 100}%</span>
            </div>
          </div>
          
          <Link
            to="/tooly"
            className="block w-full text-center py-2 px-4 bg-[#2d2d2d] text-gray-300 rounded-lg hover:bg-[#3d3d3d] transition-colors text-sm"
          >
            Configure →
          </Link>
        </div>
      </div>

      {/* Quick Mode Toggle */}
      <div className="bg-[#1a1a1a] rounded-xl border border-[#2d2d2d] p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Quick Mode Toggle</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { mode: 'passthrough' as ProxyMode, label: 'Passthrough', desc: 'Direct proxy, no processing' },
            { mode: 'summy' as ProxyMode, label: 'Summy Only', desc: 'Context compression enabled' },
            { mode: 'tooly' as ProxyMode, label: 'Tooly Only', desc: 'Tool management enabled' },
            { mode: 'full' as ProxyMode, label: 'Full', desc: 'Both systems active' }
          ].map(({ mode, label, desc }) => (
            <button
              key={mode}
              onClick={() => handleModeChange(mode)}
              className={`p-4 rounded-lg border text-left transition-all ${
                proxyMode === mode
                  ? 'border-purple-500 bg-purple-500/10'
                  : 'border-[#2d2d2d] hover:border-[#3d3d3d]'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <div className={`w-2 h-2 rounded-full ${proxyMode === mode ? 'bg-purple-500' : 'bg-gray-600'}`}></div>
                <span className={`font-medium ${proxyMode === mode ? 'text-white' : 'text-gray-400'}`}>
                  {label}
                </span>
              </div>
              <p className="text-xs text-gray-500">{desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Analytics Section */}
      {analytics && (
        <div className="bg-[#1a1a1a] rounded-xl border border-[#2d2d2d] p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-semibold text-white">Analytics</h3>
            <span className="text-sm text-gray-500">This Week</span>
          </div>

          {/* Overview Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-[#2d2d2d] rounded-lg p-4">
              <p className="text-gray-400 text-sm">Requests</p>
              <p className="text-2xl font-bold text-white">{analytics.overview.totalRequests}</p>
            </div>
            <div className="bg-[#2d2d2d] rounded-lg p-4">
              <p className="text-gray-400 text-sm">Tokens Saved</p>
              <p className="text-2xl font-bold text-green-400">{analytics.overview.savingsPercent}%</p>
              <p className="text-xs text-gray-500">{analytics.overview.tokensSaved.toLocaleString()} tokens</p>
            </div>
            <div className="bg-[#2d2d2d] rounded-lg p-4">
              <p className="text-gray-400 text-sm">Tool Executions</p>
              <p className="text-2xl font-bold text-white">{analytics.overview.toolExecutions}</p>
            </div>
            <div className="bg-[#2d2d2d] rounded-lg p-4">
              <p className="text-gray-400 text-sm">Tool Success</p>
              <p className="text-2xl font-bold text-green-400">{analytics.overview.toolSuccessRate}%</p>
            </div>
          </div>

          {/* Daily Activity Chart */}
          {analytics.dailyActivity && analytics.dailyActivity.length > 0 && (
            <div className="mb-6">
              <h4 className="text-sm font-medium text-gray-400 mb-3">Daily Activity</h4>
              <div className="h-32 flex items-end gap-1">
                {(() => {
                  const maxRequests = Math.max(...analytics.dailyActivity.map(d => d.requests), 1);
                  const maxToolCalls = Math.max(...analytics.dailyActivity.map(d => d.toolCalls), 1);
                  const maxValue = Math.max(maxRequests, maxToolCalls);
                  
                  return analytics.dailyActivity.map((day, i) => (
                    <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                      <div className="w-full flex gap-0.5 items-end h-24">
                        {/* Requests bar */}
                        <div 
                          className="flex-1 bg-purple-500/60 rounded-t"
                          style={{ height: `${(day.requests / maxValue) * 100}%`, minHeight: day.requests > 0 ? '4px' : '0' }}
                          title={`Requests: ${day.requests}`}
                        />
                        {/* Tool calls bar */}
                        <div 
                          className="flex-1 bg-blue-500/60 rounded-t"
                          style={{ height: `${(day.toolCalls / maxValue) * 100}%`, minHeight: day.toolCalls > 0 ? '4px' : '0' }}
                          title={`Tool Calls: ${day.toolCalls}`}
                        />
                      </div>
                      <span className="text-[10px] text-gray-500">
                        {new Date(day.date).toLocaleDateString('en', { weekday: 'short' })}
                      </span>
                    </div>
                  ));
                })()}
              </div>
              <div className="flex justify-center gap-4 mt-2">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-purple-500/60 rounded"></div>
                  <span className="text-xs text-gray-500">Requests</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-blue-500/60 rounded"></div>
                  <span className="text-xs text-gray-500">Tool Calls</span>
                </div>
              </div>
            </div>
          )}

          {/* Top Tools */}
          {analytics.toolUsage.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-400 mb-3">Top Tools</h4>
              <div className="space-y-2">
                {analytics.toolUsage.slice(0, 5).map((tool, i) => (
                  <div key={tool.tool} className="flex items-center gap-3">
                    <span className="text-gray-500 w-6">{i + 1}.</span>
                    <span className="text-white flex-1">{tool.tool}</span>
                    <span className="text-gray-400">{tool.count}</span>
                    <div className="w-24 bg-[#2d2d2d] rounded-full h-2">
                      <div 
                        className="bg-purple-500 rounded-full h-2" 
                        style={{ width: `${tool.successRate}%` }}
                      ></div>
                    </div>
                    <span className="text-gray-500 text-sm w-12">{tool.successRate}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Recent Activity */}
      <div className="bg-[#1a1a1a] rounded-xl border border-[#2d2d2d] p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Recent Activity</h3>
        <div className="text-gray-500 text-sm">
          Activity feed coming soon...
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

