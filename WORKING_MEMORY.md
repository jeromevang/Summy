# WORKING_MEMORY

## Current Goal
Build a COMPLETE Self-Improving Agentic Testing Platform with comprehensive capability testing, model optimization, combo pair learning, and full frontend visibility

## Testing Philosophy
- **Goal**: Get the MOST out of every model AND model combination (help them succeed)
- **Approach**: Scaffold weaker models/combos with prosthetics learned from stronger ones
- **BUT**: Models must pass qualifying gate first (hard requirements)
- **UI-First**: Everything visible and configurable from frontend
- **CRITICAL MISSING**: Combo testing learning integration - combos don't participate in the learning loop

### 🧪 TEST-PROJECT SANDBOX (COMPLETELY MISSED!)

**Location**: `server/data/test-project/` - Multi-language realistic codebase for testing

#### **Languages Supported**:
- **Node.js API**: Express server with auth, middleware, database services, intentional bugs (SQL injection)
- **Java Spring**: REST API with security vulnerabilities
- **React Web**: Full-stack React app with context/hooks/services
- **React Native**: Mobile app with navigation and authentication
- **Mendix Widget**: Pluggable widget with data binding
- **Shared Utils**: TypeScript utilities (validation, formatting, email/password validation)

#### **Test Realism**:
- **Real code**: All projects are functional, deployable applications
- **Intentional bugs**: Security vulnerabilities for testing model security awareness
- **Multi-language**: Tests models across different technology stacks
- **Complex dependencies**: Real-world code relationships and patterns

**This is the core testing environment that makes the system realistic and comprehensive!**

### 🎯 CONTEXT MANAGEMENT SYSTEM (MISSED!)
**Location**: `context/` - Advanced context processing

#### **Components**:
- **Context Prism**: Multi-dimensional context analysis
- **Decision Engine**: Context-aware routing decisions
- **Context Analyzer**: Deep context understanding
- **Summarizer**: Intelligent context condensation
- **Verification**: Context accuracy validation

### 📊 MODEL PROFILES DATABASE (MISSED!)
**Location**: `server/data/model-profiles/` - 60+ comprehensive model histories

#### **Profile Contents**:
- **Assessment Results**: Full capability scoring across all categories
- **Prosthetic History**: Applied prosthetics and their effectiveness
- **Teaching Results**: Learning cycle outcomes and improvements
- **Context Performance**: Fill-level degradation curves
- **Behavioral Boundaries**: Complexity limits and failure points
- **Multi-turn Memory**: Conversation context retention scores
- **Fault Tolerance**: Error recovery and resilience metrics

### 🔧 CONFIGURABLE TEST SUITE (MISSED!)
**Location**: `agentic-readiness-suite.json` - Runtime-configurable tests

#### **Features**:
- **JSON Configuration**: No code changes needed to modify tests
- **Dynamic Loading**: Tests loaded at runtime, instantly effective
- **Category Weighting**: Adjustable scoring importance per category
- **Evaluation Functions**: Mapped string-to-function for flexible logic
- **Version Control**: JSON file properly tracked in git

---

## 🚨 CRITICAL SYSTEM STATUS: MISSING COMBO LEARNING INTEGRATION

### The Problem
We have built an **INCREDIBLY COMPREHENSIVE self-improving AI system** with:

**✅ EXTENSIVE INFRASTRUCTURE DISCOVERED:**
- ✅ **Multi-language test sandbox** (Node.js, Java, React, React Native, Mendix)
- ✅ **Complete RAG system** with semantic search and dependency graphs
- ✅ **73+ MCP tools** covering file ops, git, npm, browser, shell, memory
- ✅ **Cognitive engine** with span-level observability and tracing
- ✅ **Orchestrator system** with multi-agent coordination
- ✅ **Context management** with prism analysis and verification
- ✅ **60+ model profiles** with comprehensive assessment histories
- ✅ **Configurable test suite** with runtime JSON configuration
- ✅ Complete individual model assessment & teaching
- ✅ Full learning pipeline with prosthetics
- ✅ Comprehensive UI ecosystem
- ✅ Advanced combo testing with VRAM awareness

**BUT**: Despite this **massive infrastructure**, combo testing is **COMPLETELY ISOLATED** from the learning system. When combo pairs fail, they don't participate in the self-improvement loop.

### Current Architecture Gap
```
Individual Models → Readiness → Failures → Controller → Prosthetics → Improvement ✅
Combo Pairs → Testing → Results → Stored → END ❌ (NO LEARNING!)
```

### Impact
- **Individual models**: Get smarter through prosthetics ✅
- **Model pairs**: Stuck at natural performance level ❌
- **Holistic optimization**: ~50% complete ❌

### What Must Be Implemented
1. **Combo Failure Logging** → Connect combo test failures to central failure log
2. **Controller Combo Analysis** → AI analysis of combo performance patterns
3. **Combo-Specific Prosthetics** → Generate prosthetics for combo optimization
4. **Combo Teaching Cycles** → Auto-teach underperforming pairs
5. **Combo Pattern Recognition** → Identify optimization opportunities

**This is the final missing piece for a complete self-improving AI system.**

---

## ✅ COMPLETED (Previous Sessions)

### Backend
1. ✅ **Refactored readiness-runner.ts to use intentRouter.route()** (CRITICAL FIX)
   - Now uses production flow for all tests
   - Supports dual-model mode with Main + Executor
   - Proper tool execution through agentic loop
   
2. ✅ **Implemented Qualifying Gate** (5 hard requirement tests)
   - QG-1: Tool Format Valid (must output proper JSON)
   - QG-2: Instruction Following (must respect system prompt)
   - QG-3: Context Coherence (must not hallucinate)
   - QG-4: Basic Reasoning (must break down tasks)
   - QG-5: State Transition (must use tool results)
   - Fast-fail: Stops immediately if any QG test fails
   
3. ✅ **Added Span-Level Observability**
   - `startTrace()`, `startSpan()`, `endSpan()`, `endTrace()` functions
   - Broadcasts to WebSocket for live visibility
   - Tracks: operation, duration, status, attributes
   - Integrated into `executeAgenticLoop()` and `executeToolCall()`
   
4. ✅ **Implemented Tool-by-Tool Scoring with 3x Flakiness Detection**
   - `runCount` parameter (1-3) for each test
   - Reports consistency % for flaky models
   - Best score used, consistency tracked
   
5. ✅ **Added Error Recovery Testing** (3 new tests)
   - ER-1: File Not Found Recovery
   - ER-2: Tool Failure Recovery
   - ER-3: Graceful Degradation
   - Evaluation functions added to suite

6. ✅ **Updated WebSocket broadcast** with phase and dual-model info
   - `phase`: 'qualifying' | 'discovery'
   - `mode`: 'single' | 'dual'
   - `attribution`: 'main' | 'executor' | 'loop'

7. ✅ **Extended capabilities.ts** with new fields
   - `qualifyingGatePassed`, `disqualifiedAt`
   - `mode`, `executorModelId`
   - `testResults` array with full details

### Frontend
1. ✅ **Enhanced AgenticReadiness.tsx** (Main Hub)
   - Hardware detection panel (GPU, VRAM, RAM)
   - Model scanner with VRAM fit indicator
   - Qualifying Gate visual panel with 5 status indicators
   - Tool-by-tool capability grid
   - WebSocket integration for live updates
   
2. ✅ **Added Dual-Model Test Flow Visualization**
   - `DualModelFlowViz` component
   - Shows Main → Executor → Loop flow
   - Real-time step highlighting
   - Attribution indicators
   
3. ✅ **Added Observability Panel**
   - Collapsible trace log viewer
   - Live span streaming
   - Color-coded by status (running/success/error)
   - Shows duration and attributes
   
4. ✅ **Removed OptimalSetup Page**
   - Deleted `OptimalSetup.tsx`
   - Deleted `useOptimalSetup.ts`
   - Route redirects to `/tooly/readiness`
   - All functionality moved to AgenticReadiness

---

## ✅ COMPLETED (Current Session - Dec 27, 2024)

### Backend - Multi-Turn & Boundary Tests
1. ✅ **Multi-Turn Conversation Tests** (MT-1, MT-2, MT-3)
   - `agentic-readiness-suite.json`: Added MT-1 (Context Retention), MT-2 (Reference Resolution), MT-3 (Tool Result Memory)
   - `agentic-readiness-suite.ts`: Added `evaluateContextRetention()`, `evaluateReferenceResolution()`, `evaluateToolResultMemory()`
   - `readiness-runner.ts`: Added `runMultiTurnTest()` method for conversation-based testing
   - Tests build conversation history across turns and evaluate memory

2. ✅ **Behavioral Boundary Detection** (BB-1, BB-2, BB-3)
   - `agentic-readiness-suite.json`: Added BB-1 (2-tool chain), BB-2 (4-tool chain), BB-3 (Decision Nesting)
   - `agentic-readiness-suite.ts`: Added `evaluateToolChain()`, `evaluateDecisionNesting()`
   - New categories: `multi_turn` and `boundary` with 10% weight each

3. ✅ **Context Window Fill Testing** (NEW FILE)
   - Created `context-fill-tester.ts`
   - Tests at 25%, 50%, 75%, 90% context fill levels
   - Measures quality degradation ("lost in middle" test)
   - Calculates `effectiveMaxContext` (where quality < 70%)
   - Generates `degradationCurve` for visualization

4. ✅ **Knowledge Distillation Pipeline** (NEW FILE)
   - Created `learning/knowledge-distiller.ts`
   - Extracts patterns from strong models (teacher)
   - Generates prosthetics for weak models (student)
   - Test cases for: `rag_usage`, `tool_selection`, `multi_step_reasoning`
   - Pattern types: Tool Sequence, RAG-First, RAG-Then-Read

5. ✅ **Prosthetic Store Versioning**
   - Updated `prosthetic-store.ts` with version tracking
   - Added: `ProstheticVersion` interface, `currentVersion`, `versions[]`
   - Added: `targetTaskTypes`, `contextSizeRange`, `learnedFromModel`

6. ✅ **New API Routes** (tooly.ts)
   - `GET/PUT/DELETE /api/tooly/prosthetics/:modelId` - Prosthetic CRUD
   - `POST /api/tooly/context-fill/:modelId` - Run context fill test
   - `POST /api/tooly/distillation/run` - Run knowledge distillation
   - `GET /api/tooly/distillation/capabilities` - List distillation capabilities
   - `POST /api/tooly/combo-test/run` - Batch combo testing with VRAM filtering
   - `GET /api/tooly/combo-test/results` - Combo test results leaderboard

### Frontend
7. ✅ **Prosthetic Manager UI** (NEW PAGE)
   - Created `ProstheticManager.tsx` at `/tooly/prosthetics`
   - Library tab: View all prosthetics with filters (verified, level)
   - Editor tab: Edit prompt, select level, version history
   - Distillation tab: Teacher/Student model selection, run distillation

8. ✅ **Model Detail Charts** (NEW COMPONENT)
   - Created `components/ModelDetailCharts.tsx`
   - `ContextDegradationChart`: Line chart showing quality vs context fill
   - `LatencyProfileChart`: Latency and TPS at different context sizes
   - `BehavioralBoundariesChart`: Bar chart for tool chain success

9. ✅ **Updated AgenticReadiness.tsx**
   - Added `multi_turn`, `boundary`, and `fault_injection` to `CategoryScore` interface
   - Updated `CATEGORIES` array with new categories (10% weight each)
   - Adjusted existing category weights (tool: 20%, rag: 18%, etc.)

10. ✅ **Fault Injection Tests** (FI-1, FI-2, FI-3)
    - `agentic-readiness-suite.json`: Added FI-1 (File Not Found Recovery), FI-2 (Permission Denied), FI-3 (Graceful Error)
    - `agentic-readiness-suite.ts`: Added `evaluateFaultRecovery()` function
    - New category `fault_injection` with 7% weight

11. ✅ **Test Configuration Panel** (NEW COMPONENT)
    - Created `components/TestConfigPanel.tsx`
    - Configurable timeouts (soft/hard)
    - Test category toggles
    - Context fill level selection
    - Multi-turn settings
    - Flakiness detection (1x, 2x, 3x runs)
    - Integrated into AgenticReadiness with ⚙️ Config button

---

## ✅ ADDITIONAL COMPLETED (Current Session - Dec 27, 2024)

### Backend - VRAM-Aware Combo Testing
12. ✅ **Combo Testing with VRAM Filtering**
    - `combo-tester.ts`: Complete rewrite with VRAM-aware filtering
    - `filterCombosByVram()`: Smart combination selection based on 16GB limit
    - Model size estimation: 30B/32B = 12GB, 14B/8B = 8GB, 4B/7B = 4GB
    - Only tests VRAM-compatible combinations
    - Console logging: `✅ VRAM OK: ModelA + ModelB = XGB ≤ 16GB`

13. ✅ **Combo Testing API Integration**
    - `routes/tooly.ts`: `/api/tooly/combo-test/run` endpoint
    - WebSocket broadcasting for real-time progress
    - Batch testing of all selected Main × Executor combinations
    - Results storage in dedicated combo database table

### Frontend - Combo Testing UI
14. ✅ **ComboTest.tsx Page**
    - `/tooly/combo-test` route with full interface
    - Model selection: Separate Main and Executor dropdowns
    - VRAM calculator: Shows "16GB VRAM available (filtered)" status
    - "🚀 Test All Combos" button with progress tracking
    - Results leaderboard with detailed scoring breakdown
    - Real-time WebSocket updates during testing

15. ✅ **VRAM Status Integration**
    - Dynamic combo calculation: "X combos × 9 tests = Y total tests"
    - VRAM filtering indication in UI
    - Prevents testing of incompatible combinations upfront

---

## 🏗️ COMPLETE SYSTEM ARCHITECTURE (What We Have)

### Core Components Status

| Component | Status | Location | Purpose |
|-----------|--------|----------|---------|
| **Readiness Assessment** | ✅ 100% | `AgenticReadiness.tsx` | Individual model capability testing |
| **Prosthetic Learning** | ✅ 100% | `ProstheticManager.tsx` | Knowledge distillation & teaching |
| **Controller Dashboard** | ✅ 100% | `Controller.tsx` | Failure analysis & pattern recognition |
| **Combo Testing** | ✅ 100% | `ComboTest.tsx` | Model pair optimization |
| **Failure Logging** | ✅ 100% | `failure-log.ts` | Central failure capture |
| **WebSocket Broadcasting** | ✅ 100% | `ws-broadcast.ts` | Real-time UI updates |
| **RAG System** | ✅ 100% | `rag-server/` | Semantic code search & indexing |
| **MCP Tools** | ✅ 100% | `mcp-server/` | 73+ tool execution capabilities |
| **Cognitive Engine** | ✅ 100% | `cognitive-engine.ts` | Agentic loop execution with observability |
| **Multi-Service Architecture** | ✅ 100% | server/rag-server/mcp-server | Distributed processing |
| **Test-Project Sandbox** | ✅ 100% | `server/data/test-project/` | Multi-language realistic testing |
| **Orchestrator System** | ✅ 100% | `orchestrator/` | Advanced agent coordination |
| **Context Management** | ✅ 100% | `context/` | Prism, decision engine, verification |
| **Model Profiles** | ✅ 100% | `model-profiles/` | 60+ model assessment histories |
| **Multi-Service Architecture** | ✅ 100% | server/rag-server/mcp-server | Distributed processing |

### Learning Pipeline (Individual Models)
```
Model → Readiness Test → Failures Logged → Controller Analysis →
Pattern Recognition → Prosthetic Generation → Teaching Cycle →
Model Improvement → Re-testing → SUCCESS ✅
```

### Combo Testing Pipeline (Isolated)
```
Model Pairs → VRAM Filter → Combo Testing → Results Stored →
Leaderboard Display → END ❌ (NO LEARNING INTEGRATION)
```

### 🔍 RAG SYSTEM (MISSED!)
**Location**: `rag-server/` - Complete semantic code search engine

#### **Components**:
- **Embeddings**: LMStudio integration for vector generation
- **Indexing**: Automatic codebase indexing with LanceDB/HNSW
- **Query Router**: Intelligent search across multiple storage backends
- **Dependency Graph**: Static analysis of code relationships
- **Summarizer**: Context-aware result synthesis
- **Tokenizer**: Advanced text processing

#### **Capabilities**:
- **Semantic Search**: Find code by meaning, not keywords
- **Multi-backend**: SQLite, LanceDB, HNSWlib support
- **Real-time Updates**: File watcher for automatic re-indexing
- **Dependency Analysis**: Import/export relationship mapping

### 🛠️ MCP TOOLS SYSTEM (MISSED!)
**Location**: `mcp-server/` - 73+ tool execution capabilities

#### **Tool Categories**:
- **File Operations** (13): read/write/edit/delete files, search, copy, move
- **Git Operations** (17): status, diff, log, commit, branch, stash, blame
- **NPM Operations** (7): install, run, build, test, init
- **Browser Automation** (17): Playwright-based web interaction
- **HTTP/Search** (2): web requests, search capabilities
- **Code Execution** (4): shell, Node.js, TypeScript execution
- **Memory** (4): persistent storage and retrieval
- **Process** (2): list and kill processes
- **Archive** (2): zip/unzip operations
- **RAG** (3): semantic code search integration
- **Code-Aware** (5): symbol lookup, callers, dependencies, file interfaces
- **Utility** (6): environment, JSON, base64, text operations

### 🧠 COGNITIVE ENGINE (MISSED!)
**Location**: `cognitive-engine.ts` - Advanced agentic execution

#### **Features**:
- **Span-level Observability**: Detailed execution tracing
- **Tool Execution**: MCP tool integration with error handling
- **Context Management**: Prism-based context processing
- **Decision Engine**: Intelligent routing decisions
- **Verification Loop**: Result validation and correction
- **Swarm Router**: Multi-agent coordination

#### **Observability**:
- **Trace Collection**: Request-to-response execution tracking
- **Span Timing**: Individual operation performance metrics
- **Real-time Broadcasting**: WebSocket updates for UI
- **Error Attribution**: Precise failure location tracking

### 🎭 ORCHESTRATOR SYSTEM (MISSED!)
**Location**: `orchestrator/` - Advanced multi-agent coordination

#### **Components**:
- **Prosthetic Loop**: Automated teaching cycles for models
- **Agent Decide/Search/Verify**: Multi-step agent workflows
- **MCP Orchestrator**: Tool execution coordination
- **Swarm Router**: Distributed agent management
- **Config Generator**: Dynamic agent configuration
- **Tool Profiler**: Performance analysis and optimization

---

## 🚨 THE MISSING INTEGRATION: Combo Testing Learning Loop

### Current Problem
**Combo testing operates as a standalone optimization tool** - it finds good model pairs but doesn't participate in the self-improvement ecosystem.

### What Should Happen (Missing Implementation)
```
Combo Test Failure → Failure Log → Controller Analysis →
Combo Pattern Recognition → Combo-Specific Prosthetic →
Combo Teaching Cycle → Better Pair Performance →
Continuous Combo Optimization
```

### Specific Missing Components

#### 1. Combo Failure Logging ❌
**File**: `combo-tester.ts` (line ~640)
**Issue**: Combo test failures aren't logged to `failureLog.logFailure()`
**Impact**: Controller never sees combo performance issues

#### 2. Controller Combo Analysis ❌
**File**: `controller/analyze` endpoint
**Issue**: Controller only analyzes individual model failures, not combo patterns
**Impact**: No "why do Qwen3+Llama3 combos fail?" insights

#### 3. Combo-Specific Prosthetics ❌
**File**: `prosthetic-store.ts`
**Issue**: Prosthetics are per-model, not per-combo
**Impact**: Can't optimize specific model pair interactions

#### 4. Combo Teaching Cycles ❌
**File**: `prosthetic-loop.ts`
**Issue**: Teaching cycles only work on individual models
**Impact**: Combo pairs can't be iteratively improved

#### 5. Combo Pattern Recognition ❌
**File**: `failure-log.ts` + controller analysis
**Issue**: No combo-specific failure categorization
**Impact**: Can't identify combo optimization opportunities

### Why This Matters
- **Individual models**: Get prosthetics and improve ✅
- **Model combinations**: Stuck at natural performance ❌
- **Production optimization**: Incomplete without combo learning

---

## 🧠 Existing Learning System

### Core Components (Already Built)
| File | Purpose | Status |
|------|---------|--------|
| `learning/prosthetic-loop.ts` | Automated teach cycle (assess → fail → prosthetic → re-test) | ✅ Works |
| `learning/prosthetic-store.ts` | Persists prosthetics to disk, tracks verified/success | ✅ Works |
| `learning/learning-system.ts` | Long-term memory (preferences, patterns) | ✅ Works |
| `learning/pattern-extractor.ts` | Extracts patterns from corrections | ✅ Works |
| `scoring/trainability-scorer.ts` | Scores how teachable a model is | ✅ Works |
| `scoring/pairing-recommender.ts` | Main + Executor compatibility scoring | ✅ Works |

### How Teaching Works (prosthetic-loop.ts)
```
1. Initial Assessment → Score + Failed Tests
         ↓
2. Generate Prosthetic (Level 1-4) based on failures
         ↓
3. Apply prosthetic to model profile (systemPrompt)
         ↓
4. Re-run assessment
         ↓
5. If improved → mark verified, save to prosthetic-store.json
   If not → escalate level (1→2→3→4), repeat
         ↓
6. Certify model if target reached
```

### Prosthetic Levels
- **Level 1**: Hints (soft suggestions)
- **Level 2**: Requirements (clear expectations)
- **Level 3**: Mandatory constraints (MUST/NEVER)
- **Level 4**: Hard rules with examples

### What's Missing in Learning System
1. **Versioning** - Track multiple versions of prosthetics
2. **Context-aware selection** - Pick prosthetic based on task type
3. **Knowledge distillation** - Learn FROM strong models (not just from failures)
4. **Frontend UI** - View/edit/manage prosthetics

---

## Existing Infrastructure

### Test-Project Sandbox
**Location**: `server/data/test-project/`

Multi-language codebase for realistic agentic testing:
- `node-api/` - Node.js with routes, middleware, services
- `react-web/` - React with context, hooks, components
- `java-service/` - Java Spring-like project
- `react-native-app/` - Mobile app navigation, screens
- `mendix-widget/` - Mendix widget development
- `shared-utils/` - TypeScript utilities, validation

All tests run against this sandbox - models read/write/search real code.

### Key Components
- `readiness-runner.ts` - ✅ Uses intentRouter.route()
- `agentic-readiness-suite.json` - ✅ 28 tests (5 QG + 20 AR + 3 ER)
- `combo-tester.ts` - ✅ Uses intentRouter.route()
- `intent-router.ts` - ✅ Production flow: Single + Dual-Model
- `cognitive-engine.ts` - ✅ With span observability

---

## Production Line (Test Pipeline)

```
┌─────────────────────────────────────────────────────────────────┐
│                    PRODUCTION LINE                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐     │
│  │ QUALIFY  │──▶│ DISCOVER │──▶│ TRAIN    │──▶│ VALIDATE │     │
│  │ (30s)    │   │ (2-3min) │   │ (auto)   │   │ (1min)   │     │
│  └──────────┘   └──────────┘   └──────────┘   └──────────┘     │
│       │              │              │              │            │
│       ▼              ▼              ▼              ▼            │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐     │
│  │Pass/Fail │   │Tool-by-  │   │Generate  │   │Re-test   │     │
│  │Gate      │   │Tool Scan │   │Prosthetic│   │with Help │     │
│  └──────────┘   └──────────┘   └──────────┘   └──────────┘     │
│                                                                  │
│  All stages use test-project sandbox for realistic testing      │
│  All stages run through intentRouter.route() (real flow)        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Test Suite Summary

### Qualifying Gate (QG-1 to QG-5) - MUST ALL PASS
| Test | What It Checks |
|------|----------------|
| QG-1 | Valid tool call format (JSON structure) |
| QG-2 | Instruction following (uses correct tools) |
| QG-3 | Context coherence (no hallucination) |
| QG-4 | Basic reasoning (multi-step breakdown) |
| QG-5 | State transition (uses tool results) |

### Capability Discovery (AR-1 to AR-20)
| Category | Tests | Weight |
|----------|-------|--------|
| Tool | AR-1 to AR-5 | 30% |
| RAG | AR-6 to AR-9 | 25% |
| Reasoning | AR-10 to AR-13 | 20% |
| Intent | AR-14 to AR-16 | 15% |
| Browser | AR-17 to AR-20 | 10% |

### Error Recovery (ER-1 to ER-3)
| Test | What It Checks |
|------|----------------|
| ER-1 | File not found recovery |
| ER-2 | Tool failure recovery |
| ER-3 | Graceful degradation |

---

## 🔜 NEXT ACTIONS (Detailed Implementation Guide)

### Backend Task 1: Multi-Turn Conversation Tests

**Goal**: Test context retention across 3+ turns, reference resolution

**Add to `agentic-readiness-suite.json`**:
```json
{
  "id": "MT-1",
  "name": "Context Retention",
  "category": "multi_turn",
  "description": "Model remembers context from previous turns",
  "turns": [
    { "role": "user", "content": "Read node-api/src/index.ts" },
    { "role": "assistant", "toolCall": "read_file" },
    { "role": "user", "content": "What port does it listen on?" }
  ],
  "expectedBehavior": "Answer from file content, not hallucinate"
},
{
  "id": "MT-2", 
  "name": "Reference Resolution",
  "category": "multi_turn",
  "turns": [
    { "role": "user", "content": "Find the auth middleware" },
    { "role": "assistant", "toolCall": "rag_query" },
    { "role": "user", "content": "Read that file" }
  ],
  "expectedBehavior": "Resolve 'that file' to RAG result"
},
{
  "id": "MT-3",
  "name": "Tool Result Memory",
  "category": "multi_turn",
  "turns": [
    { "role": "user", "content": "List files in node-api/src" },
    { "role": "assistant", "toolCall": "list_directory" },
    { "role": "user", "content": "Read the first one" }
  ],
  "expectedBehavior": "Remember list results, pick first file"
}
```

**Implementation in `readiness-runner.ts`**:
- Add `runMultiTurnTest(test, modelId)` method
- Build conversation array, call `intentRouter.route()` for each turn
- Track if model correctly references previous context
- Evaluate with semantic matching (not exact string)

**Files to modify**:
- `server/data/agentic-readiness-suite.json` - Add MT-1, MT-2, MT-3
- `server/src/modules/tooly/testing/readiness-runner.ts` - Add multi-turn runner
- `server/src/modules/tooly/testing/agentic-readiness-suite.ts` - Add evaluators

---

### Backend Task 2: Context Window Fill Tests

**Goal**: Test at 25%, 50%, 75%, 90% context fill, measure degradation

**New file**: `server/src/modules/tooly/testing/context-fill-tester.ts`

```typescript
interface ContextFillResult {
  fillLevel: number; // 25, 50, 75, 90
  tokensUsed: number;
  qualityScore: number; // 0-100
  latencyMs: number;
  degradationFromBaseline: number; // % drop
}

async function runContextFillTest(
  modelId: string,
  fillLevel: number,
  contextLimit: number
): Promise<ContextFillResult> {
  // 1. Calculate target tokens (contextLimit * fillLevel / 100)
  // 2. Generate padding content (use lorem ipsum or code snippets)
  // 3. Insert actual test prompt at END (test "lost in middle")
  // 4. Run through intentRouter.route()
  // 5. Measure quality vs baseline (0% fill)
  // 6. Track latency increase
}
```

**What to measure**:
- Quality drop at each level
- "Lost in the middle" retrieval (can it find info buried in context?)
- Latency increase per fill level
- Find "effective max context" (where quality drops below 70%)

**Store results in model profile**:
```typescript
contextPerformance: {
  testedAt: string;
  results: ContextFillResult[];
  effectiveMaxContext: number; // Tokens before quality < 70%
  degradationCurve: number[]; // [100, 95, 80, 60] at each level
}
```

---

### Backend Task 3: Behavioral Boundary Detection

**Goal**: Find complexity cliff - max tool chain, nesting depth

**New tests in suite**:
```json
{
  "id": "BB-1",
  "name": "Tool Chain Length",
  "category": "boundary",
  "description": "Progressive tool chain: 2 → 4 → 6 → 8 tools",
  "chains": [
    ["rag_query", "read_file"],
    ["rag_query", "read_file", "search_files", "read_file"],
    // ... up to 8
  ],
  "findBreakpoint": true
},
{
  "id": "BB-2",
  "name": "Decision Nesting Depth",
  "category": "boundary",
  "description": "Nested conditionals: if X then if Y then if Z",
  "maxDepth": 5
},
{
  "id": "BB-3",
  "name": "Graceful Degradation Pattern",
  "category": "boundary",
  "description": "Does model simplify when overwhelmed, or crash?"
}
```

**Implementation**:
- Start with simple task, progressively add complexity
- Find "cliff" where success rate drops sharply
- Store in profile: `behavioralBoundaries: { maxChainLength, maxNestingDepth, complexityCliff }`

---

### Backend Task 4: Prosthetic Learning Pipeline + Versioning

**Enhance `prosthetic-store.ts`**:
```typescript
interface ProstheticVersion {
  version: number;
  prompt: string;
  createdAt: string;
  scoreImprovement: number;
  testedAgainst: string[]; // Test IDs
}

interface ProstheticEntry {
  modelId: string;
  currentVersion: number;
  versions: ProstheticVersion[]; // Version history
  // ... existing fields
}
```

**Knowledge Distillation (NEW)**:
```typescript
// New file: server/src/modules/tooly/learning/knowledge-distiller.ts

async function distillFromStrongModel(
  strongModelId: string,
  weakModelId: string,
  capability: string
): Promise<ProstheticPrompt> {
  // 1. Run test on strong model, capture successful response
  // 2. Extract patterns: tool order, reasoning style, format
  // 3. Build prosthetic that teaches weak model these patterns
  // 4. Test on weak model, validate improvement
}
```

---

### Backend Task 5: Context-Aware Prosthetic Selection

**Enhance `intent-router.ts`**:
```typescript
private async selectProsthetic(
  modelId: string,
  query: string
): Promise<string | null> {
  const taskType = this.classifyTask(query);
  // 'rag_heavy' | 'tool_heavy' | 'reasoning' | 'browser' | 'multi_step'
  
  const prosthetics = prostheticStore.getForModel(modelId);
  
  // Find prosthetic that matches task type
  return prosthetics.find(p => p.targetTaskTypes.includes(taskType));
}
```

**Store task-type metadata on prosthetics**:
```typescript
interface ProstheticEntry {
  // ... existing
  targetTaskTypes: string[]; // ['rag_heavy', 'multi_step']
  contextSizeRange: [number, number]; // [0, 8000] tokens
}
```

---

### Backend Task 6: Fault Injection Testing

**New tests**:
```json
{
  "id": "FI-1",
  "name": "Timeout Handling",
  "category": "fault_injection",
  "inject": { "type": "delay", "ms": 15000 },
  "expectedBehavior": "Model should handle gracefully, not crash"
},
{
  "id": "FI-2",
  "name": "Permission Denied",
  "category": "fault_injection",
  "inject": { "type": "error", "tool": "write_file", "error": "EACCES" },
  "expectedBehavior": "Model should report error, suggest alternatives"
},
{
  "id": "FI-3",
  "name": "Network Failure",
  "category": "fault_injection",
  "inject": { "type": "error", "tool": "web_search", "error": "ECONNREFUSED" },
  "expectedBehavior": "Model should handle gracefully"
}
```

---

## 🖥️ Frontend Implementation Guide

### Frontend Task 1: Model Detail Charts

**Location**: `client/src/pages/tooly/ModelDetailV2.tsx` (or new component)

**Charts to add**:
1. **Context Degradation Curve**
   - X-axis: % context filled (25/50/75/90)
   - Y-axis: Quality score (0-100)
   - Line chart with Recharts

2. **Latency Profile**
   - TTFT distribution (histogram)
   - TPS over time (line)
   - Timeout incidents (scatter)

3. **Behavioral Boundaries**
   - Max tool chain achieved (bar)
   - Max nesting depth (bar)
   - Complexity cliff indicator (annotation)

**Data source**: Fetch from `/api/tooly/models/:id` which returns `contextPerformance`, `behavioralBoundaries`

---

### Frontend Task 2: Prosthetic Management UI

**New page**: `client/src/pages/tooly/ProstheticManager.tsx`

**Components**:
1. **Prosthetic Library**
   - Table: Model | Level | Probes Fixed | Verified | Actions
   - Filter by model, level, verified status
   - "Learned from [model]" badge

2. **Prosthetic Editor**
   - Monaco editor for prompt text
   - "Test Live" button → runs single test with prosthetic
   - Version dropdown → select previous versions
   - Save/Revert buttons

3. **Learning Pipeline Controls**
   - Select "teacher" model (strong model)
   - Select "student" model (weak model)
   - Select capability to distill
   - "Run Distillation" button
   - Review generated prosthetic before applying

**API endpoints needed**:
- `GET /api/tooly/prosthetics` - List all
- `GET /api/tooly/prosthetics/:modelId` - Get for model
- `PUT /api/tooly/prosthetics/:modelId` - Update
- `DELETE /api/tooly/prosthetics/:modelId` - Delete
- `POST /api/tooly/prosthetics/distill` - Run distillation

---

### Frontend Task 3: Test Configuration Panel

**Location**: Modal or `/tooly/settings`

**Sections**:
1. **Timeout Settings**
   - Soft timeout (default 10s) - slider
   - Hard timeout (default 60s) - slider
   - Per-test overrides - table

2. **Test Selection**
   - Checkboxes for each category (tool/rag/reasoning/intent/browser)
   - Individual test toggles (collapsible per category)
   - "Qualifying Only" quick button

3. **Context Window Test Settings**
   - Fill levels to test: [25, 50, 75, 90] - multi-select
   - Quality threshold (default 70%) - slider

4. **Multi-Turn Settings**
   - Number of turns: 3/5/10 - dropdown
   - Scenario templates - select

---

### Frontend Task 4: Combo Leaderboard

**Location**: `/tooly/combos` or tab in AgenticReadiness

**Components**:
1. **VRAM Calculator**
   - Available: 16GB (from hardware detection)
   - Model size estimates (from model list)
   - Matrix: Main models × Executor models
   - Green = fits, Red = too big

2. **Combo Test Runner**
   - Select Main dropdown
   - Select Executor dropdown
   - "Test Combo" button
   - Progress indicator

3. **Leaderboard Table**
   - Columns: Rank | Main | Executor | Score | VRAM | Certified
   - Sort by score, filter by certified
   - Click row → see detailed breakdown

---

### Frontend Task 5: Dashboard Widgets

**Location**: Main `/tooly` dashboard

**Widgets**:
1. **System Status Card**
   - Models loaded (Main/Executor names)
   - VRAM usage (bar chart)
   - Last test timestamp

2. **Quick Actions**
   - "Run Readiness" → opens AgenticReadiness
   - "Test All Combos" → starts batch
   - "View Failures" → opens failure log

3. **Recent Activity Feed**
   - Last 10 test results
   - Capability changes (native → blocked)
   - Prosthetic updates

---

## Key Decisions

1. ✅ Remove Smoke Test & Quick Mode - Readiness is THE comprehensive test
2. ✅ Qualifying gate first - Fast fail unqualified models
3. ✅ Tool-by-tool granularity - Know exactly what to train
4. ✅ Prosthetics from strong models - Knowledge distillation
5. ✅ Trace execution, not just output - Catch wrong-path successes
6. ✅ UI-First - All features accessible from frontend
7. ✅ Live visibility - Real-time updates via WebSocket
8. ✅ Error recovery testing - Dedicated tests for failure handling
9. ✅ Use test-project sandbox - All tests run against real code
10. ✅ Dual-model first-class support - UI shows both models
11. ✅ RAG always enabled - Tests run with real RAG context
12. ✅ Flakiness detection - Run 3x, report consistency %
13. ✅ Temperature = 0 only - Deterministic testing
14. ✅ Span-level observability - Track every tool call

---

## Timeout & Performance Strategy

| Threshold | Action |
|-----------|--------|
| >10s | ⚠️ Flag as "slow", continue, penalize latency score |
| >30s | 🟡 Warning - likely struggling, may still complete |
| >60s | 🔴 Hard timeout - kill, mark as failed, log context size |

**Track**: TTFT (time to first token), TPS (tokens per second), total time

---

## Observability (3 Levels)

1. **Request-level**: Overall pass/fail per test
2. **Trace-level**: Full workflow visibility (traceId)
3. **Span-level**: Individual tool/LLM call timing

### Span Events (WebSocket)
- `trace_start`: New trace started
- `span_start`: Span began (tool/llm/iteration)
- `span_end`: Span completed with duration
- `trace_end`: Trace completed with summary

---

## Files Modified/Created (Previous Session)

### Backend
- `server/src/modules/tooly/testing/readiness-runner.ts` - Major refactor
- `server/src/modules/tooly/testing/agentic-readiness-suite.ts` - New evaluators
- `server/data/agentic-readiness-suite.json` - Added QG + ER tests
- `server/src/modules/tooly/cognitive-engine.ts` - Added observability
- `server/src/modules/tooly/capabilities.ts` - Extended types
- `server/src/services/ws-broadcast.ts` - Enhanced readiness progress
- `server/src/routes/tooly.ts` - Dual-model + runCount support

### Frontend
- `client/src/pages/tooly/AgenticReadiness.tsx` - Major enhancement
- `client/src/App.tsx` - Updated routes, OptimalSetup redirect

### Deleted
- `client/src/pages/tooly/OptimalSetup.tsx`
- `client/src/pages/tooly/hooks/useOptimalSetup.ts`

---

## Priority Order for Implementation

1. **Multi-turn conversation tests** (Backend) - Highest impact on agentic capability
2. **Context window fill tests** (Backend) - Critical for understanding model limits
3. **Prosthetic Management UI** (Frontend) - Makes learning system usable
4. **Knowledge distillation pipeline** (Backend) - Core of "help models succeed"
5. **Model detail charts** (Frontend) - Visualize performance data
6. **Behavioral boundary detection** (Backend) - Find complexity cliffs
7. **Test configuration panel** (Frontend) - User control over testing
8. **Combo leaderboard** (Frontend) - Compare model pairings
9. **Context-aware prosthetic selection** (Backend) - Smart prosthetic use
10. **Fault injection testing** (Backend) - Robustness testing
11. **Dashboard widgets** (Frontend) - Quality of life

---

## 🎯 IMMEDIATE NEXT STEPS: Complete Combo Learning Integration

### Priority Implementation Order

#### **Phase 1: Combo Failure Logging** (HIGH PRIORITY)
1. **Modify `combo-tester.ts`**: Add failure logging calls
   - Log combo test failures to central failure log
   - Include combo-specific metadata (mainModel, executorModel)
   - Categorize as "combo_failure" type

2. **Extend Failure Categories**:
   ```typescript
   export type FailureCategory =
     | 'tool' | 'rag' | 'reasoning' | 'intent' | 'browser' | 'unknown'
     | 'combo_pairing'; // NEW
   ```

#### **Phase 2: Controller Combo Analysis**
3. **Update Controller Analysis**: Recognize combo patterns
   - Analyze "combo_pairing" failures
   - Identify problematic model combinations
   - Generate combo-specific improvement suggestions

4. **Combo Pattern Recognition**:
   - "Model A + Model B always fails on X task"
   - "Certain model pairs have poor executor handoff"
   - "Specific combinations excel at certain capabilities"

#### **Phase 3: Combo-Specific Prosthetics**
5. **Extend Prosthetic System**: Support combo prosthetics
   ```typescript
   interface ProstheticEntry {
     modelId?: string;           // Individual model
     comboId?: string;          // "mainModel-executorModel"
     // ... existing fields
   }
   ```

6. **Combo Teaching Cycles**: Create combo-specific teaching
   - Test combo pair → detect failures → generate prosthetic → re-test
   - Optimize specific pair interactions

#### **Phase 4: UI Integration**
7. **Combo Learning Dashboard**: Show combo improvement over time
   - Combo performance trends
   - Active combo prosthetics
   - Combo teaching cycle status

### Expected Outcome
**Complete self-improving AI system** where both individual models AND model combinations continuously optimize through the learning pipeline.

---

## 📋 QUICK REFERENCE: System Status

### ✅ FULLY IMPLEMENTED (MASSIVE SYSTEM!)
- **Multi-language test sandbox** (6 languages, real applications)
- **Complete RAG system** (semantic search, dependency graphs)
- **73+ MCP tools** (file, git, npm, browser, shell, memory)
- **Cognitive engine** (observability, tracing, tool execution)
- **Orchestrator system** (multi-agent coordination)
- **Context management** (prism, decision engine, verification)
- **60+ model profiles** (comprehensive assessment histories)
- **Configurable test suite** (runtime JSON configuration)
- Individual model assessment & teaching
- Prosthetic learning pipeline
- Controller failure analysis
- VRAM-aware combo testing
- Complete UI ecosystem
- Multi-service architecture

### ❌ CRITICALLY MISSING
- Combo testing learning integration
- Combo failure logging to central system
- Combo-specific prosthetics
- Combo teaching cycles

### 🎯 MISSION
**Transform combo testing from standalone optimization tool into active participant in the MASSIVE self-improving AI ecosystem we've built.**

### 📊 SCALE OF WHAT EXISTS
- **4 Major Services**: Server, RAG, MCP, Client
- **1000+ Files**: Comprehensive codebase
- **60+ Models**: Profiled and assessed
- **73+ Tools**: Available for execution
- **6 Languages**: Supported in test sandbox
- **28+ Tests**: Configurable test suite
- **Complete Learning Pipeline**: For individual models

**We built an INCREDIBLE system - now we just need to connect combo testing to it!**

---

## 🔄 SESSION RESUME POINT: COMBO LEARNING INTEGRATION

### 🎯 CURRENT STATUS (Ready for Implementation)
- **System**: Complete self-improving AI infrastructure ✅
- **Missing**: Combo testing learning integration ❌
- **Priority**: Connect combo failures to learning pipeline 🔗

### 🚀 NEXT IMMEDIATE STEPS
1. **Mark combo_failure_logging as in_progress**
2. **Modify combo-tester.ts** to log failures to failure-log.ts
3. **Add 'combo_pairing' failure category**
4. **Update controller analysis** to handle combo patterns
5. **Implement combo-specific prosthetics**
6. **Add combo teaching cycles**

### 📋 CRITICAL CONTEXT FOR CONTINUATION
- **Entry Point**: Start with combo_failure_logging todo
- **Key Files**: combo-tester.ts, failure-log.ts, controller/analyze
- **Goal**: Make combo testing participate in the learning ecosystem
- **Impact**: Complete the self-improving AI system

## 🎯 **SESSION STATUS: COMPLETE COMBO LEARNING INTEGRATION**

### ✅ **ALL TASKS COMPLETED SUCCESSFULLY**

**Combo Learning Integration**: 100% Complete
- ✅ Combo failure logging to central system
- ✅ Controller combo analysis with specialized prompts
- ✅ Combo-specific prosthetics (separate from individual models)
- ✅ Combo teaching cycles (test → fail → prosthetic → re-test)
- ✅ Combo learning dashboard with teaching controls
- ✅ Tooltips and documentation for all buttons
- ✅ Optimized model loading (no more stupid load/unload cycles)

### 🚀 **SYSTEM CAPABILITIES ACHIEVED**

**Complete Self-Improving AI Platform:**
- **Individual Models**: Test → Fail → Controller → Prosthetic → Improve ✅
- **Model Combinations**: Combo Test → Fail → Controller → Combo Prosthetic → Teaching → Better Pairs ✅

**Professional UX:**
- Tooltips on all buttons explaining functionality
- Comprehensive button documentation in this file
- Efficient model management during teaching
- Real-time progress feedback
- Error handling and user guidance

### 🎮 **CONTROLLER DASHBOARD FEATURES**
- Failure monitoring with pattern recognition
- AI-powered prosthetic generation
- Combo learning with teaching cycles
- Real-time system status
- Interactive teaching controls

### 🧠 **COMBO LEARNING SYSTEM**
- Dynamic combo result loading from saved tests
- Individual combo teaching with progress tracking
- Combo-specific prosthetic storage and application
- Efficient model loading (load once, teach, done)
- Results persistence and trend analysis

### 📚 **COMPLETE DOCUMENTATION**
- All button functionalities documented
- User experience guidelines
- System architecture explained
- Troubleshooting and maintenance notes

**SESSION COMPLETE: Full combo learning integration implemented and tested. Professional UX with comprehensive tooltips and documentation. Ready for production use!** 🎉

---

## 🎮 **BUTTON FUNCTIONALITY DOCUMENTATION**

### **Controller Page (`/tooly/controller`)**

#### **Observer Controls**
- **Start/Stop Observer**: Toggle monitoring for model failures and performance issues
  - **Start**: Begin monitoring failures and patterns in real-time
  - **Stop**: Pause failure monitoring and pattern detection

#### **Analysis Controls**
- **🔬 Analyze Failures**: Run AI analysis on failure patterns to generate prosthetic prompts
  - Analyzes recent failures and patterns
  - Generates suggested prosthetic prompts to fix model weaknesses
  - Shows diagnosis, root cause, and recommended fixes

#### **Combo Learning Section**
- **🎓 Teach** (for each combo): Run automated teaching cycle for specific model pair
  - Tests combo performance with 8 comprehensive tests
  - Identifies coordination issues between Main and Executor models
  - Generates combo-specific prosthetic prompts
  - Applies and verifies improvements automatically
  - May take 5-15 minutes per combo

- **📝 Review & Apply**: Review and apply AI-suggested prosthetic prompts
  - Shows suggested prompt modifications
  - Allows user editing before application
  - Applies prosthetic to improve model performance
  - Tests the fix automatically

- **×** (Error dismiss): Dismiss error messages and notifications

### **Agentic Readiness Page (`/tooly/readiness`)**

#### **Single Model Mode**
- **🚀 Run Assessment**: Comprehensive capability testing (28 tests, ~5-10 minutes)
  - Tests tool usage, RAG, reasoning, intent understanding
  - Measures performance across different complexity levels
  - Generates detailed capability scores and failure analysis

- **🎓 Assess + Auto-Teach**: Assessment + automatic prosthetic application (15-30 minutes)
  - Runs full assessment to identify weaknesses
  - Automatically generates and applies AI-suggested prosthetics
  - Verifies improvements and saves successful prosthetics

- **⚙️ Config**: Configure test settings
  - Adjust timeouts, test categories, and flakiness detection
  - Configure context window testing parameters
  - Set up custom evaluation criteria

#### **Dual Model Mode**
- **Test Dual Mode**: Test Main + Executor model combination (28 tests, ~5-10 minutes)
  - Tests coordination between reasoning (Main) and tool execution (Executor) models
  - Evaluates handoff quality and overall performance

- **Test + Auto-Teach**: Dual model testing + automatic coordination improvements
  - Tests combo performance and identifies coordination issues
  - Generates prosthetics for better model-to-model communication

- **🏆 Combo Leaderboard**: View detailed combo testing results and comparisons
  - Navigate to combo testing page to see performance rankings
  - Compare different Main + Executor combinations

### **Combo Testing Page (`/tooly/combo-test`)**

#### **Model Selection**
- **Select All** (Main/Executor): Select all available models of that type
- **Clear** (Main/Executor): Deselect all models of that type

#### **Testing Controls**
- **🚀 Test All Combos**: Test all selected Main × Executor combinations
  - Runs 8 tests per combo pair (may take 10-30 minutes total)
  - Automatically filters by VRAM compatibility (16GB limit)
  - Saves results to persistent database

- **🗑️ Clear Results**: Delete all saved combo test results from database
  - Permanently removes all combo testing data
  - Requires confirmation dialog

#### **Result Actions**
- **📊 CSV Export**: Export combo results to CSV file for analysis
- **🎯 Select Combo**: Choose specific combo for detailed analysis

### **Dashboard Page (`/`)**

#### **Navigation**
- **↻ Refresh**: Reload all dashboard data from services
  - Updates system status, metrics, and recent activity
  - Refreshes proxy status, tool counts, and analytics

#### **Mode Cards**
- **Single Model**: Navigate to individual model testing
- **Dual Model**: Navigate to combo model testing
- **Test All**: Navigate to batch testing interface
- **Hardware**: Navigate to system information and hardware monitoring

### **General Navigation**
- **✨ Summy**: Return to main dashboard
- **Sessions**: View conversation session history
- **Tooly**: Access testing and configuration tools
- **🚀 Readiness**: Individual model capability assessment
- **🧪 Combo**: Model combination testing and optimization
- **🎮 Controller**: Self-improving system monitor and analysis
- **RAG**: Semantic code search and indexing
- **Debug**: System diagnostics and troubleshooting
- **Settings**: Application configuration and preferences

### **Notification System**
- **🔔 Bell**: Toggle notification panel
- **×** (notifications): Dismiss individual notifications

### **Tab Navigation**
- **Single Model**: Individual model assessment interface
- **Dual Model**: Model combination testing interface
- **Test All**: Batch testing across multiple models
- **Hardware**: System resources and GPU monitoring

---

## 🎯 **USER EXPERIENCE IMPROVEMENTS**

### **Tooltip System**
- **Hover-activated**: Tooltips appear on mouse hover
- **Context-aware**: Each tooltip explains exactly what the button does
- **Non-intrusive**: Disappears when mouse leaves button area
- **Professional**: Clean, readable design that doesn't obstruct content

### **Button States**
- **Disabled states**: Clear visual indication when buttons are unavailable
- **Loading states**: Show progress with spinners and status text
- **Confirmation dialogs**: Important actions require user confirmation
- **Feedback**: Success/error messages for all operations

### **Navigation Flow**
- **Logical grouping**: Related buttons are visually grouped together
- **Progressive disclosure**: Advanced options revealed as needed
- **Context preservation**: User selections maintained across page changes
- **Breadcrumb navigation**: Clear path back to main areas

This documentation ensures users understand exactly what each button does without guesswork, creating a professional and intuitive user experience.
