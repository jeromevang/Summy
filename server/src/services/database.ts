import { DBSessions, type Session } from './db/db-sessions.js';
import { DBAnalytics, type AnalyticsEntry, type AnalyticsSummary, type ExecutionLog, type FileBackup, type LogFilters } from './db/db-analytics.js';
import { DBNotifications, type Notification } from './db/db-notifications.js';
import { DBContext, type SystemPrompt, type ToolSet, type ContextMessage, type ContextTurn, type ContextSessionDB } from './db/db-context.js';
import { DBConfig } from './db/db-config.js';
import { DBComboTests, type ComboTestRecord } from './db/db-combo-tests.js';

/**
 * Main Database Service
 * Combines all database functionality into a single service
 */
export class DatabaseService {
  private sessions: DBSessions;
  private analytics: DBAnalytics;
  private notifications: DBNotifications;
  private context: DBContext;
  private config: DBConfig;
  private comboTests: DBComboTests;

  // Method properties
  getSessions: any;
  getSession: any;
  saveSession: any;
  deleteSession: any;
  getSessionCount: any;
  recordAnalytics: any;
  getAnalyticsSummary: any;
  logExecution: any;
  getExecutionLogs: any;
  getExecutionLog: any;
  createBackup: any;
  getBackup: any;
  markBackupRestored: any;
  cleanupExpiredBackups: any;
  getBackupsForLog: any;
  addNotification: any;
  getNotifications: any;
  getUnreadCount: any;
  markNotificationRead: any;
  markAllNotificationsRead: any;
  deleteNotification: any;
  clearAllNotifications: any;
  createContextSession: any;
  getContextSession: any;
  listContextSessions: any;
  addContextTurn: any;
  getContextTurn: any;
  deleteContextSession: any;
  clearAllContextSessions: any;
  contextSessionExists: any;
  getLatestTurnNumber: any;
  getPreviousToolSetId: any;
  updateContextSessionName: any;
  getMostRecentSession: any;
  getRAGConfig: any;
  saveRAGConfig: any;
  createCustomTest: any;
  getCustomTests: any;
  getCustomTest: any;
  updateCustomTest: any;
  deleteCustomTest: any;
  cacheModelInfo: any;
  getCachedModelInfo: any;
  saveGroundTruth: any;
  getGroundTruth: any;
  clearAllRAGData: any;
  getSystemPrompt: any;
  getToolSet: any;
  getOrCreateSystemPrompt: any;
  getOrCreateToolSet: any;
  saveComboResult: any;
  getAllComboResults: any;
  getComboResult: any;
  getResultsForMainModel: any;
  getResultsForExecutorModel: any;
  getTopCombos: any;
  deleteComboResult: any;
  clearAllComboResults: any;

  constructor() {
    this.sessions = new DBSessions();
    this.analytics = new DBAnalytics();
    this.notifications = new DBNotifications();
    this.context = new DBContext();
    this.config = new DBConfig();
    this.comboTests = new DBComboTests();

    // Legacy Sessions
    this.getSessions = this.sessions.getSessions.bind(this.sessions);
    this.getSession = this.sessions.getSession.bind(this.sessions);
    this.saveSession = this.sessions.saveSession.bind(this.sessions);
    this.deleteSession = this.sessions.deleteSession.bind(this.sessions);
    this.getSessionCount = this.sessions.getSessionCount.bind(this.sessions);

    // Analytics & Logging
    this.recordAnalytics = this.analytics.recordAnalytics.bind(this.analytics);
    this.getAnalyticsSummary = this.analytics.getAnalyticsSummary.bind(this.analytics);
    this.logExecution = this.analytics.logExecution.bind(this.analytics);
    this.getExecutionLogs = this.analytics.getExecutionLogs.bind(this.analytics);
    this.getExecutionLog = this.analytics.getExecutionLog.bind(this.analytics);
    this.createBackup = this.analytics.createBackup.bind(this.analytics);
    this.getBackup = this.analytics.getBackup.bind(this.analytics);
    this.markBackupRestored = this.analytics.markBackupRestored.bind(this.analytics);
    this.cleanupExpiredBackups = this.analytics.cleanupExpiredBackups.bind(this.analytics);
    this.getBackupsForLog = this.analytics.getBackupsForLog.bind(this.analytics);

    // Notifications
    this.addNotification = this.notifications.addNotification.bind(this.notifications);
    this.getNotifications = this.notifications.getNotifications.bind(this.notifications);
    this.getUnreadCount = this.notifications.getUnreadCount.bind(this.notifications);
    this.markNotificationRead = this.notifications.markNotificationRead.bind(this.notifications);
    this.markAllNotificationsRead = this.notifications.markAllNotificationsRead.bind(this.notifications);
    this.deleteNotification = this.notifications.deleteNotification.bind(this.notifications);
    this.clearAllNotifications = this.notifications.clearAllNotifications.bind(this.notifications);

    // Context Sessions (New)
    this.createContextSession = this.context.createContextSession.bind(this.context);
    this.getContextSession = this.context.getContextSession.bind(this.context);
    this.listContextSessions = this.context.listContextSessions.bind(this.context);
    this.addContextTurn = this.context.addContextTurn.bind(this.context);
    this.getContextTurn = this.context.getContextTurn.bind(this.context);
    this.deleteContextSession = this.context.deleteContextSession.bind(this.context);
    this.clearAllContextSessions = this.context.clearAllContextSessions.bind(this.context);
    this.contextSessionExists = this.context.contextSessionExists.bind(this.context);
    this.getLatestTurnNumber = this.context.getLatestTurnNumber.bind(this.context);
    this.getPreviousToolSetId = this.context.getPreviousToolSetId.bind(this.context);
    this.updateContextSessionName = this.context.updateContextSessionName.bind(this.context);
    this.getMostRecentSession = this.context.getMostRecentSession.bind(this.context);

    // RAG & Tests Configuration
    this.getRAGConfig = this.config.getRAGConfig.bind(this.config);
    this.saveRAGConfig = this.config.saveRAGConfig.bind(this.config);
    this.createCustomTest = this.config.createCustomTest.bind(this.config);
    this.getCustomTests = this.config.getCustomTests.bind(this.config);
    this.getCustomTest = this.config.getCustomTest.bind(this.config);
    this.updateCustomTest = this.config.updateCustomTest.bind(this.config);
    this.deleteCustomTest = this.config.deleteCustomTest.bind(this.config);
    this.cacheModelInfo = this.config.cacheModelInfo.bind(this.config);
    this.getCachedModelInfo = this.config.getCachedModelInfo.bind(this.config);
    this.saveGroundTruth = this.config.saveGroundTruth.bind(this.config);
    this.getGroundTruth = this.config.getGroundTruth.bind(this.config);
    this.clearAllRAGData = this.config.clearAllRAGData.bind(this.config);

    // Context Helpers
    this.getSystemPrompt = this.context.getSystemPrompt.bind(this.context);
    this.getToolSet = this.context.getToolSet.bind(this.context);
    this.getOrCreateSystemPrompt = this.context.getOrCreateSystemPrompt.bind(this.context);
    this.getOrCreateToolSet = this.context.getOrCreateToolSet.bind(this.context);

    // Combo Tests
    this.saveComboResult = this.comboTests.saveComboResult.bind(this.comboTests);
    this.getAllComboResults = this.comboTests.getAllComboResults.bind(this.comboTests);
    this.getComboResult = this.comboTests.getComboResult.bind(this.comboTests);
    this.getResultsForMainModel = this.comboTests.getResultsForMainModel.bind(this.comboTests);
    this.getResultsForExecutorModel = this.comboTests.getResultsForExecutorModel.bind(this.comboTests);
    this.getTopCombos = this.comboTests.getTopCombos.bind(this.comboTests);
    this.deleteComboResult = this.comboTests.deleteComboResult.bind(this.comboTests);
    this.clearAllComboResults = this.comboTests.clearAllComboResults.bind(this.comboTests);
  }

  // Utilities
  runCleanup(): { backupsDeleted: number } {
    const backupsDeleted = this.analytics.cleanupExpiredBackups();
    return { backupsDeleted };
  }
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
  ToolSet,
  ComboTestRecord,
};