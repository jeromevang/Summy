import { OpenAIToolSchema } from './types.js';

export const GIT_SCHEMAS: Record<string, OpenAIToolSchema> = {
  git_status: {
    type: 'function',
    function: { name: 'git_status', description: 'Check git status', parameters: { type: 'object', properties: {}, required: [] } }
  },
  git_commit: {
    type: 'function',
    function: {
      name: 'git_commit',
      description: 'Commit changes',
      parameters: { type: 'object', properties: { message: { type: 'string', description: 'Message' } }, required: ['message'] }
    }
  }
};
