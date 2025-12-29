import { notifications } from '../../services/notifications.js';
import { wsBroadcast } from '../../services/ws-broadcast.js';
import { modelManager } from '../../services/lmstudio-model-manager.js';

// Modular probes
import { ProbeCore } from './probes/probe-core.js';
import { ProbeReasoning } from './probes/probe-reasoning.js';
import { ProbeStrategic } from './probes/probe-strategic.js';
import {
  ProbeResult,
  ProbeOptions,
  ProbeRunResult,
  ReasoningProbeResults
} from './probes/probe-types.js';

// Legacy strategic/intent probes (to be modularized further if needed)
import {
  runProbeCategory,
  ProbeTestResult as StrategicProbeResult,
} from './strategic-probes.js';

import {
  runIntentProbes,
  calculateIntentScores,
  IntentProbeResult,
} from './intent-probes.js';

export class ProbeEngine {
  private core: ProbeCore;
  private reasoning: ProbeReasoning;
  private strategic: ProbeStrategic;
  private defaultTimeout = 60000;

  constructor() {
    this.core = new ProbeCore();
    this.reasoning = new ProbeReasoning();
    this.strategic = new ProbeStrategic();
  }

  async runAllProbes(
    modelId: string,
    provider: 'lmstudio' | 'openai' | 'azure' | 'openrouter',
    settings: any,
    options: ProbeOptions = {}
  ): Promise<ProbeRunResult> {
    const startedAt = new Date().toISOString();
    const timeout = options.timeout || this.defaultTimeout;
    const runReasoningProbes = options.runReasoningProbes !== false;

    console.log(`[ProbeEngine] Starting probe tests for ${modelId} (provider: ${provider})`);
    notifications.info(`Starting probe tests for ${modelId}`);

    if (provider === 'lmstudio') {
      try { await modelManager.ensureLoaded(modelId, options.contextLength || 2048); } catch { }
    }

    const totalTests = runReasoningProbes ? 15 : 8;
    let completedTests = 0;
    let runningScore = 0;

    const broadcast = (testName: string, category: string, score?: number) => {
      completedTests++;
      if (score !== undefined) {
        runningScore = Math.round((runningScore * (completedTests - 1) + score) / completedTests);
      }
      wsBroadcast.broadcastProgress('probe', modelId, {
        current: completedTests,
        total: totalTests,
        currentTest: testName,
        currentCategory: category,
        score: runningScore,
        status: 'running'
      });
    };

    // 1. Core Tool Behavior
    const emit = await this.core.runEmitTest(modelId, provider, settings, timeout);
    broadcast('Emit Test', 'Tool Behavior', emit.score);

    const schema = await this.core.runSchemaAdherenceTest(modelId, provider, settings, timeout);
    broadcast('Schema Adherence', 'Tool Behavior', schema.score);

    const selection = await this.core.runSelectionLogicTest(modelId, provider, settings, timeout);
    broadcast('Selection Logic', 'Tool Behavior', selection.score);

    const suppression = await this.core.runSuppressionTest(modelId, provider, settings, timeout);
    broadcast('Suppression', 'Tool Behavior', suppression.score);

    // Enhanced
    const nearIdentical = await this.core.runNearIdenticalSelectionTest(modelId, provider, settings, timeout);
    broadcast('Near-Identical Selection', 'Tool Behavior', nearIdentical.score);

    const multiEmit = await this.core.runMultiToolEmitTest(modelId, provider, settings, timeout);
    broadcast('Multi-Tool Emit', 'Tool Behavior', multiEmit.score);

    const argVal = await this.core.runArgumentValidationTest(modelId, provider, settings, timeout);
    broadcast('Argument Validation', 'Tool Behavior', argVal.score);

    const schemaReorder = await this.core.runSchemaReorderTest(modelId, provider, settings, timeout);
    broadcast('Schema Reorder', 'Tool Behavior', schemaReorder.score);

    const coreToolScore = (emit.score + schema.score + selection.score + suppression.score) / 4;
    const enhToolScore = (nearIdentical.score + multiEmit.score + argVal.score + schemaReorder.score) / 4;
    const toolScore = Math.round(coreToolScore * 0.6 + enhToolScore * 0.4);

    // 2. Reasoning
    let reasoningResults: ReasoningProbeResults | undefined;
    let reasoningScore = 0;

    if (runReasoningProbes) {
      const intent = await this.reasoning.runIntentExtractionTest(modelId, provider, settings, timeout);
      broadcast('Intent Extraction', 'Reasoning', intent.score);
      const multiStep = await this.reasoning.runMultiStepPlanningTest(modelId, provider, settings, timeout);
      broadcast('Multi-step Planning', 'Reasoning', multiStep.score);
      const cond = await this.reasoning.runConditionalReasoningTest(modelId, provider, settings, timeout);
      broadcast('Conditional Reasoning', 'Reasoning', cond.score);
      const cont = await this.reasoning.runContextContinuityTest(modelId, provider, settings, timeout);
      broadcast('Context Continuity', 'Reasoning', cont.score);
      const logic = await this.reasoning.runLogicalConsistencyTest(modelId, provider, settings, timeout);
      broadcast('Logical Consistency', 'Reasoning', logic.score);
      const expl = await this.reasoning.runExplanationTest(modelId, provider, settings, timeout);
      broadcast('Explanation', 'Reasoning', expl.score);
      const edge = await this.reasoning.runEdgeCaseHandlingTest(modelId, provider, settings, timeout);
      broadcast('Edge Case', 'Reasoning', edge.score);

      reasoningResults = {
        intentExtraction: intent,
        multiStepPlanning: multiStep,
        conditionalReasoning: cond,
        contextContinuity: cont,
        logicalConsistency: logic,
        explanation: expl,
        edgeCaseHandling: edge
      };
      reasoningScore = Math.round((intent.score + multiStep.score + cond.score + cont.score + logic.score + expl.score + edge.score) / 7);
    }

    // 3. Strategic (Briefed wrapper for now)
    const chatExecutor = async (prompt: string) => {
      const res = await this.core['callLLM'](modelId, provider, [{ role: 'user', content: prompt }], undefined, settings, timeout);
      return { response: res?.choices?.[0]?.message?.content || '', toolCalls: res?.choices?.[0]?.message?.tool_calls || [] };
    };

    let strategicRAG: StrategicProbeResult[] | undefined;
    if (options.runStrategicProbes !== false && !options.quickMode) {
      strategicRAG = await runProbeCategory('3.x', chatExecutor, () => { });
    }

    const overallScore = Math.round(runReasoningProbes ? (toolScore + reasoningScore) / 2 : toolScore);
    const role = this.determineRole(emit, schema, selection, suppression, reasoningResults);

    let contextLatency;
    if (options.runLatencyProfile) {
      contextLatency = await this.strategic.runContextLatencyProfile(modelId, provider, settings, timeout);
    }

    const result: ProbeRunResult = {
      modelId, provider, startedAt, completedAt: new Date().toISOString(),
      emitTest: emit, schemaTest: schema, selectionTest: selection, suppressionTest: suppression,
      nearIdenticalSelectionTest: nearIdentical, multiToolEmitTest: multiEmit,
      argumentValidationTest: argVal, schemaReorderTest: schemaReorder,
      reasoningProbes: reasoningResults, strategicRAGProbes: strategicRAG,
      toolScore, reasoningScore, overallScore, role, contextLatency,
      scoreBreakdown: { toolScore, reasoningScore, overallScore, ragScore: 0, bugDetectionScore: 0, architecturalScore: 0, navigationScore: 0, helicopterScore: 0, proactiveScore: 0, intentScore: 0 }
    };

    wsBroadcast.broadcastProgress('probe', modelId, { current: totalTests, total: totalTests, currentTest: 'Complete', score: overallScore, status: 'completed' });
    notifications.success(`Probe tests completed for ${modelId}: ${role} role, score ${overallScore}/100`);

    return result;
  }

  private determineRole(emit: ProbeResult, schema: ProbeResult, selection: ProbeResult, suppression: ProbeResult, reasoning?: ReasoningProbeResults): 'main' | 'executor' | 'both' | 'none' {
    const isExec = emit.passed && emit.score >= 80 && schema.passed && schema.score >= 70;
    let isMain = suppression.passed && suppression.score >= 70 && selection.passed && selection.score >= 70;
    if (reasoning) {
      const reasoningScore = (reasoning.intentExtraction.score + reasoning.conditionalReasoning.score + reasoning.logicalConsistency.score) / 3;
      isMain = isMain && reasoningScore >= 60;
    }
    if (isMain && isExec) return 'both';
    if (isMain) return 'main';
    if (isExec) return 'executor';
    return 'none';
  }

  async runContextLatencyProfile(modelId: string, provider: string, settings: any, timeout: number) {
    return this.strategic.runContextLatencyProfile(modelId, provider as any, settings, timeout);
  }

  async runQuickLatencyCheck(modelId: string, provider: string, settings: any, timeout: number) {
    // Basic latency check: call with empty tool list
    const start = Date.now();
    await this.core['callLLM'](modelId, provider as any, [{ role: 'user', content: 'Hi' }], [], settings, timeout);
    return Date.now() - start;
  }
}
export const probeEngine = new ProbeEngine();
