/**
 * Prompt Builder
 * Dynamic prompt generation with memory injection and pattern application
 */

import { globalMemory, projectMemory, patternMemory, PatternMemory } from './memory-store.js';

// ============================================================
// TYPES
// ============================================================

export interface PromptContext {
  modelId: string;
  projectPath?: string;
  query: string;
  toolConfig?: ToolConfig;
  contextBudget: number;
  includePatterns?: boolean;
  includeMemories?: boolean;
}

export interface ToolConfig {
  enabledTools: string[];
  disabledTools: string[];
  toolOverrides: Record<string, { description?: string; priority?: number }>;
}

export interface BuiltPrompt {
  systemPrompt: string;
  injectedMemories: string[];
  appliedPatterns: string[];
  tokenEstimate: number;
}

// ============================================================
// PROMPT TEMPLATES
// ============================================================

const BASE_SYSTEM_PROMPT = `You are a helpful AI coding assistant with access to tools for file operations, code search, git, and more.

## Core Principles
1. Use RAG/search before reading files to understand context
2. Make precise, minimal changes when editing code
3. Explain your reasoning before taking actions
4. Ask for clarification if the request is ambiguous
5. Admit when you don't know something`;

const TOOL_PRIORITY_SECTION = `
## Tool Usage Priority
When working with code:
1. Use rag_query first to understand codebase structure
2. Use search_files to find specific files or patterns
3. Use read_file only after knowing what to read
4. Use edit_file for precise changes (not write_file for existing files)`;

const MEMORY_SECTION_HEADER = `
## Learned Preferences`;

const PATTERN_SECTION_HEADER = `
## Learned Patterns`;

// ============================================================
// PROMPT BUILDER CLASS
// ============================================================

export class PromptBuilder {
  /**
   * Build a complete prompt with context
   */
  build(context: PromptContext): BuiltPrompt {
    const sections: string[] = [BASE_SYSTEM_PROMPT];
    const injectedMemories: string[] = [];
    const appliedPatterns: string[] = [];
    let tokenEstimate = this.estimateTokens(BASE_SYSTEM_PROMPT);
    
    // Add tool priority section if tools are configured
    if (context.toolConfig) {
      sections.push(TOOL_PRIORITY_SECTION);
      tokenEstimate += this.estimateTokens(TOOL_PRIORITY_SECTION);
      
      // Add tool-specific overrides
      const overrideSection = this.buildToolOverrides(context.toolConfig);
      if (overrideSection) {
        sections.push(overrideSection);
        tokenEstimate += this.estimateTokens(overrideSection);
      }
    }
    
    // Inject relevant memories if enabled and within budget
    if (context.includeMemories !== false) {
      const memorySection = this.buildMemorySection(
        context.projectPath,
        context.query,
        context.contextBudget - tokenEstimate
      );
      
      if (memorySection.content) {
        sections.push(memorySection.content);
        injectedMemories.push(...memorySection.memories);
        tokenEstimate += memorySection.tokens;
      }
    }
    
    // Apply learned patterns if enabled and within budget
    if (context.includePatterns !== false) {
      const patternSection = this.buildPatternSection(
        context.query,
        context.contextBudget - tokenEstimate
      );
      
      if (patternSection.content) {
        sections.push(patternSection.content);
        appliedPatterns.push(...patternSection.patterns);
        tokenEstimate += patternSection.tokens;
      }
    }
    
    return {
      systemPrompt: sections.join('\n'),
      injectedMemories,
      appliedPatterns,
      tokenEstimate
    };
  }
  
  /**
   * Build tool override section
   */
  private buildToolOverrides(toolConfig: ToolConfig): string | null {
    const overrides: string[] = [];
    
    // Add disabled tools warning
    if (toolConfig.disabledTools.length > 0) {
      overrides.push(`\nDisabled tools (do not use): ${toolConfig.disabledTools.join(', ')}`);
    }
    
    // Add tool-specific instructions
    for (const [tool, override] of Object.entries(toolConfig.toolOverrides)) {
      if (override.description) {
        overrides.push(`- ${tool}: ${override.description}`);
      }
    }
    
    if (overrides.length === 0) return null;
    
    return `\n## Tool Configuration\n${overrides.join('\n')}`;
  }
  
  /**
   * Build memory injection section
   */
  private buildMemorySection(
    projectPath: string | undefined,
    query: string,
    budgetTokens: number
  ): { content: string | null; memories: string[]; tokens: number } {
    const memories: string[] = [];
    let content = MEMORY_SECTION_HEADER;
    let tokens = this.estimateTokens(MEMORY_SECTION_HEADER);
    
    // Get relevant global memories
    const globalMatches = globalMemory.search(query.slice(0, 50));
    for (const mem of globalMatches.slice(0, 3)) {
      const line = `\n- ${mem.key}: ${mem.value}`;
      const lineTokens = this.estimateTokens(line);
      
      if (tokens + lineTokens < budgetTokens) {
        content += line;
        memories.push(mem.key);
        tokens += lineTokens;
      }
    }
    
    // Get project-specific memories if project path provided
    if (projectPath) {
      const projectMems = projectMemory.getImportant(projectPath);
      for (const mem of projectMems.slice(0, 3)) {
        const line = `\n- [Project] ${mem.key}: ${mem.value}`;
        const lineTokens = this.estimateTokens(line);
        
        if (tokens + lineTokens < budgetTokens) {
          content += line;
          memories.push(`project:${mem.key}`);
          tokens += lineTokens;
        }
      }
    }
    
    if (memories.length === 0) {
      return { content: null, memories: [], tokens: 0 };
    }
    
    return { content, memories, tokens };
  }
  
  /**
   * Build pattern application section
   */
  private buildPatternSection(
    query: string,
    budgetTokens: number
  ): { content: string | null; patterns: string[]; tokens: number } {
    const patterns: string[] = [];
    let content = PATTERN_SECTION_HEADER;
    let tokens = this.estimateTokens(PATTERN_SECTION_HEADER);
    
    // Find patterns matching the query
    const keywords = this.extractKeywords(query);
    const matchingPatterns: PatternMemory[] = [];
    
    for (const keyword of keywords) {
      const found = patternMemory.findByTrigger(keyword);
      matchingPatterns.push(...found);
    }
    
    // Also get top patterns by success rate
    const topPatterns = patternMemory.getTopPatterns(5);
    
    // Dedupe and sort by relevance
    const allPatterns = [...new Map(
      [...matchingPatterns, ...topPatterns].map(p => [p.id, p])
    ).values()];
    
    // Sort by success rate and occurrence count
    allPatterns.sort((a, b) => {
      const scoreA = a.successRate * Math.log(a.occurrenceCount + 1);
      const scoreB = b.successRate * Math.log(b.occurrenceCount + 1);
      return scoreB - scoreA;
    });
    
    // Add patterns within budget
    for (const pattern of allPatterns.slice(0, 5)) {
      const line = `\n- ${pattern.action} (${Math.round(pattern.successRate * 100)}% success)`;
      const lineTokens = this.estimateTokens(line);
      
      if (tokens + lineTokens < budgetTokens) {
        content += line;
        patterns.push(pattern.id);
        tokens += lineTokens;
      }
    }
    
    if (patterns.length === 0) {
      return { content: null, patterns: [], tokens: 0 };
    }
    
    return { content, patterns, tokens };
  }
  
  /**
   * Extract keywords from query for pattern matching
   */
  private extractKeywords(query: string): string[] {
    // Extract action words and nouns
    const words = query.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3);
    
    // Prioritize action words
    const actionWords = ['read', 'write', 'edit', 'create', 'delete', 'find', 'search', 
                         'list', 'get', 'set', 'update', 'fix', 'add', 'remove', 'change'];
    
    const keywords = words.filter(w => actionWords.includes(w));
    
    // Add other significant words
    const otherWords = words.filter(w => !actionWords.includes(w)).slice(0, 3);
    
    return [...keywords, ...otherWords];
  }
  
  /**
   * Estimate token count for text
   */
  private estimateTokens(text: string): number {
    // Rough estimate: 1 token per 4 characters
    return Math.ceil(text.length / 4);
  }
  
  /**
   * Build a minimal prompt for quick operations
   */
  buildMinimal(toolConfig?: ToolConfig): string {
    let prompt = BASE_SYSTEM_PROMPT;
    
    if (toolConfig?.disabledTools?.length) {
      prompt += `\n\nDo not use these tools: ${toolConfig.disabledTools.join(', ')}`;
    }
    
    return prompt;
  }
}

export const promptBuilder = new PromptBuilder();
export default promptBuilder;

