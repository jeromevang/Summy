import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TestConfigPanel, type TestConfig } from './components/TestConfigPanel';
import {
  HardwarePanel,
  QualifyingGatePanel,
  DualModelFlowViz,
  ObservabilityPanel,
  ToolCapabilityGrid
} from './AgenticReadiness/components';
import {
  useReadiness,
  useHardware,
  useModels
} from './AgenticReadiness/hooks';
import { useTeam } from '../../hooks/useTeam';
import { renderProgressBar } from './AgenticReadiness/utils/renderUtils';
import { CATEGORIES, THRESHOLD } from './AgenticReadiness/constants';
import { Tab, CategoryScore } from './AgenticReadiness/types';

// Tooltip helper
const Tooltip: React.FC<{ children: React.ReactNode; content: string }> = ({ children, content }) => {
  const [show, setShow] = useState(false);
  return (
    <div className="relative inline-block">
      <div onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>{children}</div>
      {show && (
        <div className="absolute z-50 px-2 py-1 text-xs text-white bg-gray-900 rounded shadow-lg bottom-full left-1/2 transform -translate-x-1/2 mb-1 whitespace-nowrap">
          {content}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
        </div>
      )}
    </div>
  );
};

const AgenticReadiness: React.FC = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('single');
  const [selectedProvider, setSelectedProvider] = useState<string>('lmstudio');
  const [runCount, setRunCount] = useState(1);
  const [showConfigPanel, setShowConfigPanel] = useState(false);
  const [testConfig, setTestConfig] = useState<TestConfig | undefined>(undefined);
  const [showObservability, setShowObservability] = useState(false);

  const { hardware, isLoadingHardware, detectHardware } = useHardware();
  const { models, isLoadingModels, selectedModelId, setSelectedModelId, executorModelId, setExecutorModelId, fetchModels } = useModels(selectedProvider);
  const { team, loading: teamLoading } = useTeam();
  const {
    isLoading, error, assessmentResult, progress, batchResult, batchProgress,
    combinationCheck, runAssessment, checkCombination, runBatchAssessment, loadModelAssessmentData
  } = useReadiness(selectedProvider);

  // Sync team config to local state if available
  useEffect(() => {
    if (team) {
      if (team.mainModelId) setSelectedModelId(team.mainModelId);
      if (team.executorEnabled && team.executorModelId) {
        setExecutorModelId(team.executorModelId);
        setTab('dual'); // Auto-switch to dual mode if team has executor
      }
    }
  }, [team, setSelectedModelId, setExecutorModelId]);

  useEffect(() => {
    if (selectedModelId) loadModelAssessmentData(selectedModelId);
  }, [selectedModelId]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        <button onClick={() => navigate('/tooly')} className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition-colors">← Back</button>
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">Agentic Readiness</h1>
            <p className="text-gray-400 mt-2">Test and certify local models for agentic coding tasks</p>
          </div>
          {team && (
            <div className="bg-purple-500/10 border border-purple-500/30 px-4 py-2 rounded-lg text-sm text-purple-300">
              👥 Using Team: <strong>{team.mainModelId}</strong> {team.executorEnabled ? `+ ${team.executorModelId}` : ''}
            </div>
          )}
        </div>

        <div className="flex gap-2 mb-6">
          {['single', 'dual', 'batch', 'setup'].map(id => (
            <button key={id} onClick={() => setTab(id as Tab)} className={`px-4 py-2 rounded-lg font-medium transition-all \${tab === id ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'bg-gray-800 text-gray-400'}`}>
              {id === 'single' ? '🤖 Single' : id === 'dual' ? '🔗 Dual' : id === 'batch' ? '📊 All' : '💻 Hardware'}
            </button>
          ))}
        </div>

        {error && <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-4 mb-6 text-red-400">{error}</div>}

        {tab === 'setup' && (
          <div className="space-y-6">
            <HardwarePanel hardware={hardware} isLoading={isLoadingHardware} onRefresh={detectHardware} />
            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">🤖 Available Models</h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {models.map(m => (
                  <div key={m.id} className="flex items-center gap-4 p-3 bg-gray-700/30 rounded-lg hover:bg-gray-700/50">
                    <span className="text-green-400">✓</span>
                    <div className="flex-1"><div className="text-white">{m.displayName || m.id}</div></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'single' && (
          <div className="space-y-6">
            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">🔧 Provider</h3>
              <select value={selectedProvider} onChange={e => setSelectedProvider(e.target.value)} className="bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:outline-none">
                <option value="lmstudio">💻 LM Studio</option>
                <option value="openrouter">🚀 OpenRouter</option>
              </select>
            </div>

            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
              <label className="block text-sm text-gray-400 mb-2">Select Model</label>
              <select value={selectedModelId} onChange={e => setSelectedModelId(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none" disabled={isLoading}>
                {models.map(m => <option key={m.id} value={m.id}>{m.displayName || m.id}</option>)}
              </select>
            </div>

            {progress && (
              <div className="bg-gray-800/50 border border-cyan-500/30 rounded-xl p-6">
                <div className="flex justify-between mb-4">
                  <span className="text-cyan-400 font-medium">{progress.status === 'completed' ? '✅ Complete' : '🔬 Testing'}</span>
                  <span className="text-white font-bold">{progress.current}/{progress.total}</span>
                </div>
                <QualifyingGatePanel results={assessmentResult?.testResults || []} phase={progress.phase} disqualifiedAt={assessmentResult?.disqualifiedAt} />
                <div className="h-3 bg-gray-700 rounded-full overflow-hidden mb-2">
                  <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500" style={{ width: `\${(progress.current / progress.total) * 100}%` }} />
                </div>
                <div className="flex justify-between text-sm"><span className="text-gray-400">{progress.currentTest}</span><span className="text-cyan-400">{progress.score}%</span></div>
              </div>
            )}

            {assessmentResult && (
              <>
                <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
                  <div className="flex justify-between mb-6">
                    <div><h2 className="text-xl font-bold">Results</h2><p className="text-gray-400 text-sm">{(assessmentResult.duration / 1000).toFixed(1)}s</p></div>
                    <div className="text-right">
                      <div className={`text-4xl font-bold \${assessmentResult.passed ? 'text-green-400' : 'text-red-400'}`}>{assessmentResult.overallScore}%</div>
                      <div className="text-sm">{assessmentResult.passed ? '✓ CERTIFIED' : 'FAILED'}</div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {CATEGORIES.map(cat => (
                      <div key={cat.key} className="flex items-center gap-4">
                        <span className="text-xl w-8">{cat.icon}</span>
                        <div className="flex-1">{renderProgressBar(assessmentResult.categoryScores[cat.key as keyof CategoryScore])}</div>
                        <span className="font-mono font-bold w-12 text-right">{assessmentResult.categoryScores[cat.key as keyof CategoryScore]}%</span>
                      </div>
                    ))}
                  </div>
                </div>
                <ToolCapabilityGrid results={assessmentResult.testResults} />
              </>
            )}

            <div className="flex gap-3">
              <button onClick={() => runAssessment(selectedModelId, executorModelId, 'single', runCount)} disabled={isLoading} className="px-6 py-3 bg-cyan-500 text-black font-bold rounded-lg disabled:opacity-50">Run Assessment</button>
              <button onClick={() => setShowConfigPanel(true)} className="px-4 py-3 bg-gray-800 border border-gray-600 text-gray-300 rounded-lg">⚙️ Config</button>
            </div>
          </div>
        )}

        {tab === 'dual' && (
          <div className="space-y-6">
            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
              <h3 className="text-lg font-semibold mb-4">🔗 Dual Model Setup</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">🧠 Main (Reasoning)</label>
                  <select value={selectedModelId} onChange={e => setSelectedModelId(e.target.value)} className="w-full bg-gray-700 border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none">
                    {models.map(m => <option key={m.id} value={m.id}>{m.displayName || m.id}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">⚡ Executor (Tools)</label>
                  <select value={executorModelId} onChange={e => setExecutorModelId(e.target.value)} className="w-full bg-gray-700 border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none">
                    <option value="">-- Select --</option>
                    {models.filter(m => m.id !== selectedModelId).map(m => <option key={m.id} value={m.id}>{m.displayName || m.id}</option>)}
                  </select>
                </div>
              </div>
              {selectedModelId && executorModelId && (
                <div className="mt-4 p-4 bg-gray-700/30 rounded-lg flex justify-between items-center">
                  <span className="text-gray-400 text-sm">Compatibility:</span>
                  <button onClick={() => checkCombination(selectedModelId, executorModelId, hardware, models)} disabled={isLoading} className="px-4 py-2 bg-blue-600 rounded-lg text-sm">Check Combo</button>
                </div>
              )}
              {combinationCheck && <div className={`mt-2 text-xs \${combinationCheck.overallOk ? 'text-green-400' : 'text-red-400'}`}>{combinationCheck.overallOk ? '✅ Ready!' : '❌ Issues found'}</div>}
            </div>
            {(progress?.mode === 'dual' || executorModelId) && <DualModelFlowViz progress={progress} mainModel={selectedModelId} executorModel={executorModelId} />}
            <button onClick={() => runAssessment(selectedModelId, executorModelId, 'dual', runCount)} disabled={isLoading || !executorModelId} className="px-6 py-3 bg-gradient-to-r from-purple-500 to-blue-500 text-white font-bold rounded-lg disabled:opacity-50">Test Dual Mode</button>
          </div>
        )}

        {tab === 'batch' && (
          <div className="space-y-6">
            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
              <h2 className="text-xl font-bold mb-4">Test All</h2>
              {batchProgress && batchProgress.status === 'running' && (
                <div className="mb-4">
                  <div className="flex justify-between text-sm mb-1"><span className="text-cyan-400">{batchProgress.currentModel}</span><span>{batchProgress.currentModelIndex}/{batchProgress.totalModels}</span></div>
                  <div className="h-2 bg-gray-700 rounded-full overflow-hidden"><div className="h-full bg-cyan-500" style={{ width: `\${(batchProgress.currentModelIndex / batchProgress.totalModels) * 100}%` }} /></div>
                </div>
              )}
              <button onClick={() => runBatchAssessment(runCount)} disabled={isLoading || !models.length} className="px-6 py-3 bg-cyan-500 text-black font-bold rounded-lg">Test All \${models.length} Models</button>
            </div>
            {batchResult && (
              <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
                <h2 className="text-xl font-bold mb-4">🏆 Leaderboard</h2>
                <div className="space-y-2">
                  {batchResult.leaderboard.map(entry => (
                    <div key={entry.modelId} className="flex items-center gap-4 p-3 bg-gray-700/30 rounded-lg hover:bg-gray-700/50 cursor-pointer" onClick={() => { setSelectedModelId(entry.modelId); setTab('single'); }}>
                      <span className="text-xl font-bold w-8">#\${entry.rank}</span>
                      <div className="flex-1"><div className="text-white font-medium">{entry.modelId}</div></div>
                      <span className="text-xl font-bold text-green-400">{entry.score}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <ObservabilityPanel isOpen={showObservability} onToggle={() => setShowObservability(!showObservability)} />
      <TestConfigPanel isOpen={showConfigPanel} onClose={() => setShowConfigPanel(false)} onSave={setTestConfig} initialConfig={testConfig} />
    </div>
  );
};

export default AgenticReadiness;