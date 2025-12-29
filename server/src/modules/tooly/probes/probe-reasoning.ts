import { ProbeBase } from './probe-base.js';
import { ProbeResult } from './probe-types.js';
import { detectBadOutput } from './probe-utils.js';

export class ProbeReasoning extends ProbeBase {
    public async runIntentExtractionTest(modelId: string, provider: 'lmstudio' | 'openai' | 'azure' | 'openrouter', settings: any, timeout: number): Promise<ProbeResult> {
        const startTime = Date.now();
        const messages = [
            { role: 'system', content: 'Output your intent as JSON only.' },
            { role: 'user', content: 'Add error handling to the login function in auth.js' }
        ];

        try {
            const response = await this.callLLMNoTools(modelId, provider, messages, settings, timeout);
            const content = response?.choices?.[0]?.message?.content || '';
            if (detectBadOutput(content).isLooping) return { testName: 'intent_extraction', passed: false, score: 0, latency: Date.now() - startTime, details: 'Looping', response };

            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (!jsonMatch) return { testName: 'intent_extraction', passed: false, score: 20, latency: Date.now() - startTime, details: 'No JSON', response };

            const intent = JSON.parse(jsonMatch[0]);
            return { testName: 'intent_extraction', passed: true, score: 100, latency: Date.now() - startTime, details: 'Valid intent JSON', response };
        } catch (error: any) {
            return { testName: 'intent_extraction', passed: false, score: 0, latency: Date.now() - startTime, details: 'Test failed', error: error.message };
        }
    }

    public async runMultiStepPlanningTest(modelId: string, provider: 'lmstudio' | 'openai' | 'azure' | 'openrouter', settings: any, timeout: number): Promise<ProbeResult> {
        const startTime = Date.now();
        const messages = [
            { role: 'system', content: 'Break tasks into numbered steps. Output as JSON array.' },
            { role: 'user', content: 'Prepare release: run tests, add all files, commit.' }
        ];

        try {
            const response = await this.callLLMNoTools(modelId, provider, messages, settings, timeout);
            const content = response?.choices?.[0]?.message?.content || '';
            const jsonMatch = content.match(/\[[\s\S]*\]/);
            if (!jsonMatch) return { testName: 'multi_step_planning', passed: false, score: 20, latency: Date.now() - startTime, details: 'No JSON array' };

            const steps = JSON.parse(jsonMatch[0]);
            return { testName: 'multi_step_planning', passed: steps.length >= 2, score: 100, latency: Date.now() - startTime, details: `${steps.length} steps planned` };
        } catch (error: any) { return { testName: 'multi_step_planning', passed: false, score: 0, latency: Date.now() - startTime, details: 'Test failed' }; }
    }

    public async runConditionalReasoningTest(modelId: string, provider: 'lmstudio' | 'openai' | 'azure' | 'openrouter', settings: any, timeout: number): Promise<ProbeResult> {
        const startTime = Date.now();
        const messages = [
            { role: 'user', content: 'If package.json exists, read it. Otherwise, create it. The file EXISTS.' }
        ];

        try {
            const response = await this.callLLMNoTools(modelId, provider, messages, settings, timeout);
            const content = response?.choices?.[0]?.message?.content || '';
            const isRead = content.toLowerCase().includes('read');
            return { testName: 'conditional_reasoning', passed: isRead, score: isRead ? 100 : 40, latency: Date.now() - startTime, details: isRead ? 'Correct choice' : 'Wrong choice' };
        } catch (error: any) { return { testName: 'conditional_reasoning', passed: false, score: 0, latency: Date.now() - startTime, details: 'Test failed' }; }
    }

    public async runContextContinuityTest(modelId: string, provider: 'lmstudio' | 'openai' | 'azure' | 'openrouter', settings: any, timeout: number): Promise<ProbeResult> {
        const startTime = Date.now();
        const messages = [
            { role: 'user', content: 'The API endpoint is /users/profile' },
            { role: 'assistant', content: 'Understood.' },
            { role: 'user', content: 'Make a GET request to it.' }
        ];

        try {
            const response = await this.callLLMNoTools(modelId, provider, messages, settings, timeout);
            const content = response?.choices?.[0]?.message?.content || '';
            const remembered = content.includes('/users/profile');
            return { testName: 'context_continuity', passed: remembered, score: remembered ? 100 : 20, latency: Date.now() - startTime, details: remembered ? 'Remembered endpoint' : 'Forgot endpoint' };
        } catch (error: any) { return { testName: 'context_continuity', passed: false, score: 0, latency: Date.now() - startTime, details: 'Test failed' }; }
    }

    public async runLogicalConsistencyTest(modelId: string, provider: 'lmstudio' | 'openai' | 'azure' | 'openrouter', settings: any, timeout: number): Promise<ProbeResult> {
        const startTime = Date.now();
        const messages = [
            { role: 'user', content: 'Delete the file log.txt, then append new data to log.txt.' }
        ];

        try {
            const response = await this.callLLMNoTools(modelId, provider, messages, settings, timeout);
            const content = response?.choices?.[0]?.message?.content || '';
            const detected = content.toLowerCase().includes('conflict') || content.toLowerCase().includes('cannot');
            return { testName: 'logical_consistency', passed: detected, score: detected ? 100 : 30, latency: Date.now() - startTime, details: detected ? 'Detected conflict' : 'Failed to detect conflict' };
        } catch (error: any) { return { testName: 'logical_consistency', passed: false, score: 0, latency: Date.now() - startTime, details: 'Test failed' }; }
    }

    public async runExplanationTest(modelId: string, provider: 'lmstudio' | 'openai' | 'azure' | 'openrouter', settings: any, timeout: number): Promise<ProbeResult> {
        const startTime = Date.now();
        const messages = [
            { role: 'system', content: 'Explain reasoning then output JSON action.' },
            { role: 'user', content: 'Update config.json' }
        ];

        try {
            const response = await this.callLLMNoTools(modelId, provider, messages, settings, timeout);
            const content = response?.choices?.[0]?.message?.content || '';
            const hasReasoning = content.toLowerCase().includes('reasoning') || content.length > 50;
            return { testName: 'explanation', passed: hasReasoning, score: hasReasoning ? 100 : 40, latency: Date.now() - startTime, details: hasReasoning ? 'Provided explanation' : 'No explanation' };
        } catch (error: any) { return { testName: 'explanation', passed: false, score: 0, latency: Date.now() - startTime, details: 'Test failed' }; }
    }

    public async runEdgeCaseHandlingTest(modelId: string, provider: 'lmstudio' | 'openai' | 'azure' | 'openrouter', settings: any, timeout: number): Promise<ProbeResult> {
        const startTime = Date.now();
        const messages = [
            { role: 'user', content: 'Append to notes.txt, but it may not exist.' }
        ];

        try {
            const response = await this.callLLMNoTools(modelId, provider, messages, settings, timeout);
            const content = response?.choices?.[0]?.message?.content || '';
            const handled = content.toLowerCase().includes('not exist') || content.toLowerCase().includes('create');
            return { testName: 'edge_case_handling', passed: handled, score: handled ? 100 : 40, latency: Date.now() - startTime, details: handled ? 'Handled edge case' : 'Ignored edge case' };
        } catch (error: any) { return { testName: 'edge_case_handling', passed: false, score: 0, latency: Date.now() - startTime, details: 'Test failed' }; }
    }
}
