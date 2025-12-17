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

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from server directory
console.log('🔧 DOTENV DEBUG: Loading .env from:', path.join(__dirname, '../.env'));
const dotenvResult = dotenv.config({ path: path.join(__dirname, '../.env') });
console.log('🔧 DOTENV DEBUG: Result:', dotenvResult);
console.log('🔧 DOTENV DEBUG: OPENAI_API_KEY after dotenv:', process.env.OPENAI_API_KEY ? 'EXISTS' : 'MISSING');

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
  compression?: CompressionConfig;
  compressedConversations?: ConversationTurn[];
}

// Compression configuration
interface CompressionConfig {
  mode: 0 | 1 | 2 | 3; // 0=None, 1=Light, 2=Medium, 3=Aggressive
  keepRecent: number;
  enabled: boolean;
  lastCompressed?: string;
  stats?: {
    originalTokens: number;
    compressedTokens: number;
    ratio: number;
  };
}

// Message segment types for compression
interface TextSegment {
  type: 'text';
  messages: any[];
  startIndex: number;
  endIndex: number;
}

interface ToolSegment {
  type: 'tool';
  messages: any[]; // tool_call + tool response pair
  startIndex: number;
  endIndex: number;
}

type MessageSegment = TextSegment | ToolSegment;

// ============================================================
// COMPRESSION ENGINE
// ============================================================

// Check if a message is tool-related (tool_call or tool response)
const isToolRelated = (msg: any): boolean => {
  if (!msg) return false;
  
  // Check for tool_calls in assistant message
  if (msg.tool_calls && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
    return true;
  }
  
  // Check for tool role (tool response)
  if (msg.role === 'tool') {
    return true;
  }
  
  // Check for function_call (older format)
  if (msg.function_call) {
    return true;
  }
  
  return false;
};

// Segment messages into text groups and tool blocks
const segmentMessages = (messages: any[]): MessageSegment[] => {
  const segments: MessageSegment[] = [];
  let currentTextGroup: any[] = [];
  let textStartIndex = 0;
  
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    
    if (isToolRelated(msg)) {
      // Save any accumulated text group first
      if (currentTextGroup.length > 0) {
        segments.push({
          type: 'text',
          messages: [...currentTextGroup],
          startIndex: textStartIndex,
          endIndex: i - 1
        });
        currentTextGroup = [];
      }
      
      // Check if this is a tool_call followed by tool response
      const toolMessages: any[] = [msg];
      let endIdx = i;
      
      // If this is a tool_call, look for the corresponding tool response
      if (msg.tool_calls || msg.function_call) {
        // Look ahead for tool responses
        let j = i + 1;
        while (j < messages.length && messages[j].role === 'tool') {
          toolMessages.push(messages[j]);
          endIdx = j;
          j++;
        }
        i = endIdx; // Skip past the tool responses we just added
      }
      
      segments.push({
        type: 'tool',
        messages: toolMessages,
        startIndex: i - (toolMessages.length - 1),
        endIndex: endIdx
      });
      
      textStartIndex = i + 1;
    } else {
      // Regular text message
      if (currentTextGroup.length === 0) {
        textStartIndex = i;
      }
      currentTextGroup.push(msg);
    }
  }
  
  // Don't forget the last text group
  if (currentTextGroup.length > 0) {
    segments.push({
      type: 'text',
      messages: currentTextGroup,
      startIndex: textStartIndex,
      endIndex: messages.length - 1
    });
  }
  
  return segments;
};

// Server settings storage
interface ServerSettings {
  lmstudioUrl: string;
  lmstudioModel: string;
  defaultCompressionMode: 0 | 1 | 2 | 3;
  defaultKeepRecent: number;
}

const SETTINGS_FILE = path.join(__dirname, '../settings.json');

const loadServerSettings = async (): Promise<ServerSettings> => {
  try {
    if (await fs.pathExists(SETTINGS_FILE)) {
      return await fs.readJson(SETTINGS_FILE);
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
  // Default settings
  return {
    lmstudioUrl: 'http://localhost:1234',
    lmstudioModel: '',
    defaultCompressionMode: 1,
    defaultKeepRecent: 5
  };
};

const saveServerSettings = async (settings: ServerSettings): Promise<void> => {
  await fs.writeJson(SETTINGS_FILE, settings, { spaces: 2 });
};

// Call LMStudio API for summarization
const callLMStudio = async (
  messages: any[],
  systemPrompt: string
): Promise<string> => {
  const settings = await loadServerSettings();
  
  if (!settings.lmstudioUrl) {
    throw new Error('LMStudio URL not configured');
  }
  
  const url = `${settings.lmstudioUrl}/v1/chat/completions`;
  
  try {
    const response = await axios.post(url, {
      model: settings.lmstudioModel || 'local-model',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages
      ],
      temperature: 0, // Use 0 for deterministic, consistent summaries
      max_tokens: 1000
    }, {
      timeout: 60000 // 60 second timeout
    });
    
    const content = response.data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from LMStudio');
    }
    
    return content;
  } catch (error: any) {
    if (error.code === 'ECONNREFUSED') {
      throw new Error('LMStudio is not running or not accessible');
    }
    throw new Error(`LMStudio API error: ${error.message}`);
  }
};

// Summarize a group of text messages
const summarizeTextGroup = async (messages: any[]): Promise<string> => {
  // Build a readable format of the messages for the LLM
  const formattedMessages = messages.map(msg => {
    const role = msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : msg.role;
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    return `${role}: ${content}`;
  }).join('\n\n');
  
  const systemPrompt = `You are a conversation summarizer. Your task is to create a concise summary of the following conversation segment.

IMPORTANT GUIDELINES:
- Preserve key information: file names, code snippets, technical terms, decisions made
- Keep the summary brief but informative
- Focus on WHAT was discussed and WHAT was decided
- Remove pleasantries, verbose explanations, and redundant content
- Output ONLY the summary, no preamble or explanation

Format your response as a brief paragraph or bullet points.`;

  const userMessage = { 
    role: 'user', 
    content: `Summarize this conversation:\n\n${formattedMessages}` 
  };
  
  return await callLMStudio([userMessage], systemPrompt);
};

// Truncate tool response content (for Medium mode)
const truncateToolResponse = (msg: any, maxLength: number = 500): any => {
  if (msg.role !== 'tool') return msg;
  
  const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
  
  if (content.length <= maxLength) return msg;
  
  // Count lines
  const lines = content.split('\n');
  const truncated = `[TRUNCATED: ${lines.length} lines, ${content.length} chars]\n${content.substring(0, maxLength)}...\n[END TRUNCATION]`;
  
  return {
    ...msg,
    content: truncated
  };
};

// Convert tool block to text summary (for Aggressive mode)
const convertToolBlockToText = async (toolMessages: any[]): Promise<string> => {
  const toolCall = toolMessages.find(m => m.tool_calls || m.function_call);
  const toolResponses = toolMessages.filter(m => m.role === 'tool');
  
  let description = '';
  
  if (toolCall?.tool_calls) {
    for (const tc of toolCall.tool_calls) {
      const funcName = tc.function?.name || 'unknown';
      const args = tc.function?.arguments || '{}';
      description += `Called ${funcName}(${args.substring(0, 100)}${args.length > 100 ? '...' : ''}). `;
    }
  } else if (toolCall?.function_call) {
    const funcName = toolCall.function_call.name || 'unknown';
    description += `Called ${funcName}. `;
  }
  
  for (const resp of toolResponses) {
    const content = typeof resp.content === 'string' ? resp.content : JSON.stringify(resp.content);
    const lines = content.split('\n').length;
    description += `Got response (${lines} lines, ${content.length} chars). `;
  }
  
  return description.trim();
};

// Main compression orchestrator
const compressMessages = async (
  messages: any[],
  config: CompressionConfig
): Promise<{ compressed: any[]; stats: { originalTokens: number; compressedTokens: number; ratio: number } }> => {
  // Mode 0: No compression
  if (config.mode === 0 || !config.enabled) {
    const tokenEstimate = JSON.stringify(messages).length / 4; // Rough estimate
    return {
      compressed: messages,
      stats: {
        originalTokens: Math.round(tokenEstimate),
        compressedTokens: Math.round(tokenEstimate),
        ratio: 0
      }
    };
  }
  
  const keepRecent = config.keepRecent || 5;
  
  // If not enough messages, don't compress
  if (messages.length <= keepRecent) {
    const tokenEstimate = JSON.stringify(messages).length / 4;
    return {
      compressed: messages,
      stats: {
        originalTokens: Math.round(tokenEstimate),
        compressedTokens: Math.round(tokenEstimate),
        ratio: 0
      }
    };
  }
  
  // Split into old and recent
  const recentMessages = messages.slice(-keepRecent);
  const oldMessages = messages.slice(0, -keepRecent);
  
  // Estimate original tokens
  const originalTokens = Math.round(JSON.stringify(messages).length / 4);
  
  // Segment old messages
  const segments = segmentMessages(oldMessages);
  
  // Process each segment based on mode
  const compressedSegments: any[] = [];
  
  for (const segment of segments) {
    if (segment.type === 'text') {
      // Always summarize text segments (modes 1, 2, 3)
      try {
        const summary = await summarizeTextGroup(segment.messages);
        compressedSegments.push({
          role: 'system',
          content: `[CONVERSATION SUMMARY]\n${summary}\n[END SUMMARY]`
        });
      } catch (error: any) {
        // If summarization fails, throw error (fail mode)
        throw new Error(`Compression failed: ${error.message}`);
      }
    } else if (segment.type === 'tool') {
      // Handle tool segments based on mode
      switch (config.mode) {
        case 1: // Light: preserve tools completely
          compressedSegments.push(...segment.messages);
          break;
          
        case 2: // Medium: preserve tool calls, truncate responses
          for (const msg of segment.messages) {
            if (msg.role === 'tool') {
              compressedSegments.push(truncateToolResponse(msg));
            } else {
              compressedSegments.push(msg);
            }
          }
          break;
          
        case 3: // Aggressive: convert tools to text
          try {
            const toolSummary = await convertToolBlockToText(segment.messages);
            compressedSegments.push({
              role: 'system',
              content: `[TOOL SUMMARY] ${toolSummary} [END TOOL SUMMARY]`
            });
          } catch {
            // If conversion fails, keep original
            compressedSegments.push(...segment.messages);
          }
          break;
      }
    }
  }
  
  // Combine compressed segments with recent messages
  const compressed = [...compressedSegments, ...recentMessages];
  
  // Calculate stats
  const compressedTokens = Math.round(JSON.stringify(compressed).length / 4);
  const ratio = originalTokens > 0 ? (originalTokens - compressedTokens) / originalTokens : 0;
  
  return {
    compressed,
    stats: {
      originalTokens,
      compressedTokens,
      ratio: Math.round(ratio * 100) / 100
    }
  };
};

// ============================================================
// END COMPRESSION ENGINE
// ============================================================

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
  let finishReason = null;

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

        // Extract finish reason
        if (parsed.choices?.[0]?.finish_reason) {
          finishReason = parsed.choices[0].finish_reason;
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
    content: fullContent || 'No assistant response',
    chunks: chunks.length,
    usage: usage,
    finish_reason: finishReason || 'unknown',
    model: chunks[0]?.model || 'localproxy'
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

    // Check if compression is enabled for this session
    let messagesToSend = req.body?.messages || [];
    const session = await loadSession(req.sessionId);
    
    if (session?.compression?.enabled && session.compression.mode > 0) {
      try {
        addDebugEntry('request', `Applying compression mode ${session.compression.mode}`, {
          originalMessageCount: messagesToSend.length,
          keepRecent: session.compression.keepRecent
        });
        
        const compressionResult = await compressMessages(messagesToSend, session.compression);
        messagesToSend = compressionResult.compressed;
        
        addDebugEntry('request', `Compression complete`, {
          originalTokens: compressionResult.stats.originalTokens,
          compressedTokens: compressionResult.stats.compressedTokens,
          ratio: compressionResult.stats.ratio,
          newMessageCount: messagesToSend.length
        });
        
        // Update session stats
        session.compression.stats = compressionResult.stats;
        session.compression.lastCompressed = new Date().toISOString();
        await saveSession(session);
      } catch (compressionError: any) {
        // Compression failed - log error and continue with original messages
        addDebugEntry('error', `Compression failed: ${compressionError.message}`, {
          error: compressionError.message
        });
        // Don't modify messagesToSend - use original
      }
    }

    // Map custom model names to real OpenAI models
    // If model is not a known OpenAI model, default to gpt-4o-mini
    const knownOpenAIModels = [
      'gpt-4', 'gpt-4-turbo', 'gpt-4-turbo-preview', 'gpt-4o', 'gpt-4o-mini',
      'gpt-3.5-turbo', 'gpt-3.5-turbo-16k',
      'o1', 'o1-mini', 'o1-preview'
    ];
    const requestedModel = req.body?.model || 'gpt-4o-mini';
    const actualModel = knownOpenAIModels.some(m => requestedModel.startsWith(m)) 
      ? requestedModel 
      : 'gpt-4o-mini';
    
    // Create modified request body with correct model and potentially compressed messages
    const modifiedBody = {
      ...req.body,
      model: actualModel,
      messages: messagesToSend
    };

    addDebugEntry('request', `Proxying to OpenAI: ${requestedModel} -> ${actualModel}`, {
      originalModel: requestedModel,
      actualModel: actualModel,
      streaming: req.isStreaming,
      messageCount: messagesToSend.length
    });

    // Proxy to OpenAI using axios
    const openaiUrl = req.url.startsWith('/v1/') ? req.url : req.url.replace('/chat/completions', '/v1/chat/completions');
    const response = await axios({
      method: req.method,
      url: `https://api.openai.com${openaiUrl}`,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      data: modifiedBody,
      timeout: 120000,
      responseType: req.isStreaming ? 'stream' : 'json',
    });

    if (req.isStreaming) {
      // Handle streaming - use text/event-stream for SSE
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
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
      response.data.on('error', (err: Error) => {
        console.error('❌ STREAM ERROR:', err.message);
        addDebugEntry('error', `Stream error: ${err.message}`, {});
        res.end();
      });
    } else {
      // Handle regular response
      await updateSessionWithResponse(req.sessionId, req.requestBody, response.data);
      res.json(response.data);
    }

  } catch (error: any) {
    console.error('❌ PROXY ERROR:', error.message);
    console.error('❌ PROXY ERROR DETAILS:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      code: error.code,
      errno: error.errno,
      syscall: error.syscall
    });

    try {
      await updateSessionWithResponse(req.sessionId, req.requestBody, {
        error: error.message,
        statusCode: error.response?.status,
        details: error.response?.data
      });
    } catch (sessionError) {
      console.error('❌ SESSION UPDATE ERROR:', sessionError);
    }

    const statusCode = error.response?.status || 500;
    res.status(statusCode).json({
      error: error.message,
      details: error.response?.data || 'No additional details'
    });
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

// ============================================================
// SETTINGS API
// ============================================================

// Get server settings
app.get('/api/settings', async (req, res) => {
  try {
    const settings = await loadServerSettings();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

// Save server settings
app.post('/api/settings', async (req, res) => {
  try {
    const currentSettings = await loadServerSettings();
    const newSettings: ServerSettings = {
      ...currentSettings,
      ...req.body
    };
    await saveServerSettings(newSettings);
    res.json(newSettings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

// Test LMStudio connection
app.post('/api/test-lmstudio', async (req, res) => {
  try {
    const { url } = req.body;
    const testUrl = url || (await loadServerSettings()).lmstudioUrl;
    
    const response = await axios.get(`${testUrl}/v1/models`, { timeout: 5000 });
    
    res.json({
      success: true,
      models: response.data?.data || [],
      message: 'LMStudio connection successful'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.code === 'ECONNREFUSED' 
        ? 'LMStudio is not running or not accessible'
        : error.message
    });
  }
});

// Load model in LMStudio
app.post('/api/lmstudio/load-model', async (req, res) => {
  try {
    const { model, unloadOthers } = req.body;
    const settings = await loadServerSettings();
    const baseUrl = settings.lmstudioUrl || 'http://localhost:1234';
    
    if (!model) {
      return res.status(400).json({ success: false, error: 'No model specified' });
    }
    
    // Unload other models if requested
    if (unloadOthers) {
      try {
        const modelsRes = await axios.get(`${baseUrl}/v1/models`, { timeout: 5000 });
        const loadedModels = modelsRes.data?.data || [];
        
        for (const m of loadedModels) {
          if (m.id !== model) {
            try {
              await axios.delete(`${baseUrl}/v1/models/${encodeURIComponent(m.id)}`, { timeout: 30000 });
              console.log(`[LMStudio] Unloaded model: ${m.id}`);
            } catch (unloadErr: any) {
              console.warn(`[LMStudio] Failed to unload ${m.id}:`, unloadErr.message);
            }
          }
        }
      } catch (listErr: any) {
        console.warn('[LMStudio] Could not list models for unloading:', listErr.message);
      }
    }
    
    // Load the requested model
    console.log(`[LMStudio] Loading model: ${model}`);
    const loadRes = await axios.post(`${baseUrl}/v1/models`, {
      model: model
    }, { timeout: 120000 }); // 2 min timeout for loading large models
    
    // Save model to settings
    settings.lmstudioModel = model;
    await saveServerSettings(settings);
    
    console.log(`[LMStudio] Model ${model} loaded successfully`);
    res.json({
      success: true,
      message: `Model ${model} loaded successfully`,
      model: model
    });
  } catch (error: any) {
    console.error('[LMStudio] Load model error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: error.response?.data?.error?.message || error.response?.data?.error || error.message
    });
  }
});

// Update session compression settings
app.post('/api/sessions/:id/compression', async (req, res) => {
  try {
    const session = await loadSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Update compression config
    session.compression = {
      mode: req.body.mode ?? 1,
      keepRecent: req.body.keepRecent ?? 5,
      enabled: req.body.enabled ?? true,
      lastCompressed: session.compression?.lastCompressed,
      stats: session.compression?.stats
    };
    
    await saveSession(session);
    res.json(session);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update compression settings' });
  }
});

// Compress a session (manual trigger)
app.post('/api/sessions/:id/compress', async (req, res) => {
  try {
    const session = await loadSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    if (!session.conversations || session.conversations.length === 0) {
      return res.status(400).json({ error: 'No conversations to compress' });
    }
    
    // Get compression config from session or request
    const config: CompressionConfig = {
      mode: req.body.mode ?? session.compression?.mode ?? 1,
      keepRecent: req.body.keepRecent ?? session.compression?.keepRecent ?? 5,
      enabled: true
    };
    
    // Get all messages from all conversation turns
    const allMessages: any[] = [];
    for (const turn of session.conversations) {
      if (turn.request?.messages) {
        // Only add messages that aren't already in allMessages (avoid duplicates)
        const lastUserMsg = turn.request.messages.filter((m: any) => m.role === 'user').pop();
        if (lastUserMsg) {
          allMessages.push(lastUserMsg);
        }
      }
      if (turn.response) {
        if (turn.response.type === 'streaming') {
          allMessages.push({ role: 'assistant', content: turn.response.content });
        } else if (turn.response.choices?.[0]?.message) {
          allMessages.push(turn.response.choices[0].message);
        }
      }
    }
    
    // Compress
    const result = await compressMessages(allMessages, config);
    
    // Update session
    session.compression = {
      ...config,
      lastCompressed: new Date().toISOString(),
      stats: result.stats
    };
    session.compressedConversations = result.compressed.map((msg, idx) => ({
      id: `compressed-${idx}`,
      timestamp: new Date().toISOString(),
      request: { messages: [msg] },
      response: undefined
    }));
    
    await saveSession(session);
    
    res.json({
      success: true,
      stats: result.stats,
      originalCount: allMessages.length,
      compressedCount: result.compressed.length
    });
  } catch (error: any) {
    console.error('Compression error:', error);
    res.status(500).json({ 
      error: 'Compression failed', 
      message: error.message 
    });
  }
});

// ============================================================
// END SETTINGS API
// ============================================================

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
