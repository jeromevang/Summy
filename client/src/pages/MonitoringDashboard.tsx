import React from 'react';
import { HealthPanel, MetricCard } from './MonitoringDashboard/components';
import { Clock, TrendingUp, AlertCircle, Wifi } from 'lucide-react';

const MonitoringDashboard: React.FC = () => {
  return (
    <div className="p-6 bg-gray-100 min-h-screen">
      <h1 className="text-2xl font-bold mb-6">Monitoring Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <MetricCard title="Avg Latency" value="245ms" icon={<Clock className="text-white"/>} color="blue" />
        <MetricCard title="Throughput" value="45 req/s" icon={<TrendingUp className="text-white"/>} color="green" />
        <MetricCard title="Error Rate" value="2.3%" icon={<AlertCircle className="text-white"/>} color="yellow" />
        <MetricCard title="Connections" value="156" icon={<Wifi className="text-white"/>} color="red" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <HealthPanel />
        <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">Charts Panel (Simplified)...</div>
      </div>
    </div>
  );
};

export default MonitoringDashboard;