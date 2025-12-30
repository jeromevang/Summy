import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProgressPanel, ResultsTable } from './ComboTest/components';
import { useComboTest } from './ComboTest/hooks/useComboTest';
import { formatSize, getModelName } from './ComboTest/utils/formatUtils';
import { THRESHOLD } from './ComboTest/constants';

const ComboTest: React.FC = () => {
  const navigate = useNavigate();
  const {
    models, isLoadingModels, selectedMainModels, setSelectedMainModels,
    selectedExecutorModels, setSelectedExecutorModels, isRunning, progress, results, error,
    selectedCombo, setSelectedCombo, excludedMainModels, runAllCombos
  } = useComboTest();

  const toggleMainModel = (id: string) => {
    setSelectedMainModels(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  const toggleExecutorModel = (id: string) => {
    setSelectedExecutorModels(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        <button onClick={() => navigate('/tooly')} className="text-gray-400 hover:text-white mb-6">← Back</button>
        <h1 className="text-3xl font-bold mb-8">Combo Testing</h1>

        {error && <div className="bg-red-500/20 p-4 mb-6 text-red-400 rounded-lg">{error}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-gray-800/50 border border-gray-700 p-6 rounded-xl">
            <h2 className="text-lg font-medium text-amber-400 mb-4">🧠 Main Models</h2>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {models.map(m => (
                <label key={m.id} className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer \${selectedMainModels.has(m.id) ? 'bg-amber-500/10' : 'bg-gray-700/30'}`}>
                  <input type="checkbox" checked={selectedMainModels.has(m.id)} onChange={() => toggleMainModel(m.id)} />
                  <span className="flex-1 text-sm">{m.displayName || m.id}</span>
                  <span className="text-xs text-gray-500">{formatSize(m.sizeBytes)}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="bg-gray-800/50 border border-gray-700 p-6 rounded-xl">
            <h2 className="text-lg font-medium text-orange-400 mb-4">🔧 Executor Models</h2>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {models.map(m => (
                <label key={m.id} className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer \${selectedExecutorModels.has(m.id) ? 'bg-orange-500/10' : 'bg-gray-700/30'}`}>
                  <input type="checkbox" checked={selectedExecutorModels.has(m.id)} onChange={() => toggleExecutorModel(m.id)} />
                  <span className="flex-1 text-sm">{m.displayName || m.id}</span>
                  <span className="text-xs text-gray-500">{formatSize(m.sizeBytes)}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-gray-800/50 border border-gray-700 p-4 mb-6 flex justify-between items-center rounded-xl">
          <span className="text-gray-400">{selectedMainModels.size * selectedExecutorModels.size} combos selected</span>
          <button onClick={runAllCombos} disabled={isRunning} className="px-6 py-3 bg-amber-500 text-black font-bold rounded-lg disabled:opacity-50">
            {isRunning ? 'Testing...' : 'Run All'}
          </button>
        </div>

        {isRunning && <ProgressPanel progress={progress} models={models} />}
        <ResultsTable results={results} models={models} isRunning={isRunning} selectedMainCount={selectedMainModels.size} selectedExecutorCount={selectedExecutorModels.size} excludedMainModels={excludedMainModels} selectedCombo={selectedCombo} onSelectCombo={setSelectedCombo} />
      </div>
    </div>
  );
};

export default ComboTest;