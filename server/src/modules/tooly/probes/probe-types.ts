export interface ProbeResult {
    testName: string;
    passed: boolean;
    score: number;
    latency: number;
    details: string;
    response?: any;
    error?: string;
    toolFormat?: string;
}

export interface ReasoningProbeResults {
    intentExtraction: ProbeResult;
    multiStepPlanning: ProbeResult;
    conditionalReasoning: ProbeResult;
    contextContinuity: ProbeResult;
    logicalConsistency: ProbeResult;
    explanation: ProbeResult;
    edgeCaseHandling: ProbeResult;
}

export interface ContextLatencyResult {
    testedContextSizes: number[];
    latencies: Record<number, number>;
    maxUsableContext: number;
    recommendedContext: number;
    modelMaxContext?: number;
    minLatency?: number;
    isInteractiveSpeed: boolean;
    speedRating: 'excellent' | 'good' | 'acceptable' | 'slow' | 'very_slow';
}

export interface ProbeRunResult {
    modelId: string;
    provider: string;
    startedAt: string;
    completedAt: string;
    emitTest: ProbeResult;
    schemaTest: ProbeResult;
    selectionTest: ProbeResult;
    suppressionTest: ProbeResult;
    nearIdenticalSelectionTest?: ProbeResult;
    multiToolEmitTest?: ProbeResult;
    argumentValidationTest?: ProbeResult;
    schemaReorderTest?: ProbeResult;
    reasoningProbes?: ReasoningProbeResults;
    strategicRAGProbes?: any[];
    intentProbes?: any[];
    intentScores?: any;
    architecturalProbes?: any[];
    navigationProbes?: any[];
    helicopterProbes?: any[];
    proactiveProbes?: any[];
    overallScore: number;
    toolScore: number;
    reasoningScore: number;
    role: string;
    contextLatency?: ContextLatencyResult;
    scoreBreakdown: {
        toolScore: number;
        reasoningScore: number;
        overallScore: number;
        ragScore: number;
        bugDetectionScore: number;
        architecturalScore: number;
        navigationScore: number;
        helicopterScore: number;
        proactiveScore: number;
        intentScore: number;
    };
}

export interface ProbeOptions {
    contextLength?: number;
    timeout?: number;
    runLatencyProfile?: boolean;
    runReasoningProbes?: boolean;
    categories?: string[];
    runStrategicProbes?: boolean;
    runArchitecturalProbes?: boolean;
    runNavigationProbes?: boolean;
    runHelicopterProbes?: boolean;
    runProactiveProbes?: boolean;
    runIntentProbes?: boolean;
    quickMode?: boolean;
    isBaseline?: boolean;
}

export interface BadOutputResult {
    isLooping: boolean;
    hasLeakedTokens: boolean;
    leakedTokens: string[];
    isMalformed: boolean;
}
