/**
 * Compression Sessions API Routes
 *
 * REST API endpoints for managing smart context compression sessions.
 *
 * Part of Smart Context Compression System
 */

import express, { Router, Request, Response } from 'express';
import { compressionSessionService } from '../services/compression-session-service.js';
import { compressionTurnService } from '../services/compression-turn-service.js';
import { MessageAnalyzer, SmartCompressor, RAGCompressor } from '../modules/tooly/context/index.js';
import type { Turn } from '../modules/tooly/context/index.js';
import { wsBroadcast } from '../services/ws-broadcast.js';

const router: Router = express.Router();

// ============================================================
// COMPRESSION SESSIONS CRUD
// ============================================================

/**
 * GET /api/compression-sessions
 * Get all compression sessions
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    const sessions = await compressionSessionService.getAllSessions(limit, offset);

    res.json({
      sessions,
      pagination: {
        limit,
        offset,
        total: sessions.length
      }
    });
  } catch (error: any) {
    console.error('[CompressionSessions] Failed to get sessions:', error);
    res.status(500).json({ error: 'Failed to get sessions', message: error.message });
  }
});

/**
 * GET /api/compression-sessions/stats
 * Get compression statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = await compressionSessionService.getSessionStats();
    res.json(stats);
  } catch (error: any) {
    console.error('[CompressionSessions] Failed to get stats:', error);
    res.status(500).json({ error: 'Failed to get stats', message: error.message });
  }
});

/**
 * GET /api/compression-sessions/:id
 * Get session by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const session = await compressionSessionService.getSessionById(req.params.id);

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    res.json(session);
  } catch (error: any) {
    console.error('[CompressionSessions] Failed to get session:', error);
    res.status(500).json({ error: 'Failed to get session', message: error.message });
  }
});

/**
 * POST /api/compression-sessions
 * Create or update compression session
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      claudeSessionId,
      transcript,
      compressionEnabled,
      compressionMode,
      llmProvider,
      useRAG
    } = req.body;

    if (!transcript) {
      res.status(400).json({ error: 'transcript is required' });
      return;
    }

    // Parse transcript
    const messages = parseJSONL(transcript);

    if (messages.length === 0) {
      res.status(400).json({ error: 'No valid messages in transcript' });
      return;
    }

    let compressionResult;

    // Perform compression if enabled
    if (compressionEnabled !== false) {
      try {
        compressionResult = await performCompression(messages, {
          mode: compressionMode || 'conservative',
          provider: llmProvider || 'lmstudio',
          useRAG: useRAG || false
        });
      } catch (compressionError: any) {
        console.error('[CompressionSessions] Compression failed:', compressionError);
        // Continue without compression
        compressionResult = undefined;
      }
    }

    // Create or find session
    const session = await compressionSessionService.findOrCreateSession({
      claudeSessionId,
      transcript,
      compressionEnabled: compressionEnabled !== false,
      compressionMode: compressionMode || 'conservative',
      llmProvider: llmProvider || 'lmstudio',
      useRAG: useRAG || false,
      compressionResult
    });

    // Broadcast update
    wsBroadcast.broadcast('compression-session-created', {
      sessionId: session.id,
      stats: session.stats
    });

    res.json(session);
  } catch (error: any) {
    console.error('[CompressionSessions] Failed to create session:', error);
    res.status(500).json({ error: 'Failed to create session', message: error.message });
  }
});

/**
 * PUT /api/compression-sessions/:id/toggle
 * Toggle compression enabled/disabled
 */
router.put('/:id/toggle', async (req: Request, res: Response) => {
  try {
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      res.status(400).json({ error: 'enabled must be a boolean' });
      return;
    }

    const session = await compressionSessionService.toggleCompression(req.params.id, enabled);

    // Broadcast update
    wsBroadcast.broadcast('compression-session-toggled', {
      sessionId: session.id,
      enabled: session.compressionEnabled
    });

    res.json(session);
  } catch (error: any) {
    console.error('[CompressionSessions] Failed to toggle compression:', error);
    res.status(500).json({ error: 'Failed to toggle compression', message: error.message });
  }
});

/**
 * PUT /api/compression-sessions/:id/settings
 * Update compression settings
 */
router.put('/:id/settings', async (req: Request, res: Response) => {
  try {
    const { mode, provider, useRAG } = req.body;

    const session = await compressionSessionService.updateSettings(req.params.id, {
      mode,
      provider,
      useRAG
    });

    // Broadcast update
    wsBroadcast.broadcast('compression-session-updated', {
      sessionId: session.id,
      settings: {
        mode: session.compressionMode,
        provider: session.llmProvider,
        useRAG: session.useRAG
      }
    });

    res.json(session);
  } catch (error: any) {
    console.error('[CompressionSessions] Failed to update settings:', error);
    res.status(500).json({ error: 'Failed to update settings', message: error.message });
  }
});

/**
 * GET /api/compression-sessions/:id/comparison
 * Get side-by-side comparison
 */
router.get('/:id/comparison', async (req: Request, res: Response) => {
  try {
    const exported = await compressionSessionService.exportSession(req.params.id);

    // Parse JSONL to messages
    const uncompressed = parseJSONL(exported.uncompressed);
    const compressed = parseJSONL(exported.compressed);

    res.json({
      uncompressed,
      compressed,
      decisions: exported.decisions,
      stats: exported.stats
    });
  } catch (error: any) {
    console.error('[CompressionSessions] Failed to get comparison:', error);
    res.status(500).json({ error: 'Failed to get comparison', message: error.message });
  }
});

/**
 * DELETE /api/compression-sessions/:id
 * Delete session
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await compressionSessionService.deleteSession(req.params.id);

    // Broadcast update
    wsBroadcast.broadcast('compression-session-deleted', {
      sessionId: req.params.id
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error('[CompressionSessions] Failed to delete session:', error);
    res.status(500).json({ error: 'Failed to delete session', message: error.message });
  }
});

// ============================================================
// COMPRESSION TURNS (HISTORY)
// ============================================================

/**
 * GET /api/compression-sessions/:id/turns
 * Get turn history for a session
 */
router.get('/:id/turns', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await compressionTurnService.getTurnsPaginated(
      req.params.id,
      limit,
      offset
    );

    res.json(result);
  } catch (error: any) {
    console.error('[CompressionSessions] Failed to get turns:', error);
    res.status(500).json({ error: 'Failed to get turns', message: error.message });
  }
});

/**
 * GET /api/compression-sessions/:id/turns/:turnNumber
 * Get specific turn
 */
router.get('/:id/turns/:turnNumber', async (req: Request, res: Response) => {
  try {
    const turnNumber = parseInt(req.params.turnNumber);

    const turn = await compressionTurnService.getTurnByNumber(
      req.params.id,
      turnNumber
    );

    if (!turn) {
      res.status(404).json({ error: 'Turn not found' });
      return;
    }

    res.json(turn);
  } catch (error: any) {
    console.error('[CompressionSessions] Failed to get turn:', error);
    res.status(500).json({ error: 'Failed to get turn', message: error.message });
  }
});

/**
 * GET /api/compression-sessions/:id/timeline
 * Get compression timeline for visualization
 */
router.get('/:id/timeline', async (req: Request, res: Response) => {
  try {
    const timeline = await compressionTurnService.getCompressionTimeline(req.params.id);
    res.json(timeline);
  } catch (error: any) {
    console.error('[CompressionSessions] Failed to get timeline:', error);
    res.status(500).json({ error: 'Failed to get timeline', message: error.message });
  }
});

/**
 * GET /api/compression-sessions/:id/aggregated-stats
 * Get aggregated statistics for a session
 */
router.get('/:id/aggregated-stats', async (req: Request, res: Response) => {
  try {
    const stats = await compressionTurnService.getSessionAggregatedStats(req.params.id);
    res.json(stats);
  } catch (error: any) {
    console.error('[CompressionSessions] Failed to get aggregated stats:', error);
    res.status(500).json({ error: 'Failed to get aggregated stats', message: error.message });
  }
});

// ============================================================
// COMPRESSION EXECUTION (ON-DEMAND)
// ============================================================

/**
 * POST /api/compression-sessions/:id/compress
 * Manually trigger compression on a session
 */
router.post('/:id/compress', async (req: Request, res: Response) => {
  try {
    const session = await compressionSessionService.getSessionById(req.params.id);

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    // Parse uncompressed data
    const messages = parseJSONL(session.uncompressedData);

    // Perform compression
    const result = await performCompression(messages, {
      mode: session.compressionMode,
      provider: session.llmProvider,
      useRAG: session.useRAG
    });

    // Update session
    const updated = await compressionSessionService.updateSession(session.id, {
      compressionResult: result
    });

    // Create turn
    await compressionTurnService.createTurn({
      sessionId: session.id,
      messageCount: messages.length,
      uncompressedSnapshot: session.uncompressedData,
      compressedSnapshot: messagesToJSONL(result.compressedTranscript),
      decisions: result.decisions,
      stats: result.stats,
      triggerReason: 'manual'
    });

    // Broadcast update
    wsBroadcast.broadcast('compression-executed', {
      sessionId: session.id,
      stats: result.stats
    });

    res.json({
      session: updated,
      result
    });
  } catch (error: any) {
    console.error('[CompressionSessions] Failed to compress:', error);
    res.status(500).json({ error: 'Failed to compress', message: error.message });
  }
});

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Parse JSONL string to messages
 */
function parseJSONL(jsonl: string): Turn[] {
  const lines = jsonl.trim().split('\n');
  const messages: Turn[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;

    try {
      const parsed = JSON.parse(line);
      if (parsed.role && parsed.content) {
        messages.push({
          role: parsed.role,
          content: parsed.content,
          toolCalls: parsed.tool_calls || parsed.toolCalls
        });
      }
    } catch (error) {
      console.warn('[CompressionSessions] Failed to parse JSONL line:', line.substring(0, 50));
    }
  }

  return messages;
}

/**
 * Convert messages to JSONL string
 */
function messagesToJSONL(messages: any[]): string {
  return messages.map(msg => JSON.stringify(msg)).join('\n');
}

/**
 * Perform compression
 */
async function performCompression(
  messages: Turn[],
  options: {
    mode: string;
    provider: string;
    useRAG: boolean;
  }
): Promise<any> {
  // Step 1: Analyze messages
  const analyzer = new MessageAnalyzer({
    provider: options.provider as 'lmstudio' | 'claude',
    lmstudioUrl: process.env.LMSTUDIO_URL || 'http://localhost:1234',
    claudeApiKey: process.env.ANTHROPIC_API_KEY || ''
  });

  let scores = await analyzer.analyzeConversation(messages);

  // Step 2: RAG enhancement (optional)
  if (options.useRAG) {
    const ragCompressor = new RAGCompressor({
      enabled: true,
      ragServerUrl: process.env.RAG_SERVER_URL || 'http://localhost:3002'
    });

    const ragAvailable = await ragCompressor.checkAvailability();
    if (ragAvailable) {
      scores = await ragCompressor.enhanceScores(messages, scores);
    }
  }

  // Step 3: Compress
  const compressor = new SmartCompressor({
    mode: options.mode as any,
    skipLast: 5,
    preserveToolCalls: true
  });

  return await compressor.compress(messages, scores);
}

export default router;
