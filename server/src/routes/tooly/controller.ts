import { Router } from 'express';
import { failureLog } from '../../services/failure-log.js';
import { prostheticStore, buildProstheticPrompt } from '../../modules/tooly/learning/prosthetic-store.js';
import { ComboTeachingLoop } from '../../modules/tooly/orchestrator/combo-teaching-loop.js';
import { ComboTester } from '../../modules/tooly/testing/combo-tester.js';
import { wsBroadcast } from '../../services/ws-broadcast.js';

const router = Router();

// Mock state (kept for status/start/stop)
let observerStatus = { running: false, lastActive: null as string | null };
let summary = {
  activeModels: 2,
  averageLatency: 145,
  errorRate: 2.3,
  recentAlerts: [] as any[]
};

// Teaching loop instances
const teachingLoops = new Map<string, ComboTeachingLoop>();

/**
 * GET /api/tooly/controller/status
 * Get controller status
 */
router.get('/controller/status', (req, res) => {
  res.json({
    observer: observerStatus,
    summary
  });
});

/**
 * POST /api/tooly/controller/start
 * Start observer
 */
router.post('/controller/start', (req, res) => {
  observerStatus.running = true;
  res.json({ status: observerStatus });
});

/**
 * POST /api/tooly/controller/stop
 * Stop observer
 */
router.post('/controller/stop', (req, res) => {
  observerStatus.running = false;
  observerStatus.lastActive = new Date().toISOString();
  res.json({ status: observerStatus });
});

/**
 * POST /api/tooly/controller/analyze
 * Run analysis
 */
router.post('/controller/analyze', (req, res) => {
  try {
    const failures = failureLog.getFailures();
    const analysis = {
      timestamp: new Date().toISOString(),
      issues: [] as any[],
      recommendations: [] as string[]
    };

    // Analyze Combo Failures
    const comboFailures = failures.filter(f => f.category === 'combo_pairing');
    const combos = new Set(comboFailures.map(f => `${f.modelId}|${f.executorModelId}`)); // Use pipe separator to avoid confusion with model names containing dashes

    for (const combo of combos) {
      const [main, exec] = combo.split('|');
      if (!main || !exec) continue;

      const specificFailures = comboFailures.filter(f => f.modelId === main && f.executorModelId === exec);
      
      analysis.issues.push({
        type: 'combo_pairing',
        severity: 'high',
        description: `Coordination failure between ${main} and ${exec}`,
        count: specificFailures.length,
        examples: specificFailures.slice(0, 3).map(f => f.error)
      });

      // Generate recommendation
      if (!prostheticStore.getForCombo(main, exec)) {
        analysis.recommendations.push(`Apply Level 1 Coordination Prosthetic to ${main} + ${exec}`);
      } else {
        analysis.recommendations.push(`Escalate Prosthetic for ${main} + ${exec} (Persisting failures)`);
      }
    }

    // Analyze Individual Failures
    const otherFailures = failures.filter(f => f.category !== 'combo_pairing');
    const models = new Set(otherFailures.map(f => f.modelId));

    for (const modelId of models) {
      const modelFailures = otherFailures.filter(f => f.modelId === modelId);
      if (modelFailures.length > 5) {
         analysis.issues.push({
          type: 'high_failure_rate',
          severity: 'medium',
          description: `High failure rate for ${modelId}`,
          count: modelFailures.length,
          examples: modelFailures.slice(0, 3).map(f => f.error)
        });
        
        if (!prostheticStore.getForModel(modelId)) {
           analysis.recommendations.push(`Generate Prosthetic for ${modelId}`);
        }
      }
    }

    res.json({ analysis });
  } catch (error: any) {
    console.error('[Controller] Analysis failed:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/tooly/controller/combo-teaching-results
 * Get combo teaching results
 */
router.get('/controller/combo-teaching-results', (req, res) => {
  // TODO: Retrieve persisted results if stored, or current active sessions
  res.json({ results: [] });
});

/**
 * POST /api/tooly/controller/run-combo-teaching
 * Run combo teaching session
 */
router.post('/controller/run-combo-teaching', async (req, res) => {
  const { mainModelId, executorModelId, contextSize } = req.body;

  if (!mainModelId || !executorModelId) {
    return res.status(400).json({ error: 'Missing model IDs' });
  }

  const comboId = `${mainModelId}-${executorModelId}`;
  
  // Use existing loop or create new one
  let loop = teachingLoops.get(comboId);
  if (!loop) {
    const tester = new ComboTester({
      mainModels: [mainModelId],
      executorModels: [executorModelId],
      lmstudioUrl: 'http://localhost:1234',
      contextSize: contextSize || 4096
    }, wsBroadcast.broadcast);
    
    loop = new ComboTeachingLoop(tester, wsBroadcast);
    teachingLoops.set(comboId, loop);
  }

  // Run in background (but we return result after completion for simple API usage, 
  // or return "started" and use WS for updates. The UI likely expects a result if it awaits.)
  // WORKING_MEMORY says "Auto-teach underperforming pairs". It might take time.
  // We'll run it and return the result.
  
  try {
    const result = await loop.runTeachingCycle(mainModelId, executorModelId);
    res.json({ result });
  } catch (error: any) {
    console.error('[Controller] Teaching cycle failed:', error);
    res.status(500).json({ error: error.message });
  }
});

export const controllerRouter = router;
