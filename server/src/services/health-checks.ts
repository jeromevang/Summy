/**
 * Health Check System
 * Provides orchestration and scheduling for various health checks across different system components.
 */

import { DatabaseHealthCheck, CacheHealthCheck } from './health-checks/SystemHealth.js';
import { ModelsHealthCheck } from './health-checks/ModelHealth.js';

/**
 * Orchestrates the execution of all defined health checks.
 */
export class HealthCheckOrchestrator {
  /**
   * Runs all configured health checks and aggregates their results into an overall status.
   * @returns A promise that resolves with an object containing the overall health status,
   *          individual check results, and a timestamp.
   */
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

  /**
   * Retrieves the health status for each individual component.
   * @returns A promise that resolves with an object containing the health status for database, cache, and models.
   */
  static async getComponentHealth() {
    return {
      database: await DatabaseHealthCheck.check(),
      cache: await CacheHealthCheck.check(),
      models: await ModelsHealthCheck.check()
    };
  }
}

/**
 * Schedules periodic execution of health checks.
 */
export class HealthCheckScheduler {
  private static interval: NodeJS.Timeout | null = null;

  /**
   * Starts the health check scheduler, running checks at a specified interval.
   * If a scheduler is already running, it will be stopped and restarted.
   * @param intervalMinutes - The interval in minutes between scheduled health checks. Defaults to 5 minutes.
   */
  static start(intervalMinutes: number = 5) {
    if (this.interval) clearInterval(this.interval);
    this.interval = setInterval(async () => {
      console.log('[Health] Running scheduled health checks...');
      await HealthCheckOrchestrator.runAllChecks();
    }, intervalMinutes * 60 * 1000);
  }

  /**
   * Stops the currently running health check scheduler.
   */
  static stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}

/**
 * Convenience function to run all health checks immediately.
 * @see HealthCheckOrchestrator.runAllChecks
 */
export const runAllChecks = HealthCheckOrchestrator.runAllChecks;

/**
 * Default export providing access to health check utilities.
 */
export default { runAllChecks, HealthCheckOrchestrator, HealthCheckScheduler };