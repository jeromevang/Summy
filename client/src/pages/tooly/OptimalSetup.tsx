/**
 * Optimal Setup Page
 * Wizard for finding the best model configuration
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// ============================================================
// TYPES
// ============================================================

interface GPUInfo {
  name: string;
  vramMB: number;
  vramFreeMB: number;
  driver: string;
}

interface HardwareProfile {
  gpus: GPUInfo[];
  primaryGpu: GPUInfo | null;
  system: {
    cpuModel: string;
    cpuCores: number;
    ramTotalGB: number;
    ramFreeGB: number;
    platform: string;
  };
  totalVramGB: number;
  availableVramGB: number;
}

interface ScannedModel {
  id: string;
  displayName: string;
  parameters?: string;
  quantization?: string;
  estimatedVramGB: number;
  canRun: boolean;
  loadedNow: boolean;
  testedBefore: boolean;
  lastScore?: number;
}

interface ScanResult {
  models: ScannedModel[];
  totalCount: number;
  runnableCount: number;
  loadedCount: number;
  availableVramGB: number;
}

interface OptimalPair {
  main: ScannedModel;
  executor: ScannedModel;
}

interface ProstheticConfig {
  level1Prompts: string[];
  level2Constraints: string[];
  level3Interventions: string[];
  level4Disqualifications: string[];
}

type WizardStep = 'hardware' | 'scan' | 'results' | 'prosthetic';

export const OptimalSetup: React.FC = () => {
  const navigate = useNavigate();

  const [step, setStep] = useState<WizardStep>('hardware');
  const [hardware, setHardware] = useState<HardwareProfile | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [optimalPair, setOptimalPair] = useState<OptimalPair | null>(null);
  const [alternatives, setAlternatives] = useState<OptimalPair[]>([]);
  const [prostheticConfig, setProstheticConfig] = useState<ProstheticConfig | null>(null);
  const [generatedSystemPrompt, setGeneratedSystemPrompt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Detect hardware on mount
  useEffect(() => {
    detectHardware();
  }, []);

  const detectHardware = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/tooly/optimal-setup/hardware');
      if (!response.ok) throw new Error('Failed to detect hardware');
      const data = await response.json();
      setHardware(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const scanModels = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/tooly/optimal-setup/scan', { method: 'POST' });
      if (!response.ok) throw new Error('Failed to scan models');
      const data = await response.json();
      setScanResult(data);
      setStep('scan');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const findOptimalPairing = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/tooly/optimal-setup/find-pair', { method: 'POST' });
      if (!response.ok) throw new Error('Failed to find optimal pairing');
      const data = await response.json();
      setOptimalPair(data.pair);
      setAlternatives(data.alternatives || []);
      setStep('results');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const generateProsthetic = async () => {
    if (!optimalPair?.main) return;

    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/tooly/prosthetic/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId: optimalPair.main.id })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to generate prosthetic config');
      }

      const data = await response.json();
      setProstheticConfig(data.config);
      setGeneratedSystemPrompt(data.generatedSystemPrompt);
      setStep('prosthetic');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('Are you sure you want to perform a FACTORY RESET? This will delete all sessions and model profiles.')) return;

    setIsLoading(true);
    try {
      await fetch('/api/tooly/reset', { method: 'DELETE' });
      window.location.reload();
    } catch (err: any) {
      setError(err.message);
      setIsLoading(false);
    }
  };

  const applyPairing = async (pair: OptimalPair) => {
    setIsLoading(true);
    try {
      // Set main model
      await fetch('/api/tooly/active-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId: pair.main.id, role: 'main' })
      });

      // Set executor model
      await fetch('/api/tooly/active-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId: pair.executor.id, role: 'executor' })
      });

      // Navigate back to Tooly
      navigate('/tooly');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // ============================================================
  // RENDER STEPS
  // ============================================================

  const renderHardwareStep = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white">Hardware Detection</h2>
      <p className="text-gray-400">Detecting your system hardware to determine optimal model sizes.</p>

      {isLoading && (
        <div className="flex items-center gap-3 text-purple-400">
          <span className="animate-spin">⚙️</span>
          Detecting hardware...
        </div>
      )}

      {hardware && (
        <div className="grid grid-cols-2 gap-6">
          {/* GPU Info */}
          <div className="bg-[#1a1a1a] rounded-lg p-4 border border-[#2d2d2d]">
            <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
              🎮 GPU
            </h3>
            {hardware.primaryGpu ? (
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-400">Name</span>
                  <span className="text-white font-mono">{hardware.primaryGpu.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">VRAM Total</span>
                  <span className="text-white font-mono">{Math.round(hardware.primaryGpu.vramMB / 1024)}GB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">VRAM Free</span>
                  <span className="text-green-400 font-mono">{Math.round(hardware.primaryGpu.vramFreeMB / 1024)}GB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Driver</span>
                  <span className="text-white font-mono">{hardware.primaryGpu.driver}</span>
                </div>
              </div>
            ) : (
              <p className="text-amber-400">No GPU detected</p>
            )}
          </div>

          {/* System Info */}
          <div className="bg-[#1a1a1a] rounded-lg p-4 border border-[#2d2d2d]">
            <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
              💻 System
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-400">CPU</span>
                <span className="text-white font-mono text-sm truncate max-w-[200px]" title={hardware.system.cpuModel}>
                  {hardware.system.cpuModel}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Cores</span>
                <span className="text-white font-mono">{hardware.system.cpuCores}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">RAM Total</span>
                <span className="text-white font-mono">{hardware.system.ramTotalGB}GB</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">RAM Free</span>
                <span className="text-green-400 font-mono">{hardware.system.ramFreeGB}GB</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {hardware && (
        <div className="bg-[#1a1a1a] rounded-lg p-4 border border-purple-500/30">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl">✨</span>
            <span className="text-white font-medium">Available VRAM: {hardware.availableVramGB}GB</span>
          </div>
          <p className="text-gray-400 text-sm">
            Based on your hardware, you can run models up to approximately{' '}
            <span className="text-purple-400 font-medium">
              {hardware.availableVramGB >= 24 ? '70B' :
                hardware.availableVramGB >= 16 ? '32B' :
                  hardware.availableVramGB >= 8 ? '14B' :
                    hardware.availableVramGB >= 4 ? '7B' : '3B'}
            </span>{' '}
            parameters (Q4 quantization).
          </p>
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={scanModels}
          disabled={!hardware || isLoading}
          className="px-6 py-2 bg-gradient-to-r from-purple-600 to-purple-500 
                     hover:from-purple-500 hover:to-purple-400 
                     text-white font-medium rounded-lg shadow-lg 
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Scan Available Models →
        </button>
      </div>
    </div>
  );

  const renderScanStep = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white">Available Models</h2>
      <p className="text-gray-400">
        Found {scanResult?.totalCount || 0} models, {scanResult?.runnableCount || 0} can run on your hardware.
      </p>

      {scanResult && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-4 gap-4">
            <StatCard label="Total Models" value={scanResult.totalCount} />
            <StatCard label="Can Run" value={scanResult.runnableCount} color="green" />
            <StatCard label="Currently Loaded" value={scanResult.loadedCount} color="purple" />
            <StatCard label="Available VRAM" value={`${scanResult.availableVramGB}GB`} />
          </div>

          {/* Model List */}
          <div className="bg-[#1a1a1a] rounded-lg border border-[#2d2d2d] max-h-96 overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-[#1a1a1a] border-b border-[#2d2d2d]">
                <tr>
                  <th className="text-left px-4 py-2 text-gray-400 text-sm">Model</th>
                  <th className="text-left px-4 py-2 text-gray-400 text-sm">Size</th>
                  <th className="text-left px-4 py-2 text-gray-400 text-sm">VRAM</th>
                  <th className="text-left px-4 py-2 text-gray-400 text-sm">Status</th>
                  <th className="text-left px-4 py-2 text-gray-400 text-sm">Score</th>
                </tr>
              </thead>
              <tbody>
                {scanResult.models.map(model => (
                  <tr
                    key={model.id}
                    className={`border-b border-[#2d2d2d] ${!model.canRun ? 'opacity-50' : ''}`}
                  >
                    <td className="px-4 py-2">
                      <span className="text-white">{model.displayName}</span>
                    </td>
                    <td className="px-4 py-2 text-gray-400 font-mono text-sm">
                      {model.parameters || '-'}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`font-mono text-sm ${model.canRun ? 'text-green-400' : 'text-red-400'
                        }`}>
                        {model.estimatedVramGB}GB
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      {model.loadedNow && (
                        <span className="text-purple-400 text-xs bg-purple-400/10 px-2 py-0.5 rounded">
                          Loaded
                        </span>
                      )}
                      {!model.canRun && (
                        <span className="text-red-400 text-xs bg-red-400/10 px-2 py-0.5 rounded">
                          Too Large
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {model.lastScore !== undefined ? (
                        <span className={`font-mono text-sm ${model.lastScore >= 70 ? 'text-green-400' :
                            model.lastScore >= 50 ? 'text-amber-400' : 'text-red-400'
                          }`}>
                          {model.lastScore}%
                        </span>
                      ) : (
                        <span className="text-gray-500 text-xs">Not tested</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="flex justify-between">
        <button
          onClick={() => setStep('hardware')}
          className="px-6 py-2 bg-[#2d2d2d] text-gray-300 hover:bg-[#3d3d3d] 
                     font-medium rounded-lg"
        >
          ← Back
        </button>
        <button
          onClick={findOptimalPairing}
          disabled={!scanResult || scanResult.runnableCount < 2 || isLoading}
          className="px-6 py-2 bg-gradient-to-r from-purple-600 to-purple-500 
                     hover:from-purple-500 hover:to-purple-400 
                     text-white font-medium rounded-lg shadow-lg 
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Find Optimal Pairing →
        </button>
      </div>
    </div>
  );

  const renderResultsStep = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white">Recommended Setup</h2>
      <p className="text-gray-400">
        Based on your hardware and available models, here's the optimal configuration.
      </p>

      {optimalPair ? (
        <>
          {/* Optimal Pair */}
          <div className="bg-gradient-to-r from-purple-500/10 to-cyan-500/10 rounded-lg p-6 border border-purple-500/30">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              ✨ Recommended Pairing
            </h3>
            <div className="grid grid-cols-2 gap-6">
              {/* Main Model */}
              <div className="bg-[#1a1a1a] rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-purple-400">🎯</span>
                  <span className="text-purple-400 font-medium">Main Model</span>
                </div>
                <p className="text-white font-medium text-lg">{optimalPair.main.displayName}</p>
                <p className="text-gray-400 text-sm mt-1">
                  {optimalPair.main.parameters} • {optimalPair.main.estimatedVramGB}GB VRAM
                </p>
                <p className="text-gray-500 text-xs mt-2">
                  Best for reasoning and complex tasks
                </p>
              </div>

              {/* Executor Model */}
              <div className="bg-[#1a1a1a] rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-cyan-400">⚡</span>
                  <span className="text-cyan-400 font-medium">Executor Model</span>
                </div>
                <p className="text-white font-medium text-lg">{optimalPair.executor.displayName}</p>
                <p className="text-gray-400 text-sm mt-1">
                  {optimalPair.executor.parameters} • {optimalPair.executor.estimatedVramGB}GB VRAM
                </p>
                <p className="text-gray-500 text-xs mt-2">
                  Best for fast tool execution
                </p>
              </div>
            </div>
          </div>

          {/* Alternatives */}
          {alternatives.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">Alternatives</h3>
              <div className="space-y-2">
                {alternatives.map((alt, i) => (
                  <div key={i} className="bg-[#1a1a1a] rounded-lg p-3 border border-[#2d2d2d] flex justify-between items-center">
                    <div>
                      <span className="text-purple-400">{alt.main.displayName}</span>
                      <span className="text-gray-500 mx-2">+</span>
                      <span className="text-cyan-400">{alt.executor.displayName}</span>
                    </div>
                    <button
                      onClick={() => setOptimalPair(alt)}
                      className="px-4 py-1 bg-[#2d2d2d] text-gray-300 hover:bg-[#3d3d3d] 
                                 text-sm rounded"
                    >
                      Select
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
          <p className="text-amber-400">
            Could not find an optimal pairing. You may need to download more models or
            free up VRAM to run two models simultaneously.
          </p>
        </div>
      )}

      <div className="flex justify-between">
        <button
          onClick={() => setStep('scan')}
          className="px-6 py-2 bg-[#2d2d2d] text-gray-300 hover:bg-[#3d3d3d] 
                     font-medium rounded-lg"
        >
          ← Back
        </button>
        <div className="flex gap-3">
          <button
            onClick={generateProsthetic}
            disabled={isLoading || !optimalPair}
            className="px-6 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 
                       hover:from-cyan-500 hover:to-blue-500 
                       text-white font-medium rounded-lg shadow-lg disabled:opacity-50"
          >
            Generate Prosthetic Config →
          </button>

          <button
            onClick={() => optimalPair && applyPairing(optimalPair)}
            disabled={isLoading || !optimalPair}
            className="px-6 py-2 bg-[#2d2d2d] text-white hover:bg-[#3d3d3d] font-medium rounded-lg disabled:opacity-50"
          >
            Skip to Dashboard
          </button>
        </div>
      </div>
    </div>
  );

  const renderProstheticStep = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white">Prosthetic Intelligence</h2>
      <p className="text-gray-400">Targeted interventions generated from test failures.</p>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-[#1a1a1a] p-4 rounded-lg border border-[#2d2d2d]">
          <h3 className="text-lg font-semibold text-white mb-3">Intervention Layers</h3>
          <div className="space-y-4">
            {prostheticConfig?.level4Disqualifications.length ? (
              <div className="bg-red-900/20 p-3 rounded border border-red-500/30">
                <div className="text-red-400 font-bold text-sm mb-1">LEVEL 4: DISQUALIFICATIONS</div>
                <ul className="list-disc list-inside text-gray-300 text-sm">
                  {prostheticConfig.level4Disqualifications.map(d => <li key={d}>{d}</li>)}
                </ul>
              </div>
            ) : null}

            {prostheticConfig?.level2Constraints.length ? (
              <div className="bg-amber-900/20 p-3 rounded border border-amber-500/30">
                <div className="text-amber-400 font-bold text-sm mb-1">LEVEL 2: CONSTRAINTS</div>
                <ul className="list-disc list-inside text-gray-300 text-sm">
                  {prostheticConfig.level2Constraints.map(d => <li key={d}>{d}</li>)}
                </ul>
              </div>
            ) : null}

            {prostheticConfig?.level1Prompts.length ? (
              <div className="bg-blue-900/20 p-3 rounded border border-blue-500/30">
                <div className="text-blue-400 font-bold text-sm mb-1">LEVEL 1: NOTICES</div>
                <ul className="list-disc list-inside text-gray-300 text-sm">
                  {prostheticConfig.level1Prompts.map(d => <li key={d}>{d}</li>)}
                </ul>
              </div>
            ) : <div className="text-gray-500 italic">No interventions needed.</div>}
          </div>
        </div>

        <div className="bg-[#1a1a1a] p-4 rounded-lg border border-[#2d2d2d]">
          <h3 className="text-lg font-semibold text-white mb-3">Generated System Prompt</h3>
          <textarea
            readOnly
            value={generatedSystemPrompt || ''}
            className="w-full h-64 bg-[#0f0f0f] text-gray-300 text-sm font-mono p-3 rounded border border-[#2d2d2d]"
          />
        </div>
      </div>

      <div className="flex justify-between">
        <button onClick={() => setStep('results')} className="px-6 py-2 bg-[#2d2d2d] rounded-lg text-gray-300">← Back</button>
        <div className="flex gap-3">
          <button
            onClick={() => optimalPair && applyPairing(optimalPair)}
            className="px-6 py-2 bg-gradient-to-r from-purple-600 to-purple-500 text-white font-medium rounded-lg shadow-lg"
          >
            Apply & Finish
          </button>
          <button
            onClick={() => navigate('/tooly/readiness')}
            className="px-6 py-2 bg-gradient-to-r from-cyan-600 to-cyan-500 text-white font-medium rounded-lg shadow-lg"
          >
            Continue to Readiness →
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-full bg-[#0f0f0f] p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-start mb-8">
          <div>
            <button onClick={() => navigate('/tooly')} className="text-gray-400 hover:text-white mb-4 flex items-center gap-2">← Back to Model Hub</button>
            <h1 className="text-3xl font-bold text-white">Optimal Setup Finder</h1>
            <p className="text-gray-400 mt-1">Find the best model configuration for your hardware</p>
          </div>
          <button
            onClick={handleReset}
            className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-sm transition-colors"
          >
            ⚠️ Factory Reset
          </button>
        </div>

        <div className="flex items-center gap-4 mb-8">
          <StepIndicator step={1} label="Hardware" active={step === 'hardware'} completed={step !== 'hardware'} />
          <div className="flex-1 h-px bg-[#2d2d2d]" />
          <StepIndicator step={2} label="Scan Models" active={step === 'scan'} completed={step !== 'scan' && step !== 'hardware'} />
          <div className="flex-1 h-px bg-[#2d2d2d]" />
          <StepIndicator step={3} label="Results" active={step === 'results'} completed={step === 'prosthetic'} />
          <div className="flex-1 h-px bg-[#2d2d2d]" />
          <StepIndicator step={4} label="Prosthetic" active={step === 'prosthetic'} completed={false} />
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6 text-red-400">{error}</div>}

        {step === 'hardware' && renderHardwareStep()}
        {step === 'scan' && renderScanStep()}
        {step === 'results' && renderResultsStep()}
        {step === 'prosthetic' && renderProstheticStep()}
      </div>
    </div>
  );
};
// ... (StepIndicator, StatCard)

// ============================================================
// HELPER COMPONENTS
// ============================================================

const StepIndicator: React.FC<{
  step: number;
  label: string;
  active: boolean;
  completed: boolean
}> = ({ step, label, active, completed }) => (
  <div className="flex items-center gap-2">
    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-medium ${active ? 'bg-purple-600 text-white' :
      completed ? 'bg-green-600 text-white' :
        'bg-[#2d2d2d] text-gray-500'
      }`}>
      {completed ? '✓' : step}
    </div>
    <span className={active ? 'text-white' : 'text-gray-500'}>{label}</span>
  </div>
);

const StatCard: React.FC<{
  label: string;
  value: string | number;
  color?: 'green' | 'purple' | 'amber'
}> = ({ label, value, color }) => (
  <div className="bg-[#1a1a1a] rounded-lg p-3 border border-[#2d2d2d]">
    <p className="text-gray-400 text-sm">{label}</p>
    <p className={`text-xl font-bold ${color === 'green' ? 'text-green-400' :
      color === 'purple' ? 'text-purple-400' :
        color === 'amber' ? 'text-amber-400' :
          'text-white'
      }`}>
      {value}
    </p>
  </div>
);

export default OptimalSetup;

