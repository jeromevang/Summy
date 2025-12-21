/**
 * Recommendation Engine
 * Suggests what tasks a model is best suited for based on probe scores
 */

// ============================================================
// TYPES
// ============================================================

export type RecommendationStatus = 'excellent' | 'good' | 'caution' | 'not_suitable';

export interface Recommendation {
  id: string;
  task: string;
  status: RecommendationStatus;
  score: number;
  description: string;
  alternative?: {
    modelId: string;
    modelName: string;
    score: number;
  };
}

export interface ModelScores {
  ragScore?: number;
  architecturalScore?: number;
  navigationScore?: number;
  proactiveScore?: number;
  bugDetectionScore?: number;
  toolScore?: number;
  reasoningScore?: number;
  overallScore?: number;
}

export interface AlternativeModel {
  modelId: string;
  modelName: string;
  scores: ModelScores;
}

// ============================================================
// TASK DEFINITIONS
// ============================================================

interface TaskDefinition {
  id: string;
  task: string;
  scoreKey: keyof ModelScores;
  thresholds: {
    excellent: number;
    good: number;
    caution: number;
  };
  descriptions: Record<RecommendationStatus, string>;
}

const TASK_DEFINITIONS: TaskDefinition[] = [
  {
    id: 'rag_search',
    task: 'RAG-based code search',
    scoreKey: 'ragScore',
    thresholds: { excellent: 85, good: 70, caution: 50 },
    descriptions: {
      excellent: 'Excellent at finding relevant code using semantic search',
      good: 'Good at semantic code search with occasional misses',
      caution: 'May struggle with complex semantic queries',
      not_suitable: 'Does not effectively use RAG for code search',
    },
  },
  {
    id: 'architecture',
    task: 'Architecture understanding',
    scoreKey: 'architecturalScore',
    thresholds: { excellent: 85, good: 70, caution: 50 },
    descriptions: {
      excellent: 'Strong understanding of code architecture and patterns',
      good: 'Can identify most architectural patterns',
      caution: 'Limited architectural awareness',
      not_suitable: 'Cannot reliably understand project architecture',
    },
  },
  {
    id: 'navigation',
    task: 'Code navigation',
    scoreKey: 'navigationScore',
    thresholds: { excellent: 85, good: 70, caution: 50 },
    descriptions: {
      excellent: 'Efficiently navigates and finds code across the codebase',
      good: 'Good navigation skills with minor inefficiencies',
      caution: 'May take multiple attempts to find relevant code',
      not_suitable: 'Struggles to locate code effectively',
    },
  },
  {
    id: 'code_review',
    task: 'Code review',
    scoreKey: 'proactiveScore',
    thresholds: { excellent: 85, good: 70, caution: 50 },
    descriptions: {
      excellent: 'Proactively identifies issues and suggests improvements',
      good: 'Provides useful code review feedback',
      caution: 'Review feedback is inconsistent',
      not_suitable: 'Does not provide meaningful code review',
    },
  },
  {
    id: 'bug_detection',
    task: 'Security audits / Bug detection',
    scoreKey: 'bugDetectionScore',
    thresholds: { excellent: 85, good: 70, caution: 50 },
    descriptions: {
      excellent: 'Reliably catches security issues and bugs',
      good: 'Finds most common bugs and vulnerabilities',
      caution: 'May miss subtle bugs or security issues',
      not_suitable: 'Cannot reliably detect bugs or security issues',
    },
  },
  {
    id: 'refactoring',
    task: 'Refactoring suggestions',
    scoreKey: 'proactiveScore',
    thresholds: { excellent: 85, good: 70, caution: 50 },
    descriptions: {
      excellent: 'Provides excellent refactoring suggestions',
      good: 'Suggests reasonable code improvements',
      caution: 'Refactoring suggestions may be limited',
      not_suitable: 'Does not provide useful refactoring guidance',
    },
  },
  {
    id: 'tool_usage',
    task: 'Tool-based automation',
    scoreKey: 'toolScore',
    thresholds: { excellent: 90, good: 75, caution: 55 },
    descriptions: {
      excellent: 'Excellent at using tools for automation tasks',
      good: 'Reliable tool usage with occasional errors',
      caution: 'Tool usage is inconsistent',
      not_suitable: 'Cannot reliably use tools',
    },
  },
  {
    id: 'reasoning',
    task: 'Complex reasoning tasks',
    scoreKey: 'reasoningScore',
    thresholds: { excellent: 85, good: 70, caution: 50 },
    descriptions: {
      excellent: 'Strong reasoning and planning capabilities',
      good: 'Good at multi-step reasoning',
      caution: 'May struggle with complex reasoning',
      not_suitable: 'Limited reasoning capabilities',
    },
  },
];

// ============================================================
// RECOMMENDATION CALCULATION
// ============================================================

/**
 * Determine recommendation status based on score and thresholds
 */
function getStatus(score: number | undefined, thresholds: TaskDefinition['thresholds']): RecommendationStatus {
  if (score === undefined) return 'not_suitable';
  if (score >= thresholds.excellent) return 'excellent';
  if (score >= thresholds.good) return 'good';
  if (score >= thresholds.caution) return 'caution';
  return 'not_suitable';
}

/**
 * Calculate recommendations for a model based on its scores
 */
export function calculateRecommendations(
  scores: ModelScores,
  alternatives?: AlternativeModel[]
): Recommendation[] {
  return TASK_DEFINITIONS.map(task => {
    const score = scores[task.scoreKey] ?? scores.overallScore ?? 0;
    const status = getStatus(score, task.thresholds);
    
    // Find a better alternative if this model isn't excellent
    let alternative: Recommendation['alternative'] | undefined;
    if (status !== 'excellent' && alternatives && alternatives.length > 0) {
      const betterModel = alternatives.find(alt => {
        const altScore = alt.scores[task.scoreKey] ?? alt.scores.overallScore ?? 0;
        return altScore > score + 10; // Must be significantly better
      });
      
      if (betterModel) {
        alternative = {
          modelId: betterModel.modelId,
          modelName: betterModel.modelName,
          score: betterModel.scores[task.scoreKey] ?? betterModel.scores.overallScore ?? 0,
        };
      }
    }
    
    return {
      id: task.id,
      task: task.task,
      status,
      score: Math.round(score),
      description: task.descriptions[status],
      alternative,
    };
  });
}

/**
 * Get only positive recommendations (excellent or good)
 */
export function getPositiveRecommendations(scores: ModelScores): Recommendation[] {
  return calculateRecommendations(scores).filter(
    r => r.status === 'excellent' || r.status === 'good'
  );
}

/**
 * Get top N tasks this model excels at
 */
export function getTopTasks(scores: ModelScores, limit: number = 3): Recommendation[] {
  return calculateRecommendations(scores)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Get a summary string of what the model is best for
 */
export function getBestForSummary(scores: ModelScores): string {
  const excellent = calculateRecommendations(scores)
    .filter(r => r.status === 'excellent')
    .map(r => r.task);
  
  if (excellent.length === 0) {
    const good = calculateRecommendations(scores)
      .filter(r => r.status === 'good')
      .slice(0, 2)
      .map(r => r.task);
    
    if (good.length === 0) return 'Limited use cases';
    return `Good for: ${good.join(', ')}`;
  }
  
  if (excellent.length === 1) return `Best for: ${excellent[0]}`;
  if (excellent.length === 2) return `Best for: ${excellent.join(' and ')}`;
  return `Best for: ${excellent.slice(0, 2).join(', ')} +${excellent.length - 2} more`;
}

export default {
  calculateRecommendations,
  getPositiveRecommendations,
  getTopTasks,
  getBestForSummary,
};

