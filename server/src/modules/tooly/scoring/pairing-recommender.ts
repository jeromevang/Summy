/**
 * Main + Executor Pairing Recommender
 * Finds optimal model combinations for dual-model routing
 */

import type {
  AgenticScores,
  TrainabilityScores
} from '../types.js';

// ============================================================
// TYPES
// ============================================================

export interface ModelCandidate {
  modelId: string;
  displayName: string;
  rawScores: AgenticScores;
  trainabilityScores: TrainabilityScores;
  vramRequired?: number;
  contextLimit?: number;
  speedRating?: 'excellent' | 'good' | 'acceptable' | 'slow' | 'very_slow';
}

export interface PairingRecommendation {
  mainModel: ModelCandidate;
  executorModel: ModelCandidate;
  compatibilityScore: number;
  reasoning: string[];
  warnings: string[];
}

// ============================================================
// ROLE SUITABILITY SCORING
// ============================================================

/**
 * Score how suitable a model is for the Main role
 * Main: Planning, reasoning, RAG, context handling
 */
export function scoreForMainRole(candidate: ModelCandidate): number {
  const { rawScores, trainabilityScores } = candidate;
  
  let score = 0;
  
  // Reasoning is critical for Main
  score += rawScores.reasoning * 0.30;
  
  // RAG usage is important
  score += rawScores.ragUsage * 0.25;
  
  // Intent recognition helps with understanding tasks
  score += rawScores.intentRecognition * 0.20;
  
  // High trainability means we can improve it
  score += trainabilityScores.overallTrainability * 0.15;
  
  // Self-correction helps with complex tasks
  score += rawScores.selfCorrection * 0.10;
  
  return Math.round(score);
}

/**
 * Score how suitable a model is for the Executor role
 * Executor: Tool accuracy, speed, determinism
 */
export function scoreForExecutorRole(candidate: ModelCandidate): number {
  const { rawScores } = candidate;
  
  let score = 0;
  
  // Tool accuracy is critical for Executor
  score += rawScores.toolAccuracy * 0.50;
  
  // Lower anti-pattern penalty means more reliable
  score += (100 - rawScores.antiPatternPenalty) * 0.20;
  
  // Intent recognition helps pick right tool
  score += rawScores.intentRecognition * 0.15;
  
  // Speed bonus
  const speedBonus = getSpeedBonus(candidate.speedRating);
  score += speedBonus * 0.15;
  
  return Math.round(score);
}

function getSpeedBonus(rating?: string): number {
  switch (rating) {
    case 'excellent': return 100;
    case 'good': return 80;
    case 'acceptable': return 60;
    case 'slow': return 30;
    case 'very_slow': return 10;
    default: return 50;
  }
}

// ============================================================
// COMPATIBILITY SCORING
// ============================================================

/**
 * Calculate compatibility between a Main and Executor pair
 */
export function calculatePairCompatibility(
  main: ModelCandidate,
  executor: ModelCandidate
): { score: number; reasons: string[]; warnings: string[] } {
  const reasons: string[] = [];
  const warnings: string[] = [];
  let score = 0;
  
  // 1. Check that they complement each other
  const mainReasoning = main.rawScores.reasoning;
  const executorTools = executor.rawScores.toolAccuracy;
  
  if (mainReasoning >= 70 && executorTools >= 80) {
    score += 30;
    reasons.push('Strong reasoning (Main) + Strong tool accuracy (Executor)');
  } else if (mainReasoning >= 60 && executorTools >= 70) {
    score += 20;
    reasons.push('Good complementary capabilities');
  } else {
    warnings.push('One or both models may be underperforming');
  }
  
  // 2. Check trainability of Main (can we optimize it?)
  if (main.trainabilityScores.overallTrainability >= 80) {
    score += 20;
    reasons.push('Main model is highly trainable');
  } else if (main.trainabilityScores.overallTrainability < 50) {
    warnings.push('Main model has low trainability - limited optimization potential');
  }
  
  // 3. Check Executor speed
  if (executor.speedRating === 'excellent' || executor.speedRating === 'good') {
    score += 15;
    reasons.push('Executor has good speed');
  } else if (executor.speedRating === 'slow' || executor.speedRating === 'very_slow') {
    score -= 10;
    warnings.push('Executor is slow - may impact user experience');
  }
  
  // 4. Check VRAM fit (if both have VRAM info)
  if (main.vramRequired && executor.vramRequired) {
    // Assume they might run simultaneously or sequentially
    reasons.push(`Combined VRAM: ${main.vramRequired + executor.vramRequired}GB`);
  }
  
  // 5. Bonus for different model families (diversity can help)
  const mainFamily = extractModelFamily(main.modelId);
  const executorFamily = extractModelFamily(executor.modelId);
  if (mainFamily !== executorFamily) {
    score += 10;
    reasons.push('Different model families may provide diverse capabilities');
  }
  
  // 6. RAG capability of Main
  if (main.rawScores.ragUsage >= 80) {
    score += 15;
    reasons.push('Main excels at RAG usage');
  }
  
  // 7. Low anti-patterns in Executor
  if (executor.rawScores.antiPatternPenalty <= 20) {
    score += 10;
    reasons.push('Executor has few anti-patterns');
  } else if (executor.rawScores.antiPatternPenalty >= 50) {
    warnings.push('Executor has concerning anti-patterns');
  }
  
  return { 
    score: Math.max(0, Math.min(100, score)), 
    reasons, 
    warnings 
  };
}

function extractModelFamily(modelId: string): string {
  const lower = modelId.toLowerCase();
  if (lower.includes('qwen')) return 'qwen';
  if (lower.includes('llama')) return 'llama';
  if (lower.includes('mistral')) return 'mistral';
  if (lower.includes('phi')) return 'phi';
  if (lower.includes('gemma')) return 'gemma';
  if (lower.includes('deepseek')) return 'deepseek';
  if (lower.includes('codellama')) return 'codellama';
  return 'unknown';
}

// ============================================================
// PAIRING RECOMMENDATION
// ============================================================

/**
 * Find optimal Main + Executor pairing from a list of models
 */
export function findOptimalPairing(
  candidates: ModelCandidate[],
  vramLimit?: number
): PairingRecommendation | null {
  if (candidates.length < 2) {
    return null;
  }
  
  // Score each model for each role
  const mainScores = candidates.map(c => ({
    model: c,
    score: scoreForMainRole(c)
  })).sort((a, b) => b.score - a.score);
  
  const executorScores = candidates.map(c => ({
    model: c,
    score: scoreForExecutorRole(c)
  })).sort((a, b) => b.score - a.score);
  
  let bestPairing: PairingRecommendation | null = null;
  let bestScore = 0;
  
  // Try top candidates for each role
  const topMainCandidates = mainScores.slice(0, 3);
  const topExecutorCandidates = executorScores.slice(0, 3);
  
  for (const main of topMainCandidates) {
    for (const executor of topExecutorCandidates) {
      // Skip if same model
      if (main.model.modelId === executor.model.modelId) continue;
      
      // Check VRAM constraint
      if (vramLimit) {
        const totalVram = (main.model.vramRequired || 0) + (executor.model.vramRequired || 0);
        if (totalVram > vramLimit) continue;
      }
      
      const compatibility = calculatePairCompatibility(main.model, executor.model);
      const overallScore = (main.score + executor.score + compatibility.score) / 3;
      
      if (overallScore > bestScore) {
        bestScore = overallScore;
        bestPairing = {
          mainModel: main.model,
          executorModel: executor.model,
          compatibilityScore: compatibility.score,
          reasoning: compatibility.reasons,
          warnings: compatibility.warnings
        };
      }
    }
  }
  
  return bestPairing;
}

/**
 * Get optimal pairings for a specific model
 */
export function getOptimalPairingsForModel(
  targetModelId: string,
  role: 'main' | 'executor',
  allModels: ModelCandidate[]
): Array<{ partnerId: string; compatibilityScore: number; reasoning: string[] }> {
  const targetModel = allModels.find(m => m.modelId === targetModelId);
  if (!targetModel) return [];
  
  const others = allModels.filter(m => m.modelId !== targetModelId);
  const pairings: Array<{ partnerId: string; compatibilityScore: number; reasoning: string[] }> = [];
  
  for (const other of others) {
    const [main, executor] = role === 'main' 
      ? [targetModel, other] 
      : [other, targetModel];
    
    const compatibility = calculatePairCompatibility(main, executor);
    
    pairings.push({
      partnerId: other.modelId,
      compatibilityScore: compatibility.score,
      reasoning: compatibility.reasons
    });
  }
  
  return pairings.sort((a, b) => b.compatibilityScore - a.compatibilityScore);
}

export default {
  scoreForMainRole,
  scoreForExecutorRole,
  calculatePairCompatibility,
  findOptimalPairing,
  getOptimalPairingsForModel
};

