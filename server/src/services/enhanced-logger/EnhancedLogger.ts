import { LogEntry, LogLevel, LogType } from './types.js';
import { LogFileManager } from './managers.js';

/**
 * Interface for configuring the EnhancedLogger.
 */
export interface LoggerConfig {
  /** Enables or disables console output for log entries. */
  enableConsole: boolean;
  /** Optional module name for log entries originating from this logger instance. */
  module?: string;
  /** Optional component name for log entries. */
  component?: string;
  /** Optional user ID for log entries. */
  userId?: string;
  /** Optional request ID for log entries. */
  requestId?: string;
  /** Optional session ID for log entries. */
  sessionId?: string;
  /** Optional model ID for log entries. */
  modelId?: string;
}

/**
 * A flexible and extensible logger that supports structured logging,
 * file management, and various metadata.
 */
export class EnhancedLogger {
  private config: LoggerConfig;

  constructor(config?: Partial<LoggerConfig>) {
    this.config = {
      enableConsole: true, // Default value
      ...config
    };
  }

  private async log(level: LogLevel, type: LogType, message: string, metadata?: Record<string, any>, error?: Error): Promise<void> {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level, type, message,
      module: this.config.module, // Use this.config properties
      component: this.config.component,
      userId: this.config.userId,
      requestId: this.config.requestId,
      sessionId: this.config.sessionId,
      modelId: this.config.modelId,
      metadata
    };

    if (error) {
      entry.error = { name: error.name, message: error.message, stack: error.stack };
    }

    const logManager = await LogFileManager.getInstance();
    await logManager.write(entry);

    if (this.config.enableConsole) {
      console.log(`[${entry.timestamp}] [${LogLevel[level]}] ${message}`);
    }
  }

  error(message: string, metadata?: Record<string, any>, error?: Error): void { this.log(LogLevel.ERROR, LogType.ERROR, message, metadata, error); }
  warn(message: string, metadata?: Record<string, any>): void { this.log(LogLevel.WARN, LogType.WARNING, message, metadata); }
  info(message: string, metadata?: Record<string, any>): void { this.log(LogLevel.INFO, LogType.INFO, message, metadata); }
  debug(message: string, metadata?: Record<string, any>): void { this.log(LogLevel.DEBUG, LogType.DEBUG, message, metadata); }
  trace(message: string, metadata?: Record<string, any>): void { this.log(LogLevel.TRACE, LogType.DEBUG, message, metadata); }

  withModule(module: string): EnhancedLogger { return new EnhancedLogger({ ...this.config, module }); }
  withComponent(component: string): EnhancedLogger { return new EnhancedLogger({ ...this.config, component }); }
  withUser(userId: string): EnhancedLogger { return new EnhancedLogger({ ...this.config, userId }); }
  withRequest(requestId: string): EnhancedLogger { return new EnhancedLogger({ ...this.config, requestId }); }
  withSession(sessionId: string): EnhancedLogger { return new EnhancedLogger({ ...this.config, sessionId }); }
  withModel(modelId: string): EnhancedLogger { return new EnhancedLogger({ ...this.config, modelId }); }
}

export const logger = new EnhancedLogger();
