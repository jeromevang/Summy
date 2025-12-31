import { capabilities } from '../capabilities.js';
import { wsBroadcast } from '../../../services/ws-broadcast.js';
import { TestResult, AliasRefinement, TestRunResult } from './test-types.js';

export function calculateLatencyMetrics(results: TestResult[]) {
    const valid = results.filter(r => r.latency > 0);
    if (valid.length === 0) return { avgLatency: 0, latencyScore: 50, fast: 0, slow: 0 };
    const avg = Math.round(valid.reduce((s, r) => s + r.latency, 0) / valid.length);
    let score = 50;
    for (const r of valid) {
        if (r.latency < 2000) score += 5;
        else if (r.latency < 5000) score += 2;
        else if (r.latency < 10000) score -= 2;
        else score -= 5;
    }
    return { avgLatency: avg, latencyScore: Math.max(0, Math.min(100, score)), fast: valid.filter(r => r.latency < 2000).length, slow: valid.filter(r => r.latency > 10000).length };
}

export function applyLatencyScoring(results: TestResult[], metrics: any) {
    return results.map(r => {
        if (r.latency === 0 || !r.passed) return r;
        let adj = 0;
        if (r.latency < 2000) adj = 5;
        else if (r.latency < 5000) adj = 2;
        else if (r.latency > 15000) adj = -10;
        else if (r.latency > 10000) adj = -5;
        return { ...r, score: Math.round(Math.max(0, Math.min(100, r.score + adj))) };
    });
}

export function calculateTrainabilityScores(results: TestResult[]) {
    const comp = results.filter(r => r.testId.startsWith('14.'));
    if (comp.length === 0) return null;
    const spc = Math.round(comp.reduce((s, r) => s + r.score, 0) / comp.length);
    const state = results.filter(r => r.testId.startsWith('10.'));
    const inst = state.length > 0 ? Math.round(state.reduce((s, r) => s + r.score, 0) / state.length) : spc;
    const fail = results.filter(r => r.testId.startsWith('9.'));
    const corr = fail.length > 0 ? Math.round(fail.reduce((s, r) => s + r.score, 0) / fail.length) : spc;
    return { systemPromptCompliance: spc, instructionPersistence: inst, correctionAcceptance: corr, overallTrainability: Math.round(spc * 0.5 + inst * 0.25 + corr * 0.25) };
}

export async function updateModelProfile(modelId: string, provider: string, runResult: TestRunResult, discoveryResult?: any, aliasRefinements?: AliasRefinement[], trainabilityScores?: any) {
    let profile = await capabilities.getProfile(modelId) || capabilities.createEmptyProfile(modelId, modelId, provider as any);
    profile = capabilities.updateProfileWithResults(profile, runResult.results.map(r => ({ testId: r.testId, tool: r.tool, passed: r.passed, score: r.score, latency: r.latency, response: r.response ? JSON.stringify(r.response).slice(0, 500) : undefined, error: r.error })));

    if (discoveryResult) {
        if (discoveryResult.discoveredTools?.length) profile.discoveredNativeTools = discoveryResult.discoveredTools;
        if (discoveryResult.unmappedTools?.length) profile.unmappedNativeTools = discoveryResult.unmappedTools;
        for (const [mcp, aliases] of Object.entries(discoveryResult.aliases || {})) {
            if (profile.capabilities[mcp] && (aliases as string[]).length) profile.capabilities[mcp].nativeAliases = aliases as string[];
        }
    }

    if (aliasRefinements?.length) {
        for (const ref of aliasRefinements) {
            if (profile.capabilities[ref.originalMapping]?.nativeAliases) profile.capabilities[ref.originalMapping].nativeAliases = profile.capabilities[ref.originalMapping].nativeAliases!.filter(a => a !== ref.nativeToolName);
            if (profile.capabilities[ref.refinedMapping]) {
                if (!profile.capabilities[ref.refinedMapping].nativeAliases) profile.capabilities[ref.refinedMapping].nativeAliases = [];
                if (!profile.capabilities[ref.refinedMapping].nativeAliases!.includes(ref.nativeToolName)) profile.capabilities[ref.refinedMapping].nativeAliases!.push(ref.nativeToolName);
            }
        }
        wsBroadcast.broadcast('alias_refinements', { modelId, refinements: aliasRefinements });
    }

    if (runResult.scoreBreakdown) (profile as any).scoreBreakdown = runResult.scoreBreakdown;
    if (trainabilityScores) (profile as any).trainabilityScores = trainabilityScores;
    if (runResult.contextLatency) {
        (profile as any).contextLatency = runResult.contextLatency;
        if (!profile.contextLength && runResult.contextLatency.recommendedContext) profile.contextLength = runResult.contextLatency.recommendedContext;
    }

    // Calculate and store Efficiency Metrics
    profile.efficiencyMetrics = computeEfficiencyMetrics(runResult.results);

    await capabilities.saveProfile(profile);
}

// ============================================================
// NEW: Efficiency Metrics Calculation
// ============================================================

export function computeEfficiencyMetrics(results: TestResult[]): EfficiencyMetrics {
    let totalTokensForCorrectActions = 0;
    let correctActionsCount = 0;
    let totalRagTokens = 0;
    let failedRagTokens = 0;
    let totalPlanningTokens = 0;
    let totalToolTokens = 0;
    let redundantToolCalls = 0;

    for (const result of results) {
        if (result.totalTokens) {
            // tokensPerCorrectAction
            if (result.passed) {
                totalTokensForCorrectActions += result.totalTokens;
                correctActionsCount++;
            }

            // ragWasteRatio (simplified proxy)
            if (result.category === 'rag' || result.tool === 'rag_query') {
                totalRagTokens += result.totalTokens;
                if (!result.passed) {
                    failedRagTokens += result.totalTokens;
                }
            }

            // planningVerbosity (simplified proxy based on categories)
            if (result.category === 'reasoning') {
                totalPlanningTokens += result.totalTokens;
            } else if (result.category === 'tool') {
                totalToolTokens += result.totalTokens;
            }

            // redundantToolCalls (simplified proxy)
            if (result.calledTool && !result.passed && result.error && result.error.includes('tool failed')) {
                redundantToolCalls++;
            }
        }
    }

    const tokensPerCorrectAction = correctActionsCount > 0 
        ? Math.round(totalTokensForCorrectActions / correctActionsCount)
        : 0;

    const ragWasteRatio = totalRagTokens > 0 
        ? parseFloat((failedRagTokens / totalRagTokens).toFixed(2))
        : 0;

    const planningVerbosity = totalToolTokens > 0 
        ? parseFloat((totalPlanningTokens / totalToolTokens).toFixed(2))
        : 0;

    return {
        tokensPerCorrectAction,
        ragWasteRatio,
        planningVerbosity,
        redundantToolCalls,
        estimatedCostPerTask: 0, 
        speedEfficiencyScore: 0
    };
}




