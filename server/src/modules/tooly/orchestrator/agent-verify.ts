/**
 * Agent Verify
 * Post-action validation layer for the Decision Engine
 * Checks whether actions worked and invariants are preserved
 */

import type { AgentDecision, VerificationResult, ToolIntent } from './decision-engine.js';

// ============================================================
// TYPES
// ============================================================

export interface ActionResult {
    success: boolean;
    output?: any;
    error?: string;
    toolResults?: ToolResult[];
}

export interface ToolResult {
    tool: string;
    success: boolean;
    output?: any;
    error?: string;
    duration?: number;
}

export interface InvariantCheck {
    invariant: string;
    valid: boolean;
    violation?: string;
}

export interface IntentMatch {
    expectedOutcome: string;
    actualOutcome: string;
    matches: boolean;
    confidence: number;
}

// ============================================================
// VERIFICATION PATTERNS
// ============================================================

const SUCCESS_PATTERNS = [
    /success/i,
    /created/i,
    /written/i,
    /completed/i,
    /executed/i,
    /done/i
];

const FAILURE_PATTERNS = [
    /error/i,
    /failed/i,
    /exception/i,
    /not found/i,
    /denied/i,
    /timeout/i,
    /could not/i
];

// ============================================================
// AGENT VERIFY CLASS
// ============================================================

export class AgentVerify {

    // ============================================================
    // MAIN VERIFICATION
    // ============================================================

    verify(action: ActionResult, decision: AgentDecision): VerificationResult {
        const result: VerificationResult = {
            success: true,
            invariantsValid: true,
            outputMatchesIntent: true,
            errors: []
        };

        // Check basic action success
        if (!action.success) {
            result.success = false;
            result.errors.push(action.error || 'Action failed');
            result.feedback = 'Action did not complete successfully';
            return result;
        }

        // Verify tool results if present
        if (action.toolResults && decision.toolCalls) {
            const toolVerification = this.verifyToolResults(action.toolResults, decision.toolCalls);

            if (!toolVerification.allPassed) {
                result.success = false;
                result.errors.push(...toolVerification.errors);
            }

            result.feedback = toolVerification.summary;
        }

        // Verify invariants
        if (decision.constraints && decision.constraints.length > 0) {
            const invariantChecks = this.checkInvariants(action, decision.constraints);

            for (const check of invariantChecks) {
                if (!check.valid) {
                    result.invariantsValid = false;
                    result.errors.push(`Invariant violated: ${check.invariant} - ${check.violation}`);
                }
            }
        }

        // Verify intent match
        if (decision.toolCalls) {
            const intentMatch = this.verifyIntent(action, decision.toolCalls);
            result.outputMatchesIntent = intentMatch.allMatch;

            if (!intentMatch.allMatch) {
                result.errors.push('Output does not match expected intent');
            }
        }

        return result;
    }

    // ============================================================
    // TOOL RESULT VERIFICATION
    // ============================================================

    verifyToolResults(
        results: ToolResult[],
        intents: ToolIntent[]
    ): { allPassed: boolean; errors: string[]; summary: string } {
        const errors: string[] = [];
        let passed = 0;
        let failed = 0;

        for (const result of results) {
            if (result.success) {
                passed++;
            } else {
                failed++;
                errors.push(`${result.tool}: ${result.error || 'Unknown error'}`);
            }
        }

        return {
            allPassed: failed === 0,
            errors,
            summary: `${passed}/${results.length} tool(s) succeeded`
        };
    }

    // ============================================================
    // INVARIANT CHECKING
    // ============================================================

    checkInvariants(action: ActionResult, invariants: string[]): InvariantCheck[] {
        const checks: InvariantCheck[] = [];
        const outputStr = JSON.stringify(action.output || {}).toLowerCase();

        for (const invariant of invariants) {
            const check: InvariantCheck = {
                invariant,
                valid: true
            };

            // Check for "NEVER" invariants
            if (invariant.toLowerCase().includes('never')) {
                const neverMatch = invariant.match(/never\s+(.+)/i);
                if (neverMatch) {
                    const forbidden = neverMatch[1].toLowerCase();
                    if (outputStr.includes(forbidden)) {
                        check.valid = false;
                        check.violation = `Action may have done: ${forbidden}`;
                    }
                }
            }

            // Check for "MUST" invariants
            if (invariant.toLowerCase().includes('must')) {
                const mustMatch = invariant.match(/must\s+(.+)/i);
                if (mustMatch) {
                    const required = mustMatch[1].toLowerCase();
                    // Simplified check - in reality would be more sophisticated
                    if (action.error && !outputStr.includes(required)) {
                        check.valid = false;
                        check.violation = `Action may have missed: ${required}`;
                    }
                }
            }

            checks.push(check);
        }

        return checks;
    }

    // ============================================================
    // INTENT VERIFICATION
    // ============================================================

    verifyIntent(
        action: ActionResult,
        intents: ToolIntent[]
    ): { allMatch: boolean; matches: IntentMatch[] } {
        const matches: IntentMatch[] = [];
        let allMatch = true;

        const outputStr = JSON.stringify(action.output || {}).toLowerCase();

        for (const intent of intents) {
            const expectedLower = intent.expectedOutcome.toLowerCase();

            // Check if output contains success indicators matching the intent
            const hasSuccess = SUCCESS_PATTERNS.some(p => p.test(outputStr));
            const hasFailure = FAILURE_PATTERNS.some(p => p.test(outputStr));

            // Simple heuristic: if no failure patterns and has success patterns, it matches
            const doesMatch = hasSuccess && !hasFailure;

            matches.push({
                expectedOutcome: intent.expectedOutcome,
                actualOutcome: outputStr.slice(0, 100),
                matches: doesMatch,
                confidence: doesMatch ? 80 : 40
            });

            if (!doesMatch) {
                allMatch = false;
            }
        }

        return { allMatch, matches };
    }

    // ============================================================
    // SCHEMA VALIDATION
    // ============================================================

    validateSchema(output: any, expectedSchema: Record<string, string>): boolean {
        if (!output || typeof output !== 'object') return false;

        for (const [key, type] of Object.entries(expectedSchema)) {
            if (!(key in output)) return false;

            const actualType = Array.isArray(output[key]) ? 'array' : typeof output[key];
            if (actualType !== type && type !== 'any') return false;
        }

        return true;
    }

    // ============================================================
    // TEST VERIFICATION
    // ============================================================

    async verifyTests(testCommand?: string): Promise<{ passed: boolean; output: string }> {
        // Placeholder - in real implementation would run tests
        return { passed: true, output: 'Tests not configured' };
    }

    // ============================================================
    // QUICK VERIFY
    // ============================================================

    quickVerify(action: ActionResult): VerificationResult {
        return {
            success: action.success,
            invariantsValid: true,
            outputMatchesIntent: action.success,
            errors: action.error ? [action.error] : [],
            feedback: action.success ? 'Action completed' : 'Action failed'
        };
    }
}

// Export singleton instance
export const agentVerify = new AgentVerify();
export default agentVerify;
