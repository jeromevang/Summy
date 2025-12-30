import React, { useState, useEffect } from 'react';
import { Server } from 'lucide-react';
import { StatusIndicator } from './StatusIndicator';
import { HealthStatus } from '../types';

export const HealthPanel: React.FC = () => {
  const [healthData, setHealthData] = useState<HealthStatus[]>([]);
  useEffect(() => {
    // Simulated health data
    setHealthData([
      { component: 'Database', status: 'healthy', message: 'All systems operational', responseTime: 45 },
      { component: 'Models', status: 'degraded', message: '2 models degraded', responseTime: 200 }
    ]);
  }, []);

  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200">
      <div className="p-4 border-b"><h3 className="text-lg font-semibold flex items-center space-x-2"><Server size={20} /><span>System Health</span></h3></div>
      <div className="p-4">
        <div className="space-y-3">
          {healthData.map((item, i) => (
            <div key={i} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
              <div className="flex items-center space-x-3"><StatusIndicator status={item.status} /><div><p className="font-medium text-gray-900">{item.component}</p><p className="text-sm text-gray-600">{item.message}</p></div></div>
              <div className="text-right"><p className="text-sm text-gray-600">Response Time</p><p className="font-mono text-sm font-medium">{item.responseTime}ms</p></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
