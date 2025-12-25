# WORKING_MEMORY

## Current Goal
Combo Testing UI Enhancements - COMPLETED ✅

## Session Summary (Dec 25, 2024 - Continued)

### Latest Changes (This Session)

#### 1. Incremental Results Display ✅
- Results now show immediately as each combo completes
- No waiting until all combos finish
- Progress indicator shows "X/Y combos tested" while running
- WebSocket broadcasts `combo_test_result` after each combo

#### 2. Split Score Display (Main vs Executor) ✅
- New 🧠/🔧 column shows `MainScore/ExecutorScore`
- **Main Score**: % of tests where Main correctly identified action
- **Executor Score**: % where Executor succeeded (given Main was correct)
- Helps diagnose which model is the weak link:
  - `95/60%` → Executor needs improvement
  - `55/95%` → Main needs improvement
- Detailed breakdown cards in selected combo view
- Color coded: bright=80%+, dim=50-79%, red=below 50%

#### 3. Known Issue: No Persistence ⚠️
- Results are in-memory only (`activeComboTests` Map)
- Lost on server restart
- TODO: Add database persistence for combo results history

### Combo Test UI - COMPLETE
- ✅ New page `/tooly/combo-test` with model selection panels
- ✅ "Test All Combos" button with real-time WebSocket progress
- ✅ 5-second per-task timeout - skip slow models after 2 timeouts
- ✅ Sorted results table (best combo on top)
- ✅ Incremental results (show as each combo finishes)
- ✅ Split scoring (Main vs Executor breakdown)
- ✅ "Test Context Sizes" button (4K/8K/16K/32K variations)
- ✅ Navigation: Top bar + Tooly hub button (🧪 Combo)
- ✅ Dual-model loading (loads both main + executor before testing)

### Category-Based Testing - COMPLETE
- ✅ Redesigned test suite: 8 categories, one test each
- ✅ Sandbox context (uses `server/data/test-project/`)
- ✅ Tier-weighted scoring (Simple 20%, Medium 30%, Complex 50%)
- ✅ UI shows Simple/Medium/Complex breakdown per combo

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

### Recent Commits
```
546445b feat(combo-test): split score display for Main vs Executor models
15299d8 feat(combo-test): show results incrementally as each combo completes
176cf8e feat(combo-test): add category-based dual-model testing UI
```

### Files Modified This Session
- `client/src/pages/tooly/ComboTest.tsx` - Combo test page with split scores
- `client/src/App.tsx` - Added /tooly/combo-test route
- `client/src/components/Layout.tsx` - Added 🧪 Combo to nav
- `server/src/modules/tooly/testing/combo-tester.ts` - Split scoring logic
- `server/src/routes/tooly.ts` - WebSocket broadcasting

## Dual-Model Architecture
- **Main Model** (reasoning): Understands intent, outputs JSON action
- **Executor Model** (tools): Translates intent to actual tool calls
- Purpose: Models like DeepSeek R1 can think but can't call tools

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
1. **Add persistence** for combo test results (database storage)
2. Run combo tests with new category system at `/tooly/combo-test`
3. Compare Main vs Executor scores to find optimal pairings
4. Fix RAG vector storage (LanceDB or SQLite)
5. Test context size variations on best combos
