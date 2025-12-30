import React from 'react';

export const MetricCard: React.FC<{
  title: string;
  value: string | number;
  change?: number;
  icon: React.ReactNode;
  color?: string;
}> = ({ title, value, change, icon, color = 'blue' }) => {
  const colors: any = { blue: 'bg-blue-500', green: 'bg-green-500', yellow: 'bg-yellow-500', red: 'bg-red-500' };
  return (
    <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          {change !== undefined && <p className={`text-sm \${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>{change >= 0 ? '↑' : '↓'} {Math.abs(change)}%</p>}
        </div>
        <div className={`p-3 rounded-full \${colors[color]}`}>{icon}</div>
      </div>
    </div>
  );
};
