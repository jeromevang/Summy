/**
 * Combo Profile Store
 * JSON-based storage for dual-model combo test results.
 * 
 * Storage: server/data/combo-profiles/{mainModel}--{executorModel}.json
 * 
 * This persists combo test results independently of the DB for
 * resilience across DB resets.
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================
// TYPES
// ============================================================

/**
 * Represents the result of a single test within a combo profile.
 */
export interface ComboTestResult {
  /** A unique identifier for the test. */
  testId: string;
  /** The descriptive name of the test. */
  testName: string;
  /** Indicates whether the test passed. */
  passed: boolean;
  /** The score achieved in this test. */
  score: number;
  /** The latency of the test execution in milliseconds. */
  latencyMs: number;
  /** Optional error message if the test failed. */
  error?: string;
  /** Optional detailed information about the test result. */
  details?: string;
}

/**
 * Represents a comprehensive profile for a dual-model combination.
 * This includes test results, scores, performance metrics, and recommendations.
 */
export interface ComboProfile {
  /** The ID of the main model in the combo. */
  mainModelId: string;
  /** The ID of the executor model in the combo. */
  executorModelId: string;
  /** The ISO timestamp of when this profile was last tested. */
  testedAt: string;
  /** The version of the test suite used to generate this profile. */
  testVersion: number;
  /** The context size used for the models during testing. */
  contextSize: number;
  
  // Scores
  /** The overall aggregated score for this combo. */
  overallScore: number;
  /** How well the main model understood the intent. */
  intentAccuracy: number;
  /** How well the executor model performed the execution. */
  executionSuccess: number;
  /** Quality of communication/handoff from main to executor. */
  handoffQuality: number;
  
  // Performance
  /** Average latency across all tests in milliseconds. */
  avgLatencyMs: number;
  /** Total number of tests run. */
  totalTests: number;
  /** Number of tests that passed. */
  passedTests: number;
  /** Number of tests that failed. */
  failedTests: number;
  
  // Test results
  /** An array of detailed results for each individual test. */
  results: ComboTestResult[];
  
  // Strengths/weaknesses
  /** A list of identified strengths of this combo. */
  strengths: string[];
  /** A list of identified weaknesses of this combo. */
  weaknesses: string[];
  
  // Recommendation
  /** List of use cases for which this combo is recommended (e.g., 'code_understanding'). */
  recommendedFor: string[];
  /** List of use cases for which this combo is not recommended. */
  notRecommendedFor: string[];
}

// ============================================================
// COMBO PROFILE STORE
// ============================================================

const COMBO_PROFILES_DIR = path.join(__dirname, '../../data/combo-profiles');

/**
 * Manages the persistent storage and retrieval of dual-model `ComboProfile` objects.
 * Stores profiles as JSON files in a dedicated directory.
 */
class ComboProfileStore {
  constructor() {
    fs.ensureDirSync(COMBO_PROFILES_DIR);
  }

  /**
   * Generates a sanitized filename for a combo profile based on main and executor model IDs.
   * @param mainModelId - The ID of the main model.
   * @param executorModelId - The ID of the executor model.
   * @returns A safe filename string.
   */
  private getFileName(mainModelId: string, executorModelId: string): string {
    const sanitize = (s: string) => s
      .toLowerCase()
      .replace(/[^a-z0-9-.]/g, '-') // Allow only alphanumeric, hyphen, dot
      .replace(/-+/g, '-')          // Collapse multiple hyphens
      .replace(/^-|-$/g, '');       // Remove leading/trailing hyphens
    
    return `${sanitize(mainModelId)}--${sanitize(executorModelId)}.json`;
  }

  /**
   * Gets the full file path for a given combo profile.
   * @param mainModelId - The ID of the main model.
   * @param executorModelId - The ID of the executor model.
   * @returns The absolute file path to the combo profile.
   */
  private getPath(mainModelId: string, executorModelId: string): string {
    return path.join(COMBO_PROFILES_DIR, this.getFileName(mainModelId, executorModelId));
  }

  /**
   * Saves a `ComboProfile` to a JSON file.
   * @param profile - The `ComboProfile` object to save.
   * @returns A promise that resolves when the profile has been saved.
   */
  async saveProfile(profile: ComboProfile): Promise<void> {
    const filePath = this.getPath(profile.mainModelId, profile.executorModelId);
    await fs.writeJson(filePath, profile, { spaces: 2 });
    console.log(`[ComboStore] Saved profile: ${profile.mainModelId} + ${profile.executorModelId}`);
  }

  /**
   * Retrieves a `ComboProfile` from its JSON file.
   * @param mainModelId - The ID of the main model.
   * @param executorModelId - The ID of the executor model.
   * @returns A promise that resolves with the `ComboProfile` object, or null if not found or an error occurs.
   */
  async getProfile(mainModelId: string, executorModelId: string): Promise<ComboProfile | null> {
    const filePath = this.getPath(mainModelId, executorModelId);
    
    try {
      if (await fs.pathExists(filePath)) {
        return await fs.readJson(filePath);
      }
    } catch (error) {
      console.error(`[ComboStore] Error loading profile for ${mainModelId}+${executorModelId}:`, error);
    }

    return null;
  }

  /**
   * Retrieves all stored `ComboProfile` objects.
   * @returns A promise that resolves with an array of all `ComboProfile` objects.
   */
  async getAllProfiles(): Promise<ComboProfile[]> {
    const profiles: ComboProfile[] = [];
    
    try {
      const files = await fs.readdir(COMBO_PROFILES_DIR);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const profile = await fs.readJson(path.join(COMBO_PROFILES_DIR, file));
            profiles.push(profile);
          } catch (error) {
            console.error(`[ComboStore] Error loading ${file}:`, error);
          }
        }
      }
    } catch (error) {
      console.error(`[ComboStore] Error listing profiles in ${COMBO_PROFILES_DIR}:`, error);
    }

    return profiles;
  }

  /**
   * Retrieves the top N combo profiles sorted by their overall score.
   * @param limit - The maximum number of profiles to return. Defaults to 10.
   * @returns A promise that resolves with an array of `ComboProfile` objects.
   */
  async getTopCombos(limit: number = 10): Promise<ComboProfile[]> {
    const profiles = await this.getAllProfiles();
    return profiles
      .sort((a, b) => b.overallScore - a.overallScore)
      .slice(0, limit);
  }

  /**
   * Retrieves all combo profiles where the specified model is the main model.
   * @param mainModelId - The ID of the main model to filter by.
   * @returns A promise that resolves with an array of `ComboProfile` objects, sorted by overall score.
   */
  async getCombosForMain(mainModelId: string): Promise<ComboProfile[]> {
    const profiles = await this.getAllProfiles();
    return profiles
      .filter(p => p.mainModelId === mainModelId)
      .sort((a, b) => b.overallScore - a.overallScore);
  }

  /**
   * Retrieves all combo profiles where the specified model is the executor model.
   * @param executorModelId - The ID of the executor model to filter by.
   * @returns A promise that resolves with an array of `ComboProfile` objects, sorted by overall score.
   */
  async getCombosForExecutor(executorModelId: string): Promise<ComboProfile[]> {
    const profiles = await this.getAllProfiles();
    return profiles
      .filter(p => p.executorModelId === executorModelId)
      .sort((a, b) => b.overallScore - a.overallScore);
  }

  /**
   * Finds the best performing executor model for a given main model based on stored profiles.
   * @param mainModelId - The ID of the main model.
   * @returns A promise that resolves with the best `ComboProfile` for that main model, or null if none found.
   */
  async findBestExecutor(mainModelId: string): Promise<ComboProfile | null> {
    const combos = await this.getCombosForMain(mainModelId);
    return combos[0] || null;
  }

  /**
   * Finds the best performing main model for a given executor model based on stored profiles.
   * @param executorModelId - The ID of the executor model.
   * @returns A promise that resolves with the best `ComboProfile` for that executor model, or null if none found.
   */
  async findBestMain(executorModelId: string): Promise<ComboProfile | null> {
    const combos = await this.getCombosForExecutor(executorModelId);
    return combos[0] || null;
  }

  /**
   * Deletes a specific combo profile from storage.
   * @param mainModelId - The ID of the main model of the profile to delete.
   * @param executorModelId - The ID of the executor model of the profile to delete.
   * @returns A promise that resolves to true if the profile was successfully deleted, false otherwise.
   */
  async deleteProfile(mainModelId: string, executorModelId: string): Promise<boolean> {
    const filePath = this.getPath(mainModelId, executorModelId);
    
    try {
      if (await fs.pathExists(filePath)) {
        await fs.remove(filePath);
        console.log(`[ComboStore] Deleted profile: ${mainModelId} + ${executorModelId}`);
        return true;
      }
    } catch (error) {
      console.error(`[ComboStore] Error deleting profile for ${mainModelId}+${executorModelId}:`, error);
    }

    return false;
  }

  /**
   * Deletes all combo profiles associated with a given model (either as main or executor).
   * @param modelId - The ID of the model for which to delete associated profiles.
   * @returns A promise that resolves with the number of profiles deleted.
   */
  async deleteProfilesForModel(modelId: string): Promise<number> {
    const profiles = await this.getAllProfiles();
    let deleted = 0;

    for (const profile of profiles) {
      if (profile.mainModelId === modelId || profile.executorModelId === modelId) {
        if (await this.deleteProfile(profile.mainModelId, profile.executorModelId)) {
          deleted++;
        }
      }
    }

    return deleted;
  }

  /**
   * Clears all stored combo profiles.
   * @returns A promise that resolves with the number of profiles deleted.
   */
  async clearAll(): Promise<number> {
    const profiles = await this.getAllProfiles();
    let deleted = 0;

    for (const profile of profiles) {
      if (await this.deleteProfile(profile.mainModelId, profile.executorModelId)) {
        deleted++;
      }
    }

    return deleted;
  }

  /**
   * Retrieves statistics about the stored combo profiles.
   * @returns A promise that resolves with an object containing statistics like total combos, average score, etc.
   */
  async getStats(): Promise<{
    totalCombos: number;
    avgScore: number;
    topCombo: { main: string; executor: string; score: number } | null;
    modelsCovered: number;
  }> {
    const profiles = await this.getAllProfiles();
    
    if (profiles.length === 0) {
      return {
        totalCombos: 0,
        avgScore: 0,
        topCombo: null,
        modelsCovered: 0
      };
    }

    const avgScore = profiles.reduce((sum, p) => sum + p.overallScore, 0) / profiles.length;
    const topProfile = profiles.sort((a, b) => b.overallScore - a.overallScore)[0];
    
    const models = new Set<string>();
    for (const p of profiles) {
      models.add(p.mainModelId);
      models.add(p.executorModelId);
    }

    return {
      totalCombos: profiles.length,
      avgScore: Math.round(avgScore),
      topCombo: topProfile ? {
        main: topProfile.mainModelId,
        executor: topProfile.executorModelId,
        score: topProfile.overallScore
      } : null,
      modelsCovered: models.size
    };
  }

  /**
   * Creates a new `ComboProfile` object from a set of `ComboTestResult`s.
   * Calculates overall scores, performance metrics, and identifies strengths/weaknesses.
   * @param mainModelId - The ID of the main model.
   * @param executorModelId - The ID of the executor model.
   * @param results - An array of `ComboTestResult` objects.
   * @param options - Optional configuration, e.g., context size.
   * @returns A newly created `ComboProfile` object.
   */
  createProfile(
    mainModelId: string,
    executorModelId: string,
    results: ComboTestResult[],
    options?: {
      contextSize?: number;
    }
  ): ComboProfile {
    const passedTests = results.filter(r => r.passed).length;
    const failedTests = results.length - passedTests;
    const avgLatency = results.reduce((sum, r) => sum + r.latencyMs, 0) / results.length;
    const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;

    // Calculate component scores
    const intentTests = results.filter(r => r.testId.includes('intent'));
    const executionTests = results.filter(r => r.testId.includes('exec') || r.testId.includes('tool'));
    
    const intentAccuracy = intentTests.length > 0
      ? intentTests.reduce((sum, r) => sum + r.score, 0) / intentTests.length
      : avgScore;
    const executionSuccess = executionTests.length > 0
      ? executionTests.reduce((sum, r) => sum + r.score, 0) / executionTests.length
      : avgScore;

    // Determine strengths/weaknesses
    const strengths: string[] = [];
    const weaknesses: string[] = [];

    if (intentAccuracy >= 80) strengths.push('Intent understanding');
    if (executionSuccess >= 80) strengths.push('Tool execution');
    if (avgLatency < 1000) strengths.push('Fast response');
    if (passedTests / results.length >= 0.9) strengths.push('High reliability');

    if (intentAccuracy < 60) weaknesses.push('Intent understanding');
    if (executionSuccess < 60) weaknesses.push('Tool execution');
    if (avgLatency > 5000) weaknesses.push('Slow response');
    if (passedTests / results.length < 0.7) weaknesses.push('Low reliability');

    // Determine recommendations
    const recommendedFor: string[] = [];
    const notRecommendedFor: string[] = [];

    const ragTests = results.filter(r => r.testId.includes('rag'));
    const fileTests = results.filter(r => r.testId.includes('file') || r.testId.includes('read') || r.testId.includes('write'));

    if (ragTests.length > 0 && ragTests.every(r => r.passed)) {
      recommendedFor.push('code_understanding');
    } else if (ragTests.some(r => !r.passed)) {
      notRecommendedFor.push('code_understanding');
    }

    if (fileTests.length > 0 && fileTests.every(r => r.passed)) {
      recommendedFor.push('file_operations');
    } else if (fileTests.some(r => !r.passed)) {
      notRecommendedFor.push('file_operations');
    }

    return {
      mainModelId,
      executorModelId,
      testedAt: new Date().toISOString(),
      testVersion: 1,
      contextSize: options?.contextSize || 4096,
      
      overallScore: Math.round(avgScore),
      intentAccuracy: Math.round(intentAccuracy),
      executionSuccess: Math.round(executionSuccess),
      handoffQuality: Math.round((intentAccuracy + executionSuccess) / 2),
      
      avgLatencyMs: Math.round(avgLatency),
      totalTests: results.length,
      passedTests,
      failedTests,
      
      results,
      strengths,
      weaknesses,
      recommendedFor,
      notRecommendedFor
    };
  }
}

// ============================================================
// SINGLETON INSTANCE
// ============================================================

/**
 * The singleton instance of the ComboProfileStore.
 */
export const comboProfileStore = new ComboProfileStore();

export default comboProfileStore;


