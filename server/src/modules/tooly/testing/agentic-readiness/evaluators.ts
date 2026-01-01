import { ProbeEvaluation } from '../../types.js';

export function evaluateInstructionFollowing(_response: any, toolCalls: any[]): ProbeEvaluation {
  const called = toolCalls.some(tc => (tc.function?.name || tc.name) === 'list_directory');
  if (called) return { passed: true, score: 1.0, details: 'Followed instructions' };
  return { passed: false, score: 0, details: 'Failed to follow instructions' };
}

export function evaluateContextCoherence(_response: any, toolCalls: any[]): ProbeEvaluation {
  const usedVerification = toolCalls.some(tc => ['list_directory', 'rag_query', 'search_files'].includes(tc.function?.name || tc.name));
  return { passed: usedVerification, score: usedVerification ? 1 : 0, details: usedVerification ? 'Coherent' : 'Hallucinated' };
}

export function evaluateBasicReasoning(response: any, _toolCalls: any[]): ProbeEvaluation {
  const text = typeof response === 'string' ? response : '';
  const hasSteps = /step|first|then|next/i.test(text);
  return { passed: hasSteps, score: hasSteps ? 1 : 0, details: hasSteps ? 'Reasoned' : 'No steps' };
}
// ... Add all other evaluators from the file