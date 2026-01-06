import { DBSessions, type Session } from './db/db-sessions.js';
import { DBAnalytics, type AnalyticsEntry, type AnalyticsSummary, type ExecutionLog, type FileBackup, type LogFilters } from './db/db-analytics.js';
import { DBNotifications, type Notification } from './db/db-notifications.js';
import { DBContext, type SystemPrompt, type ToolSet, type ContextMessage, type ContextTurn, type ContextSessionDB } from './db/db-context.js';
import { DBConfig } from './db/db-config.js';
import { DBComboTests, type ComboTestRecord } from './db/db-combo-tests.js';

/**
 * Main Database Service
 * This class acts as a facade, aggregating all database functionality from various
 * sub-services (sessions, analytics, notifications, context, config, combo tests)
 * into a single, convenient access point.
 */
export class DatabaseService {
  private sessions: DBSessions;
  private analytics: DBAnalytics;
  private notifications: DBNotifications;
  private context: DBContext;
  private config: DBConfig;
  private comboTests: DBComboTests;

  // Method properties (bound from sub-services)

  /** @see DBSessions.getSessions */
  getSessions: (query?: any) => Session[];
  /** @see DBSessions.getSession */
  getSession: (id: string) => Session | null;
  /** @see DBSessions.saveSession */
  saveSession: (session: Session) => void;
  /** @see DBSessions.deleteSession */
  deleteSession: (id: string) => void;
  /** @see DBSessions.getSessionCount */
  getSessionCount: () => number;

  /** @see DBAnalytics.recordAnalytics */
  recordAnalytics: (entry: AnalyticsEntry) => void;
  /** @see DBAnalytics.getAnalyticsSummary */
  getAnalyticsSummary: (period: 'day' | 'week' | 'month') => AnalyticsSummary;
  /** @see DBAnalytics.logExecution */
  logExecution: (log: ExecutionLog) => string;
  /** @see DBAnalytics.getExecutionLogs */
  getExecutionLogs: (filters?: LogFilters) => ExecutionLog[];
  /** @see DBAnalytics.getExecutionLog */
  getExecutionLog: (id: string) => ExecutionLog | null;
  /** @see DBAnalytics.createBackup */
  // Changed return type from void to string to satisfy rollback.ts
  createBackup: (logId: string, filePath: string, content: string) => string;
  /** @see DBAnalytics.getBackup */
  getBackup!: (backupId: string) => FileBackup | null;
  /** @see DBAnalytics.markBackupRestored */
  markBackupRestored!: (backupId: string) => void;
  /** @see DBAnalytics.cleanupExpiredBackups */
  cleanupExpiredBackups!: () => number;
  /** @see DBAnalytics.getBackupsForLog */
  getBackupsForLog!: (logId: string) => FileBackup[];

  /** @see DBNotifications.addNotification */
  addNotification!: (notification: Omit<Notification, 'id' | 'timestamp'>) => string;
  /** @see DBNotifications.getNotifications */
  getNotifications!: (unreadOnly?: boolean, limit?: number) => Notification[];
  /** @see DBNotifications.getUnreadCount */
  getUnreadCount!: () => number;
  /** @see DBNotifications.markNotificationRead */
  markNotificationRead!: (id: string) => void;
  /** @see DBNotifications.markAllNotificationsRead */
  markAllNotificationsRead!: () => void;
  /** @see DBNotifications.deleteNotification */
  deleteNotification!: (id: string) => void;
  /** @see DBNotifications.clearAllNotifications */
  clearAllNotifications!: () => void;

  /** @see DBContext.createContextSession */
  createContextSession!: (session: Omit<ContextSessionDB, "createdAt" | "updatedAt" | "turns" | "summary" | "compression">) => ContextSessionDB;
  /** @see DBContext.getContextSession */
  getContextSession!: (id: string) => ContextSessionDB | null;
  /** @see DBContext.listContextSessions */
  listContextSessions!: (limit?: number, offset?: number) => Array<{
    id: string;
    name: string;
    ide: string;
    turnCount: number;
    createdAt: string;
    updatedAt: string;
  }>;
  /** @see DBContext.addContextTurn */
  addContextTurn!: (turn: Omit<ContextTurn, 'id' | 'createdAt'>) => string;
  /** @see DBContext.getContextTurn */
  getContextTurn!: (sessionId: string, turnNumber: number) => ContextTurn | null;
  /** @see DBContext.deleteContextSession */
  deleteContextSession!: (id: string) => void;
  /** @see DBContext.clearAllContextSessions */
  clearAllContextSessions!: () => number;
  /** @see DBContext.contextSessionExists */
  contextSessionExists!: (id: string) => boolean;
  /** @see DBContext.getLatestTurnNumber */
  getLatestTurnNumber!: (sessionId: string) => number;
  /** @see DBContext.getPreviousToolSetId */
  getPreviousToolSetId!: (sessionId: string) => string | null;
  /** @see DBContext.updateContextSessionName */
  updateContextSessionName!: (sessionId: string, newName: string) => void;
  /** @see DBContext.getMostRecentSession */
  getMostRecentSession!: () => ContextSessionDB | null;

  /** @see DBConfig.getRAGConfig */
  getRAGConfig!: () => any; // More specific type if available
  /** @see DBConfig.saveRAGConfig */
  saveRAGConfig!: (config: any) => void; // More specific type if available
  /** @see DBConfig.createCustomTest */
  createCustomTest!: (test: any) => any; // More specific type if available
  /** @see DBConfig.getCustomTests */
  getCustomTests!: () => any[]; // More specific type if available
  /** @see DBConfig.getCustomTest */
  getCustomTest!: (id: string) => any | undefined; // More specific type if available
  /** @see DBConfig.updateCustomTest */
  updateCustomTest!: (id: string, updates: any) => boolean; // More specific type if available
  /** @see DBConfig.deleteCustomTest */
  deleteCustomTest!: (id: string) => boolean;
  /** @see DBConfig.cacheModelInfo */
  cacheModelInfo!: (modelId: string, info: any, source: string) => void; // More specific type if available
  /** @see DBConfig.getCachedModelInfo */
  getCachedModelInfo!: (modelId: string) => any | undefined; // More specific type if available
  /** @see DBConfig.saveGroundTruth */
  saveGroundTruth!: (testId: string, result: any) => void;
  /** @see DBConfig.getGroundTruth */
  getGroundTruth!: (testId: string) => any | null;
  /** @see DBConfig.clearAllRAGData */
  clearAllRAGData!: () => void;

  /** @see DBContext.getSystemPrompt */
  getSystemPrompt!: (hash: string) => SystemPrompt | null;
  /** @see DBContext.getToolSet */
  getToolSet!: (hash: string) => ToolSet | null;
  getOrCreateSystemPrompt!: (content: string) => SystemPrompt;
  /** @see DBContext.getOrCreateToolSet */
  getOrCreateToolSet!: (tools: any[]) => ToolSet;

  /** @see DBComboTests.saveComboResult */
  saveComboResult!: (result: ComboTestRecord) => void;
  /** @see DBComboTests.getAllComboResults */
  getAllComboResults!: () => ComboTestRecord[];
  /** @see DBComboTests.getComboResult */
  getComboResult!: (mainModelId: string, executorModelId: string) => ComboTestRecord | null;
  /** @see DBComboTests.getResultsForMainModel */
  getResultsForMainModel!: (mainModelId: string) => ComboTestRecord[];
  /** @see DBComboTests.getResultsForExecutorModel */
  getResultsForExecutorModel!: (executorModelId: string) => ComboTestRecord[];
  /** @see DBComboTests.getTopCombos */
  getTopCombos!: (limit?: number) => ComboTestRecord[];
  /** @see DBComboTests.deleteComboResult */
  deleteComboResult!: (mainModelId: string, executorModelId: string) => void;
  /** @see DBComboTests.clearAllComboResults */
  clearAllComboResults!: () => number;

  /**
   * Initializes the DatabaseService by creating instances of all sub-database services.
   * It also binds all methods from the sub-services to this facade for direct access.
   */
  constructor() {
    try {
      this.sessions = new DBSessions();
      this.analytics = new DBAnalytics();
      this.notifications = new DBNotifications();
      this.context = new DBContext();
      this.config = new DBConfig();
      this.comboTests = new DBComboTests();
      console.log('✅ Database service initialized successfully');
    } catch (error) {
      console.error('❌ Database initialization failed:', error);
      console.log('⚠️ Server will continue without database functionality');
      // Set dummy objects to prevent crashes
      this.sessions = null as any;
      this.analytics = null as any;
      this.notifications = null as any;
      this.context = null as any;
      this.config = null as any;
      this.comboTests = null as any;
    }

    // Legacy Sessions
    if (this.sessions) {
      this.getSessions = this.sessions.getSessions.bind(this.sessions);
      this.getSession = this.sessions.getSession.bind(this.sessions);
      this.saveSession = this.sessions.saveSession.bind(this.sessions);
      this.deleteSession = this.sessions.deleteSession.bind(this.sessions);
      this.getSessionCount = this.sessions.getSessionCount.bind(this.sessions);
    } else {
      // Fallback methods that do nothing
      this.getSessions = () => [];
      this.getSession = () => null;
      this.saveSession = () => {};
      this.deleteSession = () => false;
      this.getSessionCount = () => 0;
    }

    // Analytics & Logging
    if (this.analytics) {
      this.recordAnalytics = this.analytics.recordAnalytics.bind(this.analytics);
      this.getAnalyticsSummary = this.analytics.getAnalyticsSummary.bind(this.analytics);
      this.logExecution = this.analytics.logExecution.bind(this.analytics);
      this.getExecutionLogs = this.analytics.getExecutionLogs.bind(this.analytics);
      this.getExecutionLog = this.analytics.getExecutionLog.bind(this.analytics);
      this.createBackup = this.analytics.createBackup.bind(this.analytics);
    } else {
      // Fallback methods
      this.recordAnalytics = () => {};
      this.getAnalyticsSummary = () => ({
        totalRequests: 0,
        tokensOriginal: 0,
        tokensCompressed: 0,
        tokensSaved: 0,
        toolExecutions: 0,
        toolSuccessRate: 0,
        dailyActivity: [],
        toolUsageStats: [],
        toolUsage: []
      });
      this.logExecution = () => '';
      this.getExecutionLogs = () => [];
      this.getExecutionLog = () => null;
      this.createBackup = () => '';

      // Add fallbacks for all other methods
      this.getNotifications = () => [];
      this.addNotification = () => '';
      this.markNotificationRead = () => {};
      this.deleteNotification = () => {};
      this.deleteComboResult = () => {};
      this.clearAllComboResults = () => 0;
    }
    if (this.analytics) {
      this.getBackup = this.analytics.getBackup.bind(this.analytics);
      this.markBackupRestored = this.analytics.markBackupRestored.bind(this.analytics);
      this.cleanupExpiredBackups = this.analytics.cleanupExpiredBackups.bind(this.analytics);
      this.getBackupsForLog = this.analytics.getBackupsForLog.bind(this.analytics);
    }

    // Notifications
    if (this.notifications) {
      this.addNotification = this.notifications.addNotification.bind(this.notifications);
      this.getNotifications = this.notifications.getNotifications.bind(this.notifications);
      this.getUnreadCount = this.notifications.getUnreadCount.bind(this.notifications);
      this.markNotificationRead = this.notifications.markNotificationRead.bind(this.notifications);
      this.markAllNotificationsRead = this.notifications.markAllNotificationsRead.bind(this.notifications);
      this.deleteNotification = this.notifications.deleteNotification.bind(this.notifications);
      this.clearAllNotifications = this.notifications.clearAllNotifications.bind(this.notifications);
    }

    // Context Sessions (New)
    if (this.context) {
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
    }

    // RAG & Tests Configuration
    if (this.config) {
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
    }

    // Context Helpers
    if (this.context) {
      this.getSystemPrompt = (this.context as any).getSystemPrompt?.bind(this.context) || (() => null);
      this.getToolSet = (this.context as any).getToolSet?.bind(this.context) || (() => null);
      this.getOrCreateSystemPrompt = (this.context as any).getOrCreateSystemPrompt?.bind(this.context) || (() => '');
      this.getOrCreateToolSet = (this.context as any).getOrCreateToolSet?.bind(this.context) || (() => '');
    }

    // Combo Tests
    if (this.comboTests) {
      this.saveComboResult = this.comboTests.saveComboResult.bind(this.comboTests);
      this.getAllComboResults = this.comboTests.getAllComboResults.bind(this.comboTests);
      this.getComboResult = this.comboTests.getComboResult.bind(this.comboTests);
      this.getResultsForMainModel = this.comboTests.getResultsForMainModel.bind(this.comboTests);
      this.getResultsForExecutorModel = this.comboTests.getResultsForExecutorModel.bind(this.comboTests);
      this.getTopCombos = this.comboTests.getTopCombos.bind(this.comboTests);
      this.deleteComboResult = this.comboTests.deleteComboResult.bind(this.comboTests);
      this.clearAllComboResults = this.comboTests.clearAllComboResults.bind(this.comboTests);
    }
  }

  // Utilities
  /**
   * Runs various database cleanup operations, such as removing expired backups.
   * @returns An object detailing the results of the cleanup, e.g., number of backups deleted.
   */
  runCleanup(): { backupsDeleted: number } {
    const backupsDeleted = this.analytics.cleanupExpiredBackups();
    return { backupsDeleted };
  }

  // Direct Database Access (Facade for DBBase methods via sessions instance)
  public query(sql: string, params: any[] = []): any[] {
    return this.sessions.query(sql, params);
  }

  public run(sql: string, params: any[] = []): { changes: number; lastInsertRowid: number | bigint } {
    return this.sessions.run(sql, params);
  }

  public get(sql: string, params: any[] = []): any {
    return this.sessions.get(sql, params);
  }

  public exec(sql: string): void {
    this.sessions.exec(sql);
  }
}

// Export singleton instance
/**
 * The singleton instance of the DatabaseService, providing a unified interface to all database operations.
 */
export const db = new DatabaseService();

// Export all relevant types for external consumption
export type {
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