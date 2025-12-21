import React from 'react';
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
  const lmstudioModels = models.filter(m => m.provider === 'lmstudio');

  const handleTestAllModels = async () => {
    if (testingAllModels) {
      cancelTestAllRef.current = true;
      return;
    }
    
    if (lmstudioModels.length === 0) return;
    
    setTestingAllModels(true);
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
      setTestAllProgress(prev => prev ? {
        ...prev,
        current: i + 1,
        currentModelName: model.displayName
      } : null);
      
      // Quick latency check
      try {
        const quickLatencyRes = await fetch(`/api/tooly/models/${encodeURIComponent(model.id)}/quick-latency`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: model.provider })
        });
        
        if (quickLatencyRes.ok) {
          const { latency } = await quickLatencyRes.json();
          
          // Skip if too slow (> 10 seconds)
          if (latency > 10000) {
            setTestAllProgress(prev => prev ? {
              ...prev,
              skipped: [...prev.skipped, model.displayName]
            } : null);
            continue;
          }
        } else {
          setTestAllProgress(prev => prev ? {
            ...prev,
            skipped: [...prev.skipped, model.displayName]
          } : null);
          continue;
        }
      } catch {
        setTestAllProgress(prev => prev ? {
          ...prev,
          skipped: [...prev.skipped, model.displayName]
        } : null);
        continue;
      }
      
      if (cancelTestAllRef.current) break;
      
      // Run full tests
      try {
        await fetch(`/api/tooly/models/${encodeURIComponent(model.id)}/probe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: model.provider, runLatencyProfile: false })
        });
        
        if (cancelTestAllRef.current) break;
        
        await fetch(`/api/tooly/models/${encodeURIComponent(model.id)}/test`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: model.provider })
        });
        
        if (cancelTestAllRef.current) break;
        
        await fetch(`/api/tooly/models/${encodeURIComponent(model.id)}/latency-profile`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: model.provider })
        });
        
        setTestAllProgress(prev => prev ? {
          ...prev,
          completed: [...prev.completed, model.displayName]
        } : null);
      } catch (error) {
        console.error(`Failed to test ${model.id}:`, error);
        setTestAllProgress(prev => prev ? {
          ...prev,
          skipped: [...prev.skipped, model.displayName]
        } : null);
      }
    }
    
    await fetchModels();
    setTestingAllModels(false);
    setTimeout(() => setTestAllProgress(null), 5000);
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
        await fetch(`/api/tooly/probe/${encodeURIComponent(model.id)}`, {
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
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex flex-col gap-3 mb-4">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Available Models</h3>
          {/* Filters */}
          <div className="flex items-center gap-3">
            {/* Provider Filter */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Provider:</span>
              <select
                value={providerFilter}
                onChange={(e) => setProviderFilter(e.target.value as ProviderFilter)}
                className="bg-[#2d2d2d] border border-[#3d3d3d] rounded px-2 py-1 text-xs text-gray-300 focus:border-purple-500 focus:outline-none"
              >
                <option value="all">All</option>
                <option value="lmstudio" disabled={!availableProviders.lmstudio}>
                  LM Studio {availableProviders.lmstudio ? '' : '(offline)'}
                </option>
                <option value="openai" disabled={!availableProviders.openai}>
                  OpenAI {availableProviders.openai ? '' : '(no key)'}
                </option>
                <option value="azure" disabled={!availableProviders.azure}>
                  Azure {availableProviders.azure ? '' : '(not configured)'}
                </option>
              </select>
            </div>
            
            {/* Test Mode */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Mode:</span>
              <select
                value={testMode}
                onChange={(e) => setTestMode(e.target.value as TestMode)}
                className="bg-[#2d2d2d] border border-[#3d3d3d] rounded px-2 py-1 text-xs text-gray-300 focus:border-purple-500 focus:outline-none"
                title="Controls model loading/unloading during tests"
              >
                <option value="quick">Quick</option>
                <option value="keep_on_success">Keep</option>
                <option value="manual">Manual</option>
              </select>
            </div>
          </div>
        </div>
        {/* Action buttons row */}
        <div className="flex items-center gap-2">
          {/* Test All Models Button */}
          <button
            onClick={handleTestAllModels}
            disabled={lmstudioModels.length === 0}
            className={`px-3 py-1 text-xs rounded transition-colors ${
              testingAllModels 
                ? 'bg-red-600 hover:bg-red-700 text-white' 
                : 'bg-purple-600 hover:bg-purple-700 text-white'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {testingAllModels ? '⏹️ Stop' : '🧪 Test All'}
          </button>
          
          {/* Test Intents Button */}
          <button
            onClick={handleTestIntents}
            disabled={lmstudioModels.length === 0 || testingAllModels}
            className={`px-3 py-1 text-xs rounded transition-colors ${
              testingIntents 
                ? 'bg-red-600 hover:bg-red-700 text-white' 
                : 'bg-orange-600 hover:bg-orange-700 text-white'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {testingIntents ? '⏹️ Stop' : '🎯 Test Intents'}
          </button>
        </div>
      </div>
      
      {/* Test All Progress */}
      {testAllProgress && (
        <div className="mb-4 p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-purple-400">
              Testing All Models ({testAllProgress.current}/{testAllProgress.total})
            </span>
            <span className="text-xs text-gray-400">
              ✅ {testAllProgress.completed.length} | ⏭️ {testAllProgress.skipped.length} skipped
            </span>
          </div>
          <div className="w-full bg-[#1a1a1a] rounded-full h-2 mb-2">
            <div 
              className="bg-purple-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(testAllProgress.current / testAllProgress.total) * 100}%` }}
            />
          </div>
          {testAllProgress.currentModelName && testingAllModels && (
            <p className="text-xs text-gray-500">
              Testing: {testAllProgress.currentModelName}
            </p>
          )}
          {!testingAllModels && testAllProgress.skipped.length > 0 && (
            <p className="text-xs text-yellow-400 mt-1">
              Skipped (too slow): {testAllProgress.skipped.join(', ')}
            </p>
          )}
        </div>
      )}
      
      {/* Intent Test Progress */}
      {intentProgress && (
        <div className="mb-4 p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-orange-400">
              🎯 Testing Intents ({intentProgress.current}/{intentProgress.total})
            </span>
          </div>
          <div className="w-full bg-[#1a1a1a] rounded-full h-2 mb-2">
            <div 
              className="bg-orange-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(intentProgress.current / intentProgress.total) * 100}%` }}
            />
          </div>
          {testingIntents && (
            <p className="text-xs text-gray-500">
              Testing: {intentProgress.currentModelName}
            </p>
          )}
        </div>
      )}
      
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-500"></div>
        </div>
      ) : models.length === 0 ? (
        <p className="text-gray-500 text-center py-8">
          No models discovered. Check your LLM provider settings.
        </p>
      ) : (
        <div className="space-y-2 flex-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-[#3d3d3d] scrollbar-track-transparent">
          {models.map((model) => (
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
    </div>
  );
};

