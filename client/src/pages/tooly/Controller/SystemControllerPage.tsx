import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useController } from './hooks/useController'; // Assuming this hook provides controller state

const SystemControllerPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    mainModelId,
    executorModelId,
    mainModelDisplayName,
    executorModelDisplayName,
    isAgenticLoopEnabled,
    toggleAgenticLoop,
    isTogglingAgenticLoop,
    controllerStatus,
  } = useController();

  // Mock for global settings that could be controlled here
  const [globalTemperature, setGlobalTemperature] = useState(0.7);
  const [maxOutputTokens, setMaxOutputTokens] = useState(2048);

  return (
    <div className="h-full overflow-hidden bg-obsidian text-white flex flex-col p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/tooly')}
            className="p-2 hover:bg-white/5 rounded-lg text-white/60 hover:text-white transition-colors"
          >
            ←
          </button>
          <h1 className="text-2xl font-bold text-white">System Controller</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-white/50">Status: </span>
          <span className={`px-3 py-1 rounded-full text-xs font-bold ${
            controllerStatus === 'operational' ? 'bg-cyber-emerald/20 text-cyber-emerald' :
            controllerStatus === 'warning' ? 'bg-cyber-amber/20 text-cyber-amber' :
            'bg-red-500/20 text-red-400'
          }`}>
            {controllerStatus.toUpperCase()}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 flex-1">
        {/* Agentic Loop Control */}
        <div className="bg-obsidian-panel border border-white/5 rounded-xl p-6 shadow-2xl">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center justify-between">
            <span>🔄 Agentic Loop</span>
            <span className={`text-sm ${isAgenticLoopEnabled ? 'text-cyber-emerald' : 'text-red-400'}`}>
              {isAgenticLoopEnabled ? 'ENABLED' : 'DISABLED'}
            </span>
          </h3>
          <p className="text-sm text-white/70 mb-4">
            Activate or deactivate the autonomous agentic loops that orchestrate model interactions.
          </p>
          <button
            onClick={toggleAgenticLoop}
            disabled={isTogglingAgenticLoop}
            className={`w-full py-2 rounded-lg text-sm font-medium transition-all ${
              isAgenticLoopEnabled
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-cyber-emerald hover:bg-cyber-emerald/80'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isTogglingAgenticLoop ? 'Updating...' : isAgenticLoopEnabled ? 'Deactivate Loop' : 'Activate Loop'}
          </button>
        </div>

        {/* Model Assignments */}
        <div className="bg-obsidian-panel border border-white/5 rounded-xl p-6 shadow-2xl">
          <h3 className="text-lg font-semibold text-white mb-4">🧠 Model Assignments</h3>
          <div className="space-y-3">
            <div className="bg-white/5 p-3 rounded-lg flex items-center justify-between">
              <span className="text-sm text-white/70">Main Model (Planning):</span>
              <span className="text-cyber-purple font-mono text-sm">
                {mainModelDisplayName || 'N/A'}
              </span>
            </div>
            <div className="bg-white/5 p-3 rounded-lg flex items-center justify-between">
              <span className="text-sm text-white/70">Executor Model (Action):</span>
              <span className="text-cyber-cyan font-mono text-sm">
                {executorModelDisplayName || 'N/A'}
              </span>
            </div>
          </div>
          <p className="text-xs text-white/50 mt-4">
            Configure these models in the Tooly Model Hub.
          </p>
        </div>

        {/* Global AI Settings (Placeholder) */}
        <div className="bg-obsidian-panel border border-white/5 rounded-xl p-6 shadow-2xl">
          <h3 className="text-lg font-semibold text-white mb-4">⚙️ Global AI Settings</h3>
          <div className="space-y-4">
            <div>
              <label htmlFor="temperature" className="block text-sm font-medium text-white/70 mb-1">Temperature</label>
              <input
                type="range"
                id="temperature"
                min="0"
                max="1"
                step="0.05"
                value={globalTemperature}
                onChange={(e) => setGlobalTemperature(parseFloat(e.target.value))}
                className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyber-purple"
              />
              <span className="text-xs text-white/50 mt-1 block">Value: {globalTemperature.toFixed(2)}</span>
            </div>
            <div>
              <label htmlFor="maxTokens" className="block text-sm font-medium text-white/70 mb-1">Max Output Tokens</label>
              <input
                type="number"
                id="maxTokens"
                min="128"
                max="4096"
                step="128"
                value={maxOutputTokens}
                onChange={(e) => setMaxOutputTokens(parseInt(e.target.value))}
                className="w-full bg-white/[0.03] border border-white/10 rounded px-3 py-2 text-sm text-white focus:border-cyber-purple focus:outline-none"
              />
            </div>
          </div>
          <p className="text-xs text-white/50 mt-4">
            These settings will apply to all agentic model interactions.
          </p>
        </div>

        {/* Real-time Activity Log (Placeholder) */}
        <div className="bg-obsidian-panel border border-white/5 rounded-xl p-6 shadow-2xl col-span-full">
          <h3 className="text-lg font-semibold text-white mb-4">📄 Real-time Activity Log</h3>
          <div className="h-64 bg-white/[0.02] border border-white/10 rounded-lg p-3 overflow-y-auto font-mono text-xs text-white/80">
            <p className="text-white/50">12:34:01 - System: Initializing agentic loop...</p>
            <p className="text-white/50">12:34:05 - Agent: Planning phase started. Main model: {mainModelDisplayName}</p>
            <p className="text-white/50">12:34:10 - Tool Call: readFile (Executor model: {executorModelDisplayName})</p>
            <p className="text-white/50">12:34:12 - Tool Result: Read file 'src/index.ts'</p>
            <p className="text-white/50">12:34:15 - Agent: Execution phase completed. Reasoning about results.</p>
            <p className="text-white/50">12:34:20 - System: Agentic loop idle. Awaiting new instructions.</p>
          </div>
          <p className="text-xs text-white/50 mt-4">
            Real-time feed of Summy's background operations.
          </p>
        </div>
      </div>
    </div>
  );
};

export default SystemControllerPage;