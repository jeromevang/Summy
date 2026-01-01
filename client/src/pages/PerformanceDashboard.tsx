/**
 * Performance Dashboard
 * Real-time performance monitoring for the frontend application
 */

import React, { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';

interface PerformanceMetric {
  timestamp: number;
  renderTime: number;
  memoryUsage: number;
  component: string;
}

interface PerformanceStats {
  avgRenderTime: number;
  maxRenderTime: number;
  totalRenders: number;
  memoryUsage: number;
  slowRenders: number;
}

const PerformanceDashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<PerformanceMetric[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [selectedComponent, setSelectedComponent] = useState<string>('all');

  // Performance monitoring setup
  useEffect(() => {
    if (!isMonitoring) return;

    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach((entry) => {
        if (entry.entryType === 'measure') {
          const metric: PerformanceMetric = {
            timestamp: Date.now(),
            renderTime: entry.duration,
            memoryUsage: (performance as any).memory?.usedJSHeapSize || 0,
            component: entry.name
          };
          
          setMetrics(prev => {
            const newMetrics = [...prev, metric];
            // Keep only last 100 entries
            if (newMetrics.length > 100) {
              newMetrics.shift();
            }
            return newMetrics;
          });
        }
      });
    });

    observer.observe({ entryTypes: ['measure'] });

    return () => observer.disconnect();
  }, [isMonitoring]);

  // Calculate statistics
  const stats = useMemo((): PerformanceStats => {
    const relevantMetrics = selectedComponent === 'all' 
      ? metrics 
      : metrics.filter(m => m.component === selectedComponent);

    if (relevantMetrics.length === 0) {
      return {
        avgRenderTime: 0,
        maxRenderTime: 0,
        totalRenders: 0,
        memoryUsage: 0,
        slowRenders: 0
      };
    }

    const renderTimes = relevantMetrics.map(m => m.renderTime);
    const avgRenderTime = renderTimes.reduce((a, b) => a + b, 0) / renderTimes.length;
    const maxRenderTime = Math.max(...renderTimes);
    const slowRenders = renderTimes.filter(time => time > 16).length;
    const memoryUsage = relevantMetrics[relevantMetrics.length - 1]?.memoryUsage || 0;

    return {
      avgRenderTime,
      maxRenderTime,
      totalRenders: relevantMetrics.length,
      memoryUsage,
      slowRenders
    };
  }, [metrics, selectedComponent]);

  // Component breakdown
  const componentBreakdown = useMemo(() => {
    const breakdown = new Map<string, number[]>();
    
    metrics.forEach(metric => {
      if (!breakdown.has(metric.component)) {
        breakdown.set(metric.component, []);
      }
      breakdown.get(metric.component)!.push(metric.renderTime);
    });

    return Array.from(breakdown.entries()).map(([component, times]) => ({
      component,
      avgTime: times.reduce((a, b) => a + b, 0) / times.length,
      maxTime: Math.max(...times),
      count: times.length
    }));
  }, [metrics]);

  const toggleMonitoring = () => {
    setIsMonitoring(!isMonitoring);
    if (!isMonitoring) {
      setMetrics([]);
    }
  };

  const clearMetrics = () => {
    setMetrics([]);
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Performance Dashboard</h1>
        <div className="space-x-4">
          <button
            onClick={toggleMonitoring}
            className={`px-4 py-2 rounded ${
              isMonitoring 
                ? 'bg-green-500 text-white' 
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {isMonitoring ? 'Stop Monitoring' : 'Start Monitoring'}
          </button>
          <button
            onClick={clearMetrics}
            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
          >
            Clear Metrics
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-600">Avg Render Time</h3>
          <p className="text-2xl font-bold">{stats.avgRenderTime.toFixed(2)}ms</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-600">Max Render Time</h3>
          <p className="text-2xl font-bold">{stats.maxRenderTime.toFixed(2)}ms</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-600">Total Renders</h3>
          <p className="text-2xl font-bold">{stats.totalRenders}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-600">Memory Usage</h3>
          <p className="text-2xl font-bold">{(stats.memoryUsage / (1024 * 1024)).toFixed(2)} MB</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-600">Slow Renders (&gt;16ms)</h3>
          <p className="text-2xl font-bold text-red-500">{stats.slowRenders}</p>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white p-4 rounded-lg shadow">
        <div className="flex justify-between items-center">
          <div>
            <label className="text-sm font-medium text-gray-700 mr-2">Filter by Component:</label>
            <select
              value={selectedComponent}
              onChange={(e) => setSelectedComponent(e.target.value)}
              className="border border-gray-300 rounded px-3 py-1"
            >
              <option value="all">All Components</option>
              {Array.from(new Set(metrics.map(m => m.component))).map(component => (
                <option key={component} value={component}>{component}</option>
              ))}
            </select>
          </div>
          <div className="text-sm text-gray-600">
            Monitoring {isMonitoring ? 'active' : 'inactive'}
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Render Time Trend */}
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Render Time Trend</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={metrics.slice(-50)}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="timestamp" tickFormatter={(timestamp) => new Date(timestamp).toLocaleTimeString()} />
              <YAxis />
              <Tooltip labelFormatter={(timestamp) => new Date(timestamp).toLocaleString()} />
              <Legend />
              <Line type="monotone" dataKey="renderTime" stroke="#8884d8" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Component Breakdown */}
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Component Performance</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={componentBreakdown}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="component" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="avgTime" fill="#8884d8" name="Avg Time (ms)" />
              <Bar dataKey="maxTime" fill="#82ca9d" name="Max Time (ms)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Memory Usage */}
      <div className="bg-white p-4 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">Memory Usage</h3>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={metrics.slice(-50)}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="timestamp" tickFormatter={(timestamp) => new Date(timestamp).toLocaleTimeString()} />
            <YAxis tickFormatter={(value) => `${(value / (1024 * 1024)).toFixed(0)} MB`} />
            <Tooltip labelFormatter={(timestamp) => new Date(timestamp).toLocaleString()} formatter={(value) => [`${(value / (1024 * 1024)).toFixed(2)} MB`, 'Memory']} />
            <Line type="monotone" dataKey="memoryUsage" stroke="#ff7300" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Recommendations */}
      {stats.slowRenders > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-yellow-800 mb-2">Performance Recommendations</h3>
          <ul className="text-yellow-700 space-y-1">
            <li>• Consider memoizing expensive calculations with useMemo</li>
            <li>• Implement virtualization for long lists</li>
            <li>• Use debouncing for input handlers</li>
            <li>• Check for unnecessary re-renders</li>
            <li>• Optimize image loading and caching</li>
          </ul>
        </div>
      )}
    </div>
  );
};

export default PerformanceDashboard;
