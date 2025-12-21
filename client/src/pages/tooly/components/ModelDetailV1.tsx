import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Recommendations } from '../../../components/Recommendations';
import type {
  ModelProfile,
  TestProgress,
  ModelLoadingState,
  ExpandedSections,
  ProbeResults,
  ProbeTestResult,
  ReasoningProbeResults,
} from '../types';

interface ModelDetailV1Props {
  selectedModel: ModelProfile | null;
  testProgress: TestProgress;
  modelLoading: ModelLoadingState;
  expandedSections: ExpandedSections;
  toggleSection: (section: string) => void;
  defaultContextLength: number;
  editingContextLength: number | null;
  setEditingContextLength: (length: number | null) => void;
  mcpTools: string[];
  testingModel: string | null;
  probingModel: string | null;
  showSystemPromptEditor: boolean;
  setShowSystemPromptEditor: (show: boolean) => void;
  editingSystemPrompt: string;
  setEditingSystemPrompt: (prompt: string) => void;
  savingSystemPrompt: boolean;
  setSelectedModel: (profile: ModelProfile) => void;
  // API functions
  runModelTests: (modelId: string, provider?: string) => Promise<void>;
  runProbeTests: (modelId: string, provider?: string, runLatency?: boolean) => Promise<void>;
  fetchModelProfile: (modelId: string) => Promise<void>;
  saveSystemPrompt: (modelId: string, prompt: string) => Promise<void>;
  updateContextLength: (modelId: string, length: number) => Promise<void>;
  removeContextLength: (modelId: string) => Promise<void>;
  setTestProgress: React.Dispatch<React.SetStateAction<TestProgress>>;
  setSlowModelLatency: (latency: number) => void;
  setShowSlowModelPrompt: (show: boolean) => void;
  pendingTestRef: React.MutableRefObject<{ modelId: string; provider: string } | null>;
}

export const ModelDetailV1: React.FC<ModelDetailV1Props> = ({
  selectedModel,
  testProgress,
  modelLoading,
  expandedSections,
  toggleSection,
  defaultContextLength,
  editingContextLength,
  setEditingContextLength,
  mcpTools,
  testingModel,
  probingModel,
  showSystemPromptEditor,
  setShowSystemPromptEditor,
  editingSystemPrompt,
  setEditingSystemPrompt,
  savingSystemPrompt,
  setSelectedModel,
  runModelTests,
  runProbeTests,
  fetchModelProfile,
  saveSystemPrompt,
  updateContextLength,
  removeContextLength,
  setTestProgress,
  setSlowModelLatency,
  setShowSlowModelPrompt,
  pendingTestRef,
}) => {
  const navigate = useNavigate();

  if (!selectedModel) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        Select a model to view details
      </div>
    );
  }

  const handleRunAllTests = async () => {
    // Quick latency check first
    setTestProgress({
      modelId: selectedModel.modelId,
      latencyProgress: { current: 0, total: 1, currentTest: 'Quick latency check at 2K...', status: 'running' }
    });
    
    try {
      const quickLatencyRes = await fetch(`/api/tooly/models/${encodeURIComponent(selectedModel.modelId)}/quick-latency`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: selectedModel.provider })
      });
      
      if (quickLatencyRes.ok) {
        const { latency } = await quickLatencyRes.json();
        
        if (latency > 10000) {
          setSlowModelLatency(latency);
          pendingTestRef.current = { modelId: selectedModel.modelId, provider: selectedModel.provider || 'lmstudio' };
          setShowSlowModelPrompt(true);
          setTestProgress({});
          return;
        }
      }
    } catch (error) {
      console.error('Quick latency check failed:', error);
    }
    
    // Run probe tests
    setTestProgress(prev => ({
      ...prev,
      latencyProgress: undefined,
      probeProgress: { current: 0, total: 1, currentTest: 'Initializing...', score: 0, status: 'running' },
      startTime: Date.now(),
    }));
    await runProbeTests(selectedModel.modelId, selectedModel.provider, false);
    
    // Run tool tests
    setTestProgress(prev => ({
      ...prev,
      probeProgress: undefined,
      toolsProgress: { current: 0, total: 1, currentTest: 'Initializing...', score: 0, status: 'running' },
      startTime: prev.startTime || Date.now(),
    }));
    await runModelTests(selectedModel.modelId, selectedModel.provider);
    
    // Run latency profile
    setTestProgress(prev => ({
      ...prev,
      toolsProgress: undefined,
      latencyProgress: { current: 0, total: 1, currentTest: 'Running full latency profile...', status: 'running' }
    }));
    
    try {
      await fetch(`/api/tooly/models/${encodeURIComponent(selectedModel.modelId)}/latency-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: selectedModel.provider })
      });
      await fetchModelProfile(selectedModel.modelId);
    } catch (error) {
      console.error('Failed to run latency profile:', error);
    }
    
    setTestProgress({});
  };

  const updateAlias = async (nativeToolName: string, newMcpTool: string | null) => {
    try {
      const response = await fetch(`/api/tooly/models/${encodeURIComponent(selectedModel.modelId)}/alias`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nativeToolName, mcpTool: newMcpTool })
      });
      
      if (response.ok) {
        const profileResponse = await fetch(`/api/tooly/models/${encodeURIComponent(selectedModel.modelId)}`);
        if (profileResponse.ok) {
          const updatedProfile = await profileResponse.json();
          setSelectedModel(updatedProfile);
        }
      }
    } catch (error) {
      console.error('Failed to update alias:', error);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">{selectedModel.displayName}</h3>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>{selectedModel.provider}</span>
            {selectedModel.maxContextLength && (
              <>
                <span>•</span>
                <span>{(selectedModel.maxContextLength / 1024).toFixed(0)}K ctx</span>
              </>
            )}
            {selectedModel.testedAt && (
              <>
                <span>•</span>
                <span>Tested: {new Date(selectedModel.testedAt).toLocaleDateString()}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Primary Scores */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-4 bg-gradient-to-br from-purple-900/40 to-purple-800/20 border border-purple-500/30 rounded-xl text-center">
          <span className="text-purple-300 text-xs font-medium">Tool Score</span>
          <p className="text-3xl font-bold text-white mt-1">
            {testProgress.modelId === selectedModel.modelId && testProgress.toolsProgress?.status === 'running'
              ? testProgress.toolsProgress.score
              : selectedModel.score ?? 0}
          </p>
        </div>
        <div className="p-4 bg-gradient-to-br from-blue-900/40 to-blue-800/20 border border-blue-500/30 rounded-xl text-center">
          <span className="text-blue-300 text-xs font-medium">Probe Score</span>
          <p className="text-3xl font-bold text-white mt-1">
            {testProgress.modelId === selectedModel.modelId && testProgress.probeProgress?.status === 'running'
              ? testProgress.probeProgress.score
              : selectedModel.probeResults?.toolScore ?? 0}
          </p>
        </div>
        <div className="p-4 bg-gradient-to-br from-emerald-900/40 to-emerald-800/20 border border-emerald-500/30 rounded-xl text-center">
          <span className="text-emerald-300 text-xs font-medium">Reasoning</span>
          <p className="text-3xl font-bold text-white mt-1">
            {selectedModel.probeResults?.reasoningScore ?? 0}
          </p>
        </div>
      </div>

      {/* Badges */}
      {selectedModel.badges && selectedModel.badges.length > 0 && (
        <div className="flex flex-wrap gap-2 py-2">
          {selectedModel.badges.map(badge => (
            <span 
              key={badge.id}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#2d2d2d] hover:bg-[#3d3d3d] rounded-full text-xs text-gray-200 transition-colors"
            >
              <span>{badge.icon}</span>
              <span>{badge.name}</span>
            </span>
          ))}
        </div>
      )}

      {/* Skill Breakdown */}
      {selectedModel.scoreBreakdown && (
        <CollapsibleSection
          title="Skill Breakdown"
          isExpanded={expandedSections.breakdown}
          onToggle={() => toggleSection('breakdown')}
        >
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'RAG Search', icon: '🔍', score: selectedModel.scoreBreakdown.ragScore },
              { label: 'Architecture', icon: '🏗️', score: selectedModel.scoreBreakdown.architecturalScore },
              { label: 'Navigation', icon: '🧭', score: selectedModel.scoreBreakdown.navigationScore },
              { label: 'Proactive', icon: '💡', score: selectedModel.scoreBreakdown.proactiveScore },
              { label: 'Intent', icon: '🎯', score: selectedModel.scoreBreakdown.intentScore },
              { label: 'Bug Detection', icon: '🐛', score: selectedModel.scoreBreakdown.bugDetectionScore },
              { label: 'Reasoning', icon: '🧠', score: selectedModel.scoreBreakdown.reasoningScore },
              { label: 'Overall', icon: '⭐', score: selectedModel.scoreBreakdown.overallScore ?? selectedModel.score },
            ].map(({ label, icon, score }) => (
              <div key={label} className="flex items-center justify-between p-2 bg-[#252525] rounded">
                <span className="text-xs text-gray-400">{icon} {label}</span>
                <span className={`text-sm font-semibold ${
                  (score ?? 0) >= 80 ? 'text-green-400' : 
                  (score ?? 0) >= 50 ? 'text-yellow-400' : 
                  (score ?? 0) > 0 ? 'text-red-400' : 'text-gray-500'
                }`}>
                  {score ?? '—'}%
                </span>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Model Info */}
      {selectedModel.modelInfo && (
        <CollapsibleSection
          title="Model Information"
          isExpanded={expandedSections.info}
          onToggle={() => toggleSection('info')}
        >
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2 text-xs">
              {selectedModel.modelInfo.author && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">Author</span>
                  <span className="text-gray-200">{selectedModel.modelInfo.author}</span>
                </div>
              )}
              {selectedModel.modelInfo.parameters && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">Size</span>
                  <span className="text-gray-200">{selectedModel.modelInfo.parameters}</span>
                </div>
              )}
              {selectedModel.modelInfo.architecture && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">Architecture</span>
                  <span className="text-gray-200">{selectedModel.modelInfo.architecture}</span>
                </div>
              )}
              {selectedModel.modelInfo.license && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">License</span>
                  <span className="text-gray-200">{selectedModel.modelInfo.license}</span>
                </div>
              )}
            </div>
            {selectedModel.modelInfo.description && (
              <p className="text-gray-400 text-xs mt-2">
                {selectedModel.modelInfo.description}
              </p>
            )}
          </div>
        </CollapsibleSection>
      )}

      {/* Recommendations */}
      {selectedModel.recommendations && selectedModel.recommendations.length > 0 && (
        <CollapsibleSection
          title="Best For"
          isExpanded={expandedSections.recommendations}
          onToggle={() => toggleSection('recommendations')}
        >
          <Recommendations 
            recommendations={selectedModel.recommendations.slice(0, 4)} 
            onAlternativeClick={(id) => navigate(`/tooly/model/${encodeURIComponent(id)}`)}
          />
        </CollapsibleSection>
      )}

      {/* Run All Tests Button */}
      <button
        onClick={handleRunAllTests}
        disabled={probingModel === selectedModel.modelId || testingModel === selectedModel.modelId}
        className="w-full py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
      >
        {probingModel === selectedModel.modelId || testingModel === selectedModel.modelId 
          ? '⏳ Running Tests...' 
          : '🚀 Run All Tests'}
      </button>

      {/* Model Loading Indicator */}
      {modelLoading.modelId === selectedModel.modelId && (modelLoading.status === 'loading' || modelLoading.status === 'unloading') && (
        <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="animate-spin h-5 w-5 border-2 border-yellow-500 border-t-transparent rounded-full" />
            <div>
              <span className="text-sm text-yellow-400">
                {modelLoading.status === 'loading' ? '📥 Loading Model...' : '📤 Unloading Model...'}
              </span>
              <p className="text-xs text-gray-500">{modelLoading.message}</p>
            </div>
          </div>
        </div>
      )}

      {/* Progress Bars */}
      {testProgress.modelId === selectedModel.modelId && testProgress.probeProgress?.status === 'running' && (
        <ProgressBar 
          title="🔬 Probe Test Running" 
          current={testProgress.probeProgress.current}
          total={testProgress.probeProgress.total}
          currentTest={testProgress.probeProgress.currentTest}
          color="purple"
        />
      )}
      {testProgress.modelId === selectedModel.modelId && testProgress.toolsProgress?.status === 'running' && (
        <ProgressBar 
          title="🔧 Tool Test Running" 
          current={testProgress.toolsProgress.current}
          total={testProgress.toolsProgress.total}
          currentTest={testProgress.toolsProgress.currentTest}
          color="blue"
        />
      )}
      {testProgress.modelId === selectedModel.modelId && testProgress.latencyProgress?.status === 'running' && (
        <ProgressBar 
          title="⏱️ Latency Test Running" 
          current={testProgress.latencyProgress.current}
          total={testProgress.latencyProgress.total}
          currentTest={testProgress.latencyProgress.currentTest}
          color="green"
        />
      )}

      {/* Probe Results */}
      {selectedModel.probeResults && (
        <CollapsibleSection
          title="Probe Test Results"
          isExpanded={expandedSections.probes}
          onToggle={() => toggleSection('probes')}
          rightContent={
            <span className="text-xs text-gray-500">
              Tool: <span className="text-white">{selectedModel.probeResults?.toolScore ?? '-'}%</span>
              {' / '}
              Rsn: <span className="text-white">{selectedModel.probeResults?.reasoningScore ?? '-'}%</span>
            </span>
          }
        >
          <ProbeResultsContent probeResults={selectedModel.probeResults} />
        </CollapsibleSection>
      )}

      {/* Context Latency */}
      {selectedModel.contextLatency && (
        <CollapsibleSection
          title="Context Latency"
          isExpanded={expandedSections.latency}
          onToggle={() => toggleSection('latency')}
          rightContent={
            selectedModel.contextLatency.speedRating && (
              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                selectedModel.contextLatency.speedRating === 'excellent' ? 'bg-green-500/20 text-green-400' :
                selectedModel.contextLatency.speedRating === 'good' ? 'bg-blue-500/20 text-blue-400' :
                selectedModel.contextLatency.speedRating === 'acceptable' ? 'bg-yellow-500/20 text-yellow-400' :
                selectedModel.contextLatency.speedRating === 'slow' ? 'bg-orange-500/20 text-orange-400' :
                'bg-red-500/20 text-red-400'
              }`}>
                {selectedModel.contextLatency.speedRating === 'excellent' ? '🚀' :
                 selectedModel.contextLatency.speedRating === 'good' ? '✅' :
                 selectedModel.contextLatency.speedRating === 'acceptable' ? '⚡' :
                 selectedModel.contextLatency.speedRating === 'slow' ? '🐢' : '⚠️'}
              </span>
            )
          }
        >
          <LatencyContent contextLatency={selectedModel.contextLatency} />
        </CollapsibleSection>
      )}

      {/* Advanced Settings */}
      <CollapsibleSection
        title="Advanced Settings"
        isExpanded={expandedSections.tools}
        onToggle={() => toggleSection('tools')}
        rightContent={
          <span className="text-xs text-gray-500">
            {selectedModel.enabledTools?.length || 0} tools
          </span>
        }
      >
        <AdvancedSettingsContent
          selectedModel={selectedModel}
          defaultContextLength={defaultContextLength}
          editingContextLength={editingContextLength}
          setEditingContextLength={setEditingContextLength}
          mcpTools={mcpTools}
          testingModel={testingModel}
          updateContextLength={updateContextLength}
          removeContextLength={removeContextLength}
          updateAlias={updateAlias}
          fetchModelProfile={fetchModelProfile}
          runModelTests={runModelTests}
          setTestProgress={setTestProgress}
        />
      </CollapsibleSection>

      {/* Quick Actions */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => {
            setTestProgress({
              modelId: selectedModel.modelId,
              probeProgress: { current: 0, total: 1, currentTest: 'Initializing...', score: 0, status: 'running' },
              startTime: Date.now(),
            });
            runProbeTests(selectedModel.modelId, selectedModel.provider, true);
          }}
          disabled={probingModel === selectedModel.modelId}
          className="flex-1 py-2 px-3 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 disabled:opacity-50 text-sm"
        >
          {probingModel === selectedModel.modelId ? 'Probing...' : '🧪 Probes'}
        </button>
        <button
          onClick={() => {
            setTestProgress({
              modelId: selectedModel.modelId,
              toolsProgress: { current: 0, total: 1, currentTest: 'Initializing...', score: 0, status: 'running' },
              startTime: Date.now(),
            });
            runModelTests(selectedModel.modelId, selectedModel.provider);
          }}
          disabled={testingModel === selectedModel.modelId}
          className="flex-1 py-2 px-3 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 disabled:opacity-50 text-sm"
        >
          {testingModel === selectedModel.modelId ? 'Testing...' : '🔧 Tools'}
        </button>
        <button
          onClick={async () => {
            setTestProgress({
              modelId: selectedModel.modelId,
              latencyProgress: { current: 0, total: 1, currentTest: 'Initializing...', status: 'running' }
            });
            try {
              await fetch(`/api/tooly/models/${encodeURIComponent(selectedModel.modelId)}/latency-profile`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider: selectedModel.provider })
              });
              await fetchModelProfile(selectedModel.modelId);
            } catch (error) {
              console.error('Failed to run latency profile:', error);
            }
            setTestProgress({});
          }}
          className="flex-1 py-2 px-3 bg-yellow-500/20 text-yellow-400 rounded-lg hover:bg-yellow-500/30 text-sm"
        >
          ⏱️ Latency
        </button>
      </div>

      {/* System Prompt Editor */}
      <div className="pt-3 border-t border-[#3d3d3d]">
        <button
          onClick={() => setShowSystemPromptEditor(!showSystemPromptEditor)}
          className="text-sm text-gray-400 hover:text-white flex items-center gap-2"
        >
          <span>{showSystemPromptEditor ? '▼' : '▶'}</span>
          <span>Custom System Prompt</span>
          {selectedModel.systemPrompt && <span className="text-xs text-purple-400">(customized)</span>}
        </button>
        
        {showSystemPromptEditor && (
          <div className="mt-3 space-y-2">
            <textarea
              value={editingSystemPrompt}
              onChange={(e) => setEditingSystemPrompt(e.target.value)}
              placeholder="Enter custom system prompt for this model..."
              className="w-full h-32 bg-[#0d0d0d] border border-[#3d3d3d] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none resize-none"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setEditingSystemPrompt('');
                  saveSystemPrompt(selectedModel.modelId, '');
                }}
                className="px-3 py-1 text-xs text-gray-400 hover:text-white"
              >
                Clear
              </button>
              <button
                onClick={() => saveSystemPrompt(selectedModel.modelId, editingSystemPrompt)}
                disabled={savingSystemPrompt}
                className="px-3 py-1 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded disabled:opacity-50"
              >
                {savingSystemPrompt ? 'Saving...' : 'Save Prompt'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Helper components
interface CollapsibleSectionProps {
  title: string;
  isExpanded: boolean;
  onToggle: () => void;
  rightContent?: React.ReactNode;
  children: React.ReactNode;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  isExpanded,
  onToggle,
  rightContent,
  children,
}) => (
  <div className="border border-[#3d3d3d] rounded-lg overflow-hidden">
    <button 
      onClick={onToggle}
      className="w-full flex items-center justify-between p-3 bg-[#252525] hover:bg-[#2d2d2d] transition-colors"
    >
      <span className="text-sm font-medium text-gray-300">{title}</span>
      <div className="flex items-center gap-3">
        {rightContent}
        <span className="text-gray-500">{isExpanded ? '−' : '+'}</span>
      </div>
    </button>
    {isExpanded && (
      <div className="p-3 bg-[#1a1a1a]">
        {children}
      </div>
    )}
  </div>
);

interface ProgressBarProps {
  title: string;
  current: number;
  total: number;
  currentTest: string;
  color: 'purple' | 'blue' | 'green';
}

const ProgressBar: React.FC<ProgressBarProps> = ({ title, current, total, currentTest, color }) => {
  const colorClasses = {
    purple: { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-400', bar: 'bg-purple-500' },
    blue: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400', bar: 'bg-blue-500' },
    green: { bg: 'bg-green-500/10', border: 'border-green-500/30', text: 'text-green-400', bar: 'bg-green-500' },
  };
  const c = colorClasses[color];

  return (
    <div className={`p-3 ${c.bg} border ${c.border} rounded-lg`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-sm ${c.text}`}>{title}</span>
        <span className="text-xs text-gray-400">{current}/{total}</span>
      </div>
      <div className="w-full bg-[#1a1a1a] rounded-full h-2 mb-2">
        <div 
          className={`${c.bar} h-2 rounded-full transition-all duration-300`}
          style={{ width: `${total > 0 ? (current / total) * 100 : 0}%` }}
        />
      </div>
      <p className="text-xs text-gray-500">{currentTest}</p>
    </div>
  );
};

const ProbeResultsContent: React.FC<{ probeResults: ProbeResults }> = ({ probeResults }) => (
  <div className="space-y-3">
    {/* Core Tool Behavior */}
    <div>
      <p className="text-xs text-gray-500 mb-2">Tool Behavior - Core</p>
      <div className="grid grid-cols-2 gap-2">
        {[
          { name: 'Emit', key: 'emitTest', icon: '📤' },
          { name: 'Schema', key: 'schemaTest', icon: '📋' },
          { name: 'Selection', key: 'selectionTest', icon: '🎯' },
          { name: 'Suppression', key: 'suppressionTest', icon: '🛑' }
        ].map(({ name, key, icon }) => {
          const result = probeResults[key as keyof ProbeResults] as ProbeTestResult | undefined;
          return (
            <div 
              key={key} 
              className={`p-2 rounded border ${result?.passed ? 'border-green-500/30 bg-green-500/10' : 'border-red-500/30 bg-red-500/10'}`}
              title={result?.details}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-white">{icon} {name}</span>
                <span className={`text-xs font-medium ${result?.passed ? 'text-green-400' : 'text-red-400'}`}>
                  {result?.score ?? 0}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>

    {/* Reasoning */}
    {probeResults.reasoningProbes && (
      <div>
        <p className="text-xs text-gray-500 mb-2">Reasoning</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { name: 'Intent', key: 'intentExtraction', icon: '🎯' },
            { name: 'Planning', key: 'multiStepPlanning', icon: '📋' },
            { name: 'Conditional', key: 'conditionalReasoning', icon: '🔀' },
            { name: 'Context', key: 'contextContinuity', icon: '🔗' },
            { name: 'Logic', key: 'logicalConsistency', icon: '🧩' },
            { name: 'Explain', key: 'explanation', icon: '💬' },
            { name: 'Edge Cases', key: 'edgeCaseHandling', icon: '⚠️' }
          ].map(({ name, key, icon }) => {
            const result = probeResults.reasoningProbes?.[key as keyof ReasoningProbeResults];
            return (
              <div 
                key={key} 
                className={`p-2 rounded border ${result?.passed ? 'border-green-500/30 bg-green-500/10' : 'border-red-500/30 bg-red-500/10'}`}
                title={result?.details}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white">{icon} {name}</span>
                  <span className={`text-xs font-medium ${result?.passed ? 'text-green-400' : 'text-red-400'}`}>
                    {result?.score ?? 0}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    )}
  </div>
);

const LatencyContent: React.FC<{ contextLatency: ModelProfile['contextLatency'] }> = ({ contextLatency }) => {
  if (!contextLatency) return null;
  
  return (
    <div className="space-y-2">
      {contextLatency.isInteractiveSpeed === false && (
        <div className="mb-2 p-2 bg-orange-500/10 border border-orange-500/30 rounded text-xs text-orange-400">
          ⚠️ This model may be too slow for interactive IDE use.
        </div>
      )}
      
      {contextLatency.minLatency !== undefined && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">Fastest Response</span>
          <span className={`font-medium ${
            contextLatency.minLatency < 500 ? 'text-green-400' :
            contextLatency.minLatency < 2000 ? 'text-blue-400' :
            contextLatency.minLatency < 5000 ? 'text-yellow-400' : 'text-orange-400'
          }`}>
            {contextLatency.minLatency < 1000 
              ? `${contextLatency.minLatency}ms`
              : `${(contextLatency.minLatency / 1000).toFixed(1)}s`}
          </span>
        </div>
      )}
      
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-400">Max Usable Context</span>
        <span className="text-white font-medium">
          {(contextLatency.maxUsableContext / 1024).toFixed(0)}K
        </span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-400">Recommended</span>
        <span className="text-green-400 font-medium">
          {(contextLatency.recommendedContext / 1024).toFixed(0)}K
        </span>
      </div>
      
      <div className="mt-2">
        <span className="text-xs text-gray-500">Latency by context size:</span>
        <div className="flex flex-wrap gap-1 mt-1">
          {Object.entries(contextLatency.latencies).map(([size, latency]) => (
            <span 
              key={size} 
              className={`px-2 py-0.5 text-xs rounded ${
                latency < 500 ? 'bg-green-500/20 text-green-400' :
                latency < 2000 ? 'bg-blue-500/20 text-blue-400' :
                latency < 5000 ? 'bg-yellow-500/20 text-yellow-400' :
                latency < 10000 ? 'bg-orange-500/20 text-orange-400' :
                'bg-red-500/20 text-red-400'
              }`}
            >
              {(parseInt(size) / 1024).toFixed(0)}K: {latency < 1000 ? `${latency}ms` : `${(latency / 1000).toFixed(1)}s`}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

interface AdvancedSettingsContentProps {
  selectedModel: ModelProfile;
  defaultContextLength: number;
  editingContextLength: number | null;
  setEditingContextLength: (length: number | null) => void;
  mcpTools: string[];
  testingModel: string | null;
  updateContextLength: (modelId: string, length: number) => Promise<void>;
  removeContextLength: (modelId: string) => Promise<void>;
  updateAlias: (nativeToolName: string, mcpTool: string | null) => Promise<void>;
  fetchModelProfile: (modelId: string) => Promise<void>;
  runModelTests: (modelId: string, provider?: string) => Promise<void>;
  setTestProgress: React.Dispatch<React.SetStateAction<TestProgress>>;
}

const AdvancedSettingsContent: React.FC<AdvancedSettingsContentProps> = ({
  selectedModel,
  defaultContextLength,
  editingContextLength,
  setEditingContextLength,
  mcpTools,
  testingModel,
  updateContextLength,
  removeContextLength,
  updateAlias,
  fetchModelProfile,
  runModelTests,
  setTestProgress,
}) => {
  const discoveredTools = selectedModel.discoveredNativeTools || [];
  const unmappedTools = selectedModel.unmappedNativeTools || [];
  const mappedTools: Record<string, string> = {};
  Object.entries(selectedModel.capabilities).forEach(([tool, cap]) => {
    if (cap.nativeAliases && cap.nativeAliases.length > 0) {
      cap.nativeAliases.forEach(alias => {
        mappedTools[alias] = tool;
      });
    }
  });

  return (
    <div className="space-y-4">
      {/* Context Length */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-400">Context Length</span>
          {selectedModel.contextLength && (
            <button
              onClick={() => removeContextLength(selectedModel.modelId)}
              className="text-xs text-red-400 hover:text-red-300"
            >
              Reset
            </button>
          )}
        </div>
        <select
          value={editingContextLength ?? selectedModel.contextLength ?? defaultContextLength}
          onChange={(e) => {
            const newValue = parseInt(e.target.value);
            setEditingContextLength(newValue);
            updateContextLength(selectedModel.modelId, newValue);
          }}
          className="w-full bg-[#252525] border border-[#3d3d3d] rounded px-2 py-1.5 text-white text-sm focus:border-purple-500 focus:outline-none"
        >
          {(() => {
            const maxCtx = selectedModel.maxContextLength || 1048576;
            const allSizes = [
              { value: 2048, label: '2K' },
              { value: 4096, label: '4K' },
              { value: 8192, label: '8K' },
              { value: 16384, label: '16K' },
              { value: 32768, label: '32K' },
              { value: 65536, label: '64K' },
              { value: 131072, label: '128K' },
              { value: 1048576, label: '1M' },
            ];
            return allSizes
              .filter(size => size.value <= maxCtx)
              .map(size => (
                <option key={size.value} value={size.value}>{size.label}</option>
              ));
          })()}
        </select>
      </div>

      {/* Native Tool Mappings */}
      <div>
        <p className="text-xs text-gray-400 mb-2">Native Tool Mappings</p>
        {discoveredTools.length === 0 && Object.keys(mappedTools).length === 0 ? (
          <p className="text-xs text-gray-500 italic">
            No native tool calls detected. Run tests to discover supported tools.
          </p>
        ) : (
          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-[#4d4d4d] scrollbar-track-transparent">
            {(discoveredTools.length > 0 ? discoveredTools : Object.keys(mappedTools)).map((tool) => {
              const mapsTo = mappedTools[tool];
              const isUnmapped = unmappedTools.includes(tool) || !mapsTo;
              
              return (
                <div
                  key={tool}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border ${
                    isUnmapped 
                      ? 'bg-orange-500/10 border-orange-500/20' 
                      : 'bg-purple-500/10 border-purple-500/20'
                  }`}
                >
                  <span className={`text-xs font-medium min-w-[120px] ${isUnmapped ? 'text-orange-300' : 'text-purple-300'}`}>
                    {tool}
                  </span>
                  <span className="text-[10px] text-gray-500">→</span>
                  <select
                    value={mapsTo || ''}
                    onChange={(e) => updateAlias(tool, e.target.value || null)}
                    className="flex-1 text-xs bg-[#252525] border border-gray-700 rounded px-1.5 py-0.5 text-gray-300 focus:outline-none focus:border-purple-500"
                  >
                    <option value="">⚠️ Unmapped</option>
                    {mcpTools.map((mcpTool) => (
                      <option key={mcpTool} value={mcpTool}>{mcpTool}</option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Tool Capabilities */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-400">
            Tool Capabilities ({selectedModel.enabledTools?.length || 0}/{Object.keys(selectedModel.capabilities).length})
          </span>
          <button
            onClick={() => {
              setTestProgress({
                modelId: selectedModel.modelId,
                toolsProgress: { current: 0, total: 1, currentTest: 'Initializing...', score: 0, status: 'running' },
                startTime: Date.now(),
              });
              runModelTests(selectedModel.modelId, selectedModel.provider);
            }}
            disabled={testingModel === selectedModel.modelId}
            className="px-2 py-1 text-xs bg-purple-500/20 text-purple-400 rounded hover:bg-purple-500/30 transition-colors disabled:opacity-50"
          >
            {testingModel === selectedModel.modelId ? 'Testing...' : 'Run Tests'}
          </button>
        </div>
        
        <div className="space-y-1 max-h-56 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-[#4d4d4d] scrollbar-track-transparent">
          {Object.entries(selectedModel.capabilities)
            .sort(([, a], [, b]) => (b.score || 0) - (a.score || 0))
            .map(([tool, cap]) => {
              const isEnabled = selectedModel.enabledTools?.includes(tool) || false;
              const score = cap.score || 0;
              
              return (
                <div 
                  key={tool} 
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors ${
                    isEnabled 
                      ? 'bg-[#1a1a1a] border border-purple-500/30' 
                      : 'bg-[#151515] border border-transparent'
                  }`}
                >
                  <span className={`flex-1 text-xs font-medium ${isEnabled ? 'text-white' : 'text-gray-500'}`}>
                    {tool}
                  </span>
                  <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${
                    score >= 70 ? 'bg-green-500/20 text-green-400' :
                    score >= 40 ? 'bg-yellow-500/20 text-yellow-400' :
                    score > 0 ? 'bg-red-500/20 text-red-400' :
                    'bg-gray-500/20 text-gray-500'
                  }`}>
                    {score > 0 ? `${score}%` : '--'}
                  </span>
                </div>
              );
            })}
        </div>
      </div>

      {/* IDE Aliases */}
      <div>
        <p className="text-xs text-gray-400 mb-2">IDE Aliases</p>
        <div className="flex gap-2">
          {['cursor', 'continue'].map((ide) => (
            <button 
              key={ide}
              onClick={() => navigator.clipboard.writeText(`${selectedModel.modelId}-${ide}`)}
              className="flex-1 px-2 py-1.5 bg-[#252525] border border-[#3d3d3d] rounded text-xs text-gray-300 hover:bg-[#3d3d3d] transition-colors"
            >
              {ide.charAt(0).toUpperCase() + ide.slice(1)}: Copy
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

