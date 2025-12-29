/**
 * Readiness Runner
 * 
 * Runs the Agentic Readiness Test Suite on models to assess their
 * capability for agentic coding tasks. 
 * 
 * CRITICAL: Uses intentRouter.route() to test through the REAL production flow,
 * not direct LLM calls. This ensures tests validate actual behavior.
 */

import {
  getAgenticReadinessSuite,
  getReadinessConfig,
  calculateCategoryScore,
  calculateOverallScore,
  isPassing,
  type AgenticReadinessTest,
  type ReadinessResult,
  type BatchReadinessResult
} from './agentic-readiness-suite.js';
import { getToolSchemas } from '../tool-prompts.js';
import { capabilities } from '../capabilities.js';
import { intentRouter, type RoutingResult } from '../intent-router.js';
import { executeAgenticLoop } from '../cognitive-engine.js';

// ============================================================
// SANDBOX CONTEXT (Same as combo-tester for consistency)
// ============================================================

export const SANDBOX_CONTEXT = `You are a coding assistant working on a test project.

PROJECT LOCATION: server/data/test-project/

PROJECT STRUCTURE:
- node-api/          Express API with authentication
  - src/index.ts     Main entry point
  - src/middleware/auth.middleware.ts   JWT validation
  - src/services/auth.service.ts        User auth logic
  - src/routes/users.ts, products.ts    API routes
- react-web/         React frontend
  - src/context/AuthContext.tsx         Auth state provider
  - src/hooks/useAuth.ts                Auth hook
  - src/components/LoginForm.tsx        Login UI
- java-service/      Spring-style Java backend
- shared-utils/      Shared utilities (validation, formatting)
- react-native-app/  Mobile app
- mendix-widget/     Mendix widget development

Use the tools available to complete tasks. Always use rag_query first when exploring unfamiliar code.`;

// ============================================================
// TYPES
// ============================================================

interface RunnerSettings {
  lmstudioUrl: string;
  openaiApiKey?: string;
  openrouterApiKey?: string;
  azureResourceName?: string;
  azureDeploymentName?: string;
  azureApiKey?: string;
  azureApiVersion?: string;
}

interface BroadcastFn {
  broadcastReadinessProgress(data: {
    modelId: string;
    current: number;
    total: number;
    currentTest: string;
    currentCategory?: string;
    status: 'running' | 'completed';
    score: number;
    passed?: boolean;
    // NEW: Detailed phase info for dual-model visibility
    phase?: 'qualifying' | 'discovery';
    mode?: 'single' | 'dual';
    attribution?: 'main' | 'executor' | 'both' | null;
  }): void;
  broadcastBatchReadinessProgress(data: {
    currentModel: string | null;
    currentModelIndex: number;
    totalModels: number;
    status: 'running' | 'completed';
    results: Array<{
      modelId: string;
      score: number;
      certified: boolean;
    }>;
    bestModel?: string;
  }): void;
}

interface TestRunResult {
  testId: string;
  testName: string;
  category: string;
  passed: boolean;
  score: number;
  details: string;
  latency: number;
  // NEW: Production flow metrics
  mode?: 'single' | 'dual';
  mainLatency?: number;
  executorLatency?: number;
  toolsExecuted?: string[];
  iterations?: number;
  attribution?: 'main' | 'executor' | 'both' | null;
}

// ============================================================
// READINESS RUNNER CLASS
// ============================================================

export class ReadinessRunner {
  private settings: RunnerSettings;
  private broadcast?: BroadcastFn;

  constructor(settings: RunnerSettings, broadcast?: BroadcastFn) {
    this.settings = settings;
    this.broadcast = broadcast;
  }

  /**
   * Assess a single model against the Agentic Readiness Test Suite
   * Uses the REAL production flow via intentRouter.route()
   */
  async assessModel(
    modelId: string,
    options: {
      provider?: 'lmstudio' | 'openai' | 'azure';
      executorModelId?: string; // For dual-model testing
      runCount?: number; // For flakiness detection (default 1, max 3)
    } = {}
  ): Promise<ReadinessResult> {
    const {
      provider = 'lmstudio',
      executorModelId,
      runCount = 1
    } = options;
    
    const startTime = Date.now();
    const testResults: TestRunResult[] = [];
    const suite = getAgenticReadinessSuite();
    const isDualMode = !!executorModelId;
    
    console.log(`[ReadinessRunner] Starting assessment for ${modelId}${isDualMode ? ` + ${executorModelId}` : ''}, ${suite.length} tests, ${runCount}x runs`);

    // Configure intent router for this assessment
    await this.configureRouter(modelId, executorModelId, provider);

    // Broadcast start
    this.broadcast?.broadcastReadinessProgress({
      modelId,
      current: 0,
      total: suite.length,
      currentTest: 'Starting...',
      status: 'running',
      score: 0,
      mode: isDualMode ? 'dual' : 'single',
      phase: 'qualifying'
    });

    // Determine qualifying gate count (first N tests)
    const qualifyingGateCount = (getReadinessConfig() as any).qualifyingGateCount || 5;
    let qualifyingGatePassed = true;
    let disqualifiedAt: string | null = null;

    // Run each test (with optional multiple runs for flakiness detection)
    for (let i = 0; i < suite.length; i++) {
      const test = suite[i];
      const isQualifyingTest = i < qualifyingGateCount;
      
      console.log(`[ReadinessRunner] Test ${i + 1}/${suite.length}: ${test.id} - ${test.name}${isQualifyingTest ? ' [QUALIFYING]' : ''}`);

      // Run test multiple times if requested (but only once for qualifying gate - speed)
      const effectiveRunCount = isQualifyingTest ? 1 : Math.min(runCount, 3);
      const runs: TestRunResult[] = [];
      for (let run = 0; run < effectiveRunCount; run++) {
        const result = await this.runSingleTest(test, modelId, isDualMode);
        runs.push(result);
      }

      // Aggregate results (use best score, track consistency)
      const bestResult = runs.reduce((best, r) => r.score > best.score ? r : best, runs[0]);
      const consistency = runs.filter(r => r.passed === bestResult.passed).length / runs.length;
      
      // Add consistency info to details if running multiple times
      if (effectiveRunCount > 1) {
        bestResult.details += ` | Consistency: ${Math.round(consistency * 100)}% (${runs.filter(r => r.passed).length}/${runs.length} passed)`;
      }

      testResults.push(bestResult);

      // Check qualifying gate failure - FAST FAIL
      if (isQualifyingTest && !bestResult.passed) {
        qualifyingGatePassed = false;
        disqualifiedAt = test.name;
        console.log(`[ReadinessRunner] ❌ DISQUALIFIED at ${test.name} - stopping early`);

        this.broadcast?.broadcastReadinessProgress({
          modelId,
          current: i + 1,
          total: suite.length,
          currentTest: `DISQUALIFIED: ${test.name}`,
          currentCategory: test.category,
          status: 'completed',
          score: 0,
          passed: false,
          mode: isDualMode ? 'dual' : 'single',
          phase: 'qualifying',
          attribution: bestResult.attribution
        });

        // Fast fail - stop testing
        break;
      }

      // Broadcast progress
      const currentScore = this.calculateRunningScore(testResults);

      this.broadcast?.broadcastReadinessProgress({
        modelId,
        current: i + 1,
        total: suite.length,
        currentTest: test.name,
        currentCategory: test.category,
        status: 'running',
        score: currentScore,
        passed: bestResult.passed,
        mode: isDualMode ? 'dual' : 'single',
        phase: isQualifyingTest ? 'qualifying' : 'discovery',
        attribution: bestResult.attribution
      });

      console.log(`[ReadinessRunner] Test ${i + 1}/${suite.length}: ${bestResult.passed ? 'PASS' : 'FAIL'} (${bestResult.score}%) - ${test.name}`);
    }

    // Calculate category scores (excluding qualifying tests from scoring)
    const nonQualifyingResults = testResults.filter((_, i) => i >= qualifyingGateCount);
    const categoryScores = {
      tool: calculateCategoryScore(nonQualifyingResults as any, 'tool'),
      rag: calculateCategoryScore(nonQualifyingResults as any, 'rag'),
      reasoning: calculateCategoryScore(nonQualifyingResults as any, 'reasoning'),
      intent: calculateCategoryScore(nonQualifyingResults as any, 'intent'),
      browser: calculateCategoryScore(nonQualifyingResults as any, 'browser'),
      multi_turn: calculateCategoryScore(nonQualifyingResults as any, 'multi_turn'),
      boundary: calculateCategoryScore(nonQualifyingResults as any, 'boundary'),
    };

    // If disqualified, score is 0
    const overallScore = qualifyingGatePassed ? calculateOverallScore(categoryScores) : 0;
    const passed = qualifyingGatePassed && isPassing(overallScore);
    const failedTests = testResults
      .filter(r => !r.passed)
      .map(r => r.testId);
    
    // Log qualifying gate result
    if (!qualifyingGatePassed) {
      console.log(`[ReadinessRunner] Model ${modelId} DISQUALIFIED at: ${disqualifiedAt}`);
    } else {
      console.log(`[ReadinessRunner] Model ${modelId} passed qualifying gate, score: ${overallScore}%`);
    }

    // Load trainability scores from profile if available
    let trainabilityScores;
    try {
      const profile = await capabilities.getProfile(modelId);
      if (profile && (profile as any).trainabilityScores) {
        trainabilityScores = (profile as any).trainabilityScores;
      }
    } catch (error: any) {
      console.warn(`[ReadinessRunner] Could not load trainability scores: ${error?.message}`);
    }

    const result: ReadinessResult & { qualifyingGatePassed: boolean; disqualifiedAt: string | null } = {
      modelId,
      assessedAt: new Date().toISOString(),
      overallScore,
      passed,
      qualifyingGatePassed,
      disqualifiedAt,
      categoryScores,
      testResults: testResults as any,
      failedTests,
      duration: Date.now() - startTime,
      trainabilityScores,
    };

    // Broadcast completion
    this.broadcast?.broadcastReadinessProgress({
      modelId,
      current: suite.length,
      total: suite.length,
      currentTest: 'Completed',
      status: 'completed',
      score: overallScore,
      mode: isDualMode ? 'dual' : 'single'
    });

    return result;
  }

  /**
   * Configure the intent router for testing
   */
  private async configureRouter(
    mainModelId: string,
    executorModelId: string | undefined,
    provider: 'lmstudio' | 'openai' | 'azure'
  ): Promise<void> {
    const isDualMode = !!executorModelId;

    await intentRouter.configure({
      mainModelId,
      executorModelId: executorModelId || mainModelId,
      enableDualModel: isDualMode,
      timeout: 60000, // 60s for tests
      provider,
      settings: {
        lmstudioUrl: this.settings.lmstudioUrl,
        openaiApiKey: this.settings.openaiApiKey,
        openrouterApiKey: this.settings.openrouterApiKey,
        azureResourceName: this.settings.azureResourceName,
        azureApiKey: this.settings.azureApiKey,
        azureDeploymentName: this.settings.azureDeploymentName,
        azureApiVersion: this.settings.azureApiVersion,
      }
    });

    console.log(`[ReadinessRunner] Configured router: ${isDualMode ? 'dual' : 'single'} mode, openrouterApiKey: ${this.settings.openrouterApiKey ? 'SET' : 'NOT SET'}`);
  }

  /**
   * Run a single test using the REAL production flow
   */
  private async runSingleTest(
    test: AgenticReadinessTest,
    modelId: string,
    isDualMode: boolean
  ): Promise<TestRunResult> {
    const startTime = Date.now();

    try {
      // Check if this is a multi-turn test
      if (test.isMultiTurn && test.turns && test.turns.length > 0) {
        return await this.runMultiTurnTest(test, modelId, isDualMode, startTime);
      }

      // Build messages with sandbox context
      const messages = [
        { role: 'system', content: SANDBOX_CONTEXT },
        { role: 'user', content: test.prompt }
      ];

      // Get tool schemas for this test
      const toolNames = this.getRelevantTools(test);
      const tools = getToolSchemas(toolNames);

      // Route through the REAL production flow
      const routingResult = await intentRouter.route(messages, tools);

      const latency = Date.now() - startTime;

      // Extract tool calls from the routing result
      const toolCalls = routingResult.toolCalls || [];
      const textResponse = routingResult.finalResponse?.choices?.[0]?.message?.content || '';

      // Evaluate using test's evaluate function
      const evaluation = test.evaluate(textResponse, toolCalls);

      // Determine attribution if test failed in dual mode
      let attribution: 'main' | 'executor' | 'both' | null = null;
      if (!evaluation.passed && isDualMode) {
        attribution = this.determineAttribution(test, routingResult, toolCalls);
      }

      return {
        testId: test.id,
        testName: test.name,
        category: test.category,
        passed: evaluation.passed,
        score: evaluation.score,
        details: evaluation.details,
        latency,
        mode: routingResult.mode,
        mainLatency: routingResult.latency.main,
        executorLatency: routingResult.latency.executor,
        toolsExecuted: toolCalls.map((tc: any) => tc.function?.name).filter(Boolean),
        attribution
      };
    } catch (error: any) {
      console.error(`[ReadinessRunner] Test ${test.id} error:`, error.message);
      return {
        testId: test.id,
        testName: test.name,
        category: test.category,
        passed: false,
        score: 0,
        details: `Error: ${error.message}`,
        latency: Date.now() - startTime,
        mode: isDualMode ? 'dual' : 'single',
        attribution: null
      };
    }
  }

  /**
   * Run a multi-turn conversation test
   */
  private async runMultiTurnTest(
    test: AgenticReadinessTest,
    modelId: string,
    isDualMode: boolean,
    startTime: number
  ): Promise<TestRunResult> {
    const conversationHistory: any[] = [];
    const allToolCalls: any[] = [];
    let lastResponse = '';
    let lastRoutingResult: RoutingResult | null = null;

    try {
      const toolNames = this.getRelevantTools(test);
      const tools = getToolSchemas(toolNames);

      // Process each turn in the conversation
      for (let i = 0; i < test.turns!.length; i++) {
        const turn = test.turns![i];
        
        // Build messages including conversation history
        const messages = [
          { role: 'system', content: SANDBOX_CONTEXT },
          ...conversationHistory,
          { role: turn.role, content: turn.content }
        ];

        console.log(`[ReadinessRunner] Multi-turn ${test.id} - Turn ${i + 1}/${test.turns!.length}: "${turn.content.substring(0, 50)}..."`);

        // Route through production flow
        const routingResult = await intentRouter.route(messages, tools);
        lastRoutingResult = routingResult;

        // Extract response and tool calls
        const response = routingResult.finalResponse?.choices?.[0]?.message?.content || '';
        const turnToolCalls = routingResult.toolCalls || [];

        // Add to conversation history
        conversationHistory.push({ role: turn.role, content: turn.content });
        if (response) {
          conversationHistory.push({ role: 'assistant', content: response });
        }

        // Track all tool calls
        allToolCalls.push(...turnToolCalls);
        lastResponse = response;
      }

      const latency = Date.now() - startTime;

      // Evaluate using test's evaluate function with conversation history
      const evaluation = test.evaluate(lastResponse, allToolCalls, conversationHistory);

      // Determine attribution if test failed in dual mode
      let attribution: 'main' | 'executor' | 'both' | null = null;
      if (!evaluation.passed && isDualMode && lastRoutingResult) {
        attribution = this.determineAttribution(test, lastRoutingResult, allToolCalls);
      }

      return {
        testId: test.id,
        testName: test.name,
        category: test.category,
        passed: evaluation.passed,
        score: evaluation.score,
        details: evaluation.details + ` (${test.turns!.length} turns)`,
        latency,
        mode: lastRoutingResult?.mode || (isDualMode ? 'dual' : 'single'),
        mainLatency: lastRoutingResult?.latency.main,
        executorLatency: lastRoutingResult?.latency.executor,
        toolsExecuted: allToolCalls.map((tc: any) => tc.function?.name).filter(Boolean),
        iterations: test.turns!.length,
        attribution
      };
    } catch (error: any) {
      console.error(`[ReadinessRunner] Multi-turn test ${test.id} error:`, error.message);
      return {
        testId: test.id,
        testName: test.name,
        category: test.category,
        passed: false,
        score: 0,
        details: `Multi-turn error: ${error.message}`,
        latency: Date.now() - startTime,
        mode: isDualMode ? 'dual' : 'single',
        attribution: null
      };
    }
  }

  /**
   * Determine which model caused a failure in dual-model mode
   */
  private determineAttribution(
    test: AgenticReadinessTest,
    result: RoutingResult,
    toolCalls: any[]
  ): 'main' | 'executor' | 'both' | null {
    if (result.mode !== 'dual') return null;

    const intent = result.intent;
    const expectedTool = test.expectedTool;
    const expectedNoTool = test.expectedNoTool;

    // Check if main model got the intent right
    if (expectedTool) {
      // Main should have identified this as a tool call
      if (intent?.action !== 'call_tool' || intent?.tool !== expectedTool) {
        return 'main'; // Main got the intent wrong
      }
      // Main was right, check if executor executed correctly
      const executedTools = toolCalls.map((tc: any) => tc.function?.name);
      if (!executedTools.includes(expectedTool)) {
        return 'executor'; // Executor failed to execute the right tool
      }
    }

    if (expectedNoTool) {
      // Should NOT have called a tool
      if (intent?.action === 'call_tool') {
        return 'main'; // Main incorrectly decided to call a tool
      }
      if (toolCalls.length > 0) {
        return 'executor'; // Executor called a tool anyway
      }
    }

    // Can't determine - both may have contributed
    return 'both';
  }

  /**
   * Get relevant tool names for a test
   */
  private getRelevantTools(test: AgenticReadinessTest): string[] {
    // Base set of tools for all tests
    const baseTools = [
      'read_file', 'write_file', 'edit_file',
      'search_files', 'list_directory',
      'rag_query', 'rag_status',
      'web_search', 'browser_navigate', 'browser_fetch_content', 
      'browser_click', 'browser_snapshot',
      'shell_exec', 'git_status'
    ];

    // Add expected tools
    if (test.expectedTool && !baseTools.includes(test.expectedTool)) {
      baseTools.push(test.expectedTool);
    }
    if (test.expectedToolAny) {
      for (const tool of test.expectedToolAny) {
        if (!baseTools.includes(tool)) {
          baseTools.push(tool);
        }
      }
    }

    return baseTools;
  }

  /**
   * Unload models after assessment to free VRAM
   */
  private async unloadModelsAfterAssessment(): Promise<void> {
    try {
      // Get the LM Studio client and unload models
      const { LMStudioClient } = await import('@lmstudio/sdk');
      const client = new LMStudioClient();

      // List loaded models
      const loadedModels = await client.models.listLoaded();

      if (loadedModels.length > 0) {
        console.log(`[ReadinessRunner] Found ${loadedModels.length} loaded models to unload`);

        // Unload each loaded model
        for (const model of loadedModels) {
          try {
            console.log(`[ReadinessRunner] Unloading model: ${model.identifier}`);
            await client.models.unload(model.identifier);
          } catch (unloadError: any) {
            console.warn(`[ReadinessRunner] Failed to unload ${model.identifier}:`, unloadError.message);
          }
        }

        console.log('[ReadinessRunner] Model unloading completed');
      } else {
        console.log('[ReadinessRunner] No loaded models found to unload');
      }
    } catch (error: any) {
      console.error('[ReadinessRunner] Error during model unloading:', error.message);
      // Don't throw - unloading failure shouldn't break the assessment process
    }
  }

  /**
   * Assess ALL available models and return ranked leaderboard
   */
  async assessAllModels(
    modelIds: string[],
    options: {
      provider?: 'lmstudio' | 'openai' | 'azure';
      runCount?: number;
    } = {}
  ): Promise<BatchReadinessResult> {
    const { provider = 'lmstudio', runCount = 1 } = options;
    const startedAt = new Date().toISOString();
    const results: ReadinessResult[] = [];

    // Broadcast batch start
    this.broadcast?.broadcastBatchReadinessProgress({
      currentModel: null,
      currentModelIndex: 0,
      totalModels: modelIds.length,
      status: 'running',
      results: []
    });

    for (let i = 0; i < modelIds.length; i++) {
      const modelId = modelIds[i];

      // Broadcast current model
      this.broadcast?.broadcastBatchReadinessProgress({
        currentModel: modelId,
        currentModelIndex: i + 1,
        totalModels: modelIds.length,
        status: 'running',
        results: results.map(r => ({
          modelId: r.modelId,
          score: r.overallScore,
          certified: r.passed
        }))
      });

      try {
        const result = await this.assessModel(modelId, { provider, runCount });
        results.push(result);
      } catch (error: any) {
        console.error(`[ReadinessRunner] Error assessing ${modelId}:`, error.message);
        results.push({
          modelId,
          assessedAt: new Date().toISOString(),
          overallScore: 0,
          passed: false,
          categoryScores: { tool: 0, rag: 0, reasoning: 0, intent: 0, browser: 0 },
          testResults: [],
          failedTests: [],
          duration: 0,
        });
      }

      // Unload models after each assessment to free VRAM
      try {
        console.log(`[ReadinessRunner] Unloading models after assessing ${modelId}`);
        await this.unloadModelsAfterAssessment();
      } catch (unloadError: any) {
        console.warn(`[ReadinessRunner] Failed to unload models after ${modelId}:`, unloadError.message);
      }
    }

    // Build leaderboard
    const leaderboard = results
      .map((r, index) => ({
        rank: index + 1,
        modelId: r.modelId,
        score: r.overallScore,
        certified: r.passed
      }))
      .sort((a, b) => b.score - a.score)
      .map((entry, index) => ({ ...entry, rank: index + 1 }));

    const completedAt = new Date().toISOString();
    const bestModel = leaderboard.length > 0 && leaderboard[0].score > 0 
      ? leaderboard[0].modelId 
      : null;

    // Broadcast completion
    this.broadcast?.broadcastBatchReadinessProgress({
      currentModel: null,
      currentModelIndex: modelIds.length,
      totalModels: modelIds.length,
      status: 'completed',
      results: leaderboard,
      bestModel: bestModel || undefined
    });

    return {
      startedAt,
      completedAt,
      results,
      leaderboard,
      bestModel
    };
  }

  /**
   * Calculate running score from completed tests
   */
  private calculateRunningScore(results: TestRunResult[]): number {
    if (results.length === 0) return 0;
    const totalScore = results.reduce((sum, r) => sum + r.score, 0);
    return Math.round((totalScore / results.length) * 100) / 100;
  }
}

// ============================================================
// SINGLETON FACTORY
// ============================================================

let runnerInstance: ReadinessRunner | null = null;

export function createReadinessRunner(
  settings: RunnerSettings,
  broadcast?: BroadcastFn
): ReadinessRunner {
  runnerInstance = new ReadinessRunner(settings, broadcast);
  return runnerInstance;
}

export function getReadinessRunner(): ReadinessRunner | null {
  return runnerInstance;
}
