import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    TestDefinition,
    TestResult,
    CheckResult,
    ParamCondition
} from './test-types.js';
import { getToolSchemas } from '../tool-prompts.js';
import { COMMON_STOP_STRINGS } from '../probes/probe-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class TestRunner {
    private sandboxDir: string;

    constructor() {
        this.sandboxDir = path.join(__dirname, '../../../../data/test-sandbox');
    }

    public async runSingleTest(
        test: TestDefinition,
        modelId: string,
        provider: 'lmstudio' | 'openai' | 'azure' | 'openrouter',
        settings: any
    ): Promise<TestResult> {
        const startTime = Date.now();
        if (test.setupFiles) await this.setupSandbox(test.setupFiles);

        try {
            const messages = [
                { role: 'system', content: 'You are a helpful assistant. Use tools when appropriate.' },
                { role: 'user', content: test.prompt }
            ];
            const tools = getToolSchemas([test.tool]);
            const response = await this.callLLM(modelId, provider, messages, tools, settings);
            const latency = Date.now() - startTime;
            const evalRes = this.evaluateResponse(response, test.expected);

            return {
                testId: test.id,
                tool: test.tool,
                passed: evalRes.passed,
                score: evalRes.score,
                latency,
                checks: evalRes.checks,
                response,
                calledTool: evalRes.calledTool,
                calledArgs: evalRes.calledArgs
            };
        } finally {
            await this.cleanupSandbox();
        }
    }

    public async runSingleProbe(
        probe: any, // ProbeDefinition
        modelId: string,
        provider: 'lmstudio' | 'openai' | 'azure' | 'openrouter',
        settings: any
    ): Promise<TestResult> {
        const startTime = Date.now();
        try {
            const messages = [
                { role: 'system', content: probe.systemPrompt || 'You are a helpful assistant.' },
                { role: 'user', content: probe.prompt }
            ];
            const tools = getToolSchemas(probe.tools || []);
            const response = await this.callLLM(modelId, provider, messages, tools, settings);
            const latency = Date.now() - startTime;

            // Extract tool calls from response
            const toolCalls = response.choices?.[0]?.message?.tool_calls || [];

            const evalRes = probe.evaluate(response, toolCalls);

            // Check for tool hallucination and add to details
            const validToolNames = tools.map(t => t.function.name);
            const hallucinatedTools = toolCalls
                .map((tc: any) => tc.function?.name)
                .filter((name: any) => name && !validToolNames.includes(name));

            let details = evalRes.details;
            if (hallucinatedTools.length > 0) {
                details += ` | Hallucinated tools: ${hallucinatedTools.join(', ')}`;
            }

            return {
                testId: probe.id,
                tool: 'probe',
                category: 'tool', // Categorize as tool-related test
                passed: evalRes.passed,
                score: evalRes.score,
                latency,
                checks: evalRes.checks || [],
                response,
                details
            };
        } catch (error: any) {
            return {
                testId: probe.id,
                tool: 'probe',
                passed: false,
                score: 0,
                latency: Date.now() - startTime,
                checks: [],
                error: error.message
            };
        }
    }

    private async callLLM(modelId: string, provider: string, messages: any[], tools: any[], settings: any): Promise<any> {
        let url = '';
        const headers: any = { 'Content-Type': 'application/json' };
        const body: any = { messages, tools, tool_choice: 'auto', temperature: 0, max_tokens: 500 };

        if (provider === 'lmstudio') {
            url = `${settings.lmstudioUrl}/v1/chat/completions`;
            body.model = modelId;
            body.stop = COMMON_STOP_STRINGS;
        } else if (provider === 'openai') {
            url = 'https://api.openai.com/v1/chat/completions';
            headers['Authorization'] = `Bearer ${settings.openaiApiKey}`;
            body.model = modelId;
        } else if (provider === 'azure') {
            const { azureResourceName, azureDeploymentName, azureApiKey, azureApiVersion } = settings;
            url = `https://${azureResourceName}.openai.azure.com/openai/deployments/${azureDeploymentName}/chat/completions?api-version=${azureApiVersion || '2024-02-01'}`;
            headers['api-key'] = azureApiKey;
        } else if (provider === 'openrouter') {
            url = 'https://openrouter.ai/api/v1/chat/completions';
            headers['Authorization'] = `Bearer ${settings.openrouterApiKey}`;
            headers['HTTP-Referer'] = 'https://summy.ai';
            headers['X-Title'] = 'Summy AI';
            body.model = modelId;

            // LOG EXACT OPENROUTER REQUEST FOR 401 DEBUGGING
            console.log('🔍 OPENROUTER REQUEST DETAILS (401 DEBUG):');
            console.log('URL:', url);
            console.log('Method: POST');
            console.log('Headers:', JSON.stringify(headers, null, 2));
            console.log('Body:', JSON.stringify(body, null, 2));
            console.log('Model ID:', modelId);
            console.log('API Key (masked):', settings.openrouterApiKey ? `${settings.openrouterApiKey.substring(0, 10)}...` : 'MISSING');
        }

        console.log(`📤 Making ${provider.toUpperCase()} request to: ${url}`);
        try {
            const response = await axios.post(url, body, { headers, timeout: 60000 });
            console.log(`✅ ${provider.toUpperCase()} request successful:`, response.status);
            return response.data;
        } catch (error: any) {
            console.log(`❌ ${provider.toUpperCase()} request failed:`, {
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: error.response?.data,
                message: error.message
            });
            throw error;
        }
    }

    private evaluateResponse(response: any, expected: any) {
        const checks: CheckResult[] = [];
        let score = 0;
        const toolCalls = response?.choices?.[0]?.message?.tool_calls;
        const hasToolCalls = Array.isArray(toolCalls) && toolCalls.length > 0;
        checks.push({ name: 'has_tool_calls', passed: hasToolCalls, expected: 'tool_calls array', actual: hasToolCalls ? 'yes' : 'no' });
        if (!hasToolCalls) return { score: 0, checks, passed: false };

        score += 20;
        const toolCall = toolCalls[0];
        const functionName = toolCall?.function?.name;
        const args = JSON.parse(toolCall?.function?.arguments || '{}');

        const correctTool = functionName === expected.tool;
        checks.push({ name: 'correct_tool', passed: correctTool, expected: expected.tool, actual: functionName });
        if (correctTool) score += 25;

        const paramCount = Object.keys(expected.params).length;
        const pointsPerParam = paramCount > 0 ? Math.floor(55 / paramCount) : 0;

        for (const [name, cond] of Object.entries(expected.params)) {
            const passed = this.evaluateCondition(args[name], cond as ParamCondition);
            checks.push({ name: `param_${name}`, passed, expected: JSON.stringify(cond), actual: JSON.stringify(args[name]) });
            if (passed) score += pointsPerParam;
        }

        return { score: Math.min(score, 100), checks, passed: score >= 70, calledTool: functionName, calledArgs: args };
    }

    private evaluateCondition(value: any, cond: ParamCondition): boolean {
        if (cond.equals !== undefined) return value === cond.equals;
        if (cond.contains !== undefined) return typeof value === 'string' && value.includes(cond.contains);
        if (cond.oneOf !== undefined) return cond.oneOf.includes(value);
        if (cond.exists !== undefined) return cond.exists ? value !== undefined : value === undefined;
        return true;
    }

    private async setupSandbox(files: Record<string, string>) {
        await fs.ensureDir(this.sandboxDir);
        for (const [p, c] of Object.entries(files)) {
            const full = path.join(this.sandboxDir, p);
            await fs.ensureDir(path.dirname(full));
            await fs.writeFile(full, c, 'utf-8');
        }
    }

    private async cleanupSandbox() {
        try { await fs.remove(this.sandboxDir); } catch { }
    }
}
