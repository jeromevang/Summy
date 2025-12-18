/**
 * Notification Service
 * Handles WebSocket broadcast of notifications to connected clients
 */

import { WebSocket, WebSocketServer } from 'ws';
import { db, Notification } from './database.js';

// ============================================================
// TYPES
// ============================================================

export interface NotificationPayload {
  type: 'notification';
  action: 'new' | 'read' | 'clear';
  data: Notification | Notification[] | { id: string } | null;
  unreadCount: number;
  timestamp: string;
}

export type NotificationType = 'success' | 'warning' | 'error' | 'info';

// ============================================================
// NOTIFICATION SERVICE
// ============================================================

class NotificationService {
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();

  /**
   * Initialize the notification service with a WebSocket server
   */
  initialize(wss: WebSocketServer): void {
    this.wss = wss;
    console.log('[Notifications] Service initialized');
  }

  /**
   * Register a WebSocket client for notifications
   */
  registerClient(ws: WebSocket): void {
    this.clients.add(ws);
    
    // Send initial unread count
    this.sendToClient(ws, {
      type: 'notification',
      action: 'new',
      data: null,
      unreadCount: db.getUnreadCount(),
      timestamp: new Date().toISOString()
    });

    ws.on('close', () => {
      this.clients.delete(ws);
    });
  }

  /**
   * Create and broadcast a new notification
   */
  notify(
    type: NotificationType,
    title: string,
    message?: string,
    actionLabel?: string,
    actionHref?: string
  ): string {
    // Create notification in database
    const notification: Notification = {
      type,
      title,
      message,
      actionLabel,
      actionHref,
      read: false
    };

    const id = db.addNotification(notification);
    notification.id = id;

    // Broadcast to all connected clients
    this.broadcast({
      type: 'notification',
      action: 'new',
      data: notification,
      unreadCount: db.getUnreadCount(),
      timestamp: new Date().toISOString()
    });

    console.log(`[Notifications] ${type.toUpperCase()}: ${title}`);
    return id;
  }

  /**
   * Shorthand methods for different notification types
   */
  success(title: string, message?: string): string {
    return this.notify('success', title, message);
  }

  warning(title: string, message?: string): string {
    return this.notify('warning', title, message);
  }

  error(title: string, message?: string): string {
    return this.notify('error', title, message);
  }

  info(title: string, message?: string): string {
    return this.notify('info', title, message);
  }

  /**
   * Tool-related notifications
   */
  toolStarted(toolName: string, args?: any): void {
    this.info(`🔧 Executing: ${toolName}`, args ? JSON.stringify(args).slice(0, 100) : undefined);
  }

  toolCompleted(toolName: string, durationMs?: number): string {
    const duration = durationMs ? ` (${durationMs}ms)` : '';
    return this.success(`✅ ${toolName} completed${duration}`);
  }

  toolFailed(toolName: string, error?: string): string {
    return this.error(`❌ ${toolName} failed`, error);
  }

  /**
   * Model-related notifications
   */
  modelTestStarted(modelId: string): void {
    this.info(`🧪 Testing model: ${modelId}`);
  }

  modelTestCompleted(modelId: string, score: number): string {
    return this.success(
      `🎯 Model test complete: ${modelId}`,
      `Score: ${score}/100`,
      'View Results',
      `/tools/${encodeURIComponent(modelId)}`
    );
  }

  modelTestFailed(modelId: string, error?: string): string {
    return this.error(`❌ Model test failed: ${modelId}`, error);
  }

  /**
   * Connection-related notifications
   */
  mcpConnected(): string {
    return this.success('🔌 MCP server connected');
  }

  mcpDisconnected(): string {
    return this.warning('⚠️ MCP server disconnected', 'Attempting to reconnect...');
  }

  mcpReconnected(): string {
    return this.success('🔌 MCP server reconnected');
  }

  /**
   * Compression notifications
   */
  compressionComplete(tokensSaved: number, percentage: number): string {
    return this.success(
      `📦 Context compressed`,
      `Saved ${tokensSaved.toLocaleString()} tokens (${percentage}%)`
    );
  }

  /**
   * Mark notification as read
   */
  markAsRead(id: string): void {
    db.markNotificationAsRead(id);
    
    this.broadcast({
      type: 'notification',
      action: 'read',
      data: { id },
      unreadCount: db.getUnreadCount(),
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Mark all notifications as read
   */
  markAllAsRead(): void {
    db.markAllNotificationsAsRead();
    
    this.broadcast({
      type: 'notification',
      action: 'read',
      data: null,
      unreadCount: 0,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Get all notifications
   */
  getAll(unreadOnly: boolean = false, limit: number = 20): Notification[] {
    return db.getNotifications(unreadOnly, limit);
  }

  /**
   * Get unread count
   */
  getUnreadCount(): number {
    return db.getUnreadCount();
  }

  /**
   * Clear all notifications
   */
  clearAll(): void {
    db.clearAllNotifications();
    
    this.broadcast({
      type: 'notification',
      action: 'clear',
      data: null,
      unreadCount: 0,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Delete a specific notification
   */
  delete(id: string): void {
    db.deleteNotification(id);
    
    this.broadcast({
      type: 'notification',
      action: 'clear',
      data: { id },
      unreadCount: db.getUnreadCount(),
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Broadcast to all connected clients
   */
  private broadcast(payload: NotificationPayload): void {
    const message = JSON.stringify(payload);
    
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(message);
        } catch (e) {
          console.error('[Notifications] Failed to send to client:', e);
          this.clients.delete(client);
        }
      }
    });
  }

  /**
   * Send to a specific client
   */
  private sendToClient(ws: WebSocket, payload: NotificationPayload): void {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(payload));
      } catch (e) {
        console.error('[Notifications] Failed to send to client:', e);
      }
    }
  }

  /**
   * Get connected client count
   */
  getClientCount(): number {
    return this.clients.size;
  }
}

// Export singleton instance
export const notifications = new NotificationService();

