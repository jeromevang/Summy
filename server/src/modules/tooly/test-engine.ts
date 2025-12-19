/**
 * Test Engine
 * Runs tool capability tests against models and scores results
 */

import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { LMStudioClient } from '@lmstudio/sdk';
import { capabilities, ModelProfile } from './capabilities.js';
import { getToolSchemas } from './tool-prompts.js';
import { notifications } from '../../services/notifications.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================
// TYPES
// ============================================================

export interface TestDefinition {
  id: string;
  tool: string;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  prompt: string;
  setupFiles?: Record<string, string>;
  expected: {
    tool: string;
    params: Record<string, ParamCondition>;
  };
}

export interface ParamCondition {
  equals?: any;
  contains?: string;
  oneOf?: any[];
  exists?: boolean;
}

export interface TestResult {
  testId: string;
  tool: string;
  passed: boolean;
  score: number;
  latency: number;
  checks: CheckResult[];
  response?: any;
  error?: string;
}

export interface CheckResult {
  name: string;
  passed: boolean;
  expected?: any;
  actual?: any;
}

export interface TestRunResult {
  modelId: string;
  startedAt: string;
  completedAt: string;
  totalTests: number;
  passed: number;
  failed: number;
  overallScore: number;
  results: TestResult[];
}

export type TestMode = 'quick' | 'keep_on_success' | 'manual';

export interface TestOptions {
  mode?: TestMode;
  unloadOthersBefore?: boolean;  // Default: true for LM Studio
  unloadAfterTest?: boolean;     // Default: false
  unloadOnlyOnFail?: boolean;    // Default: false (used with keep_on_success)
  contextLength?: number;        // Context length for model loading (default: 8192)
}

// ============================================================
// TEST DEFINITIONS
// ============================================================

export const TEST_DEFINITIONS: TestDefinition[] = [
  // ========== FILE OPERATIONS ==========
  {
    id: 'file_read_basic',
    tool: 'file_read',
    category: 'file_operations',
    difficulty: 'easy',
    prompt: 'Read the contents of the file named "config.json" in the current directory.',
    setupFiles: { 'config.json': '{"port": 3000, "debug": true}' },
    expected: {
      tool: 'file_read',
      params: { path: { contains: 'config.json' } }
    }
  },
  {
    id: 'file_read_nested',
    tool: 'file_read',
    category: 'file_operations',
    difficulty: 'medium',
    prompt: 'I need to see what\'s in the file located at src/utils/helpers.ts',
    setupFiles: { 'src/utils/helpers.ts': 'export const helper = () => {}' },
    expected: {
      tool: 'file_read',
      params: { path: { contains: 'helpers.ts' } }
    }
  },
  {
    id: 'file_write_basic',
    tool: 'file_write',
    category: 'file_operations',
    difficulty: 'easy',
    prompt: 'Create a new file called "hello.js" with the content: console.log("Hello World")',
    expected: {
      tool: 'file_write',
      params: {
        path: { contains: 'hello.js' },
        content: { contains: 'console.log' }
      }
    }
  },
  {
    id: 'file_patch_basic',
    tool: 'file_patch',
    category: 'file_operations',
    difficulty: 'medium',
    prompt: 'In the file "app.js", change the port number from 3000 to 8080',
    setupFiles: { 'app.js': 'const port = 3000;\napp.listen(port);' },
    expected: {
      tool: 'file_patch',
      params: {
        path: { contains: 'app.js' },
        find: { contains: '3000' },
        replace: { contains: '8080' }
      }
    }
  },
  {
    id: 'file_list_basic',
    tool: 'file_list',
    category: 'file_operations',
    difficulty: 'easy',
    prompt: 'Show me all files in the src directory',
    expected: {
      tool: 'file_list',
      params: { folder: { oneOf: ['src', 'src/', './src', undefined] } }
    }
  },
  {
    id: 'file_search_basic',
    tool: 'file_search',
    category: 'file_operations',
    difficulty: 'medium',
    prompt: 'Search for all occurrences of "TODO" in the project files',
    expected: {
      tool: 'file_search',
      params: { query: { contains: 'TODO' } }
    }
  },

  // ========== GIT OPERATIONS ==========
  {
    id: 'git_status_basic',
    tool: 'git_status',
    category: 'git_operations',
    difficulty: 'easy',
    prompt: 'Check the current git status of this repository',
    expected: {
      tool: 'git_status',
      params: {}
    }
  },
  {
    id: 'git_diff_basic',
    tool: 'git_diff',
    category: 'git_operations',
    difficulty: 'easy',
    prompt: 'Show me the git diff for the file "index.js"',
    expected: {
      tool: 'git_diff',
      params: { file: { contains: 'index.js' } }
    }
  },
  {
    id: 'git_log_basic',
    tool: 'git_log',
    category: 'git_operations',
    difficulty: 'easy',
    prompt: 'Show me the last 5 commits',
    expected: {
      tool: 'git_log',
      params: { count: { oneOf: [5, '5', undefined] } }
    }
  },
  {
    id: 'git_commit_basic',
    tool: 'git_commit',
    category: 'git_operations',
    difficulty: 'medium',
    prompt: 'Commit all changes with the message "Fix login bug"',
    expected: {
      tool: 'git_commit',
      params: { message: { contains: 'Fix login bug' } }
    }
  },
  {
    id: 'git_branch_create_basic',
    tool: 'git_branch_create',
    category: 'git_operations',
    difficulty: 'medium',
    prompt: 'Create a new branch called "feature/user-auth"',
    expected: {
      tool: 'git_branch_create',
      params: { name: { contains: 'user-auth' } }
    }
  },

  // ========== NPM OPERATIONS ==========
  {
    id: 'npm_run_basic',
    tool: 'npm_run',
    category: 'npm_operations',
    difficulty: 'easy',
    prompt: 'Run the "build" npm script',
    expected: {
      tool: 'npm_run',
      params: { script: { oneOf: ['build', '"build"'] } }
    }
  },
  {
    id: 'npm_install_basic',
    tool: 'npm_install',
    category: 'npm_operations',
    difficulty: 'medium',
    prompt: 'Install the lodash package',
    expected: {
      tool: 'npm_install',
      params: { package: { contains: 'lodash' } }
    }
  },

  // ========== HTTP/BROWSER ==========
  {
    id: 'http_request_get',
    tool: 'http_request',
    category: 'http_operations',
    difficulty: 'easy',
    prompt: 'Fetch the data from https://api.example.com/users',
    expected: {
      tool: 'http_request',
      params: {
        url: { contains: 'api.example.com/users' },
        method: { oneOf: ['GET', 'get', undefined] }
      }
    }
  },
  {
    id: 'browser_navigate_basic',
    tool: 'browser_navigate',
    category: 'browser_operations',
    difficulty: 'medium',
    prompt: 'Open the website https://github.com and get the page title',
    expected: {
      tool: 'browser_navigate',
      params: {
        url: { contains: 'github.com' }
      }
    }
  }
];

// ============================================================
// TEST ENGINE
// ============================================================

class TestEngine {
  private sandboxDir: string;

  constructor() {
    this.sandboxDir = path.join(__dirname, '../../../data/test-sandbox');
  }

  /**
   * Load a model in LM Studio, optionally unloading others first
   */
  private async loadLMStudioModel(modelId: string, unloadOthers: boolean = true, contextLength: number = 8192): Promise<void> {
    const client = new LMStudioClient();

    try {
      const loadedModels = await client.llm.listLoaded();
      const loadedIds = loadedModels.map(m => m.identifier);
      
      // Check if model is already loaded
      const isAlreadyLoaded = loadedIds.includes(modelId);
      
      if (isAlreadyLoaded) {
        console.log(`[TestEngine] Model ${modelId} is already loaded`);
        
        // Still unload others if requested
        if (unloadOthers) {
          for (const model of loadedModels) {
            if (model.identifier !== modelId) {
              await client.llm.unload(model.identifier);
              console.log(`[TestEngine] Unloaded ${model.identifier}`);
            }
          }
        }
        return; // Model already loaded, no need to load again
      }

      // Unload other models if requested
      if (unloadOthers) {
        for (const model of loadedModels) {
          await client.llm.unload(model.identifier);
          console.log(`[TestEngine] Unloaded ${model.identifier}`);
        }
      }
    } catch (error: any) {
      console.log(`[TestEngine] Could not list/unload models: ${error.message}`);
    }

    // Load the test model
    try {
      console.log(`[TestEngine] Loading model ${modelId} with context length ${contextLength}...`);
      await client.llm.load(modelId, {
        config: { contextLength }
      });
      console.log(`[TestEngine] Model ${modelId} loaded successfully`);
    } catch (error: any) {
      // Model might already be loaded
      if (!error.message.includes('already loaded')) {
        throw error;
      }
      console.log(`[TestEngine] Model ${modelId} was already loaded`);
    }
  }

  /**
   * Unload a model from LM Studio
   */
  private async unloadLMStudioModel(modelId: string): Promise<void> {
    const client = new LMStudioClient();
    try {
      await client.llm.unload(modelId);
    } catch (error: any) {
      // Model might not be loaded
      console.log(`[TestEngine] Could not unload ${modelId}: ${error.message}`);
    }
  }

  /**
   * Run all tests for a model
   */
  async runAllTests(
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
    options: TestOptions = {}
  ): Promise<TestRunResult> {
    const startedAt = new Date().toISOString();
    notifications.modelTestStarted(modelId);

    // Parse test mode options
    const mode = options.mode || 'manual';
    const unloadOthersBefore = options.unloadOthersBefore ?? (mode !== 'manual');
    const unloadAfterTest = options.unloadAfterTest ?? (mode === 'quick');
    const unloadOnlyOnFail = options.unloadOnlyOnFail ?? (mode === 'keep_on_success');
    
    // Get context length from options, model profile, or default
    let contextLength = options.contextLength || 8192;
    try {
      const profile = await capabilities.getProfile(modelId);
      if (profile?.contextLength) {
        contextLength = profile.contextLength;
        console.log(`[TestEngine] Using custom context length ${contextLength} from model profile`);
      }
    } catch {
      // Use default if profile not found
    }

    console.log(`[TestEngine] Starting tests for model: ${modelId} (mode: ${mode}, context: ${contextLength})`);

    // For LM Studio: load the model and optionally unload others
    if (provider === 'lmstudio' && unloadOthersBefore) {
      try {
        await this.loadLMStudioModel(modelId, true, contextLength);
        console.log(`[TestEngine] Loaded model ${modelId}, unloaded others`);
      } catch (error: any) {
        console.error(`[TestEngine] Failed to load model: ${error.message}`);
        // Continue anyway - model might already be loaded
      }
    }

    const results: TestResult[] = [];
    
    for (const test of TEST_DEFINITIONS) {
      try {
        const result = await this.runSingleTest(test, modelId, provider, settings);
        results.push(result);
        console.log(`[TestEngine] ${test.id}: ${result.passed ? '✅ PASS' : '❌ FAIL'} (${result.score}%)`);
      } catch (error: any) {
        results.push({
          testId: test.id,
          tool: test.tool,
          passed: false,
          score: 0,
          latency: 0,
          checks: [],
          error: error.message
        });
        console.error(`[TestEngine] ${test.id}: ❌ ERROR - ${error.message}`);
      }
    }

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    const overallScore = results.length > 0
      ? Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length)
      : 0;

    const runResult: TestRunResult = {
      modelId,
      startedAt,
      completedAt: new Date().toISOString(),
      totalTests: results.length,
      passed,
      failed,
      overallScore,
      results
    };

    // Update model profile
    await this.updateModelProfile(modelId, provider, runResult);

    // For LM Studio: optionally unload after test
    if (provider === 'lmstudio') {
      const shouldUnload = unloadAfterTest || (unloadOnlyOnFail && overallScore < 50);
      if (shouldUnload) {
        try {
          await this.unloadLMStudioModel(modelId);
          console.log(`[TestEngine] Unloaded model ${modelId} after test (score: ${overallScore}%)`);
        } catch (error: any) {
          console.error(`[TestEngine] Failed to unload model: ${error.message}`);
        }
      }
    }

    notifications.modelTestCompleted(modelId, overallScore);

    return runResult;
  }

  /**
   * Run a single test
   */
  async runSingleTest(
    test: TestDefinition,
    modelId: string,
    provider: 'lmstudio' | 'openai' | 'azure',
    settings: any
  ): Promise<TestResult> {
    const startTime = Date.now();

    // Setup sandbox if needed
    if (test.setupFiles) {
      await this.setupSandbox(test.setupFiles);
    }

    try {
      // Build request
      const messages = [
        { role: 'system', content: 'You are a helpful assistant with access to tools. Use tools when appropriate.' },
        { role: 'user', content: test.prompt }
      ];

      const tools = getToolSchemas([test.tool]);

      // Call LLM
      const response = await this.callLLM(modelId, provider, messages, tools, settings);
      const latency = Date.now() - startTime;

      // Evaluate response
      const { score, checks, passed } = this.evaluateResponse(response, test.expected);

      return {
        testId: test.id,
        tool: test.tool,
        passed,
        score,
        latency,
        checks,
        response
      };

    } finally {
      // Cleanup sandbox
      await this.cleanupSandbox();
    }
  }

  /**
   * Call LLM with tool schema
   */
  private async callLLM(
    modelId: string,
    provider: 'lmstudio' | 'openai' | 'azure',
    messages: any[],
    tools: any[],
    settings: any
  ): Promise<any> {
    let url: string;
    let headers: Record<string, string> = { 'Content-Type': 'application/json' };
    let body: any = {
      messages,
      tools,
      tool_choice: 'auto',
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
      timeout: 60000
    });

    return response.data;
  }

  /**
   * Evaluate LLM response against expected values
   */
  private evaluateResponse(
    response: any,
    expected: TestDefinition['expected']
  ): { score: number; checks: CheckResult[]; passed: boolean } {
    const checks: CheckResult[] = [];
    let score = 0;

    // Check 1: Has tool_calls (20 points)
    const toolCalls = response?.choices?.[0]?.message?.tool_calls;
    const hasToolCalls = Array.isArray(toolCalls) && toolCalls.length > 0;
    checks.push({
      name: 'has_tool_calls',
      passed: hasToolCalls,
      expected: 'tool_calls array',
      actual: hasToolCalls ? `${toolCalls.length} tool calls` : 'none'
    });
    if (hasToolCalls) score += 20;

    if (!hasToolCalls) {
      return { score, checks, passed: false };
    }

    const toolCall = toolCalls[0];
    const functionName = toolCall?.function?.name;
    let args: any = {};

    try {
      args = JSON.parse(toolCall?.function?.arguments || '{}');
    } catch {
      // Invalid JSON
    }

    // Check 2: Correct tool name (25 points)
    const correctTool = functionName === expected.tool;
    checks.push({
      name: 'correct_tool',
      passed: correctTool,
      expected: expected.tool,
      actual: functionName
    });
    if (correctTool) score += 25;

    // Check 3-N: Parameters (remaining points split among params)
    const paramCount = Object.keys(expected.params).length;
    const pointsPerParam = paramCount > 0 ? Math.floor(55 / paramCount) : 0;

    for (const [paramName, condition] of Object.entries(expected.params)) {
      const actualValue = args[paramName];
      const passed = this.evaluateCondition(actualValue, condition);
      
      checks.push({
        name: `param_${paramName}`,
        passed,
        expected: JSON.stringify(condition),
        actual: JSON.stringify(actualValue)
      });
      
      if (passed) score += pointsPerParam;
    }

    // Passed if score >= 70
    const passed = score >= 70;

    return { score: Math.min(score, 100), checks, passed };
  }

  /**
   * Evaluate a parameter condition
   */
  private evaluateCondition(value: any, condition: ParamCondition): boolean {
    if (condition.equals !== undefined) {
      return value === condition.equals;
    }

    if (condition.contains !== undefined) {
      return typeof value === 'string' && value.includes(condition.contains);
    }

    if (condition.oneOf !== undefined) {
      return condition.oneOf.includes(value);
    }

    if (condition.exists !== undefined) {
      return condition.exists ? value !== undefined : value === undefined;
    }

    // No condition = always pass
    return true;
  }

  /**
   * Setup test sandbox
   */
  private async setupSandbox(files: Record<string, string>): Promise<void> {
    await fs.ensureDir(this.sandboxDir);
    
    for (const [filePath, content] of Object.entries(files)) {
      const fullPath = path.join(this.sandboxDir, filePath);
      await fs.ensureDir(path.dirname(fullPath));
      await fs.writeFile(fullPath, content, 'utf-8');
    }
  }

  /**
   * Cleanup test sandbox
   */
  private async cleanupSandbox(): Promise<void> {
    try {
      await fs.remove(this.sandboxDir);
    } catch {
      // Ignore cleanup errors
    }
  }

  /**
   * Update model profile with test results
   */
  private async updateModelProfile(
    modelId: string,
    provider: 'lmstudio' | 'openai' | 'azure',
    runResult: TestRunResult
  ): Promise<void> {
    let profile = await capabilities.getProfile(modelId);
    
    if (!profile) {
      profile = capabilities.createEmptyProfile(modelId, modelId, provider);
    }

    // Convert test results to format expected by capabilities
    const testResultsForCapabilities = runResult.results.map(r => ({
      testId: r.testId,
      tool: r.tool,
      passed: r.passed,
      score: r.score,
      latency: r.latency,
      response: r.response ? JSON.stringify(r.response).slice(0, 500) : undefined,
      error: r.error
    }));

    profile = capabilities.updateProfileWithResults(profile, testResultsForCapabilities);
    await capabilities.saveProfile(profile);
  }

  /**
   * Get all test definitions
   */
  getTestDefinitions(): TestDefinition[] {
    return TEST_DEFINITIONS;
  }

  /**
   * Get tests for a specific tool
   */
  getTestsForTool(tool: string): TestDefinition[] {
    return TEST_DEFINITIONS.filter(t => t.tool === tool);
  }

  /**
   * Run tests for specific tools only
   */
  async runTestsForTools(
    modelId: string,
    provider: 'lmstudio' | 'openai' | 'azure',
    tools: string[],
    settings: any,
    options: TestOptions = {}
  ): Promise<TestRunResult> {
    const tests = TEST_DEFINITIONS.filter(t => tools.includes(t.tool));
    
    // Parse test mode options
    const mode = options.mode || 'manual';
    const unloadOthersBefore = options.unloadOthersBefore ?? (mode !== 'manual');
    const unloadAfterTest = options.unloadAfterTest ?? (mode === 'quick');
    const unloadOnlyOnFail = options.unloadOnlyOnFail ?? (mode === 'keep_on_success');

    // Get context length from options, model profile, or default
    let contextLength = options.contextLength || 8192;
    try {
      const profile = await capabilities.getProfile(modelId);
      if (profile?.contextLength) {
        contextLength = profile.contextLength;
      }
    } catch {
      // Use default if profile not found
    }

    // For LM Studio: load the model and optionally unload others
    if (provider === 'lmstudio' && unloadOthersBefore) {
      try {
        await this.loadLMStudioModel(modelId, true, contextLength);
      } catch (error: any) {
        console.error(`[TestEngine] Failed to load model: ${error.message}`);
      }
    }

    // Create a temporary engine state with filtered tests
    const startedAt = new Date().toISOString();
    const results: TestResult[] = [];

    for (const test of tests) {
      try {
        const result = await this.runSingleTest(test, modelId, provider, settings);
        results.push(result);
      } catch (error: any) {
        results.push({
          testId: test.id,
          tool: test.tool,
          passed: false,
          score: 0,
          latency: 0,
          checks: [],
          error: error.message
        });
      }
    }

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    const overallScore = results.length > 0
      ? Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length)
      : 0;

    // For LM Studio: optionally unload after test
    if (provider === 'lmstudio') {
      const shouldUnload = unloadAfterTest || (unloadOnlyOnFail && overallScore < 50);
      if (shouldUnload) {
        try {
          await this.unloadLMStudioModel(modelId);
          console.log(`[TestEngine] Unloaded model ${modelId} after test (score: ${overallScore}%)`);
        } catch (error: any) {
          console.error(`[TestEngine] Failed to unload model: ${error.message}`);
        }
      }
    }

    return {
      modelId,
      startedAt,
      completedAt: new Date().toISOString(),
      totalTests: results.length,
      passed,
      failed,
      overallScore,
      results
    };
  }
}

// Export singleton
export const testEngine = new TestEngine();

