/**
 * System Metrics Service
 * Collects CPU and GPU usage data and broadcasts via WebSocket
 */
import { exec } from 'child_process';
import si from 'systeminformation';
import { promisify } from 'util';
import { wsBroadcast } from './ws-broadcast.js';

const execAsync = promisify(exec);

/**
 * Represents a single data point of collected system metrics.
 */
interface MetricsData {
    /** The timestamp when the metrics were collected. */
    timestamp: number;
    /** The current CPU utilization percentage. */
    cpu: number;
    /** The current GPU utilization percentage. */
    gpu: number;
    /** The current GPU memory utilization percentage. */
    gpuMemory: number;
    /** The current GPU temperature in Celsius. */
    gpuTemp: number;
    /** The name of the GPU. */
    gpuName: string;
    /** The used VRAM in megabytes. */
    vramUsedMB: number;
    /** The total VRAM in megabytes. */
    vramTotalMB: number;
    /** The VRAM usage as a percentage. */
    vramPercent: number;
    /** The used system RAM in gigabytes. */
    ramUsedGB: number;
    /** The total system RAM in gigabytes. */
    ramTotalGB: number;
    /** The system RAM usage as a percentage. */
    ramPercent: number;
}

/**
 * Represents the data structure returned by the nvidia-smi command.
 */
interface NvidiaSmiData {
    /** The GPU utilization percentage. */
    utilization: number;
    /** The GPU memory usage percentage. */
    memory: number;
    /** The GPU temperature in Celsius. */
    temperature: number;
    /** The name of the GPU. */
    name: string;
    /** The used VRAM in megabytes. */
    vramUsedMB: number;
    /** The total VRAM in megabytes. */
    vramTotalMB: number;
}

/**
 * A service for collecting and broadcasting system metrics like CPU and GPU usage.
 */
class SystemMetricsService {
    private intervalId: NodeJS.Timeout | null = null;
    private history: MetricsData[] = [];
    private maxHistory = 60; // Keep last 60 data points (1 minute at 1s interval)
    private gpuName: string = 'Unknown GPU';
    private useNvidiaSmi: boolean = false;

    /**
     * Starts collecting system metrics at a specified interval.
     * It detects if nvidia-smi is available for more accurate GPU metrics.
     * @param intervalMs - The interval in milliseconds to collect metrics. Defaults to 1000ms.
     */
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

    /**
     * Stops the collection of system metrics.
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            console.log('[SystemMetrics] Stopped metrics collection');
        }
    }

    /**
     * Retrieves GPU metrics using the nvidia-smi command-line tool.
     * @returns A promise that resolves with the parsed NvidiaSmiData, or null if an error occurs.
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
                name,
                vramUsedMB: memoryUsed,
                vramTotalMB: memoryTotal
            };
        } catch {
            return null;
        }
    }

    /**
     * Collects a snapshot of the current system metrics.
     * It prioritizes nvidia-smi for GPU data if available, otherwise falls back to systeminformation.
     * @returns A promise that resolves with the collected MetricsData.
     */
    async collectMetrics(): Promise<MetricsData> {
        // Get CPU load and memory
        const [cpuLoad, memData] = await Promise.all([
            si.currentLoad(),
            si.mem()
        ]);
        
        const ramUsedGB = Math.round((memData.used / 1024 / 1024 / 1024) * 10) / 10;
        const ramTotalGB = Math.round((memData.total / 1024 / 1024 / 1024) * 10) / 10;
        const ramPercent = Math.round((memData.used / memData.total) * 100);
        
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
                    gpuName: nvData.name,
                    vramUsedMB: nvData.vramUsedMB,
                    vramTotalMB: nvData.vramTotalMB,
                    vramPercent: nvData.memory,
                    ramUsedGB,
                    ramTotalGB,
                    ramPercent
                };
            }
        }
        
        // Fallback to systeminformation
        const gpuData = await si.graphics();
        const gpu = gpuData.controllers[0];
        
        const vramUsedMB = gpu?.memoryUsed ?? 0;
        const vramTotalMB = gpu?.memoryTotal ?? 0;
        const vramPercent = vramTotalMB > 0 ? Math.round((vramUsedMB / vramTotalMB) * 100) : 0;
        
        return {
            timestamp: Date.now(),
            cpu: Math.round(cpuLoad.currentLoad),
            gpu: gpu?.utilizationGpu ?? 0,
            gpuMemory: vramPercent,
            gpuTemp: gpu?.temperatureGpu ?? 0,
            gpuName: this.gpuName,
            vramUsedMB,
            vramTotalMB,
            vramPercent,
            ramUsedGB,
            ramTotalGB,
            ramPercent
        };
    }

    /**
     * Gets the historical metrics data.
     * @returns An array of MetricsData points.
     */
    getHistory(): MetricsData[] {
        return this.history;
    }

    /**
     * Gets the name of the detected GPU.
     * @returns The GPU name string.
     */
    getGpuName(): string {
        return this.gpuName;
    }
}

/**
 * Singleton instance of the SystemMetricsService.
 */
export const systemMetrics = new SystemMetricsService();
