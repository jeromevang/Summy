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
import { LMStudioClient } from '@lmstudio/sdk';

// Import new route modules
import { toolyRoutes, notificationsRoutes, analyticsRoutes } from './routes/index.js';
import { notifications } from './services/notifications.js';
import { scheduleBackupCleanup } from './modules/tooly/rollback.js';
import { mcpClient } from './modules/tooly/mcp-client.js';
import { wsBroadcast } from './services/ws-broadcast.js';
import { systemMetrics } from './services/system-metrics.js';
import { modelManager } from './services/lmstudio-model-manager.js';

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
  type: 'request' | 'response' | 'session' | 'error' | 'warning';
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

// Shared LMStudio client instance (reused to avoid creating new connections)
let sharedLMStudioClient: LMStudioClient | null = null;

const getSharedLMStudioClient = () => {
  if (!sharedLMStudioClient) {
    sharedLMStudioClient = new LMStudioClient();
  }
  return sharedLMStudioClient;
};

// Cached LM Studio status (to avoid checking every broadcast)
let cachedLMStudioStatus = { connected: false, models: [] as string[] };

// Get full status including MCP and optionally LM Studio
const getFullStatus = async (checkLMStudio = false) => {
  // Only check LM Studio if requested (on new connections)
  if (checkLMStudio) {
    try {
      const client = getSharedLMStudioClient();
      const loadedModels = await client.llm.listLoaded();
      cachedLMStudioStatus = {
        connected: true,
        models: loadedModels.map(m => m.identifier)
      };
    } catch {
      cachedLMStudioStatus = { connected: false, models: [] };
      sharedLMStudioClient = null; // Reset on error to reconnect next time
    }
  }

  const mcpStatus = mcpClient.getStatus();

  return {
    server: 'online',
    websocket: 'connected',
    mcp: mcpStatus.connected ? 'connected' : 'disconnected',
    lmstudio: cachedLMStudioStatus.connected ? 'connected' : 'disconnected',
    lmstudioModels: cachedLMStudioStatus.models
  };
};

// Broadcast status to all WebSocket clients (without LM Studio check)
const broadcastStatus = async () => {
  if (wsClients.size === 0) return;
  
  const status = await getFullStatus(false); // Don't check LM Studio on interval
  const message = JSON.stringify({
    type: 'status',
    data: status,
    timestamp: new Date().toISOString()
  });

  wsClients.forEach(client => {
    if (client.readyState === 1) { // OPEN
      client.send(message);
    }
  });
};

// Broadcast status every 30 seconds (MCP only, LM Studio uses cached value)
setInterval(broadcastStatus, 30000);

// WebSocket connection handling
wss.on('connection', async (ws) => {
  console.log('[WS] Client connected');
  wsClients.add(ws);
  wsBroadcast.registerClient(ws);

  // Send initial full status (check LM Studio on new connection)
  const status = await getFullStatus(true);
  ws.send(JSON.stringify({
    type: 'status',
    data: status,
    timestamp: new Date().toISOString()
  }));

  ws.on('close', () => {
    console.log('[WS] Client disconnected');
    wsClients.delete(ws);
    wsBroadcast.unregisterClient(ws);
  });

  ws.on('error', (error) => {
    console.error('[WS] Connection error:', error);
    wsClients.delete(ws);
    wsBroadcast.unregisterClient(ws);
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

// Tooly execution metadata for debugging/visualization
interface ToolyPhase {
  phase: 'planning' | 'execution' | 'response';
  systemPrompt: string;
  model: string;
  latencyMs: number;
  reasoning?: string;  // For dual mode main model output
}

interface ToolyToolCall {
  id: string;
  name: string;
  arguments: any;
  result?: any;
  status: 'success' | 'failed' | 'timeout' | 'pending';
  latencyMs?: number;
  error?: string;
}

interface ToolyMeta {
  mode: 'single' | 'dual' | 'passthrough';
  phases: ToolyPhase[];
  toolCalls?: ToolyToolCall[];
  totalLatencyMs?: number;
}

interface ConversationTurn {
  id: string;
  timestamp: string;
  request: any;
  response?: any;
  toolyMeta?: ToolyMeta;  // Tooly execution details for debugging
}

interface CachedCompressions {
  messageCount: number;
  keepRecent: number;
  lastComputed: string;
  light: { messages: any[]; stats: { originalTokens: number; compressedTokens: number; ratio: number } };
  medium: { messages: any[]; stats: { originalTokens: number; compressedTokens: number; ratio: number } };
  aggressive: { messages: any[]; stats: { originalTokens: number; compressedTokens: number; ratio: number } };
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
  cachedCompressions?: CachedCompressions;
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
  systemPrompt?: string | null; // Custom prompt for summarization
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
  // Provider selection: 'openai' | 'azure' | 'lmstudio'
  provider: 'openai' | 'azure' | 'lmstudio';
  
  // OpenAI settings
  openaiModel: string;
  
  // Azure OpenAI settings
  azureResourceName: string;
  azureDeploymentName: string;
  azureApiKey: string;
  azureApiVersion: string;
  
  // LM Studio settings
  lmstudioUrl: string;
  lmstudioModel: string;
  
  // Compression defaults
  defaultCompressionMode: 0 | 1 | 2 | 3;
  defaultKeepRecent: number;
  
  // Context settings
  defaultContextLength?: number;
  
  // Proxy mode: 'passthrough' | 'summy' | 'tooly' | 'both'
  proxyMode?: 'passthrough' | 'summy' | 'tooly' | 'both';
  
  // Dual model configuration
  enableDualModel?: boolean;
  mainModelId?: string;
  executorModelId?: string;
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
    provider: 'openai',
    openaiModel: 'gpt-4o-mini',
    azureResourceName: '',
    azureDeploymentName: '',
    azureApiKey: '',
    azureApiVersion: '2024-02-01',
    lmstudioUrl: 'http://localhost:1234',
    lmstudioModel: '',
    defaultCompressionMode: 1,
    defaultKeepRecent: 5,
    defaultContextLength: 8192,
    proxyMode: 'both',
    enableDualModel: false,
    mainModelId: '',
    executorModelId: ''
  };
};

const saveServerSettings = async (settings: ServerSettings): Promise<void> => {
  await fs.writeJson(SETTINGS_FILE, settings, { spaces: 2 });
};

/**
 * Ensures the correct LM Studio model(s) are loaded before proxying requests.
 * Uses the centralized modelManager for single-model mode.
 * Note: Dual-model mode requires both models loaded simultaneously.
 */
const ensureLMStudioModelLoaded = async (settings: ServerSettings): Promise<void> => {
  try {
    const contextLength = settings.defaultContextLength || 8192;
    
    // Determine required model based on mode
    if (settings.enableDualModel) {
      // Dual model mode - need to load both models
      // For now, just ensure the main model is ready via manager
      // TODO: Add multi-model support to modelManager if needed
      if (settings.mainModelId) {
        await modelManager.ensureLoaded(settings.mainModelId, contextLength);
      }
      // Note: In dual mode, executor model should be loaded separately
      // The current modelManager only tracks one model
    } else {
      // Single model mode - use modelManager
      if (settings.lmstudioModel) {
        await modelManager.ensureLoaded(settings.lmstudioModel, contextLength);
      } else {
        console.log('[LMStudio] No model configured in settings');
      }
    }
  } catch (error: any) {
    // Log warning but don't fail - LM Studio might still work with whatever is loaded
    console.warn(`[LMStudio] Failed to ensure correct model loaded: ${error.message}`);
    addDebugEntry('warning', `Failed to auto-load LM Studio model: ${error.message}`, {});
  }
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
      temperature: 0,
      max_tokens: 1000  // Room for structured summary output
    }, {
      timeout: 60000
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

// Default system prompt for summarization
const DEFAULT_SUMMARY_PROMPT = `You are a context summarizer. Condense the conversation into a brief summary that preserves key information.

Output format:
[CONVERSATION SUMMARY]
Goal: <main objective or topic>
Key Points: <important details, decisions, or facts>
Current State: <where things stand>
[END SUMMARY]

Rules:
- ONLY use information from the conversation
- Be concise (under 150 words)
- Preserve technical terms, names, and specifics exactly
- Output ONLY the summary block, nothing else`;

// Summarize a group of text messages
const summarizeTextGroup = async (messages: any[], customPrompt?: string | null): Promise<string> => {
  // Extract just the content, minimal formatting
  const content = messages.map(msg => {
    const role = msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : 'System';
    const text = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    // Truncate very long messages
    const truncated = text.length > 500 ? text.substring(0, 500) + '...' : text;
    return `${role}: ${truncated}`;
  }).join('\n');
  
  // Use custom prompt if provided, otherwise use default
  const systemPrompt = customPrompt || DEFAULT_SUMMARY_PROMPT;
  
  console.log(`[Summarize] Using ${customPrompt ? 'CUSTOM' : 'DEFAULT'} prompt (${systemPrompt.length} chars)`);
  console.log(`[Summarize] Prompt starts with: "${systemPrompt.substring(0, 80)}..."`);

  const userMessage = { 
    role: 'user', 
    content: `Conversation to summarize:\n\n${content}` 
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
        const summary = await summarizeTextGroup(segment.messages, config.systemPrompt);
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

    // Load settings for routing decisions
    const settings = await loadServerSettings();
    const requestedModel = req.body?.model || 'gpt-4o-mini';
    
    // Use the configured provider from settings
    const effectiveProvider = settings.provider;
    
    console.log(`[PROVIDER DEBUG] settings.provider = "${settings.provider}", effectiveProvider = "${effectiveProvider}"`);
    
    // ========== ROUTE TO LM STUDIO ==========
    if (effectiveProvider === 'lmstudio') {
      // Ensure correct model is loaded before proxying
      await ensureLMStudioModelLoaded(settings);
      const lmstudioUrl = `${settings.lmstudioUrl}/v1/chat/completions`;
      const lmstudioModel = settings.lmstudioModel || 'local-model';
      
      addDebugEntry('request', `Proxying to LM Studio: ${requestedModel} -> ${lmstudioModel}`, {
        originalModel: requestedModel,
        actualModel: lmstudioModel,
        lmstudioUrl: settings.lmstudioUrl,
        streaming: req.isStreaming,
        messageCount: messagesToSend.length
      });
      
      const modifiedBody = {
        ...req.body,
        model: lmstudioModel,
        messages: messagesToSend,
        temperature: 0  // Always use temp 0 for deterministic output
      };
      
      try {
        const response = await axios({
          method: 'POST',
          url: lmstudioUrl,
          headers: {
            'Content-Type': 'application/json',
          },
          data: modifiedBody,
          timeout: 300000, // 5 min timeout for local models
          responseType: req.isStreaming ? 'stream' : 'json',
        });
        
        if (req.isStreaming) {
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
            console.error('❌ LM STUDIO STREAM ERROR:', err.message);
            addDebugEntry('error', `LM Studio stream error: ${err.message}`, {});
            res.end();
          });
        } else {
          await updateSessionWithResponse(req.sessionId, req.requestBody, response.data);
          res.json(response.data);
        }
        return;
      } catch (lmError: any) {
        console.error('❌ LM STUDIO ERROR:', lmError.message);
        addDebugEntry('error', `LM Studio error: ${lmError.message}`, {});
        
        if (lmError.code === 'ECONNREFUSED') {
          return res.status(503).json({
            error: 'LM Studio is not running or not accessible',
            details: `Could not connect to ${settings.lmstudioUrl}`
          });
        }
        return res.status(500).json({
          error: lmError.message,
          details: lmError.response?.data || 'LM Studio request failed'
        });
      }
    }
    
    // ========== ROUTE TO AZURE OPENAI ==========
    if (effectiveProvider === 'azure') {
      if (!settings.azureResourceName || !settings.azureDeploymentName || !settings.azureApiKey) {
        return res.status(400).json({
          error: 'Azure OpenAI not configured',
          details: 'Please configure Azure resource name, deployment name, and API key in Settings'
        });
      }
      
      const azureUrl = `https://${settings.azureResourceName}.openai.azure.com/openai/deployments/${settings.azureDeploymentName}/chat/completions?api-version=${settings.azureApiVersion}`;
      
      addDebugEntry('request', `Proxying to Azure OpenAI: ${requestedModel} -> ${settings.azureDeploymentName}`, {
        originalModel: requestedModel,
        actualModel: settings.azureDeploymentName,
        azureResource: settings.azureResourceName,
        streaming: req.isStreaming,
        messageCount: messagesToSend.length
      });
      
      const modifiedBody = {
        ...req.body,
        messages: messagesToSend,
        temperature: 0  // Always use temp 0 for deterministic output
      };
      // Remove 'model' from body as Azure uses deployment name in URL
      delete modifiedBody.model;
      
      try {
        const response = await axios({
          method: 'POST',
          url: azureUrl,
          headers: {
            'api-key': settings.azureApiKey,
            'Content-Type': 'application/json',
          },
          data: modifiedBody,
          timeout: 30000, // 30 second production timeout
          responseType: req.isStreaming ? 'stream' : 'json',
        });
        
        if (req.isStreaming) {
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
            console.error('❌ AZURE STREAM ERROR:', err.message);
            addDebugEntry('error', `Azure stream error: ${err.message}`, {});
            res.end();
          });
        } else {
          await updateSessionWithResponse(req.sessionId, req.requestBody, response.data);
          res.json(response.data);
        }
        return;
      } catch (azureError: any) {
        console.error('❌ AZURE ERROR:', azureError.message);
        addDebugEntry('error', `Azure error: ${azureError.message}`, {});
        
        const statusCode = azureError.response?.status || 500;
        return res.status(statusCode).json({
          error: azureError.message,
          details: azureError.response?.data || 'Azure OpenAI request failed'
        });
      }
    }
    
    // ========== ROUTE TO OPENAI ==========
    // Map custom model names to real OpenAI models
    const knownOpenAIModels = [
      'gpt-4', 'gpt-4-turbo', 'gpt-4-turbo-preview', 'gpt-4o', 'gpt-4o-mini',
      'gpt-3.5-turbo', 'gpt-3.5-turbo-16k',
      'o1', 'o1-mini', 'o1-preview'
    ];
    
    // Use settings.openaiModel if available, otherwise map or default
    let actualModel: string;
    if (knownOpenAIModels.some(m => requestedModel.startsWith(m))) {
      actualModel = requestedModel;
    } else {
      actualModel = settings.openaiModel || 'gpt-4o-mini';
    }
    
    // Create modified request body with correct model and potentially compressed messages
    const modifiedBody = {
      ...req.body,
      model: actualModel,
      messages: messagesToSend,
      temperature: 0  // Always use temp 0 for deterministic output
    };

    const openaiUrl = req.url.startsWith('/v1/') ? req.url : req.url.replace('/chat/completions', '/v1/chat/completions');
    const fullOpenAIUrl = `https://api.openai.com${openaiUrl}`;
    
    console.log(`[ROUTING] Provider: ${effectiveProvider}, URL: ${fullOpenAIUrl}`);
    addDebugEntry('request', `Proxying to OpenAI: ${requestedModel} -> ${actualModel}`, {
      originalModel: requestedModel,
      actualModel: actualModel,
      streaming: req.isStreaming,
      messageCount: messagesToSend.length
    });

    // Proxy to OpenAI using axios
    const response = await axios({
      method: req.method,
      url: fullOpenAIUrl,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      data: modifiedBody,
      timeout: 30000, // 30 second production timeout
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

// LM Studio status check using SDK
app.get('/api/lmstudio/status', async (req, res) => {
  try {
    const client = getSharedLMStudioClient();
    const loadedModels = await client.llm.listLoaded();
    res.json({ 
      connected: true, 
      loadedModels: loadedModels.length,
      models: loadedModels.map(m => m.identifier)
    });
  } catch (error: any) {
    sharedLMStudioClient = null; // Reset on error
    res.json({ 
      connected: false, 
      reason: error.message 
    });
  }
});

// Get available OpenAI models
app.get('/api/openai/models', async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(400).json({ error: 'OpenAI API key not configured' });
    }
    
    const response = await axios.get('https://api.openai.com/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      timeout: 10000
    });
    
    // Filter to chat-compatible models only
    const chatModels = response.data.data
      .filter((m: any) => 
        m.id.startsWith('gpt-') || 
        m.id.startsWith('o1') ||
        m.id.startsWith('chatgpt')
      )
      .map((m: any) => m.id)
      .sort((a: string, b: string) => {
        // Sort: gpt-4o first, then gpt-4, then gpt-3.5, then o1
        if (a.startsWith('gpt-4o') && !b.startsWith('gpt-4o')) return -1;
        if (!a.startsWith('gpt-4o') && b.startsWith('gpt-4o')) return 1;
        if (a.startsWith('gpt-4') && !b.startsWith('gpt-4')) return -1;
        if (!a.startsWith('gpt-4') && b.startsWith('gpt-4')) return 1;
        return a.localeCompare(b);
      });
    
    res.json({ models: chatModels });
  } catch (error: any) {
    console.error('Failed to fetch OpenAI models:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch models',
      details: error.response?.data?.error?.message || error.message
    });
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

// Test Azure OpenAI connection
app.post('/api/test-azure', async (req, res) => {
  try {
    const { resourceName, deploymentName, apiKey, apiVersion } = req.body;
    const settings = await loadServerSettings();
    
    const resource = resourceName || settings.azureResourceName;
    const deployment = deploymentName || settings.azureDeploymentName;
    const key = apiKey || settings.azureApiKey;
    const version = apiVersion || settings.azureApiVersion || '2024-02-01';
    
    if (!resource || !deployment || !key) {
      return res.status(400).json({
        success: false,
        error: 'Missing required Azure configuration (resource name, deployment name, or API key)'
      });
    }
    
    // Test with a simple completion request
    const testUrl = `https://${resource}.openai.azure.com/openai/deployments/${deployment}/chat/completions?api-version=${version}`;
    
    const response = await axios.post(testUrl, {
      messages: [{ role: 'user', content: 'Hi' }],
      max_tokens: 5
    }, {
      headers: {
        'api-key': key,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });
    
    res.json({
      success: true,
      model: response.data?.model || deployment,
      message: 'Azure OpenAI connection successful'
    });
  } catch (error: any) {
    console.error('Azure test error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: error.response?.data?.error?.message || error.message || 'Azure connection failed'
    });
  }
});

// Load model in LMStudio using centralized model manager
app.post('/api/lmstudio/load-model', async (req, res) => {
  try {
    const { model, contextLength } = req.body;
    const settings = await loadServerSettings();
    
    if (!model) {
      return res.status(400).json({ success: false, error: 'No model specified' });
    }
    
    const ctx = contextLength || settings.defaultContextLength || 8192;
    
    // Use centralized model manager - it handles unloading and loading
    console.log(`[LMStudio] Loading model via manager: ${model} (context: ${ctx})`);
    await modelManager.ensureLoaded(model, ctx);
    
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
    console.error('[LMStudio] Load model error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to load model'
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
    
    // Get all messages from all conversation turns (matching client-side logic exactly)
    const allMessages: any[] = [];
    for (const turn of session.conversations) {
      // 1. Add user message (last one from the request)
      if (turn.request?.messages) {
        const lastUserMsg = turn.request.messages.filter((m: any) => m.role === 'user').pop();
        if (lastUserMsg) {
          allMessages.push(lastUserMsg);
        }
        
        // 2. Add assistant messages with tool_calls
        const assistantWithTools = turn.request.messages.find((m: any) => m.role === 'assistant' && m.tool_calls);
        if (assistantWithTools) {
          allMessages.push(assistantWithTools);
        }
        
        // 3. Add tool response messages
        const toolMessages = turn.request.messages.filter((m: any) => m.role === 'tool');
        allMessages.push(...toolMessages);
      }
      
      // 4. Add assistant response
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

// Get all compression versions for a session (None uses original, Light/Medium/Aggressive computed)
app.get('/api/sessions/:id/compressions', async (req, res) => {
  try {
    const session = await loadSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Extract all messages from conversations (matching client-side logic exactly)
    const allMessages: any[] = [];
    for (const turn of session.conversations) {
      // 1. Add user message (last one from the request)
      if (turn.request?.messages) {
        const lastUserMsg = turn.request.messages.filter((m: any) => m.role === 'user').pop();
        if (lastUserMsg) {
          allMessages.push(lastUserMsg);
        }
        
        // 2. Add assistant messages with tool_calls
        const assistantWithTools = turn.request.messages.find((m: any) => m.role === 'assistant' && m.tool_calls);
        if (assistantWithTools) {
          allMessages.push(assistantWithTools);
        }
        
        // 3. Add tool response messages
        const toolMessages = turn.request.messages.filter((m: any) => m.role === 'tool');
        allMessages.push(...toolMessages);
      }
      
      // 4. Add assistant response
      if (turn.response) {
        if (turn.response.type === 'streaming') {
          allMessages.push({ role: 'assistant', content: turn.response.content });
        } else if (turn.response.choices?.[0]?.message) {
          allMessages.push(turn.response.choices[0].message);
        }
      }
    }
    
    const keepRecent = session.compression?.keepRecent || 5;
    
    // Check if we have cached compressions
    if (session.cachedCompressions && 
        session.cachedCompressions.messageCount === allMessages.length &&
        session.cachedCompressions.keepRecent === keepRecent) {
      // Return cached versions
      return res.json({
        none: { messages: allMessages, stats: { originalTokens: Math.round(JSON.stringify(allMessages).length / 4), compressedTokens: Math.round(JSON.stringify(allMessages).length / 4), ratio: 0 } },
        light: session.cachedCompressions.light,
        medium: session.cachedCompressions.medium,
        aggressive: session.cachedCompressions.aggressive,
        cached: true
      });
    }
    
    // Compute all 3 compressed versions - USE SAVED systemPrompt if available
    const savedSystemPrompt = session.compression?.systemPrompt || null;
    const baseConfig = { keepRecent, enabled: true, systemPrompt: savedSystemPrompt };
    
    console.log(`[Compressions GET] Computing fresh (saved systemPrompt: ${savedSystemPrompt ? 'YES' : 'NO'})`);
    
    const [lightResult, mediumResult, aggressiveResult] = await Promise.all([
      compressMessages(allMessages, { ...baseConfig, mode: 1 }),
      compressMessages(allMessages, { ...baseConfig, mode: 2 }),
      compressMessages(allMessages, { ...baseConfig, mode: 3 })
    ]);
    
    // Cache the results
    session.cachedCompressions = {
      messageCount: allMessages.length,
      keepRecent: keepRecent,
      lastComputed: new Date().toISOString(),
      light: { messages: lightResult.compressed, stats: lightResult.stats },
      medium: { messages: mediumResult.compressed, stats: mediumResult.stats },
      aggressive: { messages: aggressiveResult.compressed, stats: aggressiveResult.stats }
    };
    await saveSession(session);
    
    res.json({
      none: { messages: allMessages, stats: { originalTokens: Math.round(JSON.stringify(allMessages).length / 4), compressedTokens: Math.round(JSON.stringify(allMessages).length / 4), ratio: 0 } },
      light: session.cachedCompressions.light,
      medium: session.cachedCompressions.medium,
      aggressive: session.cachedCompressions.aggressive,
      cached: false
    });
  } catch (error: any) {
    console.error('Get compressions error:', error);
    res.status(500).json({ error: 'Failed to get compressions', message: error.message });
  }
});

// Re-compress a session (clear cache and re-compute all versions)
app.post('/api/sessions/:id/recompress', async (req, res) => {
  try {
    const session = await loadSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    if (!session.conversations || session.conversations.length === 0) {
      return res.status(400).json({ error: 'No conversations to compress' });
    }
    
    // Clear cached compressions
    delete session.cachedCompressions;
    delete session.compressedConversations;
    await saveSession(session);
    
    // Extract all messages (matching client-side logic exactly)
    const allMessages: any[] = [];
    for (const turn of session.conversations) {
      // 1. Add user message (last one from the request)
      if (turn.request?.messages) {
        const lastUserMsg = turn.request.messages.filter((m: any) => m.role === 'user').pop();
        if (lastUserMsg) {
          allMessages.push(lastUserMsg);
        }
        
        // 2. Add assistant messages with tool_calls
        const assistantWithTools = turn.request.messages.find((m: any) => m.role === 'assistant' && m.tool_calls);
        if (assistantWithTools) {
          allMessages.push(assistantWithTools);
        }
        
        // 3. Add tool response messages
        const toolMessages = turn.request.messages.filter((m: any) => m.role === 'tool');
        allMessages.push(...toolMessages);
      }
      
      // 4. Add assistant response
      if (turn.response) {
        if (turn.response.type === 'streaming') {
          allMessages.push({ role: 'assistant', content: turn.response.content });
        } else if (turn.response.choices?.[0]?.message) {
          allMessages.push(turn.response.choices[0].message);
        }
      }
    }
    
    const keepRecent = req.body.keepRecent ?? session.compression?.keepRecent ?? 5;
    const customSystemPrompt = req.body.systemPrompt || null;
    
    // Debug: Log what we received
    console.log(`[Recompress] req.body keys:`, Object.keys(req.body));
    console.log(`[Recompress] systemPrompt received:`, customSystemPrompt ? `"${customSystemPrompt.substring(0, 60)}..." (${customSystemPrompt.length} chars)` : 'NULL');
    
    const baseConfig = { keepRecent, enabled: true, systemPrompt: customSystemPrompt };
    
    // Compute all 3 versions fresh
    console.log(`[Recompress] Computing 3 compression versions for session ${session.id}...`);
    const [lightResult, mediumResult, aggressiveResult] = await Promise.all([
      compressMessages(allMessages, { ...baseConfig, mode: 1 }),
      compressMessages(allMessages, { ...baseConfig, mode: 2 }),
      compressMessages(allMessages, { ...baseConfig, mode: 3 })
    ]);
    
    // Cache the results
    session.cachedCompressions = {
      messageCount: allMessages.length,
      keepRecent: keepRecent,
      lastComputed: new Date().toISOString(),
      light: { messages: lightResult.compressed, stats: lightResult.stats },
      medium: { messages: mediumResult.compressed, stats: mediumResult.stats },
      aggressive: { messages: aggressiveResult.compressed, stats: aggressiveResult.stats }
    };
    
    // Update compression settings (including persisted systemPrompt)
    session.compression = {
      ...session.compression,
      mode: session.compression?.mode ?? 1,
      keepRecent: keepRecent,
      enabled: true,
      lastCompressed: new Date().toISOString(),
      systemPrompt: customSystemPrompt // Persist the custom prompt
    };
    
    await saveSession(session);
    console.log(`[Recompress] SAVED to file. systemPrompt: ${session.compression?.systemPrompt ? 'YES (' + session.compression.systemPrompt.length + ' chars)' : 'NULL'}`);
    console.log(`[Recompress] Done. Light: ${lightResult.stats.ratio * 100}%, Medium: ${mediumResult.stats.ratio * 100}%, Aggressive: ${aggressiveResult.stats.ratio * 100}%`);
    
    res.json({
      success: true,
      none: { messages: allMessages, stats: { originalTokens: Math.round(JSON.stringify(allMessages).length / 4), compressedTokens: Math.round(JSON.stringify(allMessages).length / 4), ratio: 0 } },
      light: session.cachedCompressions.light,
      medium: session.cachedCompressions.medium,
      aggressive: session.cachedCompressions.aggressive
    });
  } catch (error: any) {
    console.error('Recompress error:', error);
    res.status(500).json({ error: 'Recompression failed', message: error.message });
  }
});

// ============================================================
// END SETTINGS API
// ============================================================

// ============================================================
// NEW API ROUTES (Tooly, Notifications, Analytics)
// ============================================================

// Initialize notification service with WebSocket server
notifications.initialize(wss);

// Register new route modules
app.use('/api/tooly', toolyRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/analytics', analyticsRoutes);

// Schedule backup cleanup (every hour)
scheduleBackupCleanup(60 * 60 * 1000);

console.log('✅ New modules registered: Tooly, Notifications, Analytics');

// ============================================================
// END NEW API ROUTES
// ============================================================

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Server status endpoint for Dashboard
app.get('/api/status', async (req, res) => {
  try {
    const settings = await loadServerSettings();
    res.json({
      online: true,
      port: PORT,
      ngrokUrl: process.env.NGROK_URL || null,
      provider: settings.provider || 'lmstudio',
      model: settings.provider === 'lmstudio' 
        ? settings.lmstudioModel 
        : settings.provider === 'azure' 
          ? settings.azureDeploymentName 
          : settings.openaiModel
    });
  } catch (error) {
    res.json({
      online: true,
      port: PORT,
      provider: 'unknown',
      model: 'unknown'
    });
  }
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
  console.log('  🔧 Tooly routes: /api/tooly/*');
  console.log('  🔔 Notifications: /api/notifications/*');
  console.log('  📈 Analytics: /api/analytics/*');
  
  // Start system metrics collection
  systemMetrics.start(1000); // Collect every 1 second
  console.log('  📊 System metrics: ACTIVE (CPU/GPU monitoring)');
  console.log('  🔌 WebSocket: Ready for real-time updates');
});
