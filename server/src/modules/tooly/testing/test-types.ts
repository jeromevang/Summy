import { ContextLatencyResult } from '../probes/probe-types.js';

export interface ParamCondition {
    equals?: any;
    contains?: string;
    oneOf?: any[];
    exists?: boolean;
}

export interface TestDefinition {
    id: string;
    tool: string;
    category: string;
    difficulty: 'easy' | 'medium' | 'hard';
    prompt: string;
    setupFiles?: Record<string, string>;
    expected: {
        tool: string;
        params: Record<string, ParamCondition>;
    };
    tags?: string[];
    weight?: number;
}

export interface TestResult {
    testId: string;
    tool: string;
    passed: boolean;
    score: number;
    latency: number;
    checks: CheckResult[];
    response?: any;
    error?: string;
    calledTool?: string;
    calledArgs?: Record<string, any>;
}

export interface CheckResult {
    name: string;
    passed: boolean;
    expected?: any;
    actual?: any;
}

export interface OptimizationResults {
    contextLatency?: ContextLatencyResult;
    toolCountSweep?: {
        essential: { count: number; score: number; latency: number };
        standard: { count: number; score: number; latency: number };
        full: { count: number; score: number; latency: number };
        optimal: 'essential' | 'standard' | 'full';
    };
    ragTuning?: {
        chunkSizes: Record<number, number>;
        resultCounts: Record<number, number>;
        optimalChunkSize: number;
        optimalResultCount: number;
    };
    optimalContextLength?: number;
    optimalToolCount?: number;
    configGenerated?: boolean;
    configPath?: string;
}

export interface AliasRefinement {
    nativeToolName: string;
    originalMapping: string;
    refinedMapping: string;
    confidence: number;
    reason: string;
}

export interface TestRunResult {
    modelId: string;
    startedAt: string;
    completedAt: string;
    totalTests: number;
    passed: number;
    failed: number;
    overallScore: number;
    results: TestResult[];
    scoreBreakdown?: {
        toolScore?: number;
        reasoningScore?: number;
        ragScore?: number;
        intentScore?: number;
        bugDetectionScore?: number;
    };
    aborted?: boolean;
    abortReason?: 'MODEL_TOO_SLOW' | 'USER_CANCELLED' | 'ERROR';
    preflightLatency?: number;
    preflightMessage?: string;
    contextLatency?: ContextLatencyResult;
    optimization?: OptimizationResults;
}

export type TestMode = 'quick' | 'standard' | 'deep' | 'optimization' | 'keep_on_success' | 'manual';

export interface TestOptions {
    mode?: TestMode;
    unloadOthersBefore?: boolean;
    unloadAfterTest?: boolean;
    unloadOnlyOnFail?: boolean;
    contextLength?: number;
    skipPreflight?: boolean;
    categories?: string[];
    signal?: AbortSignal;
    isBaseline?: boolean;
}
