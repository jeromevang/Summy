import { ProbeDefinition, ProbeCategory } from './types.js';

export const STRATEGIC_PROBES: ProbeDefinition[] = [
  {
    id: '3.1',
    name: 'RAG Priority',
    description: 'Model uses RAG as first choice for code questions',
    prompt: 'How does authentication work in this project?',
    expectedTool: 'rag_query',
    expectedBehavior: 'Model should call rag_query BEFORE file reads',
    evaluate: (response, toolCalls) => {
      const firstTool = toolCalls[0]?.function?.name;
      if (firstTool === 'rag_query') return { passed: true, score: 100, details: 'Correctly used RAG first' };
      if (toolCalls.some(tc => tc.function?.name === 'rag_query')) return { passed: true, score: 70, details: 'Used RAG but not first' };
      return { passed: false, score: 0, details: 'Did not use rag_query' };
    }
  },
  // Simplified for brevity, would include all 3.x-7.x probes
];

export const PROBE_CATEGORIES: ProbeCategory[] = [
  { id: '3.x', name: 'Strategic RAG Probes', icon: '🔍', probes: STRATEGIC_PROBES },
  // ... other categories
];
