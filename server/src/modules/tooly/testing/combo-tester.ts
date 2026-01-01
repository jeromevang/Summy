
import { LMStudioClient } from '@lmstudio/sdk';
import { intentRouter } from '../intent-router.js';

import { db } from '../../../services/database.js';
import { failureLog } from '../../../services/failure-log.js';
import { capabilities } from '../capabilities.js';
import {
  DifficultyTier,
  ComboTestCase,
  ComboTestResult,
  CategoryScore,
  TierScore,
  ComboScore,
  ComboTestConfig,
  BroadcastFn
} from './test-types.js';
import {
  SANDBOX_CONTEXT,
  COMBO_TEST_CASES,
  TIER_WEIGHTS
} from './combo-test-definitions.js';
import { getModelProvider, getBasicTools } from './test-utils.js';

export class ComboTester {
  private config: ComboTestConfig;
  private broadcast?: BroadcastFn;
  private capabilities: any;
  private cachedIntents: Map<string, Map<string, any>> = new Map();

  constructor(config: ComboTestConfig, broadcast?: BroadcastFn) {
    this.config = config;
    this.broadcast = broadcast;
    this.capabilities = capabilities;
  }

  private saveResultToDb(score: ComboScore): void {
    try {
      db.saveComboResult({
        mainModelId: score.mainModelId,
        executorModelId: score.executorModelId,
        overallScore: score.overallScore,
        mainScore: score.mainScore,
        executorScore: score.executorScore,
        tierScores: {
          simple: score.tierScores.find(t => t.tier === 'simple')?.score || 0,
          medium: score.tierScores.find(t => t.tier === 'medium')?.score || 0,
          complex: score.tierScores.find(t => t.tier === 'complex')?.score || 0,
        },
        categoryScores: score.categoryScores,
        testResults: score.testResults,
        avgLatencyMs: score.avgLatencyMs,
        passedCount: score.passedTests,
        failedCount: score.totalTests - score.passedTests,
        mainExcluded: score.mainExcluded || false,
        qualifyingGatePassed: score.qualifyingGatePassed,
        disqualifiedAt: score.disqualifiedAt,
        qualifyingResults: score.qualifyingResults,
      });
    } catch (err: any) {
      console.error(`[ComboTester] Failed to save result to DB: ${err.message}`);
    }
  }

  private async checkVramCompatibility(mainModelId: string, executorModelId: string): Promise<{compatible: boolean, totalVram: number, reason?: string}> {
    const availableVramGB = 16;
    let mainVramGB = 4, executorVramGB = 4;

    const estimate = (id: string) => {
      if (id.includes('30b') || id.includes('32b')) return 12;
      if (id.includes('14b') || id.includes('8b')) return 8;
      if (id.includes('4b') || id.includes('7b')) return 4;
      return 4;
    };

    mainVramGB = estimate(mainModelId);
    executorVramGB = estimate(executorModelId);
    const totalVramGB = mainModelId === executorModelId ? mainVramGB : mainVramGB + executorVramGB;
    const compatible = totalVramGB <= availableVramGB;
    return { compatible, totalVram: totalVramGB, reason: compatible ? undefined : `Requires ${totalVramGB}GB VRAM, only ${availableVramGB}GB available` };
  }

  private async ensureModelLoaded(modelId: string, role: 'main' | 'executor' | 'dual', otherModelId?: string): Promise<void> {
    const client = new LMStudioClient();
    const contextSize = this.config.contextSize || 4096;
    const provider = await getModelProvider(modelId, this.capabilities);
    
    if (provider !== 'lmstudio') return;

    try {
      const loaded = await client.llm.listLoaded();
      const isLoaded = (id: string) => loaded.some(m => m.identifier.includes(id) || id.includes(m.identifier));

      if (role === 'dual' && otherModelId) {
        const otherProvider = await getModelProvider(otherModelId, this.capabilities);
        if (isLoaded(modelId) && (otherProvider !== 'lmstudio' || isLoaded(otherModelId))) return;
      } else if (isLoaded(modelId)) return;

      for (const m of loaded) await client.llm.unload(m.identifier);

      await client.llm.load(modelId, { config: { contextLength: contextSize } });
      if (role === 'dual' && otherModelId && modelId !== otherModelId) {
        const otherProvider = await getModelProvider(otherModelId, this.capabilities);
        if (otherProvider === 'lmstudio') {
          await client.llm.load(otherModelId, { config: { contextLength: contextSize } });
        }
      }
    } catch (error: any) {
      console.error(`[ComboTester] Load failed: ${error.message}`);
    }
  }

  async testAllCombos(): Promise<ComboScore[]> {
    const uniqueMainModels = [...new Set(this.config.mainModels)];
    const taskTimeout = this.config.taskTimeout || 10000;
    const excludedMainModels = new Set<string>();

    for (const mainModel of uniqueMainModels) {
      await this.ensureModelLoaded(mainModel, 'main');
      await intentRouter.configure({
        mainModelId: mainModel,
        executorModelId: mainModel,
        enableDualModel: true,
        timeout: this.config.timeout || 60000,
        provider: 'lmstudio',
        settings: { lmstudioUrl: this.config.lmstudioUrl },
      });

      const mainIntents = new Map<string, any>();
      let mainTimedOut = false;

      for (const test of COMBO_TEST_CASES) {
        try {
          const result = await intentRouter.getMainIntent([{ role: 'system', content: SANDBOX_CONTEXT }, { role: 'user', content: test.prompt }], taskTimeout);
          mainIntents.set(test.id, { ...result, timedOut: result.latencyMs > taskTimeout, test });
          if (result.latencyMs > taskTimeout) mainTimedOut = true;
        } catch (err: any) {
          mainIntents.set(test.id, { intent: { action: 'respond' }, latencyMs: taskTimeout, timedOut: true, error: err.message, test });
          mainTimedOut = true;
        }
      }
      if (mainTimedOut) excludedMainModels.add(mainModel);
      this.cachedIntents.set(mainModel, mainIntents);
    }

    const results: ComboScore[] = [];
    for (const main of this.config.mainModels) {
      for (const executor of this.config.executorModels) {
        if (excludedMainModels.has(main)) {
          results.push(this.createFailedScore(main, executor, true));
          continue;
        }
        const score = await this.testExecutorWithCachedIntents(main, executor, this.cachedIntents.get(main)!);
        results.push(score);
        this.saveResultToDb(score);
      }
    }
    return results.sort((a, b) => b.overallScore - a.overallScore);
  }

  private async testExecutorWithCachedIntents(mainId: string, execId: string, intents: Map<string, any>): Promise<ComboScore> {
    const taskTimeout = this.config.taskTimeout || 10000;
    await this.ensureModelLoaded(execId, 'executor');
    await intentRouter.configure({
      mainModelId: mainId,
      executorModelId: execId,
      enableDualModel: true,
      timeout: this.config.timeout || 60000,
      provider: 'lmstudio',
      settings: { lmstudioUrl: this.config.lmstudioUrl },
    });

    const testResults: ComboTestResult[] = [];
    const tools = getBasicTools();

    for (const test of COMBO_TEST_CASES) {
      const cached = intents.get(test.id);
      let execLatency = 0, execTimedOut = false, execTools: string[] = [];

      if (cached.intent.action === 'call_tool' || cached.intent.action === 'multi_step') {
        try {
          const result = await intentRouter.executeWithIntent(cached.intent, tools, taskTimeout);
          execLatency = result.latencyMs;
          execTimedOut = execLatency > taskTimeout;
          execTools = result.toolCalls?.map((tc: any) => tc.function?.name).filter(Boolean) || [];
        } catch {
          execLatency = taskTimeout; execTimedOut = true;
        }
      }

      const passed = this.evaluateTestResult(test, cached.intent.action, cached.intent.tool, execTools);

      if (!passed) {
        failureLog.logFailure({
          modelId: mainId,
          executorModelId: execId,
          category: 'combo_pairing',
          tool: test.expectedTool || 'unknown',
          error: `Combo test ${test.id} failed. Main: ${cached.intent.action}, Exec: ${execTools.join(', ') || 'none'}`,
          query: test.prompt,
          conversationLength: 2
        });
      }

      testResults.push({
        testId: test.id, testName: test.name, category: test.category, difficulty: test.difficulty,
        passed, mainOutputValid: !!cached.intent.action, mainAction: cached.intent.action, mainTool: cached.intent.tool,
        executorCalled: !!execTools.length, executorToolCalls: execTools,
        latencyMs: cached.latencyMs + execLatency, mainLatencyMs: cached.latencyMs, executorLatencyMs: execLatency,
        mainTimedOut: cached.timedOut, executorTimedOut: execTimedOut, timedOut: cached.timedOut || execTimedOut
      });
    }

    return this.calculateComboScore(mainId, execId, testResults);
  }

  private evaluateTestResult(test: ComboTestCase, mainAction: string, mainTool: string, execTools: string[]): boolean {
    if (test.expectedAction === 'call_tool') return mainAction === 'call_tool' && mainTool === test.expectedTool && execTools.includes(test.expectedTool!);
    if (test.expectedAction === 'respond') return test.category === 'refusal' ? !execTools.includes('shell_exec') : mainAction === 'respond' && !execTools.length;
    if (test.expectedAction === 'ask_clarification') return (mainAction === 'respond' || mainAction === 'ask_clarification') && !execTools.length;
    if (test.expectedAction === 'multi_step') return (mainAction === 'multi_step' || mainAction === 'call_tool') && (execTools.includes(test.expectedTools![0]) || execTools.some(t => test.expectedTools!.includes(t)));
    return false;
  }

  private calculateComboScore(mainId: string, execId: string, results: ComboTestResult[]): ComboScore {
    const catScores: CategoryScore[] = COMBO_TEST_CASES.map(test => {
      const res = results.find(r => r.testId === test.id);
      return { category: test.category, difficulty: test.difficulty, score: res?.passed ? 100 : 0, passed: !!res?.passed, latencyMs: res?.latencyMs || 0 };
    });

    const tierScores: TierScore[] = (['simple', 'medium', 'complex'] as DifficultyTier[]).map(tier => {
      const cats = catScores.filter(c => c.difficulty === tier);
      const avg = cats.length ? cats.reduce((s, c) => s + c.score, 0) / cats.length : 0;
      return { tier, score: Math.round(avg), categories: cats };
    });

    const overallScore = Math.round(tierScores.reduce((s, t) => s + (t.score * TIER_WEIGHTS[t.tier]), 0));
    const valid = results.filter(r => !r.skipped && !r.timedOut);
    const passed = valid.filter(r => r.passed).length;

    return {
      mainModelId: mainId, executorModelId: execId, totalTests: COMBO_TEST_CASES.length, passedTests: passed, passedCount: passed, failedCount: COMBO_TEST_CASES.length - passed,
      categoryScores: catScores, tierScores, mainScore: 0, executorScore: 0, mainCorrectCount: 0, executorSuccessCount: 0,
      intentAccuracy: 0, executionSuccess: 0, avgLatencyMs: Math.round(results.reduce((s, r) => s + r.latencyMs, 0) / results.length),
      minLatencyMs: Math.min(...results.map(r => r.latencyMs)), maxLatencyMs: Math.max(...results.map(r => r.latencyMs)),
      overallScore, testResults: results, testedAt: new Date().toISOString()
    };
  }

  private createFailedScore(mainId: string, execId: string, mainExcluded = false): ComboScore {
    return {
      mainModelId: mainId, executorModelId: execId, totalTests: COMBO_TEST_CASES.length, passedTests: 0, passedCount: 0, failedCount: COMBO_TEST_CASES.length,
      categoryScores: [], tierScores: [], mainScore: 0, executorScore: 0, mainCorrectCount: 0, executorSuccessCount: 0,
      intentAccuracy: 0, executionSuccess: 0, avgLatencyMs: 0, minLatencyMs: 0, maxLatencyMs: 0, overallScore: 0,
      testResults: [], testedAt: new Date().toISOString(), mainExcluded
    };
  }

  async testCombo(mainId: string, execId: string): Promise<ComboScore> {
    const vram = await this.checkVramCompatibility(mainId, execId);
    if (!vram.compatible) return this.createFailedScore(mainId, execId);

    await this.ensureModelLoaded(mainId, 'dual', execId);
    await intentRouter.configure({ mainModelId: mainId, executorModelId: execId, enableDualModel: true, timeout: 60000, provider: 'lmstudio', settings: { lmstudioUrl: this.config.lmstudioUrl } });

    const results: ComboTestResult[] = [];
    for (const test of COMBO_TEST_CASES) {
      const start = Date.now();
      try {
        const res = await intentRouter.route([{ role: 'system', content: SANDBOX_CONTEXT }, { role: 'user', content: test.prompt }], getBasicTools());
        const mainAction = res.intent?.action || null;
        const mainTool = res.intent?.tool || null;
        const execTools = res.toolCalls?.map(tc => tc.function?.name).filter(Boolean) || [];
        const passed = this.evaluateTestResult(test, mainAction, mainTool, execTools);

        if (!passed) {
          failureLog.logFailure({
            modelId: mainId,
            executorModelId: execId,
            category: 'combo_pairing',
            tool: test.expectedTool || 'unknown',
            error: `Combo test ${test.id} failed. Main: ${mainAction}, Exec: ${execTools.join(', ') || 'none'}`,
            query: test.prompt,
            conversationLength: 2
          });
        }

        results.push({
          testId: test.id, testName: test.name, category: test.category, difficulty: test.difficulty,
          passed,
          mainOutputValid: !!mainAction, mainAction, mainTool, executorCalled: !!execTools.length, executorToolCalls: execTools,
          latencyMs: Date.now() - start, mainLatencyMs: res.latency?.main || 0, executorLatencyMs: res.latency?.executor || 0,
          mainTimedOut: (res.latency?.main || 0) > 10000, executorTimedOut: (res.latency?.executor || 0) > 10000,
          timedOut: (res.latency?.main || 0) > 10000 || (res.latency?.executor || 0) > 10000
        });
      } catch (err: any) {
        results.push({
          testId: test.id, testName: test.name, category: test.category, difficulty: test.difficulty,
          passed: false, mainOutputValid: false, mainAction: null, mainTool: null, executorCalled: false, executorToolCalls: [],
          latencyMs: Date.now() - start, error: err.message, timedOut: true
        });
      }
    }
    return this.calculateComboScore(mainId, execId, results);
  }
}

export type { ComboScore };