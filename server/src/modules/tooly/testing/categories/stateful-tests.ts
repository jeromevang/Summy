/**
 * Stateful Degradation Tests (10.x)
 * Tests behavior over long conversations and multiple turns
 * 
 * 10.1 Instruction Decay - Rule given at turn 1, tested at turn 10/25/50
 * 10.2 Schema Erosion - Tool schema shown early, used correctly late?
 * 10.3 RAG Rule Persistence - "Use rag_query first" still followed after 20 turns?
 * 10.4 Role Stability - Does model maintain its role over time?
 * 10.5 Context Drift - Is task context maintained across long sessions?
 */

import type { 
  ProbeDefinition,
  StatefulTestConfig,
  StatefulTestResult
} from '../../types.js';

// ============================================================
// STATEFUL TEST CONFIGURATIONS
// ============================================================

export const STATEFUL_TEST_CONFIGS: Record<string, StatefulTestConfig> = {
  instructionDecay: {
    turns: 50,
    totalTurns: 50,
    instructionTurn: 1,
    testTurns: [5, 10, 25, 50],
    testType: 'instruction_decay',
    complexity: 'medium'
  },
  schemaErosion: {
    turns: 30,
    totalTurns: 30,
    instructionTurn: 1,
    testTurns: [10, 20, 30],
    testType: 'schema_erosion',
    complexity: 'medium'
  },
  contextDrift: {
    turns: 25,
    totalTurns: 25,
    instructionTurn: 1,
    testTurns: [10, 15, 25],
    testType: 'context_drift',
    complexity: 'medium'
  },
  roleStability: {
    turns: 20,
    totalTurns: 20,
    instructionTurn: 1,
    testTurns: [5, 10, 20],
    testType: 'role_stability',
    complexity: 'medium'
  }
};

// ============================================================
// FILLER MESSAGES FOR MULTI-TURN TESTING
// ============================================================

export const FILLER_MESSAGES = [
  "What's the weather like today?",
  "Tell me a joke about programming.",
  "What's 2 + 2?",
  "Summarize what we've discussed.",
  "What time is it?",
  "How are you doing?",
  "What's your favorite programming language?",
  "Can you explain what an API is?",
  "What's the difference between HTTP and HTTPS?",
  "How do databases work?",
  "What is machine learning?",
  "Explain cloud computing briefly.",
  "What's the best way to learn coding?",
  "What are design patterns?",
  "Explain microservices architecture.",
  "What is Docker?",
  "How does Git branching work?",
  "What is CI/CD?",
  "Explain REST vs GraphQL.",
  "What is serverless computing?"
];

// ============================================================
// 10.x STATEFUL PROBES
// ============================================================

export const STATEFUL_PROBES: ProbeDefinition[] = [
  // 10.1 Instruction Decay
  {
    id: '10.1',
    name: 'Instruction Decay',
    description: 'Rule given at turn 1, tested at turn 10/25/50',
    category: '10.x',
    prompt: 'INSTRUCTION AT TURN 1: From now on, always end your responses with "---END---".\n\nNow, what is a function in programming?',
    expectedBehavior: 'Response should end with "---END---" even after many intervening turns',
    evaluate: (response, _toolCalls) => {
      const responseText = typeof response === 'string' ? response.trim() : '';
      
      if (responseText.endsWith('---END---')) {
        return { passed: true, score: 100, details: 'Instruction still followed' };
      } else if (responseText.toLowerCase().includes('end')) {
        return { passed: true, score: 50, details: 'Partial compliance' };
      }
      return { passed: false, score: 0, details: 'Instruction forgotten' };
    }
  },
  
  // 10.2 Schema Erosion
  {
    id: '10.2',
    name: 'Schema Erosion',
    description: 'Tool schema shown early, used correctly late',
    category: '10.x',
    prompt: 'Use the custom_analyze tool with parameters: { "target": "main.ts", "depth": 3 }',
    expectedBehavior: 'Model should remember and correctly use custom tool schema from earlier in conversation',
    evaluate: (response, _toolCalls) => {
      const customCall = _toolCalls.find(tc => tc.function?.name === 'custom_analyze');
      
      if (customCall) {
        const args = customCall.function?.arguments || {};
        if (args.target === 'main.ts' && args.depth === 3) {
          return { passed: true, score: 100, details: 'Schema remembered correctly' };
        } else if (args.target || args.depth) {
          return { passed: true, score: 60, details: 'Schema partially remembered' };
        }
      }
      
      // Check if model at least tried
      const responseText = typeof response === 'string' ? response.toLowerCase() : '';
      if (responseText.includes('custom_analyze')) {
        return { passed: true, score: 40, details: 'Mentioned tool but did not call correctly' };
      }
      
      return { passed: false, score: 0, details: 'Schema forgotten' };
    }
  },
  
  // 10.3 RAG Rule Persistence
  {
    id: '10.3',
    name: 'RAG Rule Persistence',
    description: '"Use rag_query first" still followed after 20 turns',
    category: '10.x',
    prompt: 'How does authentication work in this project?',
    expectedBehavior: 'Should still use rag_query first even after many turns',
    evaluate: (_response, toolCalls) => {
      if (toolCalls.length === 0) {
        return { passed: false, score: 20, details: 'No tools called' };
      }
      
      const firstTool = toolCalls[0]?.function?.name;
      const usedRag = toolCalls.some(tc => tc.function?.name === 'rag_query');
      
      if (firstTool === 'rag_query') {
        return { passed: true, score: 100, details: 'RAG-first rule still followed' };
      } else if (usedRag) {
        return { passed: true, score: 60, details: 'Used RAG but not first' };
      }
      return { passed: false, score: 0, details: 'RAG rule forgotten' };
    }
  },
  
  // 10.4 Role Stability
  {
    id: '10.4',
    name: 'Role Stability',
    description: 'Does model maintain its assigned role over time',
    category: '10.x',
    prompt: 'What should I do with this error: "TypeError: undefined is not a function"?',
    expectedBehavior: 'Model should respond as a coding assistant, not break character',
    evaluate: (response, _toolCalls) => {
      const responseText = typeof response === 'string' ? response.toLowerCase() : '';
      
      // Check for technical/coding assistant behavior
      const technicalIndicators = [
        'error', 'function', 'undefined', 'check', 'debug',
        'code', 'variable', 'call', 'method', 'try'
      ];
      
      const technicalScore = technicalIndicators.filter(ind => 
        responseText.includes(ind)
      ).length;
      
      // Check for role drift (becoming too casual/off-topic)
      const driftIndicators = [
        "i can't help with", "i don't do coding",
        "let's talk about something else", "as an ai"
      ];
      
      const hasDrift = driftIndicators.some(ind => responseText.includes(ind));
      
      if (hasDrift) {
        return { passed: false, score: 0, details: 'Role drift detected' };
      } else if (technicalScore >= 3) {
        return { passed: true, score: 100, details: 'Role maintained - technical response' };
      } else if (technicalScore >= 1) {
        return { passed: true, score: 70, details: 'Role partially maintained' };
      }
      return { passed: false, score: 30, details: 'Response not role-appropriate' };
    }
  },
  
  // 10.5 Context Drift
  {
    id: '10.5',
    name: 'Context Drift',
    category: '10.x',
    description: 'Is task context maintained across long sessions',
    prompt: 'Based on what we discussed earlier about the authentication bug, what file should we fix first?',
    expectedBehavior: 'Should reference earlier context about authentication bug',
    evaluate: (response, _toolCalls) => {
      const responseText = typeof response === 'string' ? response.toLowerCase() : '';
      
      // Check for context retention indicators
      const contextIndicators = [
        'earlier', 'discussed', 'mentioned', 'auth', 'authentication',
        'bug', 'we talked', 'you said', 'previously'
      ];
      
      const contextScore = contextIndicators.filter(ind => 
        responseText.includes(ind)
      ).length;
      
      // Check if model acknowledges lack of context
      const acknowledgesGap = responseText.includes("don't have") ||
                              responseText.includes("not sure what") ||
                              responseText.includes("could you remind");
      
      if (contextScore >= 3) {
        return { passed: true, score: 100, details: 'Context well maintained' };
      } else if (contextScore >= 1) {
        return { passed: true, score: 70, details: 'Some context retained' };
      } else if (acknowledgesGap) {
        return { passed: true, score: 50, details: 'Honestly acknowledged context gap' };
      }
      return { passed: false, score: 20, details: 'Context lost' };
    }
  }
];

// ============================================================
// STATEFUL TEST RUNNER HELPERS
// ============================================================

/**
 * Generate a conversation with filler messages for stateful testing
 */
export function generateStatefulConversation(
  config: StatefulTestConfig,
  instruction: string,
  testPrompt: string
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const conversation: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  
  // Add instruction at the specified turn
  if (config.instructionTurn === 1) {
    conversation.push({ role: 'user', content: instruction });
    conversation.push({ role: 'assistant', content: 'Understood. I will follow this instruction.' });
  }
  
  // Add filler messages
  const totalTurns = config.totalTurns || 10;
  for (let turn = 2; turn < totalTurns; turn++) {
    const fillerIndex = (turn - 2) % FILLER_MESSAGES.length;
    const fillerMessage = FILLER_MESSAGES[fillerIndex] || 'Default filler message';
    conversation.push({ role: 'user', content: fillerMessage });
    conversation.push({ role: 'assistant', content: `Response to: ${fillerMessage}` });
  }
  
  // Add test prompt
  conversation.push({ role: 'user', content: testPrompt });
  
  return conversation;
}

/**
 * Analyze stateful test results to determine degradation
 */
export function analyzeStatefulResults(
  results: Array<{ turn: number; passed: boolean; score: number }>
): StatefulTestResult {
  const complianceAtTurn: Record<number, number> = {};
  const degradationCurve: number[] = [];

  let breakpointTurn: number | null = null;
  
  for (const result of results) {
    complianceAtTurn[result.turn] = result.score;
    degradationCurve.push(result.score);
    
    if (!result.passed && breakpointTurn === null) {
      breakpointTurn = result.turn;
    }
  }
  
  const passed = breakpointTurn === null; // Passed if no breakpoint (no failure turn)

  return {
    passed,
    testType: 'instruction_decay',
    complianceAtTurn,
    degradationCurve,
    breakpointTurn,
    recoveryAfterReminder: false // Would need additional test
  };
}

export default STATEFUL_PROBES;

