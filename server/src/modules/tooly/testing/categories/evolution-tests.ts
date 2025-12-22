/**
 * Evolution Tests (12.x)
 * Tests for handling API changes, tool renames, and deprecations
 */

import { TestDefinition } from '../test-definitions.js';

// ============================================================
// EVOLUTION TEST DEFINITIONS
// ============================================================

export const EVOLUTION_TESTS: TestDefinition[] = [
  // 12.1 Tool Rename Handling
  {
    id: 'evolution_tool_rename',
    tool: 'read_file',
    category: '12.x',
    difficulty: 'medium',
    prompt: `The tool "get_file_content" has been renamed to "read_file". 
Please read the file config.json using the new tool name.`,
    setupFiles: { 'config.json': '{"setting": true}' },
    expected: {
      tool: 'read_file',
      params: { path: { contains: 'config.json' } }
    },
    tags: ['evolution', 'rename']
  },

  // 12.2 Parameter Name Change
  {
    id: 'evolution_param_rename',
    tool: 'write_file',
    category: '12.x',
    difficulty: 'medium',
    prompt: `Note: The "contents" parameter has been renamed to "content" for write_file.
Create a file called notes.txt with the content "Hello World".`,
    expected: {
      tool: 'write_file',
      params: { 
        path: { contains: 'notes.txt' },
        content: { exists: true }
      }
    },
    tags: ['evolution', 'param-change']
  },

  // 12.3 Deprecated Tool Fallback
  {
    id: 'evolution_deprecated_fallback',
    tool: 'search_files',
    category: '12.x',
    difficulty: 'hard',
    prompt: `The tool "grep" has been deprecated. Use "search_files" instead.
Find all files containing the word "TODO".`,
    expected: {
      tool: 'search_files',
      params: { 
        pattern: { contains: 'TODO' }
      }
    },
    tags: ['evolution', 'deprecation']
  },

  // 12.4 New Required Parameter
  {
    id: 'evolution_new_required_param',
    tool: 'edit_file',
    category: '12.x',
    difficulty: 'hard',
    prompt: `The edit_file tool now requires a "reason" parameter explaining the change.
Change the port from 3000 to 8080 in server.js with reason "Update for production".`,
    setupFiles: { 'server.js': 'const port = 3000;' },
    expected: {
      tool: 'edit_file',
      params: { 
        path: { contains: 'server.js' }
      }
    },
    tags: ['evolution', 'new-param']
  },

  // 12.5 Tool Split
  {
    id: 'evolution_tool_split',
    tool: 'list_directory',
    category: '12.x',
    difficulty: 'hard',
    prompt: `The old "file_operations" tool has been split into separate tools:
- list_directory: for listing files
- get_file_info: for file metadata
- search_files: for finding files

List the contents of the src folder.`,
    expected: {
      tool: 'list_directory',
      params: { 
        path: { oneOf: ['src', 'src/', './src'] }
      }
    },
    tags: ['evolution', 'tool-split']
  }
];

export default EVOLUTION_TESTS;

