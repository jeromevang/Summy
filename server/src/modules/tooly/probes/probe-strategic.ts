import { LMStudioClient } from '@lmstudio/sdk';
import { wsBroadcast } from '../../../services/ws-broadcast.js';
import { modelManager } from '../../../services/lmstudio-model-manager.js';
import { ProbeBase } from './probe-base.js';
import { ContextLatencyResult, ProbeResult } from './probe-types.js';
import { PING_TOOL } from './probe-core.js';

export class ProbeStrategic extends ProbeBase {
    public async getModelMaxContext(modelId: string): Promise<number> {
        try {
            const client = new LMStudioClient();
            const models = await client.system.listDownloadedModels("llm");
            const model = models.find(m => m.modelKey === modelId || m.modelKey?.includes(modelId));
            return model?.maxContextLength || 8192;
        } catch {
            return 8192;
        }
    }

    public async runQuickLatencyCheck(modelId: string, provider: 'lmstudio' | 'openai' | 'azure', settings: any, timeout: number): Promise<number> {
        const startTime = Date.now();
        try {
            if (provider === 'lmstudio') await modelManager.ensureLoaded(modelId, 2048);
            const messages = [{ role: 'user', content: 'Call ping.' }];
            await this.callLLM(modelId, provider, messages, [PING_TOOL], settings, timeout);
            return Date.now() - startTime;
        } catch {
            return Date.now() - startTime;
        }
    }

    public async runContextLatencyProfile(modelId: string, provider: 'lmstudio' | 'openai' | 'azure', settings: any, timeout: number): Promise<ContextLatencyResult> {
        const baseContextSizes = [2048, 4096, 8192, 16384, 32768, 65536];
        const latencies: Record<number, number> = {};
        const testedContextSizes: number[] = [];
        let maxUsableContext = 2048;

        const modelMaxContext = await this.getModelMaxContext(modelId);
        const contextSizes = baseContextSizes.filter(size => size <= modelMaxContext);

        for (const contextSize of contextSizes) {
            if (provider === 'lmstudio') await modelManager.ensureLoaded(modelId, contextSize);
            const startTime = Date.now();
            try {
                await this.callLLM(modelId, provider, [{ role: 'user', content: 'Call ping.' }], [PING_TOOL], settings, timeout);
                const latency = Date.now() - startTime;
                latencies[contextSize] = latency;
                testedContextSizes.push(contextSize);
                if (latency < 30000) maxUsableContext = contextSize;
                if (latency >= 8000) break;
            } catch { break; }
        }

        const minLatency = testedContextSizes.length > 0 ? Math.min(...Object.values(latencies)) : 0;

        return {
            testedContextSizes,
            latencies,
            maxUsableContext,
            recommendedContext: maxUsableContext,
            modelMaxContext,
            minLatency,
            isInteractiveSpeed: minLatency < 5000,
            speedRating: minLatency < 500 ? 'excellent' : minLatency < 2000 ? 'good' : minLatency < 5000 ? 'acceptable' : 'slow'
        };
    }
}
