import { OpenAIToolSchema } from './types.js';

export const FILE_SCHEMAS: Record<string, OpenAIToolSchema> = {
  read_file: {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the complete contents of a file',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Path to the file' } },
        required: ['path']
      }
    }
  },
  write_file: {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Create or overwrite a file',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file' },
          content: { type: 'string', description: 'New content' }
        },
        required: ['path', 'content']
      }
    }
  }
};
