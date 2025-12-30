import React, { useMemo } from 'react';
import { TestResult } from '../types';
import { CATEGORIES } from '../constants';

interface ToolCapabilityGridProps {
  results: TestResult[];
}

export const ToolCapabilityGrid: React.FC<ToolCapabilityGridProps> = ({ results }) => {
  const toolStats = useMemo(() => {
    const stats: Record<string, { passes: number; fails: number; totalScore: number; totalLatency: number }> = {};

    (results || []).forEach(r => {
      const category = r.category;
      if (!stats[category]) {
        stats[category] = { passes: 0, fails: 0, totalScore: 0, totalLatency: 0 };
      }
      if (r.passed) stats[category].passes++;
      else stats[category].fails++;
      stats[category].totalScore += r.score;
      stats[category].totalLatency += r.latency;
    });

    return Object.entries(stats).map(([category, stat]) => ({
      category,
      total: stat.passes + stat.fails,
      passes: stat.passes,
      fails: stat.fails,
      avgScore: Math.round(stat.totalScore / (stat.passes + stat.fails)),
      avgLatency: Math.round(stat.totalLatency / (stat.passes + stat.fails))
    }));
  }, [results]);

  if (results.length === 0) return null;

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6 mt-4">
      <h3 className="text-lg font-semibold text-white mb-4">🎯 Capability Breakdown</h3>
      
      <div className="space-y-3">
        {toolStats.map(stat => {
          const cat = CATEGORIES.find(c => c.key === stat.category);
          if (!cat) return null;
          
          const passRate = (stat.passes / stat.total) * 100;
          
          return (
            <div key={stat.category} className="flex items-center gap-4">
              <span className="text-xl w-8">{cat.icon}</span>
              <div className="flex-1">
                <div className="flex justify-between mb-1">
                  <span className="text-gray-300 font-medium">{cat.name}</span>
                  <span className="text-gray-400 text-sm">
                    {stat.passes}/{stat.total} passed • {stat.avgLatency}ms avg
                  </span>
                </div>
                <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full \${passRate >= 80 ? 'bg-green-500' : passRate >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                    style={{ width: `\${passRate}%` }}
                  />
                </div>
              </div>
              <span className={`font-mono font-bold w-12 text-right \${
                stat.avgScore >= 70 ? 'text-green-400' : stat.avgScore >= 50 ? 'text-yellow-400' : 'text-red-400'
              }`}>
                {stat.avgScore}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
