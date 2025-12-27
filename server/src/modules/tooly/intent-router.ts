/**
 * Intent Router
 * Handles dual-model architecture: Main Model (reasoning) -> Executor Model (tools)
 * 
 * Main Model: Understanding user intent, planning, outputting structured intent
 * Executor Model: Translating structured intent into exact tool calls
 */

import axios from 'axios';
import { capabilities, ModelProfile } from './capabilities.js';
import { getToolSchemas, buildSystemPrompt } from './tool-prompts.js';
import { failureLog, type FailureCategory } from '../../services/failure-log.js';
import { failureObserver } from '../../services/failure-observer.js';
import { prostheticStore } from './learning/prosthetic-store.js';

// ============================================================
// TYPES
// ============================================================

export interface IntentSchema {
  schemaVersion: string;
  action: 'call_tool' | 'respond' | 'ask_clarification' | 'multi_step';
  tool?: string;
  parameters?: Record<string, any>;
  steps?: IntentStep[];  // For multi-step actions
  metadata?: {
    reasoning?: string;
    priority?: 'low' | 'normal' | 'high';
    context?: string;
    response?: string;    // Response text when action is 'respond'
    question?: string;    // Question text when action is 'ask_clarification'
  };
}

export interface IntentStep {
  order: number;
  action: 'call_tool' | 'respond';
  tool?: string;
  parameters?: Record<string, any>;
  waitForResult?: boolean;
}

export interface RouterConfig {
  mainModelId?: string;
  executorModelId?: string;
  enableDualModel: boolean;
  timeout: number;          // Default 30000ms
  provider: 'lmstudio' | 'openai' | 'azure' | 'openrouter';
  settings: {
    lmstudioUrl?: string;
    openaiApiKey?: string;
    azureResourceName?: string;
    azureApiKey?: string;
    azureDeploymentName?: string;
    azureApiVersion?: string;
    openrouterApiKey?: string;
  };
}

export interface RoutingPhase {
  phase: 'planning' | 'execution' | 'response';
  systemPrompt: string;
  model: string;
  latencyMs: number;
  reasoning?: string;
}

export interface RoutingResult {
  mode: 'single' | 'dual';
  mainResponse?: any;
  executorResponse?: any;
  finalResponse: any;
  toolCalls?: any[];
  latency: {
    main?: number;
    executor?: number;
    total: number;
  };
  // NEW: Detailed phase information for debugging/visualization
  phases: RoutingPhase[];
  intent?: IntentSchema;
}

// ============================================================
// INTENT ROUTER
// ============================================================

class IntentRouter {
  private config: RouterConfig | null = null;
  private mainProfile: ModelProfile | null = null;
  private executorProfile: ModelProfile | null = null;

  /**
   * Configure the router with models
   */
  async configure(config: RouterConfig): Promise<void> {
    this.config = config;

    if (config.enableDualModel) {
      // Load model profiles (optional - routing works without them)
      if (config.mainModelId) {
        this.mainProfile = await capabilities.getProfile(config.mainModelId);
        if (!this.mainProfile) {
          // Create a minimal profile so dual-model can proceed
          this.mainProfile = {
            modelId: config.mainModelId,
            displayName: config.mainModelId,
            provider: 'lmstudio',
            testedAt: new Date().toISOString(),
            testVersion: 1,
            score: 50,
            toolFormat: 'openai_tools',
            capabilities: {},
            enabledTools: []
          };
          console.log(`[IntentRouter] Created placeholder profile for main: ${config.mainModelId}`);
        }
      }
      if (config.executorModelId) {
        this.executorProfile = await capabilities.getProfile(config.executorModelId);
        if (!this.executorProfile) {
          // Create a minimal profile so dual-model can proceed
          this.executorProfile = {
            modelId: config.executorModelId,
            displayName: config.executorModelId,
            provider: 'lmstudio',
            testedAt: new Date().toISOString(),
            testVersion: 1,
            score: 50,
            toolFormat: 'openai_tools',
            capabilities: {},
            enabledTools: []
          };
          console.log(`[IntentRouter] Created placeholder profile for executor: ${config.executorModelId}`);
        }
      }

      console.log(`[IntentRouter] Configured with dual-model: main=${config.mainModelId}, executor=${config.executorModelId}`);
      console.log(`[IntentRouter] Profiles loaded: main=${!!this.mainProfile}, executor=${!!this.executorProfile}`);
    } else {
      console.log(`[IntentRouter] Configured in single-model mode`);
    }
  }

  /**
   * Auto-select models based on probe results
   * Returns best Main and Executor models from available profiles
   */
  async autoSelectModels(provider: 'lmstudio' | 'openai' | 'azure' | 'openrouter'): Promise<{ mainModel?: string; executorModel?: string }> {
    const profiles = await capabilities.getAllProfiles();
    const providerProfiles = profiles.filter(p => p.provider === provider);

    let mainModel: string | undefined;
    let executorModel: string | undefined;

    // Find best main model (good suppression + selection)
    const mainCandidates = providerProfiles.filter(p => 
      p.role === 'main' || p.role === 'both'
    ).sort((a, b) => {
      const aScore = (a.probeResults?.suppressionTest?.score || 0) + (a.probeResults?.selectionTest?.score || 0);
      const bScore = (b.probeResults?.suppressionTest?.score || 0) + (b.probeResults?.selectionTest?.score || 0);
      return bScore - aScore;
    });

    if (mainCandidates.length > 0) {
      mainModel = mainCandidates[0].modelId;
    }

    // Find best executor model (good emit + schema)
    const executorCandidates = providerProfiles.filter(p => 
      p.role === 'executor' || p.role === 'both'
    ).sort((a, b) => {
      const aScore = (a.probeResults?.emitTest?.score || 0) + (a.probeResults?.schemaTest?.score || 0);
      const bScore = (b.probeResults?.emitTest?.score || 0) + (b.probeResults?.schemaTest?.score || 0);
      return bScore - aScore;
    });

    if (executorCandidates.length > 0) {
      executorModel = executorCandidates[0].modelId;
    }

    console.log(`[IntentRouter] Auto-selected: main=${mainModel}, executor=${executorModel}`);
    return { mainModel, executorModel };
  }

  /**
   * Route a request through the appropriate model(s)
   * Now includes capability-based routing for blocked capabilities
   */
  async route(
    messages: any[],
    tools?: any[],
    originalRequest?: any
  ): Promise<RoutingResult> {
    const startTime = Date.now();

    if (!this.config) {
      throw new Error('IntentRouter not configured');
    }

    // Check for blocked capabilities and get fallback if needed
    const userMessage = messages.find(m => m.role === 'user')?.content || '';
    const requiredCapability = this.detectRequiredCapability(userMessage);
    
    if (requiredCapability && this.config.mainModelId) {
      const isBlocked = await this.isCapabilityBlocked(requiredCapability);
      if (isBlocked) {
        const fallbackModelId = await this.getFallbackForCapability(requiredCapability);
        if (fallbackModelId) {
          console.log(`[IntentRouter] Capability ${requiredCapability} is blocked, routing to fallback: ${fallbackModelId}`);
          // Temporarily switch to fallback model for this request
          const originalMainModel = this.config.mainModelId;
          this.config.mainModelId = fallbackModelId;
          
          try {
            const result = await this.routeInternal(messages, tools, originalRequest, startTime);
            result.phases.unshift({
              phase: 'planning' as const,
              systemPrompt: `Routed to fallback model for ${requiredCapability}`,
              model: fallbackModelId,
              latencyMs: 0,
              reasoning: `Original model ${originalMainModel} has ${requiredCapability} blocked`
            });
            return result;
          } finally {
            this.config.mainModelId = originalMainModel;
          }
        }
      }
    }

    return this.routeInternal(messages, tools, originalRequest, startTime);
  }

  /**
   * Detect what capability is required for a query
   */
  private detectRequiredCapability(query: string): string | null {
    const q = query.toLowerCase();
    
    if (q.includes('search') || q.includes('find') || q.includes('explore')) {
      return 'rag';
    }
    if (q.includes('read') || q.includes('show') || q.includes('contents of')) {
      return 'read_file';
    }
    if (q.includes('write') || q.includes('create file') || q.includes('save')) {
      return 'write_file';
    }
    if (q.includes('run') || q.includes('execute') || q.includes('shell')) {
      return 'shell_exec';
    }
    if (q.includes('web') || q.includes('internet') || q.includes('google')) {
      return 'browser';
    }
    if (q.includes('multi') || q.includes('first') || q.includes('then')) {
      return 'multi_step';
    }

    return null;
  }

  /**
   * Internal routing logic (extracted for fallback support)
   */
  private async routeInternal(
    messages: any[],
    tools?: any[],
    originalRequest?: any,
    startTime?: number
  ): Promise<RoutingResult> {
    const actualStartTime = startTime || Date.now();

    // Early exit if no config
    if (!this.config) {
      throw new Error('IntentRouter not configured. Call configure() first.');
    }

    // Single model mode: just pass through
    if (!this.config.enableDualModel || !this.mainProfile || !this.executorProfile) {
      const modelId = this.config.mainModelId || this.config.executorModelId || '';
      
      // Extract original system prompt from messages
      const originalSystemPrompt = messages.find(m => m.role === 'system')?.content || '';
      
      const singleStartTime = Date.now();
      const response = await this.callModel(
        modelId,
        messages,
        tools,
        this.config.timeout
      );
      const singleLatency = Date.now() - singleStartTime;

      return {
        mode: 'single',
        finalResponse: response,
        toolCalls: response?.choices?.[0]?.message?.tool_calls,
        latency: {
          total: Date.now() - actualStartTime
        },
        phases: [{
          phase: 'response',
          systemPrompt: originalSystemPrompt,
          model: modelId,
          latencyMs: singleLatency
        }]
      };
    }

    // Dual model mode
    const phases: RoutingPhase[] = [];
    const mainStartTime = Date.now();

    // Step 1: Call Main Model for intent/reasoning (no tools)
    const mainSystemPrompt = this.buildMainModelPrompt();
    const mainMessages = [
      { role: 'system', content: mainSystemPrompt },
      ...messages
    ];

    // Use a shorter timeout for main model (intent extraction should be fast)
    const mainTimeout = Math.min(this.config.timeout, 30000); // Max 30s for intent
    const mainResponse = await this.callModel(
      this.config.mainModelId!,
      mainMessages,
      undefined, // No tools for main model
      mainTimeout
    );

    const mainLatency = Date.now() - mainStartTime;

    // Add planning phase
    phases.push({
      phase: 'planning',
      systemPrompt: mainSystemPrompt,
      model: this.config.mainModelId!,
      latencyMs: mainLatency,
      reasoning: mainResponse?.choices?.[0]?.message?.content || ''
    });

    // Extract intent from main model response
    const intent = this.parseIntent(mainResponse);

    // If no tool call needed, generate proper response
    if (intent.action === 'respond' || intent.action === 'ask_clarification') {
      // Extract the response text from intent metadata or generate one
      let responseText = intent.metadata?.response || intent.metadata?.question || '';
      
      // If no response was included in the intent, we need to generate one
      if (!responseText) {
        // Make a quick call to generate a natural response
        try {
          const responseMessages = [
            { role: 'system', content: 'You are a helpful coding assistant. Respond naturally and helpfully.' },
            ...messages
          ];
          const naturalResponse = await this.callModel(
            this.config.mainModelId!,
            responseMessages,
            undefined,
            mainTimeout
          );
          responseText = naturalResponse?.choices?.[0]?.message?.content || 'I understand. How can I help you further?';
        } catch {
          responseText = intent.action === 'ask_clarification' 
            ? 'Could you please provide more details about what you need?'
            : 'I understand. How can I help you further?';
        }
      }
      
      // Build a proper response object with the text content
      const properResponse = {
        id: mainResponse.id,
        object: 'chat.completion',
        created: mainResponse.created,
        model: mainResponse.model,
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: responseText,
            tool_calls: []
          },
          finish_reason: 'stop'
        }],
        usage: mainResponse.usage
      };
      
      return {
        mode: 'dual',
        mainResponse,
        finalResponse: properResponse,
        latency: {
          main: mainLatency,
          total: Date.now() - actualStartTime
        },
        phases,
        intent
      };
    }

    // Step 2: Call Executor Model with intent
    const executorStartTime = Date.now();

    // Use tools passed in, or from executor profile, or fall back to getting all tool schemas
    const enabledTools = this.executorProfile!.enabledTools?.length 
      ? this.executorProfile!.enabledTools 
      : (tools?.map(t => t.function?.name).filter(Boolean) as string[]) || [];
    
    // Pass the tools we received (already sanitized by proxy) or get schemas
    const executorTools = tools && tools.length > 0 
      ? tools 
      : getToolSchemas(enabledTools);

    const executorSystemPrompt = this.buildExecutorModelPrompt(enabledTools);
    const executorMessages = [
      { role: 'system', content: executorSystemPrompt },
      { role: 'user', content: `Execute this intent:\n${JSON.stringify(intent, null, 2)}` }
    ];

    const executorResponse = await this.callModel(
      this.config.executorModelId!,
      executorMessages,
      executorTools,
      this.config.timeout
    );

    const executorLatency = Date.now() - executorStartTime;

    // Add execution phase
    phases.push({
      phase: 'execution',
      systemPrompt: executorSystemPrompt,
      model: this.config.executorModelId!,
      latencyMs: executorLatency
    });

    return {
      mode: 'dual',
      mainResponse,
      executorResponse,
      finalResponse: executorResponse,
      toolCalls: executorResponse?.choices?.[0]?.message?.tool_calls,
      latency: {
        main: mainLatency,
        executor: executorLatency,
        total: Date.now() - actualStartTime
      },
      phases,
      intent
    };
  }

  /**
   * Build system prompt for Main Model (reasoning, no tools)
   * Automatically injects prosthetics and filters tools based on model capabilities
   */
  private buildMainModelPrompt(): string {
    const modelId = this.config?.mainModelId || '';
    
    // Check for prosthetic prompt for this model
    let prostheticSection = '';
    const prosthetic = prostheticStore.getPrompt(modelId);
    if (prosthetic) {
      console.log(`[IntentRouter] Injecting prosthetic (Level ${prosthetic.level}) for ${modelId}`);
      prostheticSection = `\n\n## MODEL-SPECIFIC GUIDANCE (Based on previous performance)\n${prosthetic.prompt}\n`;
    }
    
    // Build capability-aware tool list
    const blocked = this.mainProfile?.blockedCapabilities || [];
    const learned = this.mainProfile?.learnedCapabilities || [];
    const native = this.mainProfile?.nativeStrengths || [];
    
    // Define all tools with their categories
    const allTools: Record<string, { desc: string; category: string }> = {
      // Code Search
      'rag_query': { desc: 'Semantic search codebase - USE FOR ANY QUESTION ABOUT CODE/PROJECT', category: 'Code Search (DEFAULT)' },
      'find_symbol': { desc: 'Find where a symbol/function/class is defined', category: 'Code Search (DEFAULT)' },
      'get_callers': { desc: 'Find all callers of a function', category: 'Code Search (DEFAULT)' },
      'get_file_interface': { desc: 'Get exports/interface of a file', category: 'Code Search (DEFAULT)' },
      'get_dependencies': { desc: 'Get dependency graph of a file', category: 'Code Search (DEFAULT)' },
      // File Operations
      'read_file': { desc: 'Read file by exact path', category: 'File Operations' },
      'list_directory': { desc: 'List directory contents', category: 'File Operations' },
      'search_files': { desc: 'Find files by pattern', category: 'File Operations' },
      // Git Operations
      'git_status': { desc: 'Show changed files', category: 'Git Operations' },
      'git_diff': { desc: 'Show differences', category: 'Git Operations' },
      'git_log': { desc: 'Show commit history', category: 'Git Operations' },
      'git_branch': { desc: 'List/show branches', category: 'Git Operations' },
      'git_commit': { desc: 'Commit changes (requires message)', category: 'Git Operations' },
      'git_stash': { desc: 'Stash/unstash changes', category: 'Git Operations' },
      // System & Package
      'npm_scripts': { desc: 'List available npm scripts', category: 'System & Package' },
      'npm_outdated': { desc: 'Check outdated packages', category: 'System & Package' },
      'http_request': { desc: 'Make HTTP request', category: 'System & Package' },
      'system_info': { desc: 'Get system information', category: 'System & Package' },
      'env_get': { desc: 'Get environment variable', category: 'System & Package' },
      'datetime': { desc: 'Get current date/time', category: 'System & Package' },
      'clipboard_read': { desc: 'Read clipboard', category: 'System & Package' },
      'clipboard_write': { desc: 'Write to clipboard', category: 'System & Package' },
    };
    
    // Filter out blocked tools and build categorized list
    const enabledTools = Object.entries(allTools)
      .filter(([name]) => !blocked.includes(name))
      .reduce((acc, [name, info]) => {
        if (!acc[info.category]) acc[info.category] = [];
        let marker = '';
        if (native.includes(name)) marker = ' ⭐ STRONG';
        if (learned.includes(name)) marker = ' ✓ TESTED';
        acc[info.category].push(`- ${name}: ${info.desc}${marker}`);
        return acc;
      }, {} as Record<string, string[]>);
    
    // Build tool list string
    let toolListStr = '';
    for (const [category, tools] of Object.entries(enabledTools)) {
      toolListStr += `\n### ${category}:\n${tools.join('\n')}`;
    }
    
    // Build capability guidance
    let capabilityGuidance = '';
    if (blocked.length > 0) {
      capabilityGuidance += `\n⚠️ BLOCKED (do not use): ${blocked.join(', ')}`;
    }

    const basePrompt = `# Intent Classifier

You classify user messages into tool calls. Output ONLY ONE line of valid JSON.

## AVAILABLE TOOLS (for ${modelId || 'this model'}):
${toolListStr}

## DECISION PROCESS:

STEP 1: Greeting? ("hi", "hello", "thanks") → respond
STEP 2: Git question? → git_status/git_diff/git_log/git_branch
STEP 3: Package/npm question? → npm_scripts/npm_outdated
STEP 4: Find symbol/caller? → find_symbol/get_callers
STEP 5: Exact file path given? → read_file
STEP 6: List directory? → list_directory
STEP 7: EVERYTHING ELSE → rag_query (this is your DEFAULT)

## EXAMPLES:

### rag_query (MOST COMMON):
"what does this project do" → {"action":"call_tool","tool":"rag_query","parameters":{"query":"project purpose and features"}}
"how does streaming work" → {"action":"call_tool","tool":"rag_query","parameters":{"query":"streaming implementation"}}
"why isn't it working" → {"action":"call_tool","tool":"rag_query","parameters":{"query":"common issues"}}
"explain the middleware" → {"action":"call_tool","tool":"rag_query","parameters":{"query":"middleware architecture"}}
"where is auth" → {"action":"call_tool","tool":"rag_query","parameters":{"query":"authentication location"}}

### git tools:
"what changed" → {"action":"call_tool","tool":"git_status","parameters":{}}
"show diff" → {"action":"call_tool","tool":"git_diff","parameters":{}}
"recent commits" → {"action":"call_tool","tool":"git_log","parameters":{}}
"which branches" → {"action":"call_tool","tool":"git_branch","parameters":{}}

### find/analyze:
"find UserService" → {"action":"call_tool","tool":"find_symbol","parameters":{"symbol":"UserService"}}
"who calls handleAuth" → {"action":"call_tool","tool":"get_callers","parameters":{"symbol":"handleAuth"}}
"dependencies of server" → {"action":"call_tool","tool":"get_dependencies","parameters":{"file":"server/package.json"}}

### npm/package:
"npm scripts" → {"action":"call_tool","tool":"npm_scripts","parameters":{}}
"outdated packages" → {"action":"call_tool","tool":"npm_outdated","parameters":{}}

### files:
"read package.json" → {"action":"call_tool","tool":"read_file","parameters":{"path":"package.json"}}
"list src folder" → {"action":"call_tool","tool":"list_directory","parameters":{"path":"src"}}

### respond (ONLY greetings):
"hi" → {"action":"respond","response":"Hello! How can I help?"}

## CRITICAL RULES:
1. NEVER guess or make up information - use rag_query
2. NEVER use "respond" for technical questions
3. When uncertain → rag_query
4. Output ONLY JSON
${capabilityGuidance}${prostheticSection}
JSON:`;

    return basePrompt;
  }

  /**
   * Build system prompt for Executor Model (tool execution)
   * Automatically injects prosthetics from the prosthetic-store if available
   */
  private buildExecutorModelPrompt(enabledTools: string[]): string {
    const modelId = this.config?.executorModelId || '';
    
    // Check for prosthetic prompt for executor model
    let prostheticGuidance = '';
    const prosthetic = prostheticStore.getPrompt(modelId);
    if (prosthetic) {
      console.log(`[IntentRouter] Injecting executor prosthetic (Level ${prosthetic.level}) for ${modelId}`);
      prostheticGuidance = prosthetic.prompt;
    }
    
    // Also check model capabilities
    if (this.executorProfile) {
      const blocked = this.executorProfile.blockedCapabilities || [];
      if (blocked.length > 0) {
        prostheticGuidance += `\nAVOID calling these tools (known issues): ${blocked.join(', ')}`;
      }
    }
    
    const customRules = [
      'Read the intent JSON and call the specified tool',
      'Use the exact parameters from the intent',
      'Never output text - only tool calls'
    ];
    
    if (prostheticGuidance) {
      customRules.push(prostheticGuidance);
    }
    
    return buildSystemPrompt({
      enabledTools,
      customHeader: `You are a tool execution assistant. Your job is to translate intent into exact tool calls.

IMPORTANT: 
- You MUST call the tool specified in the intent
- Follow the schema exactly
- Do not reason or explain - just execute
- Output tool calls only, no text`,
      customRules,
      includeRiskWarnings: false
    });
  }

  /**
   * Known tool call wrapper patterns - extensible list
   * Each pattern has a regex to match and extract the JSON, and a name for logging
   */
  private static readonly TOOL_CALL_PATTERNS: Array<{ name: string; regex: RegExp; jsonGroup: number }> = [
    // Qwen format: <tool_call>{"name": "...", "arguments": {...}}</tool_call>
    { name: 'tool_call', regex: /<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/i, jsonGroup: 1 },
    // Gemma tools format: [TOOL_REQUEST]{"name": "...", "arguments": {...}}[END_TOOL_RESULT]
    { name: 'TOOL_REQUEST', regex: /\[TOOL_REQUEST\]\s*(\{[\s\S]*?\})\s*\[END_TOOL_RESULT\]/i, jsonGroup: 1 },
    // Function call format: <function_call>{"name": "...", "arguments": {...}}</function_call>
    { name: 'function_call', regex: /<function_call>\s*(\{[\s\S]*?\})\s*<\/function_call>/i, jsonGroup: 1 },
    // Pipe format: <|tool_call|>{"name": "...", "arguments": {...}}<|/tool_call|>
    { name: 'pipe_tool_call', regex: /<\|tool_call\|>\s*(\{[\s\S]*?\})\s*<\|\/tool_call\|>/i, jsonGroup: 1 },
    // Bracket format: [[tool_call]]{"name": "...", "arguments": {...}}[[/tool_call]]
    { name: 'bracket_tool_call', regex: /\[\[tool_call\]\]\s*(\{[\s\S]*?\})\s*\[\[\/tool_call\]\]/i, jsonGroup: 1 },
    // Action format: <action>{"name": "...", "arguments": {...}}</action>
    { name: 'action', regex: /<action>\s*(\{[\s\S]*?\})\s*<\/action>/i, jsonGroup: 1 },
    // FUNCTION_CALL format: FUNCTION_CALL: {"name": "...", "arguments": {...}}
    { name: 'FUNCTION_CALL', regex: /FUNCTION_CALL:\s*(\{[\s\S]*?\})/i, jsonGroup: 1 },
    // Tool format: <tool>{"name": "...", "arguments": {...}}</tool>
    { name: 'tool', regex: /<tool>\s*(\{[\s\S]*?\})\s*<\/tool>/i, jsonGroup: 1 },
    // Start/end markers: [START_TOOL_CALL]{"name": "...", "arguments": {...}}[END_TOOL_CALL]
    { name: 'START_TOOL_CALL', regex: /\[START_TOOL_CALL\]\s*(\{[\s\S]*?\})\s*\[END_TOOL_CALL\]/i, jsonGroup: 1 },
    // Hermes format: <tool_call>name(args)</tool_call> - handled separately
    { name: 'hermes_tool', regex: /<tool_call>\s*(\w+)\s*\(([\s\S]*?)\)\s*<\/tool_call>/i, jsonGroup: 0 },
  ];

  /**
   * Clean all known tool call wrapper formats from content
   */
  private cleanToolCallFormats(content: string): string {
    let cleaned = content;
    
    // Remove all known wrapper patterns
    for (const pattern of IntentRouter.TOOL_CALL_PATTERNS) {
      cleaned = cleaned.replace(new RegExp(pattern.regex.source, 'gi'), '');
    }
    
    // Also remove any remaining common patterns
    cleaned = cleaned
      .replace(/<[a-z_]+>\s*\{[\s\S]*?\}\s*<\/[a-z_]+>/gi, '') // Generic XML-style wrappers
      .replace(/\[[A-Z_]+\]\s*\{[\s\S]*?\}\s*\[\/[A-Z_]+\]/gi, '') // Generic bracket wrappers
      .replace(/\[[A-Z_]+\]\s*\{[\s\S]*?\}\s*\[[A-Z_]+\]/gi, '') // Paired bracket markers
      .trim();
    
    return cleaned;
  }

  /**
   * Try to extract a tool call from JSON object
   * Handles various field name conventions
   */
  private extractToolFromJson(json: any): { tool: string; parameters: Record<string, any> } | null {
    // Try different field name conventions for the tool name
    const toolName = json.name || json.tool || json.function || json.tool_name || json.function_name;
    if (!toolName) return null;
    
    // Try different field name conventions for parameters
    const params = json.arguments || json.parameters || json.params || json.args || json.input || {};
    
    // Handle string arguments (some models output JSON as string)
    const parsedParams = typeof params === 'string' ? JSON.parse(params) : params;
    
    return { tool: toolName, parameters: parsedParams };
  }

  /**
   * Parse intent from Main Model response
   * Robust parser that handles ANY tool call format
   */
  private parseIntent(response: any): IntentSchema {
    let content = response?.choices?.[0]?.message?.content || '';
    
    // Remove thinking blocks (DeepSeek R1, Claude, etc.)
    content = content
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
      .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
      .trim();
    
    // 1. Try all known wrapper patterns
    for (const pattern of IntentRouter.TOOL_CALL_PATTERNS) {
      const match = content.match(pattern.regex);
      if (match) {
        try {
          // Special handling for function-call style (name(args))
          if (pattern.name === 'hermes_tool' && match[1] && match[2]) {
            const toolName = match[1];
            let params = {};
            try {
              // Try to parse args as JSON
              params = JSON.parse(match[2]);
            } catch {
              // Try as key=value pairs
              params = { input: match[2] };
            }
            console.log(`[IntentRouter] Parsed ${pattern.name} format:`, toolName);
            return {
              schemaVersion: '1.0',
              action: 'call_tool',
              tool: toolName,
              parameters: params,
              metadata: { reasoning: `Parsed from ${pattern.name} format` }
            };
          }
          
          // Standard JSON extraction
          const jsonStr = match[pattern.jsonGroup];
          const toolJson = JSON.parse(jsonStr);
          const extracted = this.extractToolFromJson(toolJson);
          
          if (extracted) {
            console.log(`[IntentRouter] Parsed ${pattern.name} format:`, extracted.tool);
            const textBefore = content.split(match[0])[0].trim();
            return {
              schemaVersion: '1.0',
              action: 'call_tool',
              tool: extracted.tool,
              parameters: extracted.parameters,
              metadata: { reasoning: textBefore || `Parsed from ${pattern.name} format` }
            };
          }
        } catch (e) {
          console.log(`[IntentRouter] Failed to parse ${pattern.name} format:`, e);
        }
      }
    }
    
    // 2. Try to find any JSON with tool-like structure
    try {
      // Match all JSON objects in content
      const jsonMatches = content.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g);
      if (jsonMatches) {
        for (const match of jsonMatches) {
          try {
            const parsed = JSON.parse(match);
            
            // Check for our intent format first (action field)
            if (parsed.action) {
              console.log('[IntentRouter] Parsed intent:', parsed.action, parsed.tool || '');
              return {
                schemaVersion: '1.0',
                action: parsed.action,
                tool: parsed.tool,
                parameters: parsed.parameters,
                metadata: {
                  response: parsed.response,
                  question: parsed.question,
                  reasoning: parsed.reasoning
                }
              };
            }
            
            // Check for tool call format (name + arguments)
            const extracted = this.extractToolFromJson(parsed);
            if (extracted) {
              console.log('[IntentRouter] Parsed raw JSON tool call:', extracted.tool);
              const textBefore = content.split(match)[0].trim();
              return {
                schemaVersion: '1.0',
                action: 'call_tool',
                tool: extracted.tool,
                parameters: extracted.parameters,
                metadata: { reasoning: textBefore || 'Parsed from raw JSON' }
              };
            }
          } catch (err: any) {
            // JSON parse failed for this match, try next
            console.log('[IntentRouter] JSON parse failed for match, trying next:', err?.message?.slice(0, 50));
          }
        }
      }
    } catch (err: any) {
      // All JSON parsing attempts failed, will use fallback
      console.log('[IntentRouter] All JSON parsing failed:', err?.message?.slice(0, 50));
    }
    
    // 3. Natural language response - clean up any unrecognized tool formats
    console.log('[IntentRouter] No tool format detected, treating as natural response');
    const cleanContent = this.cleanToolCallFormats(content);
    
    // If after cleanup we have meaningful content, use it
    if (cleanContent && cleanContent.length > 0) {
      return {
        schemaVersion: '1.0',
        action: 'respond',
        metadata: {
          response: cleanContent,
          reasoning: 'Model responded naturally'
        }
      };
    }

    // Default to respond if we can't parse intent
    return {
      schemaVersion: '1.0',
      action: 'respond',
      metadata: {
        reasoning: 'Could not parse intent, defaulting to text response'
      }
    };
  }

  /**
   * Call a model with timeout
   */
  private async callModel(
    modelId: string,
    messages: any[],
    tools?: any[],
    timeout: number = 30000
  ): Promise<any> {
    if (!this.config) {
      throw new Error('IntentRouter not configured');
    }

    let url: string;
    let headers: Record<string, string> = { 'Content-Type': 'application/json' };
    let body: any = {
      model: modelId,
      messages,
      temperature: 0
    };

    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }

    switch (this.config.provider) {
      case 'lmstudio':
        url = `${this.config.settings.lmstudioUrl}/v1/chat/completions`;
        break;

      case 'openai':
        url = 'https://api.openai.com/v1/chat/completions';
        headers['Authorization'] = `Bearer ${this.config.settings.openaiApiKey}`;
        break;

      case 'azure':
        const { azureResourceName, azureDeploymentName, azureApiKey, azureApiVersion } = this.config.settings;
        url = `https://${azureResourceName}.openai.azure.com/openai/deployments/${azureDeploymentName}/chat/completions?api-version=${azureApiVersion || '2024-02-01'}`;
        headers['api-key'] = azureApiKey!;
        break;

      case 'openrouter':
        url = 'https://openrouter.ai/api/v1/chat/completions';
        headers['Authorization'] = `Bearer ${this.config.settings.openrouterApiKey}`;
        headers['HTTP-Referer'] = 'http://localhost:5173'; // Required by OpenRouter
        headers['X-Title'] = 'Summy AI Platform'; // Required by OpenRouter
        break;

      default:
        throw new Error(`Unknown provider: ${this.config.provider}`);
    }

    const response = await axios.post(url, body, {
      headers,
      timeout
    });

    return response.data;
  }

  /**
   * Check if dual-model routing is available
   */
  isDualModelAvailable(): boolean {
    return !!(this.config?.enableDualModel && this.mainProfile && this.executorProfile);
  }

  /**
   * Get current configuration
   */
  getConfig(): RouterConfig | null {
    return this.config;
  }

  /**
   * Call Main model only to get intent (without calling Executor)
   * Useful for caching intents across multiple Executor tests
   */
  async getMainIntent(
    messages: any[],
    timeout?: number
  ): Promise<{ intent: IntentSchema; mainResponse: any; latencyMs: number }> {
    if (!this.config) {
      throw new Error('IntentRouter not configured');
    }

    const mainStartTime = Date.now();
    const mainSystemPrompt = this.buildMainModelPrompt();
    const mainMessages = [
      { role: 'system', content: mainSystemPrompt },
      ...messages
    ];

    const mainTimeout = timeout || Math.min(this.config.timeout, 30000);
    const mainResponse = await this.callModel(
      this.config.mainModelId!,
      mainMessages,
      undefined, // No tools for main model
      mainTimeout
    );

    const latencyMs = Date.now() - mainStartTime;
    const intent = this.parseIntent(mainResponse);

    return { intent, mainResponse, latencyMs };
  }

  /**
   * Call Executor model with a pre-existing intent
   * Useful for testing multiple Executors with the same cached intent
   */
  async executeWithIntent(
    intent: IntentSchema,
    tools?: any[],
    timeout?: number
  ): Promise<{ executorResponse: any; toolCalls: any[]; latencyMs: number }> {
    if (!this.config) {
      throw new Error('IntentRouter not configured');
    }

    // If no tool call needed, return empty result
    if (intent.action === 'respond' || intent.action === 'ask_clarification') {
      return { executorResponse: null, toolCalls: [], latencyMs: 0 };
    }

    const executorStartTime = Date.now();

    // Use tools passed in, or from executor profile
    const enabledTools = this.executorProfile?.enabledTools?.length 
      ? this.executorProfile.enabledTools 
      : (tools?.map(t => t.function?.name).filter(Boolean) as string[]) || [];
    
    const executorTools = tools && tools.length > 0 
      ? tools 
      : getToolSchemas(enabledTools);

    const executorSystemPrompt = this.buildExecutorModelPrompt(enabledTools);
    const executorMessages = [
      { role: 'system', content: executorSystemPrompt },
      { role: 'user', content: `Execute this intent:\n${JSON.stringify(intent, null, 2)}` }
    ];

    const executorResponse = await this.callModel(
      this.config.executorModelId!,
      executorMessages,
      executorTools,
      timeout || this.config.timeout
    );

    const latencyMs = Date.now() - executorStartTime;
    const toolCalls = executorResponse?.choices?.[0]?.message?.tool_calls || [];

    return { executorResponse, toolCalls, latencyMs };
  }

  /**
   * Log a failure to the failure log service
   * Called by proxy/cognitive-engine when a tool call fails
   */
  logFailure(params: {
    modelId: string;
    executorModelId?: string;
    category: FailureCategory;
    tool?: string;
    error: string;
    query: string;
    expectedBehavior?: string;
    actualBehavior?: string;
    toolCallAttempted?: string;
    conversationLength?: number;
  }): void {
    try {
      const entry = failureLog.logFailure({
        modelId: params.modelId,
        executorModelId: params.executorModelId,
        category: params.category,
        tool: params.tool,
        error: params.error,
        query: params.query,
        expectedBehavior: params.expectedBehavior,
        actualBehavior: params.actualBehavior,
        toolCallAttempted: params.toolCallAttempted,
        conversationLength: params.conversationLength
      });

      // Notify the observer of the new failure
      failureObserver.onFailureLogged(entry);
    } catch (error) {
      console.error('[IntentRouter] Failed to log failure:', error);
    }
  }

  /**
   * Report a routing failure (intent parsing, tool call format, etc.)
   */
  reportRoutingFailure(params: {
    query: string;
    error: string;
    intent?: IntentSchema;
    phase?: 'planning' | 'execution';
  }): void {
    if (!this.config) return;

    let category: FailureCategory = 'unknown';
    const error = params.error.toLowerCase();

    if (error.includes('tool') || error.includes('format')) {
      category = 'tool';
    } else if (error.includes('intent') || error.includes('parse')) {
      category = 'intent';
    } else if (error.includes('rag')) {
      category = 'rag';
    } else if (error.includes('reasoning') || error.includes('multi')) {
      category = 'reasoning';
    }

    this.logFailure({
      modelId: params.phase === 'execution' 
        ? (this.config.executorModelId || this.config.mainModelId || 'unknown')
        : (this.config.mainModelId || 'unknown'),
      executorModelId: this.config.executorModelId,
      category,
      tool: params.intent?.tool,
      error: params.error,
      query: params.query,
      expectedBehavior: params.intent?.tool ? `Call ${params.intent.tool}` : undefined,
      actualBehavior: params.phase === 'execution' ? 'Tool call failed' : 'Intent parsing failed',
      toolCallAttempted: params.intent ? JSON.stringify(params.intent) : undefined
    });
  }

  /**
   * Check if a capability is blocked for the current main model
   */
  async isCapabilityBlocked(capability: string): Promise<boolean> {
    if (!this.config?.mainModelId) return false;
    return capabilities.isCapabilityBlocked(this.config.mainModelId, capability);
  }

  /**
   * Get fallback model for a blocked capability
   */
  async getFallbackForCapability(capability: string): Promise<string | null> {
    if (!this.config?.mainModelId) return null;
    return capabilities.getFallbackModel(this.config.mainModelId, capability);
  }
}

// Export singleton
export const intentRouter = new IntentRouter();

