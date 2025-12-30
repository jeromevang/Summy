import React from 'react';
import { ComboTestProgress } from '../types';
import { getModelName } from '../utils/formatUtils';

interface ProgressPanelProps {
  progress: ComboTestProgress | null;
  models: any[];
}

export const ProgressPanel: React.FC<ProgressPanelProps> = ({ progress, models }) => {
  if (!progress || progress.status === 'completed') return null;

  const overallProgress = ((progress.comboIndex - 1) * progress.totalTests + progress.testIndex) / 
                         (progress.totalCombos * progress.totalTests) * 100;

  return (
    <div className="bg-gray-800/50 border border-amber-500/30 rounded-xl p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <span className="text-amber-400 font-medium text-lg">🧪 Testing in Progress</span>
          <div className="text-gray-400 text-sm mt-1">Finding the best Main + Executor combination</div>
        </div>
        <div className="text-right">
          <span className="text-white text-2xl font-bold">{progress.comboIndex}</span>
          <span className="text-gray-400">/{progress.totalCombos} combos</span>
        </div>
      </div>

      <div className="mb-4">
        <div className="h-3 bg-gray-700 rounded-full overflow-hidden mb-2">
          <div className="h-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-500" style={{ width: `\${overallProgress}%` }} />
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">{Math.round(overallProgress)}% complete</span>
          <span className="text-amber-400">Test {progress.testIndex}/{progress.totalTests}</span>
        </div>
      </div>

      <div className="bg-gray-700/30 rounded-lg p-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></div>
          <span className="text-white font-medium">Currently Testing:</span>
          {progress.phase && (
            <span className={`ml-2 px-2 py-0.5 rounded text-xs font-medium \${progress.phase === 'qualifying' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-green-500/20 text-green-400 border border-green-500/30'}`}>
              {progress.phase === 'qualifying' ? '🔍 Qualifying Gate' : '🧪 Full Tests'}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4 mt-3">
          <div><span className="text-gray-400 text-xs uppercase">Main Model</span><div className="text-amber-300 font-mono text-sm truncate">{getModelName(progress.currentMain, models)}</div></div>
          <div><span className="text-gray-400 text-xs uppercase">Executor Model</span><div className="text-orange-300 font-mono text-sm truncate">{getModelName(progress.currentExecutor, models)}</div></div>
        </div>
        <div className="mt-3 pt-3 border-t border-gray-600"><span className="text-gray-400 text-xs uppercase">Current Test</span><div className="text-white">{progress.currentTest}</div></div>
      </div>
    </div>
  );
};
