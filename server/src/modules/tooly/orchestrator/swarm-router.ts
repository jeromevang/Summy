/**
 * Swarm Router
 * 
 * Directs tasks to the most capable available model in the swarm.
 * Handles "Protocol X" disqualifications and automatic failover.
 */

import { IntentSchema } from '../types.ts';

export class SwarmRouter {
    private activeSwarm: {
        models: string[];
        roles: Record<string, 'main' | 'executor' | 'specialist'>;
    } | null = null;

    private disqualifications: Record<string, string[]> = {}; // modelId -> disqualifiedCapabilities[]

    /**
     * Initialize the swarm with a specific configuration
     */
    initialize(config: { models: string[]; roles: Record<string, 'main' | 'executor' | 'specialist'> }) {
        this.activeSwarm = config;
        this.disqualifications = {};
        console.log('[SwarmRouter] Initialized swarm:', config);
    }

    /**
   * Route a task based on explicit Intent
   */
    async executeIntent(intent: IntentSchema): Promise<string | null> {
        const taskType = this.mapActionToTaskType(intent.action);
        return this.routeTask(taskType);
    }

    private mapActionToTaskType(action: IntentSchema['action']): string {
        switch (action) {
            case 'call_tool': return 'tool_use';
            case 'multi_step': return 'planning';
            case 'respond': return 'reasoning';
            case 'ask_clarification': return 'reasoning';
            default: return 'reasoning'; // Fallback
        }
    }

    /**
     * Route a task to the best available model
     */
    async routeTask(taskType: string): Promise<string | null> {
        if (!this.activeSwarm) {
            throw new Error('Swarm not initialized');
        }

        // 1. Identify candidates based on capabilities and roles
        const candidates = this.getCandidatesForTask(taskType);

        // 2. Filter out disqualified models (Protocol X)
        const qualifiedCandidates = candidates.filter(modelId => {
            const disqualifiedCaps = this.disqualifications[modelId] || [];
            return !disqualifiedCaps.includes(taskType);
        });

        if (qualifiedCandidates.length === 0) {
            console.warn(`[SwarmRouter] No qualified models found for task type: ${taskType}`);
            // Fallback: Try the "Main" model even if not specialized, unless explicitly banned
            const mainModel = this.getMainModel();
            if (mainModel && !this.isDisqualified(mainModel, taskType)) {
                return mainModel;
            }
            return null;
        }

        // 3. Return the best candidate (first one for now, could be score-based)
        return qualifiedCandidates[0] || null;
    }

    /**
     * Register a disqualification (Protocol X triggered)
     */
    disqualifyModel(modelId: string, capability: string, reason: string) {
        if (!this.disqualifications[modelId]) {
            this.disqualifications[modelId] = [];
        }
        if (!this.disqualifications[modelId].includes(capability)) {
            this.disqualifications[modelId].push(capability);
            console.warn(`[SwarmRouter] PROTOCOL X: Model ${modelId} disqualified from ${capability}. Reason: ${reason}`);
        }
    }

    /**
     * Get candidates sorted by suitability
     */
    private getCandidatesForTask(taskType: string): string[] {
        if (!this.activeSwarm) return [];

        const { models, roles } = this.activeSwarm;

        // Prioritization logic
        if (taskType === 'reasoning' || taskType === 'planning') {
            return models.filter(m => roles[m] === 'main').concat(models.filter(m => roles[m] === 'specialist'));
        }

        if (taskType === 'coding' || taskType === 'tool_use') {
            return models.filter(m => roles[m] === 'executor').concat(models.filter(m => roles[m] === 'main'));
        }

        if (taskType === 'rag') {
            // Specialists might be RAG experts
            return models.filter(m => roles[m] === 'specialist').concat(models.filter(m => roles[m] === 'main'));
        }

        // Default: Main -> Executor -> Specialist
        return [...models].sort((a, b) => {
            if (roles[a] === 'main') return -1;
            if (roles[b] === 'main') return 1;
            return 0;
        });
    }

    private getMainModel(): string | undefined {
        return this.activeSwarm?.models.find(m => this.activeSwarm?.roles[m] === 'main');
    }

    private isDisqualified(modelId: string, capability: string): boolean {
        return (this.disqualifications[modelId] || []).includes(capability);
    }
}

export const swarmRouter = new SwarmRouter();
export default swarmRouter;
