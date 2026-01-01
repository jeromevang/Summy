import { notifications } from '../../services/notifications.js';
import { wsBroadcast } from '../../services/ws-broadcast.js';
import { modelManager } from '../../services/lmstudio-model-manager.js';
import { probeEngine } from './probe-engine.js';
import {
  TestDefinition,
  TestResult,
  TestRunResult,
  TestOptions,
  AliasRefinement
} from './testing/test-types.js';
import {
  ALL_TEST_DEFINITIONS,
  getTestsForMode,
  getProbesForMode
} from './testing/test-definitions.js';
import {
  findBestToolByArgs,
  scoreArgsAgainstSchema
} from './testing/test-utils.js';
import {
  calculateLatencyMetrics,
  applyLatencyScoring,
  calculateTrainabilityScores,
  updateModelProfile
} from './testing/test-scoring.js';
import { TestRunner } from './testing/test-runner.js';
import { ALL_TOOLS } from './capabilities.js';

export class TestEngine {
  private runner: TestRunner;
  private runningTests: Map<string, AbortController> = new Map();

  constructor() {
    this.runner = new TestRunner();
  }

  isTestRunning(modelId: string): boolean { return this.runningTests.has(modelId); }

  abortTest(modelId: string): boolean {
    const controller = this.runningTests.get(modelId);
    if (!controller) return false;
    controller.abort();
    this.runningTests.delete(modelId);
    wsBroadcast.broadcastProgress('tools', modelId, { current: 0, total: 0, currentTest: 'Cancelled', score: 0, status: 'cancelled' });
    return true;
  }

  /**
   * Get tests for a specific tool
   */
  getTestsForTool(tool: string): TestDefinition[] {
    return ALL_TEST_DEFINITIONS.filter(t => t.tool === tool);
  }

  /**
   * Run tests only for specific tools
   */
  async runTestsForTools(modelId: string, provider: any, tools: string[], settings: any, options: TestOptions = {}): Promise<TestRunResult> {
    const abortController = new AbortController();
    this.runningTests.set(modelId, abortController);
    const startedAt = new Date().toISOString();
    notifications.modelTestStarted(modelId);

    if (provider === 'lmstudio') {
      try { await modelManager.ensureLoaded(modelId, options.contextLength || 4096); } catch { }
    }

    const testsToRun = ALL_TEST_DEFINITIONS.filter(t => tools.includes(t.tool));
    const totalCount = testsToRun.length;
    const results: TestResult[] = [];
    let completed = 0;

    for (const test of testsToRun) {
      if (abortController.signal.aborted) break;
      const res = await this.runner.runSingleTest(test, modelId, provider, settings);
      results.push(res);
      completed++;
      this.broadcastProgress(modelId, completed, totalCount, test, res.score);
    }

    const metrics = calculateLatencyMetrics(results);
    const adjusted = applyLatencyScoring(results, metrics);
    const overallScore = adjusted.length ? Math.round(adjusted.reduce((s, r) => s + r.score, 0) / adjusted.length) : 0;
    const trainability = calculateTrainabilityScores(adjusted);

    const runResult: TestRunResult = {
      modelId, startedAt, completedAt: new Date().toISOString(),
      totalTests: results.length, passed: results.filter(r => r.passed).length,
      failed: results.filter(r => !r.passed).length, overallScore, results
    };

    await updateModelProfile(modelId, provider, runResult, null, [], trainability);
    this.runningTests.delete(modelId);

    if (!abortController.signal.aborted) {
      wsBroadcast.broadcastProgress('tools', modelId, { current: totalCount, total: totalCount, currentTest: 'Complete', score: overallScore, status: 'completed' });
    }

    return runResult;
  }

  private formatCategory(cat: string): string {
    const map: Record<string, string> = {
      '1.x': 'Tool Behavior',
      '2.x': 'Reasoning',
      '3.x': 'RAG Usage',
      '4.x': 'Bug Detection',
      '5.x': 'Navigation',
      '6.x': 'Helicopter View',
      '7.x': 'Proactive',
      '8.x': 'Intent Recognition',
      '9.x': 'Failure Modes',
      '10.x': 'Stateful',
      '11.x': 'Precedence',
      '12.x': 'Evolution',
      '13.x': 'Calibration',
      '14.x': 'Compliance'
    };
    return map[cat] || cat;
  }

  async runAllTests(modelId: string, provider: any, settings: any, options: TestOptions = {}): Promise<TestRunResult> {
    const abortController = new AbortController();
    this.runningTests.set(modelId, abortController);
    const startedAt = new Date().toISOString();
    notifications.modelTestStarted(modelId);
    const mode = options.mode || 'manual';
    const contextLength = options.contextLength || 8192;

    if (provider === 'lmstudio') {
      try { await modelManager.ensureLoaded(modelId, contextLength); } catch { }
    }

    let contextLatency;
    if (!options.skipPreflight) {
      if (['standard', 'deep', 'optimization'].includes(mode)) {
        try {
          // Use shorter timeout for OpenRouter to avoid rate limits
          const latencyTimeout = provider === 'openrouter' ? 20000 : 30000;
          contextLatency = await probeEngine.runContextLatencyProfile(modelId, provider, settings, latencyTimeout);
        } catch { }
      } else {
        try {
          // Use shorter timeout for OpenRouter
          const quickTimeout = provider === 'openrouter' ? 10000 : 15000;
          await probeEngine.runQuickLatencyCheck(modelId, provider, settings, quickTimeout);
        } catch { }
      }
    }

    const testsToRun = getTestsForMode(mode);
    const probesToRun = getProbesForMode(mode);
    const totalCount = testsToRun.length + probesToRun.length;
    const results: TestResult[] = [];
    const aliasRefinements: AliasRefinement[] = [];
    let completed = 0;

    for (const test of testsToRun) {
      if (abortController.signal.aborted) break;
      const res = await this.runner.runSingleTest(test, modelId, provider, settings);
      results.push(res);
      completed++;
      this.broadcastProgress(modelId, completed, totalCount, test, res.score);
      const refinement = this.analyzeAliasRefinement(res, test);
      if (refinement) aliasRefinements.push(refinement);

      // Add small delay for OpenRouter to avoid rate limits
      if (provider === 'openrouter') {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    for (const probe of probesToRun) {
      if (abortController.signal.aborted) break;
      const res = await this.runner.runSingleProbe(probe, modelId, provider, settings);
      results.push(res);
      completed++;
      this.broadcastProgress(modelId, completed, totalCount, probe, res.score);

      // Add small delay for OpenRouter to avoid rate limits
      if (provider === 'openrouter') {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    const metrics = calculateLatencyMetrics(results);
    const adjusted = applyLatencyScoring(results, metrics);
    const overallScore = adjusted.length ? Math.round(adjusted.reduce((s, r) => s + r.score, 0) / adjusted.length) : 0;
    const trainability = calculateTrainabilityScores(adjusted);

    const runResult: TestRunResult = {
      modelId, startedAt, completedAt: new Date().toISOString(),
      totalTests: results.length, passed: results.filter(r => r.passed).length,
      failed: results.filter(r => !r.passed).length, overallScore, results,
      contextLatency: contextLatency as any
    };

    await updateModelProfile(modelId, provider, runResult, null, aliasRefinements, trainability);
    this.runningTests.delete(modelId);
    if (!abortController.signal.aborted) {
      wsBroadcast.broadcastProgress('tools', modelId, { current: totalCount, total: totalCount, currentTest: 'Complete', score: overallScore, status: 'completed' });
      wsBroadcast.broadcastTestComplete(modelId, overallScore, 'tools');
    }
    notifications.modelTestCompleted(modelId, overallScore);
    return runResult;
  }

  private broadcastProgress(modelId: string, current: number, total: number, item: any, score: number) {
    wsBroadcast.broadcastProgress('tools', modelId, {
      current, total,
      currentTest: item.id + ': ' + (item.tool || item.name),
      currentCategory: this.formatCategory(item.category || item.id.split('.')[0] + '.x'),
      score, status: 'running'
    });
  }

  private analyzeAliasRefinement(res: TestResult, test: TestDefinition): AliasRefinement | null {
    if (!res.calledTool || !res.calledArgs || res.calledTool === test.tool) return null;
    const best = findBestToolByArgs(res.calledArgs, ALL_TOOLS);
    if (!best || best.score < 40) return null;
    const currentScore = scoreArgsAgainstSchema(res.calledArgs, test.tool);
    if (best.score > currentScore + 20) {
      return { nativeToolName: res.calledTool, originalMapping: test.tool, refinedMapping: best.tool, confidence: best.score, reason: `Matches ${best.tool} better` };
    }
    return null;
  }
}
export const testEngine = new TestEngine();
