/**
 * Strategic and Domain Probes
 * Extended probe definitions for comprehensive model evaluation
 * 
 * 3.x Strategic/Orchestrator Probes
 * 4.x Domain Competence Probes  
 * 5.x Navigation Probes
 * 6.x Helicopter View Probes
 * 7.x Proactive Helpfulness Probes
 */

import { testSandbox, TestManifest } from './test-sandbox.js';

// ============================================================
// TYPES
// ============================================================

export interface ProbeTestResult {
  id: string;
  name: string;
  category: string;
  passed: boolean;
  score: number;
  latency: number;
  details: string;
  response?: any;
  expectedBehavior?: string;
  variants?: ProbeVariantResult[];
}

export interface ProbeVariantResult {
  id: string;
  prompt: string;
  passed: boolean;
  score: number;
  response?: string;
}

export interface ProbeCategory {
  id: string;
  name: string;
  icon: string;
  probes: ProbeDefinition[];
}

export interface ProbeDefinition {
  id: string;
  name: string;
  description: string;
  prompt: string;
  expectedTool?: string;
  expectedFiles?: string[];
  expectedBehavior: string;
  evaluate: (response: any, toolCalls: any[]) => { passed: boolean; score: number; details: string };
  variants?: Array<{
    id: string;
    prompt: string;
    difficulty: 'easy' | 'medium' | 'hard';
  }>;
}

// ============================================================
// 3.x STRATEGIC RAG PROBES
// ============================================================

export const STRATEGIC_PROBES: ProbeDefinition[] = [
  {
    id: '3.1',
    name: 'RAG Priority',
    description: 'Model uses RAG as first choice for code questions',
    prompt: 'How does authentication work in this project?',
    expectedTool: 'rag_query',
    expectedBehavior: 'Model should call rag_query BEFORE file reads',
    evaluate: (response, toolCalls) => {
      const firstTool = toolCalls[0]?.function?.name;
      const usedRag = toolCalls.some(tc => tc.function?.name === 'rag_query');
      
      if (firstTool === 'rag_query') {
        return { passed: true, score: 100, details: 'Correctly used RAG as first tool' };
      } else if (usedRag) {
        return { passed: true, score: 70, details: 'Used RAG but not as first tool' };
      } else {
        return { passed: false, score: 0, details: 'Did not use rag_query' };
      }
    },
    variants: [
      { id: '3.1a', prompt: 'Explain the login flow', difficulty: 'easy' },
      { id: '3.1b', prompt: 'Where is user authentication handled?', difficulty: 'medium' },
    ],
  },
  {
    id: '3.2',
    name: 'Hierarchical Search',
    description: 'Model leverages file summaries and dependency graph',
    prompt: "What's the overall architecture of this project?",
    expectedTool: 'rag_query',
    expectedBehavior: 'Should use broader query to get architectural overview',
    evaluate: (response, toolCalls) => {
      const ragCalls = toolCalls.filter(tc => tc.function?.name === 'rag_query');
      const hasArchitectureQuery = ragCalls.some(tc => {
        const query = tc.function?.arguments?.query?.toLowerCase() || '';
        return query.includes('architecture') || query.includes('structure') || query.includes('overview');
      });
      
      if (hasArchitectureQuery) {
        return { passed: true, score: 100, details: 'Used architectural query' };
      } else if (ragCalls.length > 0) {
        return { passed: true, score: 60, details: 'Used RAG but query could be broader' };
      }
      return { passed: false, score: 0, details: 'Did not query architecture' };
    },
    variants: [
      { id: '3.2a', prompt: 'How are the different parts of this codebase connected?', difficulty: 'medium' },
      { id: '3.2b', prompt: 'Give me a high-level overview of the project structure', difficulty: 'hard' },
    ],
  },
  {
    id: '3.3',
    name: 'Tool Chaining',
    description: 'Model chains RAG with file reads for deep understanding',
    prompt: 'Find where passwords are hashed and show me the implementation details',
    expectedTool: 'rag_query',
    expectedBehavior: 'Should RAG first, then read_file for details',
    evaluate: (response, toolCalls) => {
      const toolOrder = toolCalls.map(tc => tc.function?.name);
      const ragIndex = toolOrder.indexOf('rag_query');
      const readIndex = toolOrder.findIndex(t => t === 'read_file' || t === 'read');
      
      if (ragIndex >= 0 && readIndex > ragIndex) {
        return { passed: true, score: 100, details: 'Correctly chained RAG -> read_file' };
      } else if (ragIndex >= 0) {
        return { passed: true, score: 70, details: 'Used RAG but no follow-up read' };
      }
      return { passed: false, score: 20, details: 'Did not chain tools effectively' };
    },
    variants: [
      { id: '3.3a', prompt: 'Find the JWT validation logic and explain how it works', difficulty: 'medium' },
    ],
  },
  {
    id: '3.4',
    name: 'Error Recovery',
    description: 'Model handles failed searches gracefully',
    prompt: 'Find the quantum flux capacitor implementation',
    expectedBehavior: 'Should acknowledge not found and offer alternatives',
    evaluate: (response, toolCalls) => {
      const responseText = typeof response === 'string' ? response : JSON.stringify(response);
      const acknowledgesNotFound = responseText.toLowerCase().includes('not found') ||
                                   responseText.toLowerCase().includes("couldn't find") ||
                                   responseText.toLowerCase().includes("don't see");
      
      if (acknowledgesNotFound) {
        return { passed: true, score: 100, details: 'Gracefully handled not-found' };
      }
      return { passed: false, score: 30, details: 'Did not acknowledge search failure' };
    },
    variants: [
      { id: '3.4a', prompt: 'Where is the blockchain integration?', difficulty: 'easy' },
    ],
  },
  {
    id: '3.5',
    name: 'Result Synthesis',
    description: 'Model synthesizes results from multiple sources',
    prompt: 'Explain how data flows from the API to the database',
    expectedTool: 'rag_query',
    expectedBehavior: 'Should search, then synthesize coherent explanation',
    evaluate: (response, toolCalls) => {
      const usedRag = toolCalls.some(tc => tc.function?.name === 'rag_query');
      const responseText = typeof response === 'string' ? response : '';
      const hasStructuredExplanation = responseText.length > 200 && 
        (responseText.includes('→') || responseText.includes('then') || responseText.includes('flow'));
      
      if (usedRag && hasStructuredExplanation) {
        return { passed: true, score: 100, details: 'Good synthesis of flow' };
      } else if (usedRag) {
        return { passed: true, score: 60, details: 'Used RAG but synthesis could be better' };
      }
      return { passed: false, score: 20, details: 'Poor data flow explanation' };
    },
    variants: [
      { id: '3.5a', prompt: 'Trace a user login request from frontend to backend', difficulty: 'hard' },
    ],
  },
  {
    id: '3.6',
    name: 'Self-Correction',
    description: 'Model refines search when initial results insufficient',
    prompt: 'Find the middleware that validates user permissions',
    expectedTool: 'rag_query',
    expectedBehavior: 'Should try different queries if first doesnt find it',
    evaluate: (response, toolCalls) => {
      const ragCalls = toolCalls.filter(tc => tc.function?.name === 'rag_query');
      
      if (ragCalls.length >= 2) {
        return { passed: true, score: 100, details: 'Refined search with multiple queries' };
      } else if (ragCalls.length === 1) {
        return { passed: true, score: 50, details: 'Only one RAG query, could refine' };
      }
      return { passed: false, score: 0, details: 'No RAG queries' };
    },
    variants: [
      { id: '3.6a', prompt: 'Find how roles are enforced in the API', difficulty: 'medium' },
    ],
  },
];

// ============================================================
// 4.x ARCHITECTURAL/DOMAIN PROBES
// ============================================================

export const ARCHITECTURAL_PROBES: ProbeDefinition[] = [
  {
    id: '4.1',
    name: 'Code Comprehension',
    description: 'Model understands code semantics',
    prompt: 'What does the authMiddleware function do?',
    expectedTool: 'rag_query',
    expectedBehavior: 'Should explain JWT validation and user attachment',
    evaluate: (response, toolCalls) => {
      const responseText = typeof response === 'string' ? response.toLowerCase() : '';
      const mentionsJwt = responseText.includes('jwt') || responseText.includes('token');
      const mentionsUser = responseText.includes('user') || responseText.includes('auth');
      
      if (mentionsJwt && mentionsUser) {
        return { passed: true, score: 100, details: 'Good understanding of middleware' };
      } else if (mentionsJwt || mentionsUser) {
        return { passed: true, score: 60, details: 'Partial understanding' };
      }
      return { passed: false, score: 20, details: 'Poor code comprehension' };
    },
    variants: [
      { id: '4.1a', prompt: 'Explain what db.service does', difficulty: 'easy' },
      { id: '4.1b', prompt: 'How does the UserService class work?', difficulty: 'medium' },
    ],
  },
  {
    id: '4.2',
    name: 'Bug Detection',
    description: 'Model identifies security vulnerabilities',
    prompt: 'Review the token refresh endpoint for security issues',
    expectedTool: 'rag_query',
    expectedFiles: ['node-api/src/routes/auth.ts'],
    expectedBehavior: 'Should identify jwt.decode vs jwt.verify issue',
    evaluate: (response, toolCalls) => {
      const responseText = typeof response === 'string' ? response.toLowerCase() : '';
      const identifiesJwtIssue = responseText.includes('decode') || 
                                 responseText.includes('verify') ||
                                 responseText.includes('validation');
      const mentionsSecurity = responseText.includes('security') || 
                               responseText.includes('vulnerab') ||
                               responseText.includes('bug');
      
      if (identifiesJwtIssue && mentionsSecurity) {
        return { passed: true, score: 100, details: 'Correctly identified JWT vulnerability' };
      } else if (mentionsSecurity) {
        return { passed: true, score: 50, details: 'Mentioned security but missed specific issue' };
      }
      return { passed: false, score: 0, details: 'Did not identify security issue' };
    },
    variants: [
      { id: '4.2a', prompt: 'Is the refresh token validation secure?', difficulty: 'easy' },
      { id: '4.2b', prompt: 'Find security vulnerabilities in auth.ts', difficulty: 'hard' },
    ],
  },
  {
    id: '4.3',
    name: 'SQL Injection Detection',
    description: 'Model identifies SQL injection vulnerabilities',
    prompt: 'Check the Java UserService for SQL injection vulnerabilities',
    expectedTool: 'rag_query',
    expectedBehavior: 'Should identify string concatenation in SQL query',
    evaluate: (response, toolCalls) => {
      const responseText = typeof response === 'string' ? response.toLowerCase() : '';
      const identifiesSqlInjection = responseText.includes('sql injection') ||
                                     responseText.includes('concatenat') ||
                                     responseText.includes('parameterize');
      
      if (identifiesSqlInjection) {
        return { passed: true, score: 100, details: 'Correctly identified SQL injection' };
      } else if (responseText.includes('security') || responseText.includes('vulnerab')) {
        return { passed: true, score: 50, details: 'Found security concern but missed SQL injection' };
      }
      return { passed: false, score: 0, details: 'Did not identify SQL injection' };
    },
    variants: [
      { id: '4.3a', prompt: 'Is the search query in UserService.java safe?', difficulty: 'easy' },
      { id: '4.3b', prompt: 'Review database queries for injection vulnerabilities', difficulty: 'hard' },
    ],
  },
  {
    id: '4.4',
    name: 'XSS Detection',
    description: 'Model identifies XSS vulnerabilities in React',
    prompt: 'Check the React LoginForm for XSS vulnerabilities',
    expectedTool: 'rag_query',
    expectedBehavior: 'Should identify dangerouslySetInnerHTML vulnerability',
    evaluate: (response, toolCalls) => {
      const responseText = typeof response === 'string' ? response.toLowerCase() : '';
      const identifiesXss = responseText.includes('xss') ||
                           responseText.includes('dangerouslysetinnerhtml') ||
                           responseText.includes('sanitiz');
      
      if (identifiesXss) {
        return { passed: true, score: 100, details: 'Correctly identified XSS vulnerability' };
      }
      return { passed: false, score: 0, details: 'Did not identify XSS vulnerability' };
    },
    variants: [
      { id: '4.4a', prompt: 'Is user input properly sanitized in LoginForm?', difficulty: 'medium' },
      { id: '4.4b', prompt: 'Find XSS issues in the React components', difficulty: 'hard' },
    ],
  },
  {
    id: '4.5',
    name: 'Architecture Inference',
    description: 'Model infers architectural patterns',
    prompt: 'What design patterns are used in the node-api?',
    expectedTool: 'rag_query',
    expectedBehavior: 'Should identify layered architecture, MVC/service pattern',
    evaluate: (response, toolCalls) => {
      const responseText = typeof response === 'string' ? response.toLowerCase() : '';
      const mentionsPatterns = responseText.includes('layer') ||
                               responseText.includes('service') ||
                               responseText.includes('mvc') ||
                               responseText.includes('controller');
      
      if (mentionsPatterns) {
        return { passed: true, score: 100, details: 'Correctly identified patterns' };
      }
      return { passed: false, score: 30, details: 'Did not identify patterns' };
    },
    variants: [
      { id: '4.5a', prompt: 'How is the code organized?', difficulty: 'easy' },
    ],
  },
  {
    id: '4.6',
    name: 'Language Detection',
    description: 'Model identifies multiple languages in project',
    prompt: 'What programming languages are used in this project?',
    expectedTool: 'rag_query',
    expectedBehavior: 'Should identify TypeScript, Java, JSX',
    evaluate: (response, toolCalls) => {
      const responseText = typeof response === 'string' ? response.toLowerCase() : '';
      const languages = ['typescript', 'java', 'javascript', 'tsx', 'jsx', 'react'];
      const found = languages.filter(lang => responseText.includes(lang));
      
      if (found.length >= 3) {
        return { passed: true, score: 100, details: `Found ${found.length} languages` };
      } else if (found.length >= 1) {
        return { passed: true, score: 50, details: `Only found ${found.length} languages` };
      }
      return { passed: false, score: 0, details: 'Did not identify languages' };
    },
    variants: [
      { id: '4.6a', prompt: 'What tech stack is this project using?', difficulty: 'easy' },
    ],
  },
];

// ============================================================
// 5.x NAVIGATION PROBES
// ============================================================

export const NAVIGATION_PROBES: ProbeDefinition[] = [
  {
    id: '5.1',
    name: 'Locate Implementation',
    description: 'Model finds specific implementations',
    prompt: 'Find where user passwords are hashed',
    expectedTool: 'rag_query',
    expectedFiles: ['node-api/src/routes/auth.ts'],
    expectedBehavior: 'Should locate bcrypt.hash usage',
    evaluate: (response, toolCalls) => {
      const usedRag = toolCalls.some(tc => tc.function?.name === 'rag_query');
      const responseText = typeof response === 'string' ? response.toLowerCase() : '';
      const mentionsBcrypt = responseText.includes('bcrypt') || responseText.includes('hash');
      
      if (usedRag && mentionsBcrypt) {
        return { passed: true, score: 100, details: 'Found password hashing' };
      } else if (usedRag) {
        return { passed: true, score: 50, details: 'Used RAG but didnt find bcrypt' };
      }
      return { passed: false, score: 0, details: 'Did not find implementation' };
    },
    variants: [
      { id: '5.1a', prompt: 'Where is password hashing implemented?', difficulty: 'easy' },
      { id: '5.1b', prompt: 'How is password security handled?', difficulty: 'medium' },
    ],
  },
  {
    id: '5.2',
    name: 'Cross-Stack Navigation',
    description: 'Model navigates across technology stacks',
    prompt: 'Find how authentication works in both React and Node',
    expectedTool: 'rag_query',
    expectedBehavior: 'Should find both frontend and backend auth',
    evaluate: (response, toolCalls) => {
      const responseText = typeof response === 'string' ? response.toLowerCase() : '';
      const mentionsFrontend = responseText.includes('react') || responseText.includes('context');
      const mentionsBackend = responseText.includes('node') || responseText.includes('express');
      
      if (mentionsFrontend && mentionsBackend) {
        return { passed: true, score: 100, details: 'Found auth in both stacks' };
      } else if (mentionsFrontend || mentionsBackend) {
        return { passed: true, score: 50, details: 'Only found one stack' };
      }
      return { passed: false, score: 0, details: 'Did not navigate cross-stack' };
    },
    variants: [
      { id: '5.2a', prompt: 'Show me auth across frontend and backend', difficulty: 'hard' },
    ],
  },
  {
    id: '5.3',
    name: 'Dependency Tracing',
    description: 'Model traces import chains',
    prompt: 'What does the auth route depend on?',
    expectedTool: 'rag_query',
    expectedBehavior: 'Should list services and middleware dependencies',
    evaluate: (response, toolCalls) => {
      const responseText = typeof response === 'string' ? response.toLowerCase() : '';
      const mentionsDeps = responseText.includes('service') || 
                           responseText.includes('middleware') ||
                           responseText.includes('import');
      
      if (mentionsDeps) {
        return { passed: true, score: 100, details: 'Traced dependencies' };
      }
      return { passed: false, score: 20, details: 'Did not trace dependencies' };
    },
    variants: [
      { id: '5.3a', prompt: 'What does index.ts import?', difficulty: 'easy' },
    ],
  },
  {
    id: '5.4',
    name: 'Entry Point Location',
    description: 'Model finds project entry points',
    prompt: 'Where does the application start?',
    expectedTool: 'rag_query',
    expectedBehavior: 'Should find index.ts/App.tsx entry points',
    evaluate: (response, toolCalls) => {
      const responseText = typeof response === 'string' ? response.toLowerCase() : '';
      const mentionsEntry = responseText.includes('index') || 
                           responseText.includes('app.tsx') ||
                           responseText.includes('main');
      
      if (mentionsEntry) {
        return { passed: true, score: 100, details: 'Found entry points' };
      }
      return { passed: false, score: 0, details: 'Did not find entry points' };
    },
    variants: [
      { id: '5.4a', prompt: 'What is the main entry file?', difficulty: 'easy' },
    ],
  },
  {
    id: '5.5',
    name: 'Shared Code Detection',
    description: 'Model identifies shared modules',
    prompt: 'Is there any shared code between projects?',
    expectedTool: 'rag_query',
    expectedBehavior: 'Should find shared-utils package',
    evaluate: (response, toolCalls) => {
      const responseText = typeof response === 'string' ? response.toLowerCase() : '';
      const mentionsShared = responseText.includes('shared') || 
                            responseText.includes('utils') ||
                            responseText.includes('common');
      
      if (mentionsShared) {
        return { passed: true, score: 100, details: 'Found shared code' };
      }
      return { passed: false, score: 0, details: 'Did not find shared code' };
    },
    variants: [
      { id: '5.5a', prompt: 'Are there reusable utilities?', difficulty: 'easy' },
    ],
  },
];

// ============================================================
// 6.x HELICOPTER VIEW PROBES
// ============================================================

export const HELICOPTER_PROBES: ProbeDefinition[] = [
  {
    id: '6.1',
    name: 'Project Overview',
    description: 'Model provides high-level project summary',
    prompt: 'Give me a 30-second overview of this project',
    expectedTool: 'rag_query',
    expectedBehavior: 'Should summarize project purpose and structure',
    evaluate: (response, toolCalls) => {
      const responseText = typeof response === 'string' ? response : '';
      const hasOverview = responseText.length > 100 && responseText.length < 1000;
      
      if (hasOverview) {
        return { passed: true, score: 100, details: 'Good concise overview' };
      }
      return { passed: false, score: 30, details: 'Overview too short or too long' };
    },
    variants: [
      { id: '6.1a', prompt: 'What is this codebase about?', difficulty: 'easy' },
    ],
  },
  {
    id: '6.2',
    name: 'Stack Enumeration',
    description: 'Model lists all technology stacks',
    prompt: 'What technology stacks are in this monorepo?',
    expectedTool: 'rag_query',
    expectedBehavior: 'Should list Node, React, React Native, Java, Mendix',
    evaluate: (response, toolCalls) => {
      const responseText = typeof response === 'string' ? response.toLowerCase() : '';
      const stacks = ['node', 'react', 'java', 'mendix'];
      const found = stacks.filter(s => responseText.includes(s));
      
      if (found.length >= 3) {
        return { passed: true, score: 100, details: `Found ${found.length}/4 stacks` };
      } else if (found.length >= 2) {
        return { passed: true, score: 60, details: `Found ${found.length}/4 stacks` };
      }
      return { passed: false, score: 20, details: 'Found few stacks' };
    },
    variants: [
      { id: '6.2a', prompt: 'List all the project folders and their purposes', difficulty: 'medium' },
    ],
  },
  {
    id: '6.3',
    name: 'Team Structure Inference',
    description: 'Model infers logical team boundaries',
    prompt: 'How might this project be divided among teams?',
    expectedBehavior: 'Should suggest backend/frontend/mobile teams',
    evaluate: (response, toolCalls) => {
      const responseText = typeof response === 'string' ? response.toLowerCase() : '';
      const mentionsTeams = responseText.includes('team') || 
                           responseText.includes('frontend') ||
                           responseText.includes('backend');
      
      if (mentionsTeams) {
        return { passed: true, score: 100, details: 'Suggested team structure' };
      }
      return { passed: false, score: 30, details: 'No team structure suggestion' };
    },
    variants: [
      { id: '6.3a', prompt: 'Who would work on what parts?', difficulty: 'hard' },
    ],
  },
  {
    id: '6.4',
    name: 'Risk Assessment',
    description: 'Model identifies technical risks',
    prompt: 'What are the main technical risks in this codebase?',
    expectedTool: 'rag_query',
    expectedBehavior: 'Should mention security issues, coupling, etc',
    evaluate: (response, toolCalls) => {
      const responseText = typeof response === 'string' ? response.toLowerCase() : '';
      const mentionsRisks = responseText.includes('security') || 
                           responseText.includes('risk') ||
                           responseText.includes('concern') ||
                           responseText.includes('issue');
      
      if (mentionsRisks) {
        return { passed: true, score: 100, details: 'Identified risks' };
      }
      return { passed: false, score: 20, details: 'No risk assessment' };
    },
    variants: [
      { id: '6.4a', prompt: 'Any red flags in this code?', difficulty: 'medium' },
    ],
  },
  {
    id: '6.5',
    name: 'Improvement Suggestions',
    description: 'Model suggests architectural improvements',
    prompt: 'How could this codebase be improved?',
    expectedTool: 'rag_query',
    expectedBehavior: 'Should suggest specific improvements',
    evaluate: (response, toolCalls) => {
      const responseText = typeof response === 'string' ? response.toLowerCase() : '';
      const hasSuggestions = responseText.includes('could') || 
                            responseText.includes('should') ||
                            responseText.includes('recommend') ||
                            responseText.includes('suggest');
      
      if (hasSuggestions) {
        return { passed: true, score: 100, details: 'Provided improvements' };
      }
      return { passed: false, score: 20, details: 'No improvement suggestions' };
    },
    variants: [
      { id: '6.5a', prompt: 'What would you refactor first?', difficulty: 'medium' },
    ],
  },
];

// ============================================================
// 7.x PROACTIVE HELPFULNESS PROBES
// ============================================================

export const PROACTIVE_PROBES: ProbeDefinition[] = [
  {
    id: '7.1',
    name: 'Proactive Security Findings',
    description: 'Model proactively mentions security issues',
    prompt: 'Look at the database service and tell me what you see',
    expectedTool: 'rag_query',
    expectedBehavior: 'Should proactively mention connection leak',
    evaluate: (response, toolCalls) => {
      const responseText = typeof response === 'string' ? response.toLowerCase() : '';
      const mentionsIssue = responseText.includes('leak') || 
                           responseText.includes('release') ||
                           responseText.includes('connection') ||
                           responseText.includes('bug');
      
      if (mentionsIssue) {
        return { passed: true, score: 100, details: 'Proactively found issue' };
      }
      return { passed: false, score: 20, details: 'Did not proactively find issues' };
    },
    variants: [
      { id: '7.1a', prompt: 'Review db.service.ts', difficulty: 'medium' },
    ],
  },
  {
    id: '7.2',
    name: 'Improvement Suggestions',
    description: 'Model suggests improvements without being asked',
    prompt: 'Review the useApi hook',
    expectedTool: 'rag_query',
    expectedBehavior: 'Should suggest error handling, cancellation',
    evaluate: (response, toolCalls) => {
      const responseText = typeof response === 'string' ? response.toLowerCase() : '';
      const suggestsImprovement = responseText.includes('error') || 
                                  responseText.includes('cancel') ||
                                  responseText.includes('improve') ||
                                  responseText.includes('could');
      
      if (suggestsImprovement) {
        return { passed: true, score: 100, details: 'Suggested improvements' };
      }
      return { passed: false, score: 20, details: 'No proactive suggestions' };
    },
    variants: [
      { id: '7.2a', prompt: 'Can this hook be improved?', difficulty: 'easy' },
    ],
  },
  {
    id: '7.3',
    name: 'Documentation Awareness',
    description: 'Model notes missing documentation',
    prompt: 'Review the ProductCard component',
    expectedTool: 'rag_query',
    expectedBehavior: 'May note missing prop types or docs',
    evaluate: (response, toolCalls) => {
      const responseText = typeof response === 'string' ? response.toLowerCase() : '';
      const mentionsDocs = responseText.includes('document') || 
                          responseText.includes('comment') ||
                          responseText.includes('prop') ||
                          responseText.includes('type');
      
      if (mentionsDocs) {
        return { passed: true, score: 100, details: 'Noted documentation' };
      }
      return { passed: true, score: 50, details: 'Did not mention docs but reviewed' };
    },
    variants: [
      { id: '7.3a', prompt: 'What do you think of ProductCard?', difficulty: 'easy' },
    ],
  },
  {
    id: '7.4',
    name: 'Best Practice Suggestions',
    description: 'Model suggests best practices',
    prompt: 'Review the auth middleware implementation',
    expectedTool: 'rag_query',
    expectedBehavior: 'Should mention best practices for auth',
    evaluate: (response, toolCalls) => {
      const responseText = typeof response === 'string' ? response.toLowerCase() : '';
      const mentionsBestPractice = responseText.includes('best practice') || 
                                   responseText.includes('recommend') ||
                                   responseText.includes('pattern') ||
                                   responseText.includes('standard');
      
      if (mentionsBestPractice) {
        return { passed: true, score: 100, details: 'Mentioned best practices' };
      }
      return { passed: true, score: 60, details: 'Reviewed but no best practices' };
    },
    variants: [
      { id: '7.4a', prompt: 'Is the auth middleware well-implemented?', difficulty: 'medium' },
    ],
  },
  {
    id: '7.5',
    name: 'Testing Suggestions',
    description: 'Model suggests testing improvements',
    prompt: 'Look at the validation utilities',
    expectedTool: 'rag_query',
    expectedBehavior: 'May suggest adding tests',
    evaluate: (response, toolCalls) => {
      const responseText = typeof response === 'string' ? response.toLowerCase() : '';
      const mentionsTests = responseText.includes('test') || 
                           responseText.includes('coverage');
      
      if (mentionsTests) {
        return { passed: true, score: 100, details: 'Suggested testing' };
      }
      return { passed: true, score: 50, details: 'Reviewed without test mentions' };
    },
    variants: [
      { id: '7.5a', prompt: 'Review shared-utils/validation.ts', difficulty: 'easy' },
    ],
  },
  {
    id: '7.6',
    name: 'Performance Awareness',
    description: 'Model notices performance concerns',
    prompt: 'Review the user list component',
    expectedTool: 'rag_query',
    expectedBehavior: 'May note re-render or pagination concerns',
    evaluate: (response, toolCalls) => {
      const responseText = typeof response === 'string' ? response.toLowerCase() : '';
      const mentionsPerf = responseText.includes('performance') || 
                          responseText.includes('memo') ||
                          responseText.includes('render') ||
                          responseText.includes('optimize');
      
      if (mentionsPerf) {
        return { passed: true, score: 100, details: 'Noted performance concerns' };
      }
      return { passed: true, score: 50, details: 'Reviewed without perf notes' };
    },
    variants: [
      { id: '7.6a', prompt: 'Any performance issues in UserList?', difficulty: 'medium' },
    ],
  },
  {
    id: '7.7',
    name: 'Edge Case Awareness',
    description: 'Model identifies edge cases',
    prompt: 'Review the login form error handling',
    expectedTool: 'rag_query',
    expectedBehavior: 'Should identify edge cases in error handling',
    evaluate: (response, toolCalls) => {
      const responseText = typeof response === 'string' ? response.toLowerCase() : '';
      const mentionsEdgeCases = responseText.includes('edge') || 
                                responseText.includes('case') ||
                                responseText.includes('error') ||
                                responseText.includes('empty');
      
      if (mentionsEdgeCases) {
        return { passed: true, score: 100, details: 'Identified edge cases' };
      }
      return { passed: true, score: 50, details: 'Reviewed without edge cases' };
    },
    variants: [
      { id: '7.7a', prompt: 'What if login fails?', difficulty: 'easy' },
    ],
  },
  {
    id: '7.8',
    name: 'Accessibility Awareness',
    description: 'Model notes accessibility concerns',
    prompt: 'Review the React Native login screen',
    expectedTool: 'rag_query',
    expectedBehavior: 'May note accessibility labels or concerns',
    evaluate: (response, toolCalls) => {
      const responseText = typeof response === 'string' ? response.toLowerCase() : '';
      const mentionsA11y = responseText.includes('accessib') || 
                          responseText.includes('label') ||
                          responseText.includes('aria') ||
                          responseText.includes('keyboard');
      
      if (mentionsA11y) {
        return { passed: true, score: 100, details: 'Noted accessibility' };
      }
      return { passed: true, score: 50, details: 'Reviewed without a11y notes' };
    },
    variants: [
      { id: '7.8a', prompt: 'Is LoginScreen accessible?', difficulty: 'hard' },
    ],
  },
];

// ============================================================
// PROBE CATEGORIES (must be after probe definitions)
// ============================================================

export const PROBE_CATEGORIES: ProbeCategory[] = [
  {
    id: '3.x',
    name: 'Strategic RAG Probes',
    icon: '🔍',
    probes: STRATEGIC_PROBES,
  },
  {
    id: '4.x',
    name: 'Architectural Probes',
    icon: '🏗️',
    probes: ARCHITECTURAL_PROBES,
  },
  {
    id: '5.x',
    name: 'Navigation Probes',
    icon: '🧭',
    probes: NAVIGATION_PROBES,
  },
  {
    id: '6.x',
    name: 'Helicopter View',
    icon: '🚁',
    probes: HELICOPTER_PROBES,
  },
  {
    id: '7.x',
    name: 'Proactive Helpfulness',
    icon: '💡',
    probes: PROACTIVE_PROBES,
  },
];

// ============================================================
// PROBE RUNNER
// ============================================================

export async function runProbeCategory(
  categoryId: string,
  executeChat: (prompt: string) => Promise<{ response: any; toolCalls: any[] }>
): Promise<ProbeTestResult[]> {
  const category = PROBE_CATEGORIES.find(c => c.id === categoryId);
  if (!category) {
    throw new Error(`Unknown probe category: ${categoryId}`);
  }

  const results: ProbeTestResult[] = [];

  for (const probe of category.probes) {
    const startTime = Date.now();
    
    try {
      const { response, toolCalls } = await executeChat(probe.prompt);
      const evaluation = probe.evaluate(response, toolCalls);
      
      // Run variants if present
      const variantResults: ProbeVariantResult[] = [];
      if (probe.variants) {
        for (const variant of probe.variants) {
          const variantStart = Date.now();
          const variantResult = await executeChat(variant.prompt);
          const variantEval = probe.evaluate(variantResult.response, variantResult.toolCalls);
          
          variantResults.push({
            id: variant.id,
            prompt: variant.prompt,
            passed: variantEval.passed,
            score: variantEval.score,
            response: typeof variantResult.response === 'string' ? variantResult.response.substring(0, 200) : undefined,
          });
        }
      }
      
      results.push({
        id: probe.id,
        name: probe.name,
        category: categoryId,
        passed: evaluation.passed,
        score: evaluation.score,
        latency: Date.now() - startTime,
        details: evaluation.details,
        expectedBehavior: probe.expectedBehavior,
        variants: variantResults.length > 0 ? variantResults : undefined,
      });
    } catch (error: any) {
      results.push({
        id: probe.id,
        name: probe.name,
        category: categoryId,
        passed: false,
        score: 0,
        latency: Date.now() - startTime,
        details: `Error: ${error.message}`,
        expectedBehavior: probe.expectedBehavior,
      });
    }
  }

  return results;
}

export default {
  PROBE_CATEGORIES,
  STRATEGIC_PROBES,
  ARCHITECTURAL_PROBES,
  NAVIGATION_PROBES,
  HELICOPTER_PROBES,
  PROACTIVE_PROBES,
  runProbeCategory,
};

