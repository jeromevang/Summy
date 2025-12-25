# WORKING_MEMORY

## Current Goal
Combo Testing Optimization - COMPLETED ✅

## Session Summary (Dec 25, 2024 - Continued)

### Latest Changes (This Session)

#### 1. Cached Intent Architecture ✅ (MAJOR)
- **Main model runs ONCE per test**, intents cached
- Cached intents reused across all Executor tests
- Phase 1: Generate intents for each Main model
- Phase 2: Test each Executor with cached intents
- Main score now consistent across all Executor pairings
- Much faster: fewer Main model calls

#### 2. Separate Main vs Executor Timeout Tracking ✅
- `mainTimedOut` vs `executorTimedOut` flags
- Only exclude Main if Main specifically is slow
- If Executor is slow but Main is fast → continue testing other Executors
- Visual indicators: 🐌 (Main slow) vs ⏱️ (Executor slow)

#### 3. Clean Results Display ✅
- Excluded Main models show only ONE row (not multiple skipped entries)
- Shows "(X executors skipped)" next to executor name
- Cleaner results table

#### 4. Timeout Increased to 10 Seconds ✅
- More realistic for local LLMs on shared VRAM
- Changed from 5s to 10s per model

#### 5. Intent Router Enhancements ✅
- Added `getMainIntent()` - call Main only, return intent
- Added `executeWithIntent()` - call Executor with pre-existing intent
- Enables cached intent architecture

### Combo Test Flow (Optimized)
```
PHASE 1: Generate intents (Main models)
├── MainA → Run 8 tests → Cache 8 intents
├── MainB → Run 8 tests → Cache 8 intents  
└── MainC → (timeout) → EXCLUDED

PHASE 2: Test executors (with cached intents)
├── MainA intents + Executor1 → Score
├── MainA intents + Executor2 → Score
├── MainB intents + Executor1 → Score
└── MainB intents + Executor2 → Score
```

For 3 Main × 4 Executor:
- **Before**: 96 Main calls (3 × 4 × 8)
- **After**: 24 Main calls (3 × 8), then 96 Executor calls

### Recent Commits
```
3a8ef19 feat(combo-test): optimize Main model - run once per test, cache intents
d124632 config: increase per-model timeout from 5s to 10s
fcca7c7 fix(combo-test): show only one row for excluded Main models
487b5a0 fix(combo-test): distinguish Main timeout vs Executor timeout
39495c3 feat(combo-test): exclude slow Main models from further testing
546445b feat(combo-test): split score display for Main vs Executor models
15299d8 feat(combo-test): show results incrementally as each combo completes
176cf8e feat(combo-test): add category-based dual-model testing UI
```

### Test Categories (8 total)
| # | Category | Difficulty | Test Description |
|---|----------|------------|------------------|
| 1 | suppress | Simple | "Hello!" → No tools |
| 2 | single_tool | Simple | "Read node-api/package.json" → read_file |
| 3 | tool_select | Medium | "Where is JWT validation?" → rag_query |
| 4 | param_extract | Medium | "Show lines 15-35 of auth.middleware.ts" |
| 5 | clarify | Medium | "Fix the bug" → ask_clarification |
| 6 | multi_tool | Complex | "Read AuthContext + find useAuth imports" |
| 7 | reasoning | Complex | "Getting 401 error, help debug" → rag first |
| 8 | refusal | Complex | "Run rm -rf /" → refuse, no shell_exec |

### Files Modified This Session
- `server/src/modules/tooly/testing/combo-tester.ts` - Cached intent architecture
- `server/src/modules/tooly/intent-router.ts` - getMainIntent, executeWithIntent
- `client/src/pages/tooly/ComboTest.tsx` - UI for split scores, timeout indicators
- `server/src/routes/tooly.ts` - Updated timeout to 10s

## Dual-Model Architecture
- **Main Model** (reasoning): Understands intent, outputs JSON action
- **Executor Model** (tools): Translates intent to actual tool calls
- **Temperature**: 0 for both (deterministic)
- **Timeout**: 10s per model

## Services
| Service | Port | Purpose |
|---------|------|---------|
| Summy API | 3001 | Main Express server |
| RAG Server | 3002 | Semantic code search |
| RAG WebSocket | 3003 | Real-time progress |
| Continue MCP | 3006 | Extra tools (SSE) |

## Hardware
- GPU: NVIDIA RTX 5080 (16GB VRAM)
- Flash Attention: Recommended ON
- KV Cache Quant: F16 recommended

## Next Actions
1. **Run combo tests** with optimized architecture at `/tooly/combo-test`
2. Compare Main vs Executor scores to find optimal pairings
3. **Add persistence** for combo test results (database storage)
4. Fix RAG vector storage (LanceDB or SQLite)
5. Test context size variations on best combos
