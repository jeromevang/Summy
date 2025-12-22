/**
 * Test Evaluators
 * Response evaluation logic for test results
 */

import { ParamCondition, CheckResult, TestDefinition } from './test-definitions.js';

// ============================================================
// TYPES
// ============================================================

export interface EvaluationResult {
  score: number;
  checks: CheckResult[];
  passed: boolean;
  calledTool?: string;
  calledArgs?: Record<string, any>;
}

// ============================================================
// PARAM CONDITION CHECKERS
// ============================================================

/**
 * Check if a value matches a parameter condition
 */
export function checkParamCondition(
  actual: any,
  condition: ParamCondition
): { passed: boolean; reason: string } {
  // Check equals
  if (condition.equals !== undefined) {
    if (actual === condition.equals) {
      return { passed: true, reason: 'Value matches exactly' };
    }
    return { passed: false, reason: `Expected ${condition.equals}, got ${actual}` };
  }

  // Check contains
  if (condition.contains !== undefined) {
    if (typeof actual === 'string' && actual.includes(condition.contains)) {
      return { passed: true, reason: `Contains "${condition.contains}"` };
    }
    if (typeof actual === 'string') {
      return { passed: false, reason: `Does not contain "${condition.contains}"` };
    }
    return { passed: false, reason: `Value is not a string` };
  }

  // Check oneOf
  if (condition.oneOf !== undefined) {
    if (condition.oneOf.includes(actual)) {
      return { passed: true, reason: `Value is one of allowed values` };
    }
    return { passed: false, reason: `Value not in allowed set` };
  }

  // Check exists
  if (condition.exists !== undefined) {
    const exists = actual !== undefined && actual !== null;
    if (condition.exists === exists) {
      return { passed: true, reason: condition.exists ? 'Value exists' : 'Value does not exist' };
    }
    return { 
      passed: false, 
      reason: condition.exists ? 'Expected value to exist' : 'Expected value to not exist' 
    };
  }

  return { passed: true, reason: 'No condition to check' };
}

// ============================================================
// TOOL CALL EXTRACTION
// ============================================================

/**
 * Extract tool call information from various response formats
 */
export function extractToolCall(response: any): {
  toolName: string | null;
  toolArgs: Record<string, any> | null;
} {
  if (!response) {
    return { toolName: null, toolArgs: null };
  }

  // OpenAI function calling format
  if (response.choices?.[0]?.message?.tool_calls?.[0]) {
    const toolCall = response.choices[0].message.tool_calls[0];
    const toolName = toolCall.function?.name;
    let toolArgs = null;
    try {
      toolArgs = JSON.parse(toolCall.function?.arguments || '{}');
    } catch {
      toolArgs = {};
    }
    return { toolName, toolArgs };
  }

  // OpenAI function_call format (legacy)
  if (response.choices?.[0]?.message?.function_call) {
    const fc = response.choices[0].message.function_call;
    const toolName = fc.name;
    let toolArgs = null;
    try {
      toolArgs = JSON.parse(fc.arguments || '{}');
    } catch {
      toolArgs = {};
    }
    return { toolName, toolArgs };
  }

  // Direct tool call in message
  if (response.tool_calls?.[0]) {
    const toolCall = response.tool_calls[0];
    return {
      toolName: toolCall.function?.name || toolCall.name,
      toolArgs: toolCall.function?.arguments || toolCall.arguments || {}
    };
  }

  // Text response - check for tool patterns
  const content = response.choices?.[0]?.message?.content || response.content || '';
  if (typeof content === 'string') {
    // Try to extract JSON tool call from text
    const jsonMatch = content.match(/\{[\s\S]*"name"\s*:\s*"(\w+)"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          toolName: parsed.name,
          toolArgs: parsed.arguments || parsed.params || {}
        };
      } catch {
        // Not valid JSON
      }
    }
  }

  return { toolName: null, toolArgs: null };
}

// ============================================================
// RESPONSE EVALUATION
// ============================================================

/**
 * Evaluate a response against test expectations
 */
export function evaluateResponse(
  response: any,
  expected: TestDefinition['expected'],
  aliases: Record<string, string[]> = {}
): EvaluationResult {
  const checks: CheckResult[] = [];
  let totalScore = 0;
  let maxScore = 0;

  // Extract tool call
  const { toolName, toolArgs } = extractToolCall(response);

  // Check if correct tool was called
  maxScore += 50;
  const expectedTool = expected.tool;
  
  let toolMatch = false;
  if (expectedTool === 'none') {
    // Expected no tool call
    toolMatch = toolName === null;
    checks.push({
      name: 'No tool call expected',
      passed: toolMatch,
      expected: 'No tool call',
      actual: toolName || 'No tool call'
    });
  } else {
    // Check direct match or alias match
    const toolAliases = aliases[expectedTool] || [];
    toolMatch = toolName === expectedTool || toolAliases.includes(toolName || '');
    
    checks.push({
      name: 'Correct tool called',
      passed: toolMatch,
      expected: expectedTool,
      actual: toolName || 'No tool called'
    });
  }
  
  if (toolMatch) {
    totalScore += 50;
  }

  // Check parameters if tool was called
  if (toolName && toolArgs && expectedTool !== 'none') {
    const paramChecks = Object.entries(expected.params);
    const scorePerParam = paramChecks.length > 0 ? 50 / paramChecks.length : 0;
    
    for (const [paramName, condition] of paramChecks) {
      maxScore += scorePerParam;
      const actualValue = toolArgs[paramName];
      const result = checkParamCondition(actualValue, condition);
      
      checks.push({
        name: `Param: ${paramName}`,
        passed: result.passed,
        expected: JSON.stringify(condition),
        actual: JSON.stringify(actualValue)
      });
      
      if (result.passed) {
        totalScore += scorePerParam;
      }
    }
  } else if (expectedTool !== 'none') {
    // No args to check, but expected tool call
    maxScore += 50;
    // Already penalized by tool not matching
  }

  const score = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
  const passed = score >= 50 && toolMatch;

  return {
    score,
    checks,
    passed,
    calledTool: toolName || undefined,
    calledArgs: toolArgs || undefined
  };
}

/**
 * Score how well arguments match a tool's parameter schema
 */
export function scoreArgsAgainstSchema(
  args: Record<string, any>,
  schemaProps: string[],
  requiredProps: string[]
): number {
  if (schemaProps.length === 0) {
    return Object.keys(args).length === 0 ? 100 : 50;
  }

  let score = 0;
  let maxScore = 0;

  // Check required parameters (weighted more heavily)
  for (const reqProp of requiredProps) {
    maxScore += 40;
    if (args[reqProp] !== undefined) {
      score += 40;
    }
  }

  // Check optional parameters
  const optionalProps = schemaProps.filter(p => !requiredProps.includes(p));
  for (const optProp of optionalProps) {
    maxScore += 20;
    if (args[optProp] !== undefined) {
      score += 20;
    }
  }

  // Penalty for extra unknown parameters
  const argKeys = Object.keys(args);
  const unknownArgs = argKeys.filter(k => !schemaProps.includes(k));
  const penalty = unknownArgs.length * 10;

  const rawScore = maxScore > 0 ? (score / maxScore) * 100 : 0;
  return Math.max(0, Math.round(rawScore - penalty));
}

export default {
  checkParamCondition,
  extractToolCall,
  evaluateResponse,
  scoreArgsAgainstSchema
};

