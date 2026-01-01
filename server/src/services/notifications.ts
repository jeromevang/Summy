/**
 * Notification Service
 * Handles WebSocket broadcast of notifications to connected clients.
 */

import { WebSocket, WebSocketServer } from 'ws';
import { db, Notification } from './database.js';

// ============================================================
// TYPES
// ============================================================

/**
 * Represents the payload structure for WebSocket notifications.
 */
export interface NotificationPayload {
  /** The type of WebSocket message, always 'notification' for this service. */
  type: 'notification';
  /** The action being performed on the notification (e.g., 'new', 'read', 'clear'). */
  action: 'new' | 'read' | 'clear';
  /** The notification data, which can be a single notification, an array, or null/ID for actions. */
  data: Notification | Notification[] | { id: string } | null;
  /** The current count of unread notifications. */
  unreadCount: number;
  /** The ISO timestamp of when the payload was generated. */
  timestamp: string;
}

/**
 * Defines the possible types for a notification, influencing its appearance and urgency.
 */
export type NotificationType = 'success' | 'warning' | 'error' | 'info';

// ============================================================
// NOTIFICATION SERVICE
// ============================================================

/**
 * Manages the creation, storage, and broadcasting of notifications to connected WebSocket clients.
 */
class NotificationService {
  /** The WebSocket server instance. */
  private _wss: WebSocketServer | null = null;
  /** A set of currently connected WebSocket clients. */
  private clients: Set<WebSocket> = new Set();

  /**
   * Sets the WebSocket server instance for the notification service.
   * This method should be called once during server initialization.
   * @param wss - The WebSocketServer instance to use for broadcasting.
   */
  public set wss(wss: WebSocketServer) {
    this._wss = wss;
  }

  /**
   * Retrieves the WebSocket server instance.
   * @returns The WebSocketServer instance.
   */
  public get wss(): WebSocketServer {
    if (!this._wss) {
      throw new Error("NotificationService not initialized. Call initialize() first.");
    }
    return this._wss;
  }

  /**
   * Initializes the notification service with a WebSocket server.
   * @param wss - The WebSocketServer instance to associate with this service.
   */
  initialize(wss: WebSocketServer): void {
    this.wss = wss;
    console.log('[Notifications] Service initialized');
  }

  /**
   * Registers a new WebSocket client to receive notifications.
   * Sends the initial unread count to the newly connected client.
   * @param ws - The WebSocket instance representing the connected client.
   */
  registerClient(ws: WebSocket): void {
    this.clients.add(ws);

    // Send initial unread count
    this.sendToClient(ws, {
      type: 'notification',
      action: 'new',
      data: null, // No specific data for initial count
      unreadCount: db.getUnreadCount(),
      timestamp: new Date().toISOString()
    });

    ws.on('close', () => {
      this.clients.delete(ws);
    });
  }

  /**
   * Creates a new notification, saves it to the database, and broadcasts it to all clients.
   * @param type - The type of the notification ('success', 'warning', 'error', 'info').
   * @param title - The main title of the notification.
   * @param message - An optional detailed message for the notification.
   * @param actionLabel - An optional label for an action button within the notification.
   * @param actionHref - An optional URL for the action button.
   * @returns The ID of the newly created notification.
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
    notification.id = id; // Assign the generated ID

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
   * Sends a success notification.
   * @param title - The title of the success notification.
   * @param message - An optional detailed message.
   * @returns The ID of the created notification.
   */
  success(title: string, message?: string): string {
    return this.notify('success', title, message);
  }

  /**
   * Sends a warning notification.
   * @param title - The title of the warning notification.
   * @param message - An optional detailed message.
   * @returns The ID of the created notification.
   */
  warning(title: string, message?: string): string {
    return this.notify('warning', title, message);
  }

  /**
   * Sends an error notification.
   * @param title - The title of the error notification.
   * @param message - An optional detailed message.
   * @returns The ID of the created notification.
   */
  error(title: string, message?: string): string {
    return this.notify('error', title, message);
  }

  /**
   * Sends an informational notification.
   * @param title - The title of the info notification.
   * @param message - An optional detailed message.
   * @returns The ID of the created notification.
   */
  info(title: string, message?: string): string {
    return this.notify('info', title, message);
  }

  /**
   * Sends an informational notification indicating a tool has started execution.
   * @param toolName - The name of the tool that started.
   * @param args - Optional arguments passed to the tool, which will be stringified and truncated.
   */
  toolStarted(toolName: string, args?: any): void {
    this.info(`🔧 Executing: ${toolName}`, args ? JSON.stringify(args).slice(0, 100) : undefined);
  }

  /**
   * Sends a success notification indicating a tool has completed execution.
   * @param toolName - The name of the tool that completed.
   * @param durationMs - Optional duration in milliseconds the tool took to execute.
   * @returns The ID of the created notification.
   */
  toolCompleted(toolName: string, durationMs?: number): string {
    const duration = durationMs ? ` (${durationMs}ms)` : '';
    return this.success(`✅ ${toolName} completed${duration}`);
  }

  /**
   * Sends an error notification indicating a tool has failed.
   * @param toolName - The name of the tool that failed.
   * @param error - Optional error message or details about the failure.
   * @returns The ID of the created notification.
   */
  toolFailed(toolName: string, error?: string): string {
    return this.error(`❌ ${toolName} failed`, error);
  }

  /**
   * Sends an informational notification that a model test has started.
   * @param modelId - The ID of the model being tested.
   */
  modelTestStarted(modelId: string): void {
    this.info(`🧪 Testing model: ${modelId}`);
  }

  /**
   * Sends a success notification that a model test has completed.
   * @param modelId - The ID of the model that was tested.
   * @param score - The score achieved by the model in the test.
   * @returns The ID of the created notification.
   */
  modelTestCompleted(modelId: string, score: number): string {
    return this.notify(
      'success',
      `🎯 Model test complete: ${modelId}`,
      `Score: ${score}/100`,
      'View Results',
      `/tooly?model=${encodeURIComponent(modelId)}`
    );
  }

  /**
   * Sends an error notification that a model test has failed.
   * @param modelId - The ID of the model whose test failed.
   * @param error - Optional error message or details about the failure.
   * @returns The ID of the created notification.
   */
  modelTestFailed(modelId: string, error?: string): string {
    return this.error(`❌ Model test failed: ${modelId}`, error);
  }

  /**
   * Sends a success notification indicating the MCP server is connected.
   * @returns The ID of the created notification.
   */
  mcpConnected(): string {
    return this.success('🔌 MCP server connected');
  }

  /**
   * Sends a warning notification indicating the MCP server is disconnected.
   * @returns The ID of the created notification.
   */
  mcpDisconnected(): string {
    return this.warning('⚠️ MCP server disconnected', 'Attempting to reconnect...');
  }

  /**
   * Sends a success notification indicating the MCP server has reconnected.
   * @returns The ID of the created notification.
   */
  mcpReconnected(): string {
    return this.success('🔌 MCP server reconnected');
  }

  /**
   * Sends a success notification about context compression completion.
   * @param tokensSaved - The number of tokens saved due to compression.
   * @param percentage - The percentage of tokens saved.
   * @returns The ID of the created notification.
   */
  compressionComplete(tokensSaved: number, percentage: number): string {
    return this.success(
      `📦 Context compressed`,
      `Saved ${tokensSaved.toLocaleString()} tokens (${percentage}%)`
    );
  }

  /**
   * Marks a specific notification as read and broadcasts the update.
   * @param id - The ID of the notification to mark as read.
   */
  markAsRead(id: string): void {
    db.markNotificationRead(id); // Assuming this exists in database.js
    this.broadcast({
      type: 'notification',
      action: 'read',
      data: { id },
      unreadCount: db.getUnreadCount(),
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Marks all notifications as read and broadcasts the update.
   */
  markAllAsRead(): void {
    db.markAllNotificationsRead();

    this.broadcast({
      type: 'notification',
      action: 'read',
      data: null, // No specific notification data, action applies to all
      unreadCount: 0,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Retrieves notifications from the database.
   * @param unreadOnly - If true, only returns unread notifications.
   * @param limit - The maximum number of notifications to return.
   * @returns An array of Notification objects.
   */
  getAll(unreadOnly: boolean = false, limit: number = 20): Notification[] {
    return db.getNotifications(unreadOnly, limit);
  }

  /**
   * Retrieves the current count of unread notifications.
   * @returns The number of unread notifications.
   */
  getUnreadCount(): number {
    return db.getUnreadCount();
  }

  /**
   * Clears all notifications from the database and broadcasts the update.
   */
  clearAll(): void {
    db.clearAllNotifications();

    this.broadcast({
      type: 'notification',
      action: 'clear',
      data: null, // No specific notification data, action applies to all
      unreadCount: 0,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Deletes a specific notification from the database and broadcasts the update.
   * @param id - The ID of the notification to delete.
   */
  delete(id: string): void {
    db.deleteNotification(id);

    this.broadcast({
      type: 'notification',
      action: 'clear', // 'clear' action used for single deletion for now
      data: { id },
      unreadCount: db.getUnreadCount(),
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Broadcasts a payload to all connected WebSocket clients.
   * @param payload - The `NotificationPayload` to send.
   */
  private broadcast(payload: NotificationPayload): void {
    const message = JSON.stringify(payload);

    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(message);
        } catch (e) {
          console.error('[Notifications] Failed to send to client:', e);
          this.clients.delete(client); // Remove client if sending fails
        }
      }
    });
  }

  /**
   * Sends a specific payload to a single WebSocket client.
   * @param ws - The WebSocket client to send the payload to.
   * @param payload - The `NotificationPayload` to send.
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
   * Gets the number of currently connected WebSocket clients.
   * @returns The count of connected clients.
   */
  getClientCount(): number {
    return this.clients.size;
  }
}

// Export singleton instance
/**
 * The singleton instance of the NotificationService.
 */
export const notifications = new NotificationService();


