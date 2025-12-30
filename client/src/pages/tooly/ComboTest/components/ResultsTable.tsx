import React from 'react';
import { ComboScore, Model } from '../types';
import { getModelName } from '../utils/formatUtils';

interface ResultsTableProps {
  results: ComboScore[];
  models: Model[];
  isRunning: boolean;
  selectedMainCount: number;
  selectedExecutorCount: number;
  excludedMainModels: Set<string>;
  selectedCombo: { main: string; executor: string } | null;
  onSelectCombo: (combo: { main: string; executor: string }) => void;
}

export const ResultsTable: React.FC<ResultsTableProps> = ({
  results, models, isRunning, selectedMainCount, selectedExecutorCount, excludedMainModels, selectedCombo, onSelectCombo
}) => {
  if (results.length === 0) return null;

  const totalCombosExpected = selectedMainCount * selectedExecutorCount;
  const stillRunning = isRunning && results.length < totalCombosExpected;

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-white">Results</h2>
        {stillRunning && <span className="text-amber-400 text-sm">Testing {results.length}/{totalCombosExpected}...</span>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="text-gray-400 text-sm border-b border-gray-700">
              <th className="pb-3">Rank</th>
              <th className="pb-3">Main Model</th>
              <th className="pb-3">Executor Model</th>
              <th className="pb-3 text-right">Score</th>
              <th className="pb-3 text-right">Latency</th>
              <th className="pb-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => (
              <tr key={`\${r.mainModelId}-\${r.executorModelId}`} className="border-b border-gray-700/50 hover:bg-gray-700/20">
                <td className="py-3">{i + 1}</td>
                <td className="py-3 text-amber-300 font-mono">{getModelName(r.mainModelId, models)}</td>
                <td className="py-3 text-orange-300 font-mono">{getModelName(r.executorModelId, models)}</td>
                <td className="py-3 text-right font-bold text-green-400">{r.overallScore}%</td>
                <td className="py-3 text-right">{(r.avgLatencyMs / 1000).toFixed(1)}s</td>
                <td className="py-3">
                  <button onClick={() => onSelectCombo({ main: r.mainModelId, executor: r.executorModelId })} className={`px-2 py-1 rounded text-xs \${selectedCombo?.main === r.mainModelId && selectedCombo?.executor === r.executorModelId ? 'bg-cyan-500 text-black' : 'bg-gray-700 text-gray-300'}`}>Select</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
