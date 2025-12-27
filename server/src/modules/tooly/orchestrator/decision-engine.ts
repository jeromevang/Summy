/**
 * Decision Engine
 * Central orchestrator implementing the 6-step agentic cycle:
 * Search → Understand → Decide → Act → Verify → Persist
 */

import type { OptimizedContext, Turn } from '../context/context-manager.js';
import learningSystem from '../learning/learning-system.js';

// ============================================================
// TYPES
// ============================================================

export type Strategy =
    | 'refactor'      // Restructure code for clarity
    | 'patch'         // Quick fix without major changes
    | 'read_more'     // Need more context before acting
    | 'tool_call'     // Execute a tool
    | 'reason_only'   // Provide explanation without action
    | 'abort';        // Cannot proceed safely

export interface AgentDecision {
    strategy: Strategy;
    confidence: number;           // 0-100
    reasoning: string;            // Why this strategy was chosen
    toolCalls?: ToolIntent[];     // What tools to call (if strategy is tool_call)
    contextNeeds?: string[];      // What context is still needed (if strategy is read_more)
    constraints?: string[];       // Things that must not change
}

export interface ToolIntent {
    tool: string;
    args: Record<string, any>;
    expectedOutcome: string;
}

export interface StructuredUnderstanding {
    components: ComponentInfo[];
    invariants: string[];
    sideEffects: string[];
    coupling: CouplingInfo[];
    doNotChange: string[];
    complexity: 'simple' | 'medium' | 'complex';
}

export interface ComponentInfo {
    name: string;
    role: string;
    file?: string;
    dependencies: string[];
}

export interface CouplingInfo {
    from: string;
    to: string;
    type: 'imports' | 'calls' | 'extends' | 'implements' | 'data';
}

export interface VerificationResult {
    success: boolean;
    invariantsValid: boolean;
    outputMatchesIntent: boolean;
    errors: string[];
    feedback?: string;
}

export interface SearchContext {
    ragResults: string[];
    symbols: string[];
    schemas: any[];
    apiSurfaces: string[];
    relevantFiles: string[];
}

export interface DecisionOutcome {
    decision: AgentDecision;
    action: any;
    verification: VerificationResult;
    timestamp: number;
}

// ============================================================
// DECISION ENGINE CLASS
// ============================================================

export class DecisionEngine {
    private memory: ReturnType<typeof learningSystem.initializeMemory>;
    private decisionHistory: DecisionOutcome[] = [];

    constructor() {
        this.memory = learningSystem.initializeMemory();
    }

    // ============================================================
    // STEP 1: SEARCH
    // Locate relevant information
    // ============================================================

    async search(query: string, options?: {
        includeRag?: boolean;
        includeSymbols?: boolean;
        includeSchemas?: boolean;
    }): Promise<SearchContext> {
        const context: SearchContext = {
            ragResults: [],
            symbols: [],
            schemas: [],
            apiSurfaces: [],
            relevantFiles: []
        };

        // RAG lookup (if enabled and available)
        if (options?.includeRag !== false) {
            try {
                const { ragClient } = await import('../../../services/rag-client.js');
                const ragResults = await ragClient.query(query, { limit: 5 });
                context.ragResults = ragResults?.results?.map((r: any) => r.content || r.text || r.snippet || '') || [];
            } catch (e) {
                // RAG not available
            }
        }

        // Extract potential file references from query
        const filePatterns = query.match(/[a-zA-Z0-9_\-]+\.(ts|js|tsx|jsx|py|json|md)/g) || [];
        context.relevantFiles = filePatterns;

        return context;
    }

    // ============================================================
    // STEP 2: UNDERSTAND
    // Build structured mental model
    // ============================================================

    understand(searchContext: SearchContext, query: string): StructuredUnderstanding {
        const understanding: StructuredUnderstanding = {
            components: [],
            invariants: [],
            sideEffects: [],
            coupling: [],
            doNotChange: [],
            complexity: 'simple'
        };

        // Extract components from RAG results
        for (const result of searchContext.ragResults) {
            const classMatch = result.match(/class\s+(\w+)/g) || [];
            const funcMatch = result.match(/function\s+(\w+)/g) || [];

            for (const match of [...classMatch, ...funcMatch]) {
                const name = match.replace(/class\s+|function\s+/, '');
                if (!understanding.components.find(c => c.name === name)) {
                    understanding.components.push({
                        name,
                        role: 'unknown',
                        dependencies: []
                    });
                }
            }
        }

        // Determine complexity
        if (understanding.components.length > 5 || searchContext.ragResults.length > 10) {
            understanding.complexity = 'complex';
        } else if (understanding.components.length > 2 || searchContext.ragResults.length > 3) {
            understanding.complexity = 'medium';
        }

        // Extract invariants from comments/docs
        for (const result of searchContext.ragResults) {
            const invariantMatches = result.match(/(?:INVARIANT|MUST|NEVER|ALWAYS)[:\s]+([^\n]+)/gi) || [];
            understanding.invariants.push(...invariantMatches.map(m => m.trim()));
        }

        return understanding;
    }

    // ============================================================
    // STEP 3: DECIDE
    // Choose one strategy explicitly
    // ============================================================

    decide(understanding: StructuredUnderstanding, query: string): AgentDecision {
        // Check if we need more context
        if (understanding.components.length === 0 && understanding.complexity === 'simple') {
            return {
                strategy: 'read_more',
                confidence: 40,
                reasoning: 'No relevant components found. Need more context to proceed safely.',
                contextNeeds: ['file contents', 'function definitions']
            };
        }

        // Analyze query intent
        const lowerQuery = query.toLowerCase();

        // Tool call indicators
        const toolIndicators = ['create', 'delete', 'move', 'rename', 'run', 'execute', 'install'];
        const needsTool = toolIndicators.some(ind => lowerQuery.includes(ind));

        // Refactor indicators
        const refactorIndicators = ['refactor', 'reorganize', 'restructure', 'clean up', 'improve'];
        const needsRefactor = refactorIndicators.some(ind => lowerQuery.includes(ind));

        // Explanation indicators
        const explainIndicators = ['explain', 'what is', 'how does', 'describe', 'understand'];
        const needsExplanation = explainIndicators.some(ind => lowerQuery.includes(ind));

        // Determine strategy
        if (needsExplanation) {
            return {
                strategy: 'reason_only',
                confidence: 85,
                reasoning: 'Query asks for explanation, no code changes needed.',
                constraints: understanding.doNotChange
            };
        }

        if (needsRefactor && understanding.complexity === 'complex') {
            return {
                strategy: 'refactor',
                confidence: 70,
                reasoning: 'Query requests restructuring of complex code.',
                constraints: understanding.invariants
            };
        }

        if (needsTool) {
            return {
                strategy: 'tool_call',
                confidence: 75,
                reasoning: 'Query requires executing a tool action.',
                toolCalls: this.inferToolCalls(query),
                constraints: understanding.doNotChange
            };
        }

        // Default: patch for simple changes
        return {
            strategy: 'patch',
            confidence: 60,
            reasoning: 'Simple modification without major restructuring.',
            constraints: understanding.invariants
        };
    }

    private inferToolCalls(query: string): ToolIntent[] {
        const intents: ToolIntent[] = [];
        const lowerQuery = query.toLowerCase();

        if (lowerQuery.includes('create') && lowerQuery.includes('file')) {
            intents.push({
                tool: 'write_file',
                args: {},
                expectedOutcome: 'File created successfully'
            });
        }

        if (lowerQuery.includes('delete') && lowerQuery.includes('file')) {
            intents.push({
                tool: 'delete_file',
                args: {},
                expectedOutcome: 'File deleted successfully'
            });
        }

        if (lowerQuery.includes('run') || lowerQuery.includes('execute')) {
            intents.push({
                tool: 'shell_exec',
                args: {},
                expectedOutcome: 'Command executed successfully'
            });
        }

        return intents;
    }

    // ============================================================
    // STEP 4: ACT
    // Execute the decision
    // ============================================================

    async act(decision: AgentDecision): Promise<any> {
        if (decision.strategy === 'abort') {
            return { aborted: true, reason: decision.reasoning };
        }

        if (decision.strategy === 'read_more') {
            return {
                needsMoreContext: true,
                contextNeeds: decision.contextNeeds
            };
        }

        if (decision.strategy === 'reason_only') {
            return {
                explanation: true,
                reasoning: decision.reasoning
            };
        }

        if (decision.strategy === 'tool_call' && decision.toolCalls) {
            // Return intent - actual execution happens in MCP client
            return {
                toolIntents: decision.toolCalls,
                ready: true
            };
        }

        // For refactor/patch, return the plan
        return {
            strategy: decision.strategy,
            constraints: decision.constraints,
            ready: true
        };
    }

    // ============================================================
    // STEP 5: VERIFY
    // Check whether the action worked
    // ============================================================

    verify(action: any, decision: AgentDecision): VerificationResult {
        const result: VerificationResult = {
            success: true,
            invariantsValid: true,
            outputMatchesIntent: true,
            errors: []
        };

        // Check if action was aborted
        if (action.aborted) {
            result.success = false;
            result.feedback = 'Action was aborted: ' + action.reason;
            return result;
        }

        // Check if more context was needed
        if (action.needsMoreContext) {
            result.success = false;
            result.outputMatchesIntent = false;
            result.feedback = 'More context needed before proceeding';
            return result;
        }

        // Verify tool calls completed (placeholder for actual verification)
        if (action.toolIntents) {
            // In real implementation, check tool execution results
            result.feedback = `${action.toolIntents.length} tool(s) ready for execution`;
        }

        return result;
    }

    // ============================================================
    // STEP 6: PERSIST
    // Update long-term state
    // ============================================================

    persist(outcome: DecisionOutcome): void {
        // Store in decision history
        this.decisionHistory.push(outcome);

        // Update learning system based on outcome
        if (outcome.verification.success) {
            // Extract positive pattern
            const pattern = learningSystem.extractPatternFromPositive(
                outcome.decision.reasoning,
                JSON.stringify(outcome.action),
                outcome.decision.toolCalls?.map(t => ({ name: t.tool })) || []
            );

            if (pattern) {
                this.memory = learningSystem.addPatternToMemory(this.memory, pattern);
            }
        } else {
            // Record failure for future routing adjustment
            console.log(`[DecisionEngine] Decision failed: ${outcome.decision.strategy} - ${outcome.verification.feedback}`);
        }

        // Decay old patterns periodically
        if (this.decisionHistory.length % 50 === 0) {
            this.memory = learningSystem.decayUnusedPatterns(this.memory, 30);
        }
    }

    // ============================================================
    // FULL CYCLE
    // Run all 6 steps in sequence
    // ============================================================

    async runCycle(query: string): Promise<DecisionOutcome> {
        const timestamp = Date.now();

        // 1. Search
        const searchContext = await this.search(query);

        // 2. Understand
        const understanding = this.understand(searchContext, query);

        // 3. Decide
        const decision = this.decide(understanding, query);

        // 4. Act
        const action = await this.act(decision);

        // 5. Verify
        const verification = this.verify(action, decision);

        // 6. Persist
        const outcome: DecisionOutcome = {
            decision,
            action,
            verification,
            timestamp
        };

        this.persist(outcome);

        return outcome;
    }

    // ============================================================
    // UTILITIES
    // ============================================================

    getDecisionHistory(): DecisionOutcome[] {
        return this.decisionHistory;
    }

    getRelevantPatterns(query: string): ReturnType<typeof learningSystem.getRelevantPatterns> {
        return learningSystem.getRelevantPatterns(this.memory, query);
    }

    clearHistory(): void {
        this.decisionHistory = [];
    }
}

// Export singleton instance
export const decisionEngine = new DecisionEngine();
export default decisionEngine;
