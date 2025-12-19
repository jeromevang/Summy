/**
 * Probe Engine
 * Implements capability probing tests to evaluate model behavior for tool calling
 * 
 * Tool Behavior Probes (1.x):
 * 1.1 Emit Test - Can model emit valid tool_calls when forced?
 * 1.2 Schema Adherence Test - Does model adapt to schema changes?
 * 1.3 Selection Logic Test - Can model choose correctly between similar tools?
 * 1.4 Suppression Test - Can model NOT call tools when forbidden?
 * 
 * Reasoning Probes (2.x):
 * 2.1 Intent Extraction Test - Can model output structured JSON intent?
 * 2.2 Multi-step Planning Test - Can model break complex tasks into ordered steps?
 * 2.3 Conditional Reasoning Test - Can model reason through conditions?
 * 2.4 Context Continuity Test - Does model maintain context across turns?
 * 2.5 Logical Consistency Test - Can model detect contradictory instructions?
 * 2.6 Explanation Test - Does model provide reasoning before action?
 * 2.7 Edge Case Handling Test - Does model handle ambiguous scenarios safely?
 */

import axios from 'axios';
import { LMStudioClient } from '@lmstudio/sdk';
import { notifications } from '../../services/notifications.js';
import { wsBroadcast } from '../../services/ws-broadcast.js';

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
  toolFormat?: ToolFormat;  // Which format worked (if applicable)
}

export interface ReasoningProbeResults {
  intentExtraction: ProbeResult;
  multiStepPlanning: ProbeResult;
  conditionalReasoning: ProbeResult;
  contextContinuity: ProbeResult;
  logicalConsistency: ProbeResult;
  explanation: ProbeResult;
  edgeCaseHandling: ProbeResult;
}

export interface ProbeRunResult {
  modelId: string;
  provider: 'lmstudio' | 'openai' | 'azure';
  startedAt: string;
  completedAt: string;
  
  // Tool behavior probe results (1.x)
  emitTest: ProbeResult;
  schemaTest: ProbeResult;
  selectionTest: ProbeResult;
  suppressionTest: ProbeResult;
  
  // Reasoning probe results (2.x)
  reasoningProbes?: ReasoningProbeResults;
  
  // Aggregated results
  toolScore: number;      // Score from tool behavior probes
  reasoningScore: number; // Score from reasoning probes
  overallScore: number;   // Combined score
  role: 'main' | 'executor' | 'both' | 'none';
  
  // Context latency profiling
  contextLatency?: ContextLatencyResult;
}

export interface ContextLatencyResult {
  testedContextSizes: number[];
  latencies: Record<number, number>;  // context size -> latency in ms
  maxUsableContext: number;           // Largest context under 30s
  recommendedContext: number;         // Suggested context size
  modelMaxContext?: number;           // Model's reported max context (if available)
}

export interface ProbeOptions {
  contextLength?: number;
  timeout?: number;              // Default 30000ms
  runLatencyProfile?: boolean;   // Run context latency profiling
  runReasoningProbes?: boolean;  // Run reasoning probes (default: true)
}

export type ToolFormat = 'openai' | 'xml' | 'none';

// ============================================================
// BAD OUTPUT DETECTION
// ============================================================

interface BadOutputResult {
  isLooping: boolean;
  hasLeakedTokens: boolean;
  leakedTokens: string[];
  isMalformed: boolean;
}

/**
 * Detect problematic model outputs like repetition loops and leaked control tokens
 */
function detectBadOutput(content: string): BadOutputResult {
  if (!content) return { isLooping: false, hasLeakedTokens: false, leakedTokens: [], isMalformed: false };
  
  // Detect repetition loop - same 30+ char pattern repeated 3+ times
  const loopPattern = /(.{30,})\1{2,}/s;
  const isLooping = loopPattern.test(content);
  
  // Detect leaked control tokens
  const controlTokens = [
    '<|stop|>', '<|end|>', '<|im_end|>', '<|im_start|>',
    '<|recipient|>', '<|from|>', '<|content|>',
    '<|eot_id|>', '<|start_header_id|>', '<|end_header_id|>',
    '<|endoftext|>', '<|pad|>', '<|assistant|>', '<|user|>',
    '<|system|>', '</s>', '<s>', '[/INST]', '[INST]'
  ];
  
  const leakedTokens = controlTokens.filter(t => content.includes(t));
  
  // Check for malformed output (excessive special chars, binary-like)
  const specialCharRatio = (content.match(/[<>|{}\[\]]/g) || []).length / content.length;
  const isMalformed = specialCharRatio > 0.3;
  
  return {
    isLooping,
    hasLeakedTokens: leakedTokens.length > 0,
    leakedTokens,
    isMalformed
  };
}

// ============================================================
// XML TOOL FORMAT
// ============================================================

/**
 * Generate XML-style tool description for models that don't support OpenAI format
 */
function generateXmlToolPrompt(tools: any[]): string {
  let xml = '<available_tools>\n';
  
  for (const tool of tools) {
    const fn = tool.function;
    xml += `  <tool name="${fn.name}">\n`;
    xml += `    <description>${fn.description}</description>\n`;
    xml += `    <parameters>\n`;
    
    for (const [paramName, paramDef] of Object.entries(fn.parameters.properties || {})) {
      const def = paramDef as any;
      const isRequired = fn.parameters.required?.includes(paramName);
      xml += `      <param name="${paramName}" type="${def.type}" required="${isRequired}">${def.description || ''}</param>\n`;
    }
    
    xml += `    </parameters>\n`;
    xml += `  </tool>\n`;
  }
  
  xml += '</available_tools>';
  return xml;
}

/**
 * Parse XML-style tool call from model response
 */
function parseXmlToolCall(content: string): { name: string; arguments: any } | null {
  // Try multiple XML patterns
  const patterns = [
    // <tool_call><name>...</name><arguments>...</arguments></tool_call>
    /<tool_call>\s*<name>([^<]+)<\/name>\s*<arguments>([\s\S]*?)<\/arguments>\s*<\/tool_call>/i,
    // <function_call name="...">...</function_call>
    /<function_call\s+name="([^"]+)">([\s\S]*?)<\/function_call>/i,
    // <call tool="..." args="..."/>
    /<call\s+tool="([^"]+)"\s+(?:args|arguments)="([^"]+)"/i,
    // ```json with tool info
    /```(?:json)?\s*\{\s*"(?:tool|name|function)"\s*:\s*"([^"]+)"[\s\S]*?"(?:arguments|args|parameters)"\s*:\s*(\{[^}]+\})/i,
  ];
  
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      const name = match[1].trim();
      let args = {};
      try {
        // Try parsing as JSON
        args = JSON.parse(match[2].trim());
      } catch {
        // Try extracting key-value pairs
        const kvPattern = /"?(\w+)"?\s*[:=]\s*"?([^",}\n]+)"?/g;
        let kvMatch;
        while ((kvMatch = kvPattern.exec(match[2])) !== null) {
          (args as any)[kvMatch[1]] = kvMatch[2].trim();
        }
      }
      return { name, arguments: args };
    }
  }
  
  // Also try plain JSON in the content
  const jsonMatch = content.match(/\{\s*"(?:tool|name|function)"\s*:\s*"([^"]+)"[\s\S]*?"(?:arguments|args|parameters)"\s*:\s*(\{[^}]+\})\s*\}/i);
  if (jsonMatch) {
    try {
      return { name: jsonMatch[1], arguments: JSON.parse(jsonMatch[2]) };
    } catch {}
  }
  
  return null;
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
    const runReasoningProbes = options.runReasoningProbes !== false; // Default: true

    console.log(`[ProbeEngine] Starting probe tests for ${modelId} (provider: ${provider})`);
    notifications.info(`Starting probe tests for ${modelId}`);

    const totalTests = runReasoningProbes ? 11 : 4;
    let completedTests = 0;
    let runningScore = 0;

    const broadcastProgress = (testName: string, score?: number) => {
      completedTests++;
      if (score !== undefined) {
        runningScore = Math.round((runningScore * (completedTests - 1) + score) / completedTests);
      }
      wsBroadcast.broadcastProgress('probe', modelId, {
        current: completedTests,
        total: totalTests,
        currentTest: testName,
        score: runningScore,
        status: 'running'
      });
    };

    // Run tool behavior probes (1.x)
    wsBroadcast.broadcastProgress('probe', modelId, { current: 0, total: totalTests, currentTest: 'Emit Test', status: 'running' });
    const emitTest = await this.runEmitTest(modelId, provider, settings, timeout);
    broadcastProgress('Emit Test', emitTest.score);
    
    const schemaTest = await this.runSchemaAdherenceTest(modelId, provider, settings, timeout);
    broadcastProgress('Schema Adherence', schemaTest.score);
    
    const selectionTest = await this.runSelectionLogicTest(modelId, provider, settings, timeout);
    broadcastProgress('Selection Logic', selectionTest.score);
    
    const suppressionTest = await this.runSuppressionTest(modelId, provider, settings, timeout);
    broadcastProgress('Suppression', suppressionTest.score);

    // Calculate tool score
    const toolScore = Math.round(
      emitTest.score * 0.30 +
      schemaTest.score * 0.30 +
      selectionTest.score * 0.20 +
      suppressionTest.score * 0.20
    );

    // Run reasoning probes (2.x) if enabled
    let reasoningProbes: ReasoningProbeResults | undefined;
    let reasoningScore = 0;

    if (runReasoningProbes) {
      console.log(`[ProbeEngine] Running reasoning probes for ${modelId}`);
      
      const intentExtraction = await this.runIntentExtractionTest(modelId, provider, settings, timeout);
      broadcastProgress('Intent Extraction', intentExtraction.score);
      
      const multiStepPlanning = await this.runMultiStepPlanningTest(modelId, provider, settings, timeout);
      broadcastProgress('Multi-step Planning', multiStepPlanning.score);
      
      const conditionalReasoning = await this.runConditionalReasoningTest(modelId, provider, settings, timeout);
      broadcastProgress('Conditional Reasoning', conditionalReasoning.score);
      
      const contextContinuity = await this.runContextContinuityTest(modelId, provider, settings, timeout);
      broadcastProgress('Context Continuity', contextContinuity.score);
      
      const logicalConsistency = await this.runLogicalConsistencyTest(modelId, provider, settings, timeout);
      broadcastProgress('Logical Consistency', logicalConsistency.score);
      
      const explanation = await this.runExplanationTest(modelId, provider, settings, timeout);
      broadcastProgress('Explanation', explanation.score);
      
      const edgeCaseHandling = await this.runEdgeCaseHandlingTest(modelId, provider, settings, timeout);
      broadcastProgress('Edge Case Handling', edgeCaseHandling.score);

      reasoningProbes = {
        intentExtraction,
        multiStepPlanning,
        conditionalReasoning,
        contextContinuity,
        logicalConsistency,
        explanation,
        edgeCaseHandling
      };

      // Calculate reasoning score (equal weights)
      reasoningScore = Math.round(
        (intentExtraction.score +
         multiStepPlanning.score +
         conditionalReasoning.score +
         contextContinuity.score +
         logicalConsistency.score +
         explanation.score +
         edgeCaseHandling.score) / 7
      );
    }

    // Calculate overall score (50% tool, 50% reasoning if available)
    const overallScore = runReasoningProbes
      ? Math.round((toolScore + reasoningScore) / 2)
      : toolScore;

    // Determine role based on probe results
    const role = this.determineRole(emitTest, schemaTest, selectionTest, suppressionTest, reasoningProbes);

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
      reasoningProbes,
      toolScore,
      reasoningScore,
      overallScore,
      role,
      contextLatency
    };

    console.log(`[ProbeEngine] Completed probe tests for ${modelId}: tool=${toolScore}, reasoning=${reasoningScore}, overall=${overallScore}, role=${role}`);
    notifications.success(`Probe tests completed for ${modelId}: ${role} role, score ${overallScore}/100`);

    // Broadcast completion
    wsBroadcast.broadcastProgress('probe', modelId, {
      current: totalTests,
      total: totalTests,
      currentTest: 'Complete',
      score: overallScore,
      status: 'completed'
    });

    return result;
  }

  /**
   * PROBE 1: Emit Test
   * Can the model emit valid tool_calls when forced?
   * Tries OpenAI format first, then falls back to XML format
   */
  private async runEmitTest(
    modelId: string,
    provider: 'lmstudio' | 'openai' | 'azure',
    settings: any,
    timeout: number
  ): Promise<ProbeResult> {
    const startTime = Date.now();

    // ============ PHASE 1: Try OpenAI format ============
    const openAIResult = await this.tryEmitOpenAIFormat(modelId, provider, settings, timeout);
    
    // If OpenAI format succeeded with score >= 80, we're done
    if (openAIResult.score >= 80) {
      return {
        ...openAIResult,
        latency: Date.now() - startTime,
        toolFormat: 'openai'
      };
    }

    // Check for bad output (loops, leaked tokens)
    const content = openAIResult.response?.choices?.[0]?.message?.content || '';
    const badOutput = detectBadOutput(content);
    
    if (badOutput.isLooping) {
      console.log(`[ProbeEngine] Model stuck in repetition loop, trying XML format...`);
    } else if (badOutput.hasLeakedTokens) {
      console.log(`[ProbeEngine] Model leaked control tokens (${badOutput.leakedTokens.join(', ')}), trying XML format...`);
    } else if (badOutput.isMalformed) {
      console.log(`[ProbeEngine] Model output malformed, trying XML format...`);
    }

    // ============ PHASE 2: Try XML format as fallback ============
    console.log(`[ProbeEngine] OpenAI format failed (score: ${openAIResult.score}), trying XML format...`);
    const xmlResult = await this.tryEmitXMLFormat(modelId, provider, settings, timeout);

    // Return the better result
    if (xmlResult.score > openAIResult.score) {
      return {
        ...xmlResult,
        latency: Date.now() - startTime,
        toolFormat: 'xml',
        details: `XML format succeeded (OpenAI format failed: ${openAIResult.details})`
      };
    }

    // Both failed - return OpenAI result with bad output info
    let details = openAIResult.details;
    if (badOutput.isLooping) {
      details = 'Model stuck in repetition loop';
    } else if (badOutput.hasLeakedTokens) {
      details = `Leaked control tokens: ${badOutput.leakedTokens.slice(0, 3).join(', ')}`;
    }

    return {
      ...openAIResult,
      latency: Date.now() - startTime,
      toolFormat: 'none',
      details
    };
  }

  /**
   * Try OpenAI-style tool calling
   */
  private async tryEmitOpenAIFormat(
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
        details: 'Valid tool call with correct parameters (OpenAI format)',
        response
      };

    } catch (error: any) {
      return {
        testName: 'emit',
        passed: false,
        score: 0,
        latency: Date.now() - startTime,
        details: 'OpenAI format test failed',
        error: error.message
      };
    }
  }

  /**
   * Try XML-style tool calling for models that don't support OpenAI format
   */
  private async tryEmitXMLFormat(
    modelId: string,
    provider: 'lmstudio' | 'openai' | 'azure',
    settings: any,
    timeout: number
  ): Promise<ProbeResult> {
    const startTime = Date.now();

    const xmlToolDesc = generateXmlToolPrompt([PING_TOOL]);
    
    const messages = [
      {
        role: 'system',
        content: `You are a tool-calling assistant. You have access to the following tools:

${xmlToolDesc}

When you need to call a tool, output it in this EXACT format:
<tool_call>
<name>tool_name</name>
<arguments>{"param": "value"}</arguments>
</tool_call>

Do not output any other text. Only output the tool_call XML.`
      },
      {
        role: 'user',
        content: 'Call the "ping" tool with value "test". Output ONLY the tool_call XML, nothing else.'
      }
    ];

    try {
      // Call WITHOUT tools param - let model generate XML
      const response = await this.callLLM(modelId, provider, messages, undefined, settings, timeout);
      const latency = Date.now() - startTime;
      const content = response?.choices?.[0]?.message?.content || '';

      // Check for bad output first
      const badOutput = detectBadOutput(content);
      if (badOutput.isLooping || badOutput.hasLeakedTokens) {
        return {
          testName: 'emit',
          passed: false,
          score: 0,
          latency,
          details: badOutput.isLooping 
            ? 'XML format: Model stuck in repetition loop' 
            : `XML format: Leaked tokens (${badOutput.leakedTokens.slice(0, 2).join(', ')})`,
          response
        };
      }

      // Try to parse XML tool call
      const parsedCall = parseXmlToolCall(content);
      
      if (!parsedCall) {
        return {
          testName: 'emit',
          passed: false,
          score: content.includes('ping') ? 15 : 0,
          latency,
          details: 'XML format: Could not parse tool call from response',
          response
        };
      }

      // Validate the parsed call
      if (parsedCall.name !== 'ping') {
        return {
          testName: 'emit',
          passed: false,
          score: 40,
          latency,
          details: `XML format: Wrong tool called: ${parsedCall.name}`,
          response
        };
      }

      const value = parsedCall.arguments?.value;
      if (value !== 'test') {
        return {
          testName: 'emit',
          passed: true,
          score: 75,
          latency,
          details: `XML format: Correct tool but wrong value: "${value}" instead of "test"`,
          response
        };
      }

      return {
        testName: 'emit',
        passed: true,
        score: 95, // Slightly lower than OpenAI format (95 vs 100)
        latency,
        details: 'Valid tool call with correct parameters (XML format)',
        response
      };

    } catch (error: any) {
      return {
        testName: 'emit',
        passed: false,
        score: 0,
        latency: Date.now() - startTime,
        details: 'XML format test failed',
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
    suppression: ProbeResult,
    reasoning?: ReasoningProbeResults
  ): 'main' | 'executor' | 'both' | 'none' {
    // Executor model requirements:
    // - Good emit (can produce tool calls)
    // - Good schema adherence (follows tool schemas exactly)
    const canBeExecutor = emit.passed && emit.score >= 80 && 
                          schema.passed && schema.score >= 70;

    // Main model requirements:
    // - Good suppression (can refrain from tools)
    // - Good selection (can reason about which tool)
    // - If reasoning probes available: good reasoning scores
    let canBeMain = suppression.passed && suppression.score >= 70 && 
                    selection.passed && selection.score >= 70;

    // If reasoning probes were run, require them for main role
    if (reasoning) {
      const reasoningPassed = 
        reasoning.intentExtraction.passed &&
        reasoning.conditionalReasoning.passed &&
        reasoning.logicalConsistency.passed;
      
      const reasoningAvgScore = (
        reasoning.intentExtraction.score +
        reasoning.multiStepPlanning.score +
        reasoning.conditionalReasoning.score +
        reasoning.contextContinuity.score +
        reasoning.logicalConsistency.score +
        reasoning.explanation.score +
        reasoning.edgeCaseHandling.score
      ) / 7;

      // Main model needs good reasoning (avg >= 60)
      canBeMain = canBeMain && reasoningPassed && reasoningAvgScore >= 60;
    }

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

  // ============================================================
  // REASONING PROBES (2.x)
  // ============================================================

  /**
   * PROBE 2.1: Intent Extraction Test
   * Can the model output valid structured JSON intent?
   */
  private async runIntentExtractionTest(
    modelId: string,
    provider: 'lmstudio' | 'openai' | 'azure',
    settings: any,
    timeout: number
  ): Promise<ProbeResult> {
    const startTime = Date.now();

    const messages = [
      {
        role: 'system',
        content: `You are a planning assistant. Output your intent as JSON only.

Output format:
{
  "action": "call_tool",
  "tool": "tool_name",
  "parameters": { ... },
  "metadata": { "reasoning": "..." }
}

Do NOT output any text outside the JSON.`
      },
      {
        role: 'user',
        content: 'Add error handling to the login function in auth.js'
      }
    ];

    try {
      // No tools - just want JSON output
      const response = await this.callLLMNoTools(modelId, provider, messages, settings, timeout);
      const latency = Date.now() - startTime;
      const content = response?.choices?.[0]?.message?.content || '';

      // Try to parse JSON from response
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          return {
            testName: 'intent_extraction',
            passed: false,
            score: 20,
            latency,
            details: 'No JSON found in response',
            response
          };
        }

        const intent = JSON.parse(jsonMatch[0]);

        // Check required fields
        const hasAction = 'action' in intent;
        const hasTool = 'tool' in intent;
        const hasParams = 'parameters' in intent;
        const hasMetadata = 'metadata' in intent;

        if (!hasAction || !hasTool) {
          return {
            testName: 'intent_extraction',
            passed: false,
            score: 50,
            latency,
            details: 'JSON parsed but missing required fields (action, tool)',
            response
          };
        }

        // Check if tool makes sense for the task (file_read is good start)
        const sensibleTool = ['file_read', 'read_file', 'file_patch'].includes(intent.tool);

        return {
          testName: 'intent_extraction',
          passed: true,
          score: sensibleTool ? 100 : 80,
          latency,
          details: `Valid intent JSON with ${hasMetadata ? 'reasoning' : 'no reasoning'}`,
          response
        };

      } catch {
        return {
          testName: 'intent_extraction',
          passed: false,
          score: 30,
          latency,
          details: 'Response contains invalid JSON',
          response
        };
      }

    } catch (error: any) {
      return {
        testName: 'intent_extraction',
        passed: false,
        score: 0,
        latency: Date.now() - startTime,
        details: 'Test failed',
        error: error.message
      };
    }
  }

  /**
   * PROBE 2.2: Multi-step Planning Test
   * Can the model break complex tasks into ordered steps?
   */
  private async runMultiStepPlanningTest(
    modelId: string,
    provider: 'lmstudio' | 'openai' | 'azure',
    settings: any,
    timeout: number
  ): Promise<ProbeResult> {
    const startTime = Date.now();

    const messages = [
      {
        role: 'system',
        content: `Break tasks into numbered steps. Output as JSON array:
[
  { "step": 1, "action": "tool_name", "params": { ... } },
  { "step": 2, "action": "tool_name", "params": { ... } }
]
Do NOT output any text outside the JSON array.`
      },
      {
        role: 'user',
        content: 'Prepare release: run tests, add all files, commit with message "Release v1.0"'
      }
    ];

    try {
      const response = await this.callLLMNoTools(modelId, provider, messages, settings, timeout);
      const latency = Date.now() - startTime;
      const content = response?.choices?.[0]?.message?.content || '';

      try {
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
          return {
            testName: 'multi_step_planning',
            passed: false,
            score: 20,
            latency,
            details: 'No JSON array found in response',
            response
          };
        }

        const steps = JSON.parse(jsonMatch[0]);

        if (!Array.isArray(steps) || steps.length === 0) {
          return {
            testName: 'multi_step_planning',
            passed: false,
            score: 30,
            latency,
            details: 'Empty or invalid steps array',
            response
          };
        }

        // Check if steps are in logical order
        const hasTestStep = steps.some((s: any) => 
          s.action?.includes('test') || s.action?.includes('npm_run')
        );
        const hasAddStep = steps.some((s: any) => 
          s.action?.includes('add') || s.action?.includes('git_add')
        );
        const hasCommitStep = steps.some((s: any) => 
          s.action?.includes('commit') || s.action?.includes('git_commit')
        );

        const hasAllSteps = hasTestStep && hasAddStep && hasCommitStep;
        const hasStepNumbers = steps.every((s: any) => 'step' in s);

        return {
          testName: 'multi_step_planning',
          passed: steps.length >= 2,
          score: hasAllSteps ? 100 : (hasStepNumbers ? 70 : 50),
          latency,
          details: `${steps.length} steps planned${hasAllSteps ? ' with correct order' : ''}`,
          response
        };

      } catch {
        return {
          testName: 'multi_step_planning',
          passed: false,
          score: 25,
          latency,
          details: 'Invalid JSON array',
          response
        };
      }

    } catch (error: any) {
      return {
        testName: 'multi_step_planning',
        passed: false,
        score: 0,
        latency: Date.now() - startTime,
        details: 'Test failed',
        error: error.message
      };
    }
  }

  /**
   * PROBE 2.3: Conditional Reasoning Test
   * Can the model reason through if/else conditions?
   */
  private async runConditionalReasoningTest(
    modelId: string,
    provider: 'lmstudio' | 'openai' | 'azure',
    settings: any,
    timeout: number
  ): Promise<ProbeResult> {
    const startTime = Date.now();

    const messages = [
      {
        role: 'system',
        content: `Analyze the condition and output the correct action as JSON:
{ "action": "call_tool", "tool": "...", "parameters": { ... } }
Do NOT output any text outside the JSON.`
      },
      {
        role: 'user',
        content: 'If package.json exists, read it. Otherwise, create it. The file EXISTS.'
      }
    ];

    try {
      const response = await this.callLLMNoTools(modelId, provider, messages, settings, timeout);
      const latency = Date.now() - startTime;
      const content = response?.choices?.[0]?.message?.content || '';

      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          return {
            testName: 'conditional_reasoning',
            passed: false,
            score: 20,
            latency,
            details: 'No JSON found',
            response
          };
        }

        const action = JSON.parse(jsonMatch[0]);
        const tool = action.tool || action.action || '';

        // Correct answer: read (because file EXISTS)
        const isRead = tool.toLowerCase().includes('read');
        const isCreate = tool.toLowerCase().includes('create') || tool.toLowerCase().includes('write');

        if (isRead) {
          return {
            testName: 'conditional_reasoning',
            passed: true,
            score: 100,
            latency,
            details: 'Correctly chose read based on condition',
            response
          };
        }

        if (isCreate) {
          return {
            testName: 'conditional_reasoning',
            passed: false,
            score: 40,
            latency,
            details: 'Chose create when file exists - failed conditional logic',
            response
          };
        }

        return {
          testName: 'conditional_reasoning',
          passed: false,
          score: 50,
          latency,
          details: `Unclear action: ${tool}`,
          response
        };

      } catch {
        return {
          testName: 'conditional_reasoning',
          passed: false,
          score: 25,
          latency,
          details: 'Invalid JSON',
          response
        };
      }

    } catch (error: any) {
      return {
        testName: 'conditional_reasoning',
        passed: false,
        score: 0,
        latency: Date.now() - startTime,
        details: 'Test failed',
        error: error.message
      };
    }
  }

  /**
   * PROBE 2.4: Context Continuity Test
   * Does the model maintain context across turns?
   */
  private async runContextContinuityTest(
    modelId: string,
    provider: 'lmstudio' | 'openai' | 'azure',
    settings: any,
    timeout: number
  ): Promise<ProbeResult> {
    const startTime = Date.now();

    const messages = [
      {
        role: 'system',
        content: 'You are a helpful assistant. Output JSON actions when asked.'
      },
      {
        role: 'user',
        content: 'The API endpoint is /users/profile'
      },
      {
        role: 'assistant',
        content: 'Understood. The API endpoint is /users/profile. What would you like me to do with it?'
      },
      {
        role: 'user',
        content: 'Make a GET request to it. Output as JSON: { "action": "http_request", "url": "...", "method": "..." }'
      }
    ];

    try {
      const response = await this.callLLMNoTools(modelId, provider, messages, settings, timeout);
      const latency = Date.now() - startTime;
      const content = response?.choices?.[0]?.message?.content || '';

      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          // Check if it mentioned the endpoint in text
          const mentionsEndpoint = content.includes('/users/profile');
          return {
            testName: 'context_continuity',
            passed: mentionsEndpoint,
            score: mentionsEndpoint ? 60 : 20,
            latency,
            details: mentionsEndpoint ? 'Remembered endpoint but no JSON' : 'No context retention',
            response
          };
        }

        const action = JSON.parse(jsonMatch[0]);
        const url = action.url || '';

        const hasCorrectEndpoint = url.includes('/users/profile');
        const hasGetMethod = (action.method || '').toUpperCase() === 'GET';

        if (hasCorrectEndpoint && hasGetMethod) {
          return {
            testName: 'context_continuity',
            passed: true,
            score: 100,
            latency,
            details: 'Perfect context retention with correct endpoint and method',
            response
          };
        }

        if (hasCorrectEndpoint) {
          return {
            testName: 'context_continuity',
            passed: true,
            score: 80,
            latency,
            details: 'Remembered endpoint, method may differ',
            response
          };
        }

        return {
          testName: 'context_continuity',
          passed: false,
          score: 40,
          latency,
          details: 'Failed to use endpoint from previous context',
          response
        };

      } catch {
        return {
          testName: 'context_continuity',
          passed: false,
          score: 25,
          latency,
          details: 'Invalid JSON',
          response
        };
      }

    } catch (error: any) {
      return {
        testName: 'context_continuity',
        passed: false,
        score: 0,
        latency: Date.now() - startTime,
        details: 'Test failed',
        error: error.message
      };
    }
  }

  /**
   * PROBE 2.5: Logical Consistency Test
   * Can the model detect contradictory instructions?
   */
  private async runLogicalConsistencyTest(
    modelId: string,
    provider: 'lmstudio' | 'openai' | 'azure',
    settings: any,
    timeout: number
  ): Promise<ProbeResult> {
    const startTime = Date.now();

    const messages = [
      {
        role: 'system',
        content: `Analyze instructions for conflicts. If there's a logical conflict, respond:
{ "conflict": true, "reason": "..." }
Otherwise output the action as JSON.`
      },
      {
        role: 'user',
        content: 'Delete the file log.txt, then append new data to log.txt.'
      }
    ];

    try {
      const response = await this.callLLMNoTools(modelId, provider, messages, settings, timeout);
      const latency = Date.now() - startTime;
      const content = response?.choices?.[0]?.message?.content || '';

      // Check if model identified the conflict
      const mentionsConflict = content.toLowerCase().includes('conflict') ||
                               content.toLowerCase().includes('cannot') ||
                               content.toLowerCase().includes('deleted') ||
                               content.toLowerCase().includes('contradiction');

      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[0]);
          if (result.conflict === true) {
            return {
              testName: 'logical_consistency',
              passed: true,
              score: 100,
              latency,
              details: 'Correctly identified conflict in structured format',
              response
            };
          }
        }
      } catch {
        // JSON parse failed, check text
      }

      if (mentionsConflict) {
        return {
          testName: 'logical_consistency',
          passed: true,
          score: 80,
          latency,
          details: 'Identified conflict in text response',
          response
        };
      }

      return {
        testName: 'logical_consistency',
        passed: false,
        score: 30,
        latency,
        details: 'Failed to identify logical conflict',
        response
      };

    } catch (error: any) {
      return {
        testName: 'logical_consistency',
        passed: false,
        score: 0,
        latency: Date.now() - startTime,
        details: 'Test failed',
        error: error.message
      };
    }
  }

  /**
   * PROBE 2.6: Explanation Test
   * Does the model provide reasoning before action?
   */
  private async runExplanationTest(
    modelId: string,
    provider: 'lmstudio' | 'openai' | 'azure',
    settings: any,
    timeout: number
  ): Promise<ProbeResult> {
    const startTime = Date.now();

    const messages = [
      {
        role: 'system',
        content: `Before taking any action, explain your reasoning. Output:
{
  "reasoning": "explanation of what you'll do and why",
  "action": "call_tool",
  "tool": "...",
  "parameters": { ... }
}`
      },
      {
        role: 'user',
        content: 'Update config.json with the new API endpoint'
      }
    ];

    try {
      const response = await this.callLLMNoTools(modelId, provider, messages, settings, timeout);
      const latency = Date.now() - startTime;
      const content = response?.choices?.[0]?.message?.content || '';

      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          return {
            testName: 'explanation',
            passed: false,
            score: 20,
            latency,
            details: 'No JSON found',
            response
          };
        }

        const result = JSON.parse(jsonMatch[0]);
        const hasReasoning = 'reasoning' in result && result.reasoning.length > 10;
        const hasAction = 'action' in result || 'tool' in result;

        if (hasReasoning && hasAction) {
          return {
            testName: 'explanation',
            passed: true,
            score: 100,
            latency,
            details: 'Provided reasoning before action',
            response
          };
        }

        if (hasAction && !hasReasoning) {
          return {
            testName: 'explanation',
            passed: true,
            score: 60,
            latency,
            details: 'Action provided but no reasoning',
            response
          };
        }

        return {
          testName: 'explanation',
          passed: false,
          score: 40,
          latency,
          details: 'Missing required fields',
          response
        };

      } catch {
        return {
          testName: 'explanation',
          passed: false,
          score: 25,
          latency,
          details: 'Invalid JSON',
          response
        };
      }

    } catch (error: any) {
      return {
        testName: 'explanation',
        passed: false,
        score: 0,
        latency: Date.now() - startTime,
        details: 'Test failed',
        error: error.message
      };
    }
  }

  /**
   * PROBE 2.7: Edge Case Handling Test
   * Does the model handle ambiguous scenarios safely?
   */
  private async runEdgeCaseHandlingTest(
    modelId: string,
    provider: 'lmstudio' | 'openai' | 'azure',
    settings: any,
    timeout: number
  ): Promise<ProbeResult> {
    const startTime = Date.now();

    const messages = [
      {
        role: 'system',
        content: `Handle edge cases safely. If a situation is ambiguous, include fallback handling.
Output: { "action": "...", "parameters": { ... }, "fallback": "what to do if it fails" }`
      },
      {
        role: 'user',
        content: 'Append to notes.txt, but the file may not exist.'
      }
    ];

    try {
      const response = await this.callLLMNoTools(modelId, provider, messages, settings, timeout);
      const latency = Date.now() - startTime;
      const content = response?.choices?.[0]?.message?.content || '';

      // Check if model addresses the edge case
      const addressesEdgeCase = content.toLowerCase().includes('not exist') ||
                                content.toLowerCase().includes('create') ||
                                content.toLowerCase().includes('check') ||
                                content.toLowerCase().includes('if') ||
                                content.toLowerCase().includes('fallback');

      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[0]);
          const hasFallback = 'fallback' in result || 'if_not_exists' in result;

          if (hasFallback) {
            return {
              testName: 'edge_case_handling',
              passed: true,
              score: 100,
              latency,
              details: 'Properly handles edge case with fallback',
              response
            };
          }

          if (addressesEdgeCase) {
            return {
              testName: 'edge_case_handling',
              passed: true,
              score: 80,
              latency,
              details: 'Addresses edge case without explicit fallback',
              response
            };
          }
        }
      } catch {
        // JSON failed
      }

      if (addressesEdgeCase) {
        return {
          testName: 'edge_case_handling',
          passed: true,
          score: 70,
          latency,
          details: 'Mentions edge case in text response',
          response
        };
      }

      return {
        testName: 'edge_case_handling',
        passed: false,
        score: 30,
        latency,
        details: 'Did not address the edge case',
        response
      };

    } catch (error: any) {
      return {
        testName: 'edge_case_handling',
        passed: false,
        score: 0,
        latency: Date.now() - startTime,
        details: 'Test failed',
        error: error.message
      };
    }
  }

  /**
   * Call LLM without tools (for reasoning tests)
   */
  private async callLLMNoTools(
    modelId: string,
    provider: 'lmstudio' | 'openai' | 'azure',
    messages: any[],
    settings: any,
    timeout: number
  ): Promise<any> {
    let url: string;
    let headers: Record<string, string> = { 'Content-Type': 'application/json' };
    let body: any = {
      messages,
      temperature: 0
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

  /**
   * Get the model's maximum context size using LM Studio SDK
   */
  private async getModelMaxContext(
    modelId: string, 
    settings: any
  ): Promise<number> {
    try {
      const client = new LMStudioClient();
      const models = await client.system.listDownloadedModels("llm");
      
      // Find exact match
      const model = models.find(m => m.modelKey === modelId);
      if (model?.maxContextLength) {
        console.log(`[ProbeEngine] Got maxContextLength from SDK: ${model.maxContextLength} for ${modelId}`);
        return model.maxContextLength;
      }

      // Try partial match if exact match failed
      const partialMatch = models.find(m => 
        m.modelKey?.includes(modelId) || modelId.includes(m.modelKey)
      );

      if (partialMatch?.maxContextLength) {
        console.log(`[ProbeEngine] Got maxContextLength from partial match: ${partialMatch.maxContextLength} for ${modelId}`);
        return partialMatch.maxContextLength;
      }

      console.log(`[ProbeEngine] Model ${modelId} not found via SDK, defaulting to 8192`);
      return 8192;

    } catch (error: any) {
      console.log(`[ProbeEngine] SDK error: ${error.message}, defaulting to 8192`);
      return 8192;
    }
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
    const allContextSizes = [2048, 4096, 8192, 16384, 32768, 65536, 131072];
    const latencies: Record<number, number> = {};
    const testedContextSizes: number[] = [];
    let maxUsableContext = 2048;
    const maxLatencyThreshold = 30000; // 30 seconds

    console.log(`[ProbeEngine] Starting context latency profiling for ${modelId}`);

    // First, get the model's max context size
    const modelMaxContext = await this.getModelMaxContext(modelId, settings);
    console.log(`[ProbeEngine] Model max context: ${modelMaxContext}`);

    // Filter context sizes to only test up to model's max
    const contextSizes = allContextSizes.filter(size => size <= modelMaxContext);

    console.log(`[ProbeEngine] Will test context sizes: ${contextSizes.join(', ')}`);

    // Broadcast initial progress
    wsBroadcast.broadcastProgress('latency', modelId, {
      current: 0,
      total: contextSizes.length,
      currentTest: `Context sizes: ${contextSizes.length}`,
      status: 'running'
    });

    let completedTests = 0;

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
          // If we can't load at this size, it's likely the max - stop here
          break;
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
        completedTests++;

        console.log(`[ProbeEngine] Context ${contextSize}: ${latency}ms`);

        // Broadcast progress
        wsBroadcast.broadcastProgress('latency', modelId, {
          current: completedTests,
          total: contextSizes.length,
          currentTest: `${contextSize / 1024}K: ${latency}ms`,
          status: 'running'
        });

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

    // Broadcast completion
    wsBroadcast.broadcastProgress('latency', modelId, {
      current: completedTests,
      total: contextSizes.length,
      currentTest: `Recommended: ${recommendedContext / 1024}K`,
      status: 'completed'
    });

    return {
      testedContextSizes,
      latencies,
      maxUsableContext,
      recommendedContext,
      modelMaxContext
    };
  }

  /**
   * Call LLM with optional tools
   */
  private async callLLM(
    modelId: string,
    provider: 'lmstudio' | 'openai' | 'azure',
    messages: any[],
    tools: any[] | undefined,
    settings: any,
    timeout: number
  ): Promise<any> {
    let url: string;
    let headers: Record<string, string> = { 'Content-Type': 'application/json' };
    let body: any = {
      messages,
      temperature: 0  // Always use temp 0 for deterministic testing
    };

    // Only add tools if provided (for XML format, we don't send tools)
    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }

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

