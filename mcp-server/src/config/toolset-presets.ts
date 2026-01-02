/**
 * MCP Toolset Presets
 *
 * Defines preset configurations for which tool categories to expose.
 * Allows users to reduce context usage by only loading needed tools.
 */

export type ToolCategory =
  | 'file_ops'  // File read/write/edit/delete operations
  | 'git'       // Git version control operations
  | 'npm'       // NPM package management
  | 'browser'   // Browser automation (Playwright)
  | 'rag'       // RAG semantic search
  | 'refactor'  // Code refactoring tools
  | 'memory'    // Persistent memory system
  | 'system';   // System/shell operations

export type ToolsetName = 'minimal' | 'standard' | 'full' | 'custom';

export interface ToolsetPreset {
  categories: ToolCategory[];
  description: string;
  estimatedTokens: number;
}

export const TOOLSET_PRESETS: Record<ToolsetName, ToolsetPreset> = {
  minimal: {
    categories: ['rag', 'memory'],
    description: 'For cloud APIs with built-in tools - RAG + Memory only',
    estimatedTokens: 8000
  },
  standard: {
    categories: ['rag', 'memory', 'browser', 'refactor', 'system'],
    description: 'Balanced - recommended for most users',
    estimatedTokens: 15000
  },
  full: {
    categories: ['file_ops', 'git', 'npm', 'browser', 'rag', 'refactor', 'memory', 'system'],
    description: 'All tools - for local models or full control',
    estimatedTokens: 54000
  },
  custom: {
    categories: [], // Will be populated from settings
    description: 'User-defined tool selection',
    estimatedTokens: 0 // Calculated based on selected categories
  }
};

/**
 * Get estimated token count for a set of tool categories
 */
export function estimateTokensForCategories(categories: ToolCategory[]): number {
  // Rough estimates based on number of tools per category
  const TOKEN_ESTIMATES: Record<ToolCategory, number> = {
    file_ops: 12000,
    git: 10000,
    npm: 4000,
    browser: 8000,
    rag: 5000,
    refactor: 2000,
    memory: 3000,
    system: 4000
  };

  return categories.reduce((total, category) => total + TOKEN_ESTIMATES[category], 0);
}
