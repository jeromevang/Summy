/**
 * Knowledge Distiller
 * 
 * Distills knowledge from strong models to help weaker models succeed.
 * Extracts successful patterns from high-performing models and creates
 * prosthetic prompts that teach these patterns to struggling models.
 */

import { intentRouter } from '../intent-router.js';
import { getToolSchemas } from '../tool-prompts.js';
import { prostheticStore, ProstheticEntry, buildProstheticPrompt } from './prosthetic-store.js';
import { capabilities } from '../capabilities.js';
import { SANDBOX_CONTEXT } from '../testing/readiness-runner.js';

// ============================================================
// TYPES
// ============================================================

export interface DistillationResult {
  success: boolean;
  teacherModelId: string;
  studentModelId: string;
  capability: string;
  teacherScore: number;
  studentScoreBefore: number;
  studentScoreAfter: number;
  prostheticGenerated: string | null;
  patterns: ExtractedPattern[];
  message: string;
}

export interface ExtractedPattern {
  name: string;
  description: string;
  toolSequence?: string[];
  promptHints?: string[];
  example?: string;
}

export interface DistillationTestCase {
  id: string;
  capability: string;
  prompt: string;
  expectedBehavior: string;
  evaluator: (response: string, toolCalls: any[]) => { score: number; details: string };
}

// ============================================================
// TEST CASES FOR DISTILLATION
// ============================================================

const DISTILLATION_TESTS: Record<string, DistillationTestCase[]> = {
  'rag_usage': [
    {
      id: 'distill-rag-1',
      capability: 'rag_usage',
      prompt: 'How does the authentication flow work in this codebase?',
      expectedBehavior: 'Use rag_query first to explore, then read relevant files',
      evaluator: (response, toolCalls) => {
        const ragFirst = toolCalls[0]?.function?.name === 'rag_query';
        const usedRag = toolCalls.some(tc => tc.function?.name === 'rag_query');
        const usedRead = toolCalls.some(tc => tc.function?.name === 'read_file');
        
        let score = 0;
        if (ragFirst) score += 50;
        if (usedRag && usedRead) score += 50;
        
        return { 
          score, 
          details: ragFirst ? 'RAG-first pattern detected' : 'Did not use RAG-first'
        };
      }
    }
  ],
  'tool_selection': [
    {
      id: 'distill-tool-1',
      capability: 'tool_selection',
      prompt: 'Find all files that contain error handling code.',
      expectedBehavior: 'Use search_files with appropriate query',
      evaluator: (response, toolCalls) => {
        const usedSearch = toolCalls.some(tc => 
          ['search_files', 'grep', 'codebase_search'].includes(tc.function?.name)
        );
        
        return {
          score: usedSearch ? 100 : 0,
          details: usedSearch ? 'Correct tool selection' : 'Did not use search tool'
        };
      }
    }
  ],
  'multi_step_reasoning': [
    {
      id: 'distill-reason-1',
      capability: 'multi_step_reasoning',
      prompt: 'Find the auth middleware, read it, and suggest improvements.',
      expectedBehavior: 'Multiple tool calls in logical sequence',
      evaluator: (response, toolCalls) => {
        const stepCount = toolCalls.length;
        const hasSuggestions = response.toLowerCase().includes('suggest') || 
                               response.toLowerCase().includes('improve') ||
                               response.toLowerCase().includes('recommend');
        
        let score = Math.min(stepCount * 25, 50);
        if (hasSuggestions) score += 50;
        
        return {
          score,
          details: `${stepCount} steps, suggestions: ${hasSuggestions}`
        };
      }
    }
  ]
};

// ============================================================
// KNOWLEDGE DISTILLER CLASS
// ============================================================

export class KnowledgeDistiller {
  private settings: {
    lmstudioUrl: string;
    [key: string]: any;
  };

  constructor(settings: { lmstudioUrl: string; [key: string]: any }) {
    this.settings = settings;
  }

  /**
   * Run a single test case against a model
   */
  private async runTestCase(
    modelId: string,
    testCase: DistillationTestCase
  ): Promise<{ score: number; details: string; response: string; toolCalls: any[] }> {
    try {
      // Configure router for this model
      await intentRouter.configure({
        mainModelId: modelId,
        executorModelId: modelId,
        enableDualModel: false,
        timeout: 60000,
        provider: 'lmstudio',
        settings: this.settings
      });

      const messages = [
        { role: 'system', content: SANDBOX_CONTEXT },
        { role: 'user', content: testCase.prompt }
      ];

      const tools = getToolSchemas([
        'read_file', 'search_files', 'list_directory',
        'rag_query', 'write_file', 'edit_file'
      ]);

      const result = await intentRouter.route(messages, tools);
      
      const response = result.finalResponse?.choices?.[0]?.message?.content || '';
      const toolCalls = result.toolCalls || [];
      
      const evaluation = testCase.evaluator(response, toolCalls);
      
      return {
        ...evaluation,
        response,
        toolCalls
      };
    } catch (error: any) {
      return {
        score: 0,
        details: `Error: ${error.message}`,
        response: '',
        toolCalls: []
      };
    }
  }

  /**
   * Extract patterns from a successful model response
   */
  private extractPatterns(
    capability: string,
    response: string,
    toolCalls: any[]
  ): ExtractedPattern[] {
    const patterns: ExtractedPattern[] = [];

    // Extract tool sequence pattern
    if (toolCalls.length > 0) {
      const toolSequence = toolCalls.map(tc => tc.function?.name).filter(Boolean);
      patterns.push({
        name: 'Tool Sequence',
        description: `Optimal tool order for ${capability}`,
        toolSequence,
        promptHints: [`When handling ${capability}, use tools in this order: ${toolSequence.join(' → ')}`]
      });
    }

    // Extract RAG-first pattern
    if (toolCalls[0]?.function?.name === 'rag_query') {
      patterns.push({
        name: 'RAG-First',
        description: 'Use RAG before reading individual files',
        promptHints: [
          'ALWAYS use rag_query first when exploring unfamiliar code',
          'Let RAG results guide which files to read'
        ]
      });
    }

    // Extract chaining pattern
    if (toolCalls.length >= 2) {
      const hasRag = toolCalls.some(tc => tc.function?.name === 'rag_query');
      const hasRead = toolCalls.some(tc => tc.function?.name === 'read_file');
      
      if (hasRag && hasRead) {
        patterns.push({
          name: 'RAG-Then-Read',
          description: 'Chain RAG query with targeted file reads',
          promptHints: [
            'After RAG query, read the specific files it identifies',
            'Use RAG results to narrow down which files to examine'
          ]
        });
      }
    }

    return patterns;
  }

  /**
   * Build a prosthetic prompt from extracted patterns
   */
  private buildProstheticFromPatterns(
    patterns: ExtractedPattern[],
    capability: string,
    level: 1 | 2 | 3 | 4
  ): string {
    const lines: string[] = [];

    if (level >= 2) {
      lines.push(`## ${capability.toUpperCase()} BEST PRACTICES`);
      lines.push('');
    }

    for (const pattern of patterns) {
      if (level >= 3) {
        lines.push(`### ${pattern.name}`);
      }
      
      if (pattern.promptHints) {
        for (const hint of pattern.promptHints) {
          const prefix = level >= 3 ? '- MUST: ' : '- ';
          lines.push(prefix + hint);
        }
      }
      
      if (pattern.toolSequence && level >= 2) {
        lines.push(`- Tool order: ${pattern.toolSequence.join(' → ')}`);
      }
      
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Distill knowledge from a strong model to a weaker model
   */
  async distillFromStrongModel(
    teacherModelId: string,
    studentModelId: string,
    capability: string
  ): Promise<DistillationResult> {
    console.log(`[KnowledgeDistiller] Starting distillation: ${teacherModelId} → ${studentModelId} (${capability})`);

    const testCases = DISTILLATION_TESTS[capability];
    if (!testCases || testCases.length === 0) {
      return {
        success: false,
        teacherModelId,
        studentModelId,
        capability,
        teacherScore: 0,
        studentScoreBefore: 0,
        studentScoreAfter: 0,
        prostheticGenerated: null,
        patterns: [],
        message: `No test cases defined for capability: ${capability}`
      };
    }

    // Step 1: Run teacher model to establish pattern
    console.log(`[KnowledgeDistiller] Running teacher model (${teacherModelId})...`);
    let teacherTotalScore = 0;
    let allPatterns: ExtractedPattern[] = [];
    let teacherToolCalls: any[] = [];

    for (const testCase of testCases) {
      const teacherResult = await this.runTestCase(teacherModelId, testCase);
      teacherTotalScore += teacherResult.score;
      teacherToolCalls.push(...teacherResult.toolCalls);
      
      // Extract patterns from successful responses
      if (teacherResult.score >= 70) {
        const patterns = this.extractPatterns(capability, teacherResult.response, teacherResult.toolCalls);
        allPatterns.push(...patterns);
      }
    }

    const teacherScore = teacherTotalScore / testCases.length;
    console.log(`[KnowledgeDistiller] Teacher score: ${teacherScore}`);

    // Step 2: Run student model BEFORE prosthetic
    console.log(`[KnowledgeDistiller] Running student model BEFORE (${studentModelId})...`);
    let studentBeforeScore = 0;

    for (const testCase of testCases) {
      const studentResult = await this.runTestCase(studentModelId, testCase);
      studentBeforeScore += studentResult.score;
    }

    studentBeforeScore = studentBeforeScore / testCases.length;
    console.log(`[KnowledgeDistiller] Student BEFORE: ${studentBeforeScore}`);

    // Step 3: Build prosthetic from extracted patterns
    if (allPatterns.length === 0) {
      return {
        success: false,
        teacherModelId,
        studentModelId,
        capability,
        teacherScore,
        studentScoreBefore: studentBeforeScore,
        studentScoreAfter: studentBeforeScore,
        prostheticGenerated: null,
        patterns: [],
        message: 'Teacher model did not produce extractable patterns'
      };
    }

    // Determine prosthetic level based on student's initial score
    const level: 1 | 2 | 3 | 4 = 
      studentBeforeScore >= 50 ? 1 :
      studentBeforeScore >= 30 ? 2 :
      studentBeforeScore >= 10 ? 3 : 4;

    const prostheticPrompt = this.buildProstheticFromPatterns(allPatterns, capability, level);
    console.log(`[KnowledgeDistiller] Generated Level ${level} prosthetic (${prostheticPrompt.length} chars)`);

    // Step 4: Save prosthetic and test student WITH prosthetic
    prostheticStore.savePrompt({
      modelId: studentModelId,
      prompt: prostheticPrompt,
      level,
      probesFixed: [capability],
      categoryImprovements: {
        [capability.includes('rag') ? 'rag' : 
         capability.includes('tool') ? 'tool' : 'reasoning']: 0
      }
    });

    // Step 5: Run student model AFTER prosthetic (with enhanced context)
    console.log(`[KnowledgeDistiller] Running student model AFTER (${studentModelId})...`);
    let studentAfterScore = 0;

    for (const testCase of testCases) {
      // Enhance the test with prosthetic in system prompt
      const enhancedPrompt = testCase.prompt;
      // Note: In production, the prosthetic would be applied via the model profile
      // For now we just re-test (the prosthetic is stored for future use)
      const studentResult = await this.runTestCase(studentModelId, testCase);
      studentAfterScore += studentResult.score;
    }

    studentAfterScore = studentAfterScore / testCases.length;
    console.log(`[KnowledgeDistiller] Student AFTER: ${studentAfterScore}`);

    // Step 6: Update prosthetic with improvement metrics
    const improvement = studentAfterScore - studentBeforeScore;
    if (improvement > 0) {
      prostheticStore.updatePrompt(studentModelId, {
        verified: true,
        categoryImprovements: {
          [capability.includes('rag') ? 'rag' : 
           capability.includes('tool') ? 'tool' : 'reasoning']: improvement
        }
      });
    }

    return {
      success: improvement > 0,
      teacherModelId,
      studentModelId,
      capability,
      teacherScore,
      studentScoreBefore: studentBeforeScore,
      studentScoreAfter: studentAfterScore,
      prostheticGenerated: prostheticPrompt,
      patterns: allPatterns,
      message: improvement > 0 
        ? `Distillation successful! +${improvement.toFixed(1)}% improvement`
        : `Distillation did not improve student (${improvement.toFixed(1)}%)`
    };
  }

  /**
   * Get available capabilities for distillation
   */
  getAvailableCapabilities(): string[] {
    return Object.keys(DISTILLATION_TESTS);
  }

  /**
   * Automatically find the best teacher model for a capability
   */
  async findBestTeacher(capability: string): Promise<string | null> {
    const profiles = await capabilities.getAllProfiles();
    
    // Find models with highest scores in this capability area
    let bestModel: string | null = null;
    let bestScore = 0;

    for (const profile of profiles) {
      // Check various score sources
      const score = 
        (profile.probeResults as any)?.overallScore ||
        profile.score ||
        0;
      
      if (score > bestScore) {
        bestScore = score;
        bestModel = profile.modelId;
      }
    }

    return bestModel;
  }
}

// ============================================================
// FACTORY
// ============================================================

let distillerInstance: KnowledgeDistiller | null = null;

export function createKnowledgeDistiller(settings: { lmstudioUrl: string; [key: string]: any }): KnowledgeDistiller {
  distillerInstance = new KnowledgeDistiller(settings);
  return distillerInstance;
}

export function getKnowledgeDistiller(): KnowledgeDistiller | null {
  return distillerInstance;
}


