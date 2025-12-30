import { IntentProbeDefinition, IntentProbeResult } from './types.js';

export const INTENT_PROBES: IntentProbeDefinition[] = [
  {
    id: '8.1a',
    name: 'Implicit RAG - Question',
    description: 'Natural question that should trigger RAG without mentioning it',
    prompt: 'How does the login work?',
    explicitness: 'implicit',
    shouldInvoke: true,
    expectedTools: ['rag_query'],
    acceptableTools: ['read_file', 'search_files'],
    evaluateIntent: (response, toolCalls) => {
      const toolsInvoked = toolCalls.map(tc => tc.function?.name);
      const usedRag = toolsInvoked.includes('rag_query');
      const usedAnySearch = toolsInvoked.some(t => ['rag_query', 'search_files', 'read_file'].includes(t));
      return {
        id: '8.1a',
        name: 'Implicit RAG - Question',
        invoked: toolCalls.length > 0,
        invokedCorrectly: usedRag,
        actionCorrect: usedAnySearch,
        score: usedRag ? 100 : (usedAnySearch ? 70 : 0),
        details: usedRag ? 'Correctly invoked RAG' : (usedAnySearch ? 'Used search but not RAG' : 'Did not search'),
        toolsInvoked,
        expectedTools: ['rag_query'],
      };
    },
  },
  {
    id: '8.3a',
    name: 'Knowledge Question - No Tools',
    description: 'General knowledge should not require tools',
    prompt: 'What is dependency injection?',
    explicitness: 'neutral',
    shouldInvoke: false,
    expectedTools: [],
    evaluateIntent: (response, toolCalls) => {
      const noTools = toolCalls.length === 0;
      return {
        id: '8.3a',
        name: 'Knowledge Question - No Tools',
        invoked: !noTools,
        invokedCorrectly: noTools,
        actionCorrect: noTools,
        score: noTools ? 100 : 0,
        details: noTools ? 'Correctly answered without tools' : 'Unnecessarily invoked tools',
        toolsInvoked: toolCalls.map(tc => tc.function?.name),
        expectedTools: [],
      };
    },
  }
  // Simplified for brevity in this example, would include all 8.x probes
];

export function calculateIntentScores(results: IntentProbeResult[]) {
  if (results.length === 0) return { invokeCorrectness: 0, toolSelectionAccuracy: 0, actionCorrectness: 0, overInvocationRate: 0, underInvocationRate: 0, overallIntentScore: 0 };
  const correctInvocations = results.filter(r => (r.expectedTools.length > 0) ? r.invoked : !r.invoked).length;
  const invokeCorrectness = (correctInvocations / results.length) * 100;
  const invokedResults = results.filter(r => r.invoked);
  const toolSelectionAccuracy = invokedResults.length > 0 ? (invokedResults.filter(r => r.invokedCorrectly).length / invokedResults.length) * 100 : 100;
  const actionCorrectness = (results.filter(r => r.actionCorrect).length / results.length) * 100;
  return {
    invokeCorrectness: Math.round(invokeCorrectness),
    toolSelectionAccuracy: Math.round(toolSelectionAccuracy),
    actionCorrectness: Math.round(actionCorrectness),
    overallIntentScore: Math.round(invokeCorrectness * 0.4 + toolSelectionAccuracy * 0.3 + actionCorrectness * 0.3)
  };
}
