/**
 * DECISION ENGINE ("The Brain")
 * Phase 4.2: Decide
 * 
 * Goal: Convert "Understanding" into an Explicit Decision (Intent).
 * Input: MentalModel + User Query
 * Output: IntentJSON (Strategy, Risk, Reasoning)
 */

import { MentalModel } from './context-prism.js';

export type StrategyType = 'refactor' | 'patch' | 'investigate' | 'consult';

export interface IntentJSON {
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
    decide(model: MentalModel, query: string): IntentJSON {
        // 1. Heuristic-based Strategy Selection
        // In a full agent, this would be an LLM call: LLM(model, query) -> IntentJSON

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
    validateDecision(intent: IntentJSON, model: MentalModel): { valid: boolean; violation?: string } {
        if (intent.riskLevel === 'high' && !intent.requiresUserApproval) {
            return { valid: false, violation: 'High risk actions must require approval.' };
        }

        // Check against model constraints
        if (model.constraints.includes("Do not break existing sessions") && intent.strategy === 'refactor') {
            // Warning, but maybe not a hard block if approval is sought
            // For now, we allow it if approved
        }

        return { valid: true };
    }
}

export const decisionEngine = new DecisionEngine();
