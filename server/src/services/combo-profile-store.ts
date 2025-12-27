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

export interface ComboTestResult {
  testId: string;
  testName: string;
  passed: boolean;
  score: number;
  latencyMs: number;
  error?: string;
  details?: string;
}

export interface ComboProfile {
  mainModelId: string;
  executorModelId: string;
  testedAt: string;
  testVersion: number;
  contextSize: number;
  
  // Scores
  overallScore: number;
  intentAccuracy: number;       // How well main understood intent
  executionSuccess: number;     // How well executor executed
  handoffQuality: number;       // Quality of main→executor communication
  
  // Performance
  avgLatencyMs: number;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  
  // Test results
  results: ComboTestResult[];
  
  // Strengths/weaknesses
  strengths: string[];
  weaknesses: string[];
  
  // Recommendation
  recommendedFor: string[];     // e.g., ['code_understanding', 'file_operations']
  notRecommendedFor: string[];
}

// ============================================================
// COMBO PROFILE STORE
// ============================================================

const COMBO_PROFILES_DIR = path.join(__dirname, '../../data/combo-profiles');

class ComboProfileStore {
  constructor() {
    fs.ensureDirSync(COMBO_PROFILES_DIR);
  }

  /**
   * Generate a safe filename for a combo
   */
  private getFileName(mainModelId: string, executorModelId: string): string {
    const sanitize = (s: string) => s
      .toLowerCase()
      .replace(/[^a-z0-9-_.]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    
    return `${sanitize(mainModelId)}--${sanitize(executorModelId)}.json`;
  }

  /**
   * Get the path to a combo profile
   */
  private getPath(mainModelId: string, executorModelId: string): string {
    return path.join(COMBO_PROFILES_DIR, this.getFileName(mainModelId, executorModelId));
  }

  /**
   * Save a combo profile
   */
  async saveProfile(profile: ComboProfile): Promise<void> {
    const filePath = this.getPath(profile.mainModelId, profile.executorModelId);
    await fs.writeJson(filePath, profile, { spaces: 2 });
    console.log(`[ComboStore] Saved profile: ${profile.mainModelId} + ${profile.executorModelId}`);
  }

  /**
   * Get a combo profile
   */
  async getProfile(mainModelId: string, executorModelId: string): Promise<ComboProfile | null> {
    const filePath = this.getPath(mainModelId, executorModelId);
    
    try {
      if (await fs.pathExists(filePath)) {
        return await fs.readJson(filePath);
      }
    } catch (error) {
      console.error(`[ComboStore] Error loading profile:`, error);
    }

    return null;
  }

  /**
   * Get all combo profiles
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
      console.error(`[ComboStore] Error listing profiles:`, error);
    }

    return profiles;
  }

  /**
   * Get top N combos by score
   */
  async getTopCombos(limit: number = 10): Promise<ComboProfile[]> {
    const profiles = await this.getAllProfiles();
    return profiles
      .sort((a, b) => b.overallScore - a.overallScore)
      .slice(0, limit);
  }

  /**
   * Get combos for a specific main model
   */
  async getCombosForMain(mainModelId: string): Promise<ComboProfile[]> {
    const profiles = await this.getAllProfiles();
    return profiles
      .filter(p => p.mainModelId === mainModelId)
      .sort((a, b) => b.overallScore - a.overallScore);
  }

  /**
   * Get combos for a specific executor model
   */
  async getCombosForExecutor(executorModelId: string): Promise<ComboProfile[]> {
    const profiles = await this.getAllProfiles();
    return profiles
      .filter(p => p.executorModelId === executorModelId)
      .sort((a, b) => b.overallScore - a.overallScore);
  }

  /**
   * Find best executor for a given main model
   */
  async findBestExecutor(mainModelId: string): Promise<ComboProfile | null> {
    const combos = await this.getCombosForMain(mainModelId);
    return combos[0] || null;
  }

  /**
   * Find best main for a given executor
   */
  async findBestMain(executorModelId: string): Promise<ComboProfile | null> {
    const combos = await this.getCombosForExecutor(executorModelId);
    return combos[0] || null;
  }

  /**
   * Delete a combo profile
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
      console.error(`[ComboStore] Error deleting profile:`, error);
    }

    return false;
  }

  /**
   * Delete all profiles for a model
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
   * Clear all profiles
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
   * Get statistics
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
   * Create a profile from combo test results
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

export const comboProfileStore = new ComboProfileStore();

export default comboProfileStore;

