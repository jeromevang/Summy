import { OpenAIToolSchema } from './types.js';

export const RAG_SCHEMAS: Record<string, OpenAIToolSchema> = {
  rag_query: {
    type: 'function',
    function: {
      name: 'rag_query',
      description: '🚨 REQUIRED FIRST STEP 🚨: For ANY question about code, functionality, or codebase exploration, you MUST call rag_query FIRST.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Natural language query' },
          limit: { type: 'number', description: 'Maximum results (default: 5)' }
        },
        required: ['query']
      }
    }
  },
  rag_status: {
    type: 'function',
    function: {
      name: 'rag_status',
      description: 'Get RAG indexing status',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  }
};
