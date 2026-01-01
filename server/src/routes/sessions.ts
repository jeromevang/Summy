import express, { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../services/database.js';
import { SessionService, type ContextSession } from '../services/session-service.js';
import { CompressionEngine, type CompressionConfig } from '../services/compression-engine.js';
import { addDebugEntry } from '../services/logger.js';

const router: Router = express.Router();

// ============================================================
// LEGACY SESSIONS API (Backward compatibility)
// ============================================================

router.get('/', async (req, res) => {
    try {
        const dbSessions = db.listContextSessions();
        const sessions = dbSessions.map(s => ({
            id: s.id,
            name: s.name,
            ide: s.ide,
            created: s.createdAt,
            turnCount: s.turns.length
        }));
        res.json(sessions);
    } catch (error) {
        res.status(500).json({ error: 'Failed to load sessions' });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const dbSession = db.getContextSession(req.params.id);
        if (!dbSession) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const session: ContextSession = {
            id: dbSession.id,
            name: dbSession.name,
            ide: dbSession.ide,
            created: dbSession.createdAt,
            conversations: dbSession.turns.map(turn => ({
                id: turn.id,
                timestamp: turn.createdAt || new Date().toISOString(),
                request: turn.rawRequest,
                response: turn.rawResponse
            }))
        };

        res.json(session);
    } catch (error) {
        res.status(500).json({ error: 'Failed to load session' });
    }
});

router.post('/', async (req, res) => {
    try {
        const id = uuidv4();
        const name = req.body.name || `Session ${new Date().toLocaleString()}`;
        const ide = req.body.ide || 'Unknown';

        db.createContextSession({ id, name, ide });

        res.json({ id, name, ide, created: new Date().toISOString(), conversations: [] });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create session' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const deleted = db.deleteContextSession(req.params.id);
        if (!deleted) {
            return res.status(404).json({ error: 'Session not found' });
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete session' });
    }
});

router.delete('/', async (req, res) => {
    try {
        const deleted = db.clearAllContextSessions();
        addDebugEntry('session', `🗑️ Cleared all sessions: ${deleted} deleted`, {});
        res.json({ success: true, deleted });
    } catch (error) {
        res.status(500).json({ error: 'Failed to clear sessions' });
    }
});

// ============================================================
// CONTEXT SESSIONS API (Normalized database)
// ============================================================

router.get('/context/list', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit as string) || 50;
        const offset = parseInt(req.query.offset as string) || 0;
        const sessions = db.listContextSessions(limit, offset);
        res.json(sessions);
    } catch (error: any) {
        console.error('[API] Failed to list context sessions:', error.message);
        res.status(500).json({ error: 'Failed to load sessions' });
    }
});

router.get('/context/:id', async (req, res) => {
    try {
        const session = db.getContextSession(req.params.id);
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }
        res.json(session);
    } catch (error: any) {
        console.error('[API] Failed to get context session:', error.message);
        res.status(500).json({ error: 'Failed to load session' });
    }
});

// ============================================================
// COMPRESSION API
// ============================================================

router.post('/:id/compression', async (req, res) => {
    try {
        const session = await SessionService.loadSession(req.params.id);
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        session.compression = {
            mode: req.body.mode ?? 1,
            keepRecent: req.body.keepRecent ?? 5,
            enabled: req.body.enabled ?? true,
            lastCompressed: session.compression?.lastCompressed,
            stats: session.compression?.stats
        };

        await SessionService.saveSession(session);
        res.json(session);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update compression settings' });
    }
});

router.post('/:id/compress', async (req, res) => {
    try {
        const session = await SessionService.loadSession(req.params.id);
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        if (!session.conversations || session.conversations.length === 0) {
            return res.status(400).json({ error: 'No conversations to compress' });
        }

        const config: CompressionConfig = {
            mode: req.body.mode ?? session.compression?.mode ?? 1,
            keepRecent: req.body.keepRecent ?? session.compression?.keepRecent ?? 5,
            enabled: true
        };

        const allMessages: any[] = [];
        for (const turn of session.conversations) {
            if (turn.request?.messages) {
                const lastUserMsg = turn.request.messages.filter((m: any) => m.role === 'user').pop();
                if (lastUserMsg) allMessages.push(lastUserMsg);

                const assistantWithTools = turn.request.messages.find((m: any) => m.role === 'assistant' && m.tool_calls);
                if (assistantWithTools) allMessages.push(assistantWithTools);

                const toolMessages = turn.request.messages.filter((m: any) => m.role === 'tool');
                allMessages.push(...toolMessages);
            }

            if (turn.response) {
                if (turn.response.type === 'streaming') {
                    allMessages.push({ role: 'assistant', content: turn.response.content });
                } else if (turn.response.choices?.[0]?.message) {
                    allMessages.push(turn.response.choices[0].message);
                }
            }
        }

        const result = await CompressionEngine.compressMessages(allMessages, config);

        session.compression = {
            ...config,
            lastCompressed: new Date().toISOString(),
            stats: result.stats
        };
        session.compressedConversations = result.compressed.map((msg, idx) => ({
            id: `compressed-${idx}`,
            timestamp: new Date().toISOString(),
            request: { messages: [msg] },
            response: undefined,
            toolyMeta: { mode: 'single', phases: [] }
        }));

        await SessionService.saveSession(session);

        res.json({
            success: true,
            stats: result.stats,
            originalCount: allMessages.length,
            compressedCount: result.compressed.length
        });
    } catch (error: any) {
        res.status(500).json({ error: 'Compression failed', message: error.message });
    }
});

router.get('/:id/compressions', async (req, res) => {
    try {
        const session = await SessionService.loadSession(req.params.id);
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const allMessages: any[] = [];
        for (const turn of session.conversations) {
            if (turn.request?.messages) {
                const lastUserMsg = turn.request.messages.filter((m: any) => m.role === 'user').pop();
                if (lastUserMsg) allMessages.push(lastUserMsg);

                const assistantWithTools = turn.request.messages.find((m: any) => m.role === 'assistant' && m.tool_calls);
                if (assistantWithTools) allMessages.push(assistantWithTools);

                const toolMessages = turn.request.messages.filter((m: any) => m.role === 'tool');
                allMessages.push(...toolMessages);
            }

            if (turn.response) {
                if (turn.response.type === 'streaming') {
                    allMessages.push({ role: 'assistant', content: turn.response.content });
                } else if (turn.response.choices?.[0]?.message) {
                    allMessages.push(turn.response.choices[0].message);
                }
            }
        }

        const keepRecent = session.compression?.keepRecent || 5;

        if (session.cachedCompressions &&
            session.cachedCompressions.messageCount === allMessages.length &&
            session.cachedCompressions.keepRecent === keepRecent) {
            return res.json({
                none: { messages: allMessages, stats: { originalTokens: Math.round(JSON.stringify(allMessages).length / 4), compressedTokens: Math.round(JSON.stringify(allMessages).length / 4), ratio: 0 } },
                light: session.cachedCompressions.light,
                medium: session.cachedCompressions.medium,
                aggressive: session.cachedCompressions.aggressive,
                cached: true
            });
        }

        const savedSystemPrompt = session.compression?.systemPrompt || null;
        const baseConfig: CompressionConfig = { keepRecent, enabled: true, systemPrompt: savedSystemPrompt, mode: 1 };

        const [lightResult, mediumResult, aggressiveResult] = await Promise.all([
            CompressionEngine.compressMessages(allMessages, { ...baseConfig, mode: 1 }),
            CompressionEngine.compressMessages(allMessages, { ...baseConfig, mode: 2 }),
            CompressionEngine.compressMessages(allMessages, { ...baseConfig, mode: 3 })
        ]);

        session.cachedCompressions = {
            messageCount: allMessages.length,
            keepRecent: keepRecent,
            lastComputed: new Date().toISOString(),
            light: { messages: lightResult.compressed, stats: lightResult.stats },
            medium: { messages: mediumResult.compressed, stats: mediumResult.stats },
            aggressive: { messages: aggressiveResult.compressed, stats: aggressiveResult.stats }
        };
        await SessionService.saveSession(session);

        res.json({
            none: { messages: allMessages, stats: { originalTokens: Math.round(JSON.stringify(allMessages).length / 4), compressedTokens: Math.round(JSON.stringify(allMessages).length / 4), ratio: 0 } },
            light: session.cachedCompressions.light,
            medium: session.cachedCompressions.medium,
            aggressive: session.cachedCompressions.aggressive,
            cached: false
        });
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to get compressions', message: error.message });
    }
});

router.post('/:id/recompress', async (req, res) => {
    try {
        const session = await SessionService.loadSession(req.params.id);
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        delete session.cachedCompressions;
        delete session.compressedConversations;
        await SessionService.saveSession(session);

        res.json({ success: true, message: 'Compression cache cleared' });
    } catch (error: any) {
        res.status(500).json({ error: 'Re-compression failed', message: error.message });
    }
});

export default router;
