/**
 * Smoke Tester
 * Quick 8-test native capability assessment for the self-improving system.
 * 
 * Purpose:
 * - Run in ~30 seconds before deployment
 * - Identify native capabilities (works without prosthetic)
 * - Test trainability (does Level 1 prosthetic help?)
 * - Output capability map for routing decisions
 */

import axios from 'axios';
import { capabilities, type CapabilityStatus } from '../capabilities.js';
import { prostheticStore, buildProstheticPrompt } from '../learning/prosthetic-store.js';
import { wsBroadcast } from '../../../services/ws-broadcast.js';
import { modelManager } from '../../../services/lmstudio-model-manager.js';

// ============================================================
// TYPES
// ============================================================

export interface SmokeTestCase {
  id: string;
  name: string;
  category: 'tool' | 'rag' | 'reasoning' | 'intent' | 'browser' | 'multi_step' | 'param_extraction' | 'format';
  prompt: string;
  expectedTool?: string;
  expectedNoTool?: boolean;
  evaluate: (response: any, toolCalls: any[]) => { passed: boolean; score: number; details: string };
}

export interface SmokeTestResult {
  testId: string;
  testName: string;
  category: string;
  
  // Native test (no prosthetic)
  nativePassed: boolean;
  nativeScore: number;
  nativeLatencyMs: number;
  
  // Trained test (with Level 1 prosthetic) - only if native failed
  trainedPassed?: boolean;
  trainedScore?: number;
  trainedLatencyMs?: number;
  
  // Derived status
  trainable: boolean | null;  // true = improved with prosthetic, false = no improvement, null = native passed
  details: string;
}

export interface SmokeTestSummary {
  modelId: string;
  testedAt: string;
  durationMs: number;
  
  // Overall
  passed: boolean;            // >= 6/8 tests passed (native or trained)
  overallScore: number;       // 0-100
  
  // Capability breakdown
  nativeCapabilities: string[];     // Categories that work natively
  trainableCapabilities: string[];  // Categories that improved with prosthetic
  blockedCapabilities: string[];    // Categories that didn't improve
  
  // Per-category scores
  categoryScores: Record<string, { native: number; trained: number | null; trainable: boolean | null }>;
  
  // Individual results
  results: SmokeTestResult[];
  
  // Recommendation
  recommendation: 'deploy' | 'deploy_with_prosthetic' | 'needs_controller' | 'blocked';
  recommendationReason: string;
}

// ============================================================
// SMOKE TEST DEFINITIONS (8 Core Tests)
// ============================================================

const SMOKE_TESTS: SmokeTestCase[] = [
  // 1. RAG Usage
  {
    id: 'smoke_rag',
    name: 'RAG Query Before Read',
    category: 'rag',
    prompt: 'I want to understand how authentication works in this codebase. Can you help me find the relevant code?',
    expectedTool: 'rag_query',
    evaluate: (response, toolCalls) => {
      const usedRag = toolCalls.some(tc => 
        tc.function?.name === 'rag_query' || tc.name === 'rag_query'
      );
      if (usedRag) {
        return { passed: true, score: 100, details: 'Correctly used rag_query to explore codebase' };
      }
      const usedReadFile = toolCalls.some(tc => 
        tc.function?.name === 'read_file' || tc.name === 'read_file'
      );
      if (usedReadFile) {
        return { passed: false, score: 30, details: 'Used read_file directly instead of RAG first' };
      }
      return { passed: false, score: 0, details: 'No tool called - should use rag_query' };
    }
  },

  // 2. Tool Selection
  {
    id: 'smoke_tool_select',
    name: 'Correct Tool Selection',
    category: 'tool',
    prompt: 'Read the contents of the file at src/index.ts',
    expectedTool: 'read_file',
    evaluate: (response, toolCalls) => {
      const usedReadFile = toolCalls.some(tc => {
        const name = tc.function?.name || tc.name;
        return name === 'read_file';
      });
      if (usedReadFile) {
        const call = toolCalls.find(tc => (tc.function?.name || tc.name) === 'read_file');
        const args = typeof call?.function?.arguments === 'string' 
          ? JSON.parse(call.function.arguments) 
          : call?.arguments || call?.function?.arguments;
        if (args?.path?.includes('index.ts') || args?.path?.includes('src')) {
          return { passed: true, score: 100, details: 'Correctly used read_file with proper path' };
        }
        return { passed: true, score: 80, details: 'Used read_file but path may be incomplete' };
      }
      return { passed: false, score: 0, details: 'Did not use read_file' };
    }
  },

  // 3. Intent Recognition - No Tool
  {
    id: 'smoke_intent_no_tool',
    name: 'Knowledge Question (No Tool)',
    category: 'intent',
    prompt: 'What is the difference between let and const in JavaScript?',
    expectedNoTool: true,
    evaluate: (response, toolCalls) => {
      if (toolCalls.length === 0) {
        // Check if response contains useful content
        const content = response?.content?.toLowerCase() || '';
        if (content.includes('const') && content.includes('let')) {
          return { passed: true, score: 100, details: 'Correctly answered without tools' };
        }
        return { passed: true, score: 80, details: 'No tool called (correct), but response may be incomplete' };
      }
      return { passed: false, score: 0, details: `Unnecessarily called ${toolCalls.length} tool(s)` };
    }
  },

  // 4. Multi-Step Reasoning
  {
    id: 'smoke_multi_step',
    name: 'Multi-Step Task',
    category: 'multi_step',
    prompt: 'Find all TypeScript files that import React, then count how many there are.',
    evaluate: (response, toolCalls) => {
      // Should use search_files or rag_query
      const usedSearch = toolCalls.some(tc => {
        const name = tc.function?.name || tc.name;
        return ['search_files', 'rag_query', 'list_directory'].includes(name);
      });
      if (usedSearch) {
        return { passed: true, score: 100, details: 'Used search/query tools for multi-step task' };
      }
      const usedAnyTool = toolCalls.length > 0;
      if (usedAnyTool) {
        return { passed: true, score: 60, details: 'Used tools but may not be optimal approach' };
      }
      return { passed: false, score: 0, details: 'No tools used for task requiring file search' };
    }
  },

  // 5. Parameter Extraction
  {
    id: 'smoke_params',
    name: 'Parameter Extraction',
    category: 'param_extraction',
    prompt: 'Write "Hello, World!" to a file named greeting.txt in the output folder.',
    expectedTool: 'write_file',
    evaluate: (response, toolCalls) => {
      const writeCall = toolCalls.find(tc => {
        const name = tc.function?.name || tc.name;
        return name === 'write_file';
      });
      if (!writeCall) {
        return { passed: false, score: 0, details: 'Did not use write_file' };
      }
      const args = typeof writeCall?.function?.arguments === 'string'
        ? JSON.parse(writeCall.function.arguments)
        : writeCall?.arguments || writeCall?.function?.arguments;
      
      const hasPath = args?.path?.includes('greeting.txt') || args?.path?.includes('output');
      const hasContent = args?.content?.includes('Hello');
      
      if (hasPath && hasContent) {
        return { passed: true, score: 100, details: 'Correct path and content extracted' };
      }
      if (hasPath || hasContent) {
        return { passed: true, score: 70, details: 'Partial parameter extraction' };
      }
      return { passed: false, score: 30, details: 'Parameters not extracted correctly' };
    }
  },

  // 6. Format Compliance
  {
    id: 'smoke_format',
    name: 'Tool Call Format',
    category: 'format',
    prompt: 'Get the git status of the current repository.',
    expectedTool: 'git_status',
    evaluate: (response, toolCalls) => {
      const gitCall = toolCalls.find(tc => {
        const name = tc.function?.name || tc.name;
        return name === 'git_status';
      });
      if (gitCall) {
        // Check format is valid
        if (gitCall.function?.name || gitCall.name) {
          return { passed: true, score: 100, details: 'Correct tool call format' };
        }
      }
      // Check for any git tool
      const anyGit = toolCalls.some(tc => {
        const name = tc.function?.name || tc.name;
        return name?.startsWith('git');
      });
      if (anyGit) {
        return { passed: true, score: 80, details: 'Used git tool, may not be git_status' };
      }
      return { passed: false, score: 0, details: 'No git_status call found' };
    }
  },

  // 7. Browser Tool
  {
    id: 'smoke_browser',
    name: 'Web Search',
    category: 'browser',
    prompt: 'Search the web for the latest TypeScript 5.0 features.',
    expectedTool: 'web_search',
    evaluate: (response, toolCalls) => {
      const usedWebSearch = toolCalls.some(tc => {
        const name = tc.function?.name || tc.name;
        return name === 'web_search';
      });
      if (usedWebSearch) {
        return { passed: true, score: 100, details: 'Correctly used web_search' };
      }
      const usedBrowser = toolCalls.some(tc => {
        const name = tc.function?.name || tc.name;
        return name?.startsWith('browser') || name === 'http_request';
      });
      if (usedBrowser) {
        return { passed: true, score: 70, details: 'Used browser tool instead of web_search' };
      }
      return { passed: false, score: 0, details: 'No web search tool used' };
    }
  },

  // 8. Reasoning - Conditional
  {
    id: 'smoke_reasoning',
    name: 'Conditional Reasoning',
    category: 'reasoning',
    prompt: 'If package.json exists, run npm install. Otherwise, tell me the folder is not a Node.js project.',
    evaluate: (response, toolCalls) => {
      // Should first check for package.json
      const checkFile = toolCalls.some(tc => {
        const name = tc.function?.name || tc.name;
        return ['read_file', 'get_file_info', 'list_directory'].includes(name);
      });
      if (checkFile) {
        return { passed: true, score: 100, details: 'Correctly checks file existence first' };
      }
      // If went straight to npm install, partial credit
      const npmCall = toolCalls.some(tc => {
        const name = tc.function?.name || tc.name;
        return name === 'npm_install';
      });
      if (npmCall) {
        return { passed: false, score: 40, details: 'Ran npm install without checking first' };
      }
      return { passed: false, score: 0, details: 'No tools used for conditional check' };
    }
  }
];

// ============================================================
// TOOL DEFINITIONS FOR SMOKE TESTS
// ============================================================

const SMOKE_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'rag_query',
      description: 'Search the codebase using semantic search. Use this FIRST for code understanding.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Natural language search query' },
          topK: { type: 'number', description: 'Number of results' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read contents of a file',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'File path' } },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write content to a file',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
          content: { type: 'string', description: 'Content to write' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_files',
      description: 'Search for files matching a pattern',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          pattern: { type: 'string' }
        },
        required: ['path', 'pattern']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: 'List contents of a directory',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_file_info',
      description: 'Get information about a file',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'git_status',
      description: 'Get git status of repository',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web for information',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'npm_install',
      description: 'Run npm install',
      parameters: {
        type: 'object',
        properties: { cwd: { type: 'string' } },
        required: []
      }
    }
  }
];

// ============================================================
// SMOKE TESTER CLASS
// ============================================================

export class SmokeTester {
  private lmstudioUrl: string;
  private timeout: number;

  constructor(options?: { lmstudioUrl?: string; timeout?: number }) {
    this.lmstudioUrl = options?.lmstudioUrl || 'http://localhost:1234';
    this.timeout = options?.timeout || 15000;
  }

  /**
   * Run smoke tests for a model
   */
  async runSmokeTest(modelId: string, options?: {
    contextSize?: number;
    testTrainability?: boolean;
  }): Promise<SmokeTestSummary> {
    const startTime = Date.now();
    const results: SmokeTestResult[] = [];
    const contextSize = options?.contextSize || 4096;
    const testTrainability = options?.testTrainability ?? true;

    console.log(`[SmokeTester] Starting smoke test for ${modelId}`);
    wsBroadcast.broadcastProgress('probe', modelId, { current: 0, total: SMOKE_TESTS.length, currentTest: 'Starting smoke test...', status: 'running' });

    // Ensure model is loaded
    try {
      await modelManager.ensureLoaded(modelId, contextSize);
    } catch (error: any) {
      console.error(`[SmokeTester] Failed to load model: ${error.message}`);
      throw error;
    }

    // Run each test
    for (let i = 0; i < SMOKE_TESTS.length; i++) {
      const test = SMOKE_TESTS[i];
      wsBroadcast.broadcastProgress('probe', modelId, { current: i + 1, total: SMOKE_TESTS.length, currentTest: test.name, currentCategory: test.category, status: 'running' });

      try {
        const result = await this.runSingleTest(modelId, test, testTrainability);
        results.push(result);
      } catch (error: any) {
        console.error(`[SmokeTester] Test ${test.id} failed: ${error.message}`);
        results.push({
          testId: test.id,
          testName: test.name,
          category: test.category,
          nativePassed: false,
          nativeScore: 0,
          nativeLatencyMs: 0,
          trainable: null,
          details: `Error: ${error.message}`
        });
      }
    }

    // Build summary
    const summary = this.buildSummary(modelId, results, Date.now() - startTime);

    // Save to profile
    await capabilities.updateSmokeTestResults(modelId, {
      passed: summary.passed,
      score: summary.overallScore,
      nativeCapabilities: summary.nativeCapabilities,
      trainableCapabilities: summary.trainableCapabilities,
      blockedCapabilities: summary.blockedCapabilities
    });

    wsBroadcast.broadcastProgress('probe', modelId, { 
      current: SMOKE_TESTS.length, 
      total: SMOKE_TESTS.length, 
      currentTest: `Smoke test complete: ${summary.overallScore}%`,
      score: summary.overallScore,
      status: 'completed' 
    });

    console.log(`[SmokeTester] Completed: score=${summary.overallScore}, recommendation=${summary.recommendation}`);

    return summary;
  }

  /**
   * Run a single test (native, and optionally with prosthetic)
   */
  private async runSingleTest(
    modelId: string,
    test: SmokeTestCase,
    testTrainability: boolean
  ): Promise<SmokeTestResult> {
    // 1. Run native test (no prosthetic)
    const nativeStart = Date.now();
    const nativeResult = await this.callModel(modelId, test.prompt, undefined);
    const nativeLatency = Date.now() - nativeStart;

    const toolCalls = nativeResult.message?.tool_calls || [];
    const nativeEval = test.evaluate(nativeResult.message, toolCalls);

    const result: SmokeTestResult = {
      testId: test.id,
      testName: test.name,
      category: test.category,
      nativePassed: nativeEval.passed,
      nativeScore: nativeEval.score,
      nativeLatencyMs: nativeLatency,
      trainable: null,
      details: nativeEval.details
    };

    // 2. If native failed and testTrainability is enabled, try with prosthetic
    if (!nativeEval.passed && testTrainability) {
      const prosthetic = buildProstheticPrompt(
        [{ id: test.id, category: test.category, details: nativeEval.details }],
        1 // Level 1 prosthetic
      );

      const trainedStart = Date.now();
      const trainedResult = await this.callModel(modelId, test.prompt, prosthetic);
      const trainedLatency = Date.now() - trainedStart;

      const trainedToolCalls = trainedResult.message?.tool_calls || [];
      const trainedEval = test.evaluate(trainedResult.message, trainedToolCalls);

      result.trainedPassed = trainedEval.passed;
      result.trainedScore = trainedEval.score;
      result.trainedLatencyMs = trainedLatency;
      
      // Determine trainability
      if (trainedEval.passed || trainedEval.score > nativeEval.score + 20) {
        result.trainable = true;
        result.details = `Native: ${nativeEval.details} | Trained: ${trainedEval.details}`;
      } else {
        result.trainable = false;
        result.details = `Not trainable: ${nativeEval.details}`;
      }
    }

    return result;
  }

  /**
   * Call the model with a prompt
   */
  private async callModel(
    modelId: string,
    prompt: string,
    systemPromptAddition?: string
  ): Promise<{ message: any }> {
    const systemPrompt = systemPromptAddition
      ? `You are a helpful coding assistant.\n\n${systemPromptAddition}`
      : 'You are a helpful coding assistant.';

    try {
      const response = await axios.post(
        `${this.lmstudioUrl}/v1/chat/completions`,
        {
          model: modelId,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ],
          tools: SMOKE_TOOLS,
          tool_choice: 'auto',
          temperature: 0,
          max_tokens: 500
        },
        { timeout: this.timeout }
      );

      return {
        message: response.data.choices?.[0]?.message || {}
      };
    } catch (error: any) {
      console.error(`[SmokeTester] Model call failed: ${error.message}`);
      return { message: {} };
    }
  }

  /**
   * Build summary from results
   */
  private buildSummary(modelId: string, results: SmokeTestResult[], durationMs: number): SmokeTestSummary {
    const nativeCapabilities: string[] = [];
    const trainableCapabilities: string[] = [];
    const blockedCapabilities: string[] = [];
    const categoryScores: Record<string, { native: number; trained: number | null; trainable: boolean | null }> = {};

    // Process results
    for (const result of results) {
      const cat = result.category;
      
      if (!categoryScores[cat]) {
        categoryScores[cat] = { native: 0, trained: null, trainable: null };
      }
      categoryScores[cat].native = result.nativeScore;
      categoryScores[cat].trained = result.trainedScore ?? null;
      categoryScores[cat].trainable = result.trainable;

      if (result.nativePassed) {
        nativeCapabilities.push(cat);
      } else if (result.trainable === true) {
        trainableCapabilities.push(cat);
      } else if (result.trainable === false) {
        blockedCapabilities.push(cat);
      }
    }

    // Calculate overall score
    const passedCount = results.filter(r => r.nativePassed || r.trainedPassed).length;
    const overallScore = Math.round((passedCount / results.length) * 100);
    const passed = passedCount >= 6; // 6/8 = 75%

    // Determine recommendation
    let recommendation: 'deploy' | 'deploy_with_prosthetic' | 'needs_controller' | 'blocked';
    let recommendationReason: string;

    if (nativeCapabilities.length >= 6) {
      recommendation = 'deploy';
      recommendationReason = 'Model passes most tests natively';
    } else if (nativeCapabilities.length + trainableCapabilities.length >= 6) {
      recommendation = 'deploy_with_prosthetic';
      recommendationReason = 'Model is trainable for missing capabilities';
    } else if (blockedCapabilities.length <= 2) {
      recommendation = 'needs_controller';
      recommendationReason = 'Controller analysis needed for failing tests';
    } else {
      recommendation = 'blocked';
      recommendationReason = 'Too many non-trainable failures';
    }

    return {
      modelId,
      testedAt: new Date().toISOString(),
      durationMs,
      passed,
      overallScore,
      nativeCapabilities,
      trainableCapabilities,
      blockedCapabilities,
      categoryScores,
      results,
      recommendation,
      recommendationReason
    };
  }

  /**
   * Get the smoke test definitions
   */
  getTestDefinitions(): SmokeTestCase[] {
    return SMOKE_TESTS;
  }
}

// ============================================================
// SINGLETON INSTANCE
// ============================================================

export const smokeTester = new SmokeTester();

export default smokeTester;

