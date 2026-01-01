import { Request } from 'express';
import { db } from './database.js';
import { addDebugEntry } from './logger.js';

/**
 * Represents a single phase within a Tooly agent's operation.
 */
export interface ToolyPhase {
    /** The name of the phase. */
    phase: 'planning' | 'execution' | 'response';
    /** The system prompt used in this phase. */
    systemPrompt: string;
    /** The model that executed this phase. */
    model: string;
    /** The time taken for this phase in milliseconds. */
    latencyMs: number;
    /** Optional reasoning or thoughts from the model for this phase. */
    reasoning?: string;
}

/**
 * Represents a single tool call made by the Tooly agent.
 */
export interface ToolyToolCall {
    /** A unique identifier for the tool call. */
    id: string;
    /** The name of the tool being called. */
    name: string;
    /** The arguments passed to the tool. */
    arguments: any;
    /** The result returned by the tool. */
    result?: any;
    /** The execution status of the tool call. */
    status: 'success' | 'failed' | 'timeout' | 'pending';
    /** The time taken for the tool call to complete in milliseconds. */
    latencyMs?: number;
    /** Any error message if the tool call failed. */
    error?: string;
}

/**
 * Contains metadata about the Tooly agent's execution for a given turn.
 */
export interface ToolyMeta {
    /** The operational mode of the agent. */
    mode: 'single' | 'dual' | 'passthrough';
    /** An array of phases the agent went through. */
    phases: ToolyPhase[];
    /** An array of tool calls made during the execution phase. */
    toolCalls?: ToolyToolCall[];
    /** The total time taken for the entire agent operation in milliseconds. */
    totalLatencyMs?: number;
}

/**
 * Represents a single request-response turn in a conversation.
 */
export interface ConversationTurn {
    /** A unique identifier for the turn. */
    id: string;
    /** The timestamp when the turn was recorded. */
    timestamp: string;
    /** The original request object from the client. */
    request: any;
    /** The final response object sent to the client. */
    response?: any;
    /** Optional metadata from the Tooly agent. */
    toolyMeta?: ToolyMeta;
}

/**
 * Represents a full conversation session, containing multiple turns.
 */
export interface ContextSession {
    /** A unique identifier for the session. */
    id: string;
    /** A user-friendly name for the session. */
    name: string;
    /** The IDE or client that initiated the session. */
    ide: string;
    /** A more specific mapping for the IDE if available. */
    ideMapping?: string;
    /** The timestamp when the session was created. */
    created: string;
    /** An array of conversation turns that make up the session. */
    conversations: ConversationTurn[];
    /** The original size of the conversation context before compression. */
    originalSize?: number;
    /** The size of the conversation context after compression. */
    summarizedSize?: number;
    /** A summary of the conversation. */
    summary?: any;
    /** The compression data. */
    compression?: any; // Use the type from compression-engine.ts
    /** The compressed conversation turns. */
    compressedConversations?: ConversationTurn[];
    /** Cached compression results. */
    cachedCompressions?: any;
}

/**
 * Manages the lifecycle of conversation sessions, including creation, updating, and retrieval.
 */
export class SessionService {
    /**
     * Extracts a conversation ID from an incoming request.
     * @param req - The incoming request object.
     */
    static extractConversationId(req: Request): string {
        const body = req.body || {};
        const headers = req.headers || {};
        return body.conversationId || (headers['x-conversation-id'] as string) || '';
    }

    /**
     * Creates a new session in the database if one doesn't already exist for the request.
     * The session is populated with details from the request headers and body.
     * @param req - The request object, containing sessionId, headers, and body.
     */
    static async createSessionFromRequest(req: Request): Promise<void> {
        const sessionExists = db.contextSessionExists(req.body.sessionId);
        if (!sessionExists) {
            const ide = Array.isArray(req.headers['x-ide']) ? req.headers['x-ide'][0] : req.headers['x-ide'] || 'Unknown';
            const sessionData = {
                id: req.body.sessionId,
                name: req.body.sessionName || 'Unnamed Session',
                ide: ide || 'Unknown',
                rawRequest: req.body
            };
            db.createContextSession(sessionData);
            addDebugEntry('session', `✅ Auto-created session: ${req.body.sessionId}`);
        }
    }

    /**
     * Updates a session with a new conversation turn, or updates a session's title.
     * @param sessionId - The ID of the session to update.
     * @param requestBody - The body of the original request.
     * @param responseData - The response data from the LLM.
     * @param agenticMessages - Optional array of messages from an agentic execution.
     * @param options - Optional parameters, e.g., for handling title generation requests.
     * @returns A promise that resolves when the update is complete.
     */
    static async updateSessionWithResponse(
        sessionId: string,
        requestBody: any,
    responseData: any,
        agenticMessages?: any[],
        options?: { isTitleRequest?: boolean; titleTargetSession?: string }): Promise<void> {
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

    /**
     * Loads a session and its conversation turns from the database.
     * @param sessionId - The ID of the session to load.
     * @returns A promise that resolves with the ContextSession object or null if not found.
     */
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
    
    /**
     * Placeholder for saving a session. Currently a no-op as sessions are saved turn-by-turn.
     * @param session - The session object to save.
     * @returns A promise that resolves when the operation is complete.
     */
    static async saveSession(session: ContextSession): Promise<void> {
        // This is a no-op for now as context sessions are managed turn-by-turn in the database.
        // We might want to implement a bulk update if needed, but for index.ts compatibility
        // we just log it.
        addDebugEntry('session', `💾 saveSession called for ${session.id} (no-op in DB mode)`, { sessionId: session.id });
    }
}

