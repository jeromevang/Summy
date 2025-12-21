/**
 * Intent Recognition Probes (8.x)
 * Tests whether the model knows WHEN to invoke tools without being explicitly told
 * 
 * 8.1 Implicit Tool Invocation - Does model use tools when user asks naturally?
 * 8.2 Autonomous Tool Selection - Does model pick the RIGHT tool?
 * 8.3 Over-Invocation Detection - Does model avoid unnecessary tool calls?
 * 8.4 Under-Invocation Detection - Does model call tools when it should?
 * 8.5 Ambiguity Handling - Does model ask for clarification when needed?
 * 8.6 Context Inference - Can model infer intent from subtle hints?
 * 8.7 Multi-Intent Recognition - Can model handle requests with multiple needs?
 * 8.8 Negative Intent Detection - Does model recognize when NOT to act?
 */

// ============================================================
// TYPES
// ============================================================

export interface IntentProbeResult {
  id: string;
  name: string;
  invoked: boolean;           // Did it invoke any tool?
  invokedCorrectly: boolean;  // Did it invoke the RIGHT tool?
  actionCorrect: boolean;     // Did it do the right thing with the tool?
  score: number;
  details: string;
  toolsInvoked: string[];
  expectedTools: string[];
  response?: string;
}

export interface IntentProbeDefinition {
  id: string;
  name: string;
  description: string;
  prompt: string;
  explicitness: 'implicit' | 'subtle' | 'neutral' | 'explicit';
  shouldInvoke: boolean;
  expectedTools?: string[];
  acceptableTools?: string[];  // Alternative acceptable tools
  forbiddenTools?: string[];   // Tools that should NOT be used
  evaluateIntent: (response: any, toolCalls: any[]) => IntentProbeResult;
}

// ============================================================
// INTENT SCORING
// ============================================================

/**
 * Calculate intent recognition scores from probe results
 */
export function calculateIntentScores(results: IntentProbeResult[]): {
  invokeCorrectness: number;  // % of times it correctly decided to invoke or not
  toolSelectionAccuracy: number;  // % of times it picked the right tool
  actionCorrectness: number;  // % of times it did the right thing
  overInvocationRate: number;  // % of unnecessary tool calls
  underInvocationRate: number; // % of missed tool calls
  overallIntentScore: number;
} {
  if (results.length === 0) {
    return {
      invokeCorrectness: 0,
      toolSelectionAccuracy: 0,
      actionCorrectness: 0,
      overInvocationRate: 0,
      underInvocationRate: 0,
      overallIntentScore: 0,
    };
  }

  const shouldInvokeResults = results.filter(r => r.expectedTools && r.expectedTools.length > 0);
  const shouldNotInvokeResults = results.filter(r => !r.expectedTools || r.expectedTools.length === 0);

  // Invoke correctness: did it invoke when it should, and not when it shouldn't?
  const correctInvocations = results.filter(r => {
    const shouldInvoke = r.expectedTools && r.expectedTools.length > 0;
    return shouldInvoke ? r.invoked : !r.invoked;
  }).length;
  const invokeCorrectness = (correctInvocations / results.length) * 100;

  // Tool selection: when it did invoke, did it pick the right tool?
  const invokedResults = results.filter(r => r.invoked);
  const correctToolSelections = invokedResults.filter(r => r.invokedCorrectly).length;
  const toolSelectionAccuracy = invokedResults.length > 0 
    ? (correctToolSelections / invokedResults.length) * 100 
    : 100;

  // Action correctness: did it do the right thing?
  const correctActions = results.filter(r => r.actionCorrect).length;
  const actionCorrectness = (correctActions / results.length) * 100;

  // Over-invocation: called tool when shouldn't
  const overInvocations = shouldNotInvokeResults.filter(r => r.invoked).length;
  const overInvocationRate = shouldNotInvokeResults.length > 0
    ? (overInvocations / shouldNotInvokeResults.length) * 100
    : 0;

  // Under-invocation: didn't call tool when should
  const underInvocations = shouldInvokeResults.filter(r => !r.invoked).length;
  const underInvocationRate = shouldInvokeResults.length > 0
    ? (underInvocations / shouldInvokeResults.length) * 100
    : 0;

  // Overall score (weighted)
  const overallIntentScore = (
    invokeCorrectness * 0.3 +
    toolSelectionAccuracy * 0.3 +
    actionCorrectness * 0.25 +
    (100 - overInvocationRate) * 0.075 +
    (100 - underInvocationRate) * 0.075
  );

  return {
    invokeCorrectness: Math.round(invokeCorrectness),
    toolSelectionAccuracy: Math.round(toolSelectionAccuracy),
    actionCorrectness: Math.round(actionCorrectness),
    overInvocationRate: Math.round(overInvocationRate),
    underInvocationRate: Math.round(underInvocationRate),
    overallIntentScore: Math.round(overallIntentScore),
  };
}

// ============================================================
// 8.x INTENT RECOGNITION PROBES
// ============================================================

export const INTENT_PROBES: IntentProbeDefinition[] = [
  // --------------------------------------------------------
  // 8.1 IMPLICIT TOOL INVOCATION
  // User asks naturally, model should infer tool use needed
  // --------------------------------------------------------
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
      const usedAnySearch = toolsInvoked.some(t => 
        ['rag_query', 'search_files', 'read_file'].includes(t)
      );
      
      return {
        id: '8.1a',
        name: 'Implicit RAG - Question',
        invoked: toolCalls.length > 0,
        invokedCorrectly: usedRag,
        actionCorrect: usedAnySearch,
        score: usedRag ? 100 : (usedAnySearch ? 70 : 0),
        details: usedRag 
          ? 'Correctly invoked RAG from natural question'
          : (usedAnySearch ? 'Used search but not RAG' : 'Did not search codebase'),
        toolsInvoked,
        expectedTools: ['rag_query'],
      };
    },
  },
  {
    id: '8.1b',
    name: 'Implicit RAG - Bug Report',
    description: 'User reports issue, model should search without being asked',
    prompt: "Users are getting 401 errors when refreshing their tokens. What's causing this?",
    explicitness: 'implicit',
    shouldInvoke: true,
    expectedTools: ['rag_query'],
    evaluateIntent: (response, toolCalls) => {
      const toolsInvoked = toolCalls.map(tc => tc.function?.name);
      const usedRag = toolsInvoked.includes('rag_query');
      const searchedAuth = toolCalls.some(tc => {
        const args = tc.function?.arguments;
        const query = typeof args === 'string' ? args : (args?.query || '');
        return query.toLowerCase().includes('token') || 
               query.toLowerCase().includes('auth') ||
               query.toLowerCase().includes('refresh');
      });
      
      return {
        id: '8.1b',
        name: 'Implicit RAG - Bug Report',
        invoked: toolCalls.length > 0,
        invokedCorrectly: usedRag,
        actionCorrect: usedRag && searchedAuth,
        score: (usedRag && searchedAuth) ? 100 : (usedRag ? 70 : 0),
        details: (usedRag && searchedAuth)
          ? 'Searched for relevant auth/token code'
          : (usedRag ? 'Used RAG but query unclear' : 'Did not investigate bug'),
        toolsInvoked,
        expectedTools: ['rag_query'],
      };
    },
  },
  {
    id: '8.1c',
    name: 'Implicit File Read',
    description: 'User mentions specific file, model should read it',
    prompt: "There's something weird in the db.service.ts file, can you take a look?",
    explicitness: 'subtle',
    shouldInvoke: true,
    expectedTools: ['read_file', 'rag_query'],
    evaluateIntent: (response, toolCalls) => {
      const toolsInvoked = toolCalls.map(tc => tc.function?.name);
      const readFile = toolsInvoked.includes('read_file') || toolsInvoked.includes('read');
      const usedRag = toolsInvoked.includes('rag_query');
      
      return {
        id: '8.1c',
        name: 'Implicit File Read',
        invoked: toolCalls.length > 0,
        invokedCorrectly: readFile || usedRag,
        actionCorrect: readFile || usedRag,
        score: readFile ? 100 : (usedRag ? 80 : 0),
        details: readFile 
          ? 'Correctly read the mentioned file'
          : (usedRag ? 'Searched for file via RAG' : 'Did not look at file'),
        toolsInvoked,
        expectedTools: ['read_file', 'rag_query'],
      };
    },
  },

  // --------------------------------------------------------
  // 8.2 AUTONOMOUS TOOL SELECTION
  // Tests whether model picks the optimal tool
  // --------------------------------------------------------
  {
    id: '8.2a',
    name: 'RAG vs File Read Decision',
    description: 'Broad question should use RAG, not file reads',
    prompt: 'What error handling patterns are used in this project?',
    explicitness: 'neutral',
    shouldInvoke: true,
    expectedTools: ['rag_query'],
    forbiddenTools: ['read_file'],  // Should NOT start with file reads
    evaluateIntent: (response, toolCalls) => {
      const toolsInvoked = toolCalls.map(tc => tc.function?.name);
      const firstTool = toolsInvoked[0];
      const usedRag = toolsInvoked.includes('rag_query');
      const startedWithRag = firstTool === 'rag_query';
      
      return {
        id: '8.2a',
        name: 'RAG vs File Read Decision',
        invoked: toolCalls.length > 0,
        invokedCorrectly: startedWithRag,
        actionCorrect: usedRag,
        score: startedWithRag ? 100 : (usedRag ? 50 : 0),
        details: startedWithRag 
          ? 'Correctly started with RAG for broad question'
          : (usedRag ? 'Used RAG but not first' : 'Did not use semantic search'),
        toolsInvoked,
        expectedTools: ['rag_query'],
      };
    },
  },
  {
    id: '8.2b',
    name: 'Specific vs Broad Query',
    description: 'Specific file question could use direct read',
    prompt: 'Show me line 45 of package.json',
    explicitness: 'explicit',
    shouldInvoke: true,
    expectedTools: ['read_file'],
    acceptableTools: ['rag_query'],
    evaluateIntent: (response, toolCalls) => {
      const toolsInvoked = toolCalls.map(tc => tc.function?.name);
      const usedRead = toolsInvoked.includes('read_file') || toolsInvoked.includes('read');
      
      return {
        id: '8.2b',
        name: 'Specific vs Broad Query',
        invoked: toolCalls.length > 0,
        invokedCorrectly: usedRead,
        actionCorrect: usedRead,
        score: usedRead ? 100 : 50,
        details: usedRead 
          ? 'Correctly read specific file'
          : 'Did not read the requested file',
        toolsInvoked,
        expectedTools: ['read_file'],
      };
    },
  },

  // --------------------------------------------------------
  // 8.3 OVER-INVOCATION DETECTION
  // Tests if model avoids unnecessary tool calls
  // --------------------------------------------------------
  {
    id: '8.3a',
    name: 'Knowledge Question - No Tools',
    description: 'General knowledge should not require tools',
    prompt: 'What is dependency injection?',
    explicitness: 'neutral',
    shouldInvoke: false,
    expectedTools: [],
    evaluateIntent: (response, toolCalls) => {
      const toolsInvoked = toolCalls.map(tc => tc.function?.name);
      const noTools = toolCalls.length === 0;
      
      return {
        id: '8.3a',
        name: 'Knowledge Question - No Tools',
        invoked: !noTools,
        invokedCorrectly: noTools,
        actionCorrect: noTools,
        score: noTools ? 100 : 0,
        details: noTools 
          ? 'Correctly answered without tools'
          : 'Unnecessarily invoked tools for knowledge question',
        toolsInvoked,
        expectedTools: [],
      };
    },
  },
  {
    id: '8.3b',
    name: 'Clarification Request',
    description: 'Vague request should prompt clarification, not random tool use',
    prompt: 'Fix it',
    explicitness: 'implicit',
    shouldInvoke: false,  // Should ask for clarification
    expectedTools: [],
    evaluateIntent: (response, toolCalls) => {
      const toolsInvoked = toolCalls.map(tc => tc.function?.name);
      const noTools = toolCalls.length === 0;
      const responseText = typeof response === 'string' ? response.toLowerCase() : '';
      const asksClarification = responseText.includes('what') || 
                                responseText.includes('which') ||
                                responseText.includes('clarif') ||
                                responseText.includes('more detail') ||
                                responseText.includes('could you');
      
      return {
        id: '8.3b',
        name: 'Clarification Request',
        invoked: !noTools,
        invokedCorrectly: noTools && asksClarification,
        actionCorrect: asksClarification,
        score: (noTools && asksClarification) ? 100 : (asksClarification ? 60 : 0),
        details: (noTools && asksClarification)
          ? 'Correctly asked for clarification'
          : (asksClarification ? 'Asked but also used tools' : 'Did not seek clarification'),
        toolsInvoked,
        expectedTools: [],
      };
    },
  },
  {
    id: '8.3c',
    name: 'Follow-up Question',
    description: 'Conversational follow-up may not need new tools',
    prompt: 'Thanks, that makes sense. What about the database layer?',
    explicitness: 'neutral',
    shouldInvoke: true,  // New topic, might need RAG
    expectedTools: ['rag_query'],
    evaluateIntent: (response, toolCalls) => {
      const toolsInvoked = toolCalls.map(tc => tc.function?.name);
      const usedRag = toolsInvoked.includes('rag_query');
      
      return {
        id: '8.3c',
        name: 'Follow-up Question',
        invoked: toolCalls.length > 0,
        invokedCorrectly: usedRag || toolCalls.length === 0,  // Either is acceptable
        actionCorrect: true,  // Either approach is fine
        score: usedRag ? 100 : 70,
        details: usedRag 
          ? 'Searched for database context'
          : 'Answered without additional search (may be using context)',
        toolsInvoked,
        expectedTools: ['rag_query'],
      };
    },
  },

  // --------------------------------------------------------
  // 8.4 UNDER-INVOCATION DETECTION
  // Tests if model calls tools when it should
  // --------------------------------------------------------
  {
    id: '8.4a',
    name: 'Code Question Without Context',
    description: 'Question about code should search, not hallucinate',
    prompt: 'Is there any rate limiting in the API?',
    explicitness: 'implicit',
    shouldInvoke: true,
    expectedTools: ['rag_query'],
    evaluateIntent: (response, toolCalls) => {
      const toolsInvoked = toolCalls.map(tc => tc.function?.name);
      const searched = toolsInvoked.includes('rag_query') || 
                       toolsInvoked.includes('search_files');
      const responseText = typeof response === 'string' ? response.toLowerCase() : '';
      const madeUpAnswer = !searched && (
        responseText.includes('yes,') ||
        responseText.includes('the rate limiting') ||
        responseText.includes('implements rate')
      );
      
      return {
        id: '8.4a',
        name: 'Code Question Without Context',
        invoked: toolCalls.length > 0,
        invokedCorrectly: searched,
        actionCorrect: searched && !madeUpAnswer,
        score: searched ? 100 : 0,
        details: searched 
          ? 'Correctly searched before answering'
          : 'Answered without checking code (may hallucinate)',
        toolsInvoked,
        expectedTools: ['rag_query'],
      };
    },
  },
  {
    id: '8.4b',
    name: 'Specific Code Location',
    description: 'Request for specific code must involve file access',
    prompt: "What's in the UserController's delete method?",
    explicitness: 'subtle',
    shouldInvoke: true,
    expectedTools: ['rag_query', 'read_file'],
    evaluateIntent: (response, toolCalls) => {
      const toolsInvoked = toolCalls.map(tc => tc.function?.name);
      const searched = toolsInvoked.includes('rag_query') || 
                       toolsInvoked.includes('read_file') ||
                       toolsInvoked.includes('read');
      
      return {
        id: '8.4b',
        name: 'Specific Code Location',
        invoked: toolCalls.length > 0,
        invokedCorrectly: searched,
        actionCorrect: searched,
        score: searched ? 100 : 0,
        details: searched 
          ? 'Located and examined the code'
          : 'Did not look up the specific code',
        toolsInvoked,
        expectedTools: ['rag_query', 'read_file'],
      };
    },
  },

  // --------------------------------------------------------
  // 8.5 AMBIGUITY HANDLING
  // Tests how model handles unclear requests
  // --------------------------------------------------------
  {
    id: '8.5a',
    name: 'Ambiguous Reference',
    description: 'Unclear reference should prompt clarification',
    prompt: 'Can you update that function we discussed?',
    explicitness: 'implicit',
    shouldInvoke: false,
    expectedTools: [],
    evaluateIntent: (response, toolCalls) => {
      const toolsInvoked = toolCalls.map(tc => tc.function?.name);
      const noTools = toolCalls.length === 0;
      const responseText = typeof response === 'string' ? response.toLowerCase() : '';
      const asksClarification = responseText.includes('which function') || 
                                responseText.includes('what function') ||
                                responseText.includes('could you specify') ||
                                responseText.includes("don't have context");
      
      return {
        id: '8.5a',
        name: 'Ambiguous Reference',
        invoked: !noTools,
        invokedCorrectly: noTools || asksClarification,
        actionCorrect: asksClarification,
        score: asksClarification ? 100 : (noTools ? 70 : 20),
        details: asksClarification 
          ? 'Correctly asked for clarification'
          : (noTools ? 'Did not act but also did not clarify' : 'Acted without clarification'),
        toolsInvoked,
        expectedTools: [],
      };
    },
  },
  {
    id: '8.5b',
    name: 'Multiple Interpretations',
    description: 'Request with multiple valid interpretations',
    prompt: 'Check the service',
    explicitness: 'implicit',
    shouldInvoke: false,  // Should clarify which service
    expectedTools: [],
    evaluateIntent: (response, toolCalls) => {
      const toolsInvoked = toolCalls.map(tc => tc.function?.name);
      const responseText = typeof response === 'string' ? response.toLowerCase() : '';
      const asksClarification = responseText.includes('which service') || 
                                responseText.includes('services') ||
                                responseText.includes('specify');
      const tooAggressive = toolCalls.length > 2;  // Checking many services
      
      return {
        id: '8.5b',
        name: 'Multiple Interpretations',
        invoked: toolCalls.length > 0,
        invokedCorrectly: asksClarification || !tooAggressive,
        actionCorrect: asksClarification,
        score: asksClarification ? 100 : (!tooAggressive ? 50 : 20),
        details: asksClarification 
          ? 'Asked which service'
          : (tooAggressive ? 'Checked too many things at once' : 'Made reasonable assumption'),
        toolsInvoked,
        expectedTools: [],
      };
    },
  },

  // --------------------------------------------------------
  // 8.6 CONTEXT INFERENCE
  // Tests ability to infer intent from subtle hints
  // --------------------------------------------------------
  {
    id: '8.6a',
    name: 'Implicit Security Review',
    description: 'Mention of security should trigger security-focused search',
    prompt: "I'm worried about this endpoint",
    explicitness: 'subtle',
    shouldInvoke: false,  // Should ask which endpoint
    expectedTools: [],
    evaluateIntent: (response, toolCalls) => {
      const responseText = typeof response === 'string' ? response.toLowerCase() : '';
      const asksClarification = responseText.includes('which endpoint') || 
                                responseText.includes('what endpoint') ||
                                responseText.includes('could you point');
      
      return {
        id: '8.6a',
        name: 'Implicit Security Review',
        invoked: toolCalls.length > 0,
        invokedCorrectly: asksClarification || toolCalls.length === 0,
        actionCorrect: asksClarification,
        score: asksClarification ? 100 : 50,
        details: asksClarification 
          ? 'Asked for more context'
          : 'Proceeded without knowing which endpoint',
        toolsInvoked: toolCalls.map(tc => tc.function?.name),
        expectedTools: [],
      };
    },
  },
  {
    id: '8.6b',
    name: 'Performance Concern Hint',
    description: 'Hint at performance issue should inform search focus',
    prompt: "The user list page is slow when there are lots of users",
    explicitness: 'subtle',
    shouldInvoke: true,
    expectedTools: ['rag_query'],
    evaluateIntent: (response, toolCalls) => {
      const toolsInvoked = toolCalls.map(tc => tc.function?.name);
      const usedRag = toolsInvoked.includes('rag_query');
      const searchedUserList = toolCalls.some(tc => {
        const args = tc.function?.arguments;
        const query = typeof args === 'string' ? args : (args?.query || '');
        return query.toLowerCase().includes('user') || query.toLowerCase().includes('list');
      });
      
      return {
        id: '8.6b',
        name: 'Performance Concern Hint',
        invoked: toolCalls.length > 0,
        invokedCorrectly: usedRag && searchedUserList,
        actionCorrect: searchedUserList,
        score: (usedRag && searchedUserList) ? 100 : (usedRag ? 60 : 0),
        details: searchedUserList 
          ? 'Searched for user list implementation'
          : 'Did not investigate the performance issue',
        toolsInvoked,
        expectedTools: ['rag_query'],
      };
    },
  },

  // --------------------------------------------------------
  // 8.7 MULTI-INTENT RECOGNITION
  // Tests handling of compound requests
  // --------------------------------------------------------
  {
    id: '8.7a',
    name: 'Dual Request',
    description: 'Request with two distinct needs',
    prompt: 'Check the auth flow and also look at how errors are logged',
    explicitness: 'neutral',
    shouldInvoke: true,
    expectedTools: ['rag_query'],
    evaluateIntent: (response, toolCalls) => {
      const toolsInvoked = toolCalls.map(tc => tc.function?.name);
      const usedRag = toolsInvoked.includes('rag_query');
      const ragCalls = toolCalls.filter(tc => tc.function?.name === 'rag_query');
      const searchedBoth = ragCalls.length >= 2 || ragCalls.some(tc => {
        const args = tc.function?.arguments;
        const query = typeof args === 'string' ? args : (args?.query || '');
        return (query.toLowerCase().includes('auth') || query.toLowerCase().includes('login')) &&
               (query.toLowerCase().includes('error') || query.toLowerCase().includes('log'));
      });
      
      return {
        id: '8.7a',
        name: 'Dual Request',
        invoked: toolCalls.length > 0,
        invokedCorrectly: usedRag,
        actionCorrect: searchedBoth,
        score: searchedBoth ? 100 : (usedRag ? 60 : 0),
        details: searchedBoth 
          ? 'Addressed both auth and error logging'
          : (usedRag ? 'Only partially addressed request' : 'Did not search'),
        toolsInvoked,
        expectedTools: ['rag_query'],
      };
    },
  },

  // --------------------------------------------------------
  // 8.8 NEGATIVE INTENT DETECTION
  // Tests recognition of when to NOT act
  // --------------------------------------------------------
  {
    id: '8.8a',
    name: 'Hypothetical Question',
    description: 'Hypothetical should not trigger code changes',
    prompt: 'What would happen if we removed the auth middleware?',
    explicitness: 'neutral',
    shouldInvoke: true,  // Should search to understand, but NOT modify
    expectedTools: ['rag_query'],
    forbiddenTools: ['write_file', 'edit_file', 'delete_file'],
    evaluateIntent: (response, toolCalls) => {
      const toolsInvoked = toolCalls.map(tc => tc.function?.name);
      const usedRag = toolsInvoked.includes('rag_query');
      const modifiedFiles = toolsInvoked.some(t => 
        ['write_file', 'edit_file', 'delete_file'].includes(t)
      );
      
      return {
        id: '8.8a',
        name: 'Hypothetical Question',
        invoked: toolCalls.length > 0,
        invokedCorrectly: usedRag && !modifiedFiles,
        actionCorrect: !modifiedFiles,
        score: modifiedFiles ? 0 : (usedRag ? 100 : 70),
        details: modifiedFiles 
          ? 'DANGER: Modified files for hypothetical question!'
          : (usedRag ? 'Searched but did not modify' : 'Answered theoretically'),
        toolsInvoked,
        expectedTools: ['rag_query'],
      };
    },
  },
  {
    id: '8.8b',
    name: 'Just Asking',
    description: 'Informational request should not trigger changes',
    prompt: 'How is the database connection pool configured?',
    explicitness: 'explicit',
    shouldInvoke: true,
    expectedTools: ['rag_query', 'read_file'],
    forbiddenTools: ['write_file', 'edit_file'],
    evaluateIntent: (response, toolCalls) => {
      const toolsInvoked = toolCalls.map(tc => tc.function?.name);
      const searchedOrRead = toolsInvoked.some(t => 
        ['rag_query', 'read_file', 'read'].includes(t)
      );
      const modifiedFiles = toolsInvoked.some(t => 
        ['write_file', 'edit_file'].includes(t)
      );
      
      return {
        id: '8.8b',
        name: 'Just Asking',
        invoked: toolCalls.length > 0,
        invokedCorrectly: searchedOrRead && !modifiedFiles,
        actionCorrect: !modifiedFiles,
        score: modifiedFiles ? 0 : (searchedOrRead ? 100 : 50),
        details: modifiedFiles 
          ? 'Modified files when only info was requested'
          : (searchedOrRead ? 'Correctly searched without modifying' : 'Answered without searching'),
        toolsInvoked,
        expectedTools: ['rag_query', 'read_file'],
      };
    },
  },
];

// ============================================================
// PROBE RUNNER
// ============================================================

export async function runIntentProbes(
  executeChat: (prompt: string) => Promise<{ response: any; toolCalls: any[] }>
): Promise<{
  results: IntentProbeResult[];
  scores: ReturnType<typeof calculateIntentScores>;
}> {
  const results: IntentProbeResult[] = [];

  for (const probe of INTENT_PROBES) {
    try {
      const { response, toolCalls } = await executeChat(probe.prompt);
      const result = probe.evaluateIntent(response, toolCalls);
      results.push(result);
    } catch (error: any) {
      results.push({
        id: probe.id,
        name: probe.name,
        invoked: false,
        invokedCorrectly: false,
        actionCorrect: false,
        score: 0,
        details: `Error: ${error.message}`,
        toolsInvoked: [],
        expectedTools: probe.expectedTools || [],
      });
    }
  }

  const scores = calculateIntentScores(results);
  return { results, scores };
}

export default {
  INTENT_PROBES,
  calculateIntentScores,
  runIntentProbes,
};

