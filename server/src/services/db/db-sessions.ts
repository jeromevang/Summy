import { DBBase } from './db-base.js';

export interface Session {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
    model: string;
    provider: string;
    messages: any[];
    compression?: any;
}

export class DBSessions extends DBBase {
    public getSessions(limit: number = 50, offset: number = 0): Session[] {
        const rows = this.query(
            'SELECT * FROM sessions ORDER BY created_at DESC LIMIT ? OFFSET ?',
            [limit, offset]
        );
        return rows.map(row => this.rowToSession(row));
    }

    public getSession(id: string): Session | null {
        const row = this.get('SELECT * FROM sessions WHERE id = ?', [id]);
        return row ? this.rowToSession(row) : null;
    }

    public saveSession(session: Session): void {
        const messagesJson = JSON.stringify(session.messages);
        const compressionJson = session.compression ? JSON.stringify(session.compression) : null;

        this.run(
            `INSERT OR REPLACE INTO sessions 
       (id, name, model, provider, messages, compression, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [session.id, session.name, session.model, session.provider, messagesJson, compressionJson]
        );
    }

    public deleteSession(id: string): boolean {
        const result = this.run('DELETE FROM sessions WHERE id = ?', [id]);
        return result.changes > 0;
    }

    public getSessionCount(): number {
        const row = this.get('SELECT COUNT(*) as count FROM sessions');
        return row ? row.count : 0;
    }

    private rowToSession(row: any): Session {
        return {
            id: row.id,
            name: row.name,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            model: row.model,
            provider: row.provider,
            messages: row.messages ? JSON.parse(row.messages) : [],
            compression: row.compression ? JSON.parse(row.compression) : undefined
        };
    }
}
