import { Router } from 'express';
import path from 'path';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';
import { db } from '../../services/database.js';
import { PROBE_CATEGORIES } from '../../modules/tooly/strategic-probes.js';
import { loadServerSettings } from '../../services/settings-service.js';

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SETTINGS_FILE = path.join(__dirname, '../../../settings.json');

/**
 * GET /api/tooly/custom-tests
 * Get all custom tests (user-created + built-in probe tests)
 */
router.get('/custom-tests', (req, res) => {
  try {
    const customTests = db.getCustomTests();

    const builtInTests = [
      ...PROBE_CATEGORIES.flatMap((cat: any) =>
        cat.probes.map((p: any) => ({
          id: p.id,
          name: p.name,
          category: cat.id,
          categoryName: cat.name,
          categoryIcon: cat.icon,
          prompt: p.prompt,
          expectedTool: p.expectedTool,
          expectedBehavior: p.expectedBehavior,
          difficulty: 'medium',
          isBuiltin: true,
        }))
      )
    ];

    res.json({
      customTests,
      builtInTests,
      totalCustom: customTests.length,
      totalBuiltIn: builtInTests.length,
    });
  } catch (error: any) {
    console.error('[Tooly] Failed to get custom tests:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/tooly/custom-tests
 * Create a new custom test
 */
router.post('/custom-tests', (req, res) => {
  try {
    const { name, category, prompt, expectedTool, expectedBehavior, difficulty, variants } = req.body;

    if (!name || !category || !prompt) {
      res.status(400).json({ error: 'name, category, and prompt are required' });
      return;
    }

    const id = db.createCustomTest({
      name,
      category,
      prompt,
      expectedTool,
      expectedBehavior,
      difficulty,
      variants,
    });

    res.json({ id, success: true });
  } catch (error: any) {
    console.error('[Tooly] Failed to create custom test:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/tooly/custom-tests/:id
 * Update a custom test
 */
router.put('/custom-tests/:id', (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const success = db.updateCustomTest(id, updates);

    if (!success) {
      res.status(404).json({ error: 'Test not found or is built-in' });
      return;
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('[Tooly] Failed to update custom test:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/tooly/custom-tests/:id
 * Delete a custom test
 */
router.delete('/custom-tests/:id', (req, res) => {
  try {
    const { id } = req.params;

    const success = db.deleteCustomTest(id);

    if (!success) {
      res.status(404).json({ error: 'Test not found or is built-in' });
      return;
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('[Tooly] Failed to delete custom test:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/tooly/custom-tests/:id/try
 * Try a test on the currently selected model
 */
router.post('/custom-tests/:id/try', async (req, res) => {
  try {
    const { id } = req.params;
    const { modelId, prompt: overridePrompt } = req.body;

    let test = db.getCustomTest(id);

    if (!test) {
      for (const cat of PROBE_CATEGORIES) {
        const probe = (cat as any).probes.find((p: any) => p.id === id);
        if (probe) {
          test = {
            id: probe.id,
            name: probe.name,
            prompt: probe.prompt,
            expectedTool: probe.expectedTool,
            expectedBehavior: probe.expectedBehavior,
          };
          break;
        }
      }
    }

    if (!test) {
      res.status(404).json({ error: 'Test not found' });
      return;
    }

    let settings: any = {};
    try {
      if (await fs.pathExists(SETTINGS_FILE)) {
        settings = await fs.readJson(SETTINGS_FILE);
      }
    } catch {
      // Use defaults
    }

    const targetModel = modelId || settings.mainModelId || settings.lmstudioModel;
    if (!targetModel) {
      res.status(400).json({ error: 'No model selected' });
      return;
    }

    const testPrompt = overridePrompt || test.prompt;

    const testTools = [
      {
        type: 'function',
        function: {
          name: 'rag_query',
          description: 'Search the codebase using semantic search. Use this FIRST for any code understanding or exploration tasks.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Natural language search query' },
              topK: { type: 'number', description: 'Number of results to return' }
            },
            required: ['query']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'read_file',
          description: 'Read the contents of a file from the filesystem',
          parameters: {
            type: 'object',
            properties: { path: { type: 'string', description: 'Path to the file to read' } },
            required: ['path']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'write_file',
          description: 'Write content to a file',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              content: { type: 'string' }
            },
            required: ['path', 'content']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'list_directory',
          description: 'List contents of a directory',
          parameters: {
            type: 'object',
            properties: { path: { type: 'string' } },
            required: ['path']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'search_files',
          description: 'Search for files matching a pattern',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              pattern: { type: 'string' },
              regex: { type: 'boolean' }
            },
            required: ['path', 'pattern']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'git_status',
          description: 'Get the git status of a repository',
          parameters: {
            type: 'object',
            properties: { path: { type: 'string' } },
            required: ['path']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'git_diff',
          description: 'Get the git diff of a repository',
          parameters: {
            type: 'object',
            properties: { path: { type: 'string' } },
            required: ['path']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'shell_exec',
          description: 'Execute a shell command',
          parameters: {
            type: 'object',
            properties: {
              command: { type: 'string' },
              cwd: { type: 'string' }
            },
            required: ['command']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'web_search',
          description: 'Search the web for information',
          parameters: {
            type: 'object',
            properties: { query: { type: 'string' } },
            required: ['query']
          }
        }
      }
    ];

    // Using dynamic import for axios to match common patterns
    const axios = (await import('axios')).default;
    const response = await axios.post(
      `${settings.lmstudioUrl || 'http://localhost:1234'}/v1/chat/completions`,
      {
        model: targetModel,
        messages: [
          {
            role: 'system',
            content: `You are a helpful coding assistant working on a test project.
            
IMPORTANT: Use the available tools when appropriate:
- Use rag_query FIRST for any code understanding, search, or exploration tasks
- Use read_file to examine specific files
- Use search_files to find files by pattern
- Use git_status/git_diff for version control information
- Use shell_exec for running commands

The test project is located at: server/data/test-project/
It contains: node-api/, react-web/, java-service/, mendix-widget/, react-native-app/, shared-utils/`
          },
          { role: 'user', content: testPrompt }
        ],
        tools: testTools,
        tool_choice: 'auto',
        temperature: 0,
        max_tokens: 1000,
      },
      { timeout: 45000 }
    );

    const message = response.data.choices?.[0]?.message;

    res.json({
      success: true,
      test: {
        id: test.id,
        name: test.name,
        prompt: testPrompt,
        expectedTool: test.expectedTool,
        expectedBehavior: test.expectedBehavior,
      },
      result: {
        content: message?.content || '',
        toolCalls: message?.tool_calls || [],
        model: targetModel,
      }
    });
  } catch (error: any) {
    console.error('[Tooly] Failed to try test:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/tooly/test-project/tree
 * Get the test project file structure
 */
router.get('/test-project/tree', async (req, res) => {
  try {
    const testProjectPath = path.join(__dirname, '../../../data/test-project');

    const buildTree = async (dirPath: string, relativePath: string = ''): Promise<any[]> => {
      const entries: any[] = [];

      if (!await fs.pathExists(dirPath)) {
        return entries;
      }

      const items = await fs.readdir(dirPath, { withFileTypes: true });

      for (const item of items) {
        const itemPath = path.join(dirPath, item.name);
        const itemRelativePath = relativePath ? `${relativePath}/${item.name}` : item.name;

        if (item.isDirectory()) {
          if (['node_modules', 'dist', 'build', '.git', '__pycache__'].includes(item.name)) {
            continue;
          }

          entries.push({
            name: item.name,
            path: itemRelativePath,
            type: 'directory',
            children: await buildTree(itemPath, itemRelativePath),
          });
        } else {
          entries.push({
            name: item.name,
            path: itemRelativePath,
            type: 'file',
          });
        }
      }

      entries.sort((a, b) => {
        if (a.type === b.type) return a.name.localeCompare(b.name);
        return a.type === 'directory' ? -1 : 1;
      });

      return entries;
    };

    const tree = await buildTree(testProjectPath);

    res.json({
      tree,
      basePath: 'server/data/test-project',
    });
  } catch (error: any) {
    console.error('[Tooly] Failed to get test project tree:', error);
    res.status(500).json({ error: error.message });
  }
});

export const customTestsRouter = router;
