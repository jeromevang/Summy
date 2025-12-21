/**
 * Badge System
 * Awards badges based on model probe scores
 */

// ============================================================
// TYPES
// ============================================================

export interface Badge {
  id: string;
  name: string;
  icon: string;
  description: string;
  earned: boolean;
  score?: number;
  threshold: number;
}

export interface BadgeScores {
  ragScore?: number;
  bugDetectionScore?: number;
  architecturalScore?: number;
  navigationScore?: number;
  proactiveScore?: number;
  speedRating?: 'excellent' | 'good' | 'acceptable' | 'slow' | 'very_slow';
  toolScore?: number;
  reasoningScore?: number;
  intentScore?: number;           // Intent recognition score
  invokeCorrectness?: number;     // % correct tool invocation decisions
  overInvocationRate?: number;    // % unnecessary tool calls
}

// ============================================================
// BADGE DEFINITIONS
// ============================================================

export const BADGE_DEFINITIONS: Omit<Badge, 'earned' | 'score'>[] = [
  { 
    id: 'rag_expert', 
    name: 'RAG Expert', 
    icon: '🔍', 
    description: 'RAG score ≥90%', 
    threshold: 90 
  },
  { 
    id: 'bug_hunter', 
    name: 'Bug Hunter', 
    icon: '🐛', 
    description: 'Bug detection ≥85%', 
    threshold: 85 
  },
  { 
    id: 'architect', 
    name: 'Architect', 
    icon: '🏗️', 
    description: 'Architectural awareness ≥85%', 
    threshold: 85 
  },
  { 
    id: 'navigator', 
    name: 'Navigator', 
    icon: '🧭', 
    description: 'Navigation ≥90%', 
    threshold: 90 
  },
  { 
    id: 'helpful', 
    name: 'Helpful', 
    icon: '💡', 
    description: 'Proactive ≥85%', 
    threshold: 85 
  },
  { 
    id: 'speed_demon', 
    name: 'Speed Demon', 
    icon: '⚡', 
    description: 'Excellent latency', 
    threshold: 0  // Special handling
  },
  { 
    id: 'tool_master', 
    name: 'Tool Master', 
    icon: '🔧', 
    description: 'Tool score ≥90%', 
    threshold: 90 
  },
  { 
    id: 'thinker', 
    name: 'Thinker', 
    icon: '🧠', 
    description: 'Reasoning score ≥85%', 
    threshold: 85 
  },
  { 
    id: 'intuitive', 
    name: 'Intuitive', 
    icon: '🎯', 
    description: 'Intent recognition ≥85%', 
    threshold: 85 
  },
  { 
    id: 'disciplined', 
    name: 'Disciplined', 
    icon: '🎖️', 
    description: 'Low over-invocation (<15%)', 
    threshold: 85  // 100 - 15 = 85 (inverted for badge check)
  },
];

// ============================================================
// BADGE CALCULATION
// ============================================================

/**
 * Calculate which badges a model has earned based on scores
 */
export function calculateBadges(scores: BadgeScores): Badge[] {
  return BADGE_DEFINITIONS.map(def => {
    let earned = false;
    let score: number | undefined;

    switch (def.id) {
      case 'rag_expert':
        score = scores.ragScore;
        earned = (score ?? 0) >= def.threshold;
        break;
        
      case 'bug_hunter':
        score = scores.bugDetectionScore;
        earned = (score ?? 0) >= def.threshold;
        break;
        
      case 'architect':
        score = scores.architecturalScore;
        earned = (score ?? 0) >= def.threshold;
        break;
        
      case 'navigator':
        score = scores.navigationScore;
        earned = (score ?? 0) >= def.threshold;
        break;
        
      case 'helpful':
        score = scores.proactiveScore;
        earned = (score ?? 0) >= def.threshold;
        break;
        
      case 'speed_demon':
        // Special case: based on speed rating, not numeric score
        earned = scores.speedRating === 'excellent';
        break;
        
      case 'tool_master':
        score = scores.toolScore;
        earned = (score ?? 0) >= def.threshold;
        break;
        
      case 'thinker':
        score = scores.reasoningScore;
        earned = (score ?? 0) >= def.threshold;
        break;
        
      case 'intuitive':
        score = scores.intentScore ?? scores.invokeCorrectness;
        earned = (score ?? 0) >= def.threshold;
        break;
        
      case 'disciplined':
        // Lower over-invocation is better, so we invert
        score = scores.overInvocationRate !== undefined 
          ? 100 - scores.overInvocationRate 
          : undefined;
        earned = (score ?? 0) >= def.threshold;
        break;
    }

    return {
      ...def,
      earned,
      score,
    };
  });
}

/**
 * Get earned badges only (for compact display)
 */
export function getEarnedBadges(scores: BadgeScores): Badge[] {
  return calculateBadges(scores).filter(b => b.earned);
}

/**
 * Get badge icons string (for display in lists)
 */
export function getBadgeIconsString(scores: BadgeScores): string {
  return getEarnedBadges(scores).map(b => b.icon).join(' ');
}

/**
 * Count earned badges
 */
export function countEarnedBadges(scores: BadgeScores): number {
  return getEarnedBadges(scores).length;
}

// ============================================================
// SCORE EXTRACTION FROM MODEL PROFILE
// ============================================================

/**
 * Extract badge scores from a model profile
 */
export function extractBadgeScores(profile: any): BadgeScores {
  const probeResults = profile.probeResults || {};
  const contextLatency = profile.contextLatency || {};
  
  // Check for direct scoreBreakdown from new probe engine
  const scoreBreakdown = probeResults.scoreBreakdown || {};
  
  // If we have scoreBreakdown from new probe engine, use it directly
  if (Object.keys(scoreBreakdown).length > 0) {
    return {
      ragScore: scoreBreakdown.ragScore ?? probeResults.overallScore,
      bugDetectionScore: scoreBreakdown.bugDetectionScore ?? probeResults.overallScore,
      architecturalScore: scoreBreakdown.architecturalScore ?? probeResults.overallScore,
      navigationScore: scoreBreakdown.navigationScore ?? probeResults.overallScore,
      proactiveScore: scoreBreakdown.proactiveScore ?? probeResults.overallScore,
      speedRating: contextLatency.speedRating,
      toolScore: scoreBreakdown.toolScore ?? probeResults.toolScore,
      reasoningScore: scoreBreakdown.reasoningScore ?? probeResults.reasoningScore,
      intentScore: scoreBreakdown.intentScore,
      invokeCorrectness: probeResults.intentScores?.invokeCorrectness,
      overInvocationRate: probeResults.intentScores?.overInvocationRate,
    };
  }
  
  // Fallback: Calculate from legacy probe structure
  const strategicProbes = probeResults.strategicRAGProbes || probeResults.strategicProbes || [];
  const architecturalProbes = probeResults.architecturalProbes || [];
  const navigationProbes = probeResults.navigationProbes || [];
  const helicopterProbes = probeResults.helicopterProbes || [];
  const proactiveProbes = probeResults.proactiveProbes || [];
  const intentProbes = probeResults.intentProbes || [];
  
  // Calculate aggregate scores from arrays
  const calculateArrayScore = (arr: any[]): number | undefined => {
    if (!Array.isArray(arr) || arr.length === 0) return undefined;
    return Math.round(arr.reduce((sum, p) => sum + (p.score || 0), 0) / arr.length);
  };
  
  const ragScore = calculateArrayScore(strategicProbes);
  const archScore = calculateArrayScore(architecturalProbes);
  const heliScore = calculateArrayScore(helicopterProbes);
  const architecturalScore = archScore !== undefined && heliScore !== undefined 
    ? Math.round((archScore + heliScore) / 2)
    : (archScore ?? heliScore ?? probeResults.overallScore);
  const navigationScore = calculateArrayScore(navigationProbes);
  const proactiveScore = calculateArrayScore(proactiveProbes);
  const intentScore = calculateArrayScore(intentProbes);
  
  // Bug detection from specific architectural probes (4.2, 4.3, 4.4)
  const bugProbes = architecturalProbes.filter((p: any) => ['4.2', '4.3', '4.4'].includes(p.id));
  const bugDetectionScore = bugProbes.length > 0 
    ? calculateArrayScore(bugProbes) 
    : archScore;
  
  return {
    ragScore: ragScore ?? probeResults.overallScore,
    bugDetectionScore: bugDetectionScore ?? probeResults.overallScore,
    architecturalScore: architecturalScore,
    navigationScore: navigationScore ?? probeResults.overallScore,
    proactiveScore: proactiveScore ?? probeResults.overallScore,
    speedRating: contextLatency.speedRating,
    toolScore: probeResults.toolScore,
    reasoningScore: probeResults.reasoningScore,
    intentScore: intentScore ?? probeResults.intentScores?.overallIntentScore,
    invokeCorrectness: probeResults.intentScores?.invokeCorrectness,
    overInvocationRate: probeResults.intentScores?.overInvocationRate,
  };
}

/**
 * Calculate average score for a category of probes
 */
function calculateCategoryScore(probes: Record<string, any>): number | undefined {
  const scores = Object.values(probes)
    .filter((p: any) => typeof p?.score === 'number')
    .map((p: any) => p.score);
  
  if (scores.length === 0) return undefined;
  
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

export default {
  BADGE_DEFINITIONS,
  calculateBadges,
  getEarnedBadges,
  getBadgeIconsString,
  countEarnedBadges,
  extractBadgeScores,
};

