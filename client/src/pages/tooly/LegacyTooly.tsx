import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// Hooks
import { useToolyState } from './hooks/useToolyState';
import { useToolyApi } from './hooks/useToolyApi';
import { useWebSocket } from './hooks/useWebSocket';

// Constants
import { extractCategoryFromTest, TOOL_CATEGORIES } from './constants';

// Components
import { ModelSelector } from './components/ModelSelector';
import { ModelDetailV1 } from './components/ModelDetailV1';
import { ActiveModelConfig } from './components/ActiveModelConfig';
import { SystemMetricsCharts } from './components/SystemMetricsCharts';
import { SlowModelModal } from './components/SlowModelModal';
import { TestsTab } from './components/TestsTab';
import { LogsTab } from './components/LogsTab';
import { ModelDetail } from '../../components/ModelDetail';

import type { TabId } from './types';

import type { ToolyState } from './hooks/useToolyState';

interface LegacyToolyProps {
    state: ToolyState;
    api: any;
}

export const LegacyTooly: React.FC<LegacyToolyProps> = ({ state, api }) => {
    const navigate = useNavigate();

    // Hooks and Effects are now lifted to index.tsx

    // Build testProgress for ModelDetailV2
    const testProgressForModel = (() => {
        const isThisModel = state.testProgress.modelId === state.selectedModel?.modelId;
        const probeP = isThisModel ? state.testProgress.probeProgress : undefined;
        const toolsP = isThisModel ? state.testProgress.toolsProgress : undefined;
        const latencyP = isThisModel ? state.testProgress.latencyProgress : undefined;

        if (!probeP && !toolsP && !latencyP) return undefined;

        const isRunning = probeP?.status === 'running' || toolsP?.status === 'running' || latencyP?.status === 'running';
        const current = (probeP?.current ?? 0) + (toolsP?.current ?? 0) + (latencyP?.current ?? 0);
        const total = (probeP?.total ?? 0) + (toolsP?.total ?? 0) + (latencyP?.total ?? 0);
        const percent = total > 0 ? Math.round((current / total) * 100) : 0;

        let currentCategory: string | undefined;
        let currentTest: string | undefined;
        let testType: 'probe' | 'tools' | 'latency' | undefined;

        if (probeP?.status === 'running') {
            currentCategory = extractCategoryFromTest(probeP.currentTest, 'probe');
            currentTest = probeP.currentTest;
            testType = 'probe';
        } else if (toolsP?.status === 'running') {
            currentCategory = extractCategoryFromTest(toolsP.currentTest, 'tools');
            currentTest = toolsP.currentTest;
            testType = 'tools';
        } else if (latencyP?.status === 'running') {
            currentCategory = 'Latency';
            currentTest = latencyP.currentTest;
            testType = 'latency';
        }

        const eta = state.calculateETA();

        return {
            isRunning,
            current,
            total,
            currentCategory,
            currentTest,
            percent,
            eta: eta ?? undefined,
            testType,
        };
    })();

    // Build toolCategories for ModelDetailV2
    const toolCategories = state.selectedModel ? (() => {
        const result: Record<string, { tools: Array<{ name: string; score: number; supported: boolean }> }> = {};

        for (const [catName, toolNames] of Object.entries(TOOL_CATEGORIES)) {
            const toolsInCategory = toolNames
                .filter(toolName => state.selectedModel!.capabilities[toolName])
                .map(toolName => ({
                    name: toolName,
                    score: state.selectedModel!.capabilities[toolName].score,
                    supported: state.selectedModel!.capabilities[toolName].supported,
                }));

            if (toolsInCategory.length > 0) {
                result[catName] = { tools: toolsInCategory };
            }
        }

        return result;
    })() : undefined;

    const handleContinueSlowModelTest = async () => {
        state.setShowSlowModelPrompt(false);
        if (!state.pendingTestRef.current) return;

        const { modelId, provider } = state.pendingTestRef.current;
        state.pendingTestRef.current = null;

        // Continue with tests
        state.setTestProgress(prev => ({
            ...prev,
            probeProgress: { current: 0, total: 1, currentTest: 'Initializing...', score: 0, status: 'running' },
            startTime: Date.now(),
        }));
        await api.runProbeTests(modelId, provider, false);

        state.setTestProgress(prev => ({
            ...prev,
            probeProgress: undefined,
            toolsProgress: { current: 0, total: 1, currentTest: 'Initializing...', score: 0, status: 'running' },
        }));
        await api.runModelTests(modelId, provider);

        state.setTestProgress(prev => ({
            ...prev,
            toolsProgress: undefined,
            latencyProgress: { current: 0, total: 1, currentTest: 'Running full latency profile...', status: 'running' }
        }));

        try {
            await fetch(`/api/tooly/models/${encodeURIComponent(modelId)}/latency-profile`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider })
            });
            await api.fetchModelProfile(modelId);
        } catch (error) {
            console.error('Failed to run latency profile:', error);
        }

        state.setTestProgress({});
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-white">Tooly - Model Hub (Legacy)</h1>
                    <p className="text-gray-500">Test and configure LLM models for tool use</p>
                </div>
                <div className="flex items-center gap-3">
                    {/* Version Toggle */}
                    <div className="flex items-center gap-2 bg-[#1a1a1a] rounded-lg p-1 border border-[#2d2d2d]">
                        <button
                            onClick={() => state.setDetailPaneVersion('v1')}
                            className={`px-3 py-1 text-xs rounded transition-colors ${state.detailPaneVersion === 'v1'
                                ? 'bg-purple-600 text-white'
                                : 'text-gray-400 hover:text-white'
                                }`}
                        >
                            Classic
                        </button>
                        <button
                            onClick={() => state.setDetailPaneVersion('v2')}
                            className={`px-3 py-1 text-xs rounded transition-colors ${state.detailPaneVersion === 'v2'
                                ? 'bg-purple-600 text-white'
                                : 'text-gray-400 hover:text-white'
                                }`}
                        >
                            Modern
                        </button>
                    </div>
                </div>
            </div>

            {/* Active Model Configuration */}
            <ActiveModelConfig
                models={state.models}
                enableDualModel={state.enableDualModel}
                setEnableDualModel={state.setEnableDualModel}
                mainModelId={state.mainModelId}
                setMainModelId={state.setMainModelId}
                executorModelId={state.executorModelId}
                setExecutorModelId={state.setExecutorModelId}
                savingDualModel={state.savingDualModel}
                modelValidationError={state.modelValidationError}
                setModelValidationError={state.setModelValidationError}
                saveDualModelConfig={api.saveDualModelConfig}
            />

            {/* System Metrics */}
            <SystemMetricsCharts systemMetrics={state.systemMetrics} />

            {/* Slow Model Modal */}
            <SlowModelModal
                showSlowModelPrompt={state.showSlowModelPrompt}
                slowModelLatency={state.slowModelLatency}
                onCancel={() => {
                    state.setShowSlowModelPrompt(false);
                    state.pendingTestRef.current = null;
                }}
                onContinue={handleContinueSlowModelTest}
            />

            {/* Tabs */}
            <div className="flex border-b border-[#2d2d2d]">
                {(['models', 'tests', 'logs'] as TabId[]).map((tab) => (
                    <button
                        key={tab}
                        onClick={() => state.setActiveTab(tab)}
                        className={`px-4 py-2 text-sm font-medium transition-colors ${state.activeTab === tab
                            ? 'text-purple-400 border-b-2 border-purple-500'
                            : 'text-gray-500 hover:text-gray-300'
                            }`}
                    >
                        {tab === 'models' ? '📊 Models' : tab === 'tests' ? '🧪 Tests' : '📜 Logs'}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="bg-[#1a1a1a] rounded-xl border border-[#2d2d2d] p-6">
                {/* Models Tab */}
                {state.activeTab === 'models' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" style={{ height: 'calc(100vh - 440px)', minHeight: '450px' }}>
                        {/* Model List */}
                        <ModelSelector
                            models={state.models}
                            selectedModelId={state.selectedModel?.modelId ?? null}
                            loading={state.loading}
                            testProgress={state.testProgress}
                            calculateETA={state.calculateETA}
                            onSelectModel={api.fetchModelProfile}
                            providerFilter={state.providerFilter}
                            setProviderFilter={state.setProviderFilter}
                            availableProviders={state.availableProviders}
                            testMode={state.testMode}
                            setTestMode={state.setTestMode}
                            testingAllModels={state.testingAllModels}
                            setTestingAllModels={state.setTestingAllModels}
                            testAllProgress={state.testAllProgress}
                            setTestAllProgress={state.setTestAllProgress}
                            cancelTestAllRef={state.cancelTestAllRef}
                            testingIntents={state.testingIntents}
                            setTestingIntents={state.setTestingIntents}
                            intentProgress={state.intentProgress}
                            setIntentProgress={state.setIntentProgress}
                            cancelIntentTestRef={state.cancelIntentTestRef}
                            fetchModels={api.fetchModels}
                        />

                        {/* Model Detail */}
                        <div className="flex-1 overflow-y-auto overflow-x-hidden">
                            {state.detailPaneVersion === 'v2' && state.selectedModel ? (
                                <ModelDetail
                                    profile={state.selectedModel}
                                    toolCategories={toolCategories}
                                    onRunProbes={(withLatency) => {
                                        state.setTestProgress({
                                            modelId: state.selectedModel!.modelId,
                                            probeProgress: { current: 0, total: 1, currentTest: 'Initializing...', score: 0, status: 'running' },
                                            startTime: Date.now(),
                                        });
                                        api.runProbeTests(state.selectedModel!.modelId, state.selectedModel!.provider, withLatency);
                                    }}
                                    onRunTools={() => {
                                        state.setTestProgress({
                                            modelId: state.selectedModel!.modelId,
                                            toolsProgress: { current: 0, total: 1, currentTest: 'Initializing...', score: 0, status: 'running' },
                                            startTime: Date.now(),
                                        });
                                        api.runModelTests(state.selectedModel!.modelId, state.selectedModel!.provider);
                                    }}
                                    onSetAsMain={() => api.setAsMainModel(state.selectedModel!.modelId)}
                                    onSetAsExecutor={() => api.setAsExecutorModel(state.selectedModel!.modelId)}
                                    isMain={state.mainModelId === state.selectedModel?.modelId}
                                    isExecutor={state.executorModelId === state.selectedModel?.modelId}
                                    isTesting={state.testingModel === state.selectedModel?.modelId || state.probingModel === state.selectedModel?.modelId}
                                    testProgress={testProgressForModel}
                                    modelLoading={state.modelLoading.modelId === state.selectedModel?.modelId ? state.modelLoading : undefined}
                                />
                            ) : (
                                <ModelDetailV1
                                    selectedModel={state.selectedModel}
                                    testProgress={state.testProgress}
                                    modelLoading={state.modelLoading}
                                    expandedSections={state.expandedSections}
                                    toggleSection={state.toggleSection}
                                    defaultContextLength={state.defaultContextLength}
                                    editingContextLength={state.editingContextLength}
                                    setEditingContextLength={state.setEditingContextLength}
                                    mcpTools={state.mcpTools}
                                    testingModel={state.testingModel}
                                    probingModel={state.probingModel}
                                    showSystemPromptEditor={state.showSystemPromptEditor}
                                    setShowSystemPromptEditor={state.setShowSystemPromptEditor}
                                    editingSystemPrompt={state.editingSystemPrompt}
                                    setEditingSystemPrompt={state.setEditingSystemPrompt}
                                    savingSystemPrompt={state.savingSystemPrompt}
                                    setSelectedModel={state.setSelectedModel}
                                    runModelTests={api.runModelTests}
                                    runProbeTests={api.runProbeTests}
                                    fetchModelProfile={api.fetchModelProfile}
                                    saveSystemPrompt={api.saveSystemPrompt}
                                    updateContextLength={api.updateContextLength}
                                    removeContextLength={api.removeContextLength}
                                    setTestProgress={state.setTestProgress}
                                    setSlowModelLatency={state.setSlowModelLatency}
                                    setShowSlowModelPrompt={state.setShowSlowModelPrompt}
                                    pendingTestRef={state.pendingTestRef}
                                />
                            )}
                        </div>
                    </div>
                )}

                {/* Tests Tab */}
                {state.activeTab === 'tests' && (
                    <TestsTab
                        customTests={state.customTests}
                        builtInTests={state.builtInTests}
                        testCategoryFilter={state.testCategoryFilter}
                        setTestCategoryFilter={state.setTestCategoryFilter}
                        testSearchFilter={state.testSearchFilter}
                        setTestSearchFilter={state.setTestSearchFilter}
                        selectedTest={state.selectedTest}
                        setSelectedTest={state.setSelectedTest}
                        testResult={state.testResult}
                        setTestResult={state.setTestResult}
                        tryingTest={state.tryingTest}
                        testEditorOpen={state.testEditorOpen}
                        setTestEditorOpen={state.setTestEditorOpen}
                        editingTest={state.editingTest}
                        setEditingTest={state.setEditingTest}
                        mainModelId={state.mainModelId}
                        handleTryTest={api.handleTryTest}
                        handleDeleteTest={api.handleDeleteTest}
                        handleSaveTest={api.handleSaveTest}
                    />
                )}

                {/* Logs Tab */}
                {state.activeTab === 'logs' && (
                    <LogsTab
                        logs={state.logs}
                        logStatusFilter={state.logStatusFilter}
                        setLogStatusFilter={state.setLogStatusFilter}
                        logToolFilter={state.logToolFilter}
                        setLogToolFilter={state.setLogToolFilter}
                        handleRollback={api.handleRollback}
                    />
                )}
            </div>
        </div>
    );
};
