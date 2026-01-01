import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ModelCard } from './ModelCard';
import type {
  DiscoveredModel,
  TestProgress,
  TestAllProgress,
  IntentProgress,
  ProviderFilter,
  TestMode,
  AvailableProviders,
} from '../types';

type TestAllMode = 'quick' | 'standard' | 'deep' | 'optimization';

const TEST_MODE_OPTIONS: { mode: TestAllMode; label: string; icon: string; desc: string; time: string }[] = [
  { mode: 'quick', label: 'Quick', icon: '⚡', desc: 'Basic capability check', time: '~30s/model' },
  { mode: 'standard', label: 'Standard', icon: '🧪', desc: 'Full tests + probes', time: '~3min/model' },
  { mode: 'deep', label: 'Deep', icon: '🔬', desc: 'All probes + strategic tests', time: '~10min/model' },
  { mode: 'optimization', label: 'Optimize', icon: '⚙️', desc: 'Sweeps + config generation', time: '~15min/model' },
];

interface ModelListPanelProps {
  models: DiscoveredModel[];
  selectedModelId: string | null;
  loading: boolean;
  testProgress: TestProgress;
  calculateETA: () => string | null;
  onSelectModel: (modelId: string) => void;
  
  // Filters
  providerFilter: ProviderFilter;
  setProviderFilter: (filter: ProviderFilter) => void;
  availableProviders: AvailableProviders;
  testMode: TestMode;
  setTestMode: (mode: TestMode) => void;
  
  // Test all
  testingAllModels: boolean;
  setTestingAllModels: (testing: boolean) => void;
  testAllProgress: TestAllProgress | null;
  setTestAllProgress: (progress: TestAllProgress | null) => void;
  cancelTestAllRef: React.MutableRefObject<boolean>;
  
  // Test intents
  testingIntents: boolean;
  setTestingIntents: (testing: boolean) => void;
  intentProgress: IntentProgress | null;
  setIntentProgress: (progress: IntentProgress | null) => void;
  cancelIntentTestRef: React.MutableRefObject<boolean>;
  
  // API
  fetchModels: () => Promise<void>;
}

export const ModelListPanel: React.FC<ModelListPanelProps> = ({
  models,
  selectedModelId,
  loading,
  testProgress,
  calculateETA,
  onSelectModel,
  providerFilter,
  setProviderFilter,
  availableProviders,
  testMode,
  setTestMode,
  testingAllModels,
  setTestingAllModels,
  testAllProgress,
  setTestAllProgress,
  cancelTestAllRef,
  testingIntents,
  setTestingIntents,
  intentProgress,
  setIntentProgress,
  cancelIntentTestRef,
  fetchModels,
}) => {
  const navigate = useNavigate();
  const lmstudioModels = models.filter(m => m.provider === 'lmstudio');

  // Filter models based on provider filter
  const filteredModels = providerFilter === 'all'
    ? models
    : models.filter(m => m.provider === providerFilter);
  const [showModeDialog, setShowModeDialog] = useState(false);
  const [selectedTestMode, setSelectedTestMode] = useState<TestAllMode>('standard');

  const handleTestAllModels = async (mode: TestAllMode = 'standard') => {
    if (testingAllModels) {
      cancelTestAllRef.current = true;
      return;
    }
    
    if (lmstudioModels.length === 0) return;
    
    setTestingAllModels(true);
    setSelectedTestMode(mode);
    cancelTestAllRef.current = false;
    setTestAllProgress({
      current: 0,
      total: lmstudioModels.length,
      currentModelName: '',
      skipped: [],
      completed: []
    });
    
    for (let i = 0; i < lmstudioModels.length; i++) {
      if (cancelTestAllRef.current) break;
      
      const model = lmstudioModels[i];
      setTestAllProgress((prev: any) => prev ? {
        ...prev,
        current: i + 1,
        currentModelName: model.displayName
      } : null);
      
      // Quick latency check (skip for quick mode - it's fast enough)
      if (mode !== 'quick') {
        try {
          const quickLatencyRes = await fetch(`http://localhost:3001/api/tooly/models/${encodeURIComponent(model.id)}/quick-latency`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider: model.provider })
          });
          
          if (quickLatencyRes.ok) {
            const { latency } = await quickLatencyRes.json();
            
            // Skip if too slow (> 10 seconds for standard, > 15 seconds for deep/optimization)
            const threshold = mode === 'standard' ? 10000 : 15000;
            if (latency > threshold) {
              setTestAllProgress((prev: any) => prev ? {
                ...prev,
                skipped: [...prev.skipped, model.displayName]
              } : null);
              continue;
            }
          } else {
            setTestAllProgress((prev: any) => prev ? {
              ...prev,
              skipped: [...prev.skipped, model.displayName]
            } : null);
            continue;
          }
        } catch {
          setTestAllProgress((prev: any) => prev ? {
            ...prev,
            skipped: [...prev.skipped, model.displayName]
          } : null);
          continue;
        }
      }
      
      if (cancelTestAllRef.current) break;
      
      // Run tests based on mode
      try {
        // For all modes: run probe first
        await fetch(`http://localhost:3001/api/tooly/models/${encodeURIComponent(model.id)}/probe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: model.provider, runLatencyProfile: false })
        });
        
        if (cancelTestAllRef.current) break;
        
        // Run the main test with the selected mode
        await fetch(`http://localhost:3001/api/tooly/models/${encodeURIComponent(model.id)}/test`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            provider: model.provider,
            mode: mode // Pass the selected mode to the test endpoint
          })
        });
        
        if (cancelTestAllRef.current) break;
        
        // For standard/deep/optimization: run latency profile
        if (mode !== 'quick') {
          await fetch(`http://localhost:3001/api/tooly/models/${encodeURIComponent(model.id)}/latency-profile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider: model.provider })
          });
        }
        
        setTestAllProgress((prev: any) => prev ? {
          ...prev,
          completed: [...prev.completed, model.displayName]
        } : null);
      } catch (error) {
        console.error(`Failed to test ${model.id}:`, error);
        setTestAllProgress((prev: any) => prev ? {
          ...prev,
          skipped: [...prev.skipped, model.displayName]
        } : null);
      }
    }
    
    await fetchModels();
    setTestingAllModels(false);
    setTimeout(() => setTestAllProgress(null), 5000);
  };

  const handleTestAllClick = () => {
    if (testingAllModels) {
      // If already testing, stop
      cancelTestAllRef.current = true;
    } else {
      // Show mode selection dialog
      setShowModeDialog(true);
    }
  };

  const handleTestIntents = async () => {
    if (testingIntents) {
      cancelIntentTestRef.current = true;
      return;
    }
    
    if (lmstudioModels.length === 0) return;
    
    setTestingIntents(true);
    cancelIntentTestRef.current = false;
    
    for (let i = 0; i < lmstudioModels.length; i++) {
      if (cancelIntentTestRef.current) break;
      
      const model = lmstudioModels[i];
      setIntentProgress({
        current: i + 1,
        total: lmstudioModels.length,
        currentModelName: model.displayName
      });
      
      try {
        await fetch(`http://localhost:3001/api/tooly/probe/${encodeURIComponent(model.id)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            categories: ['8.x'], // Intent Recognition only
            mode: 'quick' 
          })
        });
      } catch (error) {
        console.error(`Failed to test intents for ${model.id}:`, error);
      }
    }
    
    await fetchModels();
    setTestingIntents(false);
    setTimeout(() => setIntentProgress(null), 3000);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-obsidian-panel rounded-xl border border-white/5 p-6 shadow-2xl relative">
      {/* Background Accent */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-cyber-purple/5 blur-[120px] rounded-full -mr-32 -mt-32 pointer-events-none" />

      <div className="flex flex-col gap-6 mb-8 relative z-10">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-cyber-purple/10 p-2.5 rounded-xl border border-cyber-purple/20">
              <span className="text-2xl text-cyber-purple">🛰️</span>
            </div>
            <div>
              <h3 className="text-xl font-bold text-white tracking-tight">Swarm Hub</h3>
              <p className="text-[10px] text-white/30 font-bold uppercase tracking-[0.3em]">Intelligence Grid</p>
            </div>
          </div>
          
          {/* Filters */}
          <div className="flex items-center gap-6">
            {/* Provider Filter */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[9px] text-white/20 uppercase tracking-[0.2em] font-bold ml-1">Source Cluster</span>
              <div className="relative">
                <select
                  value={providerFilter}
                  onChange={(e) => setProviderFilter(e.target.value as ProviderFilter)}
                  className="bg-white/[0.03] border border-white/10 rounded-lg px-4 py-2 text-xs text-white/70 focus:border-cyber-purple/50 focus:ring-1 focus:ring-cyber-purple/20 focus:outline-none appearance-none cursor-pointer min-w-[160px] hover:bg-white/[0.05] transition-all"
                >
                  <option value="all">All Providers</option>
                  <option value="lmstudio" disabled={!availableProviders.lmstudio}>
                    Local Cluster (LMStudio)
                  </option>
                  <option value="openai" disabled={!availableProviders.openai}>
                    Cloud (OpenAI)
                  </option>
                  <option value="openrouter" disabled={!availableProviders.openrouter}>
                    Warp Gate (OpenRouter)
                  </option>
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/20 text-[10px]">▼</div>
              </div>
            </div>
            
            {/* Test Mode */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[9px] text-white/20 uppercase tracking-[0.2em] font-bold ml-1">Test Protocol</span>
              <div className="relative">
                <select
                  value={testMode}
                  onChange={(e) => setTestMode(e.target.value as TestMode)}
                  className="bg-white/[0.03] border border-white/10 rounded-lg px-4 py-2 text-xs text-white/70 focus:border-cyber-purple/50 focus:ring-1 focus:ring-cyber-purple/20 focus:outline-none appearance-none cursor-pointer min-w-[140px] hover:bg-white/[0.05] transition-all"
                  title="Controls model loading/unloading during tests"
                >
                  <option value="quick">⚡ Fast Sync</option>
                  <option value="keep_on_success">🔄 Persistent</option>
                  <option value="manual">🛠️ Debug</option>
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/20 text-[10px]">▼</div>
              </div>
            </div>
          </div>
        </div>

        {/* Action buttons row */}
        <div className="flex items-center gap-4 pt-6 border-t border-white/5">
          {/* Test All Models Button */}
          <button
            onClick={handleTestAllClick}
            disabled={lmstudioModels.length === 0}
            className={`px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all flex items-center gap-3 border ${
              testingAllModels
                ? 'bg-red-500/10 border-red-500/50 text-red-400 hover:bg-red-500/20'
                : 'bg-cyber-purple/10 border-cyber-purple/30 text-cyber-purple hover:bg-cyber-purple/20 shadow-[0_0_15px_rgba(139,92,246,0.1)]'
            } disabled:opacity-20 disabled:grayscale disabled:cursor-not-allowed`}
          >
            {testingAllModels ? (
              <><span className="animate-spin">⚙️</span> Abort Sweep</>
            ) : (
              <><span className="text-xs">🧪</span> Full Sweep</>
            )}
          </button>
          
          {/* Test Intents Button */}
          <button
            onClick={handleTestIntents}
            disabled={lmstudioModels.length === 0 || testingAllModels}
            className={`px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all flex items-center gap-3 border ${
              testingIntents
                ? 'bg-red-500/10 border-red-500/50 text-red-400 hover:bg-red-500/20'
                : 'bg-cyber-amber/10 border-cyber-amber/30 text-cyber-amber hover:bg-cyber-amber/20'
            } disabled:opacity-20 disabled:grayscale disabled:cursor-not-allowed`}
          >
            {testingIntents ? (
              <><span className="animate-spin">⚙️</span> Stop</>
            ) : (
              <><span className="text-xs">🎯</span> Intent Audit</>
            )}
          </button>
          
          <div className="h-4 w-[1px] bg-white/5 mx-2" />

          {/* Agentic Readiness Button */}
          <button
            onClick={() => navigate('/tooly/readiness')}
            className="px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all flex items-center gap-3 border bg-cyber-cyan/10 border-cyber-cyan/30 text-cyber-cyan hover:bg-cyber-cyan/20"
          >
            <span className="text-xs">🚀</span> Readiness Lab
          </button>
          
          {/* Combo Testing Button */}
          <button
            onClick={() => navigate('/tooly/combo-test')}
            className="px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all flex items-center gap-3 border bg-cyber-emerald/10 border-cyber-emerald/30 text-cyber-emerald hover:bg-cyber-emerald/20"
          >
            <span className="text-xs">⚖️</span> Pair Analysis
          </button>

          <div className="flex-1" />

          <button
            onClick={() => fetchModels()}
            className="p-2.5 text-white/20 hover:text-white hover:bg-white/5 rounded-xl transition-all border border-transparent hover:border-white/10"
            title="Re-scan Cluster"
          >
            <span className="text-lg">🔄</span>
          </button>
        </div>
      </div>
      
      {/* Mode Selection Dialog - updated styling */}
      {showModeDialog && createPortal(
        <div className="fixed inset-0 bg-obsidian/80 flex items-center justify-center z-[9999] backdrop-blur-xl">
          <div className="bg-obsidian-panel p-6 rounded-2xl border border-white/10 max-w-sm w-full mx-4 shadow-[0_0_50px_rgba(0,0,0,0.5)]">
            <h3 className="text-lg font-bold text-white mb-1 tracking-tight">Diagnostic Protocol</h3>
            <p className="text-[10px] text-white/30 uppercase tracking-widest mb-6">
              Targeting {lmstudioModels.length} nodes in local cluster
            </p>
            <div className="space-y-3">
              {TEST_MODE_OPTIONS.map(({ mode, label, icon, desc, time }) => (
                <button
                  key={mode}
                  onClick={() => {
                    setShowModeDialog(false);
                    handleTestAllModels(mode);
                  }}
                  className="w-full p-4 text-left rounded-xl border border-white/5 bg-white/[0.02] hover:border-cyber-purple/50 hover:bg-cyber-purple/5 transition-all group"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-3">
                      <span className="text-xl group-hover:scale-110 transition-transform">{icon}</span>
                      <span className="font-bold text-sm text-white/80 group-hover:text-white uppercase tracking-wider">{label}</span>
                    </div>
                    <span className="text-[9px] font-mono text-white/20 uppercase">{time}</span>
                  </div>
                  <p className="text-[10px] text-white/30 ml-8 leading-relaxed font-medium">{desc}</p>
                </button>
              ))}
            </div>
            <button 
              onClick={() => setShowModeDialog(false)} 
              className="mt-6 w-full py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/20 hover:text-white transition-colors"
            >
              Cancel Mission
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Progress Bars - updated styling */}
      <div className="space-y-3 mb-6 relative z-10">
        {testAllProgress && (
          <div className="p-4 bg-cyber-purple/5 border border-cyber-purple/20 rounded-xl backdrop-blur-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="text-sm">{TEST_MODE_OPTIONS.find(o => o.mode === selectedTestMode)?.icon}</span>
                <span className="text-[10px] font-bold text-cyber-purple uppercase tracking-widest">
                   Sweep Protocol: {selectedTestMode} ({testAllProgress.current}/{testAllProgress.total})
                </span>
              </div>
              <div className="flex items-center gap-3 text-[9px] font-bold uppercase tracking-wider">
                <span className="text-cyber-emerald">✅ {testAllProgress.completed.length}</span>
                <span className="text-white/20">|</span>
                <span className="text-cyber-amber">⏭️ {testAllProgress.skipped.length} Skipped</span>
              </div>
            </div>
            <div className="w-full bg-white/5 rounded-full h-1 overflow-hidden">
              <div 
                className="bg-cyber-purple h-full rounded-full transition-all duration-500 shadow-[0_0_10px_rgba(139,92,246,0.3)]"
                style={{ width: `${(testAllProgress.current / testAllProgress.total) * 100}%` }}
              />
            </div>
            {testAllProgress.currentModelName && testingAllModels && (
              <p className="text-[9px] text-white/30 mt-2 font-mono uppercase tracking-wider">
                Synchronizing: {testAllProgress.currentModelName}
              </p>
            )}
          </div>
        )}
        
        {intentProgress && (
          <div className="p-4 bg-cyber-amber/5 border border-cyber-amber/20 rounded-xl backdrop-blur-sm">
            <div className="flex items-center justify-between mb-3">
               <div className="flex items-center gap-3">
                <span className="text-sm">🎯</span>
                <span className="text-[10px] font-bold text-cyber-amber uppercase tracking-widest">
                   Intent Audit ({intentProgress.current}/{intentProgress.total})
                </span>
              </div>
            </div>
            <div className="w-full bg-white/5 rounded-full h-1 overflow-hidden">
              <div 
                className="bg-cyber-amber h-full rounded-full transition-all duration-500 shadow-[0_0_10px_rgba(245,158,11,0.3)]"
                style={{ width: `${(intentProgress.current / intentProgress.total) * 100}%` }}
              />
            </div>
            {testingIntents && (
              <p className="text-[9px] text-white/30 mt-2 font-mono uppercase tracking-wider">
                Analyzing Intent: {intentProgress.currentModelName}
              </p>
            )}
          </div>
        )}
      </div>
      
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="relative">
             <div className="w-12 h-12 rounded-full border-t-2 border-cyber-purple animate-spin" />
             <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-2 h-2 bg-cyber-purple rounded-full animate-pulse" />
             </div>
          </div>
        </div>
      ) : models.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white/[0.01] rounded-2xl border border-dashed border-white/10">
          <span className="text-4xl mb-4 opacity-20">📡</span>
          <p className="text-white/40 font-bold uppercase tracking-widest text-xs">No active nodes detected</p>
          <p className="text-white/20 text-[10px] mt-2">Check your LLM provider synchronization settings.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 flex-1 overflow-y-auto pr-2 custom-scrollbar relative z-10">
          {filteredModels.map((model) => (
            <ModelCard
              key={model.id}
              model={model}
              isSelected={selectedModelId === model.id}
              testProgress={testProgress}
              calculateETA={calculateETA}
              onClick={() => onSelectModel(model.id)}
            />
          ))}
        </div>
      )}

      {/* Empty state for filtered models */}
      {filteredModels.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center py-20 bg-white/[0.01] rounded-2xl border border-dashed border-white/10">
          <span className="text-4xl mb-4 opacity-20">🚫</span>
          <div className="text-white/40 font-bold uppercase tracking-widest text-xs">
            Zero matches in {providerFilter === 'all' ? 'cluster' : providerFilter}
          </div>
          <div className="text-white/20 text-[10px] mt-2 uppercase tracking-wider">
            Protocol: Verify connectivity to {providerFilter} API
          </div>
        </div>
      )}
    </div>
  );
};

