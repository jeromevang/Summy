/**
 * Prosthetic Loop
 * 
 * Orchestrates the automated model teaching cycle:
 * 1. Run the Agentic Readiness assessment
 * 2. Identify failing probes
 * 3. Generate prosthetic prompt to compensate
 * 4. Apply the prosthetic to the model config
 * 5. Re-run assessment to verify improvement
 * 6. Persist successful prosthetics to learning system
 * 
 * The loop runs up to maxAttempts, escalating the prosthetic level
 * if lower levels don't fix the failures.
 */

import { ReadinessRunner } from '../testing/readiness-runner.js';
import { getReadinessConfig, type ReadinessResult } from '../testing/agentic-readiness-suite.js';
import { prostheticStore, buildProstheticPrompt } from '../learning/prosthetic-store.js';
import { capabilities as modelCapabilities } from '../capabilities.js';

// ============================================================
// TYPES
// ============================================================

export interface TeachingResult {
  success: boolean;
  attempts: number;
  startingScore: number;
  finalScore: number;
  finalLevel: 1 | 2 | 3 | 4;
  prostheticApplied: boolean;
  probesFixed: string[];
  probesRemaining: string[];
  failedTestsByLevel: { level: number; count: number }[];
  improvements: {
    tool: number;
    rag: number;
    reasoning: number;
    intent: number;
    browser: number;
  };
  certified: boolean;
  log: string[];
}

interface TeachingOptions {
  maxAttempts?: number;
  startLevel?: 1 | 2 | 3 | 4;
  targetScore?: number;
}

// Import WSBroadcastService type (or use inline interface)
interface BroadcastService {
  broadcastTeachingProgress(data: {
    modelId: string;
    attempt: number;
    level: 1 | 2 | 3 | 4;
    currentScore: number;
    phase: 'initial_assessment' | 'teaching_attempt' | 'teaching_verify' | 'teaching_complete';
    failedTestsByLevel?: { level: number; count: number }[];
  }): void;
  broadcastTeachingVerify(data: {
    modelId: string;
    attempt: number;
    phase: 'verifying';
  }): void;
  broadcastTeachingComplete(data: {
    modelId: string;
    success: boolean;
    finalScore: number;
    attempts: number;
  }): void;
}

type BroadcastFn = BroadcastService;

// ============================================================
// PROSTHETIC LOOP CLASS
// ============================================================

export class ProstheticLoop {
  private runner: ReadinessRunner;
  private broadcast?: BroadcastFn;

  constructor(runner: ReadinessRunner, broadcast?: BroadcastFn) {
    this.runner = runner;
    this.broadcast = broadcast;
  }

  /**
   * Run the full teaching cycle for a model
   */
  async runTeachingCycle(
    modelId: string,
    provider: 'lmstudio' | 'openai' | 'azure' = 'lmstudio',
    options: TeachingOptions = {}
  ): Promise<TeachingResult> {
    if (!this.runner) {
      throw new Error('ReadinessRunner not provided to ProstheticLoop');
    }

    const {
      maxAttempts = 3,
      startLevel = 1,
      targetScore = getReadinessConfig().threshold
    } = options;

    const log: string[] = [];
    let currentLevel: 1 | 2 | 3 | 4 = startLevel;
    let attempts = 0;
    let initialResult: ReadinessResult | null = null;
    let currentResult: ReadinessResult | null = null;
    const allFixedProbes: string[] = [];
    const failedTestsByLevel: { level: number; count: number }[] = [];

    this.log(log, `Starting teaching cycle for ${modelId}`);
    this.log(log, `Target score: ${targetScore}%, Max attempts: ${maxAttempts}`);

    // Step 1: Initial assessment
    this.broadcast?.broadcastTeachingProgress({
      modelId,
      attempt: 0,
      level: currentLevel,
      currentScore: 0,
      phase: 'initial_assessment',
      failedTestsByLevel: failedTestsByLevel
    });
    this.log(log, 'Running initial assessment...');

    initialResult = await this.runner.assessModel(modelId, provider);
    currentResult = initialResult;

    this.log(log, `Initial score: ${initialResult.overallScore}%`);
    this.log(log, `Failed tests: ${initialResult.failedTests.length}`);

    // Track initial failed tests at level 0
    failedTestsByLevel.push({
      level: 0,
      count: initialResult.failedTests.length
    });

    // Check if already passing
    if (initialResult.passed) {
      this.log(log, 'Model already passes threshold. No teaching needed.');
      return this.buildResult(initialResult, initialResult, 0, currentLevel, [], log, true, failedTestsByLevel);
    }

    // Step 2: Teaching loop
    while (attempts < maxAttempts && currentLevel <= 4) {
      attempts++;

      // Track failed tests at current level (before applying prosthetic)
      failedTestsByLevel.push({
        level: currentLevel,
        count: currentResult.failedTests.length
      });
      this.log(log, `\n--- Attempt ${attempts} (Level ${currentLevel}) ---`);
      this.broadcast?.broadcastTeachingProgress({
        modelId,
        attempt: attempts,
        level: currentLevel,
        currentScore: currentResult.overallScore,
        phase: 'teaching_attempt',
        failedTestsByLevel
      });

      // Step 2a: Generate prosthetic based on failures
      const failedTestDetails = currentResult.testResults
        .filter(t => !t.passed)
        .map(t => ({ 
          id: t.testId, 
          category: t.category, 
          details: t.details 
        }));

      const prostheticPrompt = buildProstheticPrompt(failedTestDetails, currentLevel);
      this.log(log, `Generated Level ${currentLevel} prosthetic (${prostheticPrompt.length} chars)`);

      // Step 2b: Save prosthetic to store
      prostheticStore.savePrompt({
        modelId,
        prompt: prostheticPrompt,
        level: currentLevel,
        probesFixed: allFixedProbes,
        categoryImprovements: this.calculateImprovements(initialResult, currentResult)
      });

      // Step 2c: Apply prosthetic to model profile
      await this.applyProstheticToProfile(modelId, prostheticPrompt);
      this.log(log, 'Applied prosthetic to model profile');

      // Step 2d: Re-run assessment
      this.log(log, 'Re-running assessment...');
      this.broadcast?.broadcastTeachingVerify({ modelId, attempt: attempts, phase: 'verifying' });

      const newResult = await this.runner.assessModel(modelId, provider);

      // Track which probes were fixed
      const previouslyFailed = new Set(currentResult.failedTests);
      const stillFailed = new Set(newResult.failedTests);
      const newlyFixed = [...previouslyFailed].filter(id => !stillFailed.has(id));
      allFixedProbes.push(...newlyFixed);

      this.log(log, `New score: ${newResult.overallScore}% (was ${currentResult.overallScore}%)`);
      this.log(log, `Fixed ${newlyFixed.length} probes: ${newlyFixed.join(', ') || 'none'}`);
      this.log(log, `Still failing: ${newResult.failedTests.length} probes`);

      currentResult = newResult;

      // Step 2e: Check if we've reached the target
      if (currentResult.overallScore >= targetScore) {
        this.log(log, `SUCCESS! Reached target score of ${targetScore}%`);
        prostheticStore.markVerified(modelId);
        break;
      }

      // Step 2f: Check if we made progress
      if (newlyFixed.length === 0) {
        this.log(log, `No progress at Level ${currentLevel}, escalating...`);
        currentLevel = Math.min(currentLevel + 1, 4) as 1 | 2 | 3 | 4;
      }
    }

    // Step 3: Final result
    const certified = currentResult.overallScore >= targetScore;
    
    if (certified) {
      this.log(log, '\n=== TEACHING COMPLETE: Model Certified ===');
      // Update model profile with certification
      await this.certifyModel(modelId, currentResult);
    } else {
      this.log(log, '\n=== TEACHING INCOMPLETE: Target not reached ===');
      this.log(log, `Final score: ${currentResult.overallScore}% (target: ${targetScore}%)`);
    }

    this.broadcast?.broadcastTeachingComplete({
      modelId,
      success: certified,
      finalScore: currentResult.overallScore,
      attempts
    });

    return this.buildResult(
      initialResult,
      currentResult,
      attempts,
      currentLevel,
      allFixedProbes,
      log,
      certified,
      failedTestsByLevel
    );
  }

  /**
   * Apply prosthetic prompt to model profile
   */
  private async applyProstheticToProfile(modelId: string, prostheticPrompt: string): Promise<void> {
    try {
      let profile = await modelCapabilities.getProfile(modelId);

      if (!profile || !profile.modelId) {
        if (profile && !profile.modelId) {
          // Clear the cache to remove corrupted entries
          (modelCapabilities as any).clearCache();
        }
        // Create a basic profile for the model
        profile = {
          modelId,
          displayName: modelId,
          provider: 'lmstudio',
          testedAt: new Date().toISOString(),
          testVersion: 1,
          score: 0,
          toolFormat: 'openai_tools',
          capabilities: {},
          enabledTools: [],
        };
      }

      // Add or update the prosthetic system prompt
      const existingPrompt = profile!.systemPrompt || '';
      const newPrompt = prostheticPrompt + '\n\n' + existingPrompt;

      profile!.systemPrompt = newPrompt;
      profile!.prostheticApplied = true;

      await modelCapabilities.saveProfile(profile!);
    } catch (error) {
      console.error(`[ProstheticLoop] Error applying prosthetic:`, error);
      throw error;
    }
  }

  /**
   * Mark model as certified in profile
   */
  private async certifyModel(modelId: string, result: ReadinessResult): Promise<void> {
    try {
      let profile = await modelCapabilities.getProfile(modelId);
      if (!profile) {
        console.log(`[ProstheticLoop] Creating profile for certification of ${modelId}`);
        profile = {
          modelId,
          displayName: modelId,
          provider: 'lmstudio',
          testedAt: new Date().toISOString(),
          testVersion: 1,
          score: result.overallScore,
          toolFormat: 'openai_tools',
          capabilities: {},
          enabledTools: [],
        };
      }

      profile!.agenticReadiness = {
        certified: true,
        score: result.overallScore,
        certifiedAt: new Date().toISOString(),
        categoryScores: result.categoryScores,
        failedTests: result.failedTests,
        prostheticApplied: prostheticStore.hasProsthetic(modelId)
      };

      await modelCapabilities.saveProfile(profile!);
      console.log(`[ProstheticLoop] Certified model ${modelId} with score ${result.overallScore}`);
    } catch (error) {
      console.error(`[ProstheticLoop] Error certifying model:`, error);
      throw error;
    }
  }

  /**
   * Calculate improvements between initial and current results
   */
  private calculateImprovements(
    initial: ReadinessResult,
    current: ReadinessResult
  ): TeachingResult['improvements'] {
    return {
      tool: current.categoryScores.tool - initial.categoryScores.tool,
      rag: current.categoryScores.rag - initial.categoryScores.rag,
      reasoning: current.categoryScores.reasoning - initial.categoryScores.reasoning,
      intent: current.categoryScores.intent - initial.categoryScores.intent,
      browser: current.categoryScores.browser - initial.categoryScores.browser,
    };
  }

  /**
   * Build the final teaching result
   */
  private buildResult(
    initial: ReadinessResult,
    final: ReadinessResult,
    attempts: number,
    level: 1 | 2 | 3 | 4,
    fixedProbes: string[],
    log: string[],
    certified: boolean,
    failedTestsByLevel: { level: number; count: number }[]
  ): TeachingResult {
    return {
      success: certified,
      attempts,
      startingScore: initial.overallScore,
      finalScore: final.overallScore,
      finalLevel: level,
      prostheticApplied: fixedProbes.length > 0 || prostheticStore.hasProsthetic(final.modelId),
      probesFixed: fixedProbes,
      probesRemaining: final.failedTests,
      failedTestsByLevel,
      improvements: this.calculateImprovements(initial, final),
      certified,
      log
    };
  }

  /**
   * Add log entry
   */
  private log(log: string[], message: string): void {
    const timestamp = new Date().toISOString().substring(11, 19);
    log.push(`[${timestamp}] ${message}`);
    console.log(`[ProstheticLoop] ${message}`);
  }

}

// ============================================================
// FACTORY FUNCTION
// ============================================================

export function createProstheticLoop(
  runner: ReadinessRunner,
  broadcast?: BroadcastFn
): ProstheticLoop {
  return new ProstheticLoop(runner, broadcast);
}

