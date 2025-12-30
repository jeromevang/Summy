export * from './types.js';
export * from './RAGSchemas.js';
export * from './FileSchemas.js';
export * from './GitSchemas.js';
export * from './BrowserSchemas.js';

import { RAG_SCHEMAS } from './RAGSchemas.js';
import { FILE_SCHEMAS } from './FileSchemas.js';
import { GIT_SCHEMAS } from './GitSchemas.js';
import { BROWSER_SCHEMAS } from './BrowserSchemas.js';

export const TOOL_SCHEMAS = {
  ...RAG_SCHEMAS,
  ...FILE_SCHEMAS,
  ...GIT_SCHEMAS,
  ...BROWSER_SCHEMAS
};
