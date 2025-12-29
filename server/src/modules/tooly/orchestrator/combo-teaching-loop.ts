/**
 * Combo Teaching Loop
 *
 * Orchestrates automated combo model pair teaching cycles:
 * 1. Run combo assessment (test all pairs)
 * 2. Identify poorly performing combinations
 * 3. Generate combo-specific prosthetic prompts
 * 4. Apply prosthetics to combo configurations
 * 5. Re-run assessment to verify improvement
 * 6. Persist successful combo prosthetics
 *
 * The loop runs up to maxAttempts, escalating prosthetic levels
 * if lower levels don't improve combo performance.
 */

import { ComboTester, type ComboScore, COMBO_TEST_CASES } from '../testing/combo-tester.js';
import { prostheticStore } from '../learning/prosthetic-store.js';
import { failureLog } from '../../../services/failure-log.js';
import { LMStudioClient } from '@lmstudio/sdk';
import { intentRouter } from '../intent-router.js';

// ============================================================
// TYPES
// ============================================================

export interface ComboTeachingResult {
  success: boolean;
  attempts: number;
  startingScore: number;
  finalScore: number;
  finalLevel: 1 | 2 | 3 | 4;
  prostheticApplied: boolean;
  mainModelId: string;
  executorModelId: string;
  comboId: string;
  comboScoreBefore: number;
  comboScoreAfter: number;
  testsImproved: string[];
  testsRemaining: string[];
  failedTestsByLevel: { level: number; count: number }[];
  improvements: {
    overall: number;
    mainCorrect: number;
    executorSuccess: number;
  };
  certified: boolean;
  log: string[];
}

interface ComboTeachingOptions {
  maxAttempts?: number;
  startLevel?: 1 | 2 | 3 | 4;
  targetScore?: number;
  lmstudioUrl?: string;
}

// Broadcast service interface
interface BroadcastService {
  broadcastComboTeachingProgress(data: {
    comboId: string;
    mainModelId: string;
    executorModelId: string;
    attempt: number;
    level: 1 | 2 | 3 | 4;
    currentScore: number;
    phase: 'initial_assessment' | 'teaching_attempt' | 'teaching_verify' | 'teaching_complete';
    failedTestsByLevel?: { level: number; count: number }[];
  }): void;
  broadcastComboTeachingVerify(data: {
    comboId: string;
    mainModelId: string;
    executorModelId: string;
    attempt: number;
    phase: 'verifying';
  }): void;
  broadcastComboTeachingComplete(data: {
    comboId: string;
    mainModelId: string;
    executorModelId: string;
    success: boolean;
    finalScore: number;
    attempts: number;
  }): void;
}

type BroadcastFn = BroadcastService;

// ============================================================
// COMBO TEACHING LOOP CLASS
// ============================================================

export class ComboTeachingLoop {
  private tester: ComboTester;
  private broadcast?: BroadcastFn;

  constructor(tester: ComboTester, broadcast?: BroadcastFn) {
    this.tester = tester;
    this.broadcast = broadcast;
  }

  /**
   * Load both Main and Executor models for teaching and keep them loaded
   */
  private async ensureDualModelsLoaded(mainModelId: string, executorModelId: string): Promise<void> {
    const client = new LMStudioClient();
    const contextSize = 4096; // Smaller context for dual-model

    try {
      // Get currently loaded models
      const loadedModels = await client.llm.listLoaded();
      const loadedIds = loadedModels.map(m => m.identifier);

      // Check if both models are already loaded
      const mainLoaded = loadedIds.some(id => id.includes(mainModelId) || mainModelId.includes(id));
      const executorLoaded = loadedIds.some(id => id.includes(executorModelId) || executorModelId.includes(id));

      if (mainLoaded && executorLoaded) {
        console.log(`[ComboTeachingLoop] Both models already loaded: ${mainModelId} + ${executorModelId}`);
        return;
      }

      // Unload all models first to ensure clean slate
      console.log(`[ComboTeachingLoop] Unloading ${loadedModels.length} model(s) for combo teaching...`);
      for (const model of loadedModels) {
        try {
          await client.llm.unload(model.identifier);
          console.log(`[ComboTeachingLoop] Unloaded: ${model.identifier}`);
        } catch (e: any) {
          console.log(`[ComboTeachingLoop] Could not unload ${model.identifier}: ${e.message}`);
        }
      }

      // Load Main model first
      console.log(`[ComboTeachingLoop] Loading Main model: ${mainModelId} (ctx: ${contextSize})`);
      await client.llm.load(mainModelId, {
        config: { contextLength: contextSize },
      });
      console.log(`[ComboTeachingLoop] Main model loaded: ${mainModelId}`);

      // Load Executor model (if different from main)
      if (executorModelId !== mainModelId) {
        console.log(`[ComboTeachingLoop] Loading Executor model: ${executorModelId} (ctx: ${contextSize})`);
        await client.llm.load(executorModelId, {
          config: { contextLength: contextSize },
        });
        console.log(`[ComboTeachingLoop] Executor model loaded: ${executorModelId}`);
      }

      // Verify both are loaded
      const finalLoaded = await client.llm.listLoaded();
      console.log(`[ComboTeachingLoop] Models now loaded: ${finalLoaded.map(m => m.identifier).join(', ')}`);

    } catch (error: any) {
      console.error(`[ComboTeachingLoop] Failed to load models: ${error.message}`);
      throw error;
    }
  }

  /**
   * Test a specific combo pair without loading/unloading models
   */
  private async testSpecificCombo(mainModelId: string, executorModelId: string): Promise<ComboScore> {
    const testResults: any[] = [];
    const latencies: number[] = [];
    const taskTimeout = 10000;

    console.log(`[ComboTeachingLoop] Testing combo: ${mainModelId} + ${executorModelId}`);

    // Test each case
    for (let i = 0; i < COMBO_TEST_CASES.length; i++) {
      const test = COMBO_TEST_CASES[i];
      console.log(`[ComboTeachingLoop] Running test ${i + 1}/${COMBO_TEST_CASES.length}: ${test.name}`);

      try {
        const messages = [
          { role: 'system', content: 'You are a coding assistant working on a test project.\n\nPROJECT LOCATION: server/data/test-project/\n\nPROJECT STRUCTURE:\n- node-api/          Express API with authentication\n  - src/index.ts     Main entry point\n  - src/middleware/auth.middleware.ts   JWT validation\n  - src/services/auth.service.ts        User auth logic\n  - src/routes/users.ts, products.ts    API routes\n- react-web/         React frontend\n  - src/context/AuthContext.tsx         Auth state provider\n  - src/hooks/useAuth.ts                Auth hook\n  - src/components/LoginForm.tsx        Login UI\n- java-service/      Spring-style Java backend\n- react-native-app/  Mobile app navigation, screens\n- mendix-widget/     Pluggable widget with data binding\n- shared-utils/      TypeScript utilities (validation, formatting)\n\nUse the available tools when appropriate. The project uses TypeScript, React, and Express.' },
          { role: 'user', content: test.prompt },
        ];

        const tools = [
          {
            type: 'function',
            function: {
              name: 'read_file',
              description: 'Read the contents of a file',
              parameters: {
                type: 'object',
                properties: {
                  filepath: { type: 'string', description: 'Path to the file' },
                },
                required: ['filepath'],
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'rag_query',
              description: 'Search the codebase semantically',
              parameters: {
                type: 'object',
                properties: {
                  query: { type: 'string', description: 'Search query' },
                },
                required: ['query'],
              },
            },
          },
        ];

        const startTime = Date.now();
        const result = await intentRouter.route(messages, tools);
        const latency = Date.now() - startTime;

        // Analyze result
        const mainContent = result.mainResponse?.choices?.[0]?.message?.content || '';
        const intent = result.intent;
        const executorToolCalls = result.toolCalls?.map((tc: any) => tc.function?.name).filter(Boolean) || [];

        const mainOutputValid = !!intent && !!intent.action;
        const mainAction = intent?.action || null;
        const mainTool = intent?.tool || null;

        let passed = false;
        if (test.expectedAction === 'call_tool') {
          passed = mainAction === 'call_tool' &&
                   mainTool === test.expectedTool &&
                   executorToolCalls.includes(test.expectedTool!);
        } else if (test.expectedAction === 'respond') {
          passed = mainAction === 'respond' && executorToolCalls.length === 0;
        } else if (test.expectedAction === 'ask_clarification') {
          passed = (mainAction === 'respond' || mainAction === 'ask_clarification') &&
                   executorToolCalls.length === 0;
        }

        testResults.push({
          testId: test.id,
          testName: test.name,
          category: test.category,
          difficulty: test.difficulty,
          passed,
          mainOutputValid,
          mainAction,
          mainTool,
          executorCalled: result.mode === 'dual' && !!result.executorResponse,
          executorToolCalls,
          latencyMs: latency,
          mainLatencyMs: result.latency?.main || 0,
          executorLatencyMs: result.latency?.executor || 0,
          timedOut: false,
        });

        latencies.push(latency);

      } catch (error: any) {
        console.log(`[ComboTeachingLoop] Test failed: ${error.message}`);
        testResults.push({
          testId: test.id,
          testName: test.name,
          category: test.category,
          difficulty: test.difficulty,
          passed: false,
          mainOutputValid: false,
          mainAction: null,
          mainTool: null,
          executorCalled: false,
          executorToolCalls: [],
          latencyMs: taskTimeout,
          error: error.message,
          timedOut: true,
        });
      }
    }

    // Use the same scoring logic as the combo tester
    const passedTests = testResults.filter(r => r.passed).length;
    const totalTests = testResults.length;
    const overallScore = totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0;

    return {
      mainModelId,
      executorModelId,
      totalTests,
      passedTests,
      passedCount: passedTests,
      failedCount: totalTests - passedTests,
      categoryScores: testResults.map(r => ({
        category: r.category,
        difficulty: r.difficulty,
        score: r.passed ? 100 : 0,
        passed: r.passed,
        latencyMs: r.latencyMs,
      })),
      tierScores: [],
      mainScore: overallScore,
      executorScore: overallScore,
      mainCorrectCount: passedTests,
      executorSuccessCount: passedTests,
      intentAccuracy: overallScore,
      executionSuccess: overallScore,
      avgLatencyMs: latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0,
      minLatencyMs: latencies.length > 0 ? Math.min(...latencies) : 0,
      maxLatencyMs: latencies.length > 0 ? Math.max(...latencies) : 0,
      overallScore,
      testResults,
      testedAt: new Date().toISOString(),
    };
  }

  /**
   * Run the full combo teaching cycle for a model pair
   */
  async runComboTeachingCycle(
    mainModelId: string,
    executorModelId: string,
    options: ComboTeachingOptions = {}
  ): Promise<ComboTeachingResult> {
    const {
      maxAttempts = 4,
      startLevel = 1,
      targetScore = 70,
      lmstudioUrl = 'http://localhost:1234'
    } = options;

    const comboId = `${mainModelId}-${executorModelId}`;
    const log: string[] = [];
    const failedTestsByLevel: { level: number; count: number }[] = [];

    log.push(`Starting combo teaching cycle for ${comboId}`);

    // Phase 1: Initial assessment
    if (this.broadcast) {
      this.broadcast.broadcastComboTeachingProgress({
        comboId,
        mainModelId,
        executorModelId,
        attempt: 1,
        level: startLevel,
        currentScore: 0,
        phase: 'initial_assessment'
      });
    }

    // Load both models for the teaching session and keep them loaded
    log.push(`Loading Main model: ${mainModelId} and Executor model: ${executorModelId}`);
    await this.ensureDualModelsLoaded(mainModelId, executorModelId);

    // Configure router for this specific combo
    await intentRouter.configure({
      mainModelId,
      executorModelId,
      enableDualModel: true,
      timeout: 60000,
      provider: 'lmstudio',
      settings: { lmstudioUrl: lmstudioUrl }
    });

    log.push('Running initial combo assessment with pre-loaded models...');
    const initialComboResult = await this.testSpecificCombo(mainModelId, executorModelId);

    if (!initialComboResult) {
      throw new Error(`Failed to test combo ${comboId}`);
    }

    const startingScore = initialComboResult.overallScore;
    log.push(`Initial combo score: ${startingScore}%`);

    // If already above target, no teaching needed
    if (startingScore >= targetScore) {
      log.push(`Combo already meets target score (${startingScore}% >= ${targetScore}%), no teaching needed`);
      return this.createSuccessResult(
        comboId,
        mainModelId,
        executorModelId,
        startingScore,
        startingScore,
        0,
        startLevel,
        [],
        [],
        failedTestsByLevel,
        log
      );
    }

    // Phase 2: Teaching attempts
    let currentLevel = startLevel as 1 | 2 | 3 | 4;
    let bestScore = startingScore;
    let bestLevel = startLevel;
    let prostheticApplied = false;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      log.push(`Teaching attempt ${attempt}/${maxAttempts} at level ${currentLevel}`);

      if (this.broadcast) {
        this.broadcast.broadcastComboTeachingProgress({
          comboId,
          mainModelId,
          executorModelId,
          attempt,
          level: currentLevel,
          currentScore: bestScore,
          phase: 'teaching_attempt'
        });
      }

      // Generate combo-specific prosthetic
      const failingTests = initialComboResult.testResults.filter(r => !r.passed);
      const prostheticPrompt = this.generateComboProsthetic(
        mainModelId,
        executorModelId,
        failingTests,
        currentLevel,
        initialComboResult
      );

      log.push(`Generated prosthetic at level ${currentLevel}`);

      // Save the prosthetic
      prostheticStore.saveComboPrompt({
        mainModelId,
        executorModelId,
        prompt: prostheticPrompt,
        level: currentLevel,
        probesFixed: failingTests.map(t => t.testId),
        categoryImprovements: {
          combo_pairing: 10 * currentLevel // Rough improvement estimate
        },
        targetTaskTypes: ['combo_coordination'],
        comboScoreBefore: bestScore
      });

      prostheticApplied = true;
      log.push(`Applied combo prosthetic to ${comboId}`);

      // Phase 3: Verification - re-test the combo
      if (this.broadcast) {
        this.broadcast.broadcastComboTeachingVerify({
          comboId,
          mainModelId,
          executorModelId,
          attempt,
          phase: 'verifying'
        });
      }

      log.push('Re-testing combo with pre-loaded models to verify improvement...');
      const verificationComboResult = await this.testSpecificCombo(mainModelId, executorModelId);

      if (!verificationComboResult) {
        log.push('Warning: Could not verify combo improvement');
        continue;
      }

      const newScore = verificationComboResult.overallScore;
      const improvement = newScore - bestScore;
      log.push(`Verification score: ${newScore}% (${improvement >= 0 ? '+' : ''}${improvement}%)`);

      // Track failed tests at this level
      const failedTests = verificationComboResult.testResults.filter(r => !r.passed).length;
      failedTestsByLevel.push({ level: currentLevel, count: failedTests });

      // If improved, update best score
      if (newScore > bestScore) {
        bestScore = newScore;
        bestLevel = currentLevel;
        log.push(`New best score: ${bestScore}% at level ${currentLevel}`);

        // Mark the prosthetic as verified if it improved significantly
        if (improvement >= 5) { // 5% improvement threshold
          const prosthetic = prostheticStore.getForCombo(mainModelId, executorModelId);
          if (prosthetic) {
            prosthetic.verified = true;
            prosthetic.successfulRuns++;
            prosthetic.comboScoreAfter = newScore;
          }
        }
      }

      // Check if we reached target
      if (newScore >= targetScore) {
        log.push(`Target score reached: ${newScore}% >= ${targetScore}%`);
        break;
      }

      // Escalate to next level if not last attempt
      if (attempt < maxAttempts && currentLevel < 4) {
        currentLevel = (currentLevel + 1) as 1 | 2 | 3 | 4;
        log.push(`Escalating to level ${currentLevel} for next attempt`);
      }
    }

    const finalScore = bestScore;
    const success = finalScore >= targetScore;
    const certified = success;

    log.push(`Teaching cycle complete. Final score: ${finalScore}% (${success ? 'SUCCESS' : 'FAILED'})`);

    if (this.broadcast) {
      this.broadcast.broadcastComboTeachingComplete({
        comboId,
        mainModelId,
        executorModelId,
        success,
        finalScore,
        attempts: Math.min(maxAttempts, failedTestsByLevel.length)
      });
    }

    // Calculate improvements
    const improvements = {
      overall: finalScore - startingScore,
      mainCorrect: finalScore - initialComboResult.mainScore,
      executorSuccess: finalScore - initialComboResult.executorScore
    };

    return {
      success,
      attempts: Math.min(maxAttempts, failedTestsByLevel.length),
      startingScore,
      finalScore,
      finalLevel: bestLevel,
      prostheticApplied,
      mainModelId,
      executorModelId,
      comboId,
      comboScoreBefore: startingScore,
      comboScoreAfter: finalScore,
      testsImproved: [], // TODO: Track specific tests that improved
      testsRemaining: [], // TODO: Track remaining failing tests
      failedTestsByLevel,
      improvements,
      certified,
      log
    };
  }

  /**
   * Generate a prosthetic prompt specifically for combo coordination issues
   */
  private generateComboProsthetic(
    mainModelId: string,
    executorModelId: string,
    failingTests: any[],
    level: 1 | 2 | 3 | 4,
    comboResult: ComboScore
  ): string {
    const basePrompt = `You are working as part of a dual-model AI system. You are the ${mainModelId.includes('main') ? 'Main' : 'Main'} model, responsible for task analysis and intent determination. You will be paired with an Executor model (${executorModelId}) that handles tool execution.

COORDINATION REQUIREMENTS:
- Provide clear, unambiguous instructions to the Executor
- Structure your responses to be easily parsed by the Executor
- Include all necessary context and parameters
- Use consistent formatting for tool calls and data`;

    // Level-specific additions
    const levelAdditions = {
      1: `
HINTS FOR SUCCESSFUL COORDINATION:
- When you need the Executor to use a tool, clearly state what tool and why
- Provide complete file paths and parameter values
- If something is unclear, ask for clarification before proceeding`,
      2: `
COORDINATION PROTOCOL:
- Always specify the exact tool name and parameters needed
- Format tool requests as: "Please use [TOOL_NAME] with parameters: [PARAMS]"
- Include context about what you're trying to accomplish
- Expect the Executor to provide detailed results`,
      3: `
MANDATORY COORDINATION RULES:
- NEVER assume the Executor knows your intentions - be explicit
- ALWAYS provide complete context before requesting tool use
- MUST validate that tool parameters are correct before submission
- REQUIRED: Confirm understanding of task requirements`,
      4: `
CRITICAL COORDINATION CONSTRAINTS:
- You MUST NOT proceed without explicit confirmation from Executor on complex tasks
- REQUIRED: Break down multi-step tasks into clear, sequential instructions
- FORBIDDEN: Vague or incomplete tool requests
- MANDATORY: Full parameter validation before any tool execution

COORDINATION EXAMPLES:
Main: "I need to read the file node-api/src/index.ts to understand the server setup. Please use read_file with filepath='node-api/src/index.ts' and provide the full file content."

Executor: [reads file and returns content]

Main: "Based on the file content, I can see the server listens on port 3001. Now I need to check if there are any authentication routes. Please search for 'auth' in the routes directory."`
    };

    return `${basePrompt}${levelAdditions[level]}`;
  }

  /**
   * Create a success result for already-good combos
   */
  private createSuccessResult(
    comboId: string,
    mainModelId: string,
    executorModelId: string,
    startingScore: number,
    finalScore: number,
    attempts: number,
    finalLevel: 1 | 2 | 3 | 4,
    testsImproved: string[],
    testsRemaining: string[],
    failedTestsByLevel: { level: number; count: number }[],
    log: string[]
  ): ComboTeachingResult {
    return {
      success: true,
      attempts,
      startingScore,
      finalScore,
      finalLevel,
      prostheticApplied: false,
      mainModelId,
      executorModelId,
      comboId,
      comboScoreBefore: startingScore,
      comboScoreAfter: finalScore,
      testsImproved,
      testsRemaining,
      failedTestsByLevel,
      improvements: {
        overall: 0,
        mainCorrect: 0,
        executorSuccess: 0
      },
      certified: true,
      log
    };
  }

  /**
   * Run teaching cycles for multiple combos
   */
  async runBatchComboTeaching(
    combos: Array<{ mainModelId: string; executorModelId: string }>,
    options: ComboTeachingOptions = {}
  ): Promise<ComboTeachingResult[]> {
    const results: ComboTeachingResult[] = [];

    for (const combo of combos) {
      try {
        const result = await this.runComboTeachingCycle(
          combo.mainModelId,
          combo.executorModelId,
          options
        );
        results.push(result);
      } catch (error: any) {
        console.error(`[ComboTeachingLoop] Failed to teach combo ${combo.mainModelId}-${combo.executorModelId}:`, error);
        // Create a failed result
        results.push({
          success: false,
          attempts: 0,
          startingScore: 0,
          finalScore: 0,
          finalLevel: 1,
          prostheticApplied: false,
          mainModelId: combo.mainModelId,
          executorModelId: combo.executorModelId,
          comboId: `${combo.mainModelId}-${combo.executorModelId}`,
          comboScoreBefore: 0,
          comboScoreAfter: 0,
          testsImproved: [],
          testsRemaining: [],
          failedTestsByLevel: [],
          improvements: { overall: 0, mainCorrect: 0, executorSuccess: 0 },
          certified: false,
          log: [`Teaching failed: ${error.message}`]
        });
      }
    }

    return results;
  }
}
