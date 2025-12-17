import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';

// Load environment variables
dotenv.config();

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// General request logging middleware - captures EVERYTHING from ngrok
app.use((req, res, next) => {
  // Skip logging internal endpoints to reduce noise
  if (req.url === '/health' || req.url === '/debug' || req.url.startsWith('/debug/') || req.url === '/api/sessions') {
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

  // Continue to next middleware
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

// WebSocket clients
const wsClients: Set<any> = new Set();

// Broadcast to all connected WebSocket clients
const broadcastToClients = (type: string, data: any) => {
  const message = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
  wsClients.forEach(client => {
    if (client.readyState === client.OPEN) {
      client.send(message);
    }
  });
};

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('[WS] Client connected');
  wsClients.add(ws);

  // Send initial connection status
  ws.send(JSON.stringify({
    type: 'status',
    data: { websocket: 'connected', server: 'online' },
    timestamp: new Date().toISOString()
  }));

  ws.on('close', () => {
    console.log('[WS] Client disconnected');
    wsClients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('[WS] Connection error:', error);
    wsClients.delete(ws);
  });
});

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

  // Broadcast session update to all clients
  broadcastToClients('session_updated', session);
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

// Parse SSE streaming response from OpenAI
const parseStreamingResponse = (body: string): any => {
  const lines = body.split('\n');
  const chunks: any[] = [];
  let fullContent = '';
  let usage = null;

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.substring(6).trim();
      if (data === '[DONE]') continue;
      
      try {
        const parsed = JSON.parse(data);
        chunks.push(parsed);
        
        // Extract content from delta
        if (parsed.choices?.[0]?.delta?.content) {
          fullContent += parsed.choices[0].delta.content;
        }
        
        // Extract usage if present
        if (parsed.usage) {
          usage = parsed.usage;
        }
      } catch {
        // Skip invalid JSON lines
      }
    }
  }

  return {
    type: 'streaming',
    content: fullContent,
    chunks: chunks.length,
    usage: usage,
    model: chunks[0]?.model || 'unknown'
  };
};

// Create session immediately on request
const createSessionFromRequest = async (req: any): Promise<void> => {
  console.log('🔥 EMERGENCY DEBUG: createSessionFromRequest called for:', req.sessionId);
  let session = await loadSession(req.sessionId);
  console.log('🔥 EMERGENCY DEBUG: loadSession result:', session ? 'EXISTS' : 'NULL');

  if (!session) {
    console.log('🔥 EMERGENCY DEBUG: Creating new session');
    // Extract meaningful name from first user message
    let sessionName = `Conversation ${new Date().toLocaleString()}`;
    if (req.requestBody?.messages?.length > 0) {
      const firstUserMessage = req.requestBody.messages.find((m: any) => m.role === 'user');
      if (firstUserMessage?.content) {
        const content = typeof firstUserMessage.content === 'string'
          ? firstUserMessage.content
          : JSON.stringify(firstUserMessage.content);
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

    console.log('🔥 EMERGENCY DEBUG: About to save session:', session.id);
    await saveSession(session);
    console.log('🔥 EMERGENCY DEBUG: Session saved successfully');

    addDebugEntry('session', `✅ Auto-created session: ${session.id}`, {
      name: session.name,
      ide: session.ide,
      isStreaming: req.isStreaming
    });
  } else {
    console.log('🔥 EMERGENCY DEBUG: Session already exists, skipping creation');
  }
};

// Update session with response data
const updateSessionWithResponse = async (sessionId: string, requestBody: any, responseData: any): Promise<void> => {
  let session = await loadSession(sessionId);
  
  if (!session) {
    addDebugEntry('error', `Session not found for update: ${sessionId}`, {});
    return;
  }

  const turn: ConversationTurn = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    request: requestBody,
    response: responseData
  };

  session.conversations.push(turn);
  await saveSession(session);

  addDebugEntry('response', `✅ Captured turn ${session.conversations.length} for session: ${session.id}`, {
    turnCount: session.conversations.length,
    responseType: responseData.type || 'json',
    contentLength: responseData.content?.length || 0
  });
};

// Manual proxy function using axios - MUCH SIMPLER!
const proxyToOpenAI = async (req: any, res: any) => {
  try {
    // Extract session info and create session FIRST
    req.requestBody = req.body;
    req.sessionId = extractConversationId(req);
    req.isStreaming = req.body?.stream === true;

    console.log('🎯 MANUAL PROXY: Processing', req.method, req.url, '-> session:', req.sessionId);

    // CREATE SESSION IMMEDIATELY (this was the key missing piece!)
    await createSessionFromRequest(req);

    // Validate API key
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey === 'your_openai_api_key_here') {
      return res.status(500).json({
        error: 'Configuration Error',
        message: 'OpenAI API key not configured'
      });
    }

    // Proxy to OpenAI using axios
    const openaiUrl = req.url.startsWith('/v1/') ? req.url : req.url.replace('/chat/completions', '/v1/chat/completions');

    const response = await axios({
      method: req.method,
      url: `https://api.openai.com${openaiUrl}`,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      data: req.body,
      timeout: 120000,
      responseType: req.isStreaming ? 'stream' : 'json',
    });

    if (req.isStreaming) {
      // Handle streaming
      res.setHeader('Content-Type', 'text/plain');
      let fullContent = '';
      response.data.on('data', (chunk: Buffer) => {
        const chunkStr = chunk.toString();
        fullContent += chunkStr;
        res.write(chunkStr);
      });
      response.data.on('end', async () => {
        const parsedResponse = parseStreamingResponse(fullContent);
        await updateSessionWithResponse(req.sessionId, req.requestBody, parsedResponse);
        res.end();
      });
    } else {
      // Handle regular response
      await updateSessionWithResponse(req.sessionId, req.requestBody, response.data);
      res.json(response.data);
    }

  } catch (error: any) {
    console.error('❌ PROXY ERROR:', error.message);
    try {
      await updateSessionWithResponse(req.sessionId, req.requestBody, { error: error.message });
    } catch {}
    res.status(500).json({ error: error.message });
  }
};

// Simple manual proxy routes - NO MORE http-proxy-middleware!
app.post('/chat/completions', proxyToOpenAI);
app.post('/v1/chat/completions', proxyToOpenAI);

console.log('✅ MANUAL PROXY ROUTES REGISTERED - No more http-proxy-middleware!');

// Debug route to test routing
app.get('/debug-route-test', (req, res) => {
  console.log('🔥 EMERGENCY DEBUG: Debug route called');
  res.json({ message: 'Debug route works' });
});

// TEMPORARILY DISABLED: Catch-all route
/*
app.use((req, res, next) => {
  console.log('🔥 EMERGENCY DEBUG: Catch-all route called for:', req.method, req.url);
  next();
});
*/

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

// Test route
app.get('/test-proxy', (req, res) => {
  console.log('🔥 EMERGENCY DEBUG: Test route called');
  res.json({ message: 'Proxy routes are registered' });
});

app.post('/test-post', (req, res) => {
  console.log('🔥 EMERGENCY DEBUG: Test POST route called');
  res.json({ message: 'POST routing works', body: req.body });
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
server.listen(PORT, () => {
  console.log(`🚀 Summy proxy server running on port ${PORT}`);
  console.log(`📁 Sessions stored in: ${SESSIONS_DIR}`);
  console.log(`🔌 WebSocket server ready for real-time updates`);
  console.log('✅ SERVER STARTED - Manual proxy (no http-proxy-middleware):');
  console.log('  📝 General logging middleware: ACTIVE');
  console.log('  🤖 Manual proxy routes: POST /chat/completions, /v1/chat/completions');
  console.log('  📊 API routes: /api/*');
  console.log('  🔌 WebSocket: Ready for real-time updates');
});
