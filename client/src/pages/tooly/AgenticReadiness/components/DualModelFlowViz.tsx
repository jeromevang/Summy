import React from 'react';
import { ReadinessProgress } from '../types';

interface DualModelFlowVizProps {
  progress: ReadinessProgress | null;
  mainModel: string;
  executorModel: string;
}

export const DualModelFlowViz: React.FC<DualModelFlowVizProps> = ({ progress, mainModel, executorModel }) => {
  const isActive = progress?.mode === 'dual' && progress.status === 'running';
  const currentStep = progress?.attribution || null;
  
  const steps = [
    { id: 'main', label: 'Main Model', icon: '🧠', desc: 'Reasoning & Planning' },
    { id: 'executor', label: 'Executor', icon: '⚡', desc: 'Tool Execution' },
    { id: 'loop', label: 'Agentic Loop', icon: '🔄', desc: 'Result Processing' },
  ];

  return (
    <div className="bg-gray-800/50 border border-purple-500/30 rounded-xl p-6 mb-4">
      <h4 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        🔗 Dual Model Flow
        {isActive && <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded animate-pulse">ACTIVE</span>}
      </h4>
      
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-purple-900/30 rounded-lg p-3 border border-purple-500/20">
          <div className="text-xs text-purple-400 mb-1">🧠 Main Model</div>
          <div className="text-white font-medium truncate">{mainModel || 'Not selected'}</div>
        </div>
        <div className="bg-blue-900/30 rounded-lg p-3 border border-blue-500/20">
          <div className="text-xs text-blue-400 mb-1">⚡ Executor Model</div>
          <div className="text-white font-medium truncate">{executorModel || 'Not selected'}</div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        {steps.map((step, i) => (
          <React.Fragment key={step.id}>
            <div className={`flex-1 p-4 rounded-lg text-center transition-all \${
              currentStep === step.id
                ? 'bg-gradient-to-br from-purple-500/20 to-blue-500/20 border-2 border-purple-400 scale-105'
                : 'bg-gray-700/50 border border-gray-600'
            }`}>
              <div className={`text-2xl mb-2 \${currentStep === step.id ? 'animate-bounce' : ''}`}>
                {step.icon}
              </div>
              <div className={`font-medium \${currentStep === step.id ? 'text-purple-300' : 'text-gray-400'}`}>
                {step.label}
              </div>
              <div className="text-xs text-gray-500 mt-1">{step.desc}</div>
            </div>
            {i < steps.length - 1 && (
              <div className={`text-2xl \${currentStep ? 'text-purple-400' : 'text-gray-600'}`}>→</div>
            )}
          </React.Fragment>
        ))}
      </div>
      
      {progress && (
        <div className="mt-4 p-3 bg-gray-700/30 rounded-lg">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">Current Test:</span>
            <span className="text-white font-medium">{progress.currentTest}</span>
          </div>
          <div className="flex items-center justify-between text-sm mt-1">
            <span className="text-gray-400">Phase:</span>
            <span className={`\${progress.phase === 'qualifying' ? 'text-yellow-400' : 'text-cyan-400'}`}>
              {progress.phase === 'qualifying' ? '🚪 Qualifying Gate' : '🎯 Capability Discovery'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
