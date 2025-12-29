/**
 * Enhanced Logging System
 * Comprehensive logging with structured logs, log levels, and log aggregation
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { format } from 'date-fns';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================
// TYPES AND INTERFACES
// ============================================================

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4
}

export enum LogType {
  REQUEST = 'REQUEST',
  RESPONSE = 'RESPONSE',
  ERROR = 'ERROR',
  WARNING = 'WARNING',
  INFO = 'INFO',
  DEBUG = 'DEBUG',
  PERFORMANCE = 'PERFORMANCE',
  SECURITY = 'SECURITY',
  SYSTEM = 'SYSTEM',
  AUDIT = 'AUDIT'
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  type: LogType;
  message: string;
  module?: string;
  component?: string;
  userId?: string;
  requestId?: string;
  sessionId?: string;
  modelId?: string;
  metadata?: Record<string, any>;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
    details?: any;
  };
  performance?: {
    duration: number;
    operation: string;
    memory?: number;
    cpu?: number;
  };
}

export interface LogFilter {
  level?: LogLevel;
  type?: LogType;
  module?: string;
  component?: string;
  userId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  requestId?: string;
}

export interface LogStats {
  total: number;
  byLevel: Record<LogLevel, number>;
  byType: Record<LogType, number>;
  byModule: Record<string, number>;
  byComponent: Record<string, number>;
  errors: number;
  warnings: number;
  recentErrors: LogEntry[];
}

// ============================================================
// LOG ENTRY VALIDATION
// ============================================================

const LogEntrySchema = z.object({
  timestamp: z.string(),
  level: z.nativeEnum(LogLevel),
  type: z.nativeEnum(LogType),
  message: z.string(),
  module: z.string().optional(),
  component: z.string().optional(),
  userId: z.string().optional(),
  requestId: z.string().optional(),
  sessionId: z.string().optional(),
  modelId: z.string().optional(),
  metadata: z.record(z.any()).optional(),
  error: z.object({
    name: z.string(),
    message: z.string(),
    stack: z.string().optional(),
    code: z.string().optional(),
    details: z.any().optional()
  }).optional(),
  performance: z.object({
    duration: z.number(),
    operation: z.string(),
    memory: z.number().optional(),
    cpu: z.number().optional()
  }).optional()
});

// ============================================================
// LOG ROTATION MANAGER
// ============================================================

class LogRotationManager {
  private logDir: string;
  private maxFileSize: number;
  private maxFiles: number;
  private currentLogFile: string;
  private currentFileSize: number;

  constructor() {
    this.logDir = path.join(__dirname, '../../../logs');
    this.maxFileSize = 50 * 1024 * 1024; // 50MB
    this.maxFiles = 10;
    this.currentLogFile = this.getCurrentLogFileName();
    this.currentFileSize = 0;
  }

  private getCurrentLogFileName(): string {
    const date = format(new Date(), 'yyyy-MM-dd');
    return path.join(this.logDir, `summy-${date}.log`);
  }

  private async rotateLog(): Promise<void> {
    if (this.currentFileSize >= this.maxFileSize) {
      const oldLogFile = this.currentLogFile;
      this.currentLogFile = this.getCurrentLogFileName();
      this.currentFileSize = 0;

      // Compress old log file
      await this.compressLogFile(oldLogFile);
      
      // Clean up old files
      await this.cleanupOldFiles();
    }
  }

  private async compressLogFile(filePath: string): Promise<void> {
    try {
      const fs = await import('fs');
      const zlib = await import('zlib');
      
      const readStream = fs.createReadStream(filePath);
      const writeStream = fs.createWriteStream(`${filePath}.gz`);
      const gzip = zlib.createGzip();
      
      readStream.pipe(gzip).pipe(writeStream);
      
      // Remove original file after compression
      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', () => {
          fs.unlinkSync(filePath);
          resolve();
        });
        writeStream.on('error', reject);
      });
    } catch (error) {
      console.error('Failed to compress log file:', error);
    }
  }

  private async cleanupOldFiles(): Promise<void> {
    try {
      const files = await fs.readdir(this.logDir);
      const logFiles = files
        .filter(f => f.startsWith('summy-') && (f.endsWith('.log') || f.endsWith('.log.gz')))
        .map(f => ({
          name: f,
          path: path.join(this.logDir, f),
          stat: fs.statSync(path.join(this.logDir, f))
        }))
        .sort((a, b) => b.stat.mtime.getTime() - a.stat.mtime.getTime());

      // Remove files beyond maxFiles limit
      for (let i = this.maxFiles; i < logFiles.length; i++) {
        await fs.unlink(logFiles[i].path);
      }
    } catch (error) {
      console.error('Failed to cleanup old log files:', error);
    }
  }

  async ensureLogDirectory(): Promise<void> {
    await fs.ensureDir(this.logDir);
  }

  async getLogFileSize(): Promise<number> {
    try {
      const stats = await fs.stat(this.currentLogFile);
      return stats.size;
    } catch {
      return 0;
    }
  }

  async updateFileSize(size: number): Promise<void> {
    this.currentFileSize = size;
  }

  getLogFilePath(): string {
    return this.currentLogFile;
  }
}

// ============================================================
// LOG AGGREGATOR
// ============================================================

class LogAggregator {
  private buffer: LogEntry[] = [];
  private flushInterval: NodeJS.Timeout;
  private maxBufferSize: number;

  constructor() {
    this.maxBufferSize = 100;
    this.flushInterval = setInterval(() => this.flush(), 5000); // Flush every 5 seconds
  }

  addEntry(entry: LogEntry): void {
    this.buffer.push(entry);
    
    if (this.buffer.length >= this.maxBufferSize) {
      this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const entries = [...this.buffer];
    this.buffer = [];

    try {
      // Write to file
      const logManager = await LogFileManager.getInstance();
      await logManager.writeBatch(entries);
    } catch (error) {
      console.error('Failed to flush log entries:', error);
    }
  }

  async getStats(): Promise<LogStats> {
    try {
      const logManager = await LogFileManager.getInstance();
      return await logManager.getStats();
    } catch (error) {
      console.error('Failed to get log stats:', error);
      return this.getEmptyStats();
    }
  }

  async searchLogs(filter: LogFilter): Promise<LogEntry[]> {
    try {
      const logManager = await LogFileManager.getInstance();
      return await logManager.searchLogs(filter);
    } catch (error) {
      console.error('Failed to search logs:', error);
      return [];
    }
  }

  private getEmptyStats(): LogStats {
    return {
      total: 0,
      byLevel: { [LogLevel.ERROR]: 0, [LogLevel.WARN]: 0, [LogLevel.INFO]: 0, [LogLevel.DEBUG]: 0, [LogLevel.TRACE]: 0 },
      byType: { [LogType.REQUEST]: 0, [LogType.RESPONSE]: 0, [LogType.ERROR]: 0, [LogType.WARNING]: 0, [LogType.INFO]: 0, [LogType.DEBUG]: 0, [LogType.PERFORMANCE]: 0, [LogType.SECURITY]: 0, [LogType.SYSTEM]: 0, [LogType.AUDIT]: 0 },
      byModule: {},
      byComponent: {},
      errors: 0,
      warnings: 0,
      recentErrors: []
    };
  }
}

// ============================================================
// LOG FILE MANAGER
// ============================================================

class LogFileManager {
  private static instance: LogFileManager;
  private rotationManager: LogRotationManager;
  private aggregator: LogAggregator;

  private constructor() {
    this.rotationManager = new LogRotationManager();
    this.aggregator = new LogAggregator();
  }

  static async getInstance(): Promise<LogFileManager> {
    if (!LogFileManager.instance) {
      LogFileManager.instance = new LogFileManager();
      await LogFileManager.instance.rotationManager.ensureLogDirectory();
    }
    return LogFileManager.instance;
  }

  async write(entry: LogEntry): Promise<void> {
    await this.rotationManager.rotateLog();
    this.aggregator.addEntry(entry);
  }

  async writeBatch(entries: LogEntry[]): Promise<void> {
    const logPath = this.rotationManager.getLogFilePath();
    const logContent = entries.map(entry => JSON.stringify(entry)).join('\n') + '\n';
    
    await fs.appendFile(logPath, logContent);
    
    const newSize = await this.rotationManager.getLogFileSize();
    await this.rotationManager.updateFileSize(newSize);
  }

  async getStats(): Promise<LogStats> {
    const stats: LogStats = {
      total: 0,
      byLevel: { [LogLevel.ERROR]: 0, [LogLevel.WARN]: 0, [LogLevel.INFO]: 0, [LogLevel.DEBUG]: 0, [LogLevel.TRACE]: 0 },
      byType: { [LogType.REQUEST]: 0, [LogType.RESPONSE]: 0, [LogType.ERROR]: 0, [LogType.WARNING]: 0, [LogType.INFO]: 0, [LogType.DEBUG]: 0, [LogType.PERFORMANCE]: 0, [LogType.SECURITY]: 0, [LogType.SYSTEM]: 0, [LogType.AUDIT]: 0 },
      byModule: {},
      byComponent: {},
      errors: 0,
      warnings: 0,
      recentErrors: []
    };

    try {
      const logPath = this.rotationManager.getLogFilePath();
      const content = await fs.readFile(logPath, 'utf-8');
      const lines = content.trim().split('\n');

      for (const line of lines) {
        if (!line) continue;

        try {
          const entry = JSON.parse(line) as LogEntry;
          
          stats.total++;
          stats.byLevel[entry.level]++;
          stats.byType[entry.type]++;
          
          if (entry.module) {
            stats.byModule[entry.module] = (stats.byModule[entry.module] || 0) + 1;
          }
          
          if (entry.component) {
            stats.byComponent[entry.component] = (stats.byComponent[entry.component] || 0) + 1;
          }
          
          if (entry.level === LogLevel.ERROR) {
            stats.errors++;
            if (stats.recentErrors.length < 10) {
              stats.recentErrors.push(entry);
            }
          } else if (entry.level === LogLevel.WARN) {
            stats.warnings++;
          }
        } catch (error) {
          // Skip invalid log entries
        }
      }
    } catch (error) {
      // File might not exist yet
    }

    return stats;
  }

  async searchLogs(filter: LogFilter): Promise<LogEntry[]> {
    const results: LogEntry[] = [];
    const logPath = this.rotationManager.getLogFilePath();

    try {
      const content = await fs.readFile(logPath, 'utf-8');
      const lines = content.trim().split('\n');

      for (const line of lines) {
        if (!line) continue;

        try {
          const entry = JSON.parse(line) as LogEntry;
          
          if (this.matchesFilter(entry, filter)) {
            results.push(entry);
          }
        } catch (error) {
          // Skip invalid log entries
        }
      }
    } catch (error) {
      // File might not exist yet
    }

    return results;
  }

  private matchesFilter(entry: LogEntry, filter: LogFilter): boolean {
    if (filter.level !== undefined && entry.level !== filter.level) return false;
    if (filter.type !== undefined && entry.type !== filter.type) return false;
    if (filter.module && entry.module !== filter.module) return false;
    if (filter.component && entry.component !== filter.component) return false;
    if (filter.userId && entry.userId !== filter.userId) return false;
    if (filter.requestId && entry.requestId !== filter.requestId) return false;

    if (filter.dateFrom && new Date(entry.timestamp) < filter.dateFrom) return false;
    if (filter.dateTo && new Date(entry.timestamp) > filter.dateTo) return false;

    return true;
  }
}

// ============================================================
// ENHANCED LOGGER
// ============================================================

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
      level,
      type,
      message,
      module: this.module,
      component: this.component,
      userId: this.userId,
      requestId: this.requestId,
      sessionId: this.sessionId,
      modelId: this.modelId,
      metadata
    };

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: (error as any).code,
        details: (error as any).details
      };
    }

    // Validate log entry (temporarily disabled due to zod version conflict)
    // try {
    //   LogEntrySchema.parse(entry);
    // } catch (validationError) {
    //   console.error('Invalid log entry:', validationError);
    //   return;
    // }

    // Write to file
    const logManager = await LogFileManager.getInstance();
    await logManager.write(entry);

    // Console output for development
    if (process.env.NODE_ENV === 'development') {
      this.consoleOutput(entry);
    }
  }

  private consoleOutput(entry: LogEntry): void {
    const timestamp = new Date(entry.timestamp).toLocaleTimeString();
    const levelStr = LogLevel[entry.level];
    const moduleStr = entry.module ? `[${entry.module}]` : '';
    const componentStr = entry.component ? `(${entry.component})` : '';
    const userStr = entry.userId ? `{${entry.userId}}` : '';
    const requestStr = entry.requestId ? `<${entry.requestId}>` : '';

    const prefix = `[${timestamp}] ${levelStr}${moduleStr}${componentStr}${userStr}${requestStr}`;
    
    switch (entry.level) {
      case LogLevel.ERROR:
        console.error(`${prefix} ERROR: ${entry.message}`);
        if (entry.error) {
          console.error(`  Error: ${entry.error.name} - ${entry.error.message}`);
          if (entry.error.stack) {
            console.error(`  Stack: ${entry.error.stack.split('\n').slice(0, 3).join('\n')}`);
          }
        }
        break;
      case LogLevel.WARN:
        console.warn(`${prefix} WARN: ${entry.message}`);
        break;
      case LogLevel.INFO:
        console.info(`${prefix} INFO: ${entry.message}`);
        break;
      case LogLevel.DEBUG:
        console.debug(`${prefix} DEBUG: ${entry.message}`);
        break;
      case LogLevel.TRACE:
        console.trace(`${prefix} TRACE: ${entry.message}`);
        break;
    }

    if (entry.metadata) {
      console.log('  Metadata:', JSON.stringify(entry.metadata, null, 2));
    }
  }

  // Public logging methods
  error(message: string, metadata?: Record<string, any>, error?: Error): void {
    this.log(LogLevel.ERROR, LogType.ERROR, message, metadata, error);
  }

  warn(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.WARN, LogType.WARNING, message, metadata);
  }

  info(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.INFO, LogType.INFO, message, metadata);
  }

  debug(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, LogType.DEBUG, message, metadata);
  }

  trace(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.TRACE, LogType.DEBUG, message, metadata);
  }

  // Specialized logging methods
  request(method: string, url: string, duration: number, statusCode: number, metadata?: Record<string, any>): void {
    this.log(LogLevel.INFO, LogType.REQUEST, `HTTP ${method} ${url} - ${statusCode} (${duration}ms)`, {
      ...metadata,
      method,
      url,
      duration,
      statusCode
    });
  }

  response(method: string, url: string, duration: number, statusCode: number, metadata?: Record<string, any>): void {
    this.log(LogLevel.INFO, LogType.RESPONSE, `HTTP ${method} ${url} - ${statusCode} (${duration}ms)`, {
      ...metadata,
      method,
      url,
      duration,
      statusCode
    });
  }

  performance(operation: string, duration: number, metadata?: Record<string, any>): void {
    this.log(LogLevel.INFO, LogType.PERFORMANCE, `Performance: ${operation} took ${duration}ms`, {
      ...metadata,
      operation,
      duration,
      memory: process.memoryUsage(),
      cpu: process.cpuUsage()
    });
  }

  security(event: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.WARN, LogType.SECURITY, `Security: ${event}`, metadata);
  }

  audit(action: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.INFO, LogType.AUDIT, `Audit: ${action}`, metadata);
  }

  // Fluent API for chaining
  withModule(module: string): EnhancedLogger {
    return new EnhancedLogger({ ...this, module });
  }

  withComponent(component: string): EnhancedLogger {
    return new EnhancedLogger({ ...this, component });
  }

  withUser(userId: string): EnhancedLogger {
    return new EnhancedLogger({ ...this, userId });
  }

  withRequest(requestId: string): EnhancedLogger {
    return new EnhancedLogger({ ...this, requestId });
  }

  withSession(sessionId: string): EnhancedLogger {
    return new EnhancedLogger({ ...this, sessionId });
  }

  withModel(modelId: string): EnhancedLogger {
    return new EnhancedLogger({ ...this, modelId });
  }
}

// ============================================================
// GLOBAL LOGGER INSTANCE
// ============================================================

export const logger = new EnhancedLogger();

// ============================================================
// LOGGING MIDDLEWARE
// ============================================================

export const loggingMiddleware = (req: any, res: any, next: any): void => {
  const startTime = Date.now();
  const originalEnd = res.end;

  // Add logger to request
  req.logger = logger
    .withRequest(req.headers['x-request-id'] || req.headers['x-correlation-id'] || generateRequestId())
    .withUser(req.headers['x-user-id'] || 'anonymous')
    .withSession(req.headers['x-session-id']);

  // Log request
  req.logger.request(req.method, req.originalUrl, 0, 0, {
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    headers: req.headers
  });

  // Override res.end to capture response
  res.end = function(chunk: any, encoding: any) {
    const duration = Date.now() - startTime;
    
    // Log response
    req.logger.response(req.method, req.originalUrl, duration, res.statusCode, {
      contentLength: res.get('Content-Length'),
      contentType: res.get('Content-Type')
    });

    // Restore original end and call it
    res.end = originalEnd;
    res.end(chunk, encoding);
  };

  next();
};

// ============================================================
// UTILITIES
// ============================================================

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================================
// EXPORTS
// ============================================================

export default {
  EnhancedLogger,
  logger,
  loggingMiddleware,
  LogFileManager,
  LogAggregator,
  LogRotationManager,
  LogLevel,
  LogType,
  LogEntrySchema
};
