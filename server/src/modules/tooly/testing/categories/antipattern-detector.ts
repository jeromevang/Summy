/**
 * Anti-Pattern Detector
 * Identifies red-flag behaviors that indicate poor agentic performance
 */

import type { AntiPatternDetection } from '../../types.js';

// ============================================================
// TYPES
// ============================================================

export interface ToolCallAnalysis {
  name: string;
  arguments: Record<string, any>;
  timestamp?: number;
}

export interface InteractionAnalysis {
  toolCalls: ToolCallAnalysis[];
  response: string;
  query: string;
  ragResultsProvided?: boolean;
  contextProvided?: boolean;
}

// ============================================================
// ANTI-PATTERN DETECTORS
// ============================================================

/**
 * Over-Tooling Detection
 * Model calls 5+ tools when 1-2 would suffice
 */
export function detectOverTooling(
  interactions: InteractionAnalysis[]
): { detected: boolean; instances: string[] } {
  const instances: string[] = [];
  
  for (const interaction of interactions) {
    const toolCount = interaction.toolCalls.length;
    
    // Simple queries shouldn't need 5+ tools
    const isSimpleQuery = interaction.query.split(/\s+/).length < 15 &&
                          !interaction.query.includes('multiple') &&
                          !interaction.query.includes('several') &&
                          !interaction.query.includes('all');
    
    if (isSimpleQuery && toolCount >= 5) {
      instances.push(`Used ${toolCount} tools for simple query: "${interaction.query.substring(0, 50)}..."`);
    }
  }
  
  return { detected: instances.length > 0, instances };
}

/**
 * Mega Tool Call Detection
 * Model tries to do everything in one giant tool call
 */
export function detectMegaToolCall(
  interactions: InteractionAnalysis[]
): { detected: boolean; instances: string[] } {
  const instances: string[] = [];
  
  for (const interaction of interactions) {
    for (const toolCall of interaction.toolCalls) {
      const argsJson = JSON.stringify(toolCall.arguments);
      
      // Large argument payloads suggest mega-call
      if (argsJson.length > 5000) {
        instances.push(`Mega tool call to ${toolCall.name} with ${argsJson.length} chars of arguments`);
      }
      
      // Check for combining multiple edits in one call
      if (toolCall.name === 'edit_file' && 
          toolCall.arguments?.edits?.length > 10) {
        instances.push(`edit_file called with ${toolCall.arguments.edits.length} edits at once`);
      }
    }
  }
  
  return { detected: instances.length > 0, instances };
}

/**
 * File Read Without Search Detection
 * Model reads files directly without using RAG/search first
 */
export function detectFileReadWithoutSearch(
  interactions: InteractionAnalysis[]
): { detected: boolean; instances: string[] } {
  const instances: string[] = [];
  
  for (const interaction of interactions) {
    const toolNames = interaction.toolCalls.map(tc => tc.name);
    
    // Check if read_file is called before rag_query or search_files
    const readIndex = toolNames.indexOf('read_file');
    const ragIndex = toolNames.indexOf('rag_query');
    const searchIndex = toolNames.indexOf('search_files');
    
    // If it's a code understanding question and reads file first
    const isCodeQuestion = interaction.query.toLowerCase().match(
      /how|what|where|explain|understand|work|does/
    );
    
    if (isCodeQuestion && readIndex >= 0) {
      const hasSearchFirst = (ragIndex >= 0 && ragIndex < readIndex) ||
                             (searchIndex >= 0 && searchIndex < readIndex);
      
      if (!hasSearchFirst && !interaction.ragResultsProvided) {
        instances.push(`Read file without prior search for: "${interaction.query.substring(0, 50)}..."`);
      }
    }
  }
  
  return { detected: instances.length > 0, instances };
}

/**
 * Repeated Failed Query Detection
 * Model repeats the same failing query multiple times
 */
export function detectRepeatedFailedQuery(
  interactions: InteractionAnalysis[]
): { detected: boolean; instances: string[] } {
  const instances: string[] = [];
  const seenQueries = new Map<string, number>();
  
  for (const interaction of interactions) {
    // Check for repeated RAG queries with similar text
    for (const toolCall of interaction.toolCalls) {
      if (toolCall.name === 'rag_query' || toolCall.name === 'search_files') {
        const query = JSON.stringify(toolCall.arguments);
        const count = seenQueries.get(query) || 0;
        seenQueries.set(query, count + 1);
        
        if (count >= 2) {
          instances.push(`Query repeated ${count + 1} times: ${query.substring(0, 50)}...`);
        }
      }
    }
  }
  
  return { detected: instances.length > 0, instances };
}

/**
 * Ignores Provided Context Detection
 * Model ignores RAG results or provided context
 */
export function detectIgnoresContext(
  interactions: InteractionAnalysis[]
): { detected: boolean; instances: string[] } {
  const instances: string[] = [];
  
  for (const interaction of interactions) {
    if (interaction.ragResultsProvided && interaction.toolCalls.length > 0) {
      const firstTool = interaction.toolCalls[0]?.name;

      // If RAG results were provided but model still calls rag_query first
      if (firstTool === 'rag_query') {
        instances.push('Called rag_query despite RAG results already provided');
      }
    }
    
    // Check if response ignores context clues
    if (interaction.contextProvided) {
      const responseLower = interaction.response.toLowerCase();
      
      // Check for phrases suggesting model is ignoring context
      const ignorePhrases = [
        "i don't have access to",
        "i cannot see",
        "without more context",
        "i would need to see"
      ];
      
      const ignoring = ignorePhrases.some(phrase => responseLower.includes(phrase));
      if (ignoring) {
        instances.push('Model claimed no access despite context being provided');
      }
    }
  }
  
  return { detected: instances.length > 0, instances };
}

/**
 * Verbose Planning Detection
 * Model spends excessive tokens on planning vs execution
 */
export function detectVerbosePlanning(
  interactions: InteractionAnalysis[]
): { detected: boolean; instances: string[] } {
  const instances: string[] = [];
  
  for (const interaction of interactions) {
    const response = interaction.response;
    const responseLength = response.length;
    
    // Look for planning markers
    const planningMarkers = [
      /step 1[\s\S]*step 2[\s\S]*step 3[\s\S]*step 4[\s\S]*step 5/i,
      /first[\s\S]*second[\s\S]*third[\s\S]*fourth[\s\S]*fifth/i,
      /\n\d+\.\s/g
    ];
    
    for (const marker of planningMarkers) {
      const match = response.match(marker);
      if (match && match[0].length > responseLength * 0.5) {
        instances.push('Response is >50% planning with minimal execution');
      }
    }
    
    // Check for excessive thinking/planning vs tool calls
    if (responseLength > 2000 && interaction.toolCalls.length === 0) {
      instances.push('Long response with no tool calls - excessive explanation');
    }
  }
  
  return { detected: instances.length > 0, instances };
}

/**
 * Tool Hallucination Detection
 * Model calls tools that don't exist
 */
export function detectToolHallucination(
  interactions: InteractionAnalysis[],
  validToolNames: string[]
): { detected: boolean; instances: string[] } {
  const instances: string[] = [];
  
  for (const interaction of interactions) {
    for (const toolCall of interaction.toolCalls) {
      if (!validToolNames.includes(toolCall.name)) {
        instances.push(`Called non-existent tool: ${toolCall.name}`);
      }
    }
  }
  
  return { detected: instances.length > 0, instances };
}

// ============================================================
// COMPLETE ANALYSIS
// ============================================================

/**
 * Run all anti-pattern detectors
 */
export function detectAllAntiPatterns(
  interactions: InteractionAnalysis[],
  validToolNames: string[] = []
): AntiPatternDetection {
  const overTooling = detectOverTooling(interactions);
  const megaToolCall = detectMegaToolCall(interactions);
  const fileReadWithoutSearch = detectFileReadWithoutSearch(interactions);
  const repeatedFailedQuery = detectRepeatedFailedQuery(interactions);
  const ignoresContext = detectIgnoresContext(interactions);
  const verbosePlanning = detectVerbosePlanning(interactions);
  const toolHallucination = detectToolHallucination(interactions, validToolNames);
  
  // Calculate red flag score (0-100)
  let redFlagScore = 0;
  if (overTooling.detected) redFlagScore += 15;
  if (megaToolCall.detected) redFlagScore += 15;
  if (fileReadWithoutSearch.detected) redFlagScore += 20;
  if (repeatedFailedQuery.detected) redFlagScore += 15;
  if (ignoresContext.detected) redFlagScore += 20;
  if (verbosePlanning.detected) redFlagScore += 10;
  if (toolHallucination.detected) redFlagScore += 25;
  
  // Build recommendations
  const recommendations: string[] = [];
  
  if (overTooling.detected) {
    recommendations.push('Reduce tool set size; model may be overwhelmed by options');
  }
  if (megaToolCall.detected) {
    recommendations.push('Configure to break large operations into smaller steps');
  }
  if (fileReadWithoutSearch.detected) {
    recommendations.push('Add strong RAG-first instruction to system prompt');
  }
  if (repeatedFailedQuery.detected) {
    recommendations.push('May need query reformulation guidance');
  }
  if (ignoresContext.detected) {
    recommendations.push('Context injection may not be working properly');
  }
  if (verbosePlanning.detected) {
    recommendations.push('Add "be concise" instruction; focus on action over explanation');
  }
  if (toolHallucination.detected) {
    recommendations.push('Model may need clearer tool schema or different format');
  }
  
  const detectedPatterns = [
    overTooling.detected && 'overTooling',
    megaToolCall.detected && 'megaToolCall',
    fileReadWithoutSearch.detected && 'fileReadWithoutSearch',
    repeatedFailedQuery.detected && 'repeatedFailedQuery',
    ignoresContext.detected && 'ignoresContext',
    verbosePlanning.detected && 'verbosePlanning',
    toolHallucination.detected && 'toolHallucination'
  ].filter(Boolean) as string[];

  return {
    detected: detectedPatterns.length > 0,
    patterns: detectedPatterns,
    overTooling: overTooling.detected,
    megaToolCall: megaToolCall.detected,
    fileReadWithoutSearch: fileReadWithoutSearch.detected,
    repeatedFailedQuery: repeatedFailedQuery.detected,
    ignoresContext: ignoresContext.detected,
    verbosePlanning: verbosePlanning.detected,
    toolHallucination: toolHallucination.detected,
    redFlagScore: Math.min(100, redFlagScore),
    recommendations
  };
}

export default {
  detectOverTooling,
  detectMegaToolCall,
  detectFileReadWithoutSearch,
  detectRepeatedFailedQuery,
  detectIgnoresContext,
  detectVerbosePlanning,
  detectToolHallucination,
  detectAllAntiPatterns
};

