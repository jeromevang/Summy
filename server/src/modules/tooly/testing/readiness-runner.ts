/**
 * Readiness Runner
 * 
 * Runs the Agentic Readiness Test Suite on models to assess their
 * capability for agentic coding tasks. Supports single model assessment
 * and batch testing all available models.
 */

import axios from 'axios';
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
import { COMMON_STOP_STRINGS } from '../probes/probe-utils.js';
import { capabilities } from '../capabilities.js';

// ============================================================
// TYPES
// ============================================================

interface RunnerSettings {
  lmstudioUrl: string;
  openaiApiKey?: string;
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
    status: 'running' | 'completed';
    score: number;
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
   */
  async assessModel(
    modelId: string,
    provider: 'lmstudio' | 'openai' | 'azure' = 'lmstudio'
  ): Promise<ReadinessResult> {
    const startTime = Date.now();
    const testResults: ReadinessResult['testResults'] = [];
    const suite = getAgenticReadinessSuite();
    
    console.log(`[ReadinessRunner] Starting assessment for ${modelId}, ${suite.length} tests`);

    // Broadcast start
    this.broadcast?.broadcastReadinessProgress({
      modelId,
      current: 0,
      total: suite.length,
      currentTest: 'Starting...',
      status: 'running',
      score: 0
    });

    console.log(`[ReadinessRunner] Assessment started for ${modelId}`);

    console.log(`[ReadinessRunner] Starting test loop with ${suite.length} tests`);

    for (let i = 0; i < suite.length; i++) {
      const test = suite[i];
      console.log(`[ReadinessRunner] About to run test ${i + 1}/${suite.length}: ${test.id} - ${test.name}`);

      const result = await this.runSingleTest(test, modelId, provider);
      testResults.push(result);

      // Broadcast progress after test completion
      const currentScore = this.calculateRunningScore(testResults);
      console.log(`[ReadinessRunner] Test ${i + 1}/${suite.length} completed: ${test.name} - Result: ${result.passed ? 'PASS' : 'FAIL'} - Running score: ${currentScore}`);

      this.broadcast?.broadcastReadinessProgress({
        modelId,
        current: i + 1,
        total: suite.length,
        currentTest: test.name,
        status: 'running',
        score: currentScore
      });
    }

    console.log(`[ReadinessRunner] Test loop completed, ${testResults.length} results`);

    // Calculate category scores
    const categoryScores = {
      tool: calculateCategoryScore(testResults, 'tool'),
      rag: calculateCategoryScore(testResults, 'rag'),
      reasoning: calculateCategoryScore(testResults, 'reasoning'),
      intent: calculateCategoryScore(testResults, 'intent'),
      browser: calculateCategoryScore(testResults, 'browser'),
    };

    const overallScore = calculateOverallScore(categoryScores);
    const passed = isPassing(overallScore);
    const failedTests = testResults
      .filter(r => !r.passed)
      .map(r => r.testId);

    // Load trainability scores from profile if available
    let trainabilityScores;
    try {
      const profile = await capabilities.getProfile(modelId);
      console.log(`[ReadinessRunner] Loading profile for ${modelId}:`, !!profile);
      if (profile && (profile as any).trainabilityScores) {
        trainabilityScores = (profile as any).trainabilityScores;
        console.log(`[ReadinessRunner] Found trainability scores for ${modelId}:`, trainabilityScores);
      } else {
        console.log(`[ReadinessRunner] No trainability scores found for ${modelId}`);
      }
    } catch (error: any) {
      console.warn(`[ReadinessRunner] Could not load trainability scores for ${modelId}:`, error?.message);
    }

    const result: ReadinessResult = {
      modelId,
      assessedAt: new Date().toISOString(),
      overallScore,
      passed,
      categoryScores,
      testResults,
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
      score: overallScore
    });

    return result;
  }

  /**
   * Assess ALL available models and return ranked leaderboard
   */
  async assessAllModels(
    modelIds: string[],
    provider: 'lmstudio' | 'openai' | 'azure' = 'lmstudio'
  ): Promise<BatchReadinessResult> {
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

      // Broadcast current model being tested
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
        const result = await this.assessModel(modelId, provider);
        results.push(result);
      } catch (error: any) {
        // Log error but continue with other models
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
    }

    // Build leaderboard (sorted by score descending)
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

    // Broadcast batch completion
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
   * Run a single test from the suite
   */
  private async runSingleTest(
    test: AgenticReadinessTest,
    modelId: string,
    provider: 'lmstudio' | 'openai' | 'azure'
  ): Promise<ReadinessResult['testResults'][0]> {
    console.log(`[ReadinessRunner] runSingleTest: ${test.id} - ${test.name}`);
    const startTime = Date.now();

    try {
      // Build messages
      const messages = [
        { 
          role: 'system', 
          content: 'You are a helpful coding assistant with access to various tools. Use tools when appropriate to complete tasks.' 
        },
        { role: 'user', content: test.prompt }
      ];

      // Get all relevant tool schemas for this test
      const toolNames = this.getRelevantTools(test);
      const tools = getToolSchemas(toolNames);

      // Call LLM
      const response = await this.callLLM(modelId, provider, messages, tools);
      const latency = Date.now() - startTime;

      // Extract tool calls from response
      const toolCalls = response?.choices?.[0]?.message?.tool_calls || [];
      const textResponse = response?.choices?.[0]?.message?.content || '';

      // Evaluate using test's evaluate function
      const evaluation = test.evaluate(textResponse, toolCalls);

      const result = {
        testId: test.id,
        testName: test.name,
        category: test.category,
        passed: evaluation.passed,
        score: evaluation.score,
        details: evaluation.details,
        latency
      };

      console.log(`[ReadinessRunner] Test ${test.id} completed: passed=${evaluation.passed}, score=${evaluation.score}`);
      return result;
    } catch (error: any) {
      console.log(`[ReadinessRunner] Test ${test.id} failed with error: ${error.message}`);
      return {
        testId: test.id,
        testName: test.name,
        category: test.category,
        passed: false,
        score: 0,
        details: `Error: ${error.message}`,
        latency: Date.now() - startTime
      };
    }
  }

  /**
   * Get relevant tool names for a test
   */
  private getRelevantTools(test: AgenticReadinessTest): string[] {
    // Base set of tools that should be available for all tests
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
   * Call LLM endpoint
   */
  private async callLLM(
    modelId: string,
    provider: string,
    messages: any[],
    tools: any[]
  ): Promise<any> {
    let url = '';
    const headers: any = { 'Content-Type': 'application/json' };
    const body: any = { 
      messages, 
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 ? 'auto' : undefined,
      temperature: 0, 
      max_tokens: 1000 
    };

    if (provider === 'lmstudio') {
      url = `${this.settings.lmstudioUrl}/v1/chat/completions`;
      body.model = modelId;
      body.stop = COMMON_STOP_STRINGS;
    } else if (provider === 'openai') {
      url = 'https://api.openai.com/v1/chat/completions';
      headers['Authorization'] = `Bearer ${this.settings.openaiApiKey}`;
      body.model = modelId;
    } else if (provider === 'azure') {
      const { azureResourceName, azureDeploymentName, azureApiKey, azureApiVersion } = this.settings;
      url = `https://${azureResourceName}.openai.azure.com/openai/deployments/${azureDeploymentName}/chat/completions?api-version=${azureApiVersion || '2024-02-01'}`;
      headers['api-key'] = azureApiKey;
    }

    const response = await axios.post(url, body, { headers, timeout: 120000 });
    return response.data;
  }

  /**
   * Calculate running score from completed tests
   */
  private calculateRunningScore(results: ReadinessResult['testResults']): number {
    if (results.length === 0) return 0;
    const totalScore = results.reduce((sum, r) => sum + r.score, 0);
    return Math.round((totalScore / results.length) * 100);
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

