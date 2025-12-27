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

import { ComboTester, type ComboScore } from '../testing/combo-tester.js';
import { prostheticStore } from '../learning/prosthetic-store.js';
import { failureLog } from '../../../services/failure-log.js';

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

    log.push('Running initial combo assessment...');
    const initialResults = await this.tester.testAllCombos();

    // Find the specific combo result
    const initialComboResult = initialResults.find(
      r => r.mainModelId === mainModelId && r.executorModelId === executorModelId
    );

    if (!initialComboResult) {
      throw new Error(`Could not find combo result for ${comboId}`);
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

      log.push('Re-testing combo to verify improvement...');
      const verificationResults = await this.tester.testAllCombos();

      const verificationComboResult = verificationResults.find(
        r => r.mainModelId === mainModelId && r.executorModelId === executorModelId
      );

      if (!verificationComboResult) {
        log.push('Warning: Could not find verification combo result');
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
