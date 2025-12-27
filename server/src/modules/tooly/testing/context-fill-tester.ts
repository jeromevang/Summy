/**
 * Context Fill Tester
 * 
 * Tests model performance at various context window fill levels (25%, 50%, 75%, 90%)
 * Measures quality degradation and "lost in the middle" retrieval.
 */

import { intentRouter } from '../intent-router.js';
import { getToolSchemas } from '../tool-prompts.js';
import { SANDBOX_CONTEXT } from './readiness-runner.js';

// ============================================================
// TYPES
// ============================================================

export interface ContextFillResult {
  fillLevel: number; // 25, 50, 75, 90
  tokensUsed: number;
  tokensTarget: number;
  qualityScore: number; // 0-100
  latencyMs: number;
  passed: boolean;
  details: string;
}

export interface ContextFillProfile {
  modelId: string;
  testedAt: string;
  contextLimit: number;
  results: ContextFillResult[];
  effectiveMaxContext: number; // Tokens before quality drops below 70%
  degradationCurve: number[]; // Quality at each level
  baseline: {
    qualityScore: number;
    latencyMs: number;
  };
}

// ============================================================
// PADDING GENERATION
// ============================================================

/**
 * Generate code-like padding content to fill context window
 */
function generateCodePadding(targetTokens: number): string {
  const codeSnippets = [
    `// Module: UserAuthentication
export class AuthService {
  private tokenCache: Map<string, TokenInfo> = new Map();
  
  async validateToken(token: string): Promise<boolean> {
    if (this.tokenCache.has(token)) {
      const info = this.tokenCache.get(token)!;
      return info.expiresAt > Date.now();
    }
    return await this.validateRemote(token);
  }
}`,
    `// Database connection pool
const pool = createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'summy',
  max: 10,
  idleTimeoutMillis: 30000
});`,
    `// API Route Handler
router.get('/api/users/:id', async (req, res) => {
  try {
    const user = await UserService.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});`,
    `// React Component
export const Dashboard: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData()
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  return <DashboardView data={data} />;
};`,
    `// Utility functions
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}`,
    `// Configuration loader
export async function loadConfig(): Promise<AppConfig> {
  const env = process.env.NODE_ENV || 'development';
  const configPath = path.join(__dirname, \`config.\${env}.json\`);
  
  if (!fs.existsSync(configPath)) {
    throw new Error(\`Config file not found: \${configPath}\`);
  }
  
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}`,
  ];

  // Estimate ~4 chars per token on average
  const charsPerToken = 4;
  const targetChars = targetTokens * charsPerToken;
  
  let padding = '';
  let i = 0;
  while (padding.length < targetChars) {
    padding += '\n\n' + codeSnippets[i % codeSnippets.length];
    i++;
  }
  
  return padding.substring(0, targetChars);
}

/**
 * Generate a "needle" that should be found in the middle of padding
 */
function generateNeedle(): { needle: string; question: string; expectedAnswer: string } {
  return {
    needle: `// CRITICAL CONFIGURATION
const SPECIAL_PORT = 9876;
const SECRET_API_KEY = "sk-needle-in-haystack-test-12345";
const TIMEOUT_MS = 42000;`,
    question: "What is the SPECIAL_PORT value defined in the code?",
    expectedAnswer: "9876"
  };
}

// ============================================================
// CONTEXT FILL TESTER CLASS
// ============================================================

export class ContextFillTester {
  private settings: {
    lmstudioUrl: string;
    [key: string]: any;
  };

  constructor(settings: { lmstudioUrl: string; [key: string]: any }) {
    this.settings = settings;
  }

  /**
   * Run baseline test (0% fill) to establish quality baseline
   */
  async runBaseline(modelId: string): Promise<{ qualityScore: number; latencyMs: number }> {
    const testPrompt = "Read node-api/src/index.ts and tell me what express middleware is used.";
    
    const startTime = Date.now();
    
    try {
      const messages = [
        { role: 'system', content: SANDBOX_CONTEXT },
        { role: 'user', content: testPrompt }
      ];
      
      const tools = getToolSchemas(['read_file', 'rag_query', 'search_files']);
      const result = await intentRouter.route(messages, tools);
      
      const latencyMs = Date.now() - startTime;
      const response = result.finalResponse?.choices?.[0]?.message?.content || '';
      const toolCalls = result.toolCalls || [];
      
      // Score: did it use read_file and provide relevant answer?
      const usedReadFile = toolCalls.some((tc: any) => 
        (tc.function?.name || tc.name) === 'read_file'
      );
      const mentionsMiddleware = response.toLowerCase().includes('middleware') ||
                                  response.toLowerCase().includes('express') ||
                                  response.toLowerCase().includes('cors');
      
      let qualityScore = 0;
      if (usedReadFile) qualityScore += 50;
      if (mentionsMiddleware) qualityScore += 50;
      
      return { qualityScore, latencyMs };
    } catch (error) {
      return { qualityScore: 0, latencyMs: Date.now() - startTime };
    }
  }

  /**
   * Run context fill test at a specific level
   */
  async runContextFillTest(
    modelId: string,
    fillLevel: number, // 25, 50, 75, 90
    contextLimit: number
  ): Promise<ContextFillResult> {
    const targetTokens = Math.floor((contextLimit * fillLevel) / 100);
    const startTime = Date.now();
    
    // Generate padding with needle in the middle
    const { needle, question, expectedAnswer } = generateNeedle();
    const halfPadding = generateCodePadding(Math.floor(targetTokens / 2));
    
    // Build message with padding
    const paddedContext = `${SANDBOX_CONTEXT}\n\n${halfPadding}\n\n${needle}\n\n${halfPadding}`;
    
    try {
      const messages = [
        { role: 'system', content: paddedContext },
        { role: 'user', content: question }
      ];
      
      const tools = getToolSchemas(['read_file', 'rag_query']);
      const result = await intentRouter.route(messages, tools);
      
      const latencyMs = Date.now() - startTime;
      const response = result.finalResponse?.choices?.[0]?.message?.content || '';
      
      // Score: did it find the needle (expected answer)?
      const foundAnswer = response.includes(expectedAnswer);
      const mentionsValue = response.match(/\d{4,5}/); // Looking for port-like numbers
      
      let qualityScore = 0;
      if (foundAnswer) {
        qualityScore = 100;
      } else if (mentionsValue) {
        qualityScore = 50; // Found a number but wrong one
      } else {
        qualityScore = 20; // At least tried to answer
      }
      
      return {
        fillLevel,
        tokensUsed: Math.floor(paddedContext.length / 4), // Estimate
        tokensTarget: targetTokens,
        qualityScore,
        latencyMs,
        passed: qualityScore >= 70,
        details: foundAnswer 
          ? `Found needle at ${fillLevel}% fill` 
          : `Lost needle at ${fillLevel}% fill`
      };
    } catch (error: any) {
      return {
        fillLevel,
        tokensUsed: 0,
        tokensTarget: targetTokens,
        qualityScore: 0,
        latencyMs: Date.now() - startTime,
        passed: false,
        details: `Error at ${fillLevel}% fill: ${error.message}`
      };
    }
  }

  /**
   * Run full context fill profile for a model
   */
  async runContextFillProfile(
    modelId: string,
    contextLimit: number = 8192
  ): Promise<ContextFillProfile> {
    console.log(`[ContextFillTester] Starting context fill profile for ${modelId} (limit: ${contextLimit})`);
    
    const fillLevels = [25, 50, 75, 90];
    const results: ContextFillResult[] = [];
    
    // Run baseline first
    console.log(`[ContextFillTester] Running baseline test...`);
    const baseline = await this.runBaseline(modelId);
    console.log(`[ContextFillTester] Baseline: quality=${baseline.qualityScore}, latency=${baseline.latencyMs}ms`);
    
    // Run each fill level
    for (const level of fillLevels) {
      console.log(`[ContextFillTester] Testing ${level}% context fill...`);
      const result = await this.runContextFillTest(modelId, level, contextLimit);
      results.push(result);
      console.log(`[ContextFillTester] ${level}%: quality=${result.qualityScore}, passed=${result.passed}`);
    }
    
    // Calculate effective max context (where quality drops below 70%)
    let effectiveMaxContext = contextLimit;
    for (const result of results) {
      if (result.qualityScore < 70) {
        effectiveMaxContext = Math.floor((contextLimit * result.fillLevel) / 100);
        break;
      }
    }
    
    // Build degradation curve
    const degradationCurve = [
      baseline.qualityScore,
      ...results.map(r => r.qualityScore)
    ];
    
    return {
      modelId,
      testedAt: new Date().toISOString(),
      contextLimit,
      results,
      effectiveMaxContext,
      degradationCurve,
      baseline
    };
  }
}

// ============================================================
// FACTORY
// ============================================================

let testerInstance: ContextFillTester | null = null;

export function createContextFillTester(settings: { lmstudioUrl: string; [key: string]: any }): ContextFillTester {
  testerInstance = new ContextFillTester(settings);
  return testerInstance;
}

export function getContextFillTester(): ContextFillTester | null {
  return testerInstance;
}


