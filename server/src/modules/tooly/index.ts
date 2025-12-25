/**
 * Tooly Module - Agentic Model Hub
 * 
 * This module provides comprehensive testing, optimization, and configuration
 * for local LLMs to achieve Opus-level agentic coding capabilities.
 * 
 * Main Features:
 * - Enhanced test framework with 14 test categories (1.x - 14.x)
 * - Dual scoring system (raw capabilities + trainability)
 * - Per-model MCP configuration optimization
 * - Intelligent context management
 * - Learning system with pattern extraction
 * - Optimal model pairing recommendations
 */

// ============================================================
// RE-EXPORT TYPES
// ============================================================

export * from './types.js';

// ============================================================
// TESTING
// ============================================================

// Test categories
export { default as FAILURE_MODE_PROBES, generateFailureProfile } from './testing/categories/failure-tests.js';
export { default as STATEFUL_PROBES, STATEFUL_TEST_CONFIGS, generateStatefulConversation, analyzeStatefulResults } from './testing/categories/stateful-tests.js';
export { default as PRECEDENCE_PROBES, generatePrecedenceMatrix } from './testing/categories/precedence-tests.js';
export { default as COMPLIANCE_PROBES, COMPLIANCE_SYSTEM_PROMPTS, calculateComplianceScores } from './testing/categories/compliance-tests.js';
export { default as antipatternDetector, detectAllAntiPatterns } from './testing/categories/antipattern-detector.js';

// ============================================================
// SCORING
// ============================================================

export {
  calculateAgenticScore,
  calculateScoreBreakdown,
  recommendRole,
  AGENTIC_WEIGHTS
} from './scoring/agentic-scorer.js';

export {
  calculateTrainabilityScores,
  getProgrammabilityRating,
  calculateEffectiveScore,
  isWorthTraining,
  TRAINABILITY_WEIGHTS
} from './scoring/trainability-scorer.js';

export {
  scoreForMainRole,
  scoreForExecutorRole,
  calculatePairCompatibility,
  findOptimalPairing,
  getOptimalPairingsForModel
} from './scoring/pairing-recommender.js';

// ============================================================
// ORCHESTRATOR
// ============================================================

export {
  MCPOrchestrator,
  mcpOrchestrator,
  DEFAULT_CONTEXT_BUDGET,
  DEFAULT_RAG_SETTINGS,
  DEFAULT_OPTIMAL_SETTINGS,
  ESSENTIAL_TOOLS,
  STANDARD_TOOLS,
  FULL_TOOLS
} from './orchestrator/mcp-orchestrator.js';

// ============================================================
// CONTEXT MANAGEMENT (Enhanced with Phase 4 Small Model Integration)
// ============================================================

export {
  ContextManager,
  contextManager,
  analyzeQuery,
  estimateTokens,
  estimateToolSchemaTokens
} from './context/context-manager.js';

export {
  ContextAnalyzer,
  contextAnalyzer
} from './context/context-analyzer.js';

export {
  Summarizer,
  summarizer
} from './context/summarizer.js';

// ============================================================
// LEARNING SYSTEM
// ============================================================

export {
  extractPatternFromCorrection,
  extractPatternFromPositive,
  initializeMemory,
  addPatternToMemory,
  updatePatternSuccess,
  decayUnusedPatterns,
  getRelevantPatterns,
  buildPatternInjection,
  addProjectKnowledge,
  buildProjectInjection
} from './learning/learning-system.js';

// ============================================================
// OPTIMAL SETUP
// ============================================================

export {
  detectHardware,
  estimateVramRequirement,
  fitsInVram,
  filterByHardware,
  findOptimalSetup,
  compareModels,
  quickAssessModel
} from './optimal-setup/setup-finder.js';

// ============================================================
// AGENTIC READINESS (Phase 11)
// ============================================================

export {
  AGENTIC_READINESS_SUITE,
  getReadinessConfig,
  calculateCategoryScore,
  calculateOverallScore,
  isPassing
} from './testing/agentic-readiness-suite.js';

export {
  ReadinessRunner,
  createReadinessRunner,
  getReadinessRunner
} from './testing/readiness-runner.js';

export {
  prostheticStore,
  buildProstheticPrompt
} from './learning/prosthetic-store.js';

export {
  ProstheticLoop,
  createProstheticLoop
} from './orchestrator/prosthetic-loop.js';

// ============================================================
// LEGACY EXPORTS (for backward compatibility)
// ============================================================

// Re-export existing modules
export { capabilities, ALL_TOOLS } from './capabilities.js';
export type { ModelProfile, AgenticReadinessStatus } from './capabilities.js';
export { testEngine } from './test-engine.js';
export { ALL_TEST_DEFINITIONS as TEST_DEFINITIONS } from './testing/test-definitions.js';
export { probeEngine } from './probe-engine.js';
export { PROBE_CATEGORIES } from './strategic-probes.js';
export { INTENT_PROBES, runIntentProbes, calculateIntentScores } from './intent-probes.js';

// Import and re-export default exports
import generateRecommendationsDefault from './recommendations.js';
import { calculateBadges as generateBadgesDefault } from './badges.js';
export const generateRecommendations = generateRecommendationsDefault;
export const generateBadges = generateBadgesDefault;

