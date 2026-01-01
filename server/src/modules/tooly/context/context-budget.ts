import { ModelProfile } from '../types.js';
import { ContextBudget } from '../types.js';
import { DEFAULT_CONTEXT_BUDGET } from '../orchestrator/mcp-orchestrator.js';
import { analytics } from '@services/analytics'; // To estimate tokens

export class ContextBudgetManager {
    private contextBudget: ContextBudget;

    constructor(profile: ModelProfile) {
        this.contextBudget = profile.optimalSettings?.contextBudget || profile.contextBudget || DEFAULT_CONTEXT_BUDGET;
    }

    /**
     * Estimates tokens for a given set of messages.
     * Uses the analytics service's estimation method.
     */
    public estimateTokens(messages: any[]): number {
        return analytics.estimateMessagesTokens(messages);
    }

    /**
     * Checks if a given number of tokens (for a new message or full conversation)
     * fits within the current context budget.
     */
    public checkBudget(currentTokens: number): { fits: boolean; remaining: number; totalBudget: number } {
        const totalBudget = this.contextBudget.total;
        const remaining = totalBudget - currentTokens;
        return { fits: remaining >= 0, remaining, totalBudget };
    }

    /**
     * Implements context overflow strategies to trim messages if they exceed the budget.
     * This is a simplified implementation for now.
     * Strategies:
     * 1. Prioritize System Prompt and Tool Schemas (fixed budget)
     * 2. Trim oldest history messages
     * 3. Summarize older history messages (future enhancement)
     * 4. Drop RAG results (future enhancement)
     */
    public autoTrim(messages: any[]): any[] {
        let currentTokens = this.estimateTokens(messages);
        const totalBudget = this.contextBudget.total;

        if (currentTokens <= totalBudget) {
            return messages; // No trimming needed
        }

        const trimmedMessages = [...messages];

        // Calculate actual space for history and RAG
        const protectedTokens = this.contextBudget.systemPrompt + this.contextBudget.toolSchemas;
        let availableForDynamicContent = totalBudget - protectedTokens;

        if (availableForDynamicContent <= 0) {
            // If even protected content exceeds total, we have a problem
            // For now, return original and let LLM deal with it or hard truncate
            return messages; 
        }

        // Attempt to remove oldest history messages
        let historyStartIndex = -1;
        for (let i = trimmedMessages.length - 1; i >= 0; i--) {
            if (trimmedMessages[i].role === 'user' || trimmedMessages[i].role === 'assistant') {
                historyStartIndex = i;
            }
        }

        if (historyStartIndex !== -1) {
            for (let i = 0; i < historyStartIndex; i++) { // Remove from beginning of history
                const msgTokens = analytics.estimateMessagesTokens([trimmedMessages[i]]);
                if (currentTokens > totalBudget && (trimmedMessages[i].role === 'user' || trimmedMessages[i].role === 'assistant')) {
                    trimmedMessages.splice(i, 1);
                    currentTokens -= msgTokens;
                    i--; // Adjust index due to splice
                }
            }
        }
        
        // Final check and hard truncate if still over budget (should not happen if logic above is effective)
        currentTokens = this.estimateTokens(trimmedMessages);
        if (currentTokens > totalBudget) {
            // This is a last resort. Simple truncation by messages.
            while (currentTokens > totalBudget && trimmedMessages.length > 0) {
                trimmedMessages.splice(1, 1); // Remove from after system message, keeping latest
                currentTokens = this.estimateTokens(trimmedMessages);
            }
        }

        return trimmedMessages;
    }
}
