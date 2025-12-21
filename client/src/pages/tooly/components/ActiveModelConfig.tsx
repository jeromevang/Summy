import React from 'react';
import type { DiscoveredModel } from '../types';

interface ActiveModelConfigProps {
  models: DiscoveredModel[];
  enableDualModel: boolean;
  setEnableDualModel: (enabled: boolean) => void;
  mainModelId: string;
  setMainModelId: (id: string) => void;
  executorModelId: string;
  setExecutorModelId: (id: string) => void;
  savingDualModel: boolean;
  modelValidationError: string;
  setModelValidationError: (error: string) => void;
  saveDualModelConfig: () => Promise<void>;
}

export const ActiveModelConfig: React.FC<ActiveModelConfigProps> = ({
  models,
  enableDualModel,
  setEnableDualModel,
  mainModelId,
  setMainModelId,
  executorModelId,
  setExecutorModelId,
  savingDualModel,
  modelValidationError,
  setModelValidationError,
  saveDualModelConfig,
}) => {
  const lmstudioModels = models.filter(m => m.provider === 'lmstudio');

  return (
    <div className="bg-[#1a1a1a] rounded-xl border border-[#2d2d2d] p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-medium flex items-center gap-2">
          <span className="text-lg">🎯</span> Active Model Configuration
        </h3>
        <button
          onClick={saveDualModelConfig}
          disabled={savingDualModel}
          className="px-4 py-1.5 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-lg disabled:opacity-50 font-medium"
        >
          {savingDualModel ? 'Saving...' : 'Save & Apply'}
        </button>
      </div>
      
      {/* Validation Error */}
      {modelValidationError && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
          ❌ {modelValidationError}
        </div>
      )}
      
      {/* Dual Model Toggle */}
      <label className="flex items-center gap-3 mb-4 cursor-pointer">
        <input
          type="checkbox"
          checked={enableDualModel}
          onChange={(e) => {
            setEnableDualModel(e.target.checked);
            setModelValidationError('');
          }}
          className="w-5 h-5 rounded border-gray-600 bg-[#0d0d0d] text-purple-500 focus:ring-purple-500"
        />
        <div>
          <span className="text-white font-medium">Enable Dual-Model Routing</span>
          <p className="text-xs text-gray-400">Use separate models for reasoning and tool execution</p>
        </div>
      </label>
      
      {/* Model Selection */}
      <div className={`grid ${enableDualModel ? 'grid-cols-2' : 'grid-cols-1'} gap-4`}>
        {/* Main Model - Always shown */}
        <div className="p-3 bg-[#0d0d0d] rounded-lg border border-[#2d2d2d]">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">{enableDualModel ? '🧠' : '🤖'}</span>
            <span className="text-white font-medium">
              {enableDualModel ? 'Main Model (Reasoning)' : 'Model'}
            </span>
          </div>
          <select
            value={mainModelId}
            onChange={(e) => {
              setMainModelId(e.target.value);
              setModelValidationError('');
            }}
            className="w-full bg-[#1a1a1a] border border-[#3d3d3d] rounded px-3 py-2 text-white text-sm focus:border-purple-500 focus:outline-none"
          >
            <option value="">Select model...</option>
            {lmstudioModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName} {m.maxContextLength ? `(${Math.round(m.maxContextLength / 1024)}K)` : ''}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-2">
            {enableDualModel 
              ? 'Handles reasoning, planning. No direct tool access.' 
              : 'This model handles all requests (reasoning + tools)'}
          </p>
        </div>
        
        {/* Executor Model - Only shown when dual mode is enabled */}
        {enableDualModel && (
          <div className="p-3 bg-[#0d0d0d] rounded-lg border border-[#2d2d2d]">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">⚡</span>
              <span className="text-white font-medium">Executor Model (Tools)</span>
            </div>
            <select
              value={executorModelId}
              onChange={(e) => {
                setExecutorModelId(e.target.value);
                setModelValidationError('');
              }}
              className="w-full bg-[#1a1a1a] border border-[#3d3d3d] rounded px-3 py-2 text-white text-sm focus:border-purple-500 focus:outline-none"
            >
              <option value="">Select model...</option>
              {lmstudioModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName} {m.maxContextLength ? `(${Math.round(m.maxContextLength / 1024)}K)` : ''}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-2">
              Executes tool calls. Schema-aware, deterministic.
            </p>
          </div>
        )}
      </div>
      
      {/* Current Active Model Display */}
      {mainModelId && (
        <div className="mt-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
          <div className="text-xs text-gray-400 mb-1">Active Model(s):</div>
          <div className="text-sm text-white">
            {enableDualModel ? (
              <>
                <span className="text-purple-400">Main:</span> {models.find(m => m.id === mainModelId)?.displayName || mainModelId}
                {executorModelId && (
                  <>
                    <span className="mx-2 text-gray-500">|</span>
                    <span className="text-blue-400">Executor:</span> {models.find(m => m.id === executorModelId)?.displayName || executorModelId}
                  </>
                )}
              </>
            ) : (
              <span className="text-green-400">{models.find(m => m.id === mainModelId)?.displayName || mainModelId}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

