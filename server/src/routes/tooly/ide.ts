import { Router } from 'express';
import { ideMapping } from '../../services/ide-mapping.js';
import { ALL_TOOLS } from '../../modules/tooly/capabilities.js';

const router = Router();

/**
 * GET /api/tooly/ide-mappings
 * List all available IDE mappings
 */
router.get('/ide-mappings', async (req, res) => {
  try {
    const ides = await ideMapping.listAvailableIDEs();
    const mappings = await Promise.all(
      ides.map(async (ide) => {
        const mapping = await ideMapping.loadIDEMapping(ide);
        return {
          ide: mapping.ide,
          suffix: mapping.modelSuffix,
          stats: ideMapping.getMappingStats(ALL_TOOLS, mapping)
        };
      })
    );
    res.json({ mappings });
  } catch (error: any) {
    console.error('[Tooly] Failed to list IDE mappings:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/tooly/ide-mappings/:ide
 * Get specific IDE mapping details
 */
router.get('/ide-mappings/:ide', async (req, res) => {
  try {
    const { ide } = req.params;
    const mapping = await ideMapping.loadIDEMapping(ide);
    res.json({
      mapping,
      stats: ideMapping.getMappingStats(ALL_TOOLS, mapping)
    });
  } catch (error: any) {
    console.error('[Tooly] Failed to get IDE mapping:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/tooly/ide-mappings/:ide/reload
 * Reload an IDE mapping (for hot-reload after editing JSON)
 */
router.post('/ide-mappings/:ide/reload', async (req, res) => {
  try {
    const { ide } = req.params;
    const mapping = await ideMapping.reloadIDEMapping(ide);
    if (mapping) {
      res.json({
        success: true,
        mapping,
        stats: ideMapping.getMappingStats(ALL_TOOLS, mapping)
      });
    } else {
      res.status(404).json({ error: `IDE mapping '${ide}' not found` });
    }
  } catch (error: any) {
    console.error('[Tooly] Failed to reload IDE mapping:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/tooly/parse-model
 * Parse a model name to detect IDE suffix
 */
router.post('/parse-model', (req, res) => {
  try {
    const { model } = req.body;
    if (!model) {
      return res.status(400).json({ error: 'model is required' });
    }
    const parsed = ideMapping.parseModelIDE(model);
    res.json(parsed);
  } catch (error: any) {
    console.error('[Tooly] Failed to parse model:', error);
    res.status(500).json({ error: error.message });
  }
});

export const ideRouter = router;
