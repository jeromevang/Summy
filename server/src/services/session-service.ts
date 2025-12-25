import { v4 as uuidv4 } from 'uuid';
import { db, type ContextMessage } from './database.js';
import { addDebugEntry } from './logger.js';

export interface ToolyPhase {
    phase: 'planning' | 'execution' | 'response';
    systemPrompt: string;
    model: string;
    latencyMs: number;
    reasoning?: string;
}

export interface ToolyToolCall {
    id: string;
    name: string;
    arguments: any;
    result?: any;
    status: 'success' | 'failed' | 'timeout' | 'pending';
    latencyMs?: number;
    error?: string;
}

export interface ToolyMeta {
    mode: 'single' | 'dual' | 'passthrough';
    phases: ToolyPhase[];
    toolCalls?: ToolyToolCall[];
    totalLatencyMs?: number;
}

export interface ConversationTurn {
    id: string;
    timestamp: string;
    request: any;
    response?: any;
    toolyMeta?: ToolyMeta;
}

export interface ContextSession {
    id: string;
    name: string;
    ide: string;
    ideMapping?: string;
    created: string;
    conversations: ConversationTurn[];
    originalSize?: number;
    summarizedSize?: number;
    summary?: any;
    compression?: any; // Use the type from compression-engine.ts
    compressedConversations?: ConversationTurn[];
    cachedCompressions?: any;
}

export class SessionService {
    static extractConversationId(req: any): string {
        const body = req.body || {};
        const headers = req.headers || {};
        if (headers['x-conversation-id'] || headers['x-session-id']) {
            return headers['x-conversation-id'] || headers['x-session-id'];
        }
        if (body.conversation_id || body.session_id) {
            return body.conversation_id || body.session_id;
        }
        if (body.messages && body.messages.length > 0) {
            const firstUserMessage = body.messages.find((msg: any) => msg.role === 'user');
            if (firstUserMessage && firstUserMessage.content) {
                const content = typeof firstUserMessage.content === 'string'
                    ? firstUserMessage.content
                    : JSON.stringify(firstUserMessage.content);
                const hashInput = content.substring(0, 50);
                return Buffer.from(hashInput).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 16);
            }
        }
        return `conv_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    }

    static async createSessionFromRequest(req: any): Promise<void> {
        const sessionExists = db.contextSessionExists(req.sessionId);
        if (!sessionExists) {
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
            const systemMessage = req.requestBody?.messages?.find((m: any) => m.role === 'system');
            const systemPrompt = systemMessage?.content;
            const ide = req.headers['x-ide'] || req.headers['user-agent']?.split(' ')[0] || 'Unknown';

            db.createContextSession({
                id: req.sessionId,
                name: sessionName,
                ide,
                ideMapping: req.ideMapping || undefined,
                systemPrompt
            });

            addDebugEntry('session', `✅ Auto-created session: ${req.sessionId}`, {
                name: sessionName,
                ide,
                isStreaming: req.isStreaming
            });
        }
    }

    static async updateSessionWithResponse(
        sessionId: string,
        requestBody: any,
        responseData: any,
        agenticMessages?: any[],
        options?: { isTitleRequest?: boolean; titleTargetSession?: string }
    ): Promise<void> {
        if (options?.isTitleRequest && options?.titleTargetSession) {
            const generatedTitle = responseData.choices?.[0]?.message?.content || responseData.content || '';
            if (generatedTitle.trim()) {
                const cleanTitle = generatedTitle.trim().substring(0, 100);
                db.updateContextSessionName(options.titleTargetSession, cleanTitle);
                addDebugEntry('session', `📝 Updated session title: "${cleanTitle}"`, {
                    targetSession: options.titleTargetSession
                });
            }
            return;
        }

        try {
            const turnNumber = db.getLatestTurnNumber(sessionId) + 1;
            const previousToolSetId = db.getPreviousToolSetId(sessionId);
            const messages: any[] = [];
            let sequence = 0;

            if (requestBody?.messages) {
                for (const msg of requestBody.messages) {
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
                const responseContent = responseData.choices?.[0]?.message?.content || responseData.content || '';
                const responseToolCalls = responseData.choices?.[0]?.message?.tool_calls || responseData.tool_calls;
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

            addDebugEntry('response', `✅ Captured turn ${turnNumber} for session: ${sessionId}`, {
                turnNumber,
                messageCount: messages.length,
                isAgentic: !!agenticMessages && agenticMessages.length > 0
            });
        } catch (dbError: any) {
            console.error('[DB] Failed to save turn to database:', dbError.message);
            addDebugEntry('error', `Failed to save turn: ${dbError.message}`, { sessionId });
        }
    }

    static async loadSession(sessionId: string): Promise<ContextSession | null> {
        try {
            const dbSession = db.getContextSession(sessionId);
            if (!dbSession) return null;
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
        } catch (error) {
            return null;
        }
    }
    static async saveSession(session: ContextSession): Promise<void> {
        // This is a no-op for now as context sessions are managed turn-by-turn in the database.
        // We might want to implement a bulk update if needed, but for index.ts compatibility
        // we just log it.
        addDebugEntry('session', `💾 saveSession called for ${session.id} (no-op in DB mode)`, { sessionId: session.id });
    }
}
