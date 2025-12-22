/**
 * Model Scanner
 * Scans LM Studio for available models and ranks them
 */

import axios from 'axios';
import { hardwareDetector } from './hardware-detector.js';

// ============================================================
// TYPES
// ============================================================

export interface ScannedModel {
  id: string;
  path: string;
  name: string;
  displayName: string;
  author?: string;
  architecture?: string;
  parameters?: string;
  quantization?: string;
  contextLength?: number;
  estimatedVramGB: number;
  canRun: boolean;
  loadedNow: boolean;
  testedBefore: boolean;
  lastScore?: number;
}

export interface ScanResult {
  models: ScannedModel[];
  totalCount: number;
  runnableCount: number;
  loadedCount: number;
  availableVramGB: number;
  scanTime: number;
  lmstudioUrl: string;
}

export interface ModelRanking {
  modelId: string;
  rank: number;
  reason: string;
  estimatedScore: number;
  suggestedRole: 'main' | 'executor' | 'both' | 'unknown';
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Parse model ID to extract info
 */
function parseModelId(modelId: string): {
  author?: string;
  name: string;
  parameters?: string;
  quantization?: string;
} {
  // Common patterns: author/model-name-size-quant
  const parts = modelId.split('/');
  const author = parts.length > 1 ? parts[0] : undefined;
  const fullName = parts[parts.length - 1];
  
  // Extract size (7b, 13b, 32b, etc.)
  const sizeMatch = fullName.match(/(\d+\.?\d*)[bB]/);
  const parameters = sizeMatch ? `${sizeMatch[1]}B` : undefined;
  
  // Extract quantization (Q4_K_M, Q5_0, etc.)
  const quantMatch = fullName.match(/Q\d+[_A-Z]*/i);
  const quantization = quantMatch ? quantMatch[0].toUpperCase() : undefined;
  
  // Clean name
  let name = fullName
    .replace(/\.\w+$/, '') // Remove file extension
    .replace(/-Q\d+.*$/i, '') // Remove quant suffix
    .replace(/-\d+\.?\d*[bB]/, ''); // Remove size suffix
  
  return { author, name, parameters, quantization };
}

/**
 * Estimate VRAM requirement for a model
 */
function estimateVram(modelId: string): number {
  const parsed = parseModelId(modelId);
  const lowerModel = modelId.toLowerCase();
  
  // Get base size
  let sizeGB = 7; // Default
  if (parsed.parameters) {
    const sizeNum = parseFloat(parsed.parameters);
    sizeGB = sizeNum;
  }
  
  // Quantization multiplier
  let quantMult = 1.0;
  if (lowerModel.includes('q4') || lowerModel.includes('gguf')) quantMult = 0.5;
  else if (lowerModel.includes('q5')) quantMult = 0.6;
  else if (lowerModel.includes('q6')) quantMult = 0.7;
  else if (lowerModel.includes('q8')) quantMult = 0.9;
  else if (lowerModel.includes('fp16')) quantMult = 1.0;
  
  // Rough estimate: ~1GB per 1B params for base, then multiply by quant
  return Math.round(sizeGB * quantMult * 10) / 10;
}

/**
 * Create display name from model ID
 */
function createDisplayName(modelId: string): string {
  const parsed = parseModelId(modelId);
  let display = parsed.name;
  
  if (parsed.parameters) {
    display += ` ${parsed.parameters}`;
  }
  if (parsed.quantization) {
    display += ` ${parsed.quantization}`;
  }
  
  return display;
}

// ============================================================
// MODEL SCANNER CLASS
// ============================================================

export class ModelScanner {
  private lmstudioUrl: string;
  private cachedModels: Map<string, ScannedModel> = new Map();
  private lastScanTime: number = 0;
  
  constructor(lmstudioUrl: string = 'http://localhost:1234') {
    this.lmstudioUrl = lmstudioUrl;
  }
  
  /**
   * Set LM Studio URL
   */
  setUrl(url: string): void {
    this.lmstudioUrl = url;
  }
  
  /**
   * Scan for available models
   */
  async scan(): Promise<ScanResult> {
    const startTime = Date.now();
    const models: ScannedModel[] = [];
    
    // Get hardware profile for VRAM check
    const hardware = await hardwareDetector.detect();
    const availableVramGB = hardware.availableVramGB;
    
    // Get currently loaded models
    let loadedModels: string[] = [];
    try {
      const loadedResponse = await axios.get(`${this.lmstudioUrl}/api/v0/models/running`, {
        timeout: 5000
      });
      loadedModels = loadedResponse.data.data?.map((m: any) => m.id) || [];
    } catch {
      // May not be supported
    }
    
    // Get available models
    try {
      const response = await axios.get(`${this.lmstudioUrl}/api/v0/models`, {
        timeout: 10000
      });
      
      const modelList = response.data.data || [];
      
      for (const model of modelList) {
        const modelId = model.id;
        const parsed = parseModelId(modelId);
        const estimatedVramGB = estimateVram(modelId);
        
        const scannedModel: ScannedModel = {
          id: modelId,
          path: model.path || modelId,
          name: parsed.name,
          displayName: createDisplayName(modelId),
          author: parsed.author,
          architecture: model.architecture,
          parameters: parsed.parameters,
          quantization: parsed.quantization,
          contextLength: model.context_length,
          estimatedVramGB,
          canRun: estimatedVramGB <= availableVramGB,
          loadedNow: loadedModels.includes(modelId),
          testedBefore: this.cachedModels.has(modelId) && 
                        this.cachedModels.get(modelId)!.lastScore !== undefined,
          lastScore: this.cachedModels.get(modelId)?.lastScore
        };
        
        models.push(scannedModel);
        this.cachedModels.set(modelId, scannedModel);
      }
    } catch (error: any) {
      console.error('[ModelScanner] Failed to scan models:', error.message);
    }
    
    this.lastScanTime = Date.now();
    
    return {
      models,
      totalCount: models.length,
      runnableCount: models.filter(m => m.canRun).length,
      loadedCount: models.filter(m => m.loadedNow).length,
      availableVramGB,
      scanTime: Date.now() - startTime,
      lmstudioUrl: this.lmstudioUrl
    };
  }
  
  /**
   * Update model score after testing
   */
  updateScore(modelId: string, score: number): void {
    const model = this.cachedModels.get(modelId);
    if (model) {
      model.lastScore = score;
      model.testedBefore = true;
      this.cachedModels.set(modelId, model);
    }
  }
  
  /**
   * Get cached model info
   */
  getModel(modelId: string): ScannedModel | undefined {
    return this.cachedModels.get(modelId);
  }
  
  /**
   * Rank models for a specific role
   */
  async rankModels(
    role: 'main' | 'executor',
    testedOnly: boolean = false
  ): Promise<ModelRanking[]> {
    const scanResult = await this.scan();
    
    let models = scanResult.models.filter(m => m.canRun);
    if (testedOnly) {
      models = models.filter(m => m.testedBefore);
    }
    
    const rankings: ModelRanking[] = [];
    
    for (const model of models) {
      let estimatedScore = model.lastScore || 50;
      let reason = '';
      
      // Adjust based on role
      if (role === 'main') {
        // Main models: prefer larger, smarter models
        const sizeNum = parseFloat(model.parameters || '7');
        if (sizeNum >= 30) {
          estimatedScore += 10;
          reason += 'Large model suitable for reasoning. ';
        } else if (sizeNum <= 7) {
          estimatedScore -= 10;
          reason += 'Small model may lack reasoning depth. ';
        }
      } else {
        // Executor models: prefer fast, smaller models
        const sizeNum = parseFloat(model.parameters || '7');
        if (sizeNum <= 14) {
          estimatedScore += 10;
          reason += 'Smaller model good for fast execution. ';
        } else if (sizeNum >= 30) {
          estimatedScore -= 5;
          reason += 'Large model may be slower for execution. ';
        }
      }
      
      // Bonus for already tested
      if (model.testedBefore) {
        reason += 'Previously tested. ';
      }
      
      // Bonus for currently loaded
      if (model.loadedNow) {
        estimatedScore += 5;
        reason += 'Currently loaded. ';
      }
      
      rankings.push({
        modelId: model.id,
        rank: 0, // Will set after sorting
        reason: reason.trim(),
        estimatedScore: Math.min(100, Math.max(0, estimatedScore)),
        suggestedRole: role
      });
    }
    
    // Sort by score and assign ranks
    rankings.sort((a, b) => b.estimatedScore - a.estimatedScore);
    rankings.forEach((r, i) => r.rank = i + 1);
    
    return rankings;
  }
  
  /**
   * Find optimal model pairs for Main + Executor
   */
  async findOptimalPairs(): Promise<{
    pair: { main: ScannedModel; executor: ScannedModel } | null;
    alternatives: { main: ScannedModel; executor: ScannedModel }[];
  }> {
    const hardware = await hardwareDetector.detect();
    const availableVram = hardware.availableVramGB;
    const scanResult = await this.scan();
    
    const runnableModels = scanResult.models.filter(m => m.canRun);
    
    // Find pairs that fit in VRAM together
    const validPairs: { main: ScannedModel; executor: ScannedModel; totalVram: number; score: number }[] = [];
    
    for (const main of runnableModels) {
      for (const executor of runnableModels) {
        if (main.id === executor.id) continue;
        
        const totalVram = main.estimatedVramGB + executor.estimatedVramGB;
        if (totalVram > availableVram * 0.9) continue; // Leave 10% buffer
        
        // Score the pair
        const mainSize = parseFloat(main.parameters || '7');
        const execSize = parseFloat(executor.parameters || '7');
        
        // Main should be larger for reasoning
        // Executor should be smaller for speed
        let pairScore = (main.lastScore || 50) + (executor.lastScore || 50);
        if (mainSize > execSize) pairScore += 10;
        if (mainSize >= 14 && execSize <= 14) pairScore += 10;
        
        validPairs.push({ main, executor, totalVram, score: pairScore });
      }
    }
    
    // Sort by score
    validPairs.sort((a, b) => b.score - a.score);
    
    return {
      pair: validPairs[0] ? { main: validPairs[0].main, executor: validPairs[0].executor } : null,
      alternatives: validPairs.slice(1, 4).map(p => ({ main: p.main, executor: p.executor }))
    };
  }
}

export const modelScanner = new ModelScanner();
export default modelScanner;

