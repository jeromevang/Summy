import React from 'react';
import { SlowModelModal } from './SlowModelModal';
import { ModelDetail } from '../../../components/ModelDetail';
import { ModelDetailV1 } from './ModelDetailV1';
import type { ToolyState } from '../hooks/useToolyState';

interface TestRunnerProps {
    state: ToolyState;
    api: any;
    testProgressForModel: any;
    toolCategories: any;
    handleContinueSlowModelTest: () => Promise<void>;
    runProbeTests: (withLatency: boolean) => void;
    runModelTests: () => void;
}

export const TestRunner: React.FC<TestRunnerProps> = ({
    state,
    api,
    testProgressForModel,
    toolCategories,
    handleContinueSlowModelTest,
    runProbeTests,
    runModelTests,
}) => {
    return (
        <>
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

            {/* Model Detail Display */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden">
                {state.detailPaneVersion === 'v2' && state.selectedModel ? (
                    <ModelDetail
                        profile={state.selectedModel}
                        toolCategories={toolCategories}
                        onRunProbes={runProbeTests}
                        onRunTools={runModelTests}
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
        </>
    );
};
