/**
 * Health Check System
 */

export * from './health-checks/index.js';
import { DatabaseHealthCheck, CacheHealthCheck } from './health-checks/SystemHealth.js';
import { ModelsHealthCheck } from './health-checks/ModelHealth.js';

export class HealthCheckOrchestrator {
  static async runAllChecks() {
    const db = await DatabaseHealthCheck.check();
    const cache = await CacheHealthCheck.check();
    const models = await ModelsHealthCheck.check();
    return { 
      overall: [db, cache, models].every(c => c.status === 'HEALTHY') ? 'HEALTHY' : 'UNHEALTHY', 
      checks: [db, cache, models],
      timestamp: new Date().toISOString()
    };
  }

  static async getComponentHealth() {
    return {
      database: await DatabaseHealthCheck.check(),
      cache: await CacheHealthCheck.check(),
      models: await ModelsHealthCheck.check()
    };
  }
}

export class HealthCheckScheduler {
  private static interval: NodeJS.Timeout | null = null;

  static start(intervalMinutes: number = 5) {
    if (this.interval) clearInterval(this.interval);
    this.interval = setInterval(async () => {
      console.log('[Health] Running scheduled health checks...');
      await HealthCheckOrchestrator.runAllChecks();
    }, intervalMinutes * 60 * 1000);
  }

  static stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}

export const runAllChecks = HealthCheckOrchestrator.runAllChecks;

export default { runAllChecks, HealthCheckOrchestrator, HealthCheckScheduler };