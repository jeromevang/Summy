/**
 * Monitoring Dashboard
 * Real-time system monitoring and observability dashboard
 */

import React, { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';
import { 
  AlertCircle, 
  CheckCircle, 
  Clock, 
  Database, 
  Cpu, 
  MemoryStick, 
  Wifi, 
  Eye, 
  Activity, 
  TrendingUp,
  Server,
  Database as DatabaseIcon,
  RefreshCw
} from 'lucide-react';

// ============================================================
// TYPES
// ============================================================

interface Metric {
  timestamp: number;
  value: number;
  label?: string;
}

interface SystemMetrics {
  cpu: number;
  memory: number;
  disk: number;
  network: number;
}

interface HealthStatus {
  component: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  message: string;
  responseTime: number;
}

interface PerformanceMetrics {
  avgResponseTime: number;
  requestCount: number;
  errorRate: number;
  throughput: number;
}

// ============================================================
// MOCK DATA GENERATORS
// ============================================================

const generateTimeSeries = (length: number, baseValue: number, variance: number): Metric[] => {
  return Array.from({ length }, (_, i) => ({
    timestamp: Date.now() - (length - i) * 1000,
    value: baseValue + (Math.random() - 0.5) * variance,
    label: new Date(Date.now() - (length - i) * 1000).toLocaleTimeString()
  }));
};

const generateHealthData = (): HealthStatus[] => [
  { component: 'Database', status: 'healthy', message: 'All systems operational', responseTime: 45 },
  { component: 'Cache', status: 'healthy', message: 'Cache hit rate: 85%', responseTime: 12 },
  { component: 'Models', status: 'degraded', message: '2 of 10 models degraded', responseTime: 200 },
  { component: 'Tracing', status: 'healthy', message: 'Trace collection active', responseTime: 8 },
  { component: 'External Services', status: 'healthy', message: 'All APIs responding', responseTime: 150 },
  { component: 'System Resources', status: 'healthy', message: 'Resources within limits', responseTime: 5 }
];

const generatePerformanceData = (): PerformanceMetrics => ({
  avgResponseTime: 245,
  requestCount: 1250,
  errorRate: 2.3,
  throughput: 45
});

// ============================================================
// COMPONENTS
// ============================================================

const StatusIndicator: React.FC<{ status: string }> = ({ status }) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'healthy':
        return { color: 'text-green-500', icon: CheckCircle };
      case 'degraded':
        return { color: 'text-yellow-500', icon: Clock };
      case 'unhealthy':
        return { color: 'text-red-500', icon: AlertCircle };
      default:
        return { color: 'text-gray-500', icon: Eye };
    }
  };

  const { color, icon: Icon } = getStatusConfig();

  return (
    <div className={`flex items-center space-x-2 ${color}`}>
      <Icon size={16} />
      <span className="capitalize font-medium">{status}</span>
    </div>
  );
};

const MetricCard: React.FC<{
  title: string;
  value: string | number;
  change?: number;
  icon: React.ReactNode;
  color?: string;
}> = ({ title, value, change, icon, color = 'blue' }) => {
  const colorClasses = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500'
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          {change !== undefined && (
            <p className={`text-sm ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {change >= 0 ? '↑' : '↓'} {Math.abs(change)}%
            </p>
          )}
        </div>
        <div className={`p-3 rounded-full ${colorClasses[color as keyof typeof colorClasses]}`}>
          {icon}
        </div>
      </div>
    </div>
  );
};

const HealthPanel: React.FC = () => {
  const [healthData, setHealthData] = useState<HealthStatus[]>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      setHealthData(generateHealthData());
    }, 5000);

    // Initial load
    setHealthData(generateHealthData());

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200">
      <div className="p-4 border-b">
        <h3 className="text-lg font-semibold flex items-center space-x-2">
          <Server size={20} />
          <span>System Health</span>
        </h3>
      </div>
      <div className="p-4">
        <div className="space-y-3">
          {healthData.map((item, index) => (
            <div key={index} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
              <div className="flex items-center space-x-3">
                <StatusIndicator status={item.status} />
                <div>
                  <p className="font-medium text-gray-900">{item.component}</p>
                  <p className="text-sm text-gray-600">{item.message}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-600">Response Time</p>
                <p className="font-mono text-sm font-medium">{item.responseTime}ms</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const MetricsPanel: React.FC = () => {
  const [metrics, setMetrics] = useState({
    cpu: generateTimeSeries(50, 45, 20),
    memory: generateTimeSeries(50, 65, 15),
    responseTime: generateTimeSeries(50, 250, 100),
    throughput: generateTimeSeries(50, 45, 10)
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics(prev => ({
        cpu: [...prev.cpu.slice(1), {
          timestamp: Date.now(),
          value: 45 + (Math.random() - 0.5) * 20,
          label: new Date().toLocaleTimeString()
        }],
        memory: [...prev.memory.slice(1), {
          timestamp: Date.now(),
          value: 65 + (Math.random() - 0.5) * 15,
          label: new Date().toLocaleTimeString()
        }],
        responseTime: [...prev.responseTime.slice(1), {
          timestamp: Date.now(),
          value: 250 + (Math.random() - 0.5) * 100,
          label: new Date().toLocaleTimeString()
        }],
        throughput: [...prev.throughput.slice(1), {
          timestamp: Date.now(),
          value: 45 + (Math.random() - 0.5) * 10,
          label: new Date().toLocaleTimeString()
        }]
      }));
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      {/* Performance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Avg Response Time"
          value={`${Math.round(metrics.responseTime[metrics.responseTime.length - 1]?.value || 250)}ms`}
          change={5}
          icon={<Clock size={24} className="text-white" />}
          color="blue"
        />
        <MetricCard
          title="Request Throughput"
          value={`${Math.round(metrics.throughput[metrics.throughput.length - 1]?.value || 45)} req/s`}
          change={-2}
          icon={<TrendingUp size={24} className="text-white" />}
          color="green"
        />
        <MetricCard
          title="Error Rate"
          value="2.3%"
          change={-1.2}
          icon={<AlertCircle size={24} className="text-white" />}
          color="yellow"
        />
        <MetricCard
          title="Active Connections"
          value="156"
          change={8}
          icon={<Wifi size={24} className="text-white" />}
          color="red"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CPU and Memory Usage */}
        <div className="bg-white p-4 rounded-lg shadow-md border border-gray-200">
          <h3 className="text-lg font-semibold mb-4 flex items-center space-x-2">
            <Cpu size={20} />
            <span>CPU & Memory Usage</span>
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={metrics.cpu}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="value" stackId="1" stroke="#3b82f6" fill="#93c5fd" name="CPU %" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Response Time Trend */}
        <div className="bg-white p-4 rounded-lg shadow-md border border-gray-200">
          <h3 className="text-lg font-semibold mb-4 flex items-center space-x-2">
            <Activity size={20} />
            <span>Response Time Trend</span>
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={metrics.responseTime}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="value" stroke="#ef4444" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Memory Usage */}
        <div className="bg-white p-4 rounded-lg shadow-md border border-gray-200">
          <h3 className="text-lg font-semibold mb-4 flex items-center space-x-2">
            <MemoryStick size={20} />
            <span>Memory Usage</span>
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={metrics.memory}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Throughput */}
        <div className="bg-white p-4 rounded-lg shadow-md border border-gray-200">
          <h3 className="text-lg font-semibold mb-4 flex items-center space-x-2">
            <TrendingUp size={20} />
            <span>Request Throughput</span>
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={metrics.throughput}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="value" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

const DatabasePanel: React.FC = () => {
  const [dbMetrics, setDbMetrics] = useState({
    connections: generateTimeSeries(30, 15, 5),
    queries: generateTimeSeries(30, 120, 30),
    latency: generateTimeSeries(30, 45, 15)
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setDbMetrics(prev => ({
        connections: [...prev.connections.slice(1), {
          timestamp: Date.now(),
          value: 15 + (Math.random() - 0.5) * 5,
          label: new Date().toLocaleTimeString()
        }],
        queries: [...prev.queries.slice(1), {
          timestamp: Date.now(),
          value: 120 + (Math.random() - 0.5) * 30,
          label: new Date().toLocaleTimeString()
        }],
        latency: [...prev.latency.slice(1), {
          timestamp: Date.now(),
          value: 45 + (Math.random() - 0.5) * 15,
          label: new Date().toLocaleTimeString()
        }]
      }));
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200">
      <div className="p-4 border-b">
        <h3 className="text-lg font-semibold flex items-center space-x-2">
          <DatabaseIcon size={20} />
          <span>Database Metrics</span>
        </h3>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Connections */}
          <div className="space-y-4">
            <h4 className="font-medium text-gray-700">Active Connections</h4>
            <div className="text-2xl font-bold">{Math.round(dbMetrics.connections[dbMetrics.connections.length - 1]?.value || 15)}</div>
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={dbMetrics.connections}>
                <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Queries */}
          <div className="space-y-4">
            <h4 className="font-medium text-gray-700">Queries/sec</h4>
            <div className="text-2xl font-bold">{Math.round(dbMetrics.queries[dbMetrics.queries.length - 1]?.value || 120)}</div>
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={dbMetrics.queries}>
                <Line type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Latency */}
          <div className="space-y-4">
            <h4 className="font-medium text-gray-700">Avg Latency (ms)</h4>
            <div className="text-2xl font-bold">{Math.round(dbMetrics.latency[dbMetrics.latency.length - 1]?.value || 45)}</div>
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={dbMetrics.latency}>
                <Line type="monotone" dataKey="value" stroke="#f59e0b" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

const ErrorPanel: React.FC = () => {
  const [errorData, setErrorData] = useState([
    { type: 'Validation', count: 125, percentage: 35 },
    { type: 'Network', count: 89, percentage: 25 },
    { type: 'Database', count: 67, percentage: 19 },
    { type: 'Timeout', count: 54, percentage: 15 },
    { type: 'Other', count: 20, percentage: 6 }
  ]);

  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  useEffect(() => {
    const interval = setInterval(() => {
      setErrorData(prev => prev.map(item => ({
        ...item,
        count: item.count + Math.floor(Math.random() * 10),
        percentage: item.percentage + (Math.random() - 0.5) * 5
      })));
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200">
      <div className="p-4 border-b">
        <h3 className="text-lg font-semibold flex items-center space-x-2">
          <AlertCircle size={20} />
          <span>Error Distribution</span>
        </h3>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pie Chart */}
          <div className="flex justify-center">
            <ResponsiveContainer width={300} height={300}>
              <PieChart>
                <Pie
                  data={errorData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="percentage"
                >
                  {errorData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Error List */}
          <div className="space-y-3">
            {errorData.map((error, index) => (
              <div key={error.type} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className={`w-3 h-3 rounded-full`} style={{ backgroundColor: colors[index % colors.length] }}></div>
                  <div>
                    <p className="font-medium text-gray-900">{error.type}</p>
                    <p className="text-sm text-gray-600">{error.count} occurrences</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold">{error.percentage.toFixed(0)}%</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// MAIN DASHBOARD COMPONENT
// ============================================================

const MonitoringDashboard: React.FC = () => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  const refreshData = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setLastUpdated(new Date());
      setIsRefreshing(false);
    }, 1000);
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Monitoring Dashboard</h1>
          <p className="text-gray-600">Real-time system observability and health monitoring</p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="text-sm text-gray-600">
            Last updated: {lastUpdated.toLocaleTimeString()}
          </div>
          <button
            onClick={refreshData}
            disabled={isRefreshing}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
          >
            <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <MetricCard
          title="System Status"
          value="All Systems Healthy"
          icon={<CheckCircle size={24} className="text-white" />}
          color="green"
        />
        <MetricCard
          title="Uptime"
          value="99.8%"
          change={0.2}
          icon={<Activity size={24} className="text-white" />}
          color="blue"
        />
        <MetricCard
          title="Active Users"
          value="1,234"
          change={12}
          icon={<Wifi size={24} className="text-white" />}
          color="yellow"
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-6">
          <MetricsPanel />
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          <HealthPanel />
          <DatabasePanel />
          <ErrorPanel />
        </div>
      </div>
    </div>
  );
};

export default MonitoringDashboard;
