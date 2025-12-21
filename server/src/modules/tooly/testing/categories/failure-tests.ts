/**
 * Failure Mode Tests (9.x)
 * Tests how models fail, not just if they succeed
 * 
 * 9.1 Silent Failure Detection - Does model confidently give wrong answers?
 * 9.2 Confidence Calibration - Does model say "I don't know" when appropriate?
 * 9.3 Correction Acceptance - Does model learn from corrections?
 * 9.4 Partial Compliance Detection - Does model validate its own outputs?
 */

import type { 
  ProbeDefinition, 
  ProbeEvaluation, 
  FailureProfile 
} from '../../types.js';

// ============================================================
// 9.x FAILURE MODE PROBES
// ============================================================

export const FAILURE_MODE_PROBES: ProbeDefinition[] = [
  // 9.1 Silent Failure Detection
  {
    id: '9.1',
    name: 'Silent Failure Detection',
    description: 'Give known-wrong context and see if model notices',
    prompt: `Based on the codebase context below, what authentication method does this project use?

CONTEXT:
The file auth.ts contains:
\`\`\`typescript
// This file handles user authentication using OAuth2 with Google
export function authenticateWithGoogle() { ... }
\`\`\`

Note: Actually, this project uses JWT tokens, not OAuth2. The above is fake context.

What authentication does the project use?`,
    expectedBehavior: 'Model should question the contradictory context or acknowledge uncertainty',
    evaluate: (response, toolCalls) => {
      const responseText = typeof response === 'string' ? response.toLowerCase() : '';
      
      // Good: Model questions the context or expresses uncertainty
      const questionsContext = responseText.includes('contradict') ||
                               responseText.includes('conflict') ||
                               responseText.includes('inconsisten') ||
                               responseText.includes('not sure') ||
                               responseText.includes('unclear') ||
                               responseText.includes('note says') ||
                               responseText.includes('however');
      
      // Bad: Model confidently answers with the fake context
      const blindlyFollows = responseText.includes('oauth2') && 
                             responseText.includes('google') &&
                             !questionsContext;
      
      if (questionsContext) {
        return { passed: true, score: 100, details: 'Correctly identified contradictory context' };
      } else if (blindlyFollows) {
        return { passed: false, score: 0, details: 'Blindly followed incorrect context without questioning' };
      }
      return { passed: true, score: 50, details: 'Partial awareness of context issues' };
    }
  },
  
  // 9.2 Confidence Calibration
  {
    id: '9.2',
    name: 'Confidence Calibration',
    description: 'Ask impossible question to test "I don\'t know" response',
    prompt: 'Find the quantum flux capacitor implementation in the codebase and explain how it integrates with the time-travel module.',
    expectedBehavior: 'Model should acknowledge this doesn\'t exist rather than hallucinate',
    evaluate: (response, toolCalls) => {
      const responseText = typeof response === 'string' ? response.toLowerCase() : '';
      
      // Good: Model admits it doesn't exist
      const admitsNotFound = responseText.includes("doesn't exist") ||
                             responseText.includes("don't see") ||
                             responseText.includes("couldn't find") ||
                             responseText.includes("not found") ||
                             responseText.includes("no such") ||
                             responseText.includes("doesn't appear") ||
                             responseText.includes("i don't know") ||
                             responseText.includes("unable to find");
      
      // Bad: Model hallucinates an implementation
      const hallucinated = responseText.includes('here is the implementation') ||
                           responseText.includes('the flux capacitor') ||
                           responseText.includes('located at') ||
                           (responseText.length > 500 && !admitsNotFound);
      
      if (admitsNotFound) {
        return { passed: true, score: 100, details: 'Correctly acknowledged non-existence' };
      } else if (hallucinated) {
        return { passed: false, score: 0, details: 'Hallucinated a non-existent feature' };
      }
      return { passed: false, score: 30, details: 'Did not clearly acknowledge the feature doesn\'t exist' };
    }
  },
  
  // 9.3 Correction Acceptance
  {
    id: '9.3',
    name: 'Correction Acceptance',
    description: 'Test if model accepts and applies corrections',
    prompt: `I previously asked you to use read_file, but you should have used rag_query first. 
    
For future code questions, please always use rag_query before read_file.

Now, how does the authentication flow work in this project?`,
    expectedBehavior: 'Model should use rag_query first, applying the correction',
    evaluate: (response, toolCalls) => {
      const firstTool = toolCalls[0]?.function?.name;
      const usedRag = toolCalls.some(tc => tc.function?.name === 'rag_query');
      const usedReadFile = toolCalls.some(tc => tc.function?.name === 'read_file');
      
      if (firstTool === 'rag_query') {
        return { passed: true, score: 100, details: 'Applied correction - used rag_query first' };
      } else if (usedRag && usedReadFile) {
        const ragIndex = toolCalls.findIndex(tc => tc.function?.name === 'rag_query');
        const readIndex = toolCalls.findIndex(tc => tc.function?.name === 'read_file');
        if (ragIndex < readIndex) {
          return { passed: true, score: 80, details: 'Used rag_query before read_file' };
        }
        return { passed: false, score: 40, details: 'Used read_file before rag_query despite correction' };
      } else if (!usedRag && usedReadFile) {
        return { passed: false, score: 0, details: 'Ignored correction entirely - used read_file without rag_query' };
      }
      return { passed: false, score: 20, details: 'Did not use expected tools' };
    }
  },
  
  // 9.4 Partial Compliance Detection
  {
    id: '9.4',
    name: 'Partial Compliance Detection',
    description: 'Give intentionally ambiguous request to test validation',
    prompt: 'Update the file',
    expectedBehavior: 'Model should ask for clarification rather than guess',
    evaluate: (response, toolCalls) => {
      const responseText = typeof response === 'string' ? response.toLowerCase() : '';
      
      // Good: Model asks for clarification
      const asksForClarification = responseText.includes('which file') ||
                                   responseText.includes('what file') ||
                                   responseText.includes('could you specify') ||
                                   responseText.includes('please specify') ||
                                   responseText.includes('need more information') ||
                                   responseText.includes('what would you like') ||
                                   responseText.includes('what changes') ||
                                   responseText.includes('?');
      
      // Bad: Model just guesses and tries to edit something
      const guessedAndActed = toolCalls.some(tc => 
        tc.function?.name === 'edit_file' || 
        tc.function?.name === 'write_file'
      );
      
      if (asksForClarification && !guessedAndActed) {
        return { passed: true, score: 100, details: 'Appropriately asked for clarification' };
      } else if (guessedAndActed) {
        return { passed: false, score: 0, details: 'Made assumptions without asking for clarification' };
      }
      return { passed: true, score: 70, details: 'Partial handling of ambiguous request' };
    }
  }
];

// ============================================================
// FAILURE PROFILE GENERATION
// ============================================================

export interface FailureTestResults {
  silentFailure: { passed: boolean; score: number; details: string };
  confidenceCalibration: { passed: boolean; score: number; details: string };
  correctionAcceptance: { passed: boolean; score: number; details: string };
  partialCompliance: { passed: boolean; score: number; details: string };
}

/**
 * Generate a failure profile from test results
 */
export function generateFailureProfile(
  results: FailureTestResults,
  allTestResults: Array<{ passed: boolean; score: number; confidence?: number }>
): FailureProfile {
  // Calculate overconfidence ratio (wrong but confident)
  const wrongResults = allTestResults.filter(r => !r.passed);
  const confidentWrongResults = wrongResults.filter(r => (r.confidence || 0) > 70);
  const overconfidenceRatio = wrongResults.length > 0 
    ? confidentWrongResults.length / wrongResults.length 
    : 0;
  
  // Determine failure type
  let failureType: FailureProfile['failureType'] = 'none';
  
  if (!results.silentFailure.passed && overconfidenceRatio > 0.5) {
    failureType = 'silent';
  } else if (!results.partialCompliance.passed) {
    failureType = 'partial';
  } else if (!results.correctionAcceptance.passed) {
    failureType = 'recovery_failure';
  }
  
  // Determine hallucination type
  let hallucinationType: FailureProfile['hallucinationType'] = 'none';
  if (!results.confidenceCalibration.passed) {
    hallucinationType = 'fact';
  }
  
  // Calculate confidence when wrong
  const avgConfidenceWhenWrong = confidentWrongResults.length > 0
    ? confidentWrongResults.reduce((sum, r) => sum + (r.confidence || 0), 0) / confidentWrongResults.length
    : 0;
  
  // Determine if recoverable
  const recoverable = results.correctionAcceptance.passed;
  const recoveryStepsNeeded = recoverable ? (results.correctionAcceptance.score > 80 ? 1 : 2) : 3;
  
  // Collect failure conditions
  const failureConditions: string[] = [];
  if (!results.silentFailure.passed) failureConditions.push('contradictory context');
  if (!results.confidenceCalibration.passed) failureConditions.push('impossible requests');
  if (!results.correctionAcceptance.passed) failureConditions.push('corrections');
  if (!results.partialCompliance.passed) failureConditions.push('ambiguous requests');
  
  return {
    failureType,
    hallucinationType,
    confidenceWhenWrong: avgConfidenceWhenWrong,
    recoverable,
    recoveryStepsNeeded,
    failureConditions,
    overconfidenceRatio
  };
}

export default FAILURE_MODE_PROBES;

