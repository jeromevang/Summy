import { db } from '../database.js';
import { cacheService } from '../cache/cache-service.js';
import { HealthCheck, HealthStatus } from './types.js';

export class DatabaseHealthCheck {
  static async check(): Promise<HealthCheck> {
    const startTime = Date.now();
    try {
      await db.get('SELECT 1 as test', []);
      return { name: 'database', status: HealthStatus.HEALTHY, message: 'Healthy', responseTime: Date.now() - startTime, timestamp: new Date().toISOString() };
    } catch (e: any) {
      return { name: 'database', status: HealthStatus.UNHEALTHY, message: e.message, responseTime: Date.now() - startTime, timestamp: new Date().toISOString() };
    }
  }
}

export class CacheHealthCheck {
  static async check(): Promise<HealthCheck> {
    const startTime = Date.now();
    try {
      cacheService.set('health', 'ok');
      if (cacheService.get('health') !== 'ok') throw new Error('Cache fail');
      return { name: 'cache', status: HealthStatus.HEALTHY, message: 'Healthy', responseTime: Date.now() - startTime, timestamp: new Date().toISOString() };
    } catch (e: any) {
      return { name: 'cache', status: HealthStatus.UNHEALTHY, message: e.message, responseTime: Date.now() - startTime, timestamp: new Date().toISOString() };
    }
  }
}
