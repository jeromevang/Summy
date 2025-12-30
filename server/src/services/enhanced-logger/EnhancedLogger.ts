import { LogEntry, LogLevel, LogType } from './types.js';
import { LogFileManager } from './managers.js';

export class EnhancedLogger {
  private module?: string;
  private component?: string;
  private userId?: string;
  private requestId?: string;
  private sessionId?: string;
  private modelId?: string;

  constructor(config?: { module?: string; component?: string; userId?: string; requestId?: string; sessionId?: string; modelId?: string }) {
    this.module = config?.module;
    this.component = config?.component;
    this.userId = config?.userId;
    this.requestId = config?.requestId;
    this.sessionId = config?.sessionId;
    this.modelId = config?.modelId;
  }

  private async log(level: LogLevel, type: LogType, message: string, metadata?: Record<string, any>, error?: Error): Promise<void> {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level, type, message,
      module: this.module, component: this.component, userId: this.userId,
      requestId: this.requestId, sessionId: this.sessionId, modelId: this.modelId,
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

  withModule(module: string) { return new EnhancedLogger({ ...this, module }); }
  withComponent(component: string) { return new EnhancedLogger({ ...this, component }); }
  withUser(userId: string) { return new EnhancedLogger({ ...this, userId }); }
  withRequest(requestId: string) { return new EnhancedLogger({ ...this, requestId }); }
  withSession(sessionId: string) { return new EnhancedLogger({ ...this, sessionId }); }
  withModel(modelId: string) { return new EnhancedLogger({ ...this, modelId }); }
}

export const logger = new EnhancedLogger();
