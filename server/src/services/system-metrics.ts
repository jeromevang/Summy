/**
 * System Metrics Service
 * Collects CPU and GPU usage data and broadcasts via WebSocket
 */

import si from 'systeminformation';
import { exec } from 'child_process';
import { promisify } from 'util';
import { wsBroadcast } from './ws-broadcast.js';

const execAsync = promisify(exec);

interface MetricsData {
  timestamp: number;
  cpu: number;
  gpu: number;
  gpuMemory: number;
  gpuTemp: number;
  gpuName: string;
}

interface NvidiaSmiData {
  utilization: number;
  memory: number;
  temperature: number;
  name: string;
}

class SystemMetricsService {
  private intervalId: NodeJS.Timeout | null = null;
  private history: MetricsData[] = [];
  private maxHistory = 60; // Keep last 60 data points (1 minute at 1s interval)
  private gpuName: string = 'Unknown GPU';
  private useNvidiaSmi: boolean = false;

  async start(intervalMs: number = 1000) {
    if (this.intervalId) return;

    // Check if nvidia-smi is available (more reliable for GPU metrics)
    try {
      const { stdout } = await execAsync('nvidia-smi --query-gpu=name --format=csv,noheader,nounits');
      this.gpuName = stdout.trim().split('\n')[0] || 'NVIDIA GPU';
      this.useNvidiaSmi = true;
      console.log(`[SystemMetrics] nvidia-smi available, using it for GPU metrics (${this.gpuName})`);
    } catch {
      // Fallback to systeminformation
      try {
        const gpuData = await si.graphics();
        if (gpuData.controllers.length > 0) {
          this.gpuName = gpuData.controllers[0].model || 'Unknown GPU';
        }
      } catch {
        // Ignore
      }
      console.log(`[SystemMetrics] nvidia-smi not available, using systeminformation (${this.gpuName})`);
    }

    console.log(`[SystemMetrics] Starting metrics collection (interval: ${intervalMs}ms)`);

    this.intervalId = setInterval(async () => {
      try {
        const metrics = await this.collectMetrics();
        this.history.push(metrics);
        if (this.history.length > this.maxHistory) {
          this.history.shift();
        }
        wsBroadcast.broadcast('system_metrics', metrics);
      } catch (error: any) {
        // Silently ignore collection errors
      }
    }, intervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[SystemMetrics] Stopped metrics collection');
    }
  }

  /**
   * Get GPU metrics using nvidia-smi (more reliable on Windows)
   */
  private async getNvidiaSmiMetrics(): Promise<NvidiaSmiData | null> {
    try {
      const { stdout } = await execAsync(
        'nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu,name --format=csv,noheader,nounits'
      );
      
      const lines = stdout.trim().split('\n');
      if (lines.length === 0) return null;
      
      const parts = lines[0].split(',').map(s => s.trim());
      if (parts.length < 5) return null;
      
      const utilization = parseInt(parts[0]) || 0;
      const memoryUsed = parseInt(parts[1]) || 0;
      const memoryTotal = parseInt(parts[2]) || 1;
      const temperature = parseInt(parts[3]) || 0;
      const name = parts[4] || 'NVIDIA GPU';
      
      return {
        utilization,
        memory: Math.round((memoryUsed / memoryTotal) * 100),
        temperature,
        name
      };
    } catch {
      return null;
    }
  }

  async collectMetrics(): Promise<MetricsData> {
    // Get CPU load
    const cpuLoad = await si.currentLoad();
    
    // Try nvidia-smi first if available
    if (this.useNvidiaSmi) {
      const nvData = await this.getNvidiaSmiMetrics();
      if (nvData) {
        return {
          timestamp: Date.now(),
          cpu: Math.round(cpuLoad.currentLoad),
          gpu: nvData.utilization,
          gpuMemory: nvData.memory,
          gpuTemp: nvData.temperature,
          gpuName: nvData.name
        };
      }
    }
    
    // Fallback to systeminformation
    const gpuData = await si.graphics();
    const gpu = gpuData.controllers[0];
    
    return {
      timestamp: Date.now(),
      cpu: Math.round(cpuLoad.currentLoad),
      gpu: gpu?.utilizationGpu ?? 0,
      gpuMemory: gpu?.memoryUsed && gpu?.memoryTotal 
        ? Math.round((gpu.memoryUsed / gpu.memoryTotal) * 100) 
        : 0,
      gpuTemp: gpu?.temperatureGpu ?? 0,
      gpuName: this.gpuName
    };
  }

  getHistory(): MetricsData[] {
    return this.history;
  }

  getGpuName(): string {
    return this.gpuName;
  }
}

export const systemMetrics = new SystemMetricsService();
