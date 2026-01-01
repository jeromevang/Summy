/**
 * DECISION ENGINE ("The Brain")
 * Phase 4.2: Decide
 * 
 * Goal: Convert "Understanding" into an Explicit Decision (Intent).
 * Input: MentalModel + User Query
 * Output: IntentJSON (Strategy, Risk, Reasoning)
 */

import { MentalModel } from './context-prism.js';
import { IntentSchema } from '../types.js';

export type StrategyType = 'refactor' | 'patch' | 'investigate' | 'consult';

export interface DecisionStrategy {
    strategy: StrategyType;
    primaryAction: string;       // e.g., "rewrite_method"
    reasoning: string;          // "Refactoring is cleaner than patching here..."
    riskLevel: 'high' | 'medium' | 'low';
    requiresUserApproval: boolean;
    targetComponents: string[];
}

export class DecisionEngine {

    /**
     * DECIDE: The core decision logic
     * Prevents "thrashing" by forcing a single committed path.
     */
    decide(model: MentalModel, query: string): IntentSchema {
        // 1. Heuristic-based Strategy Selection
        // In a full agent, this would be an LLM call: LLM(model, query) -> IntentJSON

        const strategy = this.determineStrategy(model, query);
        
        // Map Strategy to IntentSchema
        return {
            schemaVersion: '1.0.0',
            action: 'multi_step', // Default to multi-step for complex tasks
            steps: [], // Steps would be populated by the Planner based on this intent
            metadata: {
                reasoning: strategy.reasoning,
                context: JSON.stringify(strategy)
            }
        };
    }

    private determineStrategy(model: MentalModel, query: string): DecisionStrategy {
        // Check for explicit user intent
        const q = query.toLowerCase();

        if (q.includes('check') || q.includes('look') || q.includes('investigate')) {
            return {
                strategy: 'investigate',
                primaryAction: 'read_and_analyze',
                reasoning: 'User requested investigation without modification.',
                riskLevel: 'low',
                requiresUserApproval: false,
                targetComponents: model.affectedComponents
            };
        }

        if (q.includes('delete') || q.includes('remove') || q.includes('rewrite')) {
            return {
                strategy: 'refactor',
                primaryAction: 'destructive_edit',
                reasoning: 'Request implies destructive changes; refactor strategy selected.',
                riskLevel: 'high',
                requiresUserApproval: true, // Safety first
                targetComponents: model.affectedComponents
            };
        }

        // Default to safe patching
        return {
            strategy: 'patch',
            primaryAction: 'apply_fix',
            reasoning: 'Standard fix request; applying least-invasive patch.',
            riskLevel: 'medium',
            requiresUserApproval: false,
            targetComponents: model.affectedComponents
        };
    }

    /**
     * Validation: Does the decision violate constraints?
     */
    validateDecision(strategy: DecisionStrategy, model: MentalModel): { valid: boolean; violation?: string } {
        if (strategy.riskLevel === 'high' && !strategy.requiresUserApproval) {
            return { valid: false, violation: 'High risk actions must require approval.' };
        }

        // Check against model constraints
        if (model.constraints.includes("Do not break existing sessions") && strategy.strategy === 'refactor') {
            // Warning, but maybe not a hard block if approval is sought
            // For now, we allow it if approved
        }

        return { valid: true };
    }
}

export const decisionEngine = new DecisionEngine();
