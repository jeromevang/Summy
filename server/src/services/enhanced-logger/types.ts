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
