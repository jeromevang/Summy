/**
 * Trainability Scorer
 * Calculates how "programmable" a model is through prompting
 * Models with high trainability can be improved through prompt engineering
 */

import type { 
  TrainabilityScores,
  SystemPromptCompliance
} from '../types.js';

// ============================================================
// TRAINABILITY WEIGHTS
// ============================================================

export const TRAINABILITY_WEIGHTS = {
  systemPromptCompliance: 0.50,
  instructionPersistence: 0.25,
  correctionAcceptance: 0.25
} as const;

// ============================================================
// TRAINABILITY CALCULATION
// ============================================================

export interface TrainabilityInputs {
  // From 14.x compliance tests
  complianceResults: SystemPromptCompliance;
  
  // From 10.x stateful tests
  instructionDecayTurn?: number;  // Turn where instruction starts failing
  maxReliableContext?: number;    // Tokens before degradation
  recoversWithReminder?: boolean;
  
  // From 9.x failure tests
  correctionAcceptanceScore: number;
}

/**
 * Calculate trainability scores
 */
export function calculateTrainabilityScores(
  inputs: TrainabilityInputs
): TrainabilityScores {
  // System Prompt Compliance (from 14.x)
  const systemPromptCompliance = inputs.complianceResults.overallComplianceScore;
  
  // Instruction Persistence (from 10.x)
  // Convert decay turn to a score (later decay = better)
  let instructionPersistence = 100;
  if (inputs.instructionDecayTurn !== undefined) {
    if (inputs.instructionDecayTurn <= 5) {
      instructionPersistence = 20;
    } else if (inputs.instructionDecayTurn <= 10) {
      instructionPersistence = 40;
    } else if (inputs.instructionDecayTurn <= 25) {
      instructionPersistence = 60;
    } else if (inputs.instructionDecayTurn <= 50) {
      instructionPersistence = 80;
    }
  }
  
  // Add bonus for recovery with reminder
  if (inputs.recoversWithReminder) {
    instructionPersistence = Math.min(100, instructionPersistence + 15);
  }
  
  // Correction Acceptance (from 9.3)
  const correctionAcceptance = inputs.correctionAcceptanceScore;
  
  // Calculate overall trainability
  const overallTrainability = (
    systemPromptCompliance * TRAINABILITY_WEIGHTS.systemPromptCompliance +
    instructionPersistence * TRAINABILITY_WEIGHTS.instructionPersistence +
    correctionAcceptance * TRAINABILITY_WEIGHTS.correctionAcceptance
  );
  
  return {
    systemPromptCompliance: Math.round(systemPromptCompliance),
    instructionPersistence: Math.round(instructionPersistence),
    correctionAcceptance: Math.round(correctionAcceptance),
    overallTrainability: Math.round(overallTrainability)
  };
}

/**
 * Get programmability rating from trainability score
 */
export function getProgrammabilityRating(
  trainabilityScore: number
): 'high' | 'medium' | 'low' {
  if (trainabilityScore >= 80) return 'high';
  if (trainabilityScore >= 50) return 'medium';
  return 'low';
}

/**
 * Calculate effective score considering trainability
 * A model with high trainability can be improved through prompting
 */
export function calculateEffectiveScore(
  rawScore: number,
  trainabilityScore: number
): number {
  // If raw score is already high (>80), trainability matters less
  if (rawScore >= 80) {
    return rawScore;
  }
  
  // For lower scores, high trainability adds potential
  // A model scoring 60 with 90% trainability could potentially reach ~75
  const improvementPotential = (100 - rawScore) * (trainabilityScore / 100) * 0.3;
  
  return Math.round(Math.min(100, rawScore + improvementPotential));
}

/**
 * Determine if a model is worth investing in (training through prompts)
 */
export function isWorthTraining(
  rawScore: number,
  trainabilityScore: number
): { worthIt: boolean; reason: string } {
  if (rawScore >= 80) {
    return { 
      worthIt: false, 
      reason: 'Already performing well, optimization optional' 
    };
  }
  
  if (rawScore < 40 && trainabilityScore < 50) {
    return { 
      worthIt: false, 
      reason: 'Too weak and not trainable' 
    };
  }
  
  if (rawScore < 60 && trainabilityScore >= 70) {
    return { 
      worthIt: true, 
      reason: 'Weak but highly trainable - worth optimizing' 
    };
  }
  
  if (rawScore >= 60 && trainabilityScore >= 50) {
    return { 
      worthIt: true, 
      reason: 'Good potential with moderate training' 
    };
  }
  
  return { 
    worthIt: false, 
    reason: 'Limited improvement potential' 
  };
}

export default {
  calculateTrainabilityScores,
  getProgrammabilityRating,
  calculateEffectiveScore,
  isWorthTraining,
  TRAINABILITY_WEIGHTS
};

