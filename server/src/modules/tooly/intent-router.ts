import { capabilities, ModelProfile } from './capabilities.js';
import { getToolSchemas, buildSystemPrompt } from './tool-prompts.js';
import { failureLog } from '../../services/failure-log.js';
import { failureObserver } from '../../services/failure-observer.js';
import { prostheticStore } from './learning/prosthetic-store.js';
import { IntentSchema, RouterConfig, RoutingPhase, RoutingResult } from './types.js';
import { IntentParser } from './utils/intent-parser.js';
import { ModelProvider } from './providers/ModelProvider.js';

class IntentRouter {
  private config: RouterConfig | null = null;
  private mainProfile: ModelProfile | null = null;
  private executorProfile: ModelProfile | null = null;

  async configure(config: RouterConfig): Promise<void> {
    this.config = config;
    if (config.enableDualModel) {
      if (config.mainModelId) {
        this.mainProfile = await capabilities.getProfile(config.mainModelId) || this.createPlaceholderProfile(config.mainModelId);
      }
      if (config.executorModelId) {
        this.executorProfile = await capabilities.getProfile(config.executorModelId) || this.createPlaceholderProfile(config.executorModelId);
      }
    }
  }

  private createPlaceholderProfile(modelId: string): ModelProfile {
    return { modelId, displayName: modelId, provider: 'lmstudio', testedAt: new Date().toISOString(), testVersion: 1, score: 50, toolFormat: 'openai_tools', capabilities: {}, enabledTools: [] };
  }

  async route(messages: any[], tools?: any[]): Promise<RoutingResult> {
    if (!this.config) throw new Error('IntentRouter not configured');
    
    if (!this.config.enableDualModel || !this.mainProfile || !this.executorProfile) {
      const modelId = this.config.mainModelId || this.config.executorModelId || '';
      const start = Date.now();
      const response = await ModelProvider.call(this.config, modelId, messages, tools, this.config.timeout);
      return { mode: 'single', finalResponse: response, toolCalls: response?.choices?.[0]?.message?.tool_calls, latency: { total: Date.now() - start }, phases: [{ phase: 'response', systemPrompt: messages.find(m => m.role === 'system')?.content || '', model: modelId, latencyMs: Date.now() - start }] };
    }

    const phases: RoutingPhase[] = [];
    const mainStart = Date.now();
    const mainPrompt = this.buildMainModelPrompt();
    const mainResponse = await ModelProvider.call(this.config, this.config.mainModelId!, [{ role: 'system', content: mainPrompt }, ...messages], undefined, 30000);
    const mainLatency = Date.now() - mainStart;

    phases.push({ phase: 'planning', systemPrompt: mainPrompt, model: this.config.mainModelId!, latencyMs: mainLatency, reasoning: mainResponse?.choices?.[0]?.message?.content || '' });
    const intent = IntentParser.parseIntent(mainResponse);

    if (intent.action === 'respond' || intent.action === 'ask_clarification') {
      let text = intent.metadata?.response || intent.metadata?.question || '';
      if (!text) {
        const res = await ModelProvider.call(this.config, this.config.mainModelId!, [{ role: 'system', content: 'You are a helpful assistant.' }, ...messages], undefined, 30000);
        text = res?.choices?.[0]?.message?.content || 'I understand.';
      }
      return { mode: 'dual', mainResponse, finalResponse: { id: mainResponse.id, choices: [{ message: { role: 'assistant', content: text, tool_calls: [] } }] }, latency: { main: mainLatency, total: Date.now() - mainStart }, phases, intent };
    }

    const execStart = Date.now();
    const enabledTools = this.executorProfile.enabledTools?.length ? this.executorProfile.enabledTools : (tools?.map(t => t.function?.name).filter(Boolean) as string[]) || [];
    const execTools = tools?.length ? tools : getToolSchemas(enabledTools);
    const execPrompt = this.buildExecutorModelPrompt(enabledTools);
    const execResponse = await ModelProvider.call(this.config, this.config.executorModelId!, [{ role: 'system', content: execPrompt }, { role: 'user', content: `Execute: ${JSON.stringify(intent)}` }], execTools, this.config.timeout);
    
    phases.push({ phase: 'execution', systemPrompt: execPrompt, model: this.config.executorModelId!, latencyMs: Date.now() - execStart });

    return { mode: 'dual', mainResponse, executorResponse: execResponse, finalResponse: execResponse, toolCalls: execResponse?.choices?.[0]?.message?.tool_calls, latency: { main: mainLatency, executor: Date.now() - execStart, total: Date.now() - mainStart }, phases, intent };
  }

  private buildMainModelPrompt(): string {
    const modelId = this.config?.mainModelId || '';
    const prosthetic = prostheticStore.getPrompt(modelId);
    const prostheticSection = prosthetic ? `

## MODEL-SPECIFIC GUIDANCE

${prosthetic.prompt}
` : '';
    return `# Intent Classifier
Output ONLY valid JSON.
${prostheticSection}JSON:`;
  }

  private buildExecutorModelPrompt(enabledTools: string[]): string {
    const modelId = this.config?.executorModelId || '';
    const prosthetic = prostheticStore.getPrompt(modelId);
    return buildSystemPrompt({ enabledTools, customHeader: 'You are a tool execution assistant.', customRules: prosthetic ? [prosthetic.prompt] : [], includeRiskWarnings: false });
  }

  async getMainIntent(messages: any[], timeout?: number): Promise<{ intent: IntentSchema; mainResponse: any; latencyMs: number }> {
    if (!this.config) throw new Error('Not configured');
    const start = Date.now();
    const prompt = this.buildMainModelPrompt();
    const res = await ModelProvider.call(this.config, this.config.mainModelId!, [{ role: 'system', content: prompt }, ...messages], undefined, timeout || 30000);
    return { intent: IntentParser.parseIntent(res), mainResponse: res, latencyMs: Date.now() - start };
  }

  async executeWithIntent(intent: IntentSchema, tools?: any[], timeout?: number): Promise<{ executorResponse: any; toolCalls: any[]; latencyMs: number }> {
    if (!this.config) throw new Error('Not configured');
    if (intent.action === 'respond' || intent.action === 'ask_clarification') return { executorResponse: null, toolCalls: [], latencyMs: 0 };
    const start = Date.now();
    const enabled = this.executorProfile?.enabledTools || [];
    const res = await ModelProvider.call(this.config, this.config.executorModelId!, [{ role: 'system', content: this.buildExecutorModelPrompt(enabled) }, { role: 'user', content: `Execute: ${JSON.stringify(intent)}` }], tools || getToolSchemas(enabled), timeout || this.config.timeout);
    return { executorResponse: res, toolCalls: res?.choices?.[0]?.message?.tool_calls || [], latencyMs: Date.now() - start };
  }

  logFailure(params: any): void {
    try {
      const entry = failureLog.logFailure(params);
      failureObserver.onFailureLogged(entry);
    } catch (error) {
      console.error('[IntentRouter] Log failure error:', error);
    }
  }
}

export const intentRouter = new IntentRouter();