import { contextPrism } from '../context/context-prism.ts';
import { decisionEngine } from '../context/decision-engine.ts';
import { verificationLoop } from '../context/verification.ts';
import { swarmRouter } from '../orchestrator/swarm-router.ts';
import { wsBroadcast } from '@services/ws-broadcast';
import { IntentSchema } from '../types.ts';

export class CognitiveEngine {
    async executeLoop(query: string, projectPath: string, openFiles: string[] = []) {
        try {
            wsBroadcast.broadcastCognitiveTrace('search', { log: `Initiating search for: "${query}"` });
            const context = await contextPrism.scan(query, projectPath, openFiles);
            wsBroadcast.broadcastCognitiveTrace('understand', { log: 'Distilling context...' });
            const mentalModel = await contextPrism.distill(context, query);
            const intent: IntentSchema = decisionEngine.decide(mentalModel, query);
            wsBroadcast.broadcastCognitiveTrace('decide', { log: `Decision: ${intent.action.toUpperCase()}`, intent });
            const assignedModel = await swarmRouter.executeIntent(intent);
            if (assignedModel) {
                await new Promise(r => setTimeout(r, 2000));
                const verification = await verificationLoop.verify(intent, "Success", 0);
                await verificationLoop.persist(verification);
            }
            wsBroadcast.broadcastCognitiveTrace('idle', { log: 'Complete.' });
        } catch (error: any) {
            wsBroadcast.broadcastCognitiveTrace('idle', { log: `Error: ${error.message}` });
        }
    }
}

export const cognitiveEngine = new CognitiveEngine();
