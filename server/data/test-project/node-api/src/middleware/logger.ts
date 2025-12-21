/**
 * Logger Middleware
 * Cross-cutting concern for request logging
 */

import { Request, Response, NextFunction } from 'express';

interface LogEntry {
  timestamp: string;
  method: string;
  path: string;
  statusCode: number;
  duration: number;
  userAgent?: string;
  ip?: string;
}

const logs: LogEntry[] = [];

/**
 * Request logging middleware
 */
export function loggerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const startTime = Date.now();
  
  // Log after response is sent
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      userAgent: req.headers['user-agent'],
      ip: req.ip || req.socket.remoteAddress,
    };
    
    logs.push(entry);
    
    // Keep only last 1000 logs
    if (logs.length > 1000) {
      logs.shift();
    }
    
    // Console log for development
    const statusColor = res.statusCode >= 400 ? '\x1b[31m' : '\x1b[32m';
    console.log(
      `${entry.timestamp} ${entry.method} ${entry.path} ${statusColor}${entry.statusCode}\x1b[0m ${entry.duration}ms`
    );
  });
  
  next();
}

/**
 * Get recent logs
 */
export function getRecentLogs(limit: number = 100): LogEntry[] {
  return logs.slice(-limit);
}

/**
 * Clear logs
 */
export function clearLogs(): void {
  logs.length = 0;
}

/**
 * Get log statistics
 */
export function getLogStats(): {
  totalRequests: number;
  avgDuration: number;
  errorRate: number;
  statusCounts: Record<number, number>;
} {
  if (logs.length === 0) {
    return {
      totalRequests: 0,
      avgDuration: 0,
      errorRate: 0,
      statusCounts: {},
    };
  }
  
  const totalRequests = logs.length;
  const avgDuration = logs.reduce((sum, l) => sum + l.duration, 0) / totalRequests;
  const errors = logs.filter(l => l.statusCode >= 400).length;
  const errorRate = errors / totalRequests;
  
  const statusCounts: Record<number, number> = {};
  logs.forEach(l => {
    statusCounts[l.statusCode] = (statusCounts[l.statusCode] || 0) + 1;
  });
  
  return {
    totalRequests,
    avgDuration: Math.round(avgDuration),
    errorRate: Math.round(errorRate * 100) / 100,
    statusCounts,
  };
}

