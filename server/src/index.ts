import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// General request logging middleware - captures EVERYTHING from ngrok
app.use((req, res, next) => {
  // Skip logging internal health/debug endpoints to reduce noise
  if (req.url === '/health' || req.url === '/debug' || req.url.startsWith('/debug/')) {
    return next();
  }

  addDebugEntry('request', `INCOMING: ${req.method} ${req.url}`, {
    headers: req.headers,
    query: req.query,
    body: req.method === 'POST' ? req.body : undefined,
    userAgent: req.headers['user-agent'],
    contentType: req.headers['content-type'],
    contentLength: req.headers['content-length'],
    timestamp: new Date().toISOString()
  });

  // Continue to next middleware (including proxy)
  next();
});

// Configuration
const SESSIONS_DIR = path.join(__dirname, '../../sessions');

// Ensure sessions directory exists
fs.ensureDirSync(SESSIONS_DIR);

// Debug logging
interface DebugEntry {
  timestamp: string;
  type: 'request' | 'response' | 'session' | 'error';
  message: string;
  data?: any;
}

const debugLog: DebugEntry[] = [];
const MAX_DEBUG_ENTRIES = 100;
const sessionCache: { [key: string]: any } = {}; // Simple cache for session count

const addDebugEntry = (type: DebugEntry['type'], message: string, data?: any) => {
  debugLog.unshift({
    timestamp: new Date().toISOString(),
    type,
    message,
    data
  });

  // Keep only recent entries
  if (debugLog.length > MAX_DEBUG_ENTRIES) {
    debugLog.splice(MAX_DEBUG_ENTRIES);
  }

  console.log(`[${type.toUpperCase()}] ${message}`);
};

// Types
interface ConversationTurn {
  id: string;
  timestamp: string;
  request: any;
  response?: any;
}

interface ContextSession {
  id: string;
  name: string;
  ide: string;
  created: string;
  conversations: ConversationTurn[];
  originalSize?: number;
  summarizedSize?: number;
  summary?: any;
}

// Conversation ID extraction function
const extractConversationId = (req: any): string => {
  const body = req.body || {};
  const headers = req.headers || {};

  // Try different sources for conversation ID:

  // 1. Custom header from IDE
  if (headers['x-conversation-id'] || headers['x-session-id']) {
    return headers['x-conversation-id'] || headers['x-session-id'];
  }

  // 2. Conversation ID in request body (if IDE sends it)
  if (body.conversation_id || body.session_id) {
    return body.conversation_id || body.session_id;
  }

  // 3. Generate ID based on first user message (content hash + timestamp)
  if (body.messages && body.messages.length > 0) {
    const firstUserMessage = body.messages.find((msg: any) => msg.role === 'user');
    if (firstUserMessage && firstUserMessage.content) {
      // Create a hash of the first user message + timestamp for uniqueness
      const content = typeof firstUserMessage.content === 'string'
        ? firstUserMessage.content
        : JSON.stringify(firstUserMessage.content);
      const timestamp = Date.now();
      const hashInput = `${content.substring(0, 50)}-${timestamp}`;
      return Buffer.from(hashInput).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 16);
    }
  }

  // 4. Fallback to timestamp-based ID
  return `conv_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
};

// Session storage functions
const saveSession = async (session: ContextSession): Promise<void> => {
  const filePath = path.join(SESSIONS_DIR, `${session.id}.json`);
  await fs.writeJson(filePath, session, { spaces: 2 });
};

const loadSession = async (sessionId: string): Promise<ContextSession | null> => {
  try {
    const filePath = path.join(SESSIONS_DIR, `${sessionId}.json`);
    return await fs.readJson(filePath);
  } catch {
    return null;
  }
};

const listSessions = async (): Promise<ContextSession[]> => {
  const files = await fs.readdir(SESSIONS_DIR);
  const sessions: ContextSession[] = [];

  for (const file of files) {
    if (file.endsWith('.json')) {
      try {
        const session = await fs.readJson(path.join(SESSIONS_DIR, file));
        sessions.push(session);
      } catch {
        // Skip invalid files
      }
    }
  }

  return sessions.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
};

// Extend Express Request type for our custom properties
declare global {
  namespace Express {
    interface Request {
      sessionId?: string;
      requestBody?: any;
    }
  }
}

// OpenAI Proxy Middleware
const openaiProxy = createProxyMiddleware({
  target: 'https://api.openai.com',
  changeOrigin: true,
  timeout: 30000, // 30 second timeout
  pathRewrite: (path: string) => {
    // Handle both /chat/completions and /v1/chat/completions
    if (path.startsWith('/chat/completions')) {
      return path.replace('/chat/completions', '/v1/chat/completions');
    }
    // Keep /v1/chat/completions as-is
    return path;
  },
  onProxyReq: (proxyReq: any, req: any, res: any) => {
    // Log incoming request FIRST (before any validation)
    req.requestBody = req.body;
    req.sessionId = extractConversationId(req);
    req.conversationId = req.sessionId;

    addDebugEntry('request', `Incoming request: ${req.sessionId}`, {
      method: req.method,
      url: req.url,
      userAgent: req.headers['user-agent'],
      contentLength: req.headers['content-length'],
      hasApiKey: !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_api_key_here'
    });

    // Validate OpenAI API key AFTER logging
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey === 'your_openai_api_key_here') {
      addDebugEntry('error', `Rejected request ${req.sessionId}: OpenAI API key not configured`, { missingKey: true });
      res.status(500).json({
        error: 'Configuration Error',
        message: 'OpenAI API key not configured. Please set OPENAI_API_KEY in server/.env file.'
      });
      return;
    }

    proxyReq.setHeader('Authorization', `Bearer ${apiKey}`);
  },
  onProxyRes: (proxyRes: any, req: any, res: any) => {
    let body = '';
    proxyRes.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });

    proxyRes.on('end', async () => {
      try {
        let responseData;
        try {
          responseData = JSON.parse(body);
        } catch {
          // If response isn't JSON, create a text response
          responseData = { error: 'Non-JSON response', content: body };
        }

        // Always create session, even on errors
        const turn: ConversationTurn = {
          id: uuidv4(),
          timestamp: new Date().toISOString(),
          request: req.requestBody,
          response: responseData
        };

        // Load or create session
        let session = await loadSession(req.sessionId);
        if (!session) {
          // Extract meaningful name from first message
          let sessionName = `Conversation ${new Date().toLocaleString()}`;
          if (req.requestBody?.messages?.length > 0) {
            const firstMessage = req.requestBody.messages[0];
            if (firstMessage.role === 'user' && firstMessage.content) {
              const content = typeof firstMessage.content === 'string'
                ? firstMessage.content
                : JSON.stringify(firstMessage.content);
              sessionName = content.substring(0, 50) + (content.length > 50 ? '...' : '');
            }
          }

          session = {
            id: req.sessionId,
            name: sessionName,
            ide: req.headers['x-ide'] || req.headers['user-agent']?.split(' ')[0] || 'Unknown',
            created: new Date().toISOString(),
            conversations: []
          };

          addDebugEntry('session', `Auto-created session: ${session.id}`, {
            name: session.name,
            ide: session.ide
          });
        }

        // Add turn to session
        session.conversations.push(turn);

        // Save session
        await saveSession(session);

        const status = proxyRes.statusCode >= 200 && proxyRes.statusCode < 300 ? 'success' : 'error';
        addDebugEntry('response', `Captured turn ${session.conversations.length} for session: ${session.id} (${status})`, {
          turnCount: session.conversations.length,
          statusCode: proxyRes.statusCode,
          tokens: turn.response?.usage?.total_tokens,
          error: turn.response?.error
        });
      } catch (error) {
        addDebugEntry('error', `Failed to process response for session ${req.sessionId}`, { error: String(error) });
        console.error('[PROXY] Error processing response:', error);
      }
    });
  },
  onError: (err: Error, req: any, res: any) => {
    console.error('[PROXY] Error:', err);
    res.status(500).json({ error: 'Proxy error' });
  }
} as any);

// Routes - handle both standard and simplified paths
app.use('/v1/chat/completions', openaiProxy);
app.use('/chat/completions', openaiProxy);

// Session management API
app.get('/api/sessions', async (req, res) => {
  try {
    const sessions = await listSessions();
    res.json(sessions);
  } catch (error) {
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
  } catch (error) {
    res.status(500).json({ error: 'Failed to load session' });
  }
});

app.post('/api/sessions', async (req, res) => {
  try {
    const session: ContextSession = {
      id: uuidv4(),
      name: req.body.name || `Session ${new Date().toLocaleString()}`,
      ide: req.body.ide || 'Unknown',
      created: new Date().toISOString(),
      conversations: []
    };

    await saveSession(session);
    res.json(session);
  } catch (error) {
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
    if (req.body.name) session.name = req.body.name;
    if (req.body.conversations) session.conversations = req.body.conversations;

    await saveSession(session);
    res.json(session);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update session' });
  }
});

app.delete('/api/sessions/:id', async (req, res) => {
  try {
    const filePath = path.join(SESSIONS_DIR, `${req.params.id}.json`);
    await fs.remove(filePath);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Debug endpoint
app.get('/debug', async (req, res) => {
  try {
    const sessions = await listSessions();
    res.json({
      entries: debugLog,
      sessionCount: sessions.length,
      uptime: process.uptime(),
      lastActivity: debugLog[0]?.timestamp || null
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get debug info' });
  }
});

// Clear debug log
app.post('/debug/clear', (req, res) => {
  debugLog.length = 0;
  addDebugEntry('session', 'Debug log cleared');
  res.json({ success: true });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Summy proxy server running on port ${PORT}`);
  console.log(`📁 Sessions stored in: ${SESSIONS_DIR}`);
});
