/**
 * Probe Engine
 * Implements capability probing tests to evaluate model behavior for tool calling
 * 
 * Four probe tests:
 * 1. Emit Test - Can model emit valid tool_calls when forced?
 * 2. Schema Adherence Test - Does model adapt to schema changes?
 * 3. Selection Logic Test - Can model choose correctly between similar tools?
 * 4. Suppression Test - Can model NOT call tools when forbidden?
 */

import axios from 'axios';
import { LMStudioClient } from '@lmstudio/sdk';
import { notifications } from '../../services/notifications.js';

// ============================================================
// TYPES
// ============================================================

export interface ProbeResult {
  testName: string;
  passed: boolean;
  score: number;        // 0-100
  latency: number;      // ms
  details: string;
  response?: any;
  error?: string;
}

export interface ProbeRunResult {
  modelId: string;
  provider: 'lmstudio' | 'openai' | 'azure';
  startedAt: string;
  completedAt: string;
  
  // Individual probe results
  emitTest: ProbeResult;
  schemaTest: ProbeResult;
  selectionTest: ProbeResult;
  suppressionTest: ProbeResult;
  
  // Aggregated results
  overallScore: number;
  role: 'main' | 'executor' | 'both' | 'none';
  
  // Context latency profiling
  contextLatency?: ContextLatencyResult;
}

export interface ContextLatencyResult {
  testedContextSizes: number[];
  latencies: Record<number, number>;  // context size -> latency in ms
  maxUsableContext: number;           // Largest context under 30s
  recommendedContext: number;         // Suggested context size
}

export interface ProbeOptions {
  contextLength?: number;
  timeout?: number;              // Default 30000ms
  runLatencyProfile?: boolean;   // Run context latency profiling
}

// ============================================================
// PROBE TOOL SCHEMAS (Minimal test tools)
// ============================================================

const PING_TOOL = {
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

// Modified schema for adherence test (renamed field, added required param)
const PING_TOOL_MODIFIED = {
  type: 'function' as const,
  function: {
    name: 'ping',
    description: 'Call this tool if instructed.',
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'The message to ping' },  // Renamed from 'value'
        timestamp: { type: 'number', description: 'Current timestamp' }   // Added required param
      },
      required: ['message', 'timestamp']
    }
  }
};

// Similar tools for selection test
const READ_FILE_TOOL = {
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

const WRITE_FILE_TOOL = {
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

// ============================================================
// PROBE ENGINE
// ============================================================

class ProbeEngine {
  private defaultTimeout = 30000; // 30 seconds

  /**
   * Run all probe tests for a model
   */
  async runAllProbes(
    modelId: string,
    provider: 'lmstudio' | 'openai' | 'azure',
    settings: {
      lmstudioUrl?: string;
      openaiApiKey?: string;
      azureResourceName?: string;
      azureApiKey?: string;
      azureDeploymentName?: string;
      azureApiVersion?: string;
    },
    options: ProbeOptions = {}
  ): Promise<ProbeRunResult> {
    const startedAt = new Date().toISOString();
    const timeout = options.timeout || this.defaultTimeout;

    console.log(`[ProbeEngine] Starting probe tests for ${modelId} (provider: ${provider})`);
    notifications.info(`Starting probe tests for ${modelId}`);

    // Run all four probe tests
    const emitTest = await this.runEmitTest(modelId, provider, settings, timeout);
    const schemaTest = await this.runSchemaAdherenceTest(modelId, provider, settings, timeout);
    const selectionTest = await this.runSelectionLogicTest(modelId, provider, settings, timeout);
    const suppressionTest = await this.runSuppressionTest(modelId, provider, settings, timeout);

    // Calculate overall score (weighted)
    const overallScore = Math.round(
      emitTest.score * 0.30 +      // Emit is foundational
      schemaTest.score * 0.25 +    // Schema adherence matters for evolution
      selectionTest.score * 0.25 + // Selection logic for multi-tool
      suppressionTest.score * 0.20 // Suppression for safety
    );

    // Determine role based on probe results
    const role = this.determineRole(emitTest, schemaTest, selectionTest, suppressionTest);

    // Optional: Run context latency profiling
    let contextLatency: ContextLatencyResult | undefined;
    if (options.runLatencyProfile) {
      contextLatency = await this.runContextLatencyProfile(modelId, provider, settings, timeout);
    }

    const result: ProbeRunResult = {
      modelId,
      provider,
      startedAt,
      completedAt: new Date().toISOString(),
      emitTest,
      schemaTest,
      selectionTest,
      suppressionTest,
      overallScore,
      role,
      contextLatency
    };

    console.log(`[ProbeEngine] Completed probe tests for ${modelId}: score=${overallScore}, role=${role}`);
    notifications.success(`Probe tests completed for ${modelId}: ${role} role, score ${overallScore}/100`);

    return result;
  }

  /**
   * PROBE 1: Emit Test
   * Can the model emit valid tool_calls when forced?
   */
  private async runEmitTest(
    modelId: string,
    provider: 'lmstudio' | 'openai' | 'azure',
    settings: any,
    timeout: number
  ): Promise<ProbeResult> {
    const startTime = Date.now();

    const messages = [
      {
        role: 'system',
        content: 'You are a tool-calling assistant. When instructed to call a tool, you MUST call it. Do not explain or output text.'
      },
      {
        role: 'user',
        content: 'You MUST call the tool named "ping" with value "test".\nDo not explain.\nDo not answer in text.'
      }
    ];

    try {
      const response = await this.callLLM(modelId, provider, messages, [PING_TOOL], settings, timeout);
      const latency = Date.now() - startTime;

      // Evaluate: Did it emit a valid tool call?
      const toolCalls = response?.choices?.[0]?.message?.tool_calls;
      const hasToolCalls = Array.isArray(toolCalls) && toolCalls.length > 0;

      if (!hasToolCalls) {
        // Check if it tried to describe the tool instead
        const content = response?.choices?.[0]?.message?.content || '';
        const describesToolInstead = content.toLowerCase().includes('ping') || 
                                      content.toLowerCase().includes('tool');
        
        return {
          testName: 'emit',
          passed: false,
          score: describesToolInstead ? 10 : 0,
          latency,
          details: describesToolInstead 
            ? 'Model described the tool instead of calling it' 
            : 'No tool calls emitted',
          response
        };
      }

      const toolCall = toolCalls[0];
      const functionName = toolCall?.function?.name;
      let args: any = {};

      try {
        args = JSON.parse(toolCall?.function?.arguments || '{}');
      } catch {
        return {
          testName: 'emit',
          passed: false,
          score: 30,
          latency,
          details: 'Tool call emitted but arguments are invalid JSON',
          response
        };
      }

      // Check correct tool name
      if (functionName !== 'ping') {
        return {
          testName: 'emit',
          passed: false,
          score: 40,
          latency,
          details: `Wrong tool called: ${functionName}`,
          response
        };
      }

      // Check correct parameter
      if (args.value !== 'test') {
        return {
          testName: 'emit',
          passed: true,
          score: 80,
          latency,
          details: `Correct tool but wrong value: "${args.value}" instead of "test"`,
          response
        };
      }

      return {
        testName: 'emit',
        passed: true,
        score: 100,
        latency,
        details: 'Valid tool call with correct parameters',
        response
      };

    } catch (error: any) {
      return {
        testName: 'emit',
        passed: false,
        score: 0,
        latency: Date.now() - startTime,
        details: 'Test failed',
        error: error.message
      };
    }
  }

  /**
   * PROBE 2: Schema Adherence Test
   * Does the model adapt to schema changes (renamed fields, added params)?
   */
  private async runSchemaAdherenceTest(
    modelId: string,
    provider: 'lmstudio' | 'openai' | 'azure',
    settings: any,
    timeout: number
  ): Promise<ProbeResult> {
    const startTime = Date.now();

    // Use modified schema with renamed field and added required param
    const messages = [
      {
        role: 'system',
        content: 'You are a tool-calling assistant. Read the tool schema carefully and provide all required parameters.'
      },
      {
        role: 'user',
        content: 'Call the "ping" tool with message "hello" and timestamp 1234567890.\nDo not explain. Only output the tool call.'
      }
    ];

    try {
      const response = await this.callLLM(modelId, provider, messages, [PING_TOOL_MODIFIED], settings, timeout);
      const latency = Date.now() - startTime;

      const toolCalls = response?.choices?.[0]?.message?.tool_calls;
      if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
        return {
          testName: 'schema_adherence',
          passed: false,
          score: 0,
          latency,
          details: 'No tool calls emitted',
          response
        };
      }

      const toolCall = toolCalls[0];
      let args: any = {};

      try {
        args = JSON.parse(toolCall?.function?.arguments || '{}');
      } catch {
        return {
          testName: 'schema_adherence',
          passed: false,
          score: 20,
          latency,
          details: 'Invalid JSON arguments',
          response
        };
      }

      // Check if model used NEW field names (message, timestamp) not OLD (value)
      const usedOldSchema = 'value' in args;
      const usedNewSchema = 'message' in args;
      const hasTimestamp = 'timestamp' in args;

      if (usedOldSchema && !usedNewSchema) {
        return {
          testName: 'schema_adherence',
          passed: false,
          score: 30,
          latency,
          details: 'Model used old schema field "value" instead of new field "message" - pattern matching not schema reading',
          response
        };
      }

      if (!usedNewSchema) {
        return {
          testName: 'schema_adherence',
          passed: false,
          score: 40,
          latency,
          details: 'Missing "message" field',
          response
        };
      }

      if (!hasTimestamp) {
        return {
          testName: 'schema_adherence',
          passed: true,
          score: 70,
          latency,
          details: 'Used new schema but missing added required field "timestamp"',
          response
        };
      }

      // Check values
      const correctMessage = args.message === 'hello';
      const correctTimestamp = args.timestamp === 1234567890;

      if (correctMessage && correctTimestamp) {
        return {
          testName: 'schema_adherence',
          passed: true,
          score: 100,
          latency,
          details: 'Perfect schema adherence - read schema and used correct field names and values',
          response
        };
      }

      return {
        testName: 'schema_adherence',
        passed: true,
        score: 85,
        latency,
        details: `Schema followed but values differ (message: ${args.message}, timestamp: ${args.timestamp})`,
        response
      };

    } catch (error: any) {
      return {
        testName: 'schema_adherence',
        passed: false,
        score: 0,
        latency: Date.now() - startTime,
        details: 'Test failed',
        error: error.message
      };
    }
  }

  /**
   * PROBE 3: Selection Logic Test
   * Can the model choose correctly between similar tools based on conditions?
   */
  private async runSelectionLogicTest(
    modelId: string,
    provider: 'lmstudio' | 'openai' | 'azure',
    settings: any,
    timeout: number
  ): Promise<ProbeResult> {
    const startTime = Date.now();

    const messages = [
      {
        role: 'system',
        content: 'You have access to two tools: read_file and write_file. Choose the correct one based on the condition.'
      },
      {
        role: 'user',
        content: `Condition: The task is to RETRIEVE data from "config.json".

If you need to RETRIEVE/READ data, call read_file.
If you need to STORE/WRITE data, call write_file.

You MUST call exactly one tool. Do not explain.`
      }
    ];

    try {
      const response = await this.callLLM(
        modelId, 
        provider, 
        messages, 
        [READ_FILE_TOOL, WRITE_FILE_TOOL], 
        settings, 
        timeout
      );
      const latency = Date.now() - startTime;

      const toolCalls = response?.choices?.[0]?.message?.tool_calls;
      if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
        return {
          testName: 'selection_logic',
          passed: false,
          score: 0,
          latency,
          details: 'No tool calls emitted',
          response
        };
      }

      // Check if model called both tools (bad)
      if (toolCalls.length > 1) {
        return {
          testName: 'selection_logic',
          passed: false,
          score: 30,
          latency,
          details: 'Model called multiple tools instead of selecting one',
          response
        };
      }

      const toolCall = toolCalls[0];
      const functionName = toolCall?.function?.name;

      // Correct answer: read_file (because we said "RETRIEVE")
      if (functionName === 'read_file') {
        let args: any = {};
        try {
          args = JSON.parse(toolCall?.function?.arguments || '{}');
        } catch {
          // Ignore parse errors for this check
        }

        const hasCorrectPath = args.path?.includes('config.json');

        return {
          testName: 'selection_logic',
          passed: true,
          score: hasCorrectPath ? 100 : 85,
          latency,
          details: hasCorrectPath 
            ? 'Correct tool selected with correct file path'
            : 'Correct tool selected but path may differ',
          response
        };
      }

      if (functionName === 'write_file') {
        return {
          testName: 'selection_logic',
          passed: false,
          score: 40,
          latency,
          details: 'Model chose write_file when read_file was required - failed to understand condition',
          response
        };
      }

      return {
        testName: 'selection_logic',
        passed: false,
        score: 20,
        latency,
        details: `Unknown tool called: ${functionName}`,
        response
      };

    } catch (error: any) {
      return {
        testName: 'selection_logic',
        passed: false,
        score: 0,
        latency: Date.now() - startTime,
        details: 'Test failed',
        error: error.message
      };
    }
  }

  /**
   * PROBE 4: Suppression Test
   * Can the model NOT call tools when explicitly forbidden?
   */
  private async runSuppressionTest(
    modelId: string,
    provider: 'lmstudio' | 'openai' | 'azure',
    settings: any,
    timeout: number
  ): Promise<ProbeResult> {
    const startTime = Date.now();

    const messages = [
      {
        role: 'system',
        content: 'You are an assistant with access to tools. However, you must follow instructions about when to use them.'
      },
      {
        role: 'user',
        content: `You are NOT allowed to call any tool right now.
Respond ONLY with the text "OK".
Do not call the ping tool.
Do not call any tool.
Just say "OK".`
      }
    ];

    try {
      const response = await this.callLLM(modelId, provider, messages, [PING_TOOL], settings, timeout);
      const latency = Date.now() - startTime;

      const toolCalls = response?.choices?.[0]?.message?.tool_calls;
      const hasToolCalls = Array.isArray(toolCalls) && toolCalls.length > 0;
      const content = response?.choices?.[0]?.message?.content || '';

      if (hasToolCalls) {
        // Model called a tool when forbidden - fail
        return {
          testName: 'suppression',
          passed: false,
          score: 0,
          latency,
          details: 'Model called a tool when explicitly forbidden - uncontrollable',
          response
        };
      }

      // Check if response is "OK" or similar
      const normalizedContent = content.trim().toLowerCase();
      const isOk = normalizedContent === 'ok' || 
                   normalizedContent === 'ok.' ||
                   normalizedContent === '"ok"' ||
                   normalizedContent === "'ok'";

      if (isOk) {
        return {
          testName: 'suppression',
          passed: true,
          score: 100,
          latency,
          details: 'Perfect suppression - responded with "OK" and no tool calls',
          response
        };
      }

      // Responded with text but not exactly "OK"
      const mentionsTool = normalizedContent.includes('tool') || 
                           normalizedContent.includes('ping');

      if (mentionsTool) {
        return {
          testName: 'suppression',
          passed: true,
          score: 70,
          latency,
          details: 'No tool called but mentioned tools in response',
          response
        };
      }

      return {
        testName: 'suppression',
        passed: true,
        score: 85,
        latency,
        details: `No tool called, but response was: "${content.slice(0, 50)}"`,
        response
      };

    } catch (error: any) {
      return {
        testName: 'suppression',
        passed: false,
        score: 0,
        latency: Date.now() - startTime,
        details: 'Test failed',
        error: error.message
      };
    }
  }

  /**
   * Determine model role based on probe results
   */
  private determineRole(
    emit: ProbeResult,
    schema: ProbeResult,
    selection: ProbeResult,
    suppression: ProbeResult
  ): 'main' | 'executor' | 'both' | 'none' {
    // Main model requirements:
    // - Good suppression (can refrain from tools)
    // - Good selection (can reason about which tool)
    const canBeMain = suppression.passed && suppression.score >= 70 && 
                      selection.passed && selection.score >= 70;

    // Executor model requirements:
    // - Good emit (can produce tool calls)
    // - Good schema adherence (follows tool schemas exactly)
    const canBeExecutor = emit.passed && emit.score >= 80 && 
                          schema.passed && schema.score >= 70;

    if (canBeMain && canBeExecutor) {
      return 'both';
    }
    
    if (canBeMain) {
      return 'main';
    }
    
    if (canBeExecutor) {
      return 'executor';
    }

    return 'none';
  }

  /**
   * Run context latency profiling
   * Tests model at increasing context sizes, early exit if >30s
   */
  async runContextLatencyProfile(
    modelId: string,
    provider: 'lmstudio' | 'openai' | 'azure',
    settings: any,
    timeout: number
  ): Promise<ContextLatencyResult> {
    const contextSizes = [2048, 4096, 8192, 16384, 32768, 65536, 131072];
    const latencies: Record<number, number> = {};
    const testedContextSizes: number[] = [];
    let maxUsableContext = 2048;
    const maxLatencyThreshold = 30000; // 30 seconds

    console.log(`[ProbeEngine] Starting context latency profiling for ${modelId}`);

    for (const contextSize of contextSizes) {
      // For LM Studio, we need to reload model with new context size
      if (provider === 'lmstudio' && settings.lmstudioUrl) {
        try {
          const client = new LMStudioClient();
          
          // Unload current model
          try {
            await client.llm.unload(modelId);
          } catch {
            // Model might not be loaded
          }

          // Load with new context size
          await client.llm.load(modelId, {
            config: { contextLength: contextSize }
          });

          console.log(`[ProbeEngine] Loaded model with context size ${contextSize}`);
        } catch (error: any) {
          console.log(`[ProbeEngine] Cannot load model at context ${contextSize}: ${error.message}`);
          break; // Stop testing larger contexts
        }
      }

      // Run a simple emit test to measure latency
      const startTime = Date.now();
      
      try {
        const messages = [
          { role: 'system', content: 'Call the ping tool with value "latency_test".' },
          { role: 'user', content: 'Call ping now.' }
        ];

        await this.callLLM(modelId, provider, messages, [PING_TOOL], settings, timeout);
        
        const latency = Date.now() - startTime;
        latencies[contextSize] = latency;
        testedContextSizes.push(contextSize);

        console.log(`[ProbeEngine] Context ${contextSize}: ${latency}ms`);

        if (latency < maxLatencyThreshold) {
          maxUsableContext = contextSize;
        } else {
          // Early exit - larger contexts will only be slower
          console.log(`[ProbeEngine] Latency exceeded threshold at ${contextSize}, stopping`);
          break;
        }

      } catch (error: any) {
        console.log(`[ProbeEngine] Error testing context ${contextSize}: ${error.message}`);
        break;
      }
    }

    // Recommended context is the largest usable one
    const recommendedContext = maxUsableContext;

    return {
      testedContextSizes,
      latencies,
      maxUsableContext,
      recommendedContext
    };
  }

  /**
   * Call LLM with tools
   */
  private async callLLM(
    modelId: string,
    provider: 'lmstudio' | 'openai' | 'azure',
    messages: any[],
    tools: any[],
    settings: any,
    timeout: number
  ): Promise<any> {
    let url: string;
    let headers: Record<string, string> = { 'Content-Type': 'application/json' };
    let body: any = {
      messages,
      tools,
      tool_choice: 'auto',
      temperature: 0  // Always use temp 0 for deterministic testing
    };

    switch (provider) {
      case 'lmstudio':
        url = `${settings.lmstudioUrl}/v1/chat/completions`;
        body.model = modelId;
        break;

      case 'openai':
        url = 'https://api.openai.com/v1/chat/completions';
        headers['Authorization'] = `Bearer ${settings.openaiApiKey}`;
        body.model = modelId;
        break;

      case 'azure':
        const { azureResourceName, azureDeploymentName, azureApiKey, azureApiVersion } = settings;
        url = `https://${azureResourceName}.openai.azure.com/openai/deployments/${azureDeploymentName}/chat/completions?api-version=${azureApiVersion || '2024-02-01'}`;
        headers['api-key'] = azureApiKey;
        break;

      default:
        throw new Error(`Unknown provider: ${provider}`);
    }

    const response = await axios.post(url, body, {
      headers,
      timeout
    });

    return response.data;
  }
}

// Export singleton
export const probeEngine = new ProbeEngine();

