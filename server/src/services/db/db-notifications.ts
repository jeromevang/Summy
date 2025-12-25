import { v4 as uuidv4 } from 'uuid';
import { DBBase } from './db-base.js';

export interface Notification {
    id?: string;
    type: 'success' | 'warning' | 'error' | 'info';
    title: string;
    message?: string;
    read?: boolean;
    actionLabel?: string;
    actionHref?: string;
}

export class DBNotifications extends DBBase {
    public addNotification(notification: Notification): string {
        const id = notification.id || uuidv4();
        this.run(`
      INSERT INTO notifications 
      (id, type, title, message, action_label, action_href)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
            id,
            notification.type,
            notification.title,
            notification.message || null,
            notification.actionLabel || null,
            notification.actionHref || null
        ]);
        return id;
    }

    public getNotifications(unreadOnly: boolean = false, limit: number = 20): Notification[] {
        let sql = 'SELECT * FROM notifications';
        if (unreadOnly) {
            sql += ' WHERE read = 0';
        }
        sql += ' ORDER BY timestamp DESC LIMIT ?';

        const rows = this.query(sql, [limit]);

        return rows.map(row => ({
            id: row.id,
            type: row.type,
            title: row.title,
            message: row.message,
            read: row.read === 1,
            actionLabel: row.action_label,
            actionHref: row.action_href
        }));
    }

    public getUnreadCount(): number {
        const row = this.get('SELECT COUNT(*) as count FROM notifications WHERE read = 0');
        return row?.count || 0;
    }

    public markNotificationRead(id: string): void {
        this.run('UPDATE notifications SET read = 1 WHERE id = ?', [id]);
    }

    public markAllNotificationsRead(): void {
        this.run('UPDATE notifications SET read = 1 WHERE read = 0');
    }

    public deleteNotification(id: string): void {
        this.run('DELETE FROM notifications WHERE id = ?', [id]);
    }

    public clearAllNotifications(): void {
        this.run('DELETE FROM notifications');
    }
}
