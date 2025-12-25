import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { DBBase } from './db-base.js';

export interface SystemPrompt {
    id: string;
    content: string;
    hash: string;
    createdAt: string;
}

export interface ToolSet {
    id: string;
    tools: any[];
    toolCount: number;
    hash: string;
    createdAt: string;
}

export interface ContextMessage {
    id?: number;
    turnId?: string;
    sequence: number;
    role: 'system' | 'user' | 'assistant' | 'tool';
    content?: string;
    toolCalls?: any[];
    toolCallId?: string;
    name?: string;
    source?: 'ide' | 'llm' | 'mcp' | 'middleware' | 'summy';
}

export interface ContextTurn {
    id: string;
    sessionId: string;
    turnNumber: number;
    toolSetId?: string;
    toolChangeReason?: string;
    rawRequest?: any;
    rawResponse?: any;
    isAgentic?: boolean;
    agenticIterations?: number;
    messages: ContextMessage[];
    createdAt?: string;
}

export interface ContextSessionDB {
    id: string;
    name: string;
    ide: string;
    ideMapping?: string;
    systemPromptId?: string;
    systemPrompt?: string;
    createdAt: string;
    updatedAt: string;
    turns: ContextTurn[];
}

export class DBContext extends DBBase {
    // Hash helper
    private hashContent(content: string): string {
        return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
    }

    // Get or create system prompt (deduplicated)
    public getOrCreateSystemPrompt(content: string): string {
        const hash = this.hashContent(content);
        const existing = this.get('SELECT id FROM system_prompts WHERE hash = ?', [hash]);
        if (existing) return existing.id;

        const id = uuidv4();
        this.run('INSERT INTO system_prompts (id, content, hash) VALUES (?, ?, ?)', [id, content, hash]);
        return id;
    }

    // Get system prompt by ID
    public getSystemPrompt(id: string): string | null {
        const row = this.get('SELECT content FROM system_prompts WHERE id = ?', [id]);
        return row?.content || null;
    }

    // Get or create tool set (deduplicated)
    public getOrCreateToolSet(tools: any[]): string {
        const toolsJson = JSON.stringify(tools);
        const hash = this.hashContent(toolsJson);
        const existing = this.get('SELECT id FROM tool_sets WHERE hash = ?', [hash]);
        if (existing) return existing.id;

        const id = uuidv4();
        this.run('INSERT INTO tool_sets (id, tools, tool_count, hash) VALUES (?, ?, ?, ?)',
            [id, toolsJson, tools.length, hash]);
        return id;
    }

    // Get tool set by ID
    public getToolSet(id: string): any[] | null {
        const row = this.get('SELECT tools FROM tool_sets WHERE id = ?', [id]);
        return row ? JSON.parse(row.tools) : null;
    }

    // Create new context session
    public createContextSession(session: {
        id: string;
        name: string;
        ide: string;
        ideMapping?: string;
        systemPrompt?: string;
    }): void {
        let systemPromptId: string | null = null;
        if (session.systemPrompt) {
            systemPromptId = this.getOrCreateSystemPrompt(session.systemPrompt);
        }

        this.run(
            'INSERT INTO context_sessions (id, name, ide, ide_mapping, system_prompt_id) VALUES (?, ?, ?, ?, ?)',
            [session.id, session.name, session.ide, session.ideMapping || null, systemPromptId]
        );
    }

    // Get context session by ID (with turns and messages)
    public getContextSession(id: string): ContextSessionDB | null {
        const sessionRow = this.get(`
      SELECT cs.*, sp.content as system_prompt_content
      FROM context_sessions cs
      LEFT JOIN system_prompts sp ON cs.system_prompt_id = sp.id
      WHERE cs.id = ?
    `, [id]);

        if (!sessionRow) return null;

        const turnRows = this.query('SELECT * FROM context_turns WHERE session_id = ? ORDER BY turn_number ASC', [id]);

        const turns: ContextTurn[] = turnRows.map(turnRow => {
            const messageRows = this.query('SELECT * FROM context_messages WHERE turn_id = ? ORDER BY sequence ASC', [turnRow.id]);

            const messages: ContextMessage[] = messageRows.map(msgRow => ({
                id: msgRow.id,
                turnId: msgRow.turn_id,
                sequence: msgRow.sequence,
                role: msgRow.role,
                content: msgRow.content,
                toolCalls: msgRow.tool_calls ? JSON.parse(msgRow.tool_calls) : undefined,
                toolCallId: msgRow.tool_call_id,
                name: msgRow.name,
                source: msgRow.source
            }));

            return {
                id: turnRow.id,
                sessionId: turnRow.session_id,
                turnNumber: turnRow.turn_number,
                toolSetId: turnRow.tool_set_id,
                toolChangeReason: turnRow.tool_change_reason,
                rawRequest: turnRow.raw_request ? JSON.parse(turnRow.raw_request) : undefined,
                rawResponse: turnRow.raw_response ? JSON.parse(turnRow.raw_response) : undefined,
                isAgentic: turnRow.is_agentic === 1,
                agenticIterations: turnRow.agentic_iterations,
                messages,
                createdAt: turnRow.created_at
            };
        });

        return {
            id: sessionRow.id,
            name: sessionRow.name,
            ide: sessionRow.ide,
            ideMapping: sessionRow.ide_mapping,
            systemPromptId: sessionRow.system_prompt_id,
            systemPrompt: sessionRow.system_prompt_content,
            createdAt: sessionRow.created_at,
            updatedAt: sessionRow.updated_at,
            turns
        };
    }

    // List context sessions (without full turn/message data)
    public listContextSessions(limit: number = 50, offset: number = 0): Array<{
        id: string;
        name: string;
        ide: string;
        turnCount: number;
        createdAt: string;
        updatedAt: string;
    }> {
        const rows = this.query(`
      SELECT cs.*, COUNT(ct.id) as turn_count
      FROM context_sessions cs
      LEFT JOIN context_turns ct ON cs.id = ct.session_id
      GROUP BY cs.id
      ORDER BY cs.updated_at DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);

        return rows.map(row => ({
            id: row.id,
            name: row.name,
            ide: row.ide,
            turnCount: row.turn_count || 0,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        }));
    }

    // Add turn to session
    public addContextTurn(turn: {
        sessionId: string;
        turnNumber: number;
        tools?: any[];
        previousToolSetId?: string;
        rawRequest?: any;
        rawResponse?: any;
        isAgentic?: boolean;
        agenticIterations?: number;
        messages: ContextMessage[];
    }): string {
        const turnId = uuidv4();

        let toolSetId: string | null = null;
        let toolChangeReason: string | null = null;

        if (turn.tools && turn.tools.length > 0) {
            toolSetId = this.getOrCreateToolSet(turn.tools);
            if (turn.previousToolSetId && toolSetId !== turn.previousToolSetId) {
                toolChangeReason = 'Tools changed from previous turn';
            }
        } else if (turn.previousToolSetId) {
            toolSetId = turn.previousToolSetId;
        }

        this.run(`
      INSERT INTO context_turns 
      (id, session_id, turn_number, tool_set_id, tool_change_reason, raw_request, raw_response, is_agentic, agentic_iterations)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
            turnId,
            turn.sessionId,
            turn.turnNumber,
            toolSetId,
            toolChangeReason,
            turn.rawRequest ? JSON.stringify(turn.rawRequest) : null,
            turn.rawResponse ? JSON.stringify(turn.rawResponse) : null,
            turn.isAgentic ? 1 : 0,
            turn.agenticIterations || 0
        ]);

        for (const msg of turn.messages) {
            this.run(`
        INSERT INTO context_messages 
        (turn_id, sequence, role, content, tool_calls, tool_call_id, name, source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
                turnId,
                msg.sequence,
                msg.role,
                msg.content || null,
                msg.toolCalls ? JSON.stringify(msg.toolCalls) : null,
                msg.toolCallId || null,
                msg.name || null,
                msg.source || null
            ]);
        }

        this.run('UPDATE context_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [turn.sessionId]);

        return turnId;
    }

    public getContextTurn(turnId: string): ContextTurn | null {
        const turnRow = this.get('SELECT * FROM context_turns WHERE id = ?', [turnId]);
        if (!turnRow) return null;

        const messageRows = this.query('SELECT * FROM context_messages WHERE turn_id = ? ORDER BY sequence ASC', [turnId]);

        return {
            id: turnRow.id,
            sessionId: turnRow.session_id,
            turnNumber: turnRow.turn_number,
            toolSetId: turnRow.tool_set_id,
            toolChangeReason: turnRow.tool_change_reason,
            rawRequest: turnRow.raw_request ? JSON.parse(turnRow.raw_request) : undefined,
            rawResponse: turnRow.raw_response ? JSON.parse(turnRow.raw_response) : undefined,
            isAgentic: turnRow.is_agentic === 1,
            agenticIterations: turnRow.agentic_iterations,
            messages: messageRows.map(row => ({
                id: row.id,
                turnId: row.turn_id,
                sequence: row.sequence,
                role: row.role,
                content: row.content,
                toolCalls: row.tool_calls ? JSON.parse(row.tool_calls) : undefined,
                toolCallId: row.tool_call_id,
                name: row.name,
                source: row.source
            })),
            createdAt: turnRow.created_at
        };
    }

    public deleteContextSession(id: string): boolean {
        const result = this.run('DELETE FROM context_sessions WHERE id = ?', [id]);
        return result.changes > 0;
    }

    public clearAllContextSessions(): number {
        const result = this.run('DELETE FROM context_sessions', []);
        return result.changes;
    }

    public contextSessionExists(id: string): boolean {
        const row = this.get('SELECT 1 FROM context_sessions WHERE id = ?', [id]);
        return !!row;
    }

    public getLatestTurnNumber(sessionId: string): number {
        const row = this.get('SELECT MAX(turn_number) as max_turn FROM context_turns WHERE session_id = ?', [sessionId]);
        return row?.max_turn || 0;
    }

    public getPreviousToolSetId(sessionId: string): string | null {
        const row = this.get(`
      SELECT tool_set_id FROM context_turns 
      WHERE session_id = ? AND tool_set_id IS NOT NULL
      ORDER BY turn_number DESC LIMIT 1
    `, [sessionId]);
        return row?.tool_set_id || null;
    }

    public updateContextSessionName(sessionId: string, name: string): boolean {
        const result = this.run('UPDATE context_sessions SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [name, sessionId]);
        return result.changes > 0;
    }

    public getMostRecentSession(withinSeconds: number = 30): ContextSessionDB | null {
        const row = this.get(`
      SELECT * FROM context_sessions 
      WHERE datetime(created_at) >= datetime('now', '-' || ? || ' seconds')
      ORDER BY created_at DESC 
      LIMIT 1
    `, [withinSeconds]);

        if (!row) return null;

        return {
            id: row.id,
            name: row.name,
            ide: row.ide,
            ideMapping: row.ide_mapping,
            systemPromptId: row.system_prompt_id,
            systemPrompt: row.system_prompt_id ? this.getSystemPrompt(row.system_prompt_id) || undefined : undefined,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            turns: []
        };
    }
}
