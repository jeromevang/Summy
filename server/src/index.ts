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
import { toolyRoutes, notificationsRoutes, analyticsRoutes, ragRoutes } from './routes/index.js';
import { notifications } from './services/notifications.js';
import { scheduleBackupCleanup } from './modules/tooly/rollback.js';
import { mcpClient } from './modules/tooly/mcp-client.js';
import { wsBroadcast } from './services/ws-broadcast.js';
import { systemMetrics } from './services/system-metrics.js';
import { modelManager } from './services/lmstudio-model-manager.js';
import { ideMapping, type IDEMapping } from './services/ide-mapping.js';
import { TOOL_SCHEMAS } from './modules/tooly/tool-prompts.js';
import { ALL_TOOLS, capabilities } from './modules/tooly/capabilities.js';
import { db, type ContextMessage, type ContextTurn } from './services/database.js';

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
  ideMapping?: string;  // IDE mapping identifier (e.g., 'continue', 'cursor')
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

  // 3. Generate ID based on first user message content (stable hash for same conversation)
  if (body.messages && body.messages.length > 0) {
    const firstUserMessage = body.messages.find((msg: any) => msg.role === 'user');
    if (firstUserMessage && firstUserMessage.content) {
      // Create a stable hash based only on the first user message content
      // This ensures the same conversation always gets the same session ID
      const content = typeof firstUserMessage.content === 'string'
        ? firstUserMessage.content
        : JSON.stringify(firstUserMessage.content);
      // Use first 50 chars of content for the hash (no timestamp for stability)
      const hashInput = content.substring(0, 50);
      return Buffer.from(hashInput).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 16);
    }
  }

  // 4. Fallback to timestamp-based ID
  return `conv_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
};

// Session storage functions (using database)
// Note: saveSession is now a no-op since we use the database
// Keeping it for backward compatibility with compression features
// IMPORTANT: Don't broadcast here - it causes infinite loops with the client
const saveSession = async (_session: ContextSession): Promise<void> => {
  // No-op: Session data is in database now
  // Compression cache updates are in-memory only until we add to DB schema
  // TODO: Add compression cache to database schema
};

const loadSession = async (sessionId: string): Promise<ContextSession | null> => {
  try {
    const dbSession = db.getContextSession(sessionId);
    if (!dbSession) return null;
    
    // Convert to old format
    return {
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
  } catch {
    return null;
  }
};

const listSessions = async (): Promise<ContextSession[]> => {
  const dbSessions = db.listContextSessions(100, 0);
  return dbSessions.map(s => ({
    id: s.id,
    name: s.name,
    ide: s.ide,
    created: s.createdAt,
    conversations: []
  }));
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
  let toolCalls: any[] = [];

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

        // Extract tool_calls from delta (streaming tool calls)
        if (parsed.choices?.[0]?.delta?.tool_calls) {
          for (const tc of parsed.choices[0].delta.tool_calls) {
            const idx = tc.index ?? toolCalls.length;
            if (!toolCalls[idx]) {
              toolCalls[idx] = { id: '', type: 'function', function: { name: '', arguments: '' } };
            }
            if (tc.id) toolCalls[idx].id = tc.id;
            if (tc.type) toolCalls[idx].type = tc.type;
            if (tc.function?.name) toolCalls[idx].function.name += tc.function.name;
            if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
          }
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

  // Determine display content
  let displayContent = fullContent;
  if (!displayContent && toolCalls.length > 0) {
    // LLM is making tool calls without text response
    const toolNames = toolCalls.map(tc => tc.function?.name).filter(Boolean).join(', ');
    displayContent = `Calling tools: ${toolNames}`;
  } else if (!displayContent) {
    displayContent = 'No assistant response';
  }

  const result: any = {
    type: 'streaming',
    content: displayContent,
    chunks: chunks.length,
    usage: usage,
    finish_reason: finishReason || 'unknown',
    model: chunks[0]?.model || 'localproxy'
  };

  // Include tool_calls if present
  if (toolCalls.length > 0) {
    result.tool_calls = toolCalls;
  }

  return result;
};

// ============================================================
// AGENTIC TOOL EXECUTION LOOP
// ============================================================

interface AgenticLoopResult {
  finalResponse: any;
  toolExecutions: Array<{
    toolName: string;
    mcpTool: string;
    args: any;
    result: any;
    toolCallId: string;
    isError?: boolean;
  }>;
  iterations: number;
  initialIntent?: string; // The first assistant message text (before tool execution)
  // All messages generated during the agentic loop (with sources)
  agenticMessages: Array<{
    role: string;
    content?: string;
    tool_calls?: any[];
    tool_call_id?: string;
    name?: string;
    _source: 'llm' | 'mcp' | 'middleware';
    isError?: boolean;
  }>;
}

// ============================================================
// AGENTIC LOOP CONFIGURATION
// ============================================================

const AGENTIC_CONFIG = {
  MAX_RESULT_SIZE: 15000,        // Max chars per tool result before summarization
  MAX_ACCUMULATED_SIZE: 50000,   // Max total accumulated context size
  SUMMARIZE_TARGET_SIZE: 2000,   // Target size for summaries
  MAX_DUPLICATE_CALLS: 2,        // Max times same tool+args can be called
};

/**
 * Stream a status bubble to the IDE via SSE
 * 
 * NOTE: DISABLED - Status bubbles were being saved as part of the assistant's
 * response content, polluting the conversation history. The IDE concatenates
 * all delta.content chunks, so there's no way to send ephemeral status without
 * it being saved. Status is now only sent via WebSocket to the Summy dashboard.
 */
const streamStatusBubble = (res: any, status: string, icon: string = '🔄', isLast: boolean = false) => {
  // Disabled: Status bubbles pollute saved responses
  // Status is broadcast via WebSocket instead (broadcastToClients)
  return;
};

/**
 * Summarize a large tool result using the LLM
 */
const summarizeToolResult = async (
  content: string,
  toolName: string,
  args: any,
  llmCallFn: (messages: any[]) => Promise<any>
): Promise<string> => {
  const summarizePrompt = `Summarize the following ${toolName} result concisely. 
Focus on: key information, structure, important names/identifiers.
Keep under ${AGENTIC_CONFIG.SUMMARIZE_TARGET_SIZE} characters.
Original size: ${content.length} chars.

CONTENT:
${content.substring(0, 30000)}${content.length > 30000 ? '\n[...truncated for summarization...]' : ''}

SUMMARY:`;

  try {
    const response = await llmCallFn([
      { role: 'system', content: 'You are a concise summarizer. Output only the summary, no preamble.' },
      { role: 'user', content: summarizePrompt }
    ]);
    
    const summary = response.choices?.[0]?.message?.content || response.content || '';
    return `[SUMMARIZED from ${content.length} chars]\n${summary}\n[End summary. For full content, request specific sections.]`;
  } catch (error: any) {
    console.error('[Agentic] Summarization failed:', error.message);
    // Fallback to truncation if summarization fails
    return `${content.substring(0, AGENTIC_CONFIG.MAX_RESULT_SIZE)}\n[TRUNCATED: ${content.length} chars total. Summarization failed.]`;
  }
};

/**
 * Execute tools from LLM response and continue conversation until final answer
 * This handles the case where LLM returns tool_calls - we execute them via MCP
 * and continue the conversation until we get a text-only response.
 * 
 * @param res - Optional Express response object to stream status bubbles to IDE
 */
const executeAgenticLoop = async (
  initialResponse: any,
  messages: any[],
  llmCallFn: (messages: any[]) => Promise<any>,
  ideMapping: IDEMapping,
  sessionId: string,
  maxIterations: number = 10,
  res?: any  // Express response for streaming status to IDE
): Promise<AgenticLoopResult> => {
  const toolExecutions: AgenticLoopResult['toolExecutions'] = [];
  const agenticMessages: AgenticLoopResult['agenticMessages'] = [];
  let currentResponse = initialResponse;
  let currentMessages = [...messages];
  let iterations = 0;
  let initialIntent: string | undefined;
  
  // Tracking for smart context management
  const toolCallCounts = new Map<string, number>(); // Track duplicate calls
  let accumulatedContextSize = 0; // Track total result size

  // Capture initial intent from first response (the "thinking" text before tool execution)
  const firstContent = initialResponse.choices?.[0]?.message?.content || initialResponse.content || '';
  if (firstContent.trim()) {
    initialIntent = firstContent;
  }

  // Broadcast: Starting agentic loop
  broadcastToClients('turn_status', { 
    sessionId, 
    status: 'thinking', 
    message: initialIntent || 'Processing tool calls...',
    iteration: 0
  });

  // Stream brief "thinking" indicator if there's initial intent
  if (res && initialIntent) {
    streamStatusBubble(res, 'Thinking...', '🤔');
  }

  while (iterations < maxIterations) {
    iterations++;

    // Check if response has tool_calls
    const toolCalls = currentResponse.tool_calls || 
                      currentResponse.choices?.[0]?.message?.tool_calls;
    
    if (!toolCalls || toolCalls.length === 0) {
      // No tool calls, we're done - add final response to agenticMessages
      const finalContent = currentResponse.choices?.[0]?.message?.content || currentResponse.content || '';
      if (finalContent) {
        agenticMessages.push({
          role: 'assistant',
          content: finalContent,
          _source: 'llm'
        });
      }
      
      // Broadcast: Complete
      broadcastToClients('turn_status', { 
        sessionId, 
        status: 'complete', 
        message: 'Response ready',
        iterations
      });
      
      // Stream completion status to IDE (with separator before response)
      if (toolExecutions.length > 0) {
        const successCount = toolExecutions.filter(t => !t.isError).length;
        const errorCount = toolExecutions.filter(t => t.isError).length;
        const statusText = errorCount > 0 
          ? `Done: ${successCount} tools succeeded, ${errorCount} failed`
          : `Done: ${toolExecutions.length} tool${toolExecutions.length > 1 ? 's' : ''} executed`;
        streamStatusBubble(res, statusText, '✨', true); // isLast=true adds separator
      }
      
      console.log(`[Agentic] Loop complete after ${iterations} iterations`);
      return { finalResponse: currentResponse, toolExecutions, iterations, agenticMessages, initialIntent };
    }

    console.log(`[Agentic] Iteration ${iterations}: Processing ${toolCalls.length} tool calls`);

    // Add assistant message with tool_calls to context
    const assistantMessage = currentResponse.choices?.[0]?.message || {
      role: 'assistant',
      content: currentResponse.content || '',
      tool_calls: toolCalls
    };
    currentMessages.push(assistantMessage);
    
    // Track this assistant message with tool_calls
    agenticMessages.push({
      role: 'assistant',
      content: assistantMessage.content || '',
      tool_calls: toolCalls,
      _source: 'llm'
    });

    // Execute each tool call
    for (const tc of toolCalls) {
      const toolName = tc.function?.name || tc.name;
      const toolCallId = tc.id;
      let args: any = {};
      
      try {
        args = typeof tc.function?.arguments === 'string' 
          ? JSON.parse(tc.function.arguments)
          : tc.function?.arguments || {};
      } catch (e) {
        console.warn(`[Agentic] Failed to parse tool arguments:`, tc.function?.arguments);
      }

      // === DUPLICATE CALL DETECTION ===
      const callKey = `${toolName}:${JSON.stringify(args)}`;
      const callCount = (toolCallCounts.get(callKey) || 0) + 1;
      toolCallCounts.set(callKey, callCount);
      
      if (callCount > AGENTIC_CONFIG.MAX_DUPLICATE_CALLS) {
        console.warn(`[Agentic] Duplicate call detected: ${toolName} called ${callCount} times with same args`);
        
        // Skip execution and inject warning
        const skipMessage = `[SKIPPED] You have already called ${toolName} with these exact arguments ${callCount - 1} time(s). The result was provided above. Please use that information to provide your final answer, or try a different approach.`;
        
        toolExecutions.push({
          toolName,
          mcpTool: toolName,
          args,
          result: skipMessage,
          toolCallId,
          isError: false
        });
        
        currentMessages.push({
          role: 'tool',
          content: skipMessage,
          tool_call_id: toolCallId
        });
        
        agenticMessages.push({
          role: 'tool',
          content: skipMessage,
          tool_call_id: toolCallId,
          name: toolName,
          _source: 'middleware',
          isError: false
        });
        
        continue; // Skip actual execution
      }

      console.log(`[Agentic] Executing tool: ${toolName} with args:`, args);
      
      // Broadcast: Running tool
      broadcastToClients('turn_status', { 
        sessionId, 
        status: 'running_tool', 
        message: `Running ${toolName}...`,
        tool: toolName,
        iteration: iterations
      });

      // Stream status to IDE
      streamStatusBubble(res, `Running \`${toolName}\`...`, '🔧');

      // Check if tool is mapped to MCP
      const mapped = ideMapping.mappings[toolName];
      let result: any;
      let mcpToolName = toolName;
      let isError = false;

      if (mapped) {
        // Map parameters
        mcpToolName = mapped.mcp;
        let mcpArgs = { ...args };
        
        if (mapped.params) {
          mcpArgs = {};
          for (const [ideParam, mcpParam] of Object.entries(mapped.params)) {
            if (args[ideParam] !== undefined) {
              mcpArgs[mcpParam as string] = args[ideParam];
            }
          }
        }

        console.log(`[Agentic] Mapped ${toolName} -> ${mcpToolName} with args:`, mcpArgs);

        try {
          const mcpResult = await mcpClient.executeTool(mcpToolName, mcpArgs);
          result = mcpResult.content?.[0]?.text || JSON.stringify(mcpResult);
        } catch (error: any) {
          console.error(`[Agentic] MCP tool execution failed:`, error.message);
          result = `Error executing ${mcpToolName}: ${error.message}`;
          isError = true;
        }
      } else {
        // Tool not mapped, check if it's a direct MCP tool
        try {
          const mcpResult = await mcpClient.executeTool(toolName, args);
          result = mcpResult.content?.[0]?.text || JSON.stringify(mcpResult);
        } catch (error: any) {
          console.error(`[Agentic] Direct tool execution failed:`, error.message);
          result = `Error: Tool ${toolName} not available. ${error.message}`;
          isError = true;
        }
      }

      // === DETECT ERROR MESSAGES IN RESULTS ===
      // Some tools return error messages as successful results (e.g., "Error: fetch failed")
      // We need to detect these and mark them as errors
      if (!isError && result && typeof result === 'string') {
        const errorPatterns = [
          /^Error:/i,
          /^MCP error/i,
          /error:.*fetch failed/i,
          /error:.*connection refused/i,
          /error:.*ECONNREFUSED/i,
          /error:.*timeout/i,
        ];
        
        if (errorPatterns.some(pattern => pattern.test(result))) {
          console.warn(`[Agentic] Detected error in tool result: ${result.substring(0, 100)}`);
          isError = true;
        }
      }

      // === SMART SUMMARIZATION FOR LARGE RESULTS ===
      let processedResult = result;
      if (!isError && result && result.length > AGENTIC_CONFIG.MAX_RESULT_SIZE) {
        console.log(`[Agentic] Result too large (${result.length} chars), summarizing...`);
        broadcastToClients('turn_status', { 
          sessionId, 
          status: 'thinking', 
          message: `Summarizing large result from ${toolName}...`,
          iteration: iterations
        });
        // Don't stream "summarizing" status - too verbose
        processedResult = await summarizeToolResult(result, mcpToolName, args, llmCallFn);
        console.log(`[Agentic] Summarized to ${processedResult.length} chars`);
        
        // Only warn if summarization failed
        if (processedResult.includes('Summarization failed')) {
          streamStatusBubble(res, `⚠️ Result truncated (${Math.round(result.length/1024)}KB)`, '');
        }
      }
      
      // Track accumulated context size
      accumulatedContextSize += processedResult.length;
      console.log(`[Agentic] Accumulated context: ${accumulatedContextSize} chars`);

      toolExecutions.push({
        toolName,
        mcpTool: mcpToolName,
        args,
        result: processedResult,
        toolCallId,
        isError
      });

      // Stream completion status to IDE
      const sizeInfo = processedResult?.length > 1000 ? ` (${Math.round(processedResult.length/1024)}KB)` : '';
      if (isError) {
        streamStatusBubble(res, `\`${toolName}\` failed: ${result?.substring(0, 80)}...`, '❌');
      } else {
        streamStatusBubble(res, `\`${toolName}\` completed${sizeInfo}`, '✅');
      }

      // Use processedResult (potentially summarized) for LLM context
      const toolResultContent = typeof processedResult === 'string' ? processedResult : JSON.stringify(processedResult);

      // Add tool result to messages
      currentMessages.push({
        role: 'tool',
        content: toolResultContent,
        tool_call_id: toolCallId
      });

      // Track tool result in agenticMessages with error flag
      agenticMessages.push({
        role: 'tool',
        content: toolResultContent,
        tool_call_id: toolCallId,
        name: mcpToolName,
        _source: 'mcp',
        isError
      });

      console.log(`[Agentic] Tool ${toolName} result length: ${processedResult?.length || 0} chars (original: ${result?.length || 0})`);
    }
    
    // === ACCUMULATED CONTEXT OVERFLOW PROTECTION ===
    if (accumulatedContextSize > AGENTIC_CONFIG.MAX_ACCUMULATED_SIZE) {
      console.warn(`[Agentic] Accumulated context too large (${accumulatedContextSize}), forcing completion`);
      broadcastToClients('turn_status', { 
        sessionId, 
        status: 'complete', 
        message: 'Context limit reached, generating response...',
        iterations
      });
      
      // Inject a message to force the model to respond
      currentMessages.push({
        role: 'system',
        content: `IMPORTANT: You have gathered a lot of information (${accumulatedContextSize} chars). Please synthesize what you have learned and provide your final answer now. Do not make any more tool calls.`
      });
      streamStatusBubble(res, `Context limit reached (${Math.round(accumulatedContextSize/1024)}KB), generating response...`, '⚠️');
    }

    // Broadcast: Thinking again after tool execution
    broadcastToClients('turn_status', { 
      sessionId, 
      status: 'thinking', 
      message: 'Processing response...',
      iteration: iterations
    });

    // Don't stream iteration status - too verbose
    // Just log it for debugging
    console.log(`[Agentic] Processing iteration ${iterations}`);

    // Call LLM again with updated context
    console.log(`[Agentic] Calling LLM with ${currentMessages.length} messages`);
    currentResponse = await llmCallFn(currentMessages);
  }

  // Broadcast: Max iterations reached
  broadcastToClients('turn_status', {
    sessionId,
    status: 'complete',
    message: 'Max iterations reached',
    iterations: maxIterations
  });

  // Stream max iterations warning to IDE
  streamStatusBubble(res, `Max iterations (${maxIterations}) reached`, '⚠️');

  console.warn(`[Agentic] Max iterations (${maxIterations}) reached`);
  
  // When max iterations reached, synthesize a response if the model is still returning tool_calls
  const lastToolCalls = currentResponse.tool_calls || currentResponse.choices?.[0]?.message?.tool_calls;
  if (lastToolCalls && lastToolCalls.length > 0) {
    // The model is still trying to call tools - create a fallback response
    const toolSummary = toolExecutions.map(t => `- ${t.toolName}: ${t.isError ? 'error' : 'success'}`).join('\n');
    const fallbackContent = `I gathered the following information from ${toolExecutions.length} tool calls:\n${toolSummary}\n\nBased on this information, I can provide a summary of what was found. However, I reached the maximum processing limit before completing my analysis.`;
    
    return { 
      finalResponse: {
        ...currentResponse,
        choices: [{
          message: {
            role: 'assistant',
            content: fallbackContent
          },
          finish_reason: 'length'
        }]
      }, 
      toolExecutions, 
      iterations, 
      agenticMessages, 
      initialIntent 
    };
  }
  
  return { finalResponse: currentResponse, toolExecutions, iterations, agenticMessages, initialIntent };
};

/**
 * Check if a response requires agentic tool execution
 */
const shouldExecuteAgentically = (response: any, ideMapping: IDEMapping, mcpToolsAdded: string[] = []): boolean => {
  const toolCalls = response.tool_calls || 
                    response.choices?.[0]?.message?.tool_calls;
  
  if (!toolCalls || toolCalls.length === 0) {
    return false;
  }

  // Check if any tool call is mapped to MCP or is a direct MCP extension tool
  for (const tc of toolCalls) {
    const toolName = tc.function?.name || tc.name;
    
    // Check IDE mappings
    if (ideMapping.mappings[toolName]) {
      console.log(`[Agentic] Tool ${toolName} is mapped - will execute agentically`);
      return true;
    }
    
    // Check if it's a direct MCP extension tool we added
    if (mcpToolsAdded.includes(toolName)) {
      console.log(`[Agentic] Tool ${toolName} is MCP extension - will execute agentically`);
      return true;
    }
  }

  return false;
};

// Detect if this is a title generation request from Continue
const isTitleGenerationRequest = (req: any): boolean => {
  const body = req.requestBody || req.body;
  
  // Check for low max_tokens (title requests use ~16 tokens)
  if (body?.max_tokens && body.max_tokens <= 50) {
    // Also check if no tools are provided (title requests don't need tools)
    if (!body.tools || body.tools.length === 0) {
      // Check if user message contains title generation pattern
      const userMessage = body?.messages?.find((m: any) => m.role === 'user');
      if (userMessage?.content?.toLowerCase().includes('please reply with a title')) {
        return true;
      }
    }
  }
  
  return false;
};

// Handle title generation request - update existing session instead of creating new one
const handleTitleGenerationRequest = async (req: any, res: any, next: any): Promise<boolean> => {
  if (!isTitleGenerationRequest(req)) {
    return false;
  }
  
  console.log('[Title] Detected title generation request');
  
  // Find the most recent session (within 60 seconds)
  const recentSession = db.getMostRecentSession(60);
  
  if (!recentSession) {
    console.log('[Title] No recent session found to update');
    return false;
  }
  
  console.log('[Title] Will update session:', recentSession.id, 'with generated title');
  
  // Mark this request to update the session title on response
  req.isTitleRequest = true;
  req.titleTargetSession = recentSession.id;
  
  return true;
};

// Create session immediately on request
const createSessionFromRequest = async (req: any): Promise<void> => {
  console.log('[Session] createSessionFromRequest called for:', req.sessionId);
  
  // Check if session exists in database
  const sessionExists = db.contextSessionExists(req.sessionId);

  if (!sessionExists) {
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

    // Extract system prompt from request
    const systemMessage = req.requestBody?.messages?.find((m: any) => m.role === 'system');
    const systemPrompt = systemMessage?.content;

    const ide = req.headers['x-ide'] || req.headers['user-agent']?.split(' ')[0] || 'Unknown';

    // Create session in database only
    db.createContextSession({
      id: req.sessionId,
      name: sessionName,
      ide,
      ideMapping: req.ideMapping || undefined,
      systemPrompt
    });

    console.log('[Session] Created in DB:', req.sessionId);

    addDebugEntry('session', `✅ Auto-created session: ${req.sessionId}`, {
      name: sessionName,
      ide,
      isStreaming: req.isStreaming
    });
  }
};

// Update session with response data (database only)
const updateSessionWithResponse = async (
  sessionId: string, 
  requestBody: any, 
  responseData: any,
  agenticMessages?: AgenticLoopResult['agenticMessages'],
  options?: { isTitleRequest?: boolean; titleTargetSession?: string }
): Promise<void> => {
  // Handle title generation requests - update the original session's name
  if (options?.isTitleRequest && options?.titleTargetSession) {
    const generatedTitle = responseData.choices?.[0]?.message?.content || 
                          responseData.content || '';
    if (generatedTitle.trim()) {
      const cleanTitle = generatedTitle.trim().substring(0, 100); // Limit title length
      console.log(`[Title] Updating session ${options.titleTargetSession} with title: "${cleanTitle}"`);
      db.updateContextSessionName(options.titleTargetSession, cleanTitle);
      addDebugEntry('session', `📝 Updated session title: "${cleanTitle}"`, { 
        targetSession: options.titleTargetSession 
      });
    }
    // Don't create a turn for title requests
    return;
  }
  
  try {
    const turnNumber = db.getLatestTurnNumber(sessionId) + 1;
    const previousToolSetId = db.getPreviousToolSetId(sessionId);
    
    // Build messages array from request + agentic loop + response
    const messages: ContextMessage[] = [];
    let sequence = 0;
    
    // Add request messages (from IDE)
    if (requestBody?.messages) {
      for (const msg of requestBody.messages) {
        // Skip system messages (stored at session level)
        if (msg.role === 'system') continue;
        
        messages.push({
          sequence: sequence++,
          role: msg.role,
          content: msg.content || undefined,
          toolCalls: msg.tool_calls || undefined,
          toolCallId: msg.tool_call_id || undefined,
          source: 'ide'
        });
      }
    }
    
    // Add agentic loop messages if present
    if (agenticMessages && agenticMessages.length > 0) {
      for (const msg of agenticMessages) {
        messages.push({
          sequence: sequence++,
          role: msg.role as any,
          content: msg.content || undefined,
          toolCalls: msg.tool_calls || undefined,
          toolCallId: msg.tool_call_id || undefined,
          name: msg.name || undefined,
          source: msg._source
        });
      }
    } else {
      // No agentic loop - add the response directly
      const responseContent = responseData.choices?.[0]?.message?.content || 
                             responseData.content || '';
      const responseToolCalls = responseData.choices?.[0]?.message?.tool_calls ||
                               responseData.tool_calls;
      
      if (responseContent || responseToolCalls) {
        messages.push({
          sequence: sequence++,
          role: 'assistant',
          content: responseContent || undefined,
          toolCalls: responseToolCalls || undefined,
          source: 'llm'
        });
      }
    }
    
    // Add turn to database (includes raw_request and raw_response for debugging)
    db.addContextTurn({
      sessionId,
      turnNumber,
      tools: requestBody?.tools,
      previousToolSetId: previousToolSetId || undefined,
      rawRequest: requestBody,
      rawResponse: responseData,
      isAgentic: !!agenticMessages && agenticMessages.length > 0,
      agenticIterations: responseData.toolyMeta?.iterations || 0,
      messages
    });
    
    console.log(`[DB] Saved turn ${turnNumber} with ${messages.length} messages`);
    
    addDebugEntry('response', `✅ Captured turn ${turnNumber} for session: ${sessionId}`, {
      turnNumber,
      messageCount: messages.length,
      isAgentic: !!agenticMessages && agenticMessages.length > 0
    });
  } catch (dbError: any) {
    console.error('[DB] Failed to save turn to database:', dbError.message);
    addDebugEntry('error', `Failed to save turn: ${dbError.message}`, { sessionId });
  }
};

// Manual proxy function using axios - MUCH SIMPLER!
const proxyToOpenAI = async (req: any, res: any) => {
  try {
    // Extract session info and create session FIRST
    req.requestBody = req.body;
    req.sessionId = extractConversationId(req);
    req.isStreaming = req.body?.stream === true;

    // Check if this is a title generation request from Continue
    const isTitleReq = await handleTitleGenerationRequest(req, res, null);
    
    if (!isTitleReq) {
      // CREATE SESSION IMMEDIATELY (only if not a title request)
      await createSessionFromRequest(req);
    }

    // Broadcast: Turn started (thinking)
    broadcastToClients('turn_status', { 
      sessionId: req.sessionId, 
      status: 'thinking', 
      message: 'Waiting for response...'
    });

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
    
    // ========== IDE DETECTION AND TOOL MERGING ==========
    // Parse model name to detect IDE (e.g., "gpt-4o-continue" -> ide: "continue")
    const parsedModel = ideMapping.parseModelIDE(requestedModel);
    const ideMappingConfig = await ideMapping.loadIDEMapping(parsedModel.ide);
    
    // Store IDE info in session for UI display
    if (session && parsedModel.ide) {
      session.ide = ideMappingConfig.ide;
      session.ideMapping = parsedModel.ide;
      await saveSession(session);
    }
    
    // Get the actual model ID based on provider
    const actualModelId = settings.provider === 'lmstudio' 
      ? settings.lmstudioModel 
      : settings.provider === 'azure'
        ? settings.azureDeploymentName
        : settings.openaiModel || parsedModel.baseModel;
    
    // Load model profile and get enabled tools
    const modelProfile = actualModelId ? await capabilities.getProfile(actualModelId) : null;
    const modelEnabledTools = modelProfile?.enabledTools?.length ? modelProfile.enabledTools : ALL_TOOLS;
    
    // Get the list of MCP tools to add (tools not covered by IDE)
    const mcpToolsToAdd = ideMapping.getMCPToolsToAdd(modelEnabledTools, ideMappingConfig);
    
    // Build the existing tools array from request
    let toolsToSend = req.body?.tools || [];
    
    // Add MCP extension tools that aren't covered by IDE
    if (mcpToolsToAdd.length > 0) {
      const existingToolNames = new Set(toolsToSend.map((t: any) => t.function?.name).filter(Boolean));
      
      for (const mcpTool of mcpToolsToAdd) {
        // Only add if not already present and schema exists
        if (!existingToolNames.has(mcpTool) && TOOL_SCHEMAS[mcpTool]) {
          toolsToSend.push(TOOL_SCHEMAS[mcpTool]);
        }
      }
      
      addDebugEntry('request', `Added ${mcpToolsToAdd.length} MCP tools for ${ideMappingConfig.ide}`, {
        ide: ideMappingConfig.ide,
        mcpToolsAdded: mcpToolsToAdd.length,
        totalTools: toolsToSend.length
      });
    }
    
    // Inject MCP tool descriptions into system prompt if needed
    const mcpToolPrompt = ideMapping.buildUnifiedToolPrompt(modelEnabledTools, ideMappingConfig);
    if (mcpToolPrompt && messagesToSend.length > 0) {
      // Find system message and append MCP tool info
      const systemMsgIndex = messagesToSend.findIndex((m: any) => m.role === 'system');
      if (systemMsgIndex >= 0) {
        messagesToSend[systemMsgIndex] = {
          ...messagesToSend[systemMsgIndex],
          content: messagesToSend[systemMsgIndex].content + '\n\n' + mcpToolPrompt
        };
      } else {
        // No system message - add one
        messagesToSend.unshift({
          role: 'system',
          content: mcpToolPrompt.trim()
        });
      }
    }
    
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
        tools: toolsToSend.length > 0 ? toolsToSend : undefined,
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
          
          // Buffer the response first to check for tool calls
          let fullContent = '';
          response.data.on('data', (chunk: Buffer) => {
            fullContent += chunk.toString();
          });
          
          response.data.on('end', async () => {
            const parsedResponse = parseStreamingResponse(fullContent);
            
            // Check if we need to execute tools agentically
            if (shouldExecuteAgentically(parsedResponse, ideMappingConfig, mcpToolsToAdd)) {
              console.log('[Agentic] Tool calls detected, executing via MCP...');
              
              // Create LLM call function for the loop
              const llmCallFn = async (msgs: any[]): Promise<any> => {
                const loopBody = {
                  ...modifiedBody,
                  messages: msgs,
                  stream: false  // Use non-streaming for loop iterations
                };
                const loopResponse = await axios({
                  method: 'POST',
                  url: lmstudioUrl,
                  headers: { 'Content-Type': 'application/json' },
                  data: loopBody,
                  timeout: 300000,
                });
                return loopResponse.data;
              };
              
              try {
                const { finalResponse, toolExecutions, iterations, agenticMessages, initialIntent } = await executeAgenticLoop(
                  parsedResponse,
                  messagesToSend,
                  llmCallFn,
                  ideMappingConfig,
                  req.sessionId,
                  10,  // maxIterations
                  res  // Pass response for streaming status bubbles
                );
                
                console.log(`[Agentic] Completed with ${toolExecutions.length} tool executions in ${iterations} iterations`);
                
                // Stream the final response to client
                const finalContent = finalResponse.choices?.[0]?.message?.content || finalResponse.content || '';
                
                // Create SSE format for the final response
                const sseChunk = JSON.stringify({
                  id: `chatcmpl-${Date.now()}`,
                  object: 'chat.completion.chunk',
                  created: Math.floor(Date.now() / 1000),
                  model: lmstudioModel,
                  choices: [{
                    index: 0,
                    delta: { content: finalContent },
                    finish_reason: 'stop'
                  }]
                });
                res.write(`data: ${sseChunk}\n\n`);
                res.write('data: [DONE]\n\n');
                
                // Save with tool execution metadata
                const enrichedResponse = {
                  ...finalResponse,
                  toolyMeta: {
                    agenticLoop: true,
                    toolExecutions,
                    iterations,
                    initialIntent
                  }
                };
                await updateSessionWithResponse(req.sessionId, req.requestBody, enrichedResponse, agenticMessages, 
                  { isTitleRequest: req.isTitleRequest, titleTargetSession: req.titleTargetSession });
                res.end();
              } catch (agentError: any) {
                console.error('[Agentic] Loop failed:', agentError.message);
                addDebugEntry('error', `Agentic loop error: ${agentError.message}`, {});
                
                // Fall back to original response
                res.write(fullContent);
                await updateSessionWithResponse(req.sessionId, req.requestBody, parsedResponse, undefined,
                  { isTitleRequest: req.isTitleRequest, titleTargetSession: req.titleTargetSession });
                res.end();
              }
            } else {
              // No mapped tool calls, stream normally
              res.write(fullContent);
              await updateSessionWithResponse(req.sessionId, req.requestBody, parsedResponse, undefined,
                { isTitleRequest: req.isTitleRequest, titleTargetSession: req.titleTargetSession });
              
              // Broadcast: Complete
              broadcastToClients('turn_status', { 
                sessionId: req.sessionId, 
                status: 'complete', 
                message: 'Response ready'
              });
              
              res.end();
            }
          });
          
          response.data.on('error', (err: Error) => {
            console.error('❌ LM STUDIO STREAM ERROR:', err.message);
            addDebugEntry('error', `LM Studio stream error: ${err.message}`, {});
            res.end();
          });
        } else {
          // Non-streaming: check for agentic execution
          if (shouldExecuteAgentically(response.data, ideMappingConfig, mcpToolsToAdd)) {
            console.log('[Agentic] Tool calls detected (non-streaming), executing via MCP...');
            
            const llmCallFn = async (msgs: any[]): Promise<any> => {
              const loopBody = { ...modifiedBody, messages: msgs, stream: false };
              const loopResponse = await axios({
                method: 'POST',
                url: lmstudioUrl,
                headers: { 'Content-Type': 'application/json' },
                data: loopBody,
                timeout: 300000,
              });
              return loopResponse.data;
            };
            
            const { finalResponse, toolExecutions, iterations, agenticMessages, initialIntent } = await executeAgenticLoop(
              response.data,
              messagesToSend,
              llmCallFn,
              ideMappingConfig,
              req.sessionId
            );
            
            const enrichedResponse = {
              ...finalResponse,
              toolyMeta: { agenticLoop: true, toolExecutions, iterations, initialIntent }
            };
            await updateSessionWithResponse(req.sessionId, req.requestBody, enrichedResponse, agenticMessages,
              { isTitleRequest: req.isTitleRequest, titleTargetSession: req.titleTargetSession });
            res.json(finalResponse);
          } else {
            await updateSessionWithResponse(req.sessionId, req.requestBody, response.data, undefined,
              { isTitleRequest: req.isTitleRequest, titleTargetSession: req.titleTargetSession });
            res.json(response.data);
          }
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
        tools: toolsToSend.length > 0 ? toolsToSend : undefined,
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
            await updateSessionWithResponse(req.sessionId, req.requestBody, parsedResponse, undefined,
              { isTitleRequest: req.isTitleRequest, titleTargetSession: req.titleTargetSession });
            res.end();
          });
          response.data.on('error', (err: Error) => {
            console.error('❌ AZURE STREAM ERROR:', err.message);
            addDebugEntry('error', `Azure stream error: ${err.message}`, {});
            res.end();
          });
        } else {
          await updateSessionWithResponse(req.sessionId, req.requestBody, response.data, undefined,
            { isTitleRequest: req.isTitleRequest, titleTargetSession: req.titleTargetSession });
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
    // Also use the base model (without IDE suffix) for OpenAI
    let actualModel: string;
    const baseModel = parsedModel.baseModel;  // Model without IDE suffix
    if (knownOpenAIModels.some(m => baseModel.startsWith(m))) {
      actualModel = baseModel;
    } else {
      actualModel = settings.openaiModel || 'gpt-4o-mini';
    }
    
    // Create modified request body with correct model, compressed messages, and merged tools
    const modifiedBody = {
      ...req.body,
      model: actualModel,
      messages: messagesToSend,
      tools: toolsToSend.length > 0 ? toolsToSend : undefined,
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
        await updateSessionWithResponse(req.sessionId, req.requestBody, parsedResponse, undefined,
          { isTitleRequest: req.isTitleRequest, titleTargetSession: req.titleTargetSession });
        res.end();
      });
      response.data.on('error', (err: Error) => {
        console.error('❌ STREAM ERROR:', err.message);
        addDebugEntry('error', `Stream error: ${err.message}`, {});
        res.end();
      });
    } else {
      // Handle regular response
      await updateSessionWithResponse(req.sessionId, req.requestBody, response.data, undefined,
        { isTitleRequest: req.isTitleRequest, titleTargetSession: req.titleTargetSession });
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
      }, undefined, { isTitleRequest: req.isTitleRequest, titleTargetSession: req.titleTargetSession });
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

// Session management API (using database)
app.get('/api/sessions', async (req, res) => {
  try {
    // Get sessions from database and convert to old format for backward compatibility
    const dbSessions = db.listContextSessions(100, 0);
    const sessions = dbSessions.map(s => ({
      id: s.id,
      name: s.name,
      ide: s.ide,
      created: s.createdAt,
      turnCount: s.turnCount
    }));
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load sessions' });
  }
});

app.get('/api/sessions/:id', async (req, res) => {
  try {
    // Get session from database and convert to old format
    const dbSession = db.getContextSession(req.params.id);
    if (!dbSession) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Convert to old format expected by client
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

app.post('/api/sessions', async (req, res) => {
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

app.delete('/api/sessions/:id', async (req, res) => {
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

// Delete ALL sessions
app.delete('/api/sessions', async (req, res) => {
  try {
    const deleted = db.clearAllContextSessions();
    addDebugEntry('session', `🗑️ Cleared all sessions: ${deleted} deleted`, {});
    res.json({ success: true, deleted });
  } catch (error) {
    res.status(500).json({ error: 'Failed to clear sessions' });
  }
});

// ============================================================
// CONTEXT SESSIONS API (New normalized database)
// ============================================================

// List context sessions from database
app.get('/api/context-sessions', async (req, res) => {
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

// Get single context session with all turns and messages
app.get('/api/context-sessions/:id', async (req, res) => {
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

// Get single turn with messages
app.get('/api/context-turns/:id', async (req, res) => {
  try {
    const turn = db.getContextTurn(req.params.id);
    if (!turn) {
      return res.status(404).json({ error: 'Turn not found' });
    }
    res.json(turn);
  } catch (error: any) {
    console.error('[API] Failed to get turn:', error.message);
    res.status(500).json({ error: 'Failed to load turn' });
  }
});

// Delete context session
app.delete('/api/context-sessions/:id', async (req, res) => {
  try {
    const deleted = db.deleteContextSession(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json({ success: true });
  } catch (error: any) {
    console.error('[API] Failed to delete context session:', error.message);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

// Clear all context sessions
app.delete('/api/context-sessions', async (req, res) => {
  try {
    const deleted = db.clearAllContextSessions();
    res.json({ success: true, deleted });
  } catch (error: any) {
    console.error('[API] Failed to clear context sessions:', error.message);
    res.status(500).json({ error: 'Failed to clear sessions' });
  }
});

// Get tool set by ID
app.get('/api/tool-sets/:id', async (req, res) => {
  try {
    const tools = db.getToolSet(req.params.id);
    if (!tools) {
      return res.status(404).json({ error: 'Tool set not found' });
    }
    res.json({ tools });
  } catch (error: any) {
    console.error('[API] Failed to get tool set:', error.message);
    res.status(500).json({ error: 'Failed to load tool set' });
  }
});

// Get system prompt by ID
app.get('/api/system-prompts/:id', async (req, res) => {
  try {
    const content = db.getSystemPrompt(req.params.id);
    if (!content) {
      return res.status(404).json({ error: 'System prompt not found' });
    }
    res.json({ content });
  } catch (error: any) {
    console.error('[API] Failed to get system prompt:', error.message);
    res.status(500).json({ error: 'Failed to load system prompt' });
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
app.use('/api/rag', ragRoutes);

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
server.listen(PORT, async () => {
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
  
  // Startup cleanup: Unload any stale LLM models from LM Studio
  // (Embedding models are NOT touched - they use a separate API)
  try {
    const { modelManager } = await import('./services/lmstudio-model-manager.js');
    await modelManager.cleanupOnStartup();
  } catch (error) {
    console.log('  ⚠️ LM Studio cleanup skipped (not available)');
  }
  
  // Start system metrics collection
  systemMetrics.start(1000); // Collect every 1 second
  console.log('  📊 System metrics: ACTIVE (CPU/GPU monitoring)');
  console.log('  🔌 WebSocket: Ready for real-time updates');
});

// Graceful shutdown handling - prevents EADDRINUSE on nodemon restarts
const gracefulShutdown = (signal: string) => {
  console.log(`\n⚡ Received ${signal}, shutting down gracefully...`);
  
  // Stop accepting new connections
  server.close(() => {
    console.log('✅ HTTP server closed');
    
    // Close WebSocket connections
    wss.clients.forEach(client => {
      client.close();
    });
    wss.close(() => {
      console.log('✅ WebSocket server closed');
      
      // Stop metrics collection
      systemMetrics.stop();
      console.log('✅ System metrics stopped');
      
      process.exit(0);
    });
  });

  // Force exit after 5 seconds if graceful shutdown fails
  setTimeout(() => {
    console.error('⚠️ Forced shutdown after timeout');
    process.exit(1);
  }, 5000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
