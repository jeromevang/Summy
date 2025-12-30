import { modelManager } from '../model-manager.js';
import { HealthCheck, HealthStatus } from './types.js';

export class ModelsHealthCheck {
  static async check(): Promise<HealthCheck> {
    const startTime = Date.now();
    try {
      const discovery = await modelManager.discoverModels();
      return { name: 'models', status: HealthStatus.HEALTHY, message: `Discovered ${discovery.models.length} models`, responseTime: Date.now() - startTime, timestamp: new Date().toISOString() };
    } catch (e: any) {
      return { name: 'models', status: HealthStatus.UNHEALTHY, message: e.message, responseTime: Date.now() - startTime, timestamp: new Date().toISOString() };
    }
  }
}
