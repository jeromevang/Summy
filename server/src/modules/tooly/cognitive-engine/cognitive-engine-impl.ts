import { contextPrism } from './context/context-prism.js';
import { decisionEngine } from './context/decision-engine.js';
import { verificationLoop } from './context/verification.js';
import { swarmRouter } from './orchestrator/swarm-router.js';
import { wsBroadcast } from '../../services/ws-broadcast.js';

export class CognitiveEngine {
    async executeLoop(query: string, projectPath: string, openFiles: string[] = []) {
        try {
            wsBroadcast.broadcastCognitiveTrace('search', { log: `Initiating search for: "${query}"` });
            const context = await contextPrism.scan(query, projectPath, openFiles);
            wsBroadcast.broadcastCognitiveTrace('understand', { log: 'Distilling context...' });
            const mentalModel = await contextPrism.distill(context, query);
            const intent = decisionEngine.decide(mentalModel, query);
            wsBroadcast.broadcastCognitiveTrace('decide', { log: `Decision: ${intent.strategy.toUpperCase()}`, intent });
            const assignedModel = await swarmRouter.executeIntent(intent);
            if (assignedModel) {
                await new Promise(r => setTimeout(r, 2000));
                const verification = await verificationLoop.verify(intent, "Success", 0);
                await verificationLoop.persist(intent, verification, query);
            }
            wsBroadcast.broadcastCognitiveTrace('idle', { log: 'Complete.' });
        } catch (error: any) {
            wsBroadcast.broadcastCognitiveTrace('idle', { log: `Error: ${error.message}` });
        }
    }
}

export const cognitiveEngine = new CognitiveEngine();
