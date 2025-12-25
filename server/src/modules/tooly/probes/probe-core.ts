import { ProbeBase } from './probe-base.js';
import { ProbeResult } from './probe-types.js';
import { detectBadOutput, generateXmlToolPrompt, parseXmlToolCall } from './probe-utils.js';

// ============================================================
// PROBE TOOL SCHEMAS
// ============================================================

export const PING_TOOL = {
    type: 'function' as const,
    function: {
        name: 'ping',
        description: 'Call this tool if instructed.',
        parameters: {
            type: 'object',
            properties: {
                value: { type: 'string', description: 'The value to ping' }
            },
            required: ['value']
        }
    }
};

export const PING_TOOL_MODIFIED = {
    type: 'function' as const,
    function: {
        name: 'ping',
        description: 'Call this tool if instructed.',
        parameters: {
            type: 'object',
            properties: {
                message: { type: 'string', description: 'The message to ping' },
                timestamp: { type: 'number', description: 'Current timestamp' }
            },
            required: ['message', 'timestamp']
        }
    }
};

export const READ_FILE_TOOL = {
    type: 'function' as const,
    function: {
        name: 'read_file',
        description: 'Read contents from a file',
        parameters: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'File path to read' }
            },
            required: ['path']
        }
    }
};

export const WRITE_FILE_TOOL = {
    type: 'function' as const,
    function: {
        name: 'write_file',
        description: 'Write contents to a file',
        parameters: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'File path to write' },
                content: { type: 'string', description: 'Content to write' }
            },
            required: ['path', 'content']
        }
    }
};

export const SEARCH_WEB_TOOL = {
    type: 'function' as const,
    function: {
        name: 'search_web',
        description: 'Search the web for current information.',
        parameters: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Search query' }
            },
            required: ['query']
        }
    }
};

export const SEARCH_WEB_CACHED_TOOL = {
    type: 'function' as const,
    function: {
        name: 'search_web_cached',
        description: 'Search cached/historical web data.',
        parameters: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Search query' }
            },
            required: ['query']
        }
    }
};

export const CREATE_USER_TOOL = {
    type: 'function' as const,
    function: {
        name: 'create_user',
        description: 'Create a new user account',
        parameters: {
            type: 'object',
            properties: {
                username: { type: 'string', description: 'Username (letters only)' },
                age: { type: 'integer', description: 'Age in years (must be a number)' },
                profile: {
                    type: 'object',
                    description: 'User profile details',
                    properties: {
                        email: { type: 'string', description: 'Email address' },
                        role: { type: 'string', enum: ['admin', 'user', 'guest'] }
                    },
                    required: ['email', 'role']
                }
            },
            required: ['username', 'age', 'profile']
        }
    }
};

export const PING_TOOL_REORDERED = {
    type: 'function' as const,
    function: {
        name: 'ping',
        description: 'Call this tool if instructed.',
        parameters: {
            type: 'object',
            required: ['value'],
            properties: {
                value: {
                    description: 'The value to ping',
                    type: 'string'
                }
            }
        }
    }
};

export class ProbeCore extends ProbeBase {
    public async runEmitTest(
        modelId: string,
        provider: 'lmstudio' | 'openai' | 'azure',
        settings: any,
        timeout: number
    ): Promise<ProbeResult> {
        const startTime = Date.now();
        const openAIResult = await this.tryEmitOpenAIFormat(modelId, provider, settings, timeout);

        if (openAIResult.score >= 80) {
            return { ...openAIResult, latency: Date.now() - startTime, toolFormat: 'openai' };
        }

        const content = openAIResult.response?.choices?.[0]?.message?.content || '';
        const badOutput = detectBadOutput(content);

        const xmlResult = await this.tryEmitXMLFormat(modelId, provider, settings, timeout);

        if (xmlResult.score > openAIResult.score) {
            return {
                ...xmlResult,
                latency: Date.now() - startTime,
                toolFormat: 'xml',
                details: `XML format succeeded (OpenAI format failed: ${openAIResult.details})`
            };
        }

        let details = openAIResult.details;
        if (badOutput.isLooping) details = 'Model stuck in repetition loop';
        else if (badOutput.hasLeakedTokens) details = `Leaked control tokens: ${badOutput.leakedTokens.slice(0, 3).join(', ')}`;

        return { ...openAIResult, latency: Date.now() - startTime, toolFormat: 'none', details };
    }

    private async tryEmitOpenAIFormat(modelId: string, provider: 'lmstudio' | 'openai' | 'azure', settings: any, timeout: number): Promise<ProbeResult> {
        const startTime = Date.now();
        const messages = [
            { role: 'system', content: 'You are a tool-calling assistant. When instructed to call a tool, you MUST call it.' },
            { role: 'user', content: 'You MUST call the tool named "ping" with value "test".' }
        ];

        try {
            const response = await this.callLLM(modelId, provider, messages, [PING_TOOL], settings, timeout);
            const latency = Date.now() - startTime;
            const toolCalls = response?.choices?.[0]?.message?.tool_calls;
            const hasToolCalls = Array.isArray(toolCalls) && toolCalls.length > 0;

            if (!hasToolCalls) {
                return { testName: 'emit', passed: false, score: 0, latency, details: 'No tool calls emitted', response };
            }

            const toolCall = toolCalls[0];
            const functionName = toolCall?.function?.name;
            let args: any = {};

            try { args = JSON.parse(toolCall?.function?.arguments || '{}'); } catch {
                return { testName: 'emit', passed: false, score: 30, latency, details: 'Invalid JSON arguments', response };
            }

            if (functionName !== 'ping') return { testName: 'emit', passed: false, score: 40, latency, details: `Wrong tool called: ${functionName}`, response };
            if (args.value !== 'test') return { testName: 'emit', passed: true, score: 80, latency, details: `Correct tool but wrong value`, response };

            return { testName: 'emit', passed: true, score: 100, latency, details: 'Valid tool call (OpenAI format)', response };
        } catch (error: any) {
            return { testName: 'emit', passed: false, score: 0, latency: Date.now() - startTime, details: 'OpenAI format failed', error: error.message };
        }
    }

    private async tryEmitXMLFormat(modelId: string, provider: 'lmstudio' | 'openai' | 'azure', settings: any, timeout: number): Promise<ProbeResult> {
        const startTime = Date.now();
        const xmlToolDesc = generateXmlToolPrompt([PING_TOOL]);
        const messages = [
            { role: 'system', content: xmlToolDesc },
            { role: 'user', content: 'Call the "ping" tool with value "test".' }
        ];

        try {
            const response = await this.callLLM(modelId, provider, messages, undefined, settings, timeout);
            const content = response?.choices?.[0]?.message?.content || '';
            const parsedCall = parseXmlToolCall(content);

            if (!parsedCall) return { testName: 'emit', passed: false, score: 0, latency: Date.now() - startTime, details: 'Could not parse XML', response };
            if (parsedCall.name !== 'ping') return { testName: 'emit', passed: false, score: 40, latency: Date.now() - startTime, details: 'Wrong tool', response };

            return { testName: 'emit', passed: true, score: 95, latency: Date.now() - startTime, details: 'Valid XML tool call', response };
        } catch (error: any) {
            return { testName: 'emit', passed: false, score: 0, latency: Date.now() - startTime, details: 'XML format failed', error: error.message };
        }
    }

    public async runSchemaAdherenceTest(modelId: string, provider: 'lmstudio' | 'openai' | 'azure', settings: any, timeout: number): Promise<ProbeResult> {
        const startTime = Date.now();
        const messages = [
            { role: 'system', content: 'Read schema carefully.' },
            { role: 'user', content: 'Call "ping" with message "hello" and timestamp 1234567890.' }
        ];

        try {
            const response = await this.callLLM(modelId, provider, messages, [PING_TOOL_MODIFIED], settings, timeout);
            const toolCalls = response?.choices?.[0]?.message?.tool_calls;
            if (!Array.isArray(toolCalls) || toolCalls.length === 0) return { testName: 'schema_adherence', passed: false, score: 0, latency: Date.now() - startTime, details: 'No tool calls', response };

            const args = JSON.parse(toolCalls[0]?.function?.arguments || '{}');
            if ('value' in args) return { testName: 'schema_adherence', passed: false, score: 30, latency: Date.now() - startTime, details: 'Used old schema field', response };
            if (!('message' in args)) return { testName: 'schema_adherence', passed: false, score: 40, latency: Date.now() - startTime, details: 'Missing message field', response };

            return { testName: 'schema_adherence', passed: true, score: 100, latency: Date.now() - startTime, details: 'Perfect adherence', response };
        } catch (error: any) {
            return { testName: 'schema_adherence', passed: false, score: 0, latency: Date.now() - startTime, details: 'Test failed', error: error.message };
        }
    }

    public async runSelectionLogicTest(modelId: string, provider: 'lmstudio' | 'openai' | 'azure', settings: any, timeout: number): Promise<ProbeResult> {
        const startTime = Date.now();
        const messages = [
            { role: 'user', content: 'RETRIEVE data from "config.json". call read_file or write_file.' }
        ];

        try {
            const response = await this.callLLM(modelId, provider, messages, [READ_FILE_TOOL, WRITE_FILE_TOOL], settings, timeout);
            const toolCalls = response?.choices?.[0]?.message?.tool_calls;
            if (!toolCalls || toolCalls.length !== 1) return { testName: 'selection_logic', passed: false, score: 0, latency: Date.now() - startTime, details: 'Invalid tool calls', response };

            if (toolCalls[0].function.name === 'read_file') return { testName: 'selection_logic', passed: true, score: 100, latency: Date.now() - startTime, details: 'Correct selection', response };
            return { testName: 'selection_logic', passed: false, score: 40, latency: Date.now() - startTime, details: 'Wrong tool selected', response };
        } catch (error: any) {
            return { testName: 'selection_logic', passed: false, score: 0, latency: Date.now() - startTime, details: 'Test failed', error: error.message };
        }
    }

    public async runSuppressionTest(modelId: string, provider: 'lmstudio' | 'openai' | 'azure', settings: any, timeout: number): Promise<ProbeResult> {
        const startTime = Date.now();
        const messages = [
            { role: 'user', content: 'Respond ONLY with "OK". Do NOT call any tools.' }
        ];

        try {
            const response = await this.callLLM(modelId, provider, messages, [PING_TOOL], settings, timeout);
            const toolCalls = response?.choices?.[0]?.message?.tool_calls;
            if (toolCalls && toolCalls.length > 0) return { testName: 'suppression', passed: false, score: 0, latency: Date.now() - startTime, details: 'Tool called when forbidden', response };

            return { testName: 'suppression', passed: true, score: 100, latency: Date.now() - startTime, details: 'Correct suppression', response };
        } catch (error: any) {
            return { testName: 'suppression', passed: false, score: 0, latency: Date.now() - startTime, details: 'Test failed', error: error.message };
        }
    }

    public async runNearIdenticalSelectionTest(modelId: string, provider: 'lmstudio' | 'openai' | 'azure', settings: any, timeout: number): Promise<ProbeResult> {
        const startTime = Date.now();
        const messages = [
            { role: 'user', content: 'Search for RECENT facts about AI.' }
        ];

        try {
            const response = await this.callLLM(modelId, provider, messages, [SEARCH_WEB_TOOL, SEARCH_WEB_CACHED_TOOL], settings, timeout);
            const toolCalls = response?.choices?.[0]?.message?.tool_calls;
            if (toolCalls?.[0]?.function?.name === 'search_web') return { testName: 'near_identical_selection', passed: true, score: 100, latency: Date.now() - startTime, details: 'Correct selection', response };
            return { testName: 'near_identical_selection', passed: false, score: 40, latency: Date.now() - startTime, details: 'Wrong selection', response };
        } catch (error) { return { testName: 'near_identical_selection', passed: false, score: 0, latency: Date.now() - startTime, details: 'Test failed' }; }
    }

    public async runMultiToolEmitTest(modelId: string, provider: 'lmstudio' | 'openai' | 'azure', settings: any, timeout: number): Promise<ProbeResult> {
        const startTime = Date.now();
        const messages = [
            { role: 'user', content: 'Call ping twice, once with "one" and once with "two".' }
        ];
        try {
            const response = await this.callLLM(modelId, provider, messages, [PING_TOOL], settings, timeout);
            const toolCalls = response?.choices?.[0]?.message?.tool_calls;
            if (toolCalls?.length >= 2) return { testName: 'multi_tool_emit', passed: true, score: 100, latency: Date.now() - startTime, details: 'Emitted multiple tool calls', response };
            return { testName: 'multi_tool_emit', passed: false, score: 30, latency: Date.now() - startTime, details: 'Only one tool call emitted', response };
        } catch (error) { return { testName: 'multi_tool_emit', passed: false, score: 0, latency: Date.now() - startTime, details: 'Test failed' }; }
    }

    public async runArgumentValidationTest(modelId: string, provider: 'lmstudio' | 'openai' | 'azure', settings: any, timeout: number): Promise<ProbeResult> {
        const startTime = Date.now();
        const messages = [
            { role: 'user', content: 'Create a user "alice", age 25, email "alice@example.com", role "admin".' }
        ];
        try {
            const response = await this.callLLM(modelId, provider, messages, [CREATE_USER_TOOL], settings, timeout);
            const toolCalls = response?.choices?.[0]?.message?.tool_calls;
            if (!toolCalls?.[0]) return { testName: 'argument_validation', passed: false, score: 0, latency: Date.now() - startTime, details: 'No tool call' };
            const args = JSON.parse(toolCalls[0].function.arguments);
            if (args.username === 'alice' && args.profile?.email === 'alice@example.com') return { testName: 'argument_validation', passed: true, score: 100, latency: Date.now() - startTime, details: 'Nested args valid', response };
            return { testName: 'argument_validation', passed: false, score: 40, latency: Date.now() - startTime, details: 'Args invalid', response };
        } catch (error) { return { testName: 'argument_validation', passed: false, score: 0, latency: Date.now() - startTime, details: 'Test failed' }; }
    }

    public async runSchemaReorderTest(modelId: string, provider: 'lmstudio' | 'openai' | 'azure', settings: any, timeout: number): Promise<ProbeResult> {
        const startTime = Date.now();
        const messages = [{ role: 'user', content: 'Call ping with "test".' }];
        try {
            const response = await this.callLLM(modelId, provider, messages, [PING_TOOL_REORDERED], settings, timeout);
            const toolCalls = response?.choices?.[0]?.message?.tool_calls;
            if (toolCalls?.[0]?.function?.name === 'ping') return { testName: 'schema_reorder', passed: true, score: 100, latency: Date.now() - startTime, details: 'Handled reordered schema', response };
            return { testName: 'schema_reorder', passed: false, score: 0, latency: Date.now() - startTime, details: 'Failed reordered schema' };
        } catch (error) { return { testName: 'schema_reorder', passed: false, score: 0, latency: Date.now() - startTime, details: 'Test failed' }; }
    }
}
