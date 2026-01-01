import { ProbeTestResult } from './types.js';
import { PROBE_CATEGORIES } from './probe-categories.js';

export async function runProbeCategory(
  categoryId: string,
  executeChat: (prompt: string) => Promise<{ response: any; toolCalls: any[] }>,
  onProgress?: (probeName: string, probeIndex: number, totalProbes: number, score?: number) => void
): Promise<ProbeTestResult[]> {
  const category = PROBE_CATEGORIES.find(c => c.id === categoryId);
      if (!category) throw new Error(`Unknown probe category: ${categoryId}`);
  const results: ProbeTestResult[] = [];
  const totalProbes = category.probes.length;

  for (let i = 0; i < category.probes.length; i++) {
    const probe = category.probes[i];
    if (!probe) continue;
    const startTime = Date.now();
          if (onProgress) onProgress(`${category.icon} ${probe.name}`, i, totalProbes);    
    try {
      const { response, toolCalls } = await executeChat(probe.prompt);
      const evaluation = probe.evaluate(response, toolCalls);
      results.push({ id: probe.id, name: probe.name, category: categoryId, passed: evaluation.passed, score: evaluation.score, latency: Date.now() - startTime, details: evaluation.details, expectedBehavior: probe.expectedBehavior });
    } catch (error: any) {
              results.push({ id: probe.id, name: probe.name, category: categoryId, passed: false, score: 0, latency: Date.now() - startTime, details: `Error: ${error.message}`, expectedBehavior: probe.expectedBehavior });    }
  }
  return results;
}
