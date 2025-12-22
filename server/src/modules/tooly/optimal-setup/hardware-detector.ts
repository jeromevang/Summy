/**
 * Hardware Detector
 * GPU and system hardware detection for optimal model configuration
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';

const execAsync = promisify(exec);

// ============================================================
// TYPES
// ============================================================

export interface GPUInfo {
  name: string;
  vramMB: number;
  vramUsedMB: number;
  vramFreeMB: number;
  driver: string;
  cudaVersion?: string;
  temperature?: number;
  utilization?: number;
}

export interface SystemInfo {
  cpuModel: string;
  cpuCores: number;
  cpuThreads: number;
  ramTotalGB: number;
  ramFreeGB: number;
  platform: string;
  arch: string;
}

export interface HardwareProfile {
  gpus: GPUInfo[];
  primaryGpu: GPUInfo | null;
  system: SystemInfo;
  totalVramGB: number;
  availableVramGB: number;
  canRunModel: (vramRequiredGB: number) => boolean;
}

// ============================================================
// GPU DETECTION
// ============================================================

/**
 * Detect NVIDIA GPUs using nvidia-smi
 */
async function detectNvidiaGPUs(): Promise<GPUInfo[]> {
  try {
    // Query nvidia-smi for GPU info
    const { stdout } = await execAsync(
      'nvidia-smi --query-gpu=name,memory.total,memory.used,memory.free,driver_version,temperature.gpu,utilization.gpu --format=csv,noheader,nounits',
      { timeout: 5000 }
    );
    
    const gpus: GPUInfo[] = [];
    const lines = stdout.trim().split('\n');
    
    for (const line of lines) {
      const parts = line.split(',').map(p => p.trim());
      if (parts.length >= 5) {
        gpus.push({
          name: parts[0],
          vramMB: parseInt(parts[1]) || 0,
          vramUsedMB: parseInt(parts[2]) || 0,
          vramFreeMB: parseInt(parts[3]) || 0,
          driver: parts[4],
          temperature: parseInt(parts[5]) || undefined,
          utilization: parseInt(parts[6]) || undefined
        });
      }
    }
    
    // Try to get CUDA version
    try {
      const { stdout: cudaOut } = await execAsync('nvcc --version', { timeout: 3000 });
      const cudaMatch = cudaOut.match(/release (\d+\.\d+)/);
      if (cudaMatch && gpus.length > 0) {
        gpus.forEach(gpu => gpu.cudaVersion = cudaMatch[1]);
      }
    } catch {
      // CUDA toolkit not installed, that's okay
    }
    
    return gpus;
  } catch (error) {
    console.log('[HardwareDetector] nvidia-smi not available or failed');
    return [];
  }
}

/**
 * Detect AMD GPUs using rocm-smi (Linux) or fallback
 */
async function detectAMDGPUs(): Promise<GPUInfo[]> {
  try {
    const { stdout } = await execAsync(
      'rocm-smi --showmeminfo vram --csv',
      { timeout: 5000 }
    );
    
    // Parse rocm-smi output
    const gpus: GPUInfo[] = [];
    const lines = stdout.trim().split('\n').slice(1); // Skip header
    
    for (const line of lines) {
      const parts = line.split(',');
      if (parts.length >= 3) {
        const total = parseInt(parts[1]) || 0;
        const used = parseInt(parts[2]) || 0;
        gpus.push({
          name: `AMD GPU ${gpus.length}`,
          vramMB: Math.round(total / 1024 / 1024),
          vramUsedMB: Math.round(used / 1024 / 1024),
          vramFreeMB: Math.round((total - used) / 1024 / 1024),
          driver: 'ROCm'
        });
      }
    }
    
    return gpus;
  } catch {
    return [];
  }
}

/**
 * Detect Apple Silicon Metal GPUs
 */
async function detectAppleGPUs(): Promise<GPUInfo[]> {
  if (process.platform !== 'darwin') return [];
  
  try {
    const { stdout } = await execAsync(
      'system_profiler SPDisplaysDataType -json',
      { timeout: 5000 }
    );
    
    const data = JSON.parse(stdout);
    const displays = data.SPDisplaysDataType || [];
    const gpus: GPUInfo[] = [];
    
    for (const display of displays) {
      const vramStr = display.sppci_vram || display.spdisplays_vram || '0';
      const vramMB = parseInt(vramStr) || 0;
      
      gpus.push({
        name: display.sppci_model || 'Apple GPU',
        vramMB: vramMB,
        vramUsedMB: 0, // Not easily available on macOS
        vramFreeMB: vramMB,
        driver: 'Metal'
      });
    }
    
    return gpus;
  } catch {
    return [];
  }
}

// ============================================================
// SYSTEM INFO
// ============================================================

/**
 * Get system information
 */
function getSystemInfo(): SystemInfo {
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  
  return {
    cpuModel: cpus[0]?.model || 'Unknown CPU',
    cpuCores: cpus.length,
    cpuThreads: cpus.length, // In Node.js, os.cpus() returns logical processors
    ramTotalGB: Math.round(totalMem / 1024 / 1024 / 1024 * 10) / 10,
    ramFreeGB: Math.round(freeMem / 1024 / 1024 / 1024 * 10) / 10,
    platform: os.platform(),
    arch: os.arch()
  };
}

// ============================================================
// HARDWARE DETECTOR CLASS
// ============================================================

export class HardwareDetector {
  private cachedProfile: HardwareProfile | null = null;
  private cacheTime: number = 0;
  private cacheTTL: number = 60000; // 1 minute cache
  
  /**
   * Detect all hardware
   */
  async detect(forceRefresh: boolean = false): Promise<HardwareProfile> {
    // Return cached if still valid
    if (!forceRefresh && this.cachedProfile && Date.now() - this.cacheTime < this.cacheTTL) {
      return this.cachedProfile;
    }
    
    // Detect GPUs from all sources
    const [nvidiaGPUs, amdGPUs, appleGPUs] = await Promise.all([
      detectNvidiaGPUs(),
      detectAMDGPUs(),
      detectAppleGPUs()
    ]);
    
    const allGPUs = [...nvidiaGPUs, ...amdGPUs, ...appleGPUs];
    
    // Get system info
    const system = getSystemInfo();
    
    // Calculate totals
    const totalVramMB = allGPUs.reduce((sum, gpu) => sum + gpu.vramMB, 0);
    const availableVramMB = allGPUs.reduce((sum, gpu) => sum + gpu.vramFreeMB, 0);
    
    // Find primary GPU (largest VRAM)
    const primaryGpu = allGPUs.length > 0 
      ? allGPUs.reduce((best, gpu) => gpu.vramMB > best.vramMB ? gpu : best)
      : null;
    
    const profile: HardwareProfile = {
      gpus: allGPUs,
      primaryGpu,
      system,
      totalVramGB: Math.round(totalVramMB / 1024 * 10) / 10,
      availableVramGB: Math.round(availableVramMB / 1024 * 10) / 10,
      canRunModel: (vramRequiredGB: number) => {
        // Add some buffer (1GB) for overhead
        return availableVramMB >= (vramRequiredGB + 1) * 1024;
      }
    };
    
    this.cachedProfile = profile;
    this.cacheTime = Date.now();
    
    return profile;
  }
  
  /**
   * Quick check if any GPU is available
   */
  async hasGPU(): Promise<boolean> {
    const profile = await this.detect();
    return profile.gpus.length > 0;
  }
  
  /**
   * Get available VRAM in GB
   */
  async getAvailableVRAM(): Promise<number> {
    const profile = await this.detect();
    return profile.availableVramGB;
  }
  
  /**
   * Check if a model can run based on VRAM requirements
   */
  async canRunModel(vramRequiredGB: number): Promise<boolean> {
    const profile = await this.detect();
    return profile.canRunModel(vramRequiredGB);
  }
  
  /**
   * Get recommended model sizes based on available VRAM
   */
  async getRecommendedModelSizes(): Promise<{
    max: string;
    recommended: string[];
    canFitTwo: boolean;
  }> {
    const vram = await this.getAvailableVRAM();
    
    // Rough estimates for model sizes (Q4 quantization)
    const sizes = [
      { name: '70B', vram: 35 },
      { name: '34B', vram: 18 },
      { name: '32B', vram: 16 },
      { name: '27B', vram: 14 },
      { name: '14B', vram: 8 },
      { name: '13B', vram: 7 },
      { name: '7B', vram: 4 },
      { name: '3B', vram: 2 },
      { name: '1.5B', vram: 1 }
    ];
    
    const max = sizes.find(s => vram >= s.vram)?.name || '< 1.5B';
    const recommended = sizes.filter(s => vram >= s.vram * 1.2).map(s => s.name);
    
    // Can we fit two models for Main + Executor?
    const canFitTwo = sizes.filter(s => vram >= s.vram * 2.5).length > 0;
    
    return { max, recommended, canFitTwo };
  }
}

export const hardwareDetector = new HardwareDetector();
export default hardwareDetector;

