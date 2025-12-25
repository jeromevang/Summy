/**
 * Agentic Scorer
 * Calculates weighted scores for model capabilities in agentic coding tasks
 */

import type {
  AgenticScores,
  ScoreBreakdown,
  AntiPatternDetection,
  BaselineComparison
} from '../types.js';

// ============================================================
// AGENTIC SCORING WEIGHTS
// ============================================================

export const AGENTIC_WEIGHTS = {
  toolAccuracy: 0.20,
  intentRecognition: 0.18,
  ragUsage: 0.14,
  reasoning: 0.14,
  bugDetection: 0.10,
  codeUnderstanding: 0.10,
  selfCorrection: 0.06,
  antiPatternPenalty: 0.08  // Negative weight
} as const;

// ============================================================
// SCORE CALCULATION
// ============================================================

export interface RawScoreInputs {
  // From 1.x tool tests
  toolEmitScore: number;
  toolSchemaScore: number;
  toolSelectionScore: number;
  toolSuppressionScore: number;
  multiToolScore?: number;
  argValidationScore?: number;

  // From 2.x reasoning probes
  intentExtractionScore: number;
  multiStepPlanningScore: number;
  conditionalReasoningScore: number;
  contextContinuityScore: number;
  logicalConsistencyScore: number;

  // From 3.x RAG probes
  ragPriorityScore: number;
  ragChainingScore: number;
  ragErrorRecoveryScore: number;
  ragSynthesisScore: number;

  // From 4.x domain probes
  bugDetectionScore: number;
  architecturalScore: number;

  // From 5.x navigation probes
  navigationScore: number;

  // From 6.x helicopter probes
  helicopterScore: number;

  // From 7.x proactive probes
  proactiveScore: number;

  // From 8.x intent probes
  intentRecognitionScore: number;
  invokeCorrectnessScore: number;

  // From 9.x failure probes
  silentFailureScore: number;
  calibrationScore: number;
  correctionAcceptanceScore: number;

  // From 14.x compliance probes
  complianceScore: number;

  // Anti-patterns detected
  antiPatterns: AntiPatternDetection;
}

/**
 * Calculate the composite agentic score
 */
export function calculateAgenticScore(inputs: Partial<RawScoreInputs>): AgenticScores {
  // Tool Accuracy (average of 1.x tests)
  const toolAccuracy = average([
    inputs.toolEmitScore,
    inputs.toolSchemaScore,
    inputs.toolSelectionScore,
    inputs.toolSuppressionScore,
    inputs.multiToolScore,
    inputs.argValidationScore
  ]);

  // Intent Recognition (8.x tests)
  const intentRecognition = average([
    inputs.intentRecognitionScore,
    inputs.invokeCorrectnessScore
  ]);

  // RAG Usage (3.x tests)
  const ragUsage = average([
    inputs.ragPriorityScore,
    inputs.ragChainingScore,
    inputs.ragErrorRecoveryScore,
    inputs.ragSynthesisScore
  ]);

  // Reasoning (2.x tests)
  const reasoning = average([
    inputs.intentExtractionScore,
    inputs.multiStepPlanningScore,
    inputs.conditionalReasoningScore,
    inputs.contextContinuityScore,
    inputs.logicalConsistencyScore
  ]);

  // Bug Detection (4.x tests)
  const bugDetection = inputs.bugDetectionScore || 0;

  // Code Understanding (4.x + 5.x + 6.x)
  const codeUnderstanding = average([
    inputs.architecturalScore,
    inputs.navigationScore,
    inputs.helicopterScore
  ]);

  // Self-Correction (9.x tests)
  const selfCorrection = average([
    inputs.correctionAcceptanceScore,
    inputs.silentFailureScore
  ]);

  // Anti-pattern penalty
  const antiPatternPenalty = inputs.antiPatterns?.redFlagScore || 0;

  // Calculate overall score
  const overallScore = (
    toolAccuracy * AGENTIC_WEIGHTS.toolAccuracy +
    intentRecognition * AGENTIC_WEIGHTS.intentRecognition +
    ragUsage * AGENTIC_WEIGHTS.ragUsage +
    reasoning * AGENTIC_WEIGHTS.reasoning +
    bugDetection * AGENTIC_WEIGHTS.bugDetection +
    codeUnderstanding * AGENTIC_WEIGHTS.codeUnderstanding +
    selfCorrection * AGENTIC_WEIGHTS.selfCorrection -
    antiPatternPenalty * AGENTIC_WEIGHTS.antiPatternPenalty
  );

  return {
    toolAccuracy: Math.round(toolAccuracy),
    intentRecognition: Math.round(intentRecognition),
    ragUsage: Math.round(ragUsage),
    reasoning: Math.round(reasoning),
    bugDetection: Math.round(bugDetection),
    codeUnderstanding: Math.round(codeUnderstanding),
    selfCorrection: Math.round(selfCorrection),
    antiPatternPenalty: Math.round(antiPatternPenalty),
    overallScore: Math.round(Math.max(0, Math.min(100, overallScore)))
  };
}

/**
 * Calculate full score breakdown for all categories
 */
export function calculateScoreBreakdown(inputs: Partial<RawScoreInputs>): ScoreBreakdown {
  const toolScore = average([
    inputs.toolEmitScore,
    inputs.toolSchemaScore,
    inputs.toolSelectionScore,
    inputs.toolSuppressionScore
  ]);

  const reasoningScore = average([
    inputs.intentExtractionScore,
    inputs.multiStepPlanningScore,
    inputs.conditionalReasoningScore,
    inputs.logicalConsistencyScore
  ]);

  const ragScore = average([
    inputs.ragPriorityScore,
    inputs.ragChainingScore,
    inputs.ragErrorRecoveryScore
  ]);

  const bugDetectionScore = inputs.bugDetectionScore || 0;
  const architecturalScore = inputs.architecturalScore || 0;
  const navigationScore = inputs.navigationScore || 0;
  const helicopterScore = inputs.helicopterScore || 0;
  const proactiveScore = inputs.proactiveScore || 0;
  const intentScore = inputs.intentRecognitionScore || 0;
  const complianceScore = inputs.complianceScore || 0;

  // Calculate overall as weighted average
  const overallScore = (
    toolScore * 0.15 +
    reasoningScore * 0.12 +
    ragScore * 0.12 +
    bugDetectionScore * 0.10 +
    architecturalScore * 0.10 +
    navigationScore * 0.08 +
    helicopterScore * 0.08 +
    proactiveScore * 0.08 +
    intentScore * 0.10 +
    complianceScore * 0.07
  );

  return {
    toolScore: Math.round(toolScore),
    reasoningScore: Math.round(reasoningScore),
    ragScore: Math.round(ragScore),
    bugDetectionScore: Math.round(bugDetectionScore),
    architecturalScore: Math.round(architecturalScore),
    navigationScore: Math.round(navigationScore),
    helicopterScore: Math.round(helicopterScore),
    proactiveScore: Math.round(proactiveScore),
    intentScore: Math.round(intentScore),
    complianceScore: Math.round(complianceScore),
    overallScore: Math.round(Math.max(0, Math.min(100, overallScore)))
  };
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function average(values: (number | undefined)[]): number {
  const defined = values.filter((v): v is number => v !== undefined);
  if (defined.length === 0) return 0;
  return defined.reduce((sum, v) => sum + v, 0) / defined.length;
}

// ============================================================
// ROLE RECOMMENDATION
// ============================================================

/**
 * Recommend optimal role based on scores
 */
export function recommendRole(
  scores: AgenticScores
): 'main' | 'executor' | 'both' | 'none' {
  const { toolAccuracy, reasoning, intentRecognition, ragUsage } = scores;

  // Thresholds
  const HIGH_THRESHOLD = 80;
  const MEDIUM_THRESHOLD = 60;
  const LOW_THRESHOLD = 40;

  const goodForMain = reasoning >= HIGH_THRESHOLD &&
    intentRecognition >= MEDIUM_THRESHOLD &&
    ragUsage >= MEDIUM_THRESHOLD;

  const goodForExecutor = toolAccuracy >= HIGH_THRESHOLD;

  const isCompetent = scores.overallScore >= MEDIUM_THRESHOLD;

  if (!isCompetent) {
    return 'none';
  } else if (goodForMain && goodForExecutor) {
    return 'both';
  } else if (goodForMain) {
    return 'main';
  } else if (goodForExecutor) {
    return 'executor';
  } else {
    return 'none';
  }
}

/**
 * Calculate comparison between a model and a baseline
 */
export function calculateBaselineComparison(
  modelScores: AgenticScores,
  baselineScores: AgenticScores,
  modelId: string,
  baselineModelId: string
): BaselineComparison {
  const deltas: Partial<AgenticScores> = {
    toolAccuracy: modelScores.toolAccuracy - baselineScores.toolAccuracy,
    intentRecognition: modelScores.intentRecognition - baselineScores.intentRecognition,
    ragUsage: modelScores.ragUsage - baselineScores.ragUsage,
    reasoning: modelScores.reasoning - baselineScores.reasoning,
    bugDetection: modelScores.bugDetection - baselineScores.bugDetection,
    codeUnderstanding: modelScores.codeUnderstanding - baselineScores.codeUnderstanding,
    selfCorrection: modelScores.selfCorrection - baselineScores.selfCorrection,
    overallScore: modelScores.overallScore - baselineScores.overallScore,
  };

  const relativePerformance = baselineScores.overallScore > 0
    ? (modelScores.overallScore / baselineScores.overallScore) * 100
    : 100;

  const strengths: string[] = [];
  const weaknesses: string[] = [];

  // Identify strengths/weaknesses (delta > 10 or < -10)
  for (const [key, value] of Object.entries(deltas)) {
    if (key === 'overallScore') continue;
    if ((value as number) > 10) strengths.push(key);
    if ((value as number) < -10) weaknesses.push(key);
  }

  return {
    modelId,
    baselineModelId,
    timestamp: new Date().toISOString(),
    deltas,
    relativePerformance: Math.round(relativePerformance),
    strengths,
    weaknesses
  };
}

/**
 * Normalize scores against baseline performance
 */
export function normalizeAgainstBaseline(
  scores: AgenticScores,
  baselineScores: AgenticScores
): AgenticScores {
  // If baseline is perfect, no normalization needed
  if (baselineScores.overallScore >= 95) return scores;

  // Simple normalization: if baseline only gets 80, a model getting 80 is effectively a 100
  const factor = 100 / Math.max(baselineScores.overallScore, 1);

  return {
    toolAccuracy: Math.min(100, Math.round(scores.toolAccuracy * factor)),
    intentRecognition: Math.min(100, Math.round(scores.intentRecognition * factor)),
    ragUsage: Math.min(100, Math.round(scores.ragUsage * factor)),
    reasoning: Math.min(100, Math.round(scores.reasoning * factor)),
    bugDetection: Math.min(100, Math.round(scores.bugDetection * factor)),
    codeUnderstanding: Math.min(100, Math.round(scores.codeUnderstanding * factor)),
    selfCorrection: Math.min(100, Math.round(scores.selfCorrection * factor)),
    antiPatternPenalty: scores.antiPatternPenalty, // Penalty is absolute
    overallScore: Math.min(100, Math.round(scores.overallScore * factor))
  };
}

export default {
  calculateAgenticScore,
  calculateScoreBreakdown,
  recommendRole,
  AGENTIC_WEIGHTS,
  calculateBaselineComparison,
  normalizeAgainstBaseline
};

