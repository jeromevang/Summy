/**
 * Optimal Setup Finder
 * Scans available models and finds the best configuration
 */

import type { 
  HardwareProfile,
  OptimalSetupResult,
  ModelProfileV2,
  AgenticScores,
  TrainabilityScores
} from '../types.js';

import { scoreForMainRole, scoreForExecutorRole, findOptimalPairing, ModelCandidate } from '../scoring/pairing-recommender.js';

// ============================================================
// HARDWARE DETECTION
// ============================================================

export interface GPUInfo {
  name: string;
  vramMB: number;
  driver: string;
}

/**
 * Get hardware profile (simplified version - full implementation would use native bindings)
 */
export async function detectHardware(): Promise<HardwareProfile> {
  // This is a simplified version
  // Real implementation would use node-gpu-stats or similar
  
  return {
    gpuName: 'Unknown GPU',
    vramGB: 12, // Default assumption
    ramGB: 32,
    cpuCores: 8
  };
}

/**
 * Estimate VRAM requirement for a model based on name/size
 */
export function estimateVramRequirement(modelId: string): number {
  const lowerModel = modelId.toLowerCase();
  
  // Extract size from model name (e.g., "qwen-2.5-72b" -> 72)
  const sizeMatch = lowerModel.match(/(\d+)b/);
  const sizeB = sizeMatch ? parseInt(sizeMatch[1]) : 7;
  
  // Check for quantization
  let quantMultiplier = 1.0;
  if (lowerModel.includes('q4')) quantMultiplier = 0.5;
  else if (lowerModel.includes('q5')) quantMultiplier = 0.6;
  else if (lowerModel.includes('q6')) quantMultiplier = 0.7;
  else if (lowerModel.includes('q8')) quantMultiplier = 0.9;
  else if (lowerModel.includes('gguf')) quantMultiplier = 0.5; // Assume Q4 for GGUF
  
  // Rough VRAM estimate: ~1GB per 1B params for Q4
  const baseVram = sizeB * 1.0 * quantMultiplier;
  
  // Add overhead (~10%)
  return Math.ceil(baseVram * 1.1);
}

// ============================================================
// MODEL SCANNING
// ============================================================

export interface ScanResult {
  modelId: string;
  displayName: string;
  estimatedVram: number;
  available: boolean;
}

/**
 * Check if a model fits in available VRAM
 */
export function fitsInVram(modelVram: number, availableVram: number): boolean {
  // Leave 10% buffer
  return modelVram < availableVram * 0.9;
}

/**
 * Filter models by hardware constraints
 */
export function filterByHardware(
  models: ScanResult[],
  hardware: HardwareProfile
): ScanResult[] {
  return models.filter(m => fitsInVram(m.estimatedVram, hardware.vramGB));
}

// ============================================================
// OPTIMAL SETUP CALCULATION
// ============================================================

export interface OptimalSetupInput {
  hardware: HardwareProfile;
  testedModels: Array<{
    modelId: string;
    displayName: string;
    rawScores: AgenticScores;
    trainabilityScores: TrainabilityScores;
    vramRequired?: number;
    speedRating?: 'excellent' | 'good' | 'acceptable' | 'slow' | 'very_slow';
  }>;
}

/**
 * Find optimal setup from tested models
 */
export function findOptimalSetup(input: OptimalSetupInput): OptimalSetupResult {
  const { hardware, testedModels } = input;
  
  // Filter to models that fit
  const fittingModels = testedModels.filter(m => 
    !m.vramRequired || fitsInVram(m.vramRequired, hardware.vramGB)
  );
  
  // Convert to candidates
  const candidates: ModelCandidate[] = fittingModels.map(m => ({
    modelId: m.modelId,
    displayName: m.displayName,
    rawScores: m.rawScores,
    trainabilityScores: m.trainabilityScores,
    vramRequired: m.vramRequired,
    speedRating: m.speedRating
  }));
  
  // Score for each role
  const mainCandidates = candidates
    .map(c => ({ ...c, mainScore: scoreForMainRole(c) }))
    .sort((a, b) => b.mainScore - a.mainScore)
    .slice(0, 5);
  
  const executorCandidates = candidates
    .map(c => ({ ...c, executorScore: scoreForExecutorRole(c) }))
    .sort((a, b) => b.executorScore - a.executorScore)
    .slice(0, 5);
  
  // Find optimal pairing
  const pairing = findOptimalPairing(candidates, hardware.vramGB);
  
  let recommendedPairing = {
    mainModel: mainCandidates[0]?.modelId || '',
    executorModel: executorCandidates[0]?.modelId || '',
    confidence: 50,
    reasoning: 'Default selection based on individual scores'
  };
  
  if (pairing) {
    recommendedPairing = {
      mainModel: pairing.mainModel.modelId,
      executorModel: pairing.executorModel.modelId,
      confidence: pairing.compatibilityScore,
      reasoning: pairing.reasoning.join('; ')
    };
  }
  
  // Handle single-model case (same model for both roles)
  if (recommendedPairing.mainModel === recommendedPairing.executorModel) {
    const model = candidates.find(c => c.modelId === recommendedPairing.mainModel);
    if (model) {
      recommendedPairing.reasoning = 'Single model handles both roles well';
      recommendedPairing.confidence = Math.min(model.rawScores.overallScore, 90);
    }
  }
  
  return {
    hardware,
    scannedModels: testedModels.length,
    testedModels: testedModels.length,
    topMainCandidates: mainCandidates.map(c => ({
      modelId: c.modelId,
      score: c.mainScore,
      vramRequired: c.vramRequired || 0
    })),
    topExecutorCandidates: executorCandidates.map(c => ({
      modelId: c.modelId,
      score: c.executorScore,
      vramRequired: c.vramRequired || 0
    })),
    recommendedPairing
  };
}

// ============================================================
// COMPARATIVE TESTING
// ============================================================

export interface CompareResult {
  modelA: string;
  modelB: string;
  winner: 'A' | 'B' | 'tie';
  categories: {
    category: string;
    winnerA: boolean;
    scoreA: number;
    scoreB: number;
  }[];
  recommendation: string;
}

/**
 * Compare two models head-to-head
 */
export function compareModels(
  modelA: { modelId: string; scores: AgenticScores },
  modelB: { modelId: string; scores: AgenticScores }
): CompareResult {
  const categories = [
    { category: 'Tool Accuracy', keyA: modelA.scores.toolAccuracy, keyB: modelB.scores.toolAccuracy },
    { category: 'Intent Recognition', keyA: modelA.scores.intentRecognition, keyB: modelB.scores.intentRecognition },
    { category: 'RAG Usage', keyA: modelA.scores.ragUsage, keyB: modelB.scores.ragUsage },
    { category: 'Reasoning', keyA: modelA.scores.reasoning, keyB: modelB.scores.reasoning },
    { category: 'Bug Detection', keyA: modelA.scores.bugDetection, keyB: modelB.scores.bugDetection },
    { category: 'Code Understanding', keyA: modelA.scores.codeUnderstanding, keyB: modelB.scores.codeUnderstanding },
  ];
  
  let winsA = 0;
  let winsB = 0;
  
  const categoryResults = categories.map(cat => {
    const winnerA = cat.keyA > cat.keyB;
    if (cat.keyA > cat.keyB) winsA++;
    else if (cat.keyB > cat.keyA) winsB++;
    
    return {
      category: cat.category,
      winnerA,
      scoreA: cat.keyA,
      scoreB: cat.keyB
    };
  });
  
  let winner: 'A' | 'B' | 'tie' = 'tie';
  if (winsA > winsB + 1) winner = 'A';
  else if (winsB > winsA + 1) winner = 'B';
  
  // Generate recommendation
  let recommendation = '';
  if (winner === 'A') {
    recommendation = `${modelA.modelId} is stronger overall, especially in ` +
      categoryResults.filter(c => c.winnerA).map(c => c.category).join(', ');
  } else if (winner === 'B') {
    recommendation = `${modelB.modelId} is stronger overall, especially in ` +
      categoryResults.filter(c => !c.winnerA).map(c => c.category).join(', ');
  } else {
    recommendation = 'Both models are comparable. Consider using them together: ' +
      `${modelA.modelId} as Main, ${modelB.modelId} as Executor`;
  }
  
  return {
    modelA: modelA.modelId,
    modelB: modelB.modelId,
    winner,
    categories: categoryResults,
    recommendation
  };
}

// ============================================================
// QUICK ASSESSMENT
// ============================================================

/**
 * Quick model assessment without full testing
 * Uses heuristics based on model name/family
 */
export function quickAssessModel(modelId: string): {
  estimatedTier: 'top' | 'mid' | 'low';
  strengths: string[];
  weaknesses: string[];
  recommendedRole: 'main' | 'executor' | 'both' | 'unknown';
} {
  const lowerModel = modelId.toLowerCase();
  
  // Known strong models for agentic tasks
  const topTierPatterns = [
    { pattern: /qwen.*2\.5.*(72b|32b|14b)/, strengths: ['tool use', 'reasoning'], role: 'both' as const },
    { pattern: /llama.*3\.(2|3).*(70b|405b)/, strengths: ['reasoning', 'context'], role: 'main' as const },
    { pattern: /deepseek.*coder.*v2/, strengths: ['coding', 'tool use'], role: 'executor' as const },
    { pattern: /claude/, strengths: ['reasoning', 'safety'], role: 'main' as const },
  ];
  
  const midTierPatterns = [
    { pattern: /qwen.*2\.5.*(7b|3b)/, role: 'executor' as const },
    { pattern: /llama.*3\.(1|2).*(8b|11b)/, role: 'executor' as const },
    { pattern: /mistral.*(7b|8x7b)/, role: 'executor' as const },
    { pattern: /phi.*3/, role: 'executor' as const },
  ];
  
  for (const tier of topTierPatterns) {
    if (tier.pattern.test(lowerModel)) {
      return {
        estimatedTier: 'top',
        strengths: tier.strengths,
        weaknesses: [],
        recommendedRole: tier.role
      };
    }
  }
  
  for (const tier of midTierPatterns) {
    if (tier.pattern.test(lowerModel)) {
      return {
        estimatedTier: 'mid',
        strengths: ['fast', 'efficient'],
        weaknesses: ['limited reasoning'],
        recommendedRole: tier.role
      };
    }
  }
  
  return {
    estimatedTier: 'low',
    strengths: [],
    weaknesses: ['unknown capabilities'],
    recommendedRole: 'unknown'
  };
}

export default {
  detectHardware,
  estimateVramRequirement,
  fitsInVram,
  filterByHardware,
  findOptimalSetup,
  compareModels,
  quickAssessModel
};

