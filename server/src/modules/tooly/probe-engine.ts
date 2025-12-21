/**
 * Probe Engine
 * Implements capability probing tests to evaluate model behavior for tool calling
 * 
 * Tool Behavior Probes (1.x) - Core:
 * 1.1 Emit Test - Can model emit valid tool_calls when forced?
 * 1.2 Schema Adherence Test - Does model adapt to schema changes?
 * 1.3 Selection Logic Test - Can model choose correctly between similar tools?
 * 1.4 Suppression Test - Can model NOT call tools when forbidden?
 * 
 * Tool Behavior Probes (1.x) - Enhanced:
 * 1.5 Near-Identical Selection Test - Can model distinguish very similar tools?
 * 1.6 Multi-Tool Emit Test - Can model emit multiple tool calls at once?
 * 1.7 Argument Validation Test - Does model respect type constraints?
 * 1.8 Schema Reorder Test - Does model break if schema keys are reordered?
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
import { modelManager } from '../../services/lmstudio-model-manager.js';

// Import strategic and intent probes
import {
  PROBE_CATEGORIES,
  STRATEGIC_PROBES,
  ARCHITECTURAL_PROBES,
  NAVIGATION_PROBES,
  HELICOPTER_PROBES,
  PROACTIVE_PROBES,
  runProbeCategory,
  ProbeTestResult as StrategicProbeResult,
  ProbeCategory,
} from './strategic-probes.js';

import {
  INTENT_PROBES,
  runIntentProbes,
  calculateIntentScores,
  IntentProbeResult,
} from './intent-probes.js';

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
  
  // Tool behavior probe results (1.x) - Core
  emitTest: ProbeResult;
  schemaTest: ProbeResult;
  selectionTest: ProbeResult;
  suppressionTest: ProbeResult;
  
  // Tool behavior probe results (1.x) - Enhanced
  nearIdenticalSelectionTest?: ProbeResult;  // 1.5 Near-identical tool selection
  multiToolEmitTest?: ProbeResult;           // 1.6 Multi-tool emit
  argumentValidationTest?: ProbeResult;      // 1.7 Argument type/schema validation
  schemaReorderTest?: ProbeResult;           // 1.8 Schema key reordering
  
  // Reasoning probe results (2.x)
  reasoningProbes?: ReasoningProbeResults;
  
  // Strategic probe results (3.x - 7.x)
  strategicRAGProbes?: StrategicProbeResult[];  // 3.x Strategic RAG
  architecturalProbes?: StrategicProbeResult[]; // 4.x Domain/Bug Detection
  navigationProbes?: StrategicProbeResult[];    // 5.x Navigation
  helicopterProbes?: StrategicProbeResult[];    // 6.x Helicopter View
  proactiveProbes?: StrategicProbeResult[];     // 7.x Proactive Helpfulness
  
  // Intent probe results (8.x)
  intentProbes?: IntentProbeResult[];
  intentScores?: {
    invokeCorrectness: number;
    toolSelectionAccuracy: number;
    actionCorrectness: number;
    overInvocationRate: number;
    underInvocationRate: number;
    overallIntentScore: number;
  };
  
  // Aggregated results
  toolScore: number;      // Score from tool behavior probes
  reasoningScore: number; // Score from reasoning probes
  overallScore: number;   // Combined score
  role: 'main' | 'executor' | 'both' | 'none';
  
  // Score breakdown for all categories
  scoreBreakdown?: {
    toolScore: number;
    reasoningScore: number;
    ragScore: number;
    bugDetectionScore: number;
    architecturalScore: number;
    navigationScore: number;
    helicopterScore: number;
    proactiveScore: number;
    intentScore: number;
    overallScore: number;
  };
  
  // Context latency profiling
  contextLatency?: ContextLatencyResult;
}

export interface ContextLatencyResult {
  testedContextSizes: number[];
  latencies: Record<number, number>;  // context size -> latency in ms
  maxUsableContext: number;           // Largest context under 30s
  recommendedContext: number;         // Suggested context size
  modelMaxContext?: number;           // Model's reported max context (if available)
  minLatency?: number;                // Fastest response time observed (ms)
  isInteractiveSpeed: boolean;        // true if minLatency < 5s (good for IDE use)
  speedRating: 'excellent' | 'good' | 'acceptable' | 'slow' | 'very_slow';
}

export interface ProbeOptions {
  contextLength?: number;
  timeout?: number;              // Default 30000ms
  runLatencyProfile?: boolean;   // Run context latency profiling
  runReasoningProbes?: boolean;  // Run reasoning probes (default: true)
  
  // Category selection for targeted testing
  categories?: string[];         // Specific categories to run: '1.x', '2.x', '3.x', etc.
  runStrategicProbes?: boolean;  // Run 3.x Strategic RAG probes
  runArchitecturalProbes?: boolean; // Run 4.x Architectural/Bug probes
  runNavigationProbes?: boolean; // Run 5.x Navigation probes
  runHelicopterProbes?: boolean; // Run 6.x Helicopter View probes
  runProactiveProbes?: boolean;  // Run 7.x Proactive probes
  runIntentProbes?: boolean;     // Run 8.x Intent Recognition probes
  
  // Quick mode: only run essential probes
  quickMode?: boolean;
}

export type ToolFormat = 'openai' | 'xml' | 'none';

// ============================================================
// COMMON STOP STRINGS
// These help prevent loops and leaked control tokens
// ============================================================

const COMMON_STOP_STRINGS = [
  // ChatML
  '<|im_end|>',
  '<|im_start|>',
  // Phi-style
  '<|stop|>',
  '<|end|>',
  '<|recipient|>',
  '<|from|>',
  // Llama 3
  '<|eot_id|>',
  '<|end_header_id|>',
  // Llama 2 / Mistral
  '</s>',
  '[/INST]',
  // General
  '<|endoftext|>',
  // Prevent assistant loop
  '\n\nUser:',
  '\n\nHuman:',
  '\nuser:',
  '\nhuman:',
];

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
// ADDITIONAL TOOL DEFINITIONS FOR ENHANCED PROBES
// ============================================================

// Near-identical tools for better selection testing (catches pattern-matching)
const SEARCH_WEB_TOOL = {
  type: 'function' as const,
  function: {
    name: 'search_web',
    description: 'Search the web for current information. Use for real-time or recent data.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' }
      },
      required: ['query']
    }
  }
};

const SEARCH_WEB_CACHED_TOOL = {
  type: 'function' as const,
  function: {
    name: 'search_web_cached',
    description: 'Search cached/historical web data. Use for stable or archived information.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' }
      },
      required: ['query']
    }
  }
};

// Tool with nested schema for argument validation
const CREATE_USER_TOOL = {
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
            role: { type: 'string', enum: ['admin', 'user', 'guest'], description: 'User role' }
          },
          required: ['email', 'role']
        }
      },
      required: ['username', 'age', 'profile']
    }
  }
};

// Schema with reordered keys (same semantics, different order)
const PING_TOOL_REORDERED = {
  type: 'function' as const,
  function: {
    name: 'ping',
    description: 'Call this tool if instructed.',
    parameters: {
      type: 'object',
      required: ['value'],  // Moved required to top
      properties: {
        value: { 
          description: 'The value to ping',  // Reordered: description first
          type: 'string' 
        }
      }
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

    // For LM Studio: ensure model is loaded with minimal context via centralized manager
    const contextLength = options.contextLength || 2048;
    if (provider === 'lmstudio') {
      try {
        await modelManager.ensureLoaded(modelId, contextLength);
      } catch (error: any) {
        console.log(`[ProbeEngine] Could not load model: ${error.message}`);
      }
    }

    // 4 core + 4 enhanced tool probes + 7 reasoning = 15 total (or 8 without reasoning)
    const totalTests = runReasoningProbes ? 15 : 8;
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
    wsBroadcast.broadcastProgress('probe', modelId, { current: 0, total: totalTests, currentTest: '🔬 Probe: Emit Test', status: 'running' });
    const emitTest = await this.runEmitTest(modelId, provider, settings, timeout);
    broadcastProgress('🔬 Probe: Emit Test', emitTest.score);
    
    const schemaTest = await this.runSchemaAdherenceTest(modelId, provider, settings, timeout);
    broadcastProgress('🔬 Probe: Schema Adherence', schemaTest.score);
    
    const selectionTest = await this.runSelectionLogicTest(modelId, provider, settings, timeout);
    broadcastProgress('🔬 Probe: Selection Logic', selectionTest.score);
    
    const suppressionTest = await this.runSuppressionTest(modelId, provider, settings, timeout);
    broadcastProgress('🔬 Probe: Suppression', suppressionTest.score);

    // Run enhanced tool probes (1.5 - 1.8)
    const nearIdenticalSelectionTest = await this.runNearIdenticalSelectionTest(modelId, provider, settings, timeout);
    broadcastProgress('🔬 Probe: Near-Identical Selection', nearIdenticalSelectionTest.score);
    
    const multiToolEmitTest = await this.runMultiToolEmitTest(modelId, provider, settings, timeout);
    broadcastProgress('🔬 Probe: Multi-Tool Emit', multiToolEmitTest.score);
    
    const argumentValidationTest = await this.runArgumentValidationTest(modelId, provider, settings, timeout);
    broadcastProgress('🔬 Probe: Argument Validation', argumentValidationTest.score);
    
    const schemaReorderTest = await this.runSchemaReorderTest(modelId, provider, settings, timeout);
    broadcastProgress('🔬 Probe: Schema Reorder', schemaReorderTest.score);

    // Calculate tool score (core: 60%, enhanced: 40%)
    const coreToolScore = (
      emitTest.score * 0.25 +
      schemaTest.score * 0.25 +
      selectionTest.score * 0.25 +
      suppressionTest.score * 0.25
    );
    
    const enhancedToolScore = (
      nearIdenticalSelectionTest.score * 0.30 +
      multiToolEmitTest.score * 0.25 +
      argumentValidationTest.score * 0.25 +
      schemaReorderTest.score * 0.20
    );
    
    const toolScore = Math.round(coreToolScore * 0.6 + enhancedToolScore * 0.4);

    // Run reasoning probes (2.x) if enabled
    let reasoningProbes: ReasoningProbeResults | undefined;
    let reasoningScore = 0;

    if (runReasoningProbes) {
      console.log(`[ProbeEngine] Running reasoning probes for ${modelId}`);
      
      const intentExtraction = await this.runIntentExtractionTest(modelId, provider, settings, timeout);
      broadcastProgress('🧠 Reasoning: Intent Extraction', intentExtraction.score);
      
      const multiStepPlanning = await this.runMultiStepPlanningTest(modelId, provider, settings, timeout);
      broadcastProgress('🧠 Reasoning: Multi-step Planning', multiStepPlanning.score);
      
      const conditionalReasoning = await this.runConditionalReasoningTest(modelId, provider, settings, timeout);
      broadcastProgress('🧠 Reasoning: Conditional', conditionalReasoning.score);
      
      const contextContinuity = await this.runContextContinuityTest(modelId, provider, settings, timeout);
      broadcastProgress('🧠 Reasoning: Context Continuity', contextContinuity.score);
      
      const logicalConsistency = await this.runLogicalConsistencyTest(modelId, provider, settings, timeout);
      broadcastProgress('🧠 Reasoning: Logical Consistency', logicalConsistency.score);
      
      const explanation = await this.runExplanationTest(modelId, provider, settings, timeout);
      broadcastProgress('🧠 Reasoning: Explanation', explanation.score);
      
      const edgeCaseHandling = await this.runEdgeCaseHandlingTest(modelId, provider, settings, timeout);
      broadcastProgress('🧠 Reasoning: Edge Case', edgeCaseHandling.score);

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

    // Determine which extended categories to run
    const shouldRunCategory = (categoryId: string): boolean => {
      if (options.quickMode) return false;
      if (options.categories && options.categories.length > 0) {
        return options.categories.includes(categoryId);
      }
      // Check specific flags
      switch (categoryId) {
        case '3.x': return options.runStrategicProbes !== false;
        case '4.x': return options.runArchitecturalProbes !== false;
        case '5.x': return options.runNavigationProbes !== false;
        case '6.x': return options.runHelicopterProbes !== false;
        case '7.x': return options.runProactiveProbes !== false;
        case '8.x': return options.runIntentProbes !== false;
        default: return true;
      }
    };

    // Create chat executor for strategic probes
    const createChatExecutor = () => async (prompt: string): Promise<{ response: any; toolCalls: any[] }> => {
      try {
        const result = await this.runChatCompletion(modelId, provider, settings, prompt, timeout);
        const message = result?.choices?.[0]?.message;
        return {
          response: message?.content || '',
          toolCalls: message?.tool_calls || [],
        };
      } catch (error: any) {
        return { response: `Error: ${error.message}`, toolCalls: [] };
      }
    };

    const chatExecutor = createChatExecutor();

    // Run Strategic RAG Probes (3.x)
    let strategicRAGProbes: StrategicProbeResult[] | undefined;
    let ragScore = 0;
    if (shouldRunCategory('3.x') && !options.quickMode) {
      console.log(`[ProbeEngine] Running Strategic RAG probes (3.x) for ${modelId}`);
      try {
        strategicRAGProbes = await runProbeCategory('3.x', chatExecutor);
        ragScore = Math.round(strategicRAGProbes.reduce((sum, p) => sum + p.score, 0) / strategicRAGProbes.length);
        wsBroadcast.broadcastProgress('probe', modelId, {
          current: completedTests + 1,
          total: totalTests + 30, // Approximate additional tests
          currentTest: '🔍 Strategic RAG probes',
          score: ragScore,
          status: 'running'
        });
      } catch (error: any) {
        console.log(`[ProbeEngine] Strategic RAG probes failed: ${error.message}`);
      }
    }

    // Run Architectural/Bug Detection Probes (4.x)
    let architecturalProbes: StrategicProbeResult[] | undefined;
    let bugDetectionScore = 0;
    let architecturalScore = 0;
    if (shouldRunCategory('4.x') && !options.quickMode) {
      console.log(`[ProbeEngine] Running Architectural probes (4.x) for ${modelId}`);
      try {
        architecturalProbes = await runProbeCategory('4.x', chatExecutor);
        architecturalScore = Math.round(architecturalProbes.reduce((sum, p) => sum + p.score, 0) / architecturalProbes.length);
        // Bug detection score from specific probes (4.2, 4.3, 4.4)
        const bugProbes = architecturalProbes.filter(p => ['4.2', '4.3', '4.4'].includes(p.id));
        bugDetectionScore = bugProbes.length > 0 
          ? Math.round(bugProbes.reduce((sum, p) => sum + p.score, 0) / bugProbes.length)
          : architecturalScore;
        wsBroadcast.broadcastProgress('probe', modelId, {
          current: completedTests + 2,
          total: totalTests + 30,
          currentTest: '🏗️ Architectural probes',
          score: architecturalScore,
          status: 'running'
        });
      } catch (error: any) {
        console.log(`[ProbeEngine] Architectural probes failed: ${error.message}`);
      }
    }

    // Run Navigation Probes (5.x)
    let navigationProbes: StrategicProbeResult[] | undefined;
    let navigationScore = 0;
    if (shouldRunCategory('5.x') && !options.quickMode) {
      console.log(`[ProbeEngine] Running Navigation probes (5.x) for ${modelId}`);
      try {
        navigationProbes = await runProbeCategory('5.x', chatExecutor);
        navigationScore = Math.round(navigationProbes.reduce((sum, p) => sum + p.score, 0) / navigationProbes.length);
        wsBroadcast.broadcastProgress('probe', modelId, {
          current: completedTests + 3,
          total: totalTests + 30,
          currentTest: '🧭 Navigation probes',
          score: navigationScore,
          status: 'running'
        });
      } catch (error: any) {
        console.log(`[ProbeEngine] Navigation probes failed: ${error.message}`);
      }
    }

    // Run Helicopter View Probes (6.x)
    let helicopterProbes: StrategicProbeResult[] | undefined;
    let helicopterScore = 0;
    if (shouldRunCategory('6.x') && !options.quickMode) {
      console.log(`[ProbeEngine] Running Helicopter probes (6.x) for ${modelId}`);
      try {
        helicopterProbes = await runProbeCategory('6.x', chatExecutor);
        helicopterScore = Math.round(helicopterProbes.reduce((sum, p) => sum + p.score, 0) / helicopterProbes.length);
        wsBroadcast.broadcastProgress('probe', modelId, {
          current: completedTests + 4,
          total: totalTests + 30,
          currentTest: '🚁 Helicopter probes',
          score: helicopterScore,
          status: 'running'
        });
      } catch (error: any) {
        console.log(`[ProbeEngine] Helicopter probes failed: ${error.message}`);
      }
    }

    // Run Proactive Helpfulness Probes (7.x)
    let proactiveProbes: StrategicProbeResult[] | undefined;
    let proactiveScore = 0;
    if (shouldRunCategory('7.x') && !options.quickMode) {
      console.log(`[ProbeEngine] Running Proactive probes (7.x) for ${modelId}`);
      try {
        proactiveProbes = await runProbeCategory('7.x', chatExecutor);
        proactiveScore = Math.round(proactiveProbes.reduce((sum, p) => sum + p.score, 0) / proactiveProbes.length);
        wsBroadcast.broadcastProgress('probe', modelId, {
          current: completedTests + 5,
          total: totalTests + 30,
          currentTest: '💡 Proactive probes',
          score: proactiveScore,
          status: 'running'
        });
      } catch (error: any) {
        console.log(`[ProbeEngine] Proactive probes failed: ${error.message}`);
      }
    }

    // Run Intent Recognition Probes (8.x)
    let intentProbeResults: IntentProbeResult[] | undefined;
    let intentScores: ReturnType<typeof calculateIntentScores> | undefined;
    let intentScore = 0;
    if (shouldRunCategory('8.x') && !options.quickMode) {
      console.log(`[ProbeEngine] Running Intent probes (8.x) for ${modelId}`);
      try {
        const intentResult = await runIntentProbes(chatExecutor);
        intentProbeResults = intentResult.results;
        intentScores = intentResult.scores;
        intentScore = intentScores.overallIntentScore;
        wsBroadcast.broadcastProgress('probe', modelId, {
          current: completedTests + 6,
          total: totalTests + 30,
          currentTest: '🎯 Intent probes',
          score: intentScore,
          status: 'running'
        });
      } catch (error: any) {
        console.log(`[ProbeEngine] Intent probes failed: ${error.message}`);
      }
    }

    // Calculate overall score with all categories
    let overallScore = toolScore;
    let scoreCount = 1;
    
    if (runReasoningProbes && reasoningScore > 0) {
      overallScore += reasoningScore;
      scoreCount++;
    }
    if (ragScore > 0) { overallScore += ragScore; scoreCount++; }
    if (architecturalScore > 0) { overallScore += architecturalScore; scoreCount++; }
    if (navigationScore > 0) { overallScore += navigationScore; scoreCount++; }
    if (helicopterScore > 0) { overallScore += helicopterScore; scoreCount++; }
    if (proactiveScore > 0) { overallScore += proactiveScore; scoreCount++; }
    if (intentScore > 0) { overallScore += intentScore; scoreCount++; }
    
    overallScore = Math.round(overallScore / scoreCount);

    // Build score breakdown
    const scoreBreakdown = {
      toolScore,
      reasoningScore,
      ragScore,
      bugDetectionScore,
      architecturalScore,
      navigationScore,
      helicopterScore,
      proactiveScore,
      intentScore,
      overallScore,
    };

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
      // Core tool behavior probes (1.1 - 1.4)
      emitTest,
      schemaTest,
      selectionTest,
      suppressionTest,
      // Enhanced tool behavior probes (1.5 - 1.8)
      nearIdenticalSelectionTest,
      multiToolEmitTest,
      argumentValidationTest,
      schemaReorderTest,
      // Reasoning probes
      reasoningProbes,
      // Strategic probes (3.x - 7.x)
      strategicRAGProbes,
      architecturalProbes,
      navigationProbes,
      helicopterProbes,
      proactiveProbes,
      // Intent probes (8.x)
      intentProbes: intentProbeResults,
      intentScores,
      // Scores
      toolScore,
      reasoningScore,
      overallScore,
      scoreBreakdown,
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

  // ============================================================
  // ENHANCED TOOL BEHAVIOR PROBES (1.5 - 1.8)
  // ============================================================

  /**
   * PROBE 1.5: Near-Identical Selection Test
   * Can the model distinguish between very similar tools based on subtle conditions?
   * This catches shallow pattern-matching that simpler selection tests miss.
   */
  private async runNearIdenticalSelectionTest(
    modelId: string,
    provider: 'lmstudio' | 'openai' | 'azure',
    settings: any,
    timeout: number
  ): Promise<ProbeResult> {
    const startTime = Date.now();

    const messages = [
      {
        role: 'system',
        content: 'You have access to two search tools. Choose the correct one based on data freshness requirements.'
      },
      {
        role: 'user',
        content: `I need to search for "latest stock prices" - this requires CURRENT, REAL-TIME data.

Available tools:
- search_web: For real-time or recent data
- search_web_cached: For stable or archived information

You MUST call exactly one tool. Do not explain.`
      }
    ];

    try {
      const response = await this.callLLM(
        modelId, 
        provider, 
        messages, 
        [SEARCH_WEB_TOOL, SEARCH_WEB_CACHED_TOOL], 
        settings, 
        timeout
      );
      const latency = Date.now() - startTime;

      // Check for bad output
      const content = response?.choices?.[0]?.message?.content || '';
      const badOutput = detectBadOutput(content);
      if (badOutput.isLooping || badOutput.hasLeakedTokens) {
        return {
          testName: 'near_identical_selection',
          passed: false,
          score: 0,
          latency,
          details: badOutput.isLooping ? 'Repetition loop detected' : `Leaked tokens: ${badOutput.leakedTokens.slice(0, 3).join(', ')}`,
          response
        };
      }

      const toolCalls = response?.choices?.[0]?.message?.tool_calls;
      if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
        return {
          testName: 'near_identical_selection',
          passed: false,
          score: 0,
          latency,
          details: 'No tool calls emitted',
          response
        };
      }

      if (toolCalls.length > 1) {
        return {
          testName: 'near_identical_selection',
          passed: false,
          score: 20,
          latency,
          details: 'Model called multiple tools instead of selecting one',
          response
        };
      }

      const toolCall = toolCalls[0];
      const functionName = toolCall?.function?.name;

      // Correct answer: search_web (because we need REAL-TIME data)
      if (functionName === 'search_web') {
        let args: any = {};
        try {
          args = JSON.parse(toolCall?.function?.arguments || '{}');
        } catch {}

        const hasQuery = args.query && args.query.toLowerCase().includes('stock');

        return {
          testName: 'near_identical_selection',
          passed: true,
          score: hasQuery ? 100 : 90,
          latency,
          details: hasQuery 
            ? 'Correct: chose search_web for real-time data with appropriate query'
            : 'Correct tool selected (search_web)',
          response
        };
      }

      if (functionName === 'search_web_cached') {
        return {
          testName: 'near_identical_selection',
          passed: false,
          score: 35,
          latency,
          details: 'Wrong: chose search_web_cached when real-time data was needed - shallow pattern matching',
          response
        };
      }

      return {
        testName: 'near_identical_selection',
        passed: false,
        score: 10,
        latency,
        details: `Unknown tool called: ${functionName}`,
        response
      };

    } catch (error: any) {
      return {
        testName: 'near_identical_selection',
        passed: false,
        score: 0,
        latency: Date.now() - startTime,
        details: 'Test failed',
        error: error.message
      };
    }
  }

  /**
   * PROBE 1.6: Multi-Tool Emit Test
   * Can the model emit multiple tool calls in a single response?
   * Important for batch operations and parallel tool execution.
   */
  private async runMultiToolEmitTest(
    modelId: string,
    provider: 'lmstudio' | 'openai' | 'azure',
    settings: any,
    timeout: number
  ): Promise<ProbeResult> {
    const startTime = Date.now();

    const messages = [
      {
        role: 'system',
        content: 'You are a tool-calling assistant that can call multiple tools in one response when needed.'
      },
      {
        role: 'user',
        content: `Read BOTH files in a single response:
1. Read "config.json"
2. Read "settings.json"

You MUST call read_file TWICE in one response. Do not explain.`
      }
    ];

    try {
      const response = await this.callLLM(
        modelId, 
        provider, 
        messages, 
        [READ_FILE_TOOL], 
        settings, 
        timeout
      );
      const latency = Date.now() - startTime;

      // Check for bad output
      const content = response?.choices?.[0]?.message?.content || '';
      const badOutput = detectBadOutput(content);
      if (badOutput.isLooping || badOutput.hasLeakedTokens) {
        return {
          testName: 'multi_tool_emit',
          passed: false,
          score: 0,
          latency,
          details: badOutput.isLooping ? 'Repetition loop detected' : `Leaked tokens: ${badOutput.leakedTokens.slice(0, 3).join(', ')}`,
          response
        };
      }

      const toolCalls = response?.choices?.[0]?.message?.tool_calls;
      if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
        return {
          testName: 'multi_tool_emit',
          passed: false,
          score: 0,
          latency,
          details: 'No tool calls emitted',
          response
        };
      }

      if (toolCalls.length === 1) {
        // Partial success - called tool once but not twice
        return {
          testName: 'multi_tool_emit',
          passed: false,
          score: 40,
          latency,
          details: 'Only one tool call emitted when two were required',
          response
        };
      }

      // Check if both calls are read_file with correct paths
      const readFileCalls = toolCalls.filter((tc: any) => tc?.function?.name === 'read_file');
      
      if (readFileCalls.length < 2) {
        return {
          testName: 'multi_tool_emit',
          passed: false,
          score: 50,
          latency,
          details: `Called ${toolCalls.length} tools, but not all were read_file`,
          response
        };
      }

      // Check paths
      const paths: string[] = [];
      for (const tc of readFileCalls) {
        try {
          const args = JSON.parse(tc?.function?.arguments || '{}');
          if (args.path) paths.push(args.path);
        } catch {}
      }

      const hasConfig = paths.some(p => p.includes('config'));
      const hasSettings = paths.some(p => p.includes('settings'));

      if (hasConfig && hasSettings) {
        return {
          testName: 'multi_tool_emit',
          passed: true,
          score: 100,
          latency,
          details: `Perfect: emitted ${readFileCalls.length} read_file calls with correct paths`,
          response
        };
      }

      return {
        testName: 'multi_tool_emit',
        passed: true,
        score: 80,
        latency,
        details: `Emitted ${readFileCalls.length} read_file calls, but paths may not match exactly`,
        response
      };

    } catch (error: any) {
      return {
        testName: 'multi_tool_emit',
        passed: false,
        score: 0,
        latency: Date.now() - startTime,
        details: 'Test failed',
        error: error.message
      };
    }
  }

  /**
   * PROBE 1.7: Argument Validation Test
   * Does the model respect type constraints and nested schema requirements?
   */
  private async runArgumentValidationTest(
    modelId: string,
    provider: 'lmstudio' | 'openai' | 'azure',
    settings: any,
    timeout: number
  ): Promise<ProbeResult> {
    const startTime = Date.now();

    const messages = [
      {
        role: 'system',
        content: 'You are a tool-calling assistant. Read the tool schema carefully and provide all required parameters with correct types.'
      },
      {
        role: 'user',
        content: `Create a user with these details:
- username: "john_doe"
- age: 25 (this must be a number, not a string!)
- profile.email: "john@example.com"
- profile.role: "user"

Call create_user with the correct types and nested structure. Do not explain.`
      }
    ];

    try {
      const response = await this.callLLM(
        modelId, 
        provider, 
        messages, 
        [CREATE_USER_TOOL], 
        settings, 
        timeout
      );
      const latency = Date.now() - startTime;

      // Check for bad output
      const content = response?.choices?.[0]?.message?.content || '';
      const badOutput = detectBadOutput(content);
      if (badOutput.isLooping || badOutput.hasLeakedTokens) {
        return {
          testName: 'argument_validation',
          passed: false,
          score: 0,
          latency,
          details: badOutput.isLooping ? 'Repetition loop detected' : `Leaked tokens: ${badOutput.leakedTokens.slice(0, 3).join(', ')}`,
          response
        };
      }

      const toolCalls = response?.choices?.[0]?.message?.tool_calls;
      if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
        return {
          testName: 'argument_validation',
          passed: false,
          score: 0,
          latency,
          details: 'No tool calls emitted',
          response
        };
      }

      const toolCall = toolCalls[0];
      if (toolCall?.function?.name !== 'create_user') {
        return {
          testName: 'argument_validation',
          passed: false,
          score: 10,
          latency,
          details: `Wrong tool called: ${toolCall?.function?.name}`,
          response
        };
      }

      let args: any = {};
      try {
        args = JSON.parse(toolCall?.function?.arguments || '{}');
      } catch {
        return {
          testName: 'argument_validation',
          passed: false,
          score: 20,
          latency,
          details: 'Invalid JSON arguments',
          response
        };
      }

      let score = 0;
      const issues: string[] = [];

      // Check username (string)
      if (typeof args.username === 'string') {
        score += 20;
      } else {
        issues.push('username not a string');
      }

      // Check age (must be number, not string!)
      if (typeof args.age === 'number') {
        score += 25;
      } else if (args.age === '25' || args.age === 25) {
        score += 10;
        issues.push('age is string instead of number');
      } else {
        issues.push('age missing or wrong');
      }

      // Check nested profile object
      if (typeof args.profile === 'object' && args.profile !== null) {
        score += 15;
        
        // Check profile.email
        if (typeof args.profile.email === 'string') {
          score += 15;
        } else {
          issues.push('profile.email missing');
        }

        // Check profile.role (should be enum value)
        if (['admin', 'user', 'guest'].includes(args.profile.role)) {
          score += 25;
        } else if (args.profile.role) {
          score += 10;
          issues.push('profile.role not a valid enum');
        } else {
          issues.push('profile.role missing');
        }
      } else {
        issues.push('profile object missing or malformed');
      }

      return {
        testName: 'argument_validation',
        passed: score >= 70,
        score,
        latency,
        details: score >= 100 
          ? 'Perfect: all types and nested structures correct'
          : `Score ${score}/100. Issues: ${issues.join(', ')}`,
        response
      };

    } catch (error: any) {
      return {
        testName: 'argument_validation',
        passed: false,
        score: 0,
        latency: Date.now() - startTime,
        details: 'Test failed',
        error: error.message
      };
    }
  }

  /**
   * PROBE 1.8: Schema Reorder Test
   * Does the model break if schema keys are reordered?
   * This catches models that rely on positional memory rather than semantic understanding.
   */
  private async runSchemaReorderTest(
    modelId: string,
    provider: 'lmstudio' | 'openai' | 'azure',
    settings: any,
    timeout: number
  ): Promise<ProbeResult> {
    const startTime = Date.now();

    const messages = [
      {
        role: 'system',
        content: 'You are a tool-calling assistant. Call the tool exactly as instructed.'
      },
      {
        role: 'user',
        content: 'Call the "ping" tool with value "reorder_test". Do not explain.'
      }
    ];

    try {
      // Use the reordered schema (same semantics, different key order)
      const response = await this.callLLM(
        modelId, 
        provider, 
        messages, 
        [PING_TOOL_REORDERED], 
        settings, 
        timeout
      );
      const latency = Date.now() - startTime;

      // Check for bad output
      const content = response?.choices?.[0]?.message?.content || '';
      const badOutput = detectBadOutput(content);
      if (badOutput.isLooping || badOutput.hasLeakedTokens) {
        return {
          testName: 'schema_reorder',
          passed: false,
          score: 0,
          latency,
          details: badOutput.isLooping ? 'Repetition loop detected' : `Leaked tokens: ${badOutput.leakedTokens.slice(0, 3).join(', ')}`,
          response
        };
      }

      const toolCalls = response?.choices?.[0]?.message?.tool_calls;
      if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
        return {
          testName: 'schema_reorder',
          passed: false,
          score: 0,
          latency,
          details: 'No tool calls emitted with reordered schema',
          response
        };
      }

      const toolCall = toolCalls[0];
      const functionName = toolCall?.function?.name;

      if (functionName !== 'ping') {
        return {
          testName: 'schema_reorder',
          passed: false,
          score: 30,
          latency,
          details: `Wrong tool called: ${functionName}`,
          response
        };
      }

      let args: any = {};
      try {
        args = JSON.parse(toolCall?.function?.arguments || '{}');
      } catch {
        return {
          testName: 'schema_reorder',
          passed: false,
          score: 40,
          latency,
          details: 'Tool call emitted but arguments are invalid JSON',
          response
        };
      }

      // Check if value is correct
      if (args.value === 'reorder_test') {
        return {
          testName: 'schema_reorder',
          passed: true,
          score: 100,
          latency,
          details: 'Schema reordering handled correctly - model reads semantics, not positions',
          response
        };
      }

      if (args.value) {
        return {
          testName: 'schema_reorder',
          passed: true,
          score: 85,
          latency,
          details: `Schema handled but value differs: "${args.value}" instead of "reorder_test"`,
          response
        };
      }

      return {
        testName: 'schema_reorder',
        passed: false,
        score: 50,
        latency,
        details: 'Tool called but "value" parameter missing - possible schema confusion',
        response
      };

    } catch (error: any) {
      return {
        testName: 'schema_reorder',
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

      // Check for bad output (loops, leaked tokens)
      const badOutput = detectBadOutput(content);
      if (badOutput.isLooping || badOutput.hasLeakedTokens) {
        return {
          testName: 'intent_extraction',
          passed: false,
          score: 0,
          latency,
          details: badOutput.isLooping 
            ? 'Model stuck in repetition loop' 
            : `Leaked control tokens: ${badOutput.leakedTokens.slice(0, 3).join(', ')}`,
          response
        };
      }

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

      // Check for bad output (loops, leaked tokens)
      const badOutput = detectBadOutput(content);
      if (badOutput.isLooping || badOutput.hasLeakedTokens) {
        return {
          testName: 'multi_step_planning',
          passed: false,
          score: 0,
          latency,
          details: badOutput.isLooping 
            ? 'Model stuck in repetition loop' 
            : `Leaked control tokens: ${badOutput.leakedTokens.slice(0, 3).join(', ')}`,
          response
        };
      }

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

      // Check for bad output (loops, leaked tokens)
      const badOutput = detectBadOutput(content);
      if (badOutput.isLooping || badOutput.hasLeakedTokens) {
        return {
          testName: 'conditional_reasoning',
          passed: false,
          score: 0,
          latency,
          details: badOutput.isLooping 
            ? 'Model stuck in repetition loop' 
            : `Leaked control tokens: ${badOutput.leakedTokens.slice(0, 3).join(', ')}`,
          response
        };
      }

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

      // Check for bad output (loops, leaked tokens)
      const badOutput = detectBadOutput(content);
      if (badOutput.isLooping || badOutput.hasLeakedTokens) {
        return {
          testName: 'context_continuity',
          passed: false,
          score: 0,
          latency,
          details: badOutput.isLooping 
            ? 'Model stuck in repetition loop' 
            : `Leaked control tokens: ${badOutput.leakedTokens.slice(0, 3).join(', ')}`,
          response
        };
      }

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

      // Check for bad output (loops, leaked tokens)
      const badOutput = detectBadOutput(content);
      if (badOutput.isLooping || badOutput.hasLeakedTokens) {
        return {
          testName: 'logical_consistency',
          passed: false,
          score: 0,
          latency,
          details: badOutput.isLooping 
            ? 'Model stuck in repetition loop' 
            : `Leaked control tokens: ${badOutput.leakedTokens.slice(0, 3).join(', ')}`,
          response
        };
      }

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

      // Check for bad output (loops, leaked tokens)
      const badOutput = detectBadOutput(content);
      if (badOutput.isLooping || badOutput.hasLeakedTokens) {
        return {
          testName: 'explanation',
          passed: false,
          score: 0,
          latency,
          details: badOutput.isLooping 
            ? 'Model stuck in repetition loop' 
            : `Leaked control tokens: ${badOutput.leakedTokens.slice(0, 3).join(', ')}`,
          response
        };
      }

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

      // Check for bad output (loops, leaked tokens)
      const badOutput = detectBadOutput(content);
      if (badOutput.isLooping || badOutput.hasLeakedTokens) {
        return {
          testName: 'edge_case_handling',
          passed: false,
          score: 0,
          latency,
          details: badOutput.isLooping 
            ? 'Model stuck in repetition loop' 
            : `Leaked control tokens: ${badOutput.leakedTokens.slice(0, 3).join(', ')}`,
          response
        };
      }

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
      temperature: 0,
      max_tokens: 800  // Slightly higher for reasoning tests (need more output)
    };

    switch (provider) {
      case 'lmstudio':
        url = `${settings.lmstudioUrl}/v1/chat/completions`;
        body.model = modelId;
        // Add stop strings to prevent loops and leaked control tokens
        body.stop = COMMON_STOP_STRINGS;
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
   * Quick latency check at 2K context
   * Used to detect slow models before running full test suite
   */
  async runQuickLatencyCheck(
    modelId: string,
    provider: 'lmstudio' | 'openai' | 'azure',
    settings: any,
    timeout: number
  ): Promise<number> {
    const contextSize = 2048;
    
    console.log(`[ProbeEngine] Quick latency check for ${modelId} at ${contextSize} context`);

    // For LM Studio: ensure model is loaded with specified context via centralized manager
    if (provider === 'lmstudio') {
      try {
        await modelManager.ensureLoaded(modelId, contextSize);
      } catch (error: any) {
        console.log(`[ProbeEngine] Cannot load model: ${error.message}`);
        throw error;
      }
    }

    // Run a simple test to measure latency
    const startTime = Date.now();
    
    try {
      const messages = [
        { role: 'system', content: 'Call the ping tool with value "latency_test".' },
        { role: 'user', content: 'Call ping now.' }
      ];

      await this.callLLM(modelId, provider, messages, [PING_TOOL], settings, timeout);
      
      const latency = Date.now() - startTime;
      console.log(`[ProbeEngine] Quick latency check: ${latency}ms`);
      
      return latency;
    } catch (error: any) {
      console.error(`[ProbeEngine] Quick latency check failed: ${error.message}`);
      // Return a high latency to indicate slow model
      return Date.now() - startTime;
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
    const baseContextSizes = [2048, 4096, 8192, 16384, 32768, 65536, 131072, 262144, 524288, 1048576];
    const latencies: Record<number, number> = {};
    const testedContextSizes: number[] = [];
    let maxUsableContext = 2048;
    const maxLatencyThreshold = 30000; // 30 seconds

    console.log(`[ProbeEngine] Starting context latency profiling for ${modelId}`);

    // First, get the model's max context size
    const modelMaxContext = await this.getModelMaxContext(modelId, settings);
    console.log(`[ProbeEngine] Model max context: ${modelMaxContext}`);

    // Filter context sizes to only test up to model's max, and include the model's max if not in the list
    let contextSizes = baseContextSizes.filter(size => size <= modelMaxContext);
    
    // Add the model's actual max context if it's not already in the list (test the full capability)
    if (modelMaxContext > 0 && !contextSizes.includes(modelMaxContext)) {
      contextSizes.push(modelMaxContext);
      contextSizes.sort((a, b) => a - b);
    }

    console.log(`[ProbeEngine] Will test context sizes: ${contextSizes.map(s => s >= 1024 ? `${s/1024}K` : s).join(', ')}`);

    // Broadcast initial progress
    wsBroadcast.broadcastProgress('latency', modelId, {
      current: 0,
      total: contextSizes.length,
      currentTest: `Context sizes: ${contextSizes.length}`,
      status: 'running'
    });

    let completedTests = 0;

    for (const contextSize of contextSizes) {
      // For LM Studio, we need to reload model with new context size via centralized manager
      if (provider === 'lmstudio') {
        try {
          // ensureLoaded will unload and reload if context differs
          await modelManager.ensureLoaded(modelId, contextSize);
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

    // Calculate speed metrics
    const latencyValues = Object.values(latencies);
    const minLatency = latencyValues.length > 0 ? Math.min(...latencyValues) : undefined;
    
    // Speed thresholds for interactive IDE use
    const EXCELLENT_THRESHOLD = 500;    // < 500ms - feels instant
    const GOOD_THRESHOLD = 2000;        // < 2s - interactive
    const ACCEPTABLE_THRESHOLD = 5000;  // < 5s - comfortable
    const SLOW_THRESHOLD = 10000;       // < 10s - noticeable lag
    
    const isInteractiveSpeed = minLatency !== undefined && minLatency < ACCEPTABLE_THRESHOLD;
    
    let speedRating: 'excellent' | 'good' | 'acceptable' | 'slow' | 'very_slow' = 'very_slow';
    if (minLatency !== undefined) {
      if (minLatency < EXCELLENT_THRESHOLD) speedRating = 'excellent';
      else if (minLatency < GOOD_THRESHOLD) speedRating = 'good';
      else if (minLatency < ACCEPTABLE_THRESHOLD) speedRating = 'acceptable';
      else if (minLatency < SLOW_THRESHOLD) speedRating = 'slow';
    }

    // Broadcast completion
    wsBroadcast.broadcastProgress('latency', modelId, {
      current: completedTests,
      total: contextSizes.length,
      currentTest: `Recommended: ${recommendedContext / 1024}K (${speedRating})`,
      status: 'completed'
    });

    return {
      testedContextSizes,
      latencies,
      maxUsableContext,
      recommendedContext,
      modelMaxContext,
      minLatency,
      isInteractiveSpeed,
      speedRating
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
      temperature: 0,  // Always use temp 0 for deterministic testing
      max_tokens: 500  // Limit output to prevent runaway generation
    };

    // Only add tools if provided (for XML format, we don't send tools)
    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }

    // Add stop strings for LM Studio to prevent loops and leaked control tokens
    if (provider === 'lmstudio') {
      body.stop = COMMON_STOP_STRINGS;
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

  /**
   * Run a chat completion with RAG tools for strategic/intent probes
   * This wraps callLLM and provides the standard tool set
   */
  private async runChatCompletion(
    modelId: string,
    provider: 'lmstudio' | 'openai' | 'azure',
    settings: any,
    prompt: string,
    timeout: number
  ): Promise<any> {
    // Define RAG and file tools for strategic probes
    const ragTools = [
      {
        type: 'function',
        function: {
          name: 'rag_query',
          description: 'Search the codebase using semantic search. Use this to find code, understand how things work, or locate implementations.',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'The search query describing what you want to find'
              }
            },
            required: ['query']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'read_file',
          description: 'Read the contents of a file',
          parameters: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'The path to the file to read'
              }
            },
            required: ['path']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'search_files',
          description: 'Search for files matching a pattern',
          parameters: {
            type: 'object',
            properties: {
              pattern: {
                type: 'string',
                description: 'The search pattern (supports glob)'
              }
            },
            required: ['pattern']
          }
        }
      }
    ];

    const messages = [
      {
        role: 'system',
        content: 'You are a helpful coding assistant. Use the available tools to search and read code when answering questions about the codebase. Always use rag_query first for code-related questions.'
      },
      {
        role: 'user',
        content: prompt
      }
    ];

    return this.callLLM(modelId, provider, messages, ragTools, settings, timeout);
  }
}

// Export singleton
export const probeEngine = new ProbeEngine();

// Re-export probe categories for use in routes
export { PROBE_CATEGORIES } from './strategic-probes.js';

