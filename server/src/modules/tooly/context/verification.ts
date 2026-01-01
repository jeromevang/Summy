/**
 * VERIFICATION LOOP ("The Critic")
 * Phase 4.4: Verify & Persist
 * 
 * Goal: Close the loop. Did the action match the intent?
 * Input: Expectation (Intent) + Result (Output)
 * Output: Success/Failure Signal + Learning
 */

import { IntentJSON } from '../types.js';

export interface VerificationResult {
    success: boolean;
    score: number;
    deviations: string[];
    correction?: string;
}

export class VerificationLoop {

    /**
     * VERIFY: Did we do what we said we would?
     */
    async verify(intent: IntentJSON, output: string, exitCode: number): Promise<VerificationResult> {
        const deviations: string[] = [];

        // 1. Structural Verification
        if (exitCode !== 0) {
            deviations.push(`Action failed with exit code ${exitCode}`);
        }

        // 2. Intent Verification (Heuristic)
        // Did we actually modify the files we said we would? (Mock check)
        if (intent.action === 'call_tool' && output.length < 50) {
            deviations.push('Refactor output suspiciously short');
        }

        // 3. Safety Verification
        if (output.includes('Error') || output.includes('Exception')) {
            deviations.push('Output contains error keywords');
        }

        const success = deviations.length === 0;
        const score = success ? 100 : Math.max(0, 100 - (deviations.length * 30));

        return {
            success,
            score,
            deviations
        };
    }

    /**
     * PERSIST: Learn from the result
     */
    async persist(result: VerificationResult) {
        console.log(`[Verification] Persisting result: Success=${result.success} Score=${result.score}`);

        // 1. Store in Long-Term Memory (via Database)
        // We mock this call for now, assuming a 'storeInteraction' method exists or will exist
        // await db.storeInteraction({ ... });

        // 2. Adjust Prosthetic Intelligence if failures are repeated
        if (!result.success && result.deviations.length > 0) {
            console.warn('[Verification] Action failed. Triggering learning loop.');
            // In a real system, we would feed this back into 'prosthetic-prompt-builder'
        }
    }
}

export const verificationLoop = new VerificationLoop();
