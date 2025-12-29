/**
 * Health Check System
 * Comprehensive health monitoring for all system components
 */

import { Request, Response } from 'express';
import { db } from './database.js';
import { cacheService } from './cache/cache-service.js';
import { modelManager } from './model-manager.js';
import { traceManager, TraceStorage } from './tracing.js';
import { addDebugEntry } from './logger.js';
import axios from 'axios';

// ============================================================
// TYPES
// ============================================================

export enum HealthStatus {
  HEALTHY = 'HEALTHY',
  DEGRADED = 'DEGRADED',
  UNHEALTHY = 'UNHEALTHY',
  UNKNOWN = 'UNKNOWN'
}

export interface HealthCheck {
  name: string;
  status: HealthStatus;
  message: string;
  responseTime: number;
  details?: any;
  timestamp: string;
}

export interface HealthSummary {
  overall: HealthStatus;
  checks: HealthCheck[];
  timestamp: string;
  uptime: number;
}

export interface ComponentHealth {
  database: HealthCheck;
  cache: HealthCheck;
  models: HealthCheck;
  tracing: HealthCheck;
  externalServices: HealthCheck;
  memory: HealthCheck;
  disk: HealthCheck;
}

// ============================================================
// HEALTH CHECK IMPLEMENTATIONS
// ============================================================

export class DatabaseHealthCheck {
  static async check(): Promise<HealthCheck> {
    const startTime = Date.now();

    try {
      // Test basic database connectivity
      const result = await db.get('SELECT 1 as test', []);
      
      // Test write operation
      const testId = `health_check_${Date.now()}`;
      await db.insert('INSERT INTO system_settings (key, value) VALUES (?, ?)', [testId, 'test']);
      await db.delete('DELETE FROM system_settings WHERE key = ?', [testId]);

      const responseTime = Date.now() - startTime;

      return {
        name: 'database',
        status: HealthStatus.HEALTHY,
        message: 'Database is healthy',
        responseTime,
        details: {
          connection: 'successful',
          readWrite: 'successful',
          queryTime: responseTime
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;

      return {
        name: 'database',
        status: HealthStatus.UNHEALTHY,
        message: `Database check failed: ${error.message}`,
        responseTime,
        details: {
          error: error.message
        },
        timestamp: new Date().toISOString()
      };
    }
  }
}

export class CacheHealthCheck {
  static async check(): Promise<HealthCheck> {
    const startTime = Date.now();

    try {
      // Test cache operations
      const testKey = `health_check_${Date.now()}`;
      const testValue = { test: 'data', timestamp: Date.now() };

      cacheService.set(testKey, testValue);
      const retrieved = cacheService.get(testKey);

      if (!retrieved) {
        throw new Error('Cache retrieval failed');
      }

      // Test TTL
      cacheService.set(`${testKey}_ttl`, testValue, { ttl: 100 });
      
      const responseTime = Date.now() - startTime;

      return {
        name: 'cache',
        status: HealthStatus.HEALTHY,
        message: 'Cache is healthy',
        responseTime,
        details: {
          setOperation: 'successful',
          getOperation: 'successful',
          ttlOperation: 'successful'
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;

      return {
        name: 'cache',
        status: HealthStatus.UNHEALTHY,
        message: `Cache check failed: ${error.message}`,
        responseTime,
        details: {
          error: error.message
        },
        timestamp: new Date().toISOString()
      };
    }
  }
}

export class ModelsHealthCheck {
  static async check(): Promise<HealthCheck> {
    const startTime = Date.now();

    try {
      // Test model discovery
      const discoveryResult = await modelManager.discoverModels();
      
      // Test health check on a sample model
      let healthyModels = 0;
      let totalChecked = 0;

      if (discoveryResult.models.length > 0) {
        const sampleModels = discoveryResult.models.slice(0, 3);
        
        for (const model of sampleModels) {
          try {
            totalChecked++;
            const healthResult = await modelManager.healthCheckModel(model.id);
            
            if (healthResult.status === 'healthy') {
              healthyModels++;
            }
          } catch (error) {
            totalChecked++;
          }
        }
      }

      const responseTime = Date.now() - startTime;

      if (healthyModels === totalChecked && totalChecked > 0) {
        return {
          name: 'models',
          status: HealthStatus.HEALTHY,
          message: `All checked models are healthy (${healthyModels}/${totalChecked})`,
          responseTime,
          details: {
            totalModels: discoveryResult.totalModels,
            healthyModels,
            totalChecked
          },
          timestamp: new Date().toISOString()
        };
      } else if (healthyModels > 0) {
        return {
          name: 'models',
          status: HealthStatus.DEGRADED,
          message: `Some models are unhealthy (${healthyModels}/${totalChecked})`,
          responseTime,
          details: {
            totalModels: discoveryResult.totalModels,
            healthyModels,
            totalChecked
          },
          timestamp: new Date().toISOString()
        };
      } else {
        return {
          name: 'models',
          status: HealthStatus.UNHEALTHY,
          message: 'No healthy models found',
          responseTime,
          details: {
            totalModels: discoveryResult.totalModels,
            healthyModels: 0,
            totalChecked
          },
          timestamp: new Date().toISOString()
        };
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;

      return {
        name: 'models',
        status: HealthStatus.UNHEALTHY,
        message: `Models check failed: ${error.message}`,
        responseTime,
        details: {
          error: error.message
        },
        timestamp: new Date().toISOString()
      };
    }
  }
}

export class TracingHealthCheck {
  static async check(): Promise<HealthCheck> {
    const startTime = Date.now();

    try {
      // Test trace storage
      await TraceStorage.initialize();
      
      // Test trace operations
      const traceManager = traceManager;
      const spanId = traceManager.startSpan('health_check');
      traceManager.logSpan(spanId, 'info', 'Health check trace');
      traceManager.endSpan(spanId);

      const responseTime = Date.now() - startTime;

      return {
        name: 'tracing',
        status: HealthStatus.HEALTHY,
        message: 'Tracing system is healthy',
        responseTime,
        details: {
          storage: 'initialized',
          spans: 'created_and_saved'
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;

      return {
        name: 'tracing',
        status: HealthStatus.UNHEALTHY,
        message: `Tracing check failed: ${error.message}`,
        responseTime,
        details: {
          error: error.message
        },
        timestamp: new Date().toISOString()
      };
    }
  }
}

export class ExternalServicesHealthCheck {
  static async check(): Promise<HealthCheck> {
    const startTime = Date.now();
    const services = [
      { name: 'OpenAI API', url: 'https://api.openai.com/v1/models', key: 'OPENAI_API_KEY' },
      { name: 'OpenRouter API', url: 'https://openrouter.ai/api/v1/models', key: 'OPENROUTER_API_KEY' }
    ];

    const results: { [key: string]: boolean } = {};

    for (const service of services) {
      try {
        const headers: any = {};
        if (service.key) {
          const apiKey = process.env[service.key];
          if (apiKey) {
            headers.Authorization = `Bearer ${apiKey}`;
          }
        }

        // Simple HEAD request to test connectivity
        await axios.head(service.url, { 
          headers,
          timeout: 5000 
        });
        
        results[service.name] = true;
      } catch (error) {
        results[service.name] = false;
      }
    }

    const responseTime = Date.now() - startTime;
    const healthyServices = Object.values(results).filter(Boolean).length;
    const totalServices = Object.keys(results).length;

    if (healthyServices === totalServices) {
      return {
        name: 'external_services',
        status: HealthStatus.HEALTHY,
        message: 'All external services are healthy',
        responseTime,
        details: results,
        timestamp: new Date().toISOString()
      };
    } else if (healthyServices > 0) {
      return {
        name: 'external_services',
        status: HealthStatus.DEGRADED,
        message: `${healthyServices}/${totalServices} external services are healthy`,
        responseTime,
        details: results,
        timestamp: new Date().toISOString()
      };
    } else {
      return {
        name: 'external_services',
        status: HealthStatus.UNHEALTHY,
        message: 'No external services are reachable',
        responseTime,
        details: results,
        timestamp: new Date().toISOString()
      };
    }
  }
}

export class SystemHealthCheck {
  static async check(): Promise<HealthCheck> {
    const startTime = Date.now();

    try {
      const memoryUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();
      const uptime = process.uptime();

      // Check memory usage
      const memoryThreshold = 0.8; // 80% threshold
      const totalMemory = memoryUsage.heapTotal;
      const usedMemory = memoryUsage.heapUsed;
      const memoryUsagePercent = usedMemory / totalMemory;

      // Check disk space (simplified)
      const fs = require('fs');
      const stats = fs.statSync('./');
      const diskUsage = { available: true }; // Simplified check

      const responseTime = Date.now() - startTime;

      let status = HealthStatus.HEALTHY;
      let message = 'System resources are healthy';

      if (memoryUsagePercent > memoryThreshold) {
        status = HealthStatus.DEGRADED;
        message = `High memory usage: ${(memoryUsagePercent * 100).toFixed(1)}%`;
      }

      return {
        name: 'system',
        status,
        message,
        responseTime,
        details: {
          memory: {
            used: usedMemory,
            total: totalMemory,
            percent: memoryUsagePercent,
            threshold: memoryThreshold
          },
          cpu: {
            user: cpuUsage.user,
            system: cpuUsage.system
          },
          uptime,
          disk: diskUsage
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;

      return {
        name: 'system',
        status: HealthStatus.UNHEALTHY,
        message: `System check failed: ${error.message}`,
        responseTime,
        details: {
          error: error.message
        },
        timestamp: new Date().toISOString()
      };
    }
  }
}

// ============================================================
// HEALTH CHECK ORCHESTRATOR
// ============================================================

export class HealthCheckOrchestrator {
  private static checkers = [
    DatabaseHealthCheck.check,
    CacheHealthCheck.check,
    ModelsHealthCheck.check,
    TracingHealthCheck.check,
    ExternalServicesHealthCheck.check,
    SystemHealthCheck.check
  ];

  static async runAllChecks(): Promise<HealthSummary> {
    const startTime = Date.now();
    const checks: HealthCheck[] = [];
    let overallStatus = HealthStatus.HEALTHY;

    for (const checker of this.checkers) {
      try {
        const result = await checker();
        checks.push(result);

        if (result.status === HealthStatus.UNHEALTHY) {
          overallStatus = HealthStatus.UNHEALTHY;
        } else if (result.status === HealthStatus.DEGRADED && overallStatus === HealthStatus.HEALTHY) {
          overallStatus = HealthStatus.DEGRADED;
        }
      } catch (error) {
        checks.push({
          name: 'unknown',
          status: HealthStatus.UNHEALTHY,
          message: `Check failed: ${error.message}`,
          responseTime: 0,
          timestamp: new Date().toISOString()
        });
        overallStatus = HealthStatus.UNHEALTHY;
      }
    }

    const summary: HealthSummary = {
      overall: overallStatus,
      checks,
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    };

    // Log health check results
    addDebugEntry('session', 'Health check completed', {
      overall: summary.overall,
      checks: summary.checks.map(c => ({ name: c.name, status: c.status })),
      uptime: summary.uptime
    });

    return summary;
  }

  static async getComponentHealth(): Promise<ComponentHealth> {
    const checks = await this.runAllChecks();
    
    const healthMap: { [key: string]: HealthCheck } = {};
    checks.checks.forEach(check => {
      healthMap[check.name] = check;
    });

    return {
      database: healthMap.database || { name: 'database', status: HealthStatus.UNKNOWN, message: 'Not checked', responseTime: 0, timestamp: new Date().toISOString() },
      cache: healthMap.cache || { name: 'cache', status: HealthStatus.UNKNOWN, message: 'Not checked', responseTime: 0, timestamp: new Date().toISOString() },
      models: healthMap.models || { name: 'models', status: HealthStatus.UNKNOWN, message: 'Not checked', responseTime: 0, timestamp: new Date().toISOString() },
      tracing: healthMap.tracing || { name: 'tracing', status: HealthStatus.UNKNOWN, message: 'Not checked', responseTime: 0, timestamp: new Date().toISOString() },
      externalServices: healthMap.external_services || { name: 'external_services', status: HealthStatus.UNKNOWN, message: 'Not checked', responseTime: 0, timestamp: new Date().toISOString() },
      memory: healthMap.system || { name: 'system', status: HealthStatus.UNKNOWN, message: 'Not checked', responseTime: 0, timestamp: new Date().toISOString() },
      disk: { name: 'disk', status: HealthStatus.UNKNOWN, message: 'Simplified check', responseTime: 0, timestamp: new Date().toISOString() }
    };
  }
}

// ============================================================
// HEALTH CHECK ROUTES
// ============================================================

export const healthCheckRoutes = (req: Request, res: Response) => {
  const path = req.path;

  switch (path) {
    case '/health':
      return res.json({ status: 'ok', timestamp: new Date().toISOString() });

    case '/health/detailed':
      return HealthCheckOrchestrator.runAllChecks().then(summary => {
        res.json(summary);
      });

    case '/health/components':
      return HealthCheckOrchestrator.getComponentHealth().then(components => {
        res.json(components);
      });

    case '/health/database':
      return DatabaseHealthCheck.check().then(result => {
        res.json(result);
      });

    case '/health/cache':
      return CacheHealthCheck.check().then(result => {
        res.json(result);
      });

    case '/health/models':
      return ModelsHealthCheck.check().then(result => {
        res.json(result);
      });

    case '/health/tracing':
      return TracingHealthCheck.check().then(result => {
        res.json(result);
      });

    case '/health/external':
      return ExternalServicesHealthCheck.check().then(result => {
        res.json(result);
      });

    case '/health/system':
      return SystemHealthCheck.check().then(result => {
        res.json(result);
      });

    default:
      return res.status(404).json({ error: 'Health check endpoint not found' });
  }
};

// ============================================================
// HEALTH CHECK SCHEDULER
// ============================================================

export class HealthCheckScheduler {
  private static interval: NodeJS.Timeout | null = null;
  private static isRunning = false;

  static start(intervalMinutes: number = 5): void {
    if (this.isRunning) return;

    this.isRunning = true;
    const intervalMs = intervalMinutes * 60 * 1000;

    this.interval = setInterval(async () => {
      try {
        const summary = await HealthCheckOrchestrator.runAllChecks();
        
        // Log critical issues
        if (summary.overall === HealthStatus.UNHEALTHY) {
          addDebugEntry('error', 'CRITICAL: System health check failed', summary);
        } else if (summary.overall === HealthStatus.DEGRADED) {
          addDebugEntry('warning', 'WARNING: System health check degraded', summary);
        }
      } catch (error) {
        addDebugEntry('error', 'Health check scheduler failed', { error });
      }
    }, intervalMs);

    addDebugEntry('session', `Health check scheduler started (every ${intervalMinutes} minutes)`);
  }

  static stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      this.isRunning = false;
      addDebugEntry('session', 'Health check scheduler stopped');
    }
  }

  static async runOnce(): Promise<HealthSummary> {
    return await HealthCheckOrchestrator.runAllChecks();
  }
}

export default {
  DatabaseHealthCheck,
  CacheHealthCheck,
  ModelsHealthCheck,
  TracingHealthCheck,
  ExternalServicesHealthCheck,
  SystemHealthCheck,
  HealthCheckOrchestrator,
  HealthCheckScheduler,
  healthCheckRoutes
};
