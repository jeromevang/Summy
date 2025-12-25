import { DBBase } from './db/db-base.js';
import { DBSessions, type Session } from './db/db-sessions.js';
import { DBContext, type ContextSessionDB, type ContextMessage, type ContextTurn, type SystemPrompt, type ToolSet } from './db/db-context.js';
import { DBAnalytics, type AnalyticsEntry, type AnalyticsSummary, type ExecutionLog, type FileBackup, type LogFilters } from './db/db-analytics.js';
import { DBNotifications, type Notification } from './db/db-notifications.js';
import { DBConfig } from './db/db-config.js';

/**
 * Unified Database Service
 * Acts as a facade for modular database services to maintain backward compatibility.
 */
class DatabaseService extends DBBase {
  private sessions = new DBSessions();
  private context = new DBContext();
  private analytics = new DBAnalytics();
  private notifications = new DBNotifications();
  private config = new DBConfig();

  // Legacy Sessions
  getSessions = this.sessions.getSessions.bind(this.sessions);
  getSession = this.sessions.getSession.bind(this.sessions);
  saveSession = this.sessions.saveSession.bind(this.sessions);
  deleteSession = this.sessions.deleteSession.bind(this.sessions);
  getSessionCount = this.sessions.getSessionCount.bind(this.sessions);

  // Analytics & Logging
  recordAnalytics = this.analytics.recordAnalytics.bind(this.analytics);
  getAnalyticsSummary = this.analytics.getAnalyticsSummary.bind(this.analytics);
  logExecution = this.analytics.logExecution.bind(this.analytics);
  getExecutionLogs = this.analytics.getExecutionLogs.bind(this.analytics);
  getExecutionLog = this.analytics.getExecutionLog.bind(this.analytics);
  createBackup = this.analytics.createBackup.bind(this.analytics);
  getBackup = this.analytics.getBackup.bind(this.analytics);
  markBackupRestored = this.analytics.markBackupRestored.bind(this.analytics);
  cleanupExpiredBackups = this.analytics.cleanupExpiredBackups.bind(this.analytics);
  getBackupsForLog = this.analytics.getBackupsForLog.bind(this.analytics);

  // Notifications
  addNotification = this.notifications.addNotification.bind(this.notifications);
  getNotifications = this.notifications.getNotifications.bind(this.notifications);
  getUnreadCount = this.notifications.getUnreadCount.bind(this.notifications);
  markNotificationRead = this.notifications.markNotificationRead.bind(this.notifications);
  markAllNotificationsRead = this.notifications.markAllNotificationsRead.bind(this.notifications);
  deleteNotification = this.notifications.deleteNotification.bind(this.notifications);
  clearAllNotifications = this.notifications.clearAllNotifications.bind(this.notifications);

  // Context Sessions (New)
  createContextSession = this.context.createContextSession.bind(this.context);
  getContextSession = this.context.getContextSession.bind(this.context);
  listContextSessions = this.context.listContextSessions.bind(this.context);
  addContextTurn = this.context.addContextTurn.bind(this.context);
  getContextTurn = this.context.getContextTurn.bind(this.context);
  deleteContextSession = this.context.deleteContextSession.bind(this.context);
  clearAllContextSessions = this.context.clearAllContextSessions.bind(this.context);
  contextSessionExists = this.context.contextSessionExists.bind(this.context);
  getLatestTurnNumber = this.context.getLatestTurnNumber.bind(this.context);
  getPreviousToolSetId = this.context.getPreviousToolSetId.bind(this.context);
  updateContextSessionName = this.context.updateContextSessionName.bind(this.context);
  getMostRecentSession = this.context.getMostRecentSession.bind(this.context);

  // RAG & Tests Configuration
  getRAGConfig = this.config.getRAGConfig.bind(this.config);
  saveRAGConfig = this.config.saveRAGConfig.bind(this.config);
  createCustomTest = this.config.createCustomTest.bind(this.config);
  getCustomTests = this.config.getCustomTests.bind(this.config);
  getCustomTest = this.config.getCustomTest.bind(this.config);
  updateCustomTest = this.config.updateCustomTest.bind(this.config);
  deleteCustomTest = this.config.deleteCustomTest.bind(this.config);
  cacheModelInfo = this.config.cacheModelInfo.bind(this.config);
  getCachedModelInfo = this.config.getCachedModelInfo.bind(this.config);
  saveGroundTruth = this.config.saveGroundTruth.bind(this.config);
  getGroundTruth = this.config.getGroundTruth.bind(this.config);
  clearAllRAGData = this.config.clearAllRAGData.bind(this.config);

  // Context Helpers
  getSystemPrompt = this.context.getSystemPrompt.bind(this.context);
  getToolSet = this.context.getToolSet.bind(this.context);
  getOrCreateSystemPrompt = this.context.getOrCreateSystemPrompt.bind(this.context);
  getOrCreateToolSet = this.context.getOrCreateToolSet.bind(this.context);

  // Utilities
  runCleanup(): { backupsDeleted: number } {
    const backupsDeleted = this.analytics.cleanupExpiredBackups();
    return { backupsDeleted };
  }

  // Common Methods (inherited from DBBase)
  // query, run, exec, get, close
}

// Export singleton instance
export const db = new DatabaseService();

// Export types
export type {
  DatabaseService,
  Session,
  AnalyticsEntry,
  AnalyticsSummary,
  ExecutionLog,
  FileBackup,
  LogFilters,
  Notification,
  ContextMessage,
  ContextTurn,
  ContextSessionDB,
  SystemPrompt,
  ToolSet
};
