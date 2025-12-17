import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs-extra';
import path from 'path';

// Load environment variables
dotenv.config();

// __dirname is available in CommonJS

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Configuration
const SESSIONS_DIR = path.join(__dirname, '../../sessions');

// Ensure sessions directory exists
fs.ensureDirSync(SESSIONS_DIR);

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
  pathRewrite: {
    '^/v1/chat/completions': '/v1/chat/completions'
  },
  onProxyReq: (proxyReq: any, req: any, res: any) => {
    // Add OpenAI API key from environment
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      proxyReq.setHeader('Authorization', `Bearer ${apiKey}`);
    }

    // Generate session ID for this request
    req.sessionId = uuidv4();
    req.requestBody = req.body;

    console.log(`[PROXY] Forwarding request to OpenAI: ${req.sessionId}`);
  },
  onProxyRes: (proxyRes: any, req: any, res: any) => {
    let body = '';
    proxyRes.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });

    proxyRes.on('end', async () => {
      try {
        const responseData = JSON.parse(body);

        // Create conversation turn
        const turn: ConversationTurn = {
          id: uuidv4(),
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
      } catch (error) {
        console.error('[PROXY] Error processing response:', error);
      }
    });
  },
  onError: (err: Error, req: any, res: any) => {
    console.error('[PROXY] Error:', err);
    res.status(500).json({ error: 'Proxy error' });
  }
} as any);

// Routes
app.use('/v1/chat/completions', openaiProxy);

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

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Summy proxy server running on port ${PORT}`);
  console.log(`📁 Sessions stored in: ${SESSIONS_DIR}`);
});
