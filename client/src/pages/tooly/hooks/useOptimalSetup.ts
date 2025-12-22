/**
 * useOptimalSetup Hook
 * Manages optimal setup wizard state and API calls
 */

import { useState, useCallback } from 'react';

// ============================================================
// TYPES
// ============================================================

export interface GPUInfo {
  name: string;
  vramMB: number;
  vramFreeMB: number;
  driver: string;
}

export interface HardwareProfile {
  gpus: GPUInfo[];
  primaryGpu: GPUInfo | null;
  system: {
    cpuModel: string;
    cpuCores: number;
    ramTotalGB: number;
    ramFreeGB: number;
    platform: string;
  };
  totalVramGB: number;
  availableVramGB: number;
}

export interface ScannedModel {
  id: string;
  displayName: string;
  parameters?: string;
  quantization?: string;
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
}

export interface OptimalPair {
  main: ScannedModel;
  executor: ScannedModel;
}

export interface OptimalPairResult {
  pair: OptimalPair | null;
  alternatives: OptimalPair[];
}

export interface RecommendedSizes {
  max: string;
  recommended: string[];
  canFitTwo: boolean;
}

export type WizardStep = 'hardware' | 'scan' | 'test' | 'results';

// ============================================================
// HOOK
// ============================================================

export function useOptimalSetup() {
  const [step, setStep] = useState<WizardStep>('hardware');
  const [hardware, setHardware] = useState<HardwareProfile | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [pairResult, setPairResult] = useState<OptimalPairResult | null>(null);
  const [recommendations, setRecommendations] = useState<RecommendedSizes | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  /**
   * Detect hardware
   */
  const detectHardware = useCallback(async (): Promise<HardwareProfile | null> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/tooly/optimal-setup/hardware');
      if (!response.ok) throw new Error('Failed to detect hardware');
      
      const data = await response.json();
      setHardware(data);
      return data;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  /**
   * Scan for available models
   */
  const scanModels = useCallback(async (): Promise<ScanResult | null> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/tooly/optimal-setup/scan', { method: 'POST' });
      if (!response.ok) throw new Error('Failed to scan models');
      
      const data = await response.json();
      setScanResult(data);
      return data;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  /**
   * Find optimal model pairing
   */
  const findOptimalPair = useCallback(async (): Promise<OptimalPairResult | null> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/tooly/optimal-setup/find-pair', { method: 'POST' });
      if (!response.ok) throw new Error('Failed to find optimal pair');
      
      const data = await response.json();
      setPairResult(data);
      return data;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  /**
   * Get setup status with recommendations
   */
  const getStatus = useCallback(async (): Promise<{ hardware: any; recommendations: RecommendedSizes } | null> => {
    try {
      const response = await fetch('/api/tooly/optimal-setup/status');
      if (!response.ok) throw new Error('Failed to get status');
      
      const data = await response.json();
      setRecommendations(data.recommendations);
      return data;
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  }, []);
  
  /**
   * Apply a model pairing
   */
  const applyPairing = useCallback(async (pair: OptimalPair): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Set main model
      const mainResponse = await fetch('/api/tooly/active-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId: pair.main.id, role: 'main' })
      });
      
      if (!mainResponse.ok) throw new Error('Failed to set main model');
      
      // Set executor model
      const execResponse = await fetch('/api/tooly/active-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId: pair.executor.id, role: 'executor' })
      });
      
      if (!execResponse.ok) throw new Error('Failed to set executor model');
      
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  /**
   * Run the full wizard flow
   */
  const runWizard = useCallback(async (): Promise<OptimalPairResult | null> => {
    // Step 1: Detect hardware
    setStep('hardware');
    const hw = await detectHardware();
    if (!hw) return null;
    
    // Step 2: Scan models
    setStep('scan');
    const scan = await scanModels();
    if (!scan || scan.runnableCount < 2) {
      setError('Need at least 2 runnable models for pairing');
      return null;
    }
    
    // Step 3: Find optimal pair
    setStep('results');
    const pair = await findOptimalPair();
    return pair;
  }, [detectHardware, scanModels, findOptimalPair]);
  
  /**
   * Reset wizard state
   */
  const reset = useCallback(() => {
    setStep('hardware');
    setHardware(null);
    setScanResult(null);
    setPairResult(null);
    setRecommendations(null);
    setError(null);
  }, []);
  
  return {
    // State
    step,
    hardware,
    scanResult,
    pairResult,
    recommendations,
    isLoading,
    error,
    
    // Computed
    optimalPair: pairResult?.pair || null,
    alternatives: pairResult?.alternatives || [],
    canRunTwoModels: recommendations?.canFitTwo ?? false,
    
    // Actions
    setStep,
    detectHardware,
    scanModels,
    findOptimalPair,
    getStatus,
    applyPairing,
    runWizard,
    reset,
    
    // Clear error
    clearError: useCallback(() => setError(null), [])
  };
}

export default useOptimalSetup;

