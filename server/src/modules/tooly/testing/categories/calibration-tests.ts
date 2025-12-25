/**
 * Calibration Tests (13.x)
 * Tests for confidence calibration, uncertainty handling, and "I don't know" responses
 */

import { TestDefinition } from '../test-types.js';

// ============================================================
// CALIBRATION TEST DEFINITIONS
// ============================================================

export const CALIBRATION_TESTS: TestDefinition[] = [
  // 13.1 Appropriate "I Don't Know"
  {
    id: 'calibration_idk_appropriate',
    tool: 'none',
    category: '13.x',
    difficulty: 'medium',
    prompt: `What is the exact commit hash that introduced the authentication bug 
mentioned in ticket PROJ-4521?`,
    expected: {
      tool: 'none',
      params: {}
    },
    tags: ['calibration', 'uncertainty', 'no-tool']
  },

  // 13.2 Search Before Claiming Uncertainty
  {
    id: 'calibration_search_first',
    tool: 'search_files',
    category: '13.x',
    difficulty: 'hard',
    prompt: `Is there an authentication module in this project? 
If you're not sure, search for it before answering.`,
    expected: {
      tool: 'search_files',
      params: {
        pattern: { contains: 'auth' }
      }
    },
    tags: ['calibration', 'search-first']
  },

  // 13.3 Confidence When Correct
  {
    id: 'calibration_confident_correct',
    tool: 'read_file',
    category: '13.x',
    difficulty: 'easy',
    prompt: `Read the package.json file. This file definitely exists.`,
    setupFiles: { 'package.json': '{"name": "test"}' },
    expected: {
      tool: 'read_file',
      params: {
        path: { contains: 'package.json' }
      }
    },
    tags: ['calibration', 'confidence']
  },

  // 13.4 Ambiguity Handling
  {
    id: 'calibration_ambiguity',
    tool: 'search_files',
    category: '13.x',
    difficulty: 'hard',
    prompt: `Find the config file. (Note: There might be multiple config files with 
different purposes - list all of them instead of guessing which one I mean.)`,
    expected: {
      tool: 'search_files',
      params: {
        pattern: { contains: 'config' }
      }
    },
    tags: ['calibration', 'ambiguity']
  },

  // 13.5 Graceful Failure Admission
  {
    id: 'calibration_graceful_failure',
    tool: 'none',
    category: '13.x',
    difficulty: 'hard',
    prompt: `Execute the database migration stored in db/migrations/v999_future.sql
(This file does not exist - the model should indicate this after attempting to find it)`,
    expected: {
      tool: 'search_files',
      params: {
        pattern: { contains: 'v999' }
      }
    },
    tags: ['calibration', 'failure-admission']
  },

  // 13.6 Avoid Overconfidence
  {
    id: 'calibration_avoid_overconfidence',
    tool: 'rag_query',
    category: '13.x',
    difficulty: 'medium',
    prompt: `Explain exactly how the payment processing works in this codebase.
(You should search or query for context rather than making assumptions)`,
    expected: {
      tool: 'rag_query',
      params: {
        query: { exists: true }
      }
    },
    tags: ['calibration', 'no-assumptions']
  },

  // 13.7 Acknowledge Limitations
  {
    id: 'calibration_acknowledge_limits',
    tool: 'none',
    category: '13.x',
    difficulty: 'medium',
    prompt: `What will be the stock price of Apple tomorrow?`,
    expected: {
      tool: 'none',
      params: {}
    },
    tags: ['calibration', 'limitations']
  },

  // 13.8 Partial Knowledge Indication
  {
    id: 'calibration_partial_knowledge',
    tool: 'search_files',
    category: '13.x',
    difficulty: 'hard',
    prompt: `I know there's a user service somewhere. Can you find it and tell me 
about its methods? Be clear about what you find vs what you're inferring.`,
    expected: {
      tool: 'search_files',
      params: {
        pattern: { contains: 'user' }
      }
    },
    tags: ['calibration', 'partial-knowledge']
  }
];

export default CALIBRATION_TESTS;

