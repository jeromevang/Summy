"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const http_proxy_middleware_1 = require("http-proxy-middleware");
const uuid_1 = require("uuid");
const fs_extra_1 = __importDefault(require("fs-extra"));
const path_1 = __importDefault(require("path"));
// Load environment variables
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3001;
// Middleware
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Configuration
const SESSIONS_DIR = path_1.default.join(__dirname, '../../sessions');
// Ensure sessions directory exists
fs_extra_1.default.ensureDirSync(SESSIONS_DIR);
// Session storage functions
const saveSession = async (session) => {
    const filePath = path_1.default.join(SESSIONS_DIR, `${session.id}.json`);
    await fs_extra_1.default.writeJson(filePath, session, { spaces: 2 });
};
const loadSession = async (sessionId) => {
    try {
        const filePath = path_1.default.join(SESSIONS_DIR, `${sessionId}.json`);
        return await fs_extra_1.default.readJson(filePath);
    }
    catch {
        return null;
    }
};
const listSessions = async () => {
    const files = await fs_extra_1.default.readdir(SESSIONS_DIR);
    const sessions = [];
    for (const file of files) {
        if (file.endsWith('.json')) {
            try {
                const session = await fs_extra_1.default.readJson(path_1.default.join(SESSIONS_DIR, file));
                sessions.push(session);
            }
            catch {
                // Skip invalid files
            }
        }
    }
    return sessions.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
};
// OpenAI Proxy Middleware
const openaiProxy = (0, http_proxy_middleware_1.createProxyMiddleware)({
    target: 'https://api.openai.com',
    changeOrigin: true,
    pathRewrite: {
        '^/v1/chat/completions': '/v1/chat/completions'
    },
    onProxyReq: (proxyReq, req, res) => {
        // Add OpenAI API key from environment
        const apiKey = process.env.OPENAI_API_KEY;
        if (apiKey) {
            proxyReq.setHeader('Authorization', `Bearer ${apiKey}`);
        }
        // Generate session ID for this request
        req.sessionId = (0, uuid_1.v4)();
        req.requestBody = req.body;
        console.log(`[PROXY] Forwarding request to OpenAI: ${req.sessionId}`);
    },
    onProxyRes: (proxyRes, req, res) => {
        let body = '';
        proxyRes.on('data', (chunk) => {
            body += chunk.toString();
        });
        proxyRes.on('end', async () => {
            try {
                const responseData = JSON.parse(body);
                // Create conversation turn
                const turn = {
                    id: (0, uuid_1.v4)(),
                    timestamp: new Date().toISOString(),
                    request: req.requestBody,
                    response: responseData
                };
                // Load or create session
                let session = await loadSession(req.sessionId);
                if (!session) {
                    session = {
                        id: req.sessionId,
                        name: `Session ${new Date().toLocaleString()}`,
                        ide: req.headers['x-ide'] || 'Unknown',
                        created: new Date().toISOString(),
                        conversations: []
                    };
                }
                // Add turn to session
                session.conversations.push(turn);
                // Save session
                await saveSession(session);
                console.log(`[PROXY] Captured conversation turn: ${turn.id}`);
            }
            catch (error) {
                console.error('[PROXY] Error processing response:', error);
            }
        });
    },
    onError: (err, req, res) => {
        console.error('[PROXY] Error:', err);
        res.status(500).json({ error: 'Proxy error' });
    }
});
// Routes
app.use('/v1/chat/completions', openaiProxy);
// Session management API
app.get('/api/sessions', async (req, res) => {
    try {
        const sessions = await listSessions();
        res.json(sessions);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to load sessions' });
    }
});
app.get('/api/sessions/:id', async (req, res) => {
    try {
        const session = await loadSession(req.params.id);
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }
        res.json(session);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to load session' });
    }
});
app.post('/api/sessions', async (req, res) => {
    try {
        const session = {
            id: (0, uuid_1.v4)(),
            name: req.body.name || `Session ${new Date().toLocaleString()}`,
            ide: req.body.ide || 'Unknown',
            created: new Date().toISOString(),
            conversations: []
        };
        await saveSession(session);
        res.json(session);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to create session' });
    }
});
app.put('/api/sessions/:id', async (req, res) => {
    try {
        const session = await loadSession(req.params.id);
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }
        // Update session properties
        if (req.body.name)
            session.name = req.body.name;
        if (req.body.conversations)
            session.conversations = req.body.conversations;
        await saveSession(session);
        res.json(session);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to update session' });
    }
});
app.delete('/api/sessions/:id', async (req, res) => {
    try {
        const filePath = path_1.default.join(SESSIONS_DIR, `${req.params.id}.json`);
        await fs_extra_1.default.remove(filePath);
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete session' });
    }
});
// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// Start server
app.listen(PORT, () => {
    console.log(`🚀 Summy proxy server running on port ${PORT}`);
    console.log(`📁 Sessions stored in: ${SESSIONS_DIR}`);
});
//# sourceMappingURL=index.js.map