/**
 * Test Definitions
 * Centralized test definitions for all test categories
 * 
 * Includes:
 * - TestDefinition format (static checks) for 1.x-8.x, 12.x, 13.x
 * - ProbeDefinition format (with evaluate functions) for 9.x, 10.x, 11.x, 14.x
 */

// Import probe definitions from category files
import { FAILURE_MODE_PROBES } from './categories/failure-tests.js';
import { STATEFUL_PROBES } from './categories/stateful-tests.js';
import { PRECEDENCE_PROBES } from './categories/precedence-tests.js';
import { EVOLUTION_TESTS } from './categories/evolution-tests.js';
import { CALIBRATION_TESTS } from './categories/calibration-tests.js';
import { COMPLIANCE_PROBES } from './categories/compliance-tests.js';
import {
  TestDefinition,
  TestMode
} from './test-types.js';
import type { ProbeDefinition } from '../types.js';

// ============================================================
// TEST CATEGORY DEFINITIONS
// ============================================================

export const TEST_CATEGORIES = {
  '1.x': { name: 'Tool Behavior', description: 'Basic tool calling capabilities' },
  '2.x': { name: 'Reasoning', description: 'Multi-step reasoning and planning' },
  '3.x': { name: 'RAG Usage', description: 'Retrieval-augmented generation' },
  '4.x': { name: 'Bug Detection', description: 'Finding and fixing bugs' },
  '5.x': { name: 'Navigation', description: 'Codebase navigation' },
  '6.x': { name: 'Helicopter View', description: 'Architecture understanding' },
  '7.x': { name: 'Proactive', description: 'Proactive helpfulness' },
  '8.x': { name: 'Intent Recognition', description: 'Understanding when to use tools' },
  '9.x': { name: 'Failure Modes', description: 'How model handles failures' },
  '10.x': { name: 'Stateful', description: 'Maintaining state across turns' },
  '11.x': { name: 'Precedence', description: 'Rule conflict resolution' },
  '12.x': { name: 'Evolution', description: 'Handling API changes' },
  '13.x': { name: 'Calibration', description: 'Confidence and uncertainty' },
  '14.x': { name: 'Compliance', description: 'System prompt following' },
} as const;

export type TestCategoryId = keyof typeof TEST_CATEGORIES;

// ============================================================
// TEST MODE CONFIGURATIONS
// ============================================================

export const TEST_MODE_CONFIG: Record<TestMode, {
  categories: TestCategoryId[];
  description: string;
  estimatedMinutes: number;
}> = {
  quick: {
    categories: ['1.x', '8.x'],
    description: 'Quick ranking with essential tests',
    estimatedMinutes: 2
  },
  standard: {
    categories: ['1.x', '2.x', '3.x', '8.x', '14.x'],
    description: 'Full capability assessment',
    estimatedMinutes: 10
  },
  deep: {
    categories: ['1.x', '2.x', '3.x', '4.x', '5.x', '6.x', '7.x', '8.x', '9.x', '10.x', '11.x', '12.x', '13.x', '14.x'],
    description: 'Complete evaluation with all categories',
    estimatedMinutes: 20
  },
  optimization: {
    categories: ['1.x', '2.x', '3.x', '8.x', '9.x', '13.x', '14.x'],
    description: 'Find optimal settings for the model',
    estimatedMinutes: 30
  },
  keep_on_success: {
    categories: ['1.x', '2.x', '3.x', '8.x'],
    description: 'Test and keep model loaded if successful',
    estimatedMinutes: 10
  },
  manual: {
    categories: ['1.x', '2.x', '3.x', '4.x', '5.x', '6.x', '7.x', '8.x'],
    description: 'Manual test run with all basic categories',
    estimatedMinutes: 15
  }
};

// ============================================================
// FILE OPERATION TESTS (1.x - basic tool tests)
// ============================================================

export const FILE_OPERATION_TESTS: TestDefinition[] = [
  {
    id: 'read_file_basic',
    tool: 'read_file',
    category: '1.x',
    difficulty: 'easy',
    prompt: 'Read the contents of the file named "config.json" in the current directory.',
    setupFiles: { 'config.json': '{"port": 3000, "debug": true}' },
    expected: {
      tool: 'read_file',
      params: { path: { contains: 'config.json' } }
    }
  },
  {
    id: 'read_file_nested',
    tool: 'read_file',
    category: '1.x',
    difficulty: 'medium',
    prompt: 'I need to see what\'s in the file located at src/utils/helpers.ts',
    setupFiles: { 'src/utils/helpers.ts': 'export const helper = () => {}' },
    expected: {
      tool: 'read_file',
      params: { path: { contains: 'helpers.ts' } }
    }
  },
  {
    id: 'write_file_basic',
    tool: 'write_file',
    category: '1.x',
    difficulty: 'easy',
    prompt: 'Create a new file called "hello.js" with the content: console.log("Hello World")',
    expected: {
      tool: 'write_file',
      params: {
        path: { contains: 'hello.js' },
        content: { contains: 'console.log' }
      }
    }
  },
  {
    id: 'list_directory_basic',
    tool: 'list_directory',
    category: '1.x',
    difficulty: 'easy',
    prompt: 'Show me all files in the src directory',
    expected: {
      tool: 'list_directory',
      params: { path: { oneOf: ['src', 'src/', './src', undefined] } }
    }
  },
  {
    id: 'search_files_basic',
    tool: 'search_files',
    category: '1.x',
    difficulty: 'medium',
    prompt: 'Search for all TypeScript files in the project',
    expected: {
      tool: 'search_files',
      params: {
        directory: { exists: true },
        pattern: { contains: 'ts' }
      }
    }
  }
];

// ============================================================
// REASONING TESTS (2.x)
// ============================================================

export const REASONING_TESTS: TestDefinition[] = [
  {
    id: 'reasoning_multi_step',
    tool: 'read_file',
    category: '2.x',
    difficulty: 'hard',
    prompt: 'I need to understand how authentication works in this project. First find where auth is implemented, then show me the main auth file.',
    expected: {
      tool: 'search_files',
      params: { pattern: { contains: 'auth' } }
    },
    tags: ['multi-step', 'planning']
  },
  {
    id: 'reasoning_conditional',
    tool: 'write_file',
    category: '2.x',
    difficulty: 'medium',
    prompt: 'Check if a file called "README.md" exists. If it does, read it. If not, create one with basic project info.',
    expected: {
      tool: 'get_file_info',
      params: { path: { contains: 'README' } }
    },
    tags: ['conditional', 'planning']
  }
];

// ============================================================
// RAG TESTS (3.x)
// ============================================================

export const RAG_TESTS: TestDefinition[] = [
  {
    id: 'rag_priority',
    tool: 'rag_query',
    category: '3.x',
    difficulty: 'medium',
    prompt: 'How does the user authentication flow work in this codebase?',
    expected: {
      tool: 'rag_query',
      params: { query: { exists: true } }
    },
    tags: ['rag-first']
  },
  {
    id: 'rag_vs_read',
    tool: 'rag_query',
    category: '3.x',
    difficulty: 'hard',
    prompt: 'Explain the database schema used in this project.',
    expected: {
      tool: 'rag_query',
      params: { query: { exists: true } }
    },
    tags: ['rag-priority']
  }
];

// ============================================================
// INTENT RECOGNITION TESTS (8.x)
// ============================================================

export const INTENT_TESTS: TestDefinition[] = [
  {
    id: 'intent_question_no_tool',
    tool: 'none',
    category: '8.x',
    difficulty: 'easy',
    prompt: 'What is TypeScript?',
    expected: {
      tool: 'none',
      params: {}
    },
    tags: ['no-tool']
  },
  {
    id: 'intent_file_read',
    tool: 'read_file',
    category: '8.x',
    difficulty: 'easy',
    prompt: 'Show me the package.json file',
    expected: {
      tool: 'read_file',
      params: { path: { contains: 'package.json' } }
    },
    tags: ['explicit-file']
  },
  {
    id: 'intent_search_needed',
    tool: 'search_files',
    category: '8.x',
    difficulty: 'medium',
    prompt: 'Where is the login component defined?',
    expected: {
      tool: 'search_files',
      params: { pattern: { contains: 'login' } }
    },
    tags: ['search-intent']
  }
];

// ============================================================
// ALL TEST DEFINITIONS (TestDefinition format - static checks)
// ============================================================

export const ALL_TEST_DEFINITIONS: TestDefinition[] = [
  // Basic tests (1.x - 8.x)
  ...FILE_OPERATION_TESTS,
  ...REASONING_TESTS,
  ...RAG_TESTS,
  ...INTENT_TESTS,
  // Advanced tests from category files (12.x, 13.x)
  ...EVOLUTION_TESTS,
  ...CALIBRATION_TESTS,
];

// ============================================================
// ALL PROBE DEFINITIONS (ProbeDefinition format - with evaluate())
// These have inline evaluate functions for complex scoring
// ============================================================

export const ALL_PROBE_DEFINITIONS: ProbeDefinition[] = [
  ...FAILURE_MODE_PROBES,    // 9.x Failure Modes
  ...STATEFUL_PROBES,        // 10.x Stateful Degradation
  ...PRECEDENCE_PROBES,      // 11.x Precedence/Conflicts
  ...COMPLIANCE_PROBES,      // 14.x System Prompt Compliance (SPC)
];

// Re-export for convenience
export { COMPLIANCE_PROBES, STATEFUL_PROBES, PRECEDENCE_PROBES, FAILURE_MODE_PROBES };
export { EVOLUTION_TESTS, CALIBRATION_TESTS };

/**
 * Get tests for a specific category
 */
export function getTestsByCategory(categoryId: TestCategoryId): TestDefinition[] {
  return ALL_TEST_DEFINITIONS.filter(t => t.category === categoryId);
}

/**
 * Get probes for a specific category
 */
export function getProbesByCategory(categoryId: TestCategoryId): ProbeDefinition[] {
  const categoryPrefix = categoryId.replace('.x', '');
  return ALL_PROBE_DEFINITIONS.filter(p => p.id.startsWith(categoryPrefix));
}

/**
 * Get tests for a specific mode
 */
export function getTestsForMode(mode: TestMode): TestDefinition[] {
  const config = TEST_MODE_CONFIG[mode];
  if (!config) return ALL_TEST_DEFINITIONS;

  return ALL_TEST_DEFINITIONS.filter(t =>
    config.categories.some(cat => t.category === cat)
  );
}

/**
 * Get probes for a specific mode
 */
export function getProbesForMode(mode: TestMode): ProbeDefinition[] {
  const config = TEST_MODE_CONFIG[mode];
  if (!config) return ALL_PROBE_DEFINITIONS;

  return ALL_PROBE_DEFINITIONS.filter(p => {
    const categoryPrefix = p.id.split('.')[0] || '';
    return config.categories.some(cat => cat.startsWith(categoryPrefix));
  });
}

/**
 * Get total test count for a mode (tests + probes)
 */
export function getTotalTestCount(mode: TestMode): number {
  return getTestsForMode(mode).length + getProbesForMode(mode).length;
}

/**
 * Get tests for a specific tool
 */
export function getTestsForTool(tool: string): TestDefinition[] {
  return ALL_TEST_DEFINITIONS.filter(t => t.tool === tool);
}

export default ALL_TEST_DEFINITIONS;

