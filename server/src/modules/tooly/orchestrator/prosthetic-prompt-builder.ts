/**
 * Prosthetic Prompt Builder
 * 
 * The core engine of "Prosthetic Intelligence".
 * Translates test failures into active compensations.
 * 
 * ESCALATION PROTOCOL:
 * Level 1: Context Injection (Soft Nudge)
 * Level 2: Hard Constraint (Negative Prompt)
 * Level 3: Active Intervention (Output Interception)
 * Level 4: Protocol X (Ruthless Disqualification)
 */

import { ProbeRunResult, ProbeResult } from '../types.js';

export interface ProstheticConfig {
    modelId: string;
    level1Prompts: string[];
    level2Constraints: string[];
    level3Interventions: InterventionRule[];
    level4Disqualifications: string[]; // Capabilities this model is banned from
}

export interface InterventionRule {
    trigger: string;
    action: 'block' | 'rewrite';
    message: string;
}

export class ProstheticPromptBuilder {

    /**
     * Build a prosthetic configuration based on probe results
     */
    build(results: ProbeRunResult): ProstheticConfig {
        const config: ProstheticConfig = {
            modelId: results.modelId,
            level1Prompts: [],
            level2Constraints: [],
            level3Interventions: [],
            level4Disqualifications: []
        };

        // 4. Calculate Failure Rates per Capability for "Ruthless Disqualification"
        const failuresPerCap: Record<string, number> = {};
        const totalPerCap: Record<string, number> = {};

        for (const result of results.results) {
            const cap = this.mapToCapability(result.testId);
            totalPerCap[cap] = (totalPerCap[cap] || 0) + 1;
            if (!result.passed) {
                failuresPerCap[cap] = (failuresPerCap[cap] || 0) + 1;
            }
        }

        // Apply Protocol X (Disqualification)
        for (const [cap, total] of Object.entries(totalPerCap)) {
            const failures = failuresPerCap[cap] || 0;
            const failureRate = failures / total;

            // RUTHLESS DISQUALIFICATION:
            // If model fails > 50% of tests in a category, it is BANNED from that capability.
            if (failureRate > 0.5) {
                config.level4Disqualifications.push(cap);
                // Add a blocking intervention as well
                config.level3Interventions.push({
                    trigger: cap.toLowerCase(),
                    action: 'block',
                    message: `PROTOCOL X: Model is disqualified from '${cap}' due to ${Math.round(failureRate * 100)}% failure rate.`
                });
            }
        }

        // Analyze each probe result
        for (const result of results.results) {
            if (!result.passed) {
                this.analyzeFailure(config, result);
            }
        }

        return config;
    }

    /**
     * Analyze a single failure and escalate accordingly
     */
    private analyzeFailure(config: ProstheticConfig, result: ProbeResult) {
        // 1. Determine capability domain
        const capability = this.mapToCapability(result.testId);

        // Skip if already disqualified (Level 4 handles this globally)
        if (config.level4Disqualifications.includes(capability)) return;

        // 2. Determine severity/persistence
        // In a real system, we would track history. 
        // For now, we use a heuristic based on the test category.
        const severity = this.getSeverity(result);

        switch (severity) {
            case 1: // Soft Nudge
                config.level1Prompts.push(this.generateLevel1(capability, result));
                break;

            case 2: // Hard Constraint
                config.level2Constraints.push(this.generateLevel2(capability, result));
                break;

            case 3: // Active Intervention
                config.level3Interventions.push(this.generateLevel3(capability, result));
                break;

            case 4: // Disqualification
                config.level4Disqualifications.push(capability);
                break;
        }
    }

    /**
     * Map test ID to abstract capability
     */
    private mapToCapability(testId: string): string {
        if (testId.startsWith('file_')) return 'File Operations';
        if (testId.startsWith('git_')) return 'Git Version Control';
        if (testId.startsWith('npm_')) return 'NPM Package Management';
        if (testId.startsWith('rag_')) return 'RAG Knowledge Retrieval';
        if (testId.startsWith('browser_')) return 'Browser Automation';
        // Add specific probe mappings (3.x, 8.x, etc)
        if (testId.startsWith('3.')) return 'Strategic Reasoning';
        if (testId.startsWith('8.')) return 'Intent Recognition';
        if (testId.startsWith('9.')) return 'Failure Recovery';
        return 'General Instruction Following';
    }

    /**
     * Determine escalation level based on failure type
     */
    private getSeverity(result: ProbeResult): 1 | 2 | 3 | 4 {
        // Critical failures (safety, destructive actions) -> Level 3 or 4
        if (result.error?.includes('destructive') || result.testId.includes('safety')) {
            return 3;
        }

        // Syntax errors / Tool format issues -> Level 2
        if (result.error?.includes('JSON') || result.error?.includes('format')) {
            return 2;
        }

        // Logic/Reasoning failures -> Level 1 (Hard to constrain with rules)
        if (result.testId.startsWith('3.') || result.testId.startsWith('reasoning')) {
            return 1;
        }

        // Default to Level 1
        return 1;
    }

    /**
     * Generate Level 1: Context Injection
     */
    private generateLevel1(capability: string, result: ProbeResult): string {
        return `[Advisory] When performing ${capability}, ensure you double-check your parameters. Previous failure: ${result.error?.substring(0, 50)}...`;
    }

    /**
     * Generate Level 2: Hard Constraint
     */
    private generateLevel2(capability: string, result: ProbeResult): string {
        return `CRITICAL CONSTRAINT: You must NOT fail at ${capability}. Specifically: ${result.error}. Verify strictly before executing.`;
    }

    /**
     * Generate Level 3: Active Intervention Rule
     */
    private generateLevel3(capability: string, result: ProbeResult): InterventionRule {
        return {
            trigger: capability.toLowerCase(), // Simplistic trigger for now
            action: 'block',
            message: `Action blocked by Prosthetic Intelligence. You attempted ${capability} which is flagged as unstable. Error trace: ${result.error}`
        };
    }
}

export const prostheticPromptBuilder = new ProstheticPromptBuilder();
export default prostheticPromptBuilder;
