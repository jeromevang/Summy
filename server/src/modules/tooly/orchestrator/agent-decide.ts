/**
 * Agent Decide
 * Explicit strategy selection layer for the Decision Engine
 * Prevents thrashing between options by outputting explicit intent
 */

import type { StructuredUnderstanding, AgentDecision, Strategy, ToolIntent } from './decision-engine.js';
import learningSystem from '../learning/learning-system.js';

// ============================================================
// TYPES
// ============================================================

export interface DecisionContext {
    query: string;
    understanding: StructuredUnderstanding;
    history?: { query: string; decision: AgentDecision }[];
    constraints?: string[];
}

export interface StrategyScore {
    strategy: Strategy;
    score: number;
    reasons: string[];
}

// ============================================================
// STRATEGY PATTERNS
// ============================================================

const TOOL_PATTERNS: { pattern: RegExp; tool: string; confidence: number }[] = [
    { pattern: /create\s+(a\s+)?(new\s+)?file/i, tool: 'write_file', confidence: 85 },
    { pattern: /delete\s+(the\s+)?file/i, tool: 'delete_file', confidence: 80 },
    { pattern: /read\s+(the\s+)?file/i, tool: 'read_file', confidence: 90 },
    { pattern: /edit\s+(the\s+)?file/i, tool: 'edit_file', confidence: 85 },
    { pattern: /run\s+(the\s+)?command/i, tool: 'shell_exec', confidence: 75 },
    { pattern: /execute\s+/i, tool: 'shell_exec', confidence: 70 },
    { pattern: /search\s+(for\s+)?files/i, tool: 'search_files', confidence: 80 },
    { pattern: /list\s+(the\s+)?directory/i, tool: 'list_directory', confidence: 85 },
    { pattern: /git\s+status/i, tool: 'git_status', confidence: 90 },
    { pattern: /git\s+diff/i, tool: 'git_diff', confidence: 90 },
    { pattern: /git\s+commit/i, tool: 'git_commit', confidence: 85 },
    { pattern: /npm\s+install/i, tool: 'npm_install', confidence: 85 },
    { pattern: /npm\s+run/i, tool: 'npm_run', confidence: 85 },
];

const STRATEGY_INDICATORS: Record<Strategy, { patterns: RegExp[]; weight: number }> = {
    refactor: {
        patterns: [
            /refactor/i, /reorganize/i, /restructure/i, /clean\s*up/i,
            /improve\s+structure/i, /modularize/i, /extract/i, /split\s+into/i
        ],
        weight: 1.0
    },
    patch: {
        patterns: [
            /fix/i, /bug/i, /quick\s+change/i, /update/i, /modify/i,
            /change\s+the/i, /replace/i, /adjust/i
        ],
        weight: 0.8
    },
    read_more: {
        patterns: [
            /show\s+me/i, /what\s+is\s+in/i, /look\s+at/i, /check\s+the/i,
            /find\s+where/i, /locate/i
        ],
        weight: 0.6
    },
    tool_call: {
        patterns: [
            /create/i, /delete/i, /run/i, /execute/i, /install/i,
            /build/i, /deploy/i, /start/i, /stop/i
        ],
        weight: 0.9
    },
    reason_only: {
        patterns: [
            /explain/i, /what\s+is/i, /how\s+does/i, /describe/i,
            /why/i, /tell\s+me\s+about/i, /understand/i
        ],
        weight: 0.7
    },
    abort: {
        patterns: [
            /danger/i, /unsafe/i, /cannot/i, /impossible/i
        ],
        weight: 0.3
    }
};

// ============================================================
// AGENT DECIDE CLASS
// ============================================================

export class AgentDecide {
    private memory: ReturnType<typeof learningSystem.initializeMemory>;

    constructor() {
        this.memory = learningSystem.initializeMemory();
    }

    // ============================================================
    // STRATEGY SCORING
    // ============================================================

    scoreStrategies(context: DecisionContext): StrategyScore[] {
        const scores: StrategyScore[] = [];
        const query = context.query.toLowerCase();

        for (const [strategy, indicator] of Object.entries(STRATEGY_INDICATORS)) {
            const reasons: string[] = [];
            let matchCount = 0;

            for (const pattern of indicator.patterns) {
                if (pattern.test(query)) {
                    matchCount++;
                    reasons.push(`Matched pattern: ${pattern.source}`);
                }
            }

            // Adjust score based on understanding complexity
            let complexityModifier = 1.0;
            if (context.understanding.complexity === 'complex') {
                if (strategy === 'refactor') complexityModifier = 1.2;
                if (strategy === 'patch') complexityModifier = 0.8;
            }

            // Adjust based on invariants
            if (context.understanding.invariants.length > 0) {
                if (strategy === 'refactor') complexityModifier *= 0.9;
                reasons.push(`${context.understanding.invariants.length} invariants to respect`);
            }

            const baseScore = matchCount * indicator.weight * 100;
            const finalScore = Math.min(100, baseScore * complexityModifier);

            if (finalScore > 0) {
                scores.push({
                    strategy: strategy as Strategy,
                    score: Math.round(finalScore),
                    reasons
                });
            }
        }

        // Sort by score descending
        return scores.sort((a, b) => b.score - a.score);
    }

    // ============================================================
    // TOOL INFERENCE
    // ============================================================

    inferTools(query: string): ToolIntent[] {
        const intents: ToolIntent[] = [];

        for (const { pattern, tool } of TOOL_PATTERNS) {
            if (pattern.test(query)) {
                intents.push({
                    tool,
                    args: {},
                    expectedOutcome: `${tool} executed successfully`
                });
            }
        }

        return intents;
    }

    // ============================================================
    // MAIN DECISION LOGIC
    // ============================================================

    decide(context: DecisionContext): AgentDecision {
        const strategyScores = this.scoreStrategies(context);

        // No strategies matched - need more context
        if (strategyScores.length === 0) {
            return {
                strategy: 'read_more',
                confidence: 30,
                reasoning: 'No clear strategy pattern matched. Need more context.',
                contextNeeds: ['clarification', 'file contents']
            };
        }

        const topStrategy = strategyScores[0]!;

        // Check for dangerous operations
        if (this.isDangerous(context)) {
            return {
                strategy: 'abort',
                confidence: 90,
                reasoning: 'Operation appears unsafe based on context.',
                constraints: context.understanding.doNotChange
            };
        }

        // Build decision based on top strategy
        const decision: AgentDecision = {
            strategy: topStrategy.strategy,
            confidence: topStrategy.score,
            reasoning: topStrategy.reasons.join('; '),
            constraints: context.understanding.invariants
        };

        // Add tool intents if applicable
        if (topStrategy.strategy === 'tool_call') {
            decision.toolCalls = this.inferTools(context.query);
        }

        // Add context needs for read_more
        if (topStrategy.strategy === 'read_more') {
            decision.contextNeeds = this.inferContextNeeds(context.query);
        }

        return decision;
    }

    // ============================================================
    // SAFETY CHECKS
    // ============================================================

    private isDangerous(context: DecisionContext): boolean {
        const query = context.query.toLowerCase();

        // Dangerous patterns
        const dangerPatterns = [
            /rm\s+-rf\s+\//,
            /delete\s+all/i,
            /drop\s+database/i,
            /format\s+drive/i,
            /sudo\s+rm/i
        ];

        for (const pattern of dangerPatterns) {
            if (pattern.test(query)) return true;
        }

        // Check invariants
        for (const invariant of context.understanding.invariants) {
            if (invariant.toLowerCase().includes('never') ||
                invariant.toLowerCase().includes('must not')) {
                // If query might violate invariant
                // This is a simplified check
                return false;
            }
        }

        return false;
    }

    private inferContextNeeds(query: string): string[] {
        const needs: string[] = [];

        if (query.includes('file') || query.includes('code')) {
            needs.push('file contents');
        }
        if (query.includes('function') || query.includes('class')) {
            needs.push('symbol definitions');
        }
        if (query.includes('api') || query.includes('endpoint')) {
            needs.push('API documentation');
        }

        if (needs.length === 0) {
            needs.push('clarification');
        }

        return needs;
    }

    // ============================================================
    // LEARNING INTEGRATION
    // ============================================================

    learnFromOutcome(context: DecisionContext, decision: AgentDecision, success: boolean): void {
        if (success) {
            const pattern = learningSystem.extractPatternFromPositive(
                context.query,
                decision.toolCalls?.map(t => ({ name: t.tool })) || []
            );

            if (pattern) {
                this.memory = learningSystem.addPatternToMemory(this.memory, pattern);
            }
        }
    }
}

// Export singleton instance
export const agentDecide = new AgentDecide();
export default agentDecide;
