import { OpenAIToolSchema } from './types.js';

export const BROWSER_SCHEMAS: Record<string, OpenAIToolSchema> = {
  browser_navigate: {
    type: 'function',
    function: {
      name: 'browser_navigate',
      description: 'Navigate to a URL',
      parameters: { type: 'object', properties: { url: { type: 'string', description: 'URL' } }, required: ['url'] }
    }
  }
};
