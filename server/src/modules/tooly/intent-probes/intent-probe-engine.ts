import { IntentProbeResult } from './types.js';
import { INTENT_PROBES, calculateIntentScores } from './probe-data.js';

export { calculateIntentScores };

export async function runIntentProbes(
  executeChat: (prompt: string) => Promise<{ response: any; toolCalls: any[] }>
): Promise<{
  results: IntentProbeResult[];
  scores: any;
}> {
  const results: IntentProbeResult[] = [];
  for (const probe of INTENT_PROBES) {
    try {
      const { response, toolCalls } = await executeChat(probe.prompt);
      results.push(probe.evaluateIntent(response, toolCalls));
    } catch (error: any) {
              results.push({ id: probe.id, name: probe.name, invoked: false, invokedCorrectly: false, actionCorrect: false, score: 0, details: `Error: ${error.message}`, toolsInvoked: [], expectedTools: probe.expectedTools || [] });    }
  }
  return { results, scores: calculateIntentScores(results) };
}
