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
  provider: 'lmstudio' | 'openai' | 'azure';
  settings: {
    lmstudioUrl?: string;
    openaiApiKey?: string;
    azureResourceName?: string;
    azureApiKey?: string;
    azureDeploymentName?: string;
    azureApiVersion?: string;
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
  async autoSelectModels(provider: 'lmstudio' | 'openai' | 'azure'): Promise<{ mainModel?: string; executorModel?: string }> {
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
          total: Date.now() - startTime
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

    // If no tool call needed, return main response directly
    if (intent.action === 'respond' || intent.action === 'ask_clarification') {
      return {
        mode: 'dual',
        mainResponse,
        finalResponse: mainResponse,
        latency: {
          main: mainLatency,
          total: Date.now() - startTime
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
        total: Date.now() - startTime
      },
      phases,
      intent
    };
  }

  /**
   * Build system prompt for Main Model (reasoning, no tools)
   */
  private buildMainModelPrompt(): string {
    return `Output ONLY a JSON intent. No thinking, no explanations.

Format:
{"action":"call_tool","tool":"TOOL_NAME","parameters":{...}}
or
{"action":"respond"}

Common tools: read_file, write_file, edit_file, rag_query, git_status, shell_exec

Example: User says "read config.json" → {"action":"call_tool","tool":"read_file","parameters":{"filepath":"config.json"}}

Output the JSON now:`;
  }

  /**
   * Build system prompt for Executor Model (tool execution)
   */
  private buildExecutorModelPrompt(enabledTools: string[]): string {
    return buildSystemPrompt({
      enabledTools,
      customHeader: `You are a tool execution assistant. Your job is to translate intent into exact tool calls.

IMPORTANT: 
- You MUST call the tool specified in the intent
- Follow the schema exactly
- Do not reason or explain - just execute
- Output tool calls only, no text`,
      customRules: [
        'Read the intent JSON and call the specified tool',
        'Use the exact parameters from the intent',
        'Never output text - only tool calls'
      ],
      includeRiskWarnings: false
    });
  }

  /**
   * Parse intent from Main Model response
   */
  private parseIntent(response: any): IntentSchema {
    let content = response?.choices?.[0]?.message?.content || '';
    
    // Remove <think>...</think> blocks (DeepSeek R1 reasoning)
    content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    
    try {
      // Try to extract JSON from the cleaned response
      // Use non-greedy match and find all potential JSON objects
      const jsonMatches = content.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g);
      if (jsonMatches) {
        // Try each match until we find valid intent JSON
        for (const match of jsonMatches) {
          try {
            const parsed = JSON.parse(match);
            if (parsed.action) {
              console.log('[IntentRouter] Parsed intent:', parsed.action, parsed.tool || '');
              return parsed;
            }
          } catch {
            // Try next match
          }
        }
      }
      
      // Fallback: try parsing the entire content as JSON
      const parsed = JSON.parse(content);
      if (parsed.action) {
        return parsed;
      }
    } catch {
      // Failed to parse JSON
      console.log('[IntentRouter] Failed to parse intent from:', content.slice(0, 200));
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
}

// Export singleton
export const intentRouter = new IntentRouter();

