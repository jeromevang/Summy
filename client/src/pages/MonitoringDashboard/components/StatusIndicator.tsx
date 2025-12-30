import React from 'react';
import { CheckCircle, Clock, AlertCircle, Eye } from 'lucide-react';

export const StatusIndicator: React.FC<{ status: string }> = ({ status }) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'healthy': return { color: 'text-green-500', icon: CheckCircle };
      case 'degraded': return { color: 'text-yellow-500', icon: Clock };
      case 'unhealthy': return { color: 'text-red-500', icon: AlertCircle };
      default: return { color: 'text-gray-500', icon: Eye };
    }
  };
  const { color, icon: Icon } = getStatusConfig();
  return (
    <div className={`flex items-center space-x-2 \${color}`}>
      <Icon size={16} />
      <span className="capitalize font-medium">{status}</span>
    </div>
  );
};
