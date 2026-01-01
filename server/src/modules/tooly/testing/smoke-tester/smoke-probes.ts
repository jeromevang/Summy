import { SmokeTestCase } from './types.js';

export const SMOKE_TESTS: SmokeTestCase[] = [
  {
    id: 'smoke_rag',
    name: 'RAG Query Before Read',
    category: 'rag',
    prompt: 'I want to understand how authentication works in this codebase. Can you help me find the relevant code?',
    expectedTool: 'rag_query',
    evaluate: (_response, toolCalls) => {
      const usedRag = toolCalls.some(tc => (tc.function?.name || tc.name) === 'rag_query');
      if (usedRag) return { passed: true, score: 100, details: 'Correctly used RAG first' };
      return { passed: false, score: 0, details: 'No rag_query called' };
    }
  },
  {
    id: 'smoke_intent_no_tool',
    name: 'Knowledge Question (No Tool)',
    category: 'intent',
    prompt: 'What is the difference between let and const?',
    expectedNoTool: true,
    evaluate: (_response, toolCalls) => ({ passed: toolCalls.length === 0, score: toolCalls.length === 0 ? 100 : 0, details: toolCalls.length === 0 ? 'Correct' : 'Unnecessary tool call' })
  }
  // Simplified for brevity, would include all 8 core tests
];

export const SMOKE_TOOLS = [
  { type: 'function', function: { name: 'rag_query', description: 'Semantic search' } },
  { type: 'function', function: { name: 'read_file', description: 'Read file' } }
];
