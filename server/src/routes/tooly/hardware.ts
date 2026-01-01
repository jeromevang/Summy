import { Router } from 'express';
import { systemMetrics } from '../../services/system-metrics.js';

const router = Router();

/**
 * GET /api/tooly/optimal-setup/hardware
 * Get system hardware information for readiness assessment
 */
router.get('/optimal-setup/hardware', async (req, res) => {
  try {
    const metrics = await systemMetrics.collectMetrics();
    
    // Format response to match what frontend expects (HardwareProfile)
    const hardwareProfile = {
      gpuName: metrics.gpuName,
      vramGB: Math.round((metrics.vramTotalMB || 0) / 1024 * 10) / 10,
      ramGB: metrics.ramTotalGB,
      cpuCores: 0, // systemMetrics doesn't expose cores count in collectMetrics yet, would need update or separate call
      recommendedQuantization: 'Unknown', // Logic for this can be added
      maxModelSize7B: 'Q4_K_M', // Placeholder logic
      maxModelSize13B: 'Q4_K_M' // Placeholder logic
    };

    // basic heuristics for quantization recommendation
    if (hardwareProfile.vramGB >= 24) {
      hardwareProfile.recommendedQuantization = 'Q8_0 (Lossless)';
      hardwareProfile.maxModelSize7B = 'Q8_0';
      hardwareProfile.maxModelSize13B = 'Q8_0';
    } else if (hardwareProfile.vramGB >= 16) {
      hardwareProfile.recommendedQuantization = 'Q6_K (High)';
      hardwareProfile.maxModelSize7B = 'Q8_0';
      hardwareProfile.maxModelSize13B = 'Q6_K';
    } else if (hardwareProfile.vramGB >= 8) {
      hardwareProfile.recommendedQuantization = 'Q4_K_M (Balanced)';
      hardwareProfile.maxModelSize7B = 'Q6_K';
      hardwareProfile.maxModelSize13B = 'Q4_K_S';
    } else {
      hardwareProfile.recommendedQuantization = 'Q3_K_M (Low)';
      hardwareProfile.maxModelSize7B = 'Q4_K_S';
      hardwareProfile.maxModelSize13B = 'Q3_K_S';
    }

    res.json(hardwareProfile);
  } catch (error: any) {
    console.error('[Tooly] Failed to get hardware info:', error);
    res.status(500).json({ error: error.message });
  }
});

export const hardwareRouter = router;
