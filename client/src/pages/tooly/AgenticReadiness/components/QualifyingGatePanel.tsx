import React from 'react';
import { TestResult } from '../types';
import { QUALIFYING_GATE } from '../constants';

interface QualifyingGatePanelProps {
  results: TestResult[];
  phase: 'qualifying' | 'discovery' | undefined;
  disqualifiedAt?: string;
}

export const QualifyingGatePanel: React.FC<QualifyingGatePanelProps> = ({ results, phase, disqualifiedAt }) => {
  const qualifyingResults = results.filter(r => r.testId.startsWith('QG-'));
  
  return (
    <div className={`border rounded-xl p-4 mb-4 \${
      disqualifiedAt 
        ? 'bg-red-500/10 border-red-500/30' 
        : phase === 'qualifying'
          ? 'bg-yellow-500/10 border-yellow-500/30'
          : 'bg-green-500/10 border-green-500/30'
    }`}>
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-medium text-white flex items-center gap-2">
          🚪 Qualifying Gate
          {phase === 'qualifying' && (
            <span className="text-xs px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded animate-pulse">
              TESTING
            </span>
          )}
          {disqualifiedAt && (
            <span className="text-xs px-2 py-0.5 bg-red-500/20 text-red-400 rounded">
              FAILED
            </span>
          )}
          {!disqualifiedAt && phase === 'discovery' && (
            <span className="text-xs px-2 py-0.5 bg-green-500/20 text-green-400 rounded">
              PASSED
            </span>
          )}
        </h4>
      </div>
      
      <div className="grid grid-cols-5 gap-2">
        {QUALIFYING_GATE.map(gate => {
          const result = qualifyingResults.find(r => r.testId === gate.id);
          const status = !result ? 'pending' : result.passed ? 'pass' : 'fail';
          const isCurrent = disqualifiedAt === gate.name;
          
          return (
            <div
              key={gate.id}
              className={`p-2 rounded-lg text-center transition-all \${
                status === 'pending' ? 'bg-gray-700/50 text-gray-400' :
                status === 'pass' ? 'bg-green-500/20 text-green-400' :
                'bg-red-500/20 text-red-400'
              } \${isCurrent ? 'ring-2 ring-red-500' : ''}`}
              title={result?.details || gate.name}
            >
              <div className="text-lg mb-1">{gate.icon}</div>
              <div className="text-xs font-medium truncate">{gate.id}</div>
            </div>
          );
        })}
      </div>
      
      {disqualifiedAt && (
        <div className="mt-3 text-sm text-red-400">
          ❌ Model disqualified at: <strong>{disqualifiedAt}</strong>
        </div>
      )}
    </div>
  );
};