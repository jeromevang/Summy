import React from 'react';

interface SummaryCardProps {
  title: string;
  value: number;
  icon: string;
  color: string;
}

const SummaryCard: React.FC<SummaryCardProps> = ({ title, value, icon, color }) => {
  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
      <div className="flex items-center gap-3">
        <span className="text-2xl">{icon}</span>
        <div>
          <div className="text-sm text-gray-500 font-medium">{title}</div>
          <div className={`text-2xl font-bold \${color}`}>{value}</div>
        </div>
      </div>
    </div>
  );
};

interface SummaryPanelProps {
  unresolvedFailures: number;
  criticalPatterns: number;
  modelsAffected: number;
  patternsTracked: number;
}

export const SummaryPanel: React.FC<SummaryPanelProps> = ({ 
  unresolvedFailures, 
  criticalPatterns, 
  modelsAffected, 
  patternsTracked 
}) => {
  return (
    <div className="grid grid-cols-4 gap-4 mb-6">
      <SummaryCard
        title="Unresolved Failures"
        value={unresolvedFailures}
        icon="🔴"
        color={unresolvedFailures ? 'text-red-400' : 'text-gray-400'}
      />
      <SummaryCard
        title="Critical Patterns"
        value={criticalPatterns}
        icon="⚠️"
        color={criticalPatterns ? 'text-orange-400' : 'text-gray-400'}
      />
      <SummaryCard
        title="Models Affected"
        value={modelsAffected}
        icon="🤖"
        color="text-blue-400"
      />
      <SummaryCard
        title="Patterns Tracked"
        value={patternsTracked}
        icon="📊"
        color="text-purple-400"
      />
    </div>
  );
};
